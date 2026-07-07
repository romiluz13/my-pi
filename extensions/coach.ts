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

// ─── Domain → skill activation (the capability layer) ───────────────────────
// Coach detects the task domain and explicitly tells the agent which skills
// to activate. This makes skill activation DETERMINISTIC (not relying on the
// model noticing 50 skill descriptions in the system prompt) and VISIBLE
// (the user sees what's being activated — guiding). The user never has to
// remember a skill name.

interface DomainSkill {
	pattern: RegExp;
	skills: string[];
	label: string;
}

const DOMAIN_SKILLS: DomainSkill[] = [
	{
		pattern:
			/\b(mongodb|mongo|atlas|mongoose|schema design|aggregation pipeline|vector search|atlas search|collection|index)\b/i,
		skills: [
			"mongodb-schema-design",
			"mongodb-query-optimizer",
			"mongodb-search-and-ai",
		],
		label: "MongoDB",
	},
	{
		pattern:
			/\b(vercel|next\.?js|nextjs|sveltekit|nuxt|astro|deploy to vercel|ssr|rsc|server component|react)\b/i,
		skills: ["vercel-react-best-practices", "vercel-composition-patterns"],
		label: "Vercel/React",
	},
	{
		pattern:
			/\b(ui|frontend|interface|landing page|dashboard|component|design system|css|tailwind|button|form|layout|responsive|accessibility|a11y|polish|redesign the (ui|interface|page))\b/i,
		skills: ["frontend-design", "impeccable", "web-design-guidelines"],
		label: "UI/Frontend",
	},
	{
		pattern:
			/\b(scrape|scraping|serp|web data|extract data|bright data|bdata|crawl|spider|structured data from)\b/i,
		skills: ["search", "scrape", "data-feeds", "brightdata-cli"],
		label: "Web scraping/data",
	},
	{
		pattern:
			/\b(octocode|evidence-first|prior art|code research|inspect code|npm package|github search|library internals)\b/i,
		skills: ["octocode", "octocode-research"],
		label: "Code research",
	},
	{
		pattern:
			/\b(python|pip|venv|uv run|pyproject|fastapi|django|flask|poetry)\b/i,
		skills: ["uv"],
		label: "Python",
	},
	{
		pattern:
			/\b(github issue|github pr|gh cli|create a pr|open an issue|ci pipeline|github action)\b/i,
		skills: ["github"],
		label: "GitHub",
	},
	{
		pattern:
			/\b(memory|remember this|gotcha|lesson|failure|insight|compounding)\b/i,
		skills: ["memory-compounding"],
		label: "Memory",
	},
];

function detectDomains(text: string): DomainSkill[] {
	return DOMAIN_SKILLS.filter((d) => d.pattern.test(text));
}

function buildSkillHint(text: string): string | null {
	const domains = detectDomains(text);
	if (domains.length === 0) return null;
	const parts = domains.map(
		(d) => `${d.label}: activate ${d.skills.join(", ")}`,
	);
	return `[Coach capability activation — ${parts.join(" | ")}]`;
}

// ─── Intent classification (cc10x-router style) ─────────────────────────────
// Routes on the PRIMARY DELIVERABLE, not the first keyword or message length.
// ORIENT never falls through to BUILD. BUILD has a complexity gradient.

type Intent =
	| "orient" // understand existing code — NO changes, answer inline
	| "trivial" // short, no action — just do it
	| "build-trivial" // 1-2 files, single change — just do it (no loop)
	| "build" // multi-file / cross-module — /feature (native chain), /loop alt
	| "debug" // diagnosis IS the deliverable — /fix (native chain), /loop alt
	| "plan" // design question — /plan (brainstorm+spec), /loop alt
	| "research" // needs evidence — /research
	| "review" // advisory only — /review
	| "ship" // commit/pr — /ship
	| "refactor" // improve structure — /improve-codebase-architecture
	| "teach" // teach the agent — /teach
	| "handoff" // continue elsewhere — /handoff
	| "setup" // configure tooling — /wizard
	| "implement" // execute a spec/plan — /implement
	| "compact" // session too long — /compact-safe
	| "triage" // prioritize issues — /triage
	| "write-skill" // create a skill — /writing-great-skills
	| "wayfinder" // fog of war — wayfinder skill (auto)
	| "prototype"; // sanity-check by building — prototype skill (auto)

interface Classification {
	intent: Intent;
	reason: string;
}

