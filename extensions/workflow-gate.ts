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
 *   - write/edit on SOURCE files if tdd skill was NOT loaded (TDD enforcement)
 *   - git commit if verification-before-completion OR code-review skills were NOT loaded
 *   - git push if commit skill was NOT loaded
 *
 * Escape hatch: /skip-gate toggles a per-session flag that opens all gates.
 * Use it for quick config edits or when you intentionally skip a workflow.
 *
 * The check: scan session entries for skill-loaded messages AND the system
 * prompt for skill-injector markers. This catches both slash-command turns
 * (PTM injects skill-loaded message) and continuation turns (skill-injector
 * adds to system prompt after the 2026-07-16 fix).
 *
 * Harmony contract:
 * - Owns ONE axis: workflow gate enforcement (blocking ops without skills).
 * - Hooks tool_call (same event as loop.ts phase gates and pi-confirm-destructive).
 * - Returns { block: true, reason: "..." } for gated operations.
 * - Registers /skip-gate command (per-session toggle, NOT a tool).
 * - Does NOT modify system prompt. Does NOT touch session storage.
 * - Composes with loop.ts (both hook tool_call — loop blocks out-of-phase
 *   tools, this blocks unverified writes/commits).
 * - Composes with pi-confirm-destructive (runs first, this runs for specific ops).
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	isSourceFile,
	shouldGateWrite,
	shouldGateCommit,
	shouldGatePush,
	wasTestRun,
	type SkillCheckContext,
} from "./workflow-gate-logic.ts";

// ─── Per-session skip-gate state ───────────────────────────────────────────

const skipGateBySession = new Map<string, boolean>();

// Default: gates OFF (full autonomy mode). The user explicitly requested
// 0 limitations — gates are opt-IN, not opt-OUT. Use /skip-gate off to
// re-enable enforcement for a session.
function isSkipGate(ctx: ExtensionContext): boolean {
	return skipGateBySession.get(ctx.sessionManager.getSessionId()) ?? true;
}

function setSkipGate(ctx: ExtensionContext, value: boolean): void {
	skipGateBySession.set(ctx.sessionManager.getSessionId(), value);
}

// ─── Adapt ExtensionContext to SkillCheckContext ───────────────────────────

function toSkillCtx(ctx: ExtensionContext): SkillCheckContext {
	return {
		sessionManager: ctx.sessionManager,
		getSystemPrompt: ctx.getSystemPrompt?.bind(ctx),
	};
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function workflowGateExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		const skip = isSkipGate(ctx);
		const skillCtx = toSkillCtx(ctx);

		// ─── Gate 1: TDD enforcement — block write/edit on source files ───
		//
		// The agent cannot write production code unless tdd (or a build-phase
		// skill) is active. Test files, docs, and config are always allowed.
		// This is the enforcement that makes "test-first" non-circumventable.
		if (event.toolName === "write" || event.toolName === "edit") {
			const input = event.input as
				| { path?: string; filePath?: string }
				| undefined;
			const filePath = input?.path ?? input?.filePath ?? "";
			if (filePath) {
				const decision = shouldGateWrite(filePath, skillCtx, skip);
				if (decision.block) {
					return { block: true, reason: decision.reason };
				}
			}
		}

		// ─── Gate 2: git commit requires verification + review ───────────
		if (event.toolName === "bash") {
			const input = event.input as { command?: string } | undefined;
			const command = input?.command ?? "";

			if (/\bgit\s+commit\b/.test(command)) {
				const testsRan = wasTestRun(skillCtx);
				const decision = shouldGateCommit(skillCtx, skip, testsRan);
				if (decision.block) {
					return { block: true, reason: decision.reason };
				}
			}

			// ─── Gate 3: git push requires commit skill ───────────────────
			if (/\bgit\s+push\b/.test(command)) {
				const decision = shouldGatePush(skillCtx, skip);
				if (decision.block) {
					return { block: true, reason: decision.reason };
				}
			}
		}

		return;
	});

	// ─── /skip-gate command — per-session escape hatch ───────────────────
	//
	// Toggles all workflow gates for this session. Use for quick edits,
	// config changes, or when you intentionally skip a workflow phase.
	// Stays on until explicitly turned off.
	pi.registerCommand("skip-gate", {
		description:
			"Toggle workflow gates (TDD, review, verification enforcement) for this session",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().toLowerCase();
			if (sub === "on") {
				setSkipGate(ctx, true);
				ctx.ui.notify(
					"Workflow gates OFF for this session. Write/commit freely.",
					"info",
				);
				ctx.ui.setStatus("gate", ctx.ui.theme.fg("warning", "🔓 gates off"));
				return;
			}
			if (sub === "off") {
				setSkipGate(ctx, false);
				ctx.ui.notify(
					"Workflow gates ON — TDD, review, verification enforced.",
					"info",
				);
				ctx.ui.setStatus("gate", ctx.ui.theme.fg("accent", "🔒 gates on"));
				return;
			}
			if (sub === "status") {
				ctx.ui.notify(
					`Workflow gates ${isSkipGate(ctx) ? "OFF" : "ON"}. Usage: /skip-gate on|off|status`,
					"info",
				);
				return;
			}
			// No arg = toggle
			const newVal = !isSkipGate(ctx);
			setSkipGate(ctx, newVal);
			ctx.ui.notify(
				newVal
					? "Workflow gates OFF for this session. Write/commit freely."
					: "Workflow gates ON — TDD, review, verification enforced.",
				"info",
			);
			ctx.ui.setStatus(
				"gate",
				newVal
					? ctx.ui.theme.fg("warning", "🔓 gates off")
					: ctx.ui.theme.fg("accent", "🔒 gates on"),
			);
		},
	});

	// Session start: show gate status
	pi.on("session_start", async (_event, ctx) => {
		if (!isSkipGate(ctx)) {
			ctx.ui.setStatus("gate", ctx.ui.theme.fg("accent", "🔒 gates on"));
		} else {
			ctx.ui.setStatus("gate", ctx.ui.theme.fg("warning", "🔓 gates off"));
		}
	});
}
