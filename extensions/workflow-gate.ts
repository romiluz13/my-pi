/**
 * Workflow Gate — enforces that critical skills were loaded before allowing
 * dangerous operations.
 *
 * Layer 3 of the 4-layer activation system:
 *   Layer 1: skill-injector.ts — injects skills into system prompt
 *   Layer 2: guardrails.ts — re-injects AGENTS.md with MUST rules
 *   Layer 3: workflow-gate.ts — BLOCKS operations if skills are missing
 *   Layer 4: trace.ts — observes and reports activation gaps
 *
 * This extension blocks:
 *   - git commit if verification-before-completion skill was NOT loaded
 *   - git push if commit skill was NOT loaded
 *   - git commit if the agent hasn't run tests (heuristic: no bash tool call
 *     with test-like command in the current session)
 *
 * The check: scan session entries for customType="skill-loaded" messages
 * to verify which skills PTM actually injected. If a required skill is
 * missing, block the operation with a clear reason.
 *
 * Harmony contract:
 * - Owns ONE axis: workflow gate enforcement (blocking dangerous ops without skills).
 * - Hooks tool_call (same event as loop.ts phase gates and pi-confirm-destructive).
 * - Returns { block: true, reason: "..." } only for git commit/push without skills.
 * - Does NOT register tools. Does NOT modify system prompt. Does NOT touch session.
 * - Composes with loop.ts (both hook tool_call for different concerns — loop blocks
 *   out-of-phase tools, this blocks unverified commits).
 * - Composes with pi-confirm-destructive (destructive-action gate runs first,
 *   this gate runs for commit/push specifically).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ─── Skill requirements for operations ─────────────────────────────────────

const COMMIT_REQUIRED_SKILLS = ["verification-before-completion"];
const PUSH_REQUIRED_SKILLS = ["commit"];

// ─── Check which skills were loaded in this session ────────────────────────

function getLoadedSkills(ctx: {
	sessionManager: { getBranch: () => Array<Record<string, unknown>> };
}): Set<string> {
	const loaded = new Set<string>();
	try {
		const branch = ctx.sessionManager.getBranch();
		for (const entry of branch) {
			if (entry.customType === "skill-loaded" && entry.details) {
				const skillName = (entry.details as { skillName?: string }).skillName;
				if (skillName) loaded.add(skillName);
			}
		}
	} catch {
		// Session access may fail — fail open (don't block)
	}
	return loaded;
}

// ─── Check if tests were run in this session ───────────────────────────────

function wasTestRun(ctx: {
	sessionManager: { getBranch: () => Array<Record<string, unknown>> };
}): boolean {
	try {
		const branch = ctx.sessionManager.getBranch();
		for (const entry of branch) {
			const input = entry.input as { command?: string } | undefined;
			if (input?.command) {
				const cmd = input.command.toLowerCase();
				if (
					cmd.includes("test") ||
					cmd.includes("pytest") ||
					cmd.includes("cargo test") ||
					cmd.includes("npm test") ||
					cmd.includes("node --test")
				) {
					return true;
				}
			}
		}
	} catch {
		// Session access may fail — fail open
	}
	return false;
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function workflowGateExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		// Only check bash tool calls that involve git commit or git push
		if (event.toolName !== "bash") return;

		const input = event.input as { command?: string } | undefined;
		const command = input?.command ?? "";

		// Gate 1: git commit requires verification-before-completion skill
		if (/\bgit\s+commit\b/.test(command)) {
			const loaded = getLoadedSkills(ctx);
			const missing = COMMIT_REQUIRED_SKILLS.filter((s) => !loaded.has(s));

			if (missing.length > 0) {
				// Check if the skill content is in the system prompt (skill-injector may have added it)
				// If the /ship prompt was used, verification-before-completion is pinned by PTM
				// If skill-injector added it to the system prompt, it's not in the session as a message
				// but the model should still have it. We fail OPEN if we can't find it but the
				// system prompt might have it.
				//
				// For now: only block if we're confident the skill is truly missing.
				// Check if this looks like a /ship workflow (heuristic: "ship" in recent prompts)
				const branch = ctx.sessionManager.getBranch();
				const recentPrompts = branch
					.filter((e) => e.type === "user" || e.type === "message")
					.slice(-5)
					.map((e) => {
						const content = (e as { message?: { content?: unknown } }).message
							?.content;
						if (typeof content === "string") return content;
						if (Array.isArray(content)) {
							return content
								.map((b: { text?: string }) => b?.text ?? "")
								.join(" ");
						}
						return "";
					})
					.join(" ");

				if (!recentPrompts.toLowerCase().includes("ship") && !wasTestRun(ctx)) {
					return {
						block: true,
						reason: `[WORKFLOW GATE] git commit blocked: verification-before-completion skill was not loaded. Run /ship to invoke the full shipping workflow (verify → document → commit → push), or manually run /skill:verification-before-completion before committing.`,
					};
				}
			}
		}

		// Gate 2: git push requires commit skill
		if (/\bgit\s+push\b/.test(command)) {
			const loaded = getLoadedSkills(ctx);
			const missing = PUSH_REQUIRED_SKILLS.filter((s) => !loaded.has(s));

			if (missing.length > 0) {
				// Check if this is a /ship workflow
				const branch = ctx.sessionManager.getBranch();
				const recentPrompts = branch
					.filter((e) => e.type === "user" || e.type === "message")
					.slice(-5)
					.map((e) => {
						const content = (e as { message?: { content?: unknown } }).message
							?.content;
						if (typeof content === "string") return content;
						if (Array.isArray(content)) {
							return content
								.map((b: { text?: string }) => b?.text ?? "")
								.join(" ");
						}
						return "";
					})
					.join(" ");

				if (!recentPrompts.toLowerCase().includes("ship")) {
					return {
						block: true,
						reason: `[WORKFLOW GATE] git push blocked: commit skill was not loaded. Run /ship to invoke the full shipping workflow, or manually run /skill:commit before pushing.`,
					};
				}
			}
		}

		return;
	});
}
