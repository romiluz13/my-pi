/**
 * Coach — the system comes to you, you never remember a command.
 *
 * You type a task in plain English. Coach shows a fixed 9-option workflow menu.
 * You pick one. Coach transforms your input into the matching slash command.
 * Pi expands the prompt template, the `skill:` frontmatter pin fires, and the
 * skill content is mechanically injected. No improvisation. No orphans.
 *
 * The LLM is used ONLY for skillHints (optional domain skill activation notes
 * like MongoDB/UI/Python). If the LLM fails, the menu still shows — skillHints
 * are non-blocking. The workflow selection itself is NEVER delegated to the LLM
 * — the user always picks from the fixed menu.
 *
 * Trigger: automatic — intercepts every user input via the `input` event.
 *          Skip with: prefix your message with `!` (raw mode) or `/` (already
 *          a command). Toggle with /coach on|off.
 *
 * Harmony contract:
 * - Owns NO axis. Registers NO tools. Hooks NO tool_call, NO before_agent_start.
 *   DOES hook `input` (the interception point) and `session_start` (status indicator).
 * - The `input` event is NOT used by any installed package. This is a free axis.
 * - Skips source:"extension" messages (agent-injected steers).
 * - C1 fix: skips when the loop is paused for human input (imports isLoopPausedForHuman).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { complete, type Message } from "@earendil-works/pi-ai/compat";
import { isLoopPausedForHuman } from "./loop.ts";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// ─── Config ─────────────────────────────────────────────────────────────────

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

function loadCoachModel(): string {
	const path = join(homedir(), ".pi", "agent", "coach.json");
	if (!existsSync(path)) return DEFAULT_COACH_MODEL;
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8")) as {
			coachModel?: string;
		};
		return typeof raw.coachModel === "string" && raw.coachModel.trim()
			? raw.coachModel.trim()
			: DEFAULT_COACH_MODEL;
	} catch {
		return DEFAULT_COACH_MODEL;
	}
}

// ─── LLM skillHints (optional, non-blocking) ────────────────────────────────

/**
 * Ask the coach model for domain skill hints ONLY (not routing).
 * The LLM looks at the task text and suggests which domain skills are relevant
 * (MongoDB, UI, Python, web, etc.). This is non-blocking — if it fails, the
 * menu still shows without hints.
 */
