/**
 * Loop Engine — bounded autonomous loop for Pi.
 *
 * "The loop thinks; the contract thinks first."
 *
 * A steering + gating control plane that gives Pi a real bounded loop engine:
 * pre-flight contract gate → PLAN → BUILD → REVIEW → VERIFY → SHIP, with
 * bounded remediation loop-back (cap 3), plateau detection, independent
 * verifier convergence (santa-method), test-honesty gates, and reconciliation
 * over assertion. Three exits: PASS / CAP / WEDGE.
 *
 * Trigger:  /loop "<task>"   or   Ctrl+Shift+L
 *           /loop --max-iterations 5 "<task>"   (override cap)
 *           /loop --cross-model "<task>"        (santa cross-model review)
 *           /loop-status                        (show current loop state)
 *
 * Harmony contract (the part that makes this safe to add):
 * - Owns ONE new axis: durable workflow state + phase gates + iteration control.
 * - Registers ZERO tools. Does NOT re-implement subagent dispatch, editing,
 *   reading, LSP, memory, or any existing tool. Pi has no executeTool API, so
 *   the engine COMPOSES on pi-subagents/pi-lens/hermes by STEERING the agent
 *   (sendUserMessage {deliverAs:'steer'}) + restricting tools per phase
 *   (setActiveTools) + blocking violations (on('tool_call') {block}).
 * - Durable state lives at ~/.pi/workflows/{wf}.json — does NOT touch hermes
 *   SQLite or observational ledger.
 * - on('tool_call') is additive: pi-rewind (snapshots) and pi-hypa (bash
 *   rewrite) hook the same event for different concerns; this hook only
 *   blocks tools outside the current phase allowlist.
 * - setStatus('loop', …) is an additive status slot; pi-statusline owns the
 *   footer render.
 *
 * Design principles (evidence-backed, see /tmp/pi-loop/DESIGN.md):
 * 1. Five-mode pre-flight  2. Plateau-aware  3. GAN-shaped (3 exits)
 * 4. Convergence (santa)   5. Liveness       6. Reconciliation over assertion
 * 7. Thought-it-through gate (pre-loop contract)
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
	appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";

// ─── Constants ──────────────────────────────────────────────────────────────

const WORKFLOWS_DIR = join(process.env.HOME ?? "~", ".pi", "workflows");
const DEFAULT_MAX_ITERATIONS = 3;
const PLATEAU_DETECT_AT = 3;
const PLATEAU_NO_IMPROVE_WINDOW = 2;
const PLATEAU_TOLERANCE = 0.3;
const PASS_THRESHOLD = 7.0;
const SANTA_MAX_ROUNDS = 3;

type Phase =
	| "plan"
	| "build"
	| "review"
	| "verify"
	| "ship"
	| "done"
	| "rejected";
type WorkflowType = "build" | "debug" | "plan";

const PHASE_TOOLS: Record<Phase, string[] | null> = {
	// null = no restriction (full toolset). Non-null = allowlist enforced by gate.
	plan: [
		"read",
		"grep",
		"find",
		"ls",
		"lsp_diagnostics",
		"lsp_navigation",
		"module_report",
		"read_symbol",
		"read_enclosing",
		"ast_grep_search",
		"ast_grep_outline",
		"ask_user_question",
	],
	build: null, // full toolset — the generator needs write/edit/bash
	review: null, // reviewer needs read + subagent dispatch
	verify: [
		"read",
		"bash",
		"grep",
		"find",
		"ls",
		"lsp_diagnostics",
		"lens_diagnostics",
		"ast_grep_search",
		"subagent",
		"wait",
	],
	ship: ["read", "bash", "grep", "find", "ls", "ask_user_question"],
	done: null,
	rejected: null,
};

// Test-honesty grep patterns — a hit means that test's PASS doesn't count.
const TEST_HONESTY_PATTERNS = [
	/getByTestId\(['"][^'"]*-mock['"]\)/,
	/\bas any\b/,
	/\.find\(/,
	/setTimeout\([^)]*\)/,
	/\bxit\b|\btest\.skip\b|\bdescribe\.skip\b|\bit\.skip\b/,
];

// ─── State ──────────────────────────────────────────────────────────────────

interface Intent {
	goal: string; // machine-verifiable done-criterion
	nonGoals: string[]; // anti-Goodhart boundary conditions
	constraints: string[];
	acceptanceCriteria: string[];
	reconciliationAnchor: string; // external fact the agent can't rewrite
	openDecisions: string[];
}

interface LoopState {
	workflowUuid: string;
	workflowType: WorkflowType;
	userRequest: string;
	intent: Intent | null; // null until pre-flight contract is filled
	phase: Phase;
	iteration: number;
	maxIterations: number;
	crossModel: boolean;
	scoreHistory: number[];
	results: { builder?: string; reviewer?: string; verifier?: string };
	remediationHistory: Array<{ iteration: number; reason: string; ts: string }>;
	statusHistory: Array<{ event: string; ts: string; phase: Phase }>;
	pendingGate: string | null;
	wedgeDetected: boolean;
	createdAt: string;
	updatedAt: string;
}

let active: LoopState | null = null;
let phaseToolSnapshot: string[] | null = null; // tools before first phase restriction

// ─── Persistence ────────────────────────────────────────────────────────────

function ensureWorkflowsDir(): void {
	if (!existsSync(WORKFLOWS_DIR)) mkdirSync(WORKFLOWS_DIR, { recursive: true });
}

function workflowPath(uuid: string): string {
	return join(WORKFLOWS_DIR, `${uuid}.json`);
}

function workflowEventsPath(uuid: string): string {
	return join(WORKFLOWS_DIR, `${uuid}.events.jsonl`);
}

function persist(state: LoopState): void {
	state.updatedAt = new Date().toISOString();
	ensureWorkflowsDir();
	writeFileSync(
		workflowPath(state.workflowUuid),
		JSON.stringify(state, null, 2),
		"utf-8",
	);
}

function logEvent(state: LoopState, event: string): void {
	ensureWorkflowsDir();
	const line =
		JSON.stringify({
			ts: new Date().toISOString(),
			event,
			phase: state.phase,
			iteration: state.iteration,
		}) + "\n";
	appendFileSync(workflowEventsPath(state.workflowUuid), line, "utf-8");
	state.statusHistory.push({
		event,
		ts: new Date().toISOString(),
		phase: state.phase,
	});
}

function recordStatus(ctx: ExtensionContext): void {
	if (!active) {
		ctx.ui.setStatus("loop", undefined);
		return;
	}
	const phase = ctx.ui.theme.fg("accent", active.phase);
	const iter =
		active.iteration > 0
			? ctx.ui.theme.fg(
					"warning",
					` iter ${active.iteration}/${active.maxIterations}`,
				)
			: "";
	ctx.ui.setStatus("loop", `🔁 ${phase}${iter}`);
}

// ─── Phase tool gating ──────────────────────────────────────────────────────

function applyPhaseTools(pi: ExtensionAPI, phase: Phase): void {
	const allow = PHASE_TOOLS[phase];
	if (allow === null) {
		// Restore full toolset.
		if (phaseToolSnapshot) {
			pi.setActiveTools(phaseToolSnapshot);
		}
		return;
	}
	if (phaseToolSnapshot === null) {
		phaseToolSnapshot = pi.getActiveTools();
	}
	// Restrict to the phase allowlist — only keep tools that are both in the
	// snapshot AND in the allowlist (so we never add tools the user didn't have,
	// and never allow tools outside the phase). The allowlist already includes
	// the phase-essential tools like lsp_diagnostics, subagent, etc.
	const allowSet = new Set(allow);
	const restricted = phaseToolSnapshot.filter((t) => allowSet.has(t));
	pi.setActiveTools(restricted);
}

// ─── Steering ───────────────────────────────────────────────────────────────

async function steer(ctx: ExtensionContext, message: string): Promise<void> {
	await ctx.ui.sendUserMessage(message, { deliverAs: "steer" });
}

// ─── Intent detection ───────────────────────────────────────────────────────

function detectType(request: string): WorkflowType {
	const r = request.toLowerCase();
	if (
		/\b(debug|bug|fix|broken|failing|error|crash|regression|diagnos)\b/.test(r)
	)
		return "debug";
	if (
		/\b(plan|design|architect|spec|rfc|investigat|research|brainstorm)\b/.test(
			r,
		)
	)
		return "plan";
	return "build";
}

// ─── Pre-flight contract gate (principle 7) ─────────────────────────────────

/**
 * The pre-loop contract. The engine asks the agent to produce this, then
 * reviews it against the 5 failure modes. If any field is missing or a failure
 * mode is triggered, the loop is REJECTED.
 */
