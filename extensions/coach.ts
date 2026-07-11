/**
 * Coach — the system comes to you, you never remember a command.
 *
 * You type a task in plain English. Before the agent runs, Coach asks a cheap
 * LLM (deepseek-v4-flash by default) to pick the right workflow from the LIVE
 * command catalog (discovered via pi.getCommands() — never hard-coded, so
 * adding a skill needs zero edit here). You press Enter to accept (or pick
 * another, or "just do it" for a quick fix). Your input is then transformed
 * into the matching slash command. You never have to remember /loop, /feature,
 * /research — Coach tells you which one fits THIS task, in the moment.
 *
 * Trigger: automatic — intercepts every user input via the `input` event.
 *          Skip with: prefix your message with `!` (raw mode) or `/` (already
 *          a command). Toggle with /coach on|off.
 *
 * Harmony contract:
 * - Owns NO axis. Registers NO tools. Hooks NO tool_call, NO before_agent_start.
 *   DOES hook `input` (the interception point) and `session_start` (status indicator).
 * - The `input` event is NOT used by any installed package (pi-hermes-memory,
 *   pi-observational-memory, pi-prompt-template-model, pi-rewind,
 *   pi-btw, pi-subagents, pi-lens, pi-web-access, pi-intercom, pi-statusline,
 *   palette/handoff/loop — none hook `input`). This is a free axis.
 * - Skips source:"extension" messages (agent-injected steers) so it never
 *   interferes with the loop engine's steering or hermes's background work.
 * - On "just do it", passthrough, or LLM failure → action:"continue" — the
 *   input passes through untouched. Zero overhead, zero interference.
 *
 * Why this exists (the adoption problem):
 * A system you don't use is worth zero. Slash commands only work if you
 * remember them. Coach inverts the interface: the system reads your task and
 * surfaces the one command that fits — with a one-tap confirm.
 *
 * Ideology (Matt Pocock — the agent is smart, give it judgment):
 * The routing decision is made by an LLM call, NOT a hard-coded regex table.
 * The command catalog is read live from pi.getCommands() at call time, so
 * adding a new skill or command automatically makes it routable — zero code
 * or config edit. This is the deliberate opposite of a hard-coded router.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { complete, type Message } from "@earendil-works/pi-ai/compat";
// C1 fix: import the loop pause-state check so Coach can skip when the loop
// is paused for human input. Without this, Coach's {action:"handled"} short-
// circuits the input chain and the loop never resumes.
import { isLoopPausedForHuman } from "./loop.ts";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// ─── Config ─────────────────────────────────────────────────────────────────

// Per-session toggle (previously a module-level `let` that leaked across
// sessions and subagents). Keyed by sessionId so every session/subagent gets
// its own independent Coach state.
const enabledBySession = new Map<string, boolean>();

function isCoachEnabled(ctx: ExtensionContext): boolean {
	const sessionId = ctx.sessionManager.getSessionId();
	if (enabledBySession.has(sessionId)) return enabledBySession.get(sessionId)!;
	return true;
}

function setCoachEnabled(ctx: ExtensionContext, value: boolean): void {
	enabledBySession.set(ctx.sessionManager.getSessionId(), value);
}

const DEFAULT_COACH_MODEL = "grove-openai/deepseek-v4-flash";
const LLM_TIMEOUT_MS = 5000;

interface CoachConfig {
	/** "provider/model-id" — the cheap model that classifies + routes. */
	coachModel: string;
}

function loadCoachModel(): string {
	const path = join(homedir(), ".pi", "agent", "coach.json");
	if (!existsSync(path)) return DEFAULT_COACH_MODEL;
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<CoachConfig>;
		return typeof raw.coachModel === "string" && raw.coachModel.trim()
			? raw.coachModel.trim()
			: DEFAULT_COACH_MODEL;
	} catch {
		return DEFAULT_COACH_MODEL;
	}
}

// ─── Dynamic catalog (the 0-phantom, auto-discovers-new-skills core) ────────

interface CatalogEntry {
	name: string;
	description: string;
}

/**
 * Build the command catalog LIVE from pi.getCommands(). This is the same
 * mechanism palette.ts uses — it "never drifts when prompts or skills are
 * added." If you drop a new skill in ~/.pi/agent/skills/, it appears here
 * automatically on the next input. Zero code or config edit. Only real
 * commands appear (no hard-coded list can drift to phantoms).
 */