function classify(text: string): Classification {
	const t = text.toLowerCase().trim();
	const words = t.split(/\s+/);
	const changeAhead =
		/and then|then (build|fix|add|implement|change|update|create)/.test(t);
	const buildVerb =
		/\b(build|add|implement|create|update|make|generate|set up|setup|integrate|migrate|support|enable|wire up|write|refactor|fix|redesign|restructure)\b/.test(
			t,
		);
	const debugVerb =
		/\b(debug|bug|broken|failing|fails?\s+to|crash|regression|diagnos|throws|exception|stacktrace|why is .* not working|doesn't work|not working)\b/.test(
			t,
		);

	// ORIENT — understand existing code, NOT change it. First-class, never falls
	// through to BUILD (cc10x: "help me understand" must never spawn a write builder).
	if (
		/\b(help me understand|how (does|do|is) .*(work|structured|implemented|connected)|explain (how|what|the|where)|walk me through|map (this|the)|what does .*(do|mean)|where is .*(defined|implemented|used)|i'm unfamiliar with|zoom out|trace (through|how)|show me how)\b/.test(
			t,
		) &&
		!changeAhead
	) {
		return {
			intent: "orient",
			reason:
				"Orientation — understand existing code. No changes, answer inline.",
		};
	}
	// Pure questions (no action verb, no "then change") → also orient.
	if (
		/^(what|why|how|explain|show|list|tell|describe|summarize|difference between)\b/.test(
			t,
		) &&
		!buildVerb &&
		!debugVerb &&
		!/\b(deploy|test)\b/.test(t) &&
		!changeAhead
	) {
		return {
			intent: "orient",
			reason: "Question / exploration — answer inline, no workflow.",
		};
	}

	// SHIP — single-word commands, checked before build/review.
	if (/^(ship|commit|pr|push|release)($|\b)/.test(t)) {
		return { intent: "ship", reason: "Ship — /ship verifies + commits." };
	}

	// REVIEW — advisory only, never creates code (cc10x: REVIEW never spawns code-changing tasks).
	if (
		/\b(review|audit|roast|critique|check (my|this) (code|diff|pr)|find (issues|problems|antipatterns))\b/.test(
			t,
		)
	) {
		return {
			intent: "review",
			reason:
				"Review — /review fans out parallel reviewers (advisory, no code changes).",
		};
	}

	// RESEARCH — needs evidence from multiple sources.
	if (
		/\b(research|investigate|compare|find (evidence|sources)|what (do|does) people|community|benchmark|prior art|is there (a|an) (lib|package|tool))\b/.test(
			t,
		)
	) {
		return {
			intent: "research",
			reason: "Needs evidence from multiple sources — /research fans out.",
		};
	}

	// TEACH — user is teaching the agent a durable preference/process.
	if (
		/\b(teach you|remember that|from now on|next time (always|do)|always (do|use|run)|never (do|use|run))\b/.test(
			t,
		)
	) {
		return {
			intent: "teach",
			reason:
				"Teaching the agent — /teach captures the preference into memory.",
		};
	}

	// HANDOFF — continue work in a new session.
	if (
		/\b(handoff|hand off|continue (this )?in a new session|transfer (this )?to (a )?(new|another) session|start a new session (with|for) this)\b/.test(
			t,
		)
	) {
		return {
			intent: "handoff",
			reason:
				"Continuation — /handoff drafts a transfer prompt for a new session.",
		};
	}

	// SETUP — configure tooling/services (not a code build).
	if (
		/\b(set up pre-commit|configure (pre-commit|mcp|mongodb|eslint|prettier|linting|hooks|the tooling)|install and configure|wizard|setup-pre-commit)\b/.test(
			t,
		)
	) {
		return {
			intent: "setup",
			reason: "Tooling setup — /wizard configures third-party services.",
		};
	}

	// IMPLEMENT — execute a spec/plan (distinct from BUILD: there's already a spec).
	if (
		/\b(implement the (spec|plan)|execute the (spec|plan)|run the implementation|build from the spec|execute the tickets)\b/.test(
			t,
		)
	) {
		return {
			intent: "implement",
			reason:
				"Spec/plan exists — /implement is the TDD + code-review + commit execution wrapper.",
		};
	}

	// COMPACT — session getting long, clean up context.
	if (
		/\b(compact (the )?session|compact-safe|clean up context|session (is )?(too )?long|running low on context|free up context)\b/.test(
			t,
		)
	) {
		return {
			intent: "compact",
			reason:
				"Context management — /compact-safe compacts while preserving constraints + errors verbatim.",
		};
	}

	// TRIAGE — prioritize issues/backlog.
	if (
		/\b(triage|prioriti[sz]e (the )?(issues|backlog|tickets|bugs)|organize (the )?backlog|sort (the )?issues)\b/.test(
			t,
		)
	) {
		return {
			intent: "triage",
			reason: "Issue prioritization — /triage sorts issues by impact/effort.",
		};
	}

	// WRITE-SKILL — create a new skill.
	if (
		/\b(write a skill|create a skill|build a skill|author a skill|make a skill)\b/.test(
			t,
		)
	) {
		return {
			intent: "write-skill",
			reason:
				"Skill authoring — /writing-great-skills guides the skill creation process.",
		};
	}

	// DEBUG — diagnosis/repair IS the primary deliverable.
	// cc10x: ERROR wins over BUILD, but route on PRIMARY DELIVERABLE, not first keyword.
	// "add dark-mode and fix the button" = BUILD (fix is incidental).
	// "why is login broken" / "debug the payment flow" = DEBUG.
	const debugFraming =
		/^(why|debug|diagnos|what.*(wrong|broken|failing)|the (bug|error|crash)|fix the (broken|failing|crash|bug))\b/i.test(
			t,
		);
	if (debugVerb && (!buildVerb || debugFraming)) {
		return {
			intent: "debug",
			reason:
				"Bug diagnosis is the deliverable — /fix runs debug→build→review→ship (native chain). /loop alt for bounded feedback loop.",
		};
	}

	// REFACTOR — improve structure/testability of existing code (distinct from PLAN).
	if (
		/\b(refactor (this|the|a)|improve (the )?(structure|architecture|testability)|clean up (this|the)|simplify (this|the)|decouple (these|the)|break up (this|the)|split (this|the) into)\b/.test(
			t,
		)
	) {
		return {
			intent: "refactor",
			reason:
				"Structural improvement — /improve-codebase-architecture (read-only diagnose, then BUILD with gates).",
		};
	}

	// WAYFINDER — fog of war: loose idea, don't know what to build yet.
	// Distinct from PLAN (which has a concrete target). wayfinder charts
	// investigation tickets to figure out WHAT to build. Auto-skill, activated
	// via hint (not a slash command).
	if (
		/\b(loose idea|foggy|fog of war|not sure what to build|don't know what to build|figure out what to build|not sure where to start|where do i start|too big to wrap my head around|break this (vague |loose )?idea down|explore (options|directions) for|what should i (build|make|create))\b/.test(
			t,
		)
	) {
		return {
			intent: "wayfinder",
			reason:
				"Foggy problem — wayfinder charts investigation tickets to figure out WHAT to build.",
		};
	}

	// PROTOTYPE — sanity-check by building throwaway code. Auto-skill.
	if (
		/\b(prototype|sanity[- ]check|throwaway|see if it feels right|spike|quick and dirty|mock[- ]?up|test the waters|explore what the (ui|interface) should look like)\b/.test(
			t,
		)
	) {
		return {
			intent: "prototype",
			reason:
				"Design question answerable by building — prototype is throwaway code that answers it.",
		};
	}

	// PLAN — design/architect/spec (refactor moved to its own intent above).
	if (
		/\b(plan|design|architect|spec|rfc|brainstorm|how should (we|i) (build|structure)|redesign|restructure)\b/.test(
			t,
		)
	) {
		return {
			intent: "plan",
			reason:
				"Design question — /plan brainstorms + writes spec + tickets. /loop alt runs plan phase + full bounded workflow.",
		};
	}

	// BUILD — changes code. Complexity gradient (cc10x: trivial → reduced path; non-trivial → full loop).
	if (buildVerb) {
		const trivialSignal =
			/\b(typo|rename (this|the)|fix the (spelling|typo)|add a comment|change the (string|text|message)|update the version|bump (the )?version|quick (fix|change)|one-line|small (fix|change|tweak))\b/.test(
				t,
			);
		const nonTrivialSignal =
			/\b(feature|system|endpoint|api|auth|authentication|database|db|migration|integrate|integration|wire up|set up|setup|support for|refactor (the|this)|redesign|restructure|service|layer|pipeline|workflow|orchestrat)\b/.test(
				t,
			);
		const manyFiles =
			(
				t.match(
					/\b(src|lib|app|packages?|components?|routes?|models?|controllers?|services?)\//g,
				) || []
			).length > 1;
		if (trivialSignal && !nonTrivialSignal) {
			return {
				intent: "build-trivial",
				reason:
					"Trivial change (1-2 files, single outcome) — just do it, no loop needed.",
			};
		}
		if (nonTrivialSignal || manyFiles) {
			return {
				intent: "build",
				reason:
					"Multi-file / cross-module build — /feature runs plan→build→review→ship (native chain). /loop alt for bounded + convergence.",
			};
		}
		return {
			intent: "build",
			reason:
				"Build task — /feature (native chain) or /loop (bounded). Just do it if it stays small.",
		};
	}

	// Trivial: short, no action verb.
	if (words.length <= 3) {
		return { intent: "trivial", reason: "Short task — just do it directly." };
	}
	return {
		intent: "trivial",
		reason: "No workflow needed — just do it directly.",
	};
}

