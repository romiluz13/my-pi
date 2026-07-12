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
 * - on('tool_call') is additive: pi-confirm-destructive (destructive-action
 *   gate), pi-lens (read-guard diagnostics), and pi-rewind (snapshots) all
 *   hook the same event for different concerns; this hook only blocks tools
 *   outside the current phase allowlist. Global extensions load BEFORE npm
 *   packages (loader.js:516-535), so this hook runs before
 *   pi-confirm-destructive — no short-circuit conflict.
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
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

// ─── Skill injection (mechanical, not steer) ────────────────────────────────
// The loop engine STEERS with prose (sendUserMessage). Prose can't mechanically
// inject skills — the agent improvises instead of loading the real procedure.
//
// Fix: read the SKILL.md directly and EMBED the content in the phase prompt
// itself. One message, one turn — the skill content is 100% in context.
// No race condition (pi.sendMessage + steer would be two messages with
// unpredictable ordering). This is the same effect as the PTM `skill:`
// frontmatter pin, just done by the loop engine.

function loadSkillContent(skillName: string): string | null {
	const skillPath = join(homedir(), ".agents", "skills", skillName, "SKILL.md");
	if (!existsSync(skillPath)) return null;
	const raw = readFileSync(skillPath, "utf-8");
	// Strip frontmatter (--- ... ---)
	const body = raw.replace(/^---[\s\S]*?---\s*/, "");
	return `--- ${skillName} skill (mechanically injected by loop engine) ---\n${body}\n--- end ${skillName} skill ---\n\n`;
}