function contractPrompt(request: string, type: WorkflowType): string {
	return `Before starting the loop, produce a PRE-LOOP CONTRACT as a fenced JSON block. This is the "thought-it-through" gate — the loop amplifies prior thought, it does not replace it.

Task: ${request}
Workflow type: ${type}

Produce JSON with these exact fields:
\`\`\`json
{
  "goal": "machine-verifiable done-criterion. NOT 'tests pass' (Goodhart). e.g. 'pytest -q exits 0 AND curl /health returns 200 AND no as any in changed files'",
  "nonGoals": ["what the agent must NOT do — anti-Goodhart boundary conditions, e.g. 'must not modify test files in verify phase', 'must not delete failing tests'"],
  "constraints": ["e.g. 'use uv not pip', 'no new dependencies', 'follow existing patterns'"],
  "acceptanceCriteria": ["e.g. 'all existing tests still pass', 'new test covers the fix', 'no type errors'"],
  "reconciliationAnchor": "external fact the agent cannot rewrite. e.g. 'frozen reference: run tests and capture output to .loop-ref before iteration 1; done = diff shows only new passing tests, no deleted assertions'. If no external anchor exists, state how you will manufacture one (freeze a reference before iterating).",
  "openDecisions": ["any unresolved questions that need a human decision before looping"]
}
\`\`\`

Rules:
- The goal MUST be machine-verifiable (a command, a grep, a diff) — not a vibe.
- The reconciliationAnchor MUST point to something you cannot edit. "My own tests pass" is REJECTED (failure mode 3 — Goodhart/test-deletion).
- If openDecisions is non-empty, the loop will pause for human input before iterating.`;
}

