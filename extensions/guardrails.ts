/**
 * Guardrails — AGENTS.md prominence re-injection.
 *
 * Solves the known failure: "the agent says it didn't pay attention to AGENTS.md."
 *
 * Every turn, before_agent_start re-appends a HARD RULES block — pulled from the
 * AGENTS.md that Pi already loaded into systemPromptOptions.contextFiles — to the
 * TOP-ATTENTION region of the system prompt. This defeats mid-session forgetting
 * and survives compaction BY CONSTRUCTION (Pi re-runs before_agent_start on the
 * retried turn after compaction, rebuilding the system prompt from the options).
 *
 * Trigger: automatic — loads on session_start, runs every before_agent_start.
 * No command, no shortcut, no tool. Configure via ~/.pi/agent/guardrails.json.
 *
 * Harmony contract:
 * - Owns NO axis. Registers NO tools. Hooks NO tool_call (does not touch the
 *   pi-hypa/pi-rewind/loop.ts tool_call handlers at all).
 * - before_agent_start is already used by pi-hermes-memory (memory policy),
 *   pi-prompt-template-model (run-prompt guidance), and pi-rewind (snapshot
 *   side-effect) — all APPEND-ONLY. This handler is append-only too. Pi chains
 *   before_agent_start returns across handlers, so all four compose without
 *   clobbering. Loads AFTER the npm packages (extensions/ dir runs after
 *   packages), so event.systemPrompt already includes hermes + ptm additions.
 * - session_compact is already used by pi-hermes-memory (flush) and
 *   pi-observational-memory (compaction summary). This handler only READS
 *   ctx.getSystemPrompt() and notifies — returns nothing, touches no storage.
 *
 * What this is NOT (honest scope):
 * This is the PROMINENCE tier (~90-95% reliable per IFScale research). It is
 * NOT the ENFORCEMENT tier (on('tool_call') {block:true} — 100% non-circumventable).
 * For safety-critical rules that must never fail, add tool_call gates later.
 * This extension makes the rules hard to ignore; it cannot physically prevent
 * violation. See extensions/README.md for the upgrade path.
 *
 * Research basis: arXiv 2507.11538 (IFScale — density decay, primacy effect,
 * ~150-instruction ceiling), claude-code#7777 (model admits rules are advisory),
 * dev.to "200 lines" + Substack "Prompts Don't Enforce Rules, Hooks Do"
 * (community consensus: re-injection is real-but-partial; hooks are the law).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// ─── Config ─────────────────────────────────────────────────────────────────

interface GuardrailsConfig {
	/** Re-inject the rules block every turn (default true). */
	enabled: boolean;
	/** Max chars of AGENTS.md to re-inject (keeps the block in the primacy window). */
	maxChars: number;
	/** Also warn if AGENTS.md was not found in contextFiles at all. */
	warnIfMissing: boolean;
}

const DEFAULT_CONFIG: GuardrailsConfig = {
	enabled: true,
	maxChars: 3500,
	warnIfMissing: true,
};

function loadConfig(): GuardrailsConfig {
	const path = join(process.env.HOME ?? "~", ".pi", "agent", "guardrails.json");
	if (!existsSync(path)) return DEFAULT_CONFIG;
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8"));
		return { ...DEFAULT_CONFIG, ...raw };
	} catch {
		return DEFAULT_CONFIG;
	}
}

// ─── The re-injection block ─────────────────────────────────────────────────

/**
 * Pull the AGENTS.md content from the contextFiles Pi already loaded. This is
 * the source of truth — we never re-read the file ourselves (no drift if the
 * user edits AGENTS.md mid-session; Pi reloads it on the next turn).
 */
function findAgentsMd(
	contextFiles: Array<{ path: string; content: string }> | undefined,
): { path: string; content: string } | null {
	if (!contextFiles) return null;
	// Match AGENTS.md (any case) at any path — Pi loads from ~/.pi/agent/,
	// parent dirs, and cwd.
	for (const f of contextFiles) {
		if (/\bAGENTS\.md$/i.test(f.path)) return f;
	}
	return null;
}

