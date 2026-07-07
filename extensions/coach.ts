/**
 * Coach — the system comes to you, you never remember a command.
 *
 * You type a task in plain English. Before the agent runs, Coach classifies it
 * and suggests the right workflow — you press Enter to accept (or pick another,
 * or "just do it" for a quick fix). Your input is then transformed into the
 * matching slash command. You never have to remember /loop, /feature, /research
 * — Coach tells you which one fits THIS task, in the moment.
 *
 * Trigger: automatic — intercepts every user input via the `input` event.
 *          Skip with: prefix your message with `!` (raw mode) or `/` (already
 *          a command). Toggle with /coach on|off.
 *
 * Harmony contract:
 * - Owns NO axis. Registers NO tools. Hooks NO tool_call, NO before_agent_start.
 * - The `input` event is NOT used by any installed package (pi-hermes-memory,
 *   pi-observational-memory, pi-prompt-template-model, pi-rewind, pi-hypa,
 *   pi-btw, pi-subagents, pi-lens, pi-web-access, pi-intercom, pi-statusline,
 *   palette/handoff/loop — none hook `input`). This is a free axis.
 * - Skips source:"extension" messages (agent-injected steers) so it never
 *   interferes with the loop engine's steering or hermes's background work.
 * - On "just do it" or trivial tasks, returns action:"continue" — the input
 *   passes through untouched. Zero overhead, zero interference.
 *
 * Why this exists (the adoption problem):
 * A system you don't use is worth zero. 8 slash commands + 4 extension triggers
 * + a 10-step workflow is past the human instruction ceiling. Coach inverts the
 * interface: instead of you remembering the command map, the system reads your
 * task and surfaces the one command that fits — with a one-tap confirm.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ─── Config ─────────────────────────────────────────────────────────────────

let enabled = true;

// ─── Intent classification (cc10x-router style) ─────────────────────────────
// Routes on the PRIMARY DELIVERABLE, not the first keyword or message length.
// ORIENT never falls through to BUILD. BUILD has a complexity gradient.

type Intent =
	| "orient" // understand existing code — NO changes, answer inline
	| "trivial" // short, no action — just do it
	| "build-trivial" // 1-2 files, single change — just do it (no loop)
	| "build" // multi-file / cross-module — /loop
	| "debug" // diagnosis IS the deliverable — /loop (debug)
	| "plan" // design question — /loop (plan phase first)
	| "research" // needs evidence — /research
	| "review" // advisory only — /review
	| "ship"; // commit/pr — /ship

interface Classification {
	intent: Intent;
	reason: string;
}

function classify(text: string): Classification {
	const t = text.toLowerCase().trim();
	const words = t.split(/\s+/);
	const changeAhead = /and then|then (build|fix|add|implement|change|update|create)/.test(t);
	const buildVerb = /\b(build|add|implement|create|update|make|generate|set up|setup|integrate|migrate|support|enable|wire up|write|refactor|fix|redesign|restructure)\b/.test(t);
	const debugVerb = /\b(debug|bug|broken|failing|fails?\s+to|crash|regression|diagnos|throws|exception|stacktrace|why is .* not working|doesn't work|not working)\b/.test(t);

	// ORIENT — understand existing code, NOT change it. First-class, never falls
	// through to BUILD (cc10x: "help me understand" must never spawn a write builder).
	if (
		/\b(help me understand|how (does|do|is) .*(work|structured|implemented|connected)|explain (how|what|the|where)|walk me through|map (this|the)|what does .*(do|mean)|where is .*(defined|implemented|used)|i'm unfamiliar with|zoom out|trace (through|how)|show me how)\b/.test(t)
		&& !changeAhead
	) {
		return { intent: "orient", reason: "Orientation — understand existing code. No changes, answer inline." };
	}
	// Pure questions (no action verb, no "then change") → also orient.
		if (
		/^(what|why|how|explain|show|list|tell|describe|summarize|difference between)\b/.test(t)
		&& !buildVerb
		&& !debugVerb
		&& !/\b(deploy|test)\b/.test(t)
		&& !changeAhead
	) {
		return { intent: "orient", reason: "Question / exploration — answer inline, no workflow." };
	}

	// SHIP — single-word commands, checked before build/review.
	if (/^(ship|commit|pr|push|release)($|\b)/.test(t)) {
		return { intent: "ship", reason: "Ship — /ship verifies + commits." };
	}

	// REVIEW — advisory only, never creates code (cc10x: REVIEW never spawns code-changing tasks).
	if (/\b(review|audit|roast|critique|check (my|this) (code|diff|pr)|find (issues|problems|antipatterns))\b/.test(t)) {
		return { intent: "review", reason: "Review — /review fans out parallel reviewers (advisory, no code changes)." };
	}

	// RESEARCH — needs evidence from multiple sources.
	if (/\b(research|investigate|compare|find (evidence|sources)|what (do|does) people|community|benchmark|prior art|is there (a|an) (lib|package|tool))\b/.test(t)) {
		return { intent: "research", reason: "Needs evidence from multiple sources — /research fans out." };
	}

	// DEBUG — diagnosis/repair IS the primary deliverable.
	// cc10x: ERROR wins over BUILD, but route on PRIMARY DELIVERABLE, not first keyword.
	// "add dark-mode and fix the button" = BUILD (fix is incidental).
	// "why is login broken" / "debug the payment flow" = DEBUG.
	const debugFraming = /^(why|debug|diagnos|what.*(wrong|broken|failing)|the (bug|error|crash)|fix the (broken|failing|crash|bug))\b/i.test(t);
	if (debugVerb && (!buildVerb || debugFraming)) {
		return { intent: "debug", reason: "Bug diagnosis is the deliverable — /loop builds a feedback loop, finds root cause, fixes (bounded)." };
	}

	// PLAN — design/architect/spec.
	if (/\b(plan|design|architect|spec|rfc|brainstorm|how should (we|i) (build|structure)|redesign|restructure|refactor (the|this))\b/.test(t)) {
		return { intent: "plan", reason: "Design question — /loop runs the plan phase (read-only) first." };
	}

	// BUILD — changes code. Complexity gradient (cc10x: trivial → reduced path; non-trivial → full loop).
	if (buildVerb) {
		const trivialSignal = /\b(typo|rename (this|the)|fix the (spelling|typo)|add a comment|change the (string|text|message)|update the version|bump (the )?version|quick (fix|change)|one-line|small (fix|change|tweak))\b/.test(t);
		const nonTrivialSignal = /\b(feature|system|endpoint|api|auth|authentication|database|db|migration|integrate|integration|wire up|set up|setup|support for|refactor (the|this)|redesign|restructure|service|layer|pipeline|workflow|orchestrat)\b/.test(t);
		const manyFiles = (t.match(/\b(src|lib|app|packages?|components?|routes?|models?|controllers?|services?)\//g) || []).length > 1;
		if (trivialSignal && !nonTrivialSignal) {
			return { intent: "build-trivial", reason: "Trivial change (1-2 files, single outcome) — just do it, no loop needed." };
		}
		if (nonTrivialSignal || manyFiles) {
			return { intent: "build", reason: "Multi-file / cross-module build — /loop runs plan→build→review→verify→ship (bounded)." };
		}
		return { intent: "build", reason: "Build task — /loop for the bounded workflow, or just do it if it stays small." };
	}

	// Trivial: short, no action verb.
	if (words.length <= 3) {
		return { intent: "trivial", reason: "Short task — just do it directly." };
	}
	return { intent: "trivial", reason: "No workflow needed — just do it directly." };
}

// ─── Suggestion mapping ─────────────────────────────────────────────────────

interface Suggestion {
	label: string; // the workflow command
	command: string | null; // null = "just do it" (no transform)
	description: string;
}

function suggestionsFor(c: Classification): Suggestion[] {
	const loop: Suggestion = {
		label: "Run /loop (bounded workflow)",
		command: '/loop "$TASK"',
		description:
			"plan → build → review → verify → ship, with gates + convergence. For hard/multi-phase tasks.",
	};
	const research: Suggestion = {
		label: "Run /research (fan out)",
		command: '/research "$TASK"',
		description:
			"Parallel research across web + GitHub + codebase. For evidence-gathering.",
	};
	const review: Suggestion = {
		label: "Run /review (parallel reviewers)",
		command: "/review",
		description: "Fan out 2-3 reviewers on the current diff. Anti-anchored.",
	};
	const ship: Suggestion = {
		label: "Run /ship (verify + commit)",
		command: "/ship",
		description: "Verify with evidence, then commit. Use when code is ready.",
	};
	const justDoIt: Suggestion = {
		label: "Just do it (no workflow)",
		command: null,
		description: "Quick fix — agent handles it directly, no loop/gates.",
	};
	const explore: Suggestion = {
		label: "Answer inline (explore)",
		command: null,
		description: "No changes — agent explains / explores. (workflow step 1)",
	};

	switch (c.intent) {
		case "orient":
			return [explore]; // pass-through, no popup
		case "trivial":
			return [justDoIt]; // pass-through, no popup
		case "build-trivial":
			return [justDoIt, { ...loop, label: "Actually, run /loop anyway" }];
		case "build":
			return [loop, justDoIt, research];
		case "debug":
			return [
				{
					...loop,
					label: "Run /loop (debug: feedback loop → root cause → fix)",
					description:
					"debug intent — bounded loop, finds root cause not symptom.",
				},
				justDoIt,
				research,
			];
		case "plan":
			return [
				{
					...loop,
					label: "Run /loop (plan phase first, read-only)",
					description: "plan intent — explores read-only, then decides.",
				},
				{ ...research, label: "Or /research first" },
				justDoIt,
			];
		case "research":
			return [
				research,
				{ ...loop, label: "Or /loop (if it becomes a build task)" },
			];
		case "review":
			return [review, { ...loop, label: "Or /loop (full build+review)" }];
		case "ship":
			return [ship, review];
	}
}

// ─── The input interceptor ──────────────────────────────────────────────────

export default function coachExtension(pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		if (!enabled) return { action: "continue" };

		// Never touch agent-injected messages (loop steering, hermes, etc.).
		if (event.source === "extension") return { action: "continue" };

		const text = event.text.trim();
		if (!text) return { action: "continue" };

		// Raw mode: leading '!' = pass through untouched (power-user escape hatch).
		if (text.startsWith("!")) {
			return { action: "transform", text: text.slice(1).trim() };
		}

		// Already a slash command: pass through (the user knew what they wanted).
		if (text.startsWith("/")) return { action: "continue" };

		// Classify + suggest.
		const c = classify(text);

		// cc10x-style: ORIENT and trivial and build-trivial pass through SILENTLY
		// (no popup). ORIENT must NEVER fall through to BUILD — it answers inline.
		// build-trivial defaults to just-do-it. Only real workflows popup.
		if (c.intent === "orient" || c.intent === "trivial" || c.intent === "build-trivial") {
			return { action: "continue" };
		}

		const suggestions = suggestionsFor(c);

		// Show the coach UI: a select with the workflow options.
		const title = `Coach → ${c.intent.toUpperCase()} — ${c.reason}`;
		const options = suggestions.map((s) => s.label);
		const choice = await ctx.ui.select(title, options);

		if (choice === undefined) {
			// Esc / cancel = just do it (don't block the user).
			return { action: "continue" };
		}

		const picked = suggestions.find((s) => s.label === choice) ?? null;
		if (!picked || picked.command === null) {
			// "Just do it" — pass the original text through untouched.
			return { action: "continue" };
		}

		// Transform the input into the chosen slash command, with the task filled in.
		const command = picked.command.replace("$TASK", text.replace(/"/g, '\\"'));
		return { action: "transform", text: command };
	});

	// /coach command — toggle + status + test the classifier on a sample.
	pi.registerCommand("coach", {
		description:
			"Toggle or test the auto-coach (suggests the right workflow for your task)",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().toLowerCase();
			if (sub === "off") {
				enabled = false;
				ctx.ui.setStatus("coach", undefined);
				ctx.ui.notify("Coach OFF — you'll type commands yourself.", "info");
				return;
			}
			if (sub === "on") {
				enabled = true;
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
				const c = classify(sample);
				const sugg = suggestionsFor(c);
				ctx.ui.notify(
					`Coach: "${sample}" → ${c.intent}\n${c.reason}\nSuggests: ${sugg.map((s) => s.label).join(" | ")}`,
					"info",
				);
				return;
			}
			ctx.ui.notify(
				`Coach is ${enabled ? "ON" : "OFF"}. Type a task in plain English — I'll suggest the workflow. (prefix '!' = raw, '/coach off|on|test')`,
				"info",
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (enabled) {
			ctx.ui.setStatus("coach", ctx.ui.theme.fg("dim", "🧭 coach"));
			// One-time gentle reminder of the interface (not every turn — just once).
			ctx.ui.notify(
				"Coach on — just type your task. (I'll suggest the workflow. '!' = raw)",
				"info",
			);
		}
	});
}