// ─── Suggestion mapping ─────────────────────────────────────────────────────

interface Suggestion {
	label: string; // the workflow command
	command: string | null; // null = "just do it" (no transform)
	description: string;
	skill?: string; // auto-skill to activate via hint (no slash command exists)
	skillWhy?: string; // why this skill — injected into the hint
}

function suggestionsFor(c: Classification): Suggestion[] {
	// Native Pi prompt-template chains (the power commands).
	const feature: Suggestion = {
		label: "Run /feature (native chain)",
		command: '/feature "$TASK"',
		description:
			"plan → build → review → ship. Autonomous, native Pi chain. The power command for standard builds.",
	};
	const fix: Suggestion = {
		label: "Run /fix (native debug chain)",
		command: '/fix "$TASK"',
		description:
			"debug → build → review → ship. Autonomous, native. The power command for bugs.",
	};
	const plan: Suggestion = {
		label: "Run /plan (brainstorm + spec + tickets)",
		command: '/plan "$TASK"',
		description:
			"Brainstorm, design, write spec + tickets. For design questions.",
	};
	const build: Suggestion = {
		label: "Run /build (TDD only)",
		command: '/build "$TASK"',
		description:
			"TDD: test → fail → implement → pass. No review/ship — for focused implementation.",
	};
	const debug: Suggestion = {
		label: "Run /debug (feedback loop only)",
		command: '/debug "$TASK"',
		description:
			"Build a feedback loop, find root cause, fix. No review/ship chain.",
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
	// Custom loop engine — the bounded, gated differentiator.
	const loop: Suggestion = {
		label: "Run /loop (bounded workflow)",
		command: '/loop "$TASK"',
		description:
			"plan → build → review → verify → ship, with gates + convergence + plateau detection. For hard/risky/multi-phase tasks.",
	};
	// User-invocable skill commands.
	const improveArch: Suggestion = {
		label: "Run /improve-codebase-architecture",
		command: "/improve-codebase-architecture",
		description:
			"Read-only diagnose structure → propose deepening → route through BUILD with gates.",
	};
	const teach: Suggestion = {
		label: "Run /teach",
		command: "/teach",
		description: "Capture a durable preference/process into memory.",
	};
	const handoff: Suggestion = {
		label: "Run /handoff (session continuation)",
		command: "/handoff",
		description:
			"Draft a transfer prompt for a new session from current context.",
	};
	const wizard: Suggestion = {
		label: "Run /wizard (setup third-party services)",
		command: "/wizard",
		description: "Interactive setup for pre-commit, MCP, linting, etc.",
	};
	const grill: Suggestion = {
		label: "Run /grill-with-docs (stress-test plan)",
		command: "/grill-with-docs",
		description: "Relentless interview to stress-test a plan before building.",
	};
	// User-invocable skill commands — the missing 4.
	const implement: Suggestion = {
		label: "Run /implement (execution wrapper)",
		command: "/implement",
		description: "TDD + code-review + commit. Executes a spec/plan end-to-end.",
	};
	const compactSafe: Suggestion = {
		label: "Run /compact-safe (context cleanup)",
		command: "/compact-safe",
		description:
			"Compact the session — keep constraints + errors verbatim, drop prose.",
	};
	const triage: Suggestion = {
		label: "Run /triage (prioritize issues)",
		command: "/triage",
		description: "Sort issues/backlog by impact and effort.",
	};
	const writeSkill: Suggestion = {
		label: "Run /writing-great-skills",
		command: "/writing-great-skills",
		description:
			"Guide the skill creation process — structure, triggers, pitfalls.",
	};
	// Auto-skills surfaced as primary suggestions (no slash command — activated via hint).
	const wayfinder: Suggestion = {
		label: "Use wayfinder (chart investigation tickets)",
		command: null,
		skill: "wayfinder",
		skillWhy: "chart a route through this foggy problem via investigation tickets on the issue tracker",
		description:
			"Turn a loose idea into a shared map of investigation tickets, resolved one at a time. For when you don't know WHAT to build yet.",
	};
	const prototypeSkill: Suggestion = {
		label: "Use prototype (throwaway sanity-check)",
		command: null,
		skill: "prototype",
		skillWhy: "build throwaway code that answers this design question, then discard",
		description:
			"Throwaway code that answers a design question. For when you need to see if a state model or UI feels right.",
	};
	// The universal escape hatch — fuzzy-search ALL commands.
	const palette: Suggestion = {
		label: "Browse all commands (/palette)",
		command: "/palette",
		description:
			"Fuzzy-search every command, prompt, and skill. When Coach's routing isn't what you wanted.",
	};
	const justDoIt: Suggestion = {
		label: "Just do it (no workflow)",
		command: null,
		description: "Agent handles it directly, no chain/gates.",
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
			return [
				justDoIt,
				build,
				{ ...feature, label: "Or /feature (full chain)" },
			];
		case "build":
			return [feature, loop, build, justDoIt, palette];
		case "debug":
			return [fix, loop, debug, justDoIt, palette];
		case "plan":
			return [
				plan,
				loop,
				grill,
				{ ...research, label: "Or /research first" },
				justDoIt,
			];
		case "research":
			return [
				research,
				{ ...loop, label: "Or /loop (if it becomes a build task)" },
				palette,
			];
		case "review":
			return [
				review,
				{ ...loop, label: "Or /loop (full build+review)" },
				palette,
			];
		case "ship":
			return [ship, review];
		case "refactor":
			return [
				improveArch,
				{ ...loop, label: "Or /loop (bounded refactor)" },
				{ ...plan, label: "Or /plan (design first)" },
				palette,
			];
		case "teach":
			return [teach, justDoIt];
		case "handoff":
			return [handoff, palette];
		case "setup":
			return [wizard, palette];
		case "implement":
			return [
				implement,
				{ ...feature, label: "Or /feature (full chain)" },
				palette,
			];
		case "compact":
			return [compactSafe, palette];
		case "triage":
			return [triage, palette];
		case "write-skill":
			return [writeSkill, palette];
		case "wayfinder":
			return [wayfinder, plan, { ...research, label: "Or /research first" }, justDoIt, palette];
		case "prototype":
			return [prototypeSkill, plan, { ...loop, label: "Or /loop (build for real)" }, justDoIt, palette];
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
		if (
			c.intent === "orient" ||
			c.intent === "trivial" ||
			c.intent === "build-trivial"
		) {
			return { action: "continue" };
		}

		const suggestions = suggestionsFor(c);

		// Detect domain skills to activate (the capability layer).
		const domains = detectDomains(text);
		const skillHint = buildSkillHint(text);
		const skillTitle =
			domains.length > 0
				? ` — activating: ${domains.map((d) => d.label).join(", ")}`
				: "";

		// Show the coach UI: a select with the workflow options + skill activation.
		const title = `Coach → ${c.intent.toUpperCase()} — ${c.reason}${skillTitle}`;
		const options = suggestions.map((s) => s.label);
		const choice = await ctx.ui.select(title, options);

		if (choice === undefined) {
			// Esc / cancel = just do it (don't block the user).
			// Still inject the skill hint so domain skills activate even on cancel.
			if (skillHint)
				return { action: "transform", text: `${skillHint}\n${text}` };
			return { action: "continue" };
		}

		const picked = suggestions.find((s) => s.label === choice) ?? null;

		// Build the intent-level skill hint (for auto-skills like wayfinder/prototype
		// that have no slash command — activated via hint instead).
		const intentHint =
			picked?.skill && picked.skillWhy
				? `[Coach: activate the ${picked.skill} skill — ${picked.skillWhy}]`
				: null;
		const combinedHint = [skillHint, intentHint]
			.filter(Boolean)
			.join(" ");

		if (!picked || picked.command === null) {
			// "Just do it" or an auto-skill suggestion (wayfinder/prototype) — pass the
			// original text through, but inject the skill hint(s) so the agent activates
			// the domain skills + the intent-level skill (autonomous capability).
			if (combinedHint)
				return { action: "transform", text: `${combinedHint}\n${text}` };
			return { action: "continue" };
		}

		// Transform the input into the chosen slash command, with the task filled in.
		// Embed the skill-activation hint(s) in the task so the agent loads the skills.
		const taskText = combinedHint ? `${text} ${combinedHint}` : text;
		const command = picked.command.replace(
			"$TASK",
			taskText.replace(/"/g, '\\"'),
		);
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