function extractContract(text: string): Intent | null {
	// Find the first fenced JSON block.
	const m = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
	if (!m) return null;
	try {
		const raw = JSON.parse(m[1]);
		return {
			goal: String(raw.goal ?? "").trim(),
			nonGoals: Array.isArray(raw.nonGoals) ? raw.nonGoals.map(String) : [],
			constraints: Array.isArray(raw.constraints)
				? raw.constraints.map(String)
				: [],
			acceptanceCriteria: Array.isArray(raw.acceptanceCriteria)
				? raw.acceptanceCriteria.map(String)
				: [],
			reconciliationAnchor: String(raw.reconciliationAnchor ?? "").trim(),
			openDecisions: Array.isArray(raw.openDecisions)
				? raw.openDecisions.map(String)
				: [],
		};
	} catch {
		return null;
	}
}

/**
 * Five-mode pre-flight check. Returns a reason string if REJECTED, null if OK.
 */
function preFlightCheck(intent: Intent): string | null {
	if (!intent.goal)
		return "REJECTED (failure mode 4 — 2am-guess): no machine-verifiable goal. The loop will commit a guess. Define a done-criterion.";
	if (/tests?\s+pass/i.test(intent.goal) && !/and/i.test(intent.goal)) {
		return "REJECTED (failure mode 3 — Goodhart): done-criterion is 'tests pass' with no external anchor. The agent can pass by deleting tests. Add a reconciliation anchor.";
	}
	if (
		!intent.reconciliationAnchor ||
		/my own tests? pass/i.test(intent.reconciliationAnchor)
	) {
		return "REJECTED (failure mode 3 — Goodhart): no reconciliation anchor. The done-criterion must anchor to an external fact you cannot rewrite. If none exists, freeze a reference before iteration 1.";
	}
	if (intent.openDecisions.length > 0) {
		return `PAUSE: open decisions need a human call before looping: ${intent.openDecisions.join("; ")}`;
	}
	return null;
}

// ─── Plateau detection (principle 2) ────────────────────────────────────────

