/**
 * Skill Injector — multi-skill activation via system prompt injection.
 *
 * THE PROBLEM: Pi's PTM only supports ONE skill: frontmatter pin per prompt.
 * So /build pins tdd but can't also pin implement. 19 critical skills are
 * Grade B (mentioned in body text, might fire, might not).
 *
 * THE SOLUTION: Pi's before_agent_start event can modify the system prompt.
 * guardrails.ts already does this for AGENTS.md. We do the same for skills:
 * detect which prompt was invoked → append additional SKILL.md contents to
 * the system prompt. Now the model ALWAYS sees the skill content — it can't
 * "forget" to invoke it.
 *
 * Compaction survival: before_agent_start fires on every agent run, including
 * after compaction. So skills are re-injected automatically. Same mechanism
 * guardrails.ts uses for AGENTS.md rules.
 *
 * Harmony contract:
 * - Owns ONE axis: multi-skill system prompt injection.
 * - Hooks before_agent_start (appends to systemPrompt, same as guardrails).
 * - Hooks session_compact (re-injects after compaction, same as guardrails).
 * - Does NOT register tools. Does NOT block tool calls. Does NOT touch the
 *   session, hermes, or observational memory.
 * - Composes with guardrails.ts (both append to systemPrompt, Pi chains handlers).
 * - Composes with PTM (PTM injects 1 skill as a message, we inject N skills
 *   into the system prompt — different mechanisms, no conflict).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ─── Skill map: pinned skill → additional skills to inject ─────────────────
// When PTM pins a skill via skill: frontmatter, skill-injector detects it
// and appends the additional skills' SKILL.md content to the system prompt.

const SKILL_INJECTIONS: Record<string, string[]> = {
	// /build pins tdd → also need implement + uv
	tdd: ["implement", "uv"],
	// /plan pins brainstorming → also need the full planning toolkit
	brainstorming: [
		"to-spec",
		"to-tickets",
		"wayfinder",
		"prototype",
		"grill-with-docs",
	],
	// /review pins code-review → also need the review toolkit
	"code-review": [
		"receiving-code-review",
		"improve-codebase-architecture",
		"codebase-hygiene",
	],
	// /ship pins verification-before-completion → also need the shipping toolkit
	"verification-before-completion": [
		"commit",
		"github",
		"diff-driven-docs",
		"domain-modeling",
	],
};

// ─── Skill content loading ─────────────────────────────────────────────────

function loadSkillContent(skillName: string): string | null {
	const paths = [
		join(homedir(), ".agents", "skills", skillName, "SKILL.md"),
		join(homedir(), ".pi", "agent", "skills", skillName, "SKILL.md"),
	];
	for (const skillPath of paths) {
		if (existsSync(skillPath)) {
			const raw = readFileSync(skillPath, "utf-8");
			// Strip frontmatter
			const body = raw.replace(/^---[\s\S]*?---\s*/, "");
			return `\n--- ${skillName} skill (mechanically injected by skill-injector) ---\n${body}\n--- end ${skillName} skill ---\n`;
		}
	}
	return null;
}

// ─── Detect which prompt was invoked ────────────────────────────────────────
// PTM injects the pinned skill as a "skill-loaded" custom message.
// We can detect it by checking the session for that message.
// But before_agent_start fires BEFORE the message is added.
// So we check event.prompt for known patterns from each prompt template.

function detectPinnedSkill(prompt: string): string | null {
	// /build body starts with "Build the following" or "workflow steps 4-5"
	if (
		prompt.includes("workflow steps 4-5") ||
		prompt.includes("Build the following")
	) {
		return "tdd";
	}
	// /plan body starts with "Plan the following" or "workflow steps 1-3"
	if (
		prompt.includes("workflow steps 1-3") ||
		prompt.includes("Plan the following")
	) {
		return "brainstorming";
	}
	// /review body mentions "code-review skill"
	if (
		prompt.includes("code-review skill") ||
		prompt.includes("Review the current")
	) {
		return "code-review";
	}
	// /ship body mentions "workflow steps 7-8"
	if (
		prompt.includes("workflow steps 7-8") ||
		prompt.includes("Ship the current")
	) {
		return "verification-before-completion";
	}
	// /debug body mentions "workflow step 5"
	if (
		prompt.includes("workflow step 5") ||
		prompt.includes("Debug the following")
	) {
		return "diagnosing-bugs";
	}
	// /research body mentions "research skill"
	if (
		prompt.includes("research skill") ||
		prompt.includes("Research the following")
	) {
		return "research";
	}
	return null;
}

// ─── Injection state (re-injected after compaction) ────────────────────────

let lastInjectedSkills: string[] = [];

// ─── Extension ──────────────────────────────────────────────────────────────

export default function skillInjectorExtension(pi: ExtensionAPI): void {
	// Inject additional skills into the system prompt.
	pi.on("before_agent_start", async (event, _ctx) => {
		const pinnedSkill = detectPinnedSkill(event.prompt);
		if (!pinnedSkill) return;

		const additionalSkills = SKILL_INJECTIONS[pinnedSkill];
		if (!additionalSkills || additionalSkills.length === 0) return;

		// Load and concatenate skill content
		const skillContents: string[] = [];
		for (const skillName of additionalSkills) {
			const content = loadSkillContent(skillName);
			if (content) {
				skillContents.push(content);
			}
		}

		if (skillContents.length === 0) return;

		// Append to system prompt (same mechanism as guardrails.ts)
		const injection = `\n\n## Additional Skills (mechanically injected by skill-injector)\n${skillContents.join("\n")}\n`;

		lastInjectedSkills = additionalSkills;

		return {
			systemPrompt: event.systemPrompt + injection,
		};
	});

	// Re-inject after compaction (same pattern as guardrails.ts)
	pi.on("session_compact", async (_event, ctx) => {
		if (lastInjectedSkills.length === 0) return;
		// The next before_agent_start will re-inject automatically.
		// But we can also set a flag for guardrails to include a reminder.
		// For now, just log that we'll re-inject on the next turn.
		try {
			ctx.ui.setStatus(
				"skills",
				`${lastInjectedSkills.length} skills queued for re-injection`,
			);
		} catch {
			// Status may not be available in all modes
		}
	});
}