async function getSkillHints(
	text: string,
	ctx: ExtensionContext,
	signal: AbortSignal,
): Promise<string[]> {
	if (!ctx?.modelRegistry) return [];

	const modelSpec = loadCoachModel();
	const slashIndex = modelSpec.indexOf("/");
	if (slashIndex < 1) return [];
	const provider = modelSpec.slice(0, slashIndex);
	const modelId = modelSpec.slice(slashIndex + 1);
	const model = ctx.modelRegistry.find(provider, modelId);
	if (!model) return [];

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.apiKey) return [];

	const systemPrompt = `You are a skill-hint extractor for the Pi coding agent. Given the user's task, identify which DOMAIN skills are relevant. Return ONLY valid JSON (no prose, no markdown fences):

{"skillHints": ["<Domain: activate skill-name>", ...]}

Rules:
- skillHints: short activation notes for relevant domain skills (MongoDB, UI/Python/web/Vercel/Bright Data, etc.); empty array if none.
- Do NOT suggest workflow skills (tdd, code-review, brainstorming, etc.) — those are handled by the workflow menu.
- Keep it to 0-3 hints. Only include skills that are genuinely relevant to the task.`;

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
		if (!content) return [];
		const cleaned = content
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```$/i, "")
			.trim();
		const obj = JSON.parse(cleaned) as { skillHints?: unknown[] };
		return Array.isArray(obj.skillHints) ? obj.skillHints.map(String) : [];
	} catch {
		return [];
	}
}

function hintFromSkills(skillHints: string[]): string | null {
	if (skillHints.length === 0) return null;
	return `[Coach capability activation — ${skillHints.join(" | ")}]`;
}

// ─── Fixed workflow menu (no LLM routing — the user always picks) ───────────

interface WorkflowOption {
	label: string;
	command: string | null; // null = passthrough
	description: string;
}

const WORKFLOW_OPTIONS: WorkflowOption[] = [
	{
		label: "Just do it (raw agent — no workflow)",
		command: null,
		description: "Skip the workflow. The agent works from AGENTS.md rules.",
	},
	{
		label: "/build — Build with TDD (red → green → prove it)",
		command: '/build "$TASK"',
		description: "Implement + test. Pins the tdd skill mechanically.",
	},
	{
		label:
			"/feature — Fast chain: plan → build → review → ship (no human gates)",
		command: '/feature "$TASK"',
		description:
			"End-to-end feature. Runs all phases back-to-back. No pause for approval.",
	},
	{
		label:
			"/loop — Bounded loop with phase gates + human approval (hard tasks)",
		command: '/loop "$TASK"',
		description:
			"Contract gate → plan → build → review → verify → ship. Pauses for human input. Tool restrictions per phase.",
	},
	{
		label:
			"/loop --mode=agents — Sub-agent dispatch (fresh context per phase)",
		command: '/loop --mode=agents "$TASK"',
		description:
			"Each phase spawns a fresh-context sub-agent. Structured output via emit_result. Journal persists results. Budget control.",
	},
	{
		label: "/debug — Debug an issue (feedback loop, root cause)",
		command: '/debug "$TASK"',
		description:
			"Build a repro loop, find root cause, fix. Pins diagnosing-bugs.",
	},
	{
		label: "/fix — Fast chain: debug → build → review → ship (for bugs)",
		command: '/fix "$TASK"',
		description: "End-to-end bug fix. Runs all phases back-to-back.",
	},
	{
		label: "/plan — Plan only (no code, design + spec + tickets)",
		command: '/plan "$TASK"',
		description:
			"Understand, brainstorm, write spec + tickets. Pins brainstorming.",
	},
	{
		label: "/research — Research a topic (parallel fan-out)",
		command: '/research "$TASK"',
		description: "Web, GitHub, codebase, memory. Pins research skill.",
	},
	{
		label: "/review — Review current diff (parallel reviewers)",
		command: "/review",
		description: "Standards + spec + security. Pins code-review skill.",
	},
	{
		label: "/ship — Ship (verify, document, commit, PR)",
		command: "/ship",
		description: "Independent verification + commit. Pins verification skill.",
	},
	{
		label: "Browse all commands (/palette)",
		command: "/palette",
		description: "Fuzzy-search every command, prompt, and skill.",
	},
];

// Conversational responses (yes/no/ok) → skip the popup.
const CONVERSATIONAL =
	/^(yes|no|ok|okay|sure|done|go|continue|proceed|do it|go ahead|that's fine|looks good|lgtm|yep|nope|correct|right|exactly|true|false|1|2|3|skip|next|stop|abort|cancel|\d+)\b/i;

// ─── The input interceptor ──────────────────────────────────────────────────

export default function coachExtension(pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		if (!isCoachEnabled(ctx)) return { action: "continue" };
		if (event.source === "extension") return { action: "continue" };
		if (isLoopPausedForHuman()) return { action: "continue" };

		const text = event.text.trim();
		if (!text) return { action: "continue" };

		// Raw mode: leading '!' = pass through untouched.
		if (text.startsWith("!")) {
			return { action: "transform", text: text.slice(1).trim() };
		}

		// Already a slash command: pass through.
		if (text.startsWith("/")) return { action: "continue" };

		// Conversational responses → passthrough (no popup).
		if (text.length < 30 && CONVERSATIONAL.test(text)) {
			return { action: "continue" };
		}

		// Get optional skill hints from LLM (non-blocking).
		let skillHint: string | null = null;
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
			const hints = await getSkillHints(text, ctx, controller.signal).finally(
				() => clearTimeout(timeout),
			);
			if (hints.length > 0) skillHint = hintFromSkills(hints);
		} catch {
			// LLM failed — skip skillHints, still show the menu.
		}

		// Show the fixed workflow menu.
		const title = `Coach — pick a workflow for: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"${skillHint ? ` — ${skillHint}` : ""}`;
		const choice = await ctx.ui.select(
			title,
			WORKFLOW_OPTIONS.map((o) => o.label),
		);

		if (choice === undefined) {
			// Esc / cancel = just do it (still inject skill hints).
			if (skillHint)
				return { action: "transform", text: `${skillHint}\n${text}` };
			return { action: "continue" };
		}

		const picked = WORKFLOW_OPTIONS.find((o) => o.label === choice) ?? null;

		if (!picked || picked.command === null) {
			// "Just do it" — inject hints, pass original text.
			if (skillHint)
				return { action: "transform", text: `${skillHint}\n${text}` };
			return { action: "continue" };
		}

		// Transform the input into the chosen slash command.
		const taskText = skillHint ? `${text} ${skillHint}` : text;
		const command = picked.command.replace("$TASK", () =>
			taskText.replace(/"/g, '\\"'),
		);
		if (ctx.mode === "tui") {
			ctx.ui.setEditorText(command);
			return { action: "handled" };
		}
		return { action: "transform", text: command };
	});

	// /coach command — toggle + status.
	pi.registerCommand("coach", {
		description:
			"Toggle Coach on/off (the fixed workflow menu for plain-English tasks)",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().toLowerCase();
			if (sub === "off") {
				setCoachEnabled(ctx, false);
				ctx.ui.setStatus("coach", undefined);
				ctx.ui.notify("Coach OFF — type slash commands yourself.", "info");
				return;
			}
			if (sub === "on") {
				setCoachEnabled(ctx, true);
				ctx.ui.setStatus("coach", ctx.ui.theme.fg("dim", "🧭 coach"));
				ctx.ui.notify("Coach ON — type a task and pick a workflow.", "info");
				return;
			}
			ctx.ui.notify(
				`Coach is ${isCoachEnabled(ctx) ? "ON" : "OFF"}. Type a task → pick a workflow. ('!' = raw, '/coach off|on')`,
				"info",
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (isCoachEnabled(ctx)) {
			ctx.ui.setStatus("coach", ctx.ui.theme.fg("dim", "🧭 coach"));
			ctx.ui.notify(
				"Coach on — type your task, pick a workflow. ('!' = raw)",
				"info",
			);
		}
	});
}