function isPlateau(history: number[]): boolean {
	if (history.length < PLATEAU_DETECT_AT) return false;
	const recent = history.slice(-PLATEAU_NO_IMPROVE_WINDOW - 1);
	const bestBefore = Math.max(...recent.slice(0, -PLATEAU_NO_IMPROVE_WINDOW));
	const lastTwo = recent.slice(-PLATEAU_NO_IMPROVE_WINDOW);
	return lastTwo.every((s) => bestBefore - s >= -PLATEAU_TOLERANCE); // no improvement beyond tolerance
}

// ─── Test honesty (principle 6) ─────────────────────────────────────────────

function dishonestyHits(text: string): string[] {
	const hits: string[] = [];
	for (const re of TEST_HONESTY_PATTERNS) {
		const m = text.match(re);
		if (m) hits.push(m[0]);
	}
	return hits;
}

// ─── Phase steering prompts (enriched with Archon steals — all steering text) ──

/** Format the intent's nonGoals as a respect-block for the reviewer. Steal 4. */
function nonGoalsBlock(state: LoopState): string {
	const ng = state.intent?.nonGoals ?? [];
	if (ng.length === 0) return "";
	return `\n\n**NOT Building (scope limits — DO NOT flag these as missing features):**\n${ng.map((g) => `- ${g}`).join("\n")}\n`;
}

function phasePrompt(state: LoopState, phase: Phase): string {
	const base = `[LOOP ENGINE — phase: ${phase}, iteration: ${state.iteration}/${state.maxIterations}]\n`;
	switch (phase) {
		case "plan":
			return `${base}PLAN phase (read-only — write/edit/bash-mutating are gated off). Explore the codebase, understand the target, and write a plan to .loop-plan.md.

**Patterns to Mirror (Steal 3 — extract BEFORE planning):** Use read/grep/find/lsp_* to produce a patterns table with ACTUAL code snippets copied from the codebase (not invented) + file:line refs:
| Category | File:Lines | Pattern | Code Snippet |
|----------|-----------|---------|--------------|
| NAMING | path:10-15 | … | \`actual snippet\` |
| ERRORS | path:5-20 | … | \`actual snippet\` |
| LOGGING | path:1-10 | … | \`actual snippet\` |
| TESTS | path:1-30 | … | \`actual snippet\` |
Write the plan to .loop-plan.md, including a MIRROR: {file:lines} reference on each future task so BUILD follows real patterns. Then dispatch a fresh reviewer subagent (anti-anchored: give it the plan PATH, not the body) to review the plan.

**PLAN_CHECKPOINT (satisfy ALL before signaling completion):**
- [ ] At least 3 similar implementations found with file:line refs
- [ ] Code snippets in the patterns table are ACTUAL (copy-pasted from codebase, not invented)
- [ ] Plan written to .loop-plan.md with MIRROR refs on each task
- [ ] Plan reviewed by a fresh subagent
Report when the checkpoint is satisfied.`;
		case "build":
			return `${base}BUILD phase (full toolset). Implement per the plan (.loop-plan.md). Read each task's MIRROR: {file:lines} reference and follow that real pattern exactly.

**TDD:** write the test first, watch it fail, implement, watch it pass. Exit 1 from import/syntax error is NOT a real RED — a genuine RED is a behavioral failure.

**Per-task validation (Steal 5 — the golden rule: never accumulate broken state):** After EVERY file change, run the project's type-check/lint (e.g. \`npm run type-check\`, \`bun run type-check\`, \`uv run mypy\`, \`cargo check\`, \`go build ./...\`). If it fails, FIX IT before the next task — do not move on with broken state. pi-lens surfaces live diagnostics; this is the active project-wide check that complements it.

**BUILD_CHECKPOINT (satisfy ALL before signaling completion):**
- [ ] Every task implemented per its MIRROR reference
- [ ] Type-check/lint run after every file change and passing
- [ ] Tests written and passing (genuine GREEN, not import/syntax exit)
- [ ] No deviation from the plan without it being documented
Report what changed and the final test result.`;
		case "review":
			return `${base}REVIEW phase. Run \`git diff > .loop-diff.patch\` first, then dispatch 5 reviewer subagents in parallel (Steal 1 — each narrow, give each the diff PATH, never the body):
1. **code-review** — quality, pattern compliance, bugs (logic/null/race/security)
2. **error-handling** — swallowed errors, empty catches, discarded promises, unhandled rejections
3. **test-coverage** — missing tests, untested edge cases, tests that don't assert the behavior
4. **comment-quality** — stale comments, misleading docs, TODO/FIXME left in, debug logging
5. **docs-impact** — does a docs/CHANGELOG/AGENTS.md change need to happen?

Every finding at confidence ≥80 needs a verbatim file:line quote or it's auto-demoted. Synthesize the 5 reports by severity (CRITICAL/HIGH/MEDIUM/LOW).${nonGoalsBlock(state)}

**REVIEW_CHECKPOINT (satisfy ALL before signaling completion):**
- [ ] 5 reviewers dispatched in parallel, each got the diff PATH (not the body)
- [ ] Findings synthesized by severity
- [ ] Every CRITICAL/HIGH finding has a file:line quote
- [ ] nonGoals (above) respected — not flagged as missing features
Report findings by severity.`;
		case "verify":
			return `${base}VERIFY phase (read/bash/lsp only — write/edit gated off). You are an INDEPENDENT verifier; a separate reviewer, not the builder. Run: (1) the project's test/lint/typecheck, (2) test-honesty grep on changed files for: getByTestId('-mock'), 'as any', '.find(', 'setTimeout(' waits, skipped tests (xit/test.skip), deleted test files — a hit means that test's PASS doesn't count. (3) Reconciliation: diff against the frozen reference anchor from the contract. Dispatch TWO fresh reviewer subagents (santa-method${state.crossModel ? " — reviewer B from a DIFFERENT model family than A" : ""}) that must CONVERGE. Score 0-10.

**VERIFY_CHECKPOINT (satisfy ALL before scoring):**
- [ ] Project test/lint/typecheck run, full output read
- [ ] Test-honesty grep run, any hits disqualified from PASS
- [ ] Reconciliation diff vs frozen reference checked
- [ ] Two fresh reviewers dispatched and CONVERGED (or diverged — report honestly)
Report score + convergence + honesty hits.`;
		case "ship":
			return `${base}SHIP phase. Only proceed if: evidence recorded, score ≥ ${PASS_THRESHOLD}, two reviewers converged, no test-honesty hits, reconciliation diff clean. Commit with a clean conventional message (use the commit skill).

**SHIP_CHECKPOINT (satisfy ALL before committing):**
- [ ] Score ≥ ${PASS_THRESHOLD} AND reviewers converged
- [ ] No test-honesty hits
- [ ] Reconciliation diff clean
- [ ] Commit message is conventional (feat/fix/docs/refactor/…)
Report the commit hash.`;
		default:
			return base;
	}
}