function truncate(content: string, maxChars: number): string {
	if (content.length <= maxChars) return content;
	// Keep the head (the primacy window) — the top of AGENTS.md is the
	// always-on rules; detail follows. Add a marker so the model knows it's
	// truncated.
	return `${content.slice(0, maxChars)}\n\n[…truncated; full AGENTS.md already in context above…]`;
}

function rulesBlock(
	agentsMd: { path: string; content: string } | null,
	cfg: GuardrailsConfig,
): string {
	const header =
		"\n\n## ⚡ HARD RULES — re-injected every turn by guardrails.ts (from AGENTS.md)\n\n" +
		"These are NOT advisory. You MUST follow them. If you skipped them before, follow them now.\n\n";
	if (!agentsMd) {
		return `${header}_AGENTS.md was not loaded into contextFiles — no rules to re-inject. Check that ~/.pi/agent/AGENTS.md exists._\n`;
	}
	return `${header}Source: ${agentsMd.path}\n\n---\n${truncate(agentsMd.content, cfg.maxChars)}\n---\n`;
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function guardrailsExtension(pi: ExtensionAPI): void {
	const cfg = loadConfig();

	// Re-inject every turn. This is the core mechanism.
	pi.on("before_agent_start", async (event, ctx) => {
		if (!cfg.enabled) return;
		const agentsMd = findAgentsMd(event.systemPromptOptions?.contextFiles);
		if (!agentsMd && cfg.warnIfMissing) {
			ctx.ui.notify("guardrails: AGENTS.md not found in contextFiles — no rules to re-inject.", "warning");
		}
		// Append (never replace) — preserves Pi's base prompt + hermes + ptm.
		return {
			systemPrompt: event.systemPrompt + rulesBlock(agentsMd, cfg),
		};
	});

	// Belt-and-suspenders: after compaction, audit that the rules survived.
	// before_agent_start re-injects unconditionally next turn, so this is just
	// observability — it cannot block, only warn.
	pi.on("session_compact", async (_event, ctx) => {
		if (!cfg.enabled) return;
		const sp = ctx.getSystemPrompt();
		if (!/HARD RULES/.test(sp)) {
			ctx.ui.notify(
				"guardrails: rules dropped after compaction — will re-inject next turn",
				"warning",
			);
		}
	});

	// One-time load notification (non-blocking, additive status slot).
	pi.on("session_start", async (_event, ctx) => {
		if (!cfg.enabled) return;
		ctx.ui.setStatus("guardrails", ctx.ui.theme.fg("dim", "⚡ rules"));
	});

	// /guardrails command — toggle / inspect / test
	pi.registerCommand("guardrails", {
		description:
			"Inspect or toggle AGENTS.md re-injection (guardrails extension)",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().toLowerCase();
			if (sub === "off") {
				cfg.enabled = false;
				ctx.ui.setStatus("guardrails", undefined);
				ctx.ui.notify("guardrails: re-injection OFF", "info");
				return;
			}
			if (sub === "on") {
				cfg.enabled = true;
				ctx.ui.setStatus("guardrails", ctx.ui.theme.fg("dim", "⚡ rules"));
				ctx.ui.notify("guardrails: re-injection ON", "info");
				return;
			}
			if (sub === "test") {
				// Show what would be injected this turn.
				const opts = ctx.getSystemPromptOptions?.();
				const agentsMd = findAgentsMd(opts?.contextFiles);
				ctx.ui.notify(
					agentsMd
						? `guardrails: AGENTS.md found at ${agentsMd.path} (${agentsMd.content.length} chars); would inject ${truncate(agentsMd.content, cfg.maxChars).length} chars. enabled=${cfg.enabled}`
						: `guardrails: AGENTS.md NOT in contextFiles. enabled=${cfg.enabled}`,
					agentsMd ? "info" : "warning",
				);
				return;
			}
			ctx.ui.notify(
				`guardrails: re-injection ${cfg.enabled ? "ON" : "OFF"}. Usage: /guardrails on|off|test`,
				"info",
			);
		},
	});
}