function withSkills(phaseText: string, ...skillNames: string[]): string {
	const skills = skillNames.map(loadSkillContent).filter(Boolean);
	if (skills.length === 0) return phaseText;
	return skills.join("") + phaseText;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WORKFLOWS_DIR = join(process.env.HOME ?? "~", ".pi", "workflows");
const DEFAULT_MAX_ITERATIONS = 3;
const PLATEAU_DETECT_AT = 3;
const PLATEAU_NO_IMPROVE_WINDOW = 2;
const PLATEAU_TOLERANCE = 0.3;
const PASS_THRESHOLD = 7.0;

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
		"write", // BUG-3 fix: PLAN must write .loop-plan.md (its deliverable) — was gated off, breaking the PLAN→BUILD bridge
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

// <!-- scar: 2026-07-11 — BUG-2: module-level state leaks across sessions/subagents.
//   coach.ts and guardrails.ts fixed this with per-session Maps. loop.ts still uses
//   module-level `let`s because converting every `active` reference to `getActive(ctx)`
//   is a large refactor (the variable is used in 30+ places across 1000 lines).
//   The per-session Maps scaffold was removed as dead code — it was never wired in.
//   Full fix: replace all bare `active`/`pausedForHuman`/etc with per-session Map
//   accessors, matching the coach.ts pattern. Until then, don't run /loop in
//   concurrent sessions or subagent sessions.
// -->
let active: LoopState | null = null;
let phaseToolSnapshot: string[] | null = null;
let branchHadToolCall = false;
let expectingAgentResponse = false;
let pausedForHuman = false;

// C1 fix: export pause state so Coach can skip when the loop is paused for human input.
export function isLoopPausedForHuman(): boolean {
	return active !== null && pausedForHuman;
}

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

/** Restore the full toolset the session had before the loop restricted it.
 *  Called at EVERY terminal exit (PASS / CAP / WEDGE / reject / abort) so the
 *  agent is never left stranded with a phase-restricted toolset after the loop
 *  ends. Idempotent — safe to call when no snapshot exists. */
function restoreTools(pi: ExtensionAPI): void {
	if (phaseToolSnapshot) {
		pi.setActiveTools(phaseToolSnapshot);
		phaseToolSnapshot = null;
	}
}

// ─── Steering ───────────────────────────────────────────────────────────────

async function steer(pi: ExtensionAPI, message: string): Promise<void> {
	// sendUserMessage is on ExtensionAPI (pi), NOT on ExtensionContext (ctx).
	expectingAgentResponse = true;
	await pi.sendUserMessage(message, { deliverAs: "steer" });
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

/** Format the intent's nonGoals as a respect-block for the reviewer. */
function nonGoalsBlock(state: LoopState): string {
	const ng = state.intent?.nonGoals ?? [];
	if (ng.length === 0) return "";
	return `\n\n**NOT Building (scope limits — DO NOT flag these as missing features):**\n${ng.map((g) => `- ${g}`).join("\n")}\n`;
}

function phasePrompt(state: LoopState, phase: Phase): string {
	const base = `[LOOP ENGINE — phase: ${phase}, iteration: ${state.iteration}/${state.maxIterations}]\n`;
	switch (phase) {
		case "plan":
			return `${base}PLAN phase (read + write for .loop-plan.md only — edit/bash-mutating are gated off). Explore the codebase, understand the target, and write a plan to .loop-plan.md. Run /skill:brainstorming to explore the design space before writing the plan.

**Patterns to Mirror (extract BEFORE planning):** Use read/grep/find/lsp_* to produce a patterns table with ACTUAL code snippets copied from the codebase (not invented) + file:line refs:
| Category | File:Lines | Pattern | Code Snippet |
|----------|-----------|---------|--------------|
| NAMING | path:10-15 | … | \`actual snippet\` |
| ERRORS | path:5-20 | … | \`actual snippet\` |
| LOGGING | path:1-10 | … | \`actual snippet\` |
| TESTS | path:1-30 | … | \`actual snippet\` |
Write the plan to .loop-plan.md, including a MIRROR: {file:lines} reference on each future task so BUILD follows real patterns.

**PLAN REVIEW GATE (fail-closed, 3 checks, 3-try cap):** After writing the plan, run a self-audit BEFORE declaring PLAN done. Output SPEC_GATE_PASS or SPEC_GATE_FAIL:
1. **Feasibility** — use find/ls/read to verify EVERY referenced file path exists; read 1-2 real files to confirm proposed patterns/libraries match the codebase; flag any invented/unverified file assumptions; verify dependency ordering (no circular/forward refs).
2. **Completeness** — all requirements mapped to plan items; every change has a verification step; edge cases addressed; cross-file integration points listed.
3. **Scope & Alignment** — matches the request (no different problem); no scope creep (extra abstractions/refactors beyond request); no under-scoping; complexity proportional.
If SPEC_GATE_FAIL: revise the plan and re-run (max 3 tries → ESCALATE). No "approved with comments" — PASS or FAIL only. Fabricated paths are the #1 plan failure mode.

**PLAN_CHECKPOINT (satisfy ALL before signaling completion):**
- [ ] At least 3 similar implementations found with file:line refs
- [ ] Code snippets in the patterns table are ACTUAL (copy-pasted from codebase, not invented)
- [ ] Plan written to .loop-plan.md with MIRROR refs on each task
- [ ] SPEC_GATE_PASS (feasibility + completeness + scope checks all passed)
Report when the checkpoint is satisfied.`;
		case "build":
			return `${base}BUILD phase (full toolset). Implement per the plan (.loop-plan.md). Read each task's MIRROR: {file:lines} reference and follow that real pattern exactly. Use /skill:implement as the execution wrapper and /skill:tdd for the test-first cycle. If tests fail (RED), run /skill:diagnosing-bugs to build a feedback loop and find the root cause.

**TDD:** write the test first, watch it fail, implement, watch it pass. Exit 1 from import/syntax error is NOT a real RED — a genuine RED is a behavioral failure.

**Per-task validation (the golden rule: never accumulate broken state):** After EVERY file change, run the project's type-check/lint (e.g. \`npm run type-check\`, \`bun run type-check\`, \`uv run mypy\`, \`cargo check\`, \`go build ./...\`). If it fails, FIX IT before the next task — do not move on with broken state. pi-lens surfaces live diagnostics; this is the active project-wide check that complements it.

**BUILD_CHECKPOINT (satisfy ALL before signaling completion):**
- [ ] Every task implemented per its MIRROR reference
- [ ] Type-check/lint run after every file change and passing
- [ ] Tests written and passing (genuine GREEN, not import/syntax exit)
- [ ] No deviation from the plan without it being documented
Report what changed and the final test result.`;
		case "review":
			return `${base}REVIEW phase. Run \`git diff > .loop-diff.patch\` first, then dispatch 2-3 reviewer subagents in parallel (each narrow, give each the diff PATH, never the body). Use /skill:code-review for the standards reviewer:
1. **code-review** — quality, pattern compliance, bugs (logic/null/race/security)
2. **error-handling** — swallowed errors, empty catches, discarded promises, unhandled rejections
3. **test-coverage** — missing tests, untested edge cases, tests that don't assert the behavior
4. **comment-quality** — stale comments, misleading docs, TODO/FIXME left in, debug logging
5. **docs-impact** — does a docs/CHANGELOG/AGENTS.md change need to happen?

Every finding at confidence ≥80 needs a verbatim file:line quote or it's auto-demoted. Synthesize the 5 reports by severity (CRITICAL/HIGH/MEDIUM/LOW).${nonGoalsBlock(state)}

**REVIEW_CHECKPOINT (satisfy ALL before signaling completion):**
- [ ] 2-3 reviewers dispatched in parallel, each got the diff PATH (not the body)
- [ ] Findings synthesized by severity
- [ ] Every CRITICAL/HIGH finding has a file:line quote
- [ ] nonGoals (above) respected — not flagged as missing features
Report findings by severity. Use /skill:receiving-code-review when processing feedback.`;
		case "verify":
			return `${base}VERIFY phase (read + bash-for-tests + lsp only — write/edit gated off). NOTE: bash CAN mutate (rm, git reset) — you are trusted not to cheat. You are an INDEPENDENT verifier; a separate reviewer, not the builder. Run: (1) the project's test/lint/typecheck, (2) test-honesty grep on changed files for: getByTestId('-mock'), 'as any', '.find(', 'setTimeout(' waits, skipped tests (xit/test.skip), deleted test files — a hit means that test's PASS doesn't count. (3) Reconciliation: diff against the frozen reference anchor from the contract. Dispatch TWO fresh reviewer subagents (santa-method${state.crossModel ? " — reviewer B from a DIFFERENT model family than A" : ""}) that must CONVERGE. Score 0-10.

**VERIFY_CHECKPOINT (satisfy ALL before scoring):**
- [ ] Project test/lint/typecheck run, full output read
- [ ] Test-honesty grep run, any hits disqualified from PASS
- [ ] Reconciliation diff vs frozen reference checked
- [ ] Two fresh reviewers dispatched and CONVERGED (or diverged — report honestly)
Report score + convergence + honesty hits.`;
		case "ship":
			return `${base}SHIP phase. Only proceed if: evidence recorded, score ≥ ${PASS_THRESHOLD}, two reviewers converged, no test-honesty hits, reconciliation diff clean. Run /skill:verification-before-completion for the final independent audit, then /skill:commit for a clean conventional commit, then /skill:github for PRs. Report the commit hash — phase advances ONLY on a real hash, not the word "committed."

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
	await steer(pi, contractPrompt(request, type));
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
		if (active) branchHadToolCall = true;
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

	// If the loop paused for a human decision, the next user input resumes it.
	pi.on("input", async () => {
		if (active && pausedForHuman) {
			pausedForHuman = false;
			expectingAgentResponse = true;
		}
	});

	// Loop progression — on each agent_end, inspect the latest message and
	// advance the state machine. This is where the loop logic lives.
	pi.on("agent_end", async (_event, ctx) => {
		if (!active) return;

		// Guard: only act on turns we explicitly steered (or a resumed pause).
		// This prevents a manual user reply during an active loop from being
		// misread as a phase-completion signal.
		if (!expectingAgentResponse) return;
		expectingAgentResponse = false;

		// Wedge detection: after the contract is accepted, every productive turn
		// should invoke at least one tool. A turn with no tool calls means the
		// loop is stalled (model is rambling, refusing, or lost).
		if (active.intent && !branchHadToolCall && !active.wedgeDetected) {
			active.wedgeDetected = true;
			logEvent(active, "wedge_detected");
			persist(active);
			ctx.ui.notify(
				"Loop: WEDGE detected — no tool calls in this turn. Halting — surface to human.",
				"warning",
			);
			active.phase = "done";
			persist(active);
			restoreTools(pi);
			active = null;
			recordStatus(ctx);
			return;
		}
		branchHadToolCall = false;

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
					restoreTools(pi);
					active = null;
					recordStatus(ctx);
					return;
				}
				active.iteration++;
				persist(active);
				await steer(
					pi,
					`${contractPrompt(active.userRequest, active.workflowType)}\n\nThe previous response did not contain a fenced JSON contract. Output ONLY the contract JSON block.`,
				);
				return;
			}
			const rejection = preFlightCheck(intent);
			if (rejection) {
				if (rejection.startsWith("PAUSE")) {
					ctx.ui.notify(rejection, "warning");
					logEvent(active, "paused_open_decisions");
					pausedForHuman = true;
					persist(active);
					return; // wait for human
				}
				ctx.ui.notify(rejection, "error");
				active.phase = "rejected";
				logEvent(active, "rejected_preflight");
				persist(active);
				restoreTools(pi);
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
			await steer(pi, withSkills(phasePrompt(active, "plan"), "brainstorming"));
			return;
		}

		// Phase advancement — look for phase-completion signals in the text.
		const phase = active.phase;
		const signals: Record<string, RegExp> = {
			plan: /\bplan (written|done|reviewed|complete)\b|\.loop-plan\.md/i,
			// BUILD completes ONLY on GREEN — pass/green/GREEN or a real exit-code-0
			// line. RED/fail/exit≠0 are handled by the RED guard below, not here.
			build:
				/\bbuild (done|complete)\b|tests? (pass|green)\b|\bGREEN\b|exit(?:\s*code)?\s*[:=]?\s*0\b/i,
			review: /\breview (done|complete)\b|findings?:|severity:/i,
			// BUG-4 fix: VERIFY score must include the word "score" AND a number.
			// The old regex was already reasonable but keep the explicit "score" anchor.
			verify: /\bscore\b\D{0,10}(\d+(?:\.\d+)?)/i,
			// BUG-4 fix: SHIP must require a REAL commit hash, not just the word "committed".
			// The old regex `\bcommit(ted)?\b` matched on prose alone — the agent could
			// say "committed" without actually committing. Now requires a hex hash.
			ship: /commit hash:?\s*[0-9a-f]{7,40}|\b[0-9a-f]{7,40}\b.*\bcommit/i,
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
				await steer(pi, withSkills(phasePrompt(active, "ship"), "verification-before-completion", "commit"));
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
				restoreTools(pi);
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
				restoreTools(pi);
				active = null;
				recordStatus(ctx);
				return;
			}

			// Loop back to BUILD. NOTE: a per-iteration rewind checkpoint (forking
			// the session so this retry is a rewindable branch point) is NOT
			// implementable from the agent_end event handler — event handlers receive
			// ExtensionContext, which has no `fork`, and `fork` requires an entryId
			// only available on ExtensionCommandContext. Deferred until Pi exposes a
			// session-fork API on ExtensionContext or an event-context action queue.
			// (The previous try/catch ctx.fork() here was a silent no-op.)
			active.phase = "build";
			applyPhaseTools(pi, "build");
			persist(active);
			recordStatus(ctx);
			await steer(
				pi,
				`${withSkills(phasePrompt(active, "build"), "tdd", "implement")}\n\nRemediation iteration ${active.iteration}: fix the verify failures (score ${score}, honesty hits: ${honestyHits.join(", ") || "none"}, convergence: ${converged ? "yes" : "no"}).\n\n**Change an input before re-dispatching:** do NOT retry the same task with the same approach — that just burns a cycle and reproduces the failure. Change at least one: narrow the scope, escalate the model tier (Ctrl+L mid-session), change the approach/tool, OR if the plan itself is wrong — STOP and ask the human (do not loop). **Bidirectional verify:** before implementing the fix, confirm the fix is in the right direction — if the PLAN is wrong, fix the plan, not the code.`,
			);
			return;
		}

		// SHIP: detect commit → done.
		if (phase === "ship" && signals.ship.test(text)) {
			logEvent(active, "shipped");
			active.phase = "done";
			persist(active);
			ctx.ui.notify("Loop: SHIPPED. Workflow complete.", "info");
			restoreTools(pi);
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
				// Per-iteration rewind checkpoint not available from event handlers
				// (see verify remediation branch above for the constraint).
				active.phase = "build";
				applyPhaseTools(pi, "build");
				persist(active);
				recordStatus(ctx);
				await steer(
					pi,
					`${withSkills(phasePrompt(active, "build"), "tdd", "implement")}\n\nRemediation iteration ${active.iteration}: address the CRITICAL/HIGH review findings.\n\n**Change an input before re-dispatching:** do NOT retry the same approach — narrow scope, escalate model tier (Ctrl+L), change approach/tool, or if the plan is wrong STOP and ask the human.`,
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
				restoreTools(pi);
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
			await steer(pi, phasePrompt(active, "verify"));
			return;
		}

		// PLAN → BUILD, BUILD → REVIEW.
		if (phase === "plan" && signals.plan.test(text)) {
			logEvent(active, "plan_complete");
			active.phase = "build";
			applyPhaseTools(pi, "build");
			persist(active);
			recordStatus(ctx);
			await steer(pi, withSkills(phasePrompt(active, "build"), "tdd", "implement"));
			return;
		}
		if (phase === "build") {
			// RED guard: a failing test run is NOT completion — loop back to fix it.
			const isRed =
				/\bRED\b|tests? (fail|failing|red)\b|exit(?:\s*code)?\s*[:=]?\s*[^0]\d*\b/i.test(
					text,
				);
			const isGreen = signals.build.test(text);
			if (isRed && !isGreen) {
				active.iteration++;
				active.remediationHistory.push({
					iteration: active.iteration,
					reason: "BUILD reported RED — tests failing",
					ts: new Date().toISOString(),
				});
				logEvent(active, `build_red iter=${active.iteration}`);
				if (active.iteration >= active.maxIterations) {
					ctx.ui.notify(
						`Loop: CAP reached on BUILD RED (${active.maxIterations}). Halting.`,
						"warning",
					);
					logEvent(active, "cap_reached_build");
					active.phase = "done";
					persist(active);
					restoreTools(pi);
					active = null;
					recordStatus(ctx);
					return;
				}
				persist(active);
				recordStatus(ctx);
				await steer(
					pi,
					`${withSkills(phasePrompt(active, "build"), "tdd", "implement")}\n\nRemediation iteration ${active.iteration}: the previous BUILD run reported RED (tests failing). Do NOT claim done. Fix the failing test, re-run it, and paste the literal command + exit code + output. A failing test is never completion.`,
				);
				return;
			}
			if (!isGreen) return; // no signal yet — wait for the agent to finish
			logEvent(active, "build_complete");
			active.phase = "review";
			applyPhaseTools(pi, "review"); // null = full toolset (reviewer needs subagent dispatch)
			persist(active);
			recordStatus(ctx);
			await steer(pi, withSkills(phasePrompt(active, "review"), "code-review", "receiving-code-review"));
			return;
		}
	});

	// Wedge / liveness (principle 5) — if an agent_end fires with no tool calls
	// in the branch since the last agent_end, flag wedged. (Simple heuristic;
	// full orphaned-tool-call scan would read the events jsonl.)
	pi.on("session_before_compact", async () => {
		if (!active) return;
		// Persist workflow state into the session ledger so the loop survives
		// compaction AND restarts (docs: appendEntry = "state that survives
		// restarts"). Belt-and-suspenders with the ~/.pi/workflows/{wf}.json file.
		// Additive — does not touch observational-memory's compaction hook.
		pi.appendEntry("loop-state", {
			workflowUuid: active.workflowUuid,
			phase: active.phase,
			iteration: active.iteration,
			maxIterations: active.maxIterations,
			crossModel: active.crossModel,
			scoreHistory: active.scoreHistory,
			pendingGate: active.pendingGate,
		});
		return undefined; // no compaction override; state is on disk + in ledger
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
			restoreTools(pi);
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