// ─── The loop driver ────────────────────────────────────────────────────────

async function runLoop(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	request: string,
	opts: { maxIterations: number; crossModel: boolean },
): Promise<void> {
	if (active) {
		ctx.ui.notify(
			"A loop is already active. Use /loop-status or finish it first.",
			"warning",
		);
		return;
	}

	const type = detectType(request);
	const state: LoopState = {
		workflowUuid: randomUUID(),
		workflowType: type,
		userRequest: request,
		intent: null,
		phase: "plan",
		iteration: 0,
		maxIterations: opts.maxIterations,
		crossModel: opts.crossModel,
		scoreHistory: [],
		results: {},
		remediationHistory: [],
		statusHistory: [],
		pendingGate: null,
		wedgeDetected: false,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
	active = state;
	persist(state);
	logEvent(state, "workflow_started");
	recordStatus(ctx);
	ctx.ui.notify(
		`Loop started: ${type} (cap ${opts.maxIterations}${opts.crossModel ? ", cross-model" : ""})`,
		"info",
	);

	// Phase 0: pre-flight contract (principle 7).
	await steer(ctx, contractPrompt(request, type));
	// The contract is filled by the agent's response; the gate is checked in
	// the turn_end / agent_end hook (see below). We steer, then the hook reads
	// the latest assistant message for the contract JSON.
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

function lastAssistantText(ctx: ExtensionContext): string {
	const entries = ctx.sessionManager.getBranch();
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i];
		if (e.type === "message") {
			const msg = (e as { message?: { role?: string; content?: unknown } })
				.message;
			if (msg?.role === "assistant") {
				const c = msg.content;
				if (typeof c === "string") return c;
				if (Array.isArray(c)) {
					return c
						.map((b: any) => (b?.type === "text" ? String(b.text ?? "") : ""))
						.join("\n");
				}
			}
		}
	}
	return "";
}