function buildCatalog(pi: ExtensionAPI): CatalogEntry[] {
	return pi
		.getCommands()
		.filter((c) => c.name !== "coach" && c.name !== "palette")
		.map((c) => ({ name: c.name, description: c.description ?? "" }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Set of valid command names from the live catalog — used to validate LLM output. */
function catalogNames(catalog: CatalogEntry[]): Set<string> {
	return new Set(catalog.map((c) => c.name));
}

/** A suggestion's command is safe if it's null (passthrough) or `/name` where name is in the catalog. */
function isCommandSafe(cmd: string | null, valid: Set<string>): boolean {
	if (cmd === null) return true;
	if (!cmd.startsWith("/")) return false;
	const name = cmd.slice(1).split(/\s|"/)[0];
	return valid.has(name);
}

// ─── LLM classification ─────────────────────────────────────────────────────

interface LLMSuggestion {
	label: string;
	/** Slash command with $TASK placeholder, or null = pass-through ("just do it"). */
	command: string | null;
	description: string;
}

interface CoachDecision {
	intent: string;
	reason: string;
	/** true = skip the popup (orient/trivial/build-trivial). */
	passthrough: boolean;
	suggestions: LLMSuggestion[];
	skillHints: string[];
}

function parseCoachResponse(text: string): CoachDecision | null {
	try {
		const cleaned = text
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```$/i, "")
			.trim();
		const obj = JSON.parse(cleaned) as Record<string, unknown>;
		if (typeof obj !== "object" || obj === null) return null;
		const suggestions = Array.isArray(obj.suggestions)
			? (obj.suggestions as Record<string, unknown>[]).map((s) => ({
					label: String(s.label ?? s.command ?? "Just do it"),
					command:
						s.command === null || s.command === undefined
							? null
							: String(s.command),
					description: String(s.description ?? ""),
				}))
			: [];
		return {
			intent: String(obj.intent ?? "trivial"),
			reason: String(obj.reason ?? ""),
			passthrough: Boolean(obj.passthrough),
			suggestions,
			skillHints: Array.isArray(obj.skillHints)
				? (obj.skillHints as unknown[]).map((s) => String(s))
				: [],
		};
	} catch {
		return null;
	}
}

/**
 * Ask the coach model to route the user's task. Returns null on any failure
 * (model not found, no API key, timeout, unparseable JSON) — the caller falls
 * back to pass-through, so Coach never blocks the user.
 */
async function classifyWithLLM(
	text: string,
	catalog: CatalogEntry[],
	ctx: ExtensionContext,
	signal: AbortSignal,
): Promise<CoachDecision | null> {
	if (!ctx?.modelRegistry) return null;

	const modelSpec = loadCoachModel();
	const slashIndex = modelSpec.indexOf("/");
	if (slashIndex < 1) return null;
	const provider = modelSpec.slice(0, slashIndex);
	const modelId = modelSpec.slice(slashIndex + 1);
	const model = ctx.modelRegistry.find(provider, modelId);
	if (!model) return null;

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.apiKey) return null;

	const catalogText = catalog
		.map((c) => `- /${c.name} — ${c.description}`)
		.join("\n");

	const systemPrompt = `You are Coach, a workflow router for the Pi coding agent. Given the user's task and the live catalog of available commands/skills, decide the best workflow.

Available commands (discovered live — only suggest from this list):
${catalogText}

Intent → command hints (use these to route reliably):
  build → /build "$TASK"
  feature → /feature "$TASK" (full chain: plan→build→review→ship)
  fix → /fix "$TASK" (full chain: debug→build→review→ship)
  loop → /loop "$TASK" (bounded autonomous loop for hard/multi-phase tasks)
  debug → /debug "$TASK"
  plan → /plan "$TASK"
  research → /research "$TASK"
  review → /review
  ship → /ship
  audit → /setup-audit
  handoff → /handoff
  brainstorm → /skill:brainstorming
  document → /skill:diff-driven-docs
  compact → /skill:compact-safe
  write-skill → /skill:writing-great-skills
  teach → /skill:teach
  wayfinder → /skill:wayfinder
  prototype → /skill:prototype
  triage → /skill:triage
  implement → /skill:implement

Return ONLY valid JSON (no prose, no markdown fences):
{
  "intent": "<one of: build|debug|plan|research|review|ship|loop|feature|fix|orient|trivial|build-trivial|teach|handoff|setup|implement|compact|triage|write-skill|wayfinder|prototype|audit|brainstorm|document|remember>",
  "reason": "<one short line explaining the routing>",
  "passthrough": <true if the task is exploratory/trivial and should run with NO popup — orient/trivial/build-trivial/remember; false if a workflow popup helps>,
  "suggestions": [
    {"label": "<display label>", "command": "<slash command with $TASK placeholder, e.g. /feature \\"$TASK\\">", "description": "<one line>"},
    ...2-4 options, best first, always include a "Just do it" option with command null last
  ],
  "skillHints": ["<Domain: activate skill-name>", ...]
}

Rules:
- For orient/trivial/build-trivial/remember: passthrough=true, suggestions=[].
- command uses $TASK as the placeholder for the user's task text.
- ONLY suggest commands that exist in the catalog above — never invent one.
- Keep suggestions to 2-4 options. Always include "Just do it" (command: null) as the last option.
- skillHints: short activation notes for relevant domain skills (MongoDB, UI, Python, web, etc.); empty array if none.
- For 'remember' intent: passthrough=true, inject skillHint "Memory: use memory tool to save".
- For 'loop' intent: always suggest /loop as the first option (it's the most powerful workflow).
- For 'feature' intent: suggest /loop first (design approval gated), /feature second (fast path, no approval gate).
- For 'compact' intent: suggest /skill:compact-safe (NOT /compact which is a built-in not in the catalog).`;

	const messages: Message[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: text },
	];

	try {
		const response = await complete(
			model,
			{ messages },
			{ apiKey: auth.apiKey, headers: auth.headers, signal },
		);
		const content =
			typeof response.content === "string"
				? response.content
				: Array.isArray(response.content)
					? (response.content as Array<{ type: string; text?: string }>)
							.filter((p) => p.type === "text")
							.map((p) => p.text ?? "")
							.join("")
					: "";
		if (!content) return null;
		return parseCoachResponse(content);
	} catch {
		return null;
	}
}

function hintFromSkills(skillHints: string[]): string | null {
	if (skillHints.length === 0) return null;
	return `[Coach capability activation — ${skillHints.join(" | ")}]`;
}

// ─── The input interceptor ──────────────────────────────────────────────────

export default function coachExtension(pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		if (!isCoachEnabled(ctx)) return { action: "continue" };

		// Never touch agent-injected messages (loop steering, hermes, etc.).
		if (event.source === "extension") return { action: "continue" };

		// C1 fix: if the loop is paused for a human decision, skip Coach entirely.
		// The user's response should resume the loop, not be transformed into a slash command.
		if (isLoopPausedForHuman()) return { action: "continue" };

		const text = event.text.trim();
		if (!text) return { action: "continue" };

		// Raw mode: leading '!' = pass through untouched (power-user escape hatch).
		if (text.startsWith("!")) {
			return { action: "transform", text: text.slice(1).trim() };
		}

		// Already a slash command: pass through (the user knew what they wanted).
		if (text.startsWith("/")) return { action: "continue" };

		// Classify with the LLM over the live catalog.
		const catalog = buildCatalog(pi);
		const valid = catalogNames(catalog);
		// The /palette escape hatch is filtered out of the LLM-facing catalog (so
		// the model doesn't suggest it as a "workflow"), but it's a real command —
		// allow it through the safety check for the hardcoded fallback option.
		valid.add("palette");
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
		let decision: CoachDecision | null = null;
		try {
			decision = await classifyWithLLM(text, catalog, ctx, controller.signal);
		} finally {
			clearTimeout(timeout);
		}

		// Fallback: LLM failed/timeout/unparseable — pass through, never block.
		if (!decision) return { action: "continue" };

		// Silent pass-through for exploratory/trivial tasks (no popup).
		if (decision.passthrough || decision.suggestions.length === 0) {
			const hint = hintFromSkills(decision.skillHints);
			if (hint) return { action: "transform", text: `${hint}\n${text}` };
			return { action: "continue" };
		}

		// Show the coach UI: select with the LLM's suggestions + palette escape.
		const skillTitle =
			decision.skillHints.length > 0
				? ` — activating: ${decision.skillHints.join(", ")}`
				: "";
		const title = `Coach → ${decision.intent.toUpperCase()} — ${decision.reason}${skillTitle}`;
		const suggestions: LLMSuggestion[] = [
			...decision.suggestions,
			{
				label: "Browse all commands (/palette)",
				command: "/palette",
				description: "Fuzzy-search every command, prompt, and skill.",
			},
		];
		// Drop suggestions whose command isn't in the live catalog (defense vs LLM hallucination).
		const safeSuggestions = suggestions.filter((s) =>
			isCommandSafe(s.command, valid),
		);
		if (safeSuggestions.length === 0) return { action: "continue" };
		const choice = await ctx.ui.select(
			title,
			safeSuggestions.map((s) => s.label),
		);

		if (choice === undefined) {
			// Esc / cancel = just do it (still inject skill hints).
			const hint = hintFromSkills(decision.skillHints);
			if (hint) return { action: "transform", text: `${hint}\n${text}` };
			return { action: "continue" };
		}

		const picked = safeSuggestions.find((s) => s.label === choice) ?? null;
		const combinedHint = hintFromSkills(decision.skillHints);

		if (!picked || picked.command === null) {
			// "Just do it" or pass-through skill — inject hints, pass original text.
			if (combinedHint)
				return { action: "transform", text: `${combinedHint}\n${text}` };
			return { action: "continue" };
		}

		// Transform the input into the chosen slash command, with the task filled in.
		// Use a replacement function so $&, $`, $' in user input don't corrupt the command.
		const taskText = combinedHint ? `${text} ${combinedHint}` : text;
		const command = picked.command.replace("$TASK", () =>
			taskText.replace(/"/g, '\\"'),
		);
		// Place the command in the editor and end this turn ("handled" = consumed,
		// nothing sent to the agent). The user presses Enter, which re-enters prompt()
		// and runs the FULL command dispatch — including extension commands like
		// /loop, /palette, /handoff that Pi checks on the original text BEFORE the
		// `input` event. A plain `transform` would bypass that re-check and send
		// extension commands to the agent as literal text. Prompt-template commands
		// (/build, /feature, ...) also work via this path (template expansion runs
		// on re-entry). In non-TUI mode there's no editor to seed, so fall back to
		// transform (templates still expand; extension commands won't — best effort).
		if (ctx.mode === "tui") {
			ctx.ui.setEditorText(command);
			return { action: "handled" };
		}
		return { action: "transform", text: command };
	});

	// /coach command — toggle + status + test the classifier on a sample.
	pi.registerCommand("coach", {
		description:
			"Toggle or test the auto-coach (LLM suggests the right workflow for your task)",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().toLowerCase();
			if (sub === "off") {
				setCoachEnabled(ctx, false);
				ctx.ui.setStatus("coach", undefined);
				ctx.ui.notify("Coach OFF — you'll type commands yourself.", "info");
				return;
			}
			if (sub === "on") {
				setCoachEnabled(ctx, true);
				ctx.ui.setStatus("coach", ctx.ui.theme.fg("dim", "🧭 coach"));
				ctx.ui.notify(
					"Coach ON — type a task and I'll suggest the workflow.",
					"info",
				);
				return;
			}
			if (sub === "test" || sub.startsWith("test ")) {
				// Classify a sample without transforming.
				const sample = (args ?? "").replace(/^test\s*/i, "").trim();
				if (!sample) {
					ctx.ui.notify(
						"Usage: /coach test <your task> — shows what Coach would suggest",
						"warning",
					);
					return;
				}
				const catalog = buildCatalog(pi);
				const controller = new AbortController();
				const t = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
				const decision = await classifyWithLLM(
					sample,
					catalog,
					ctx,
					controller.signal,
				).finally(() => clearTimeout(t));
				if (!decision) {
					ctx.ui.notify(
						"Coach: LLM classification failed — check ~/.pi/agent/coach.json (coachModel) and that the model is enabled.",
						"warning",
					);
					return;
				}
				ctx.ui.notify(
					`Coach: "${sample}" → ${decision.intent}\n${decision.reason}\nSuggests: ${decision.suggestions.map((s) => s.label).join(" | ") || "(pass-through)"}\nSkills: ${decision.skillHints.join(", ") || "none"}`,
					"info",
				);
				return;
			}
			ctx.ui.notify(
				`Coach is ${isCoachEnabled(ctx) ? "ON" : "OFF"}. Type a task in plain English — I'll suggest the workflow. (prefix '!' = raw, '/coach off|on|test')`,
				"info",
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (isCoachEnabled(ctx)) {
			ctx.ui.setStatus("coach", ctx.ui.theme.fg("dim", "🧭 coach"));
			// One-time gentle reminder of the interface (not every turn — just once).
			ctx.ui.notify(
				"Coach on — just type your task. (I'll suggest the workflow. '!' = raw)",
				"info",
			);
		}
	});
}