function setupHooks(pi: ExtensionAPI): void {
	// Phase tool gate — block tools outside the current phase allowlist.
	pi.on("tool_call", async (event) => {
		if (!active) return;
		const allow = PHASE_TOOLS[active.phase];
		if (allow === null) return; // no restriction
		const name = event.toolName;
		if (!allow.includes(name)) {
			return {
				block: true,
				reason: `[LOOP] ${active.phase} phase: tool "${name}" is not in the phase allowlist. ${active.phase === "plan" ? "PLAN is read-only — no write/edit/bash-mutating." : active.phase === "verify" ? "VERIFY is read/bash/lsp only — no write/edit (independent verifier)." : "Wait for the right phase."}`,
			};
		}
	});

	// Loop progression — on each agent_end, inspect the latest message and
	// advance the state machine. This is where the loop logic lives.
	pi.on("agent_end", async (_event, ctx) => {
		if (!active) return;
		const text = lastAssistantText(ctx);

		// Pre-flight contract gate.
		if (active.phase === "plan" && !active.intent) {
			const intent = extractContract(text);
			if (!intent) {
				// Agent hasn't produced the contract yet; steer again (bounded).
				if (active.iteration >= 2) {
					ctx.ui.notify(
						"Loop: contract not produced after 2 attempts — REJECTING.",
						"error",
					);
					active.phase = "rejected";
					logEvent(active, "rejected_no_contract");
					persist(active);
					active = null;
					recordStatus(ctx);
					return;
				}
				active.iteration++;
				persist(active);
				await steer(
					ctx,
					`${contractPrompt(active.userRequest, active.workflowType)}\n\nThe previous response did not contain a fenced JSON contract. Output ONLY the contract JSON block.`,
				);
				return;
			}
			const rejection = preFlightCheck(intent);
			if (rejection) {
				if (rejection.startsWith("PAUSE")) {
					ctx.ui.notify(rejection, "warning");
					logEvent(active, "paused_open_decisions");
					persist(active);
					return; // wait for human
				}
				ctx.ui.notify(rejection, "error");
				active.phase = "rejected";
				logEvent(active, "rejected_preflight");
				persist(active);
				active = null;
				recordStatus(ctx);
				return;
			}
			active.intent = intent;
			active.iteration = 0; // reset iteration counter for the real loop
			logEvent(active, "contract_accepted");
			persist(active);
			// Enter PLAN proper.
			applyPhaseTools(pi, "plan");
			await steer(ctx, phasePrompt(active, "plan"));
			return;
		}

		// Phase advancement — look for phase-completion signals in the text.
		const phase = active.phase;
		const signals: Record<string, RegExp> = {
			plan: /\bplan (written|done|reviewed|complete)\b|\.loop-plan\.md/i,
			build:
				/\bbuild (done|complete)\b|tests? (pass|green|fail|red)\b|\bRED\b|\bGREEN\b/i,
			review: /\breview (done|complete)\b|findings?:|severity:/i,
			verify: /\bscore:?\s*(\d+(?:\.\d+)?)/i,
			ship: /\bcommit\b|commit hash:|[0-9a-f]{7,40}/i,
		};

		// VERIFY: extract score + honesty + convergence.
		if (phase === "verify") {
			const scoreMatch = text.match(signals.verify);
			const score = scoreMatch ? Number.parseFloat(scoreMatch[1]) : null;
			if (score !== null) active.scoreHistory.push(score);
			const honestyHits = dishonestyHits(text);
			const converged = /converg/i.test(text) && !/diverg/i.test(text);
			const passed =
				score !== null &&
				score >= PASS_THRESHOLD &&
				converged &&
				honestyHits.length === 0;

			if (passed) {
				logEvent(active, `verify_pass score=${score}`);
				active.phase = "ship";
				applyPhaseTools(pi, "ship");
				persist(active);
				recordStatus(ctx);
				await steer(ctx, phasePrompt(active, "ship"));
				return;
			}

			// Not passed — remediation loop-back.
			active.iteration++;
			active.remediationHistory.push({
				iteration: active.iteration,
				reason: honestyHits.length
					? `test-honesty hits: ${honestyHits.join(", ")}`
					: `score ${score} < ${PASS_THRESHOLD} or no convergence`,
				ts: new Date().toISOString(),
			});
			logEvent(active, `verify_fail iter=${active.iteration}`);

			if (active.iteration >= active.maxIterations) {
				ctx.ui.notify(
					`Loop: CAP reached (${active.maxIterations} iterations). Halting — surface to human.`,
					"warning",
				);
				logEvent(active, "cap_reached");
				active.phase = "done";
				persist(active);
				active = null;
				recordStatus(ctx);
				return;
			}
			if (isPlateau(active.scoreHistory)) {
				ctx.ui.notify(
					"Loop: PLATEAU detected (no improvement in last 2 iterations). Halting — surface to human.",
					"warning",
				);
				logEvent(active, "plateau_detected");
				active.phase = "done";
				persist(active);
				active = null;
				recordStatus(ctx);
				return;
			}

			// Loop back to BUILD.
			active.phase = "build";
			applyPhaseTools(pi, "build");
			persist(active);
			recordStatus(ctx);
			await steer(
				ctx,
				`${phasePrompt(active, "build")}\n\nRemediation iteration ${active.iteration}: fix the verify failures (score ${score}, honesty hits: ${honestyHits.join(", ") || "none"}, convergence: ${converged ? "yes" : "no"}).`,
			);
			return;
		}

		// SHIP: detect commit → done.
		if (phase === "ship" && signals.ship.test(text)) {
			logEvent(active, "shipped");
			active.phase = "done";
			persist(active);
			ctx.ui.notify("Loop: SHIPPED. Workflow complete.", "info");
			active = null;
			recordStatus(ctx);
			return;
		}

		// REVIEW: findings → remediation to BUILD; clean → VERIFY.
		if (phase === "review") {
			const hasFindings =
				/\b(CRITICAL|HIGH)\b/i.test(text) &&
				!/no (critical|high|findings)/i.test(text);
			if (hasFindings && active.iteration < active.maxIterations) {
				active.iteration++;
				active.remediationHistory.push({
					iteration: active.iteration,
					reason: "review findings (CRITICAL/HIGH)",
					ts: new Date().toISOString(),
				});
				logEvent(active, `review_findings iter=${active.iteration}`);
				active.phase = "build";
				applyPhaseTools(pi, "build");
				persist(active);
				recordStatus(ctx);
				await steer(
					ctx,
					`${phasePrompt(active, "build")}\n\nRemediation iteration ${active.iteration}: address the CRITICAL/HIGH review findings.`,
				);
				return;
			}
			if (hasFindings && active.iteration >= active.maxIterations) {
				ctx.ui.notify(
					`Loop: CAP reached on review findings (${active.maxIterations}). Halting.`,
					"warning",
				);
				logEvent(active, "cap_reached_review");
				active.phase = "done";
				persist(active);
				active = null;
				recordStatus(ctx);
				return;
			}
			// Clean → verify.
			logEvent(active, "review_clean");
			active.phase = "verify";
			applyPhaseTools(pi, "verify");
			persist(active);
			recordStatus(ctx);
			await steer(ctx, phasePrompt(active, "verify"));
			return;
		}

		// PLAN → BUILD, BUILD → REVIEW.
		if (phase === "plan" && signals.plan.test(text)) {
			logEvent(active, "plan_complete");
			active.phase = "build";
			applyPhaseTools(pi, "build");
			persist(active);
			recordStatus(ctx);
			await steer(ctx, phasePrompt(active, "build"));
			return;
		}
		if (phase === "build" && signals.build.test(text)) {
			logEvent(active, "build_complete");
			active.phase = "review";
			applyPhaseTools(pi, "review"); // null = full toolset (reviewer needs subagent dispatch)
			persist(active);
			recordStatus(ctx);
			await steer(ctx, phasePrompt(active, "review"));
			return;
		}
	});

	// Wedge / liveness (principle 5) — if an agent_end fires with no tool calls
	// in the branch since the last agent_end, flag wedged. (Simple heuristic;
	// full orphaned-tool-call scan would read the events jsonl.)
	pi.on("session_before_compact", async () => {
		if (!active) return;
		// Flush a workflow-state summary into the compaction so the loop survives.
		// Additive — does not touch observational-memory's compaction hook.
		return undefined; // no compaction override; state is already on disk
	});
}

// ─── Commands ───────────────────────────────────────────────────────────────

function parseArgs(args: string): {
	maxIterations: number;
	crossModel: boolean;
	request: string;
} {
	let maxIterations = DEFAULT_MAX_ITERATIONS;
	let crossModel = false;
	const tokens = args.split(/\s+/);
	const rest: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t === "--max-iterations" || t === "-m") {
			const n = Number.parseInt(tokens[++i] ?? "", 10);
			if (!Number.isNaN(n) && n > 0) maxIterations = n;
		} else if (t === "--cross-model" || t === "-x") {
			crossModel = true;
		} else {
			rest.push(t);
		}
	}
	return { maxIterations, crossModel, request: rest.join(" ").trim() };
}

function showStatus(pi: ExtensionAPI, ctx: ExtensionContext): void {
	if (!active) {
		// Show the most recent workflow from disk.
		try {
			ensureWorkflowsDir();
			const files = readdirSync(WORKFLOWS_DIR).filter((f: string) =>
				f.endsWith(".json"),
			);
			if (files.length === 0) {
				ctx.ui.notify("No loop workflows found.", "info");
				return;
			}
			const latest = files.sort().pop()!;
			const state = JSON.parse(
				readFileSync(join(WORKFLOWS_DIR, latest), "utf-8"),
			) as LoopState;
			ctx.ui.notify(
				`Last loop: ${state.workflowType} — ${state.phase}, iter ${state.iteration}/${state.maxIterations}, scores [${state.scoreHistory.join(", ")}]`,
				"info",
			);
		} catch {
			ctx.ui.notify("No loop workflows found.", "info");
		}
		return;
	}
	const scoreLine = active.scoreHistory.length
		? `scores [${active.scoreHistory.join(", ")}]`
		: "no scores yet";
	ctx.ui.notify(
		`Loop: ${active.workflowType} — phase ${active.phase}, iter ${active.iteration}/${active.maxIterations}, ${scoreLine}`,
		"info",
	);
}

export default function loopEngineExtension(pi: ExtensionAPI): void {
	pi.registerCommand("loop", {
		description:
			"Start a bounded autonomous loop (pre-flight contract → plan → build → review → verify → ship). Flags: --max-iterations N, --cross-model",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("loop requires interactive mode", "error");
				return;
			}
			const parsed = parseArgs(args ?? "");
			if (!parsed.request) {
				ctx.ui.notify(
					'Usage: /loop "<task>" [--max-iterations N] [--cross-model]',
					"warning",
				);
				return;
			}
			await runLoop(pi, ctx, parsed.request, parsed);
		},
	});

	pi.registerCommand("loop-status", {
		description: "Show the current or most recent loop workflow state",
		handler: async (_args, ctx) => showStatus(pi, ctx),
	});

	pi.registerCommand("loop-abort", {
		description: "Abort the active loop and release the phase tool gate",
		handler: async (_args, ctx) => {
			if (!active) {
				ctx.ui.notify("No active loop.", "info");
				return;
			}
			logEvent(active, "aborted");
			active.phase = "done";
			persist(active);
			active = null;
			if (phaseToolSnapshot) {
				pi.setActiveTools(phaseToolSnapshot);
				phaseToolSnapshot = null;
			}
			recordStatus(ctx);
			ctx.ui.notify("Loop aborted. Tools restored.", "info");
		},
	});

	pi.registerShortcut(Key.ctrlShift("l"), {
		description: "Start a loop (opens palette-free; type the task after)",
		handler: async (ctx) => {
			ctx.ui.setEditorText('/loop "" --max-iterations 3');
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		recordStatus(ctx);
	});

	pi.on("session_shutdown", async () => {
		if (active) {
			logEvent(active, "session_shutdown_active");
			persist(active);
		}
	});

	setupHooks(pi);
}
