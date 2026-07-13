/**
 * Trace — activation observability for the auto-pi workflow.
 *
 * Answers the user's biggest fear: "am I building an amazing harness where
 * most of it never enters the circuit?" This extension logs exactly what the
 * workflow activates at every key moment — which skills are AVAILABLE in the
 * system prompt, which skills the model ACTUALLY READS (the moment of
 * activation), and which tools it calls. The `/trace-skills` command shows
 * the orphan gap in real time: skills present but never loaded.
 *
 * Trigger: automatic — hooks before_agent_start, tool_call, agent_end (all
 *          READ-ONLY). No command needed to start tracing; it's always on.
 *          Use /trace to see recent activations, /trace-skills to see the
 *          orphan gap.
 *
 * Harmony contract:
 * - Owns NO axis. Registers NO tools. Hooks are READ-ONLY (before_agent_start,
 *   tool_call, agent_end — all observational, no return values that modify
 *   behavior).
 * - before_agent_start is also used by pi-hermes-memory (memory policy),
 *   pi-prompt-template-model (run-prompt guidance), pi-rewind (snapshot),
 *   guardrails.ts (rule re-injection) — all APPEND-ONLY. This handler returns
 *   nothing (pure observation). No clobbering.
 * - tool_call is also used by pi-confirm-destructive (block), loop.ts (phase
 *   gate), pi-lens (read-guard). This handler returns nothing (pure
 *   observation). No blocking, no mutation.
 * - agent_end is also used by loop.ts (phase advancement), pi-observational-
 *   memory, pi-lens. This handler returns nothing. No interference.
 * - Writes one file: ~/.pi/agent/trace-YYYY-MM-DD.jsonl (append-only, auto-
 *   pruned to retentionDays). No SQLite, no shared DBs.
 * - Registers 2 commands: /trace, /trace-skills. No shortcuts. No tools.
 *
 * <!-- scar: 2026-07-11 — 8 audits found ~72 skills discoverable but only 6
 *      force-activated via prompt skill: pins. The rest are catalog orphans.
 *      This extension makes the gap visible in real time instead of requiring
 *      a yearly manual audit. -->
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// ─── Config ─────────────────────────────────────────────────────────────────

interface TraceConfig {
	/** Days to keep trace files before auto-pruning (default 7). */
	retentionDays: number;
	/** Directory for trace files (default ~/.pi/agent). */
	logDir: string;
}

const DEFAULT_CONFIG: TraceConfig = {
	retentionDays: 7,
	logDir: "",
};

function loadConfig(): TraceConfig {
	const path = join(process.env.HOME ?? "~", ".pi", "agent", "trace.json");
	if (!existsSync(path)) {
		return {
			...DEFAULT_CONFIG,
			logDir: join(process.env.HOME ?? "~", ".pi", "agent"),
		};
	}
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<TraceConfig>;
		return {
			retentionDays: typeof raw.retentionDays === "number" ? raw.retentionDays : DEFAULT_CONFIG.retentionDays,
			logDir: typeof raw.logDir === "string" && raw.logDir.trim()
				? raw.logDir
				: join(process.env.HOME ?? "~", ".pi", "agent"),
		};
	} catch {
		return {
			...DEFAULT_CONFIG,
			logDir: join(process.env.HOME ?? "~", ".pi", "agent"),
		};
	}
}

// ─── Trace log ──────────────────────────────────────────────────────────────

interface TraceEntry {
	ts: string;
	session: string;
	type: "turn_start" | "skill_activated" | "skill_injected" | "tool_call" | "agent_end";
	[key: string]: unknown;
}

function todayLogPath(cfg: TraceConfig): string {
	const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
	return join(cfg.logDir, `trace-${date}.jsonl`);
}

function appendTrace(cfg: TraceConfig, entry: TraceEntry): void {
	try {
		const path = todayLogPath(cfg);
		appendFileSync(path, JSON.stringify(entry) + "\n", "utf-8");
	} catch {
		// Never let tracing break the agent. Silent failure.
	}
}

/** Extract the skill name from a SKILL.md path like .../skills/my-skill/SKILL.md */
function extractSkillName(skillPath: string): string {
	// .../skills/my-skill/SKILL.md → my-skill
	// .../skills/my-skill/nested/SKILL.md → my-skill (first dir after "skills")
	const parts = skillPath.split("/");
	const skillsIdx = parts.lastIndexOf("skills");
	if (skillsIdx >= 0 && skillsIdx + 1 < parts.length) {
		return parts[skillsIdx + 1];
	}
	// Fallback: use the parent directory of SKILL.md
	const idx = parts.lastIndexOf("SKILL.md");
	if (idx > 0) return parts[idx - 1];
	return skillPath;
}

// ─── Auto-prune ─────────────────────────────────────────────────────────────

function pruneOldTraceFiles(cfg: TraceConfig): number {
	try {
		const files = readdirSync(cfg.logDir).filter((f) =>
			f.startsWith("trace-") && f.endsWith(".jsonl"),
		);
		const now = Date.now();
		const maxAgeMs = cfg.retentionDays * 24 * 60 * 60 * 1000;
		let pruned = 0;
		for (const file of files) {
			const fullPath = join(cfg.logDir, file);
			try {
				const stat = statSync(fullPath);
				if (now - stat.mtimeMs > maxAgeMs) {
					unlinkSync(fullPath);
					pruned++;
				}
			} catch {
				// File may have been removed by another process — skip.
			}
		}
		return pruned;
	} catch {
		return 0;
	}
}

// ─── Trace reading (for commands) ───────────────────────────────────────────

function readTodayTrace(cfg: TraceConfig): TraceEntry[] {
	try {
		const path = todayLogPath(cfg);
		if (!existsSync(path)) return [];
		const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
		return lines.map((line) => {
			try {
				return JSON.parse(line) as TraceEntry;
			} catch {
				return null;
			}
		}).filter((e): e is TraceEntry => e !== null);
	} catch {
		return [];
	}
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function traceExtension(pi: ExtensionAPI): void {
	const cfg = loadConfig();

	// Log every turn start: what skills/tools the model sees THIS turn.
	pi.on("before_agent_start", async (event, ctx) => {
		const opts = event.systemPromptOptions;
		appendTrace(cfg, {
			ts: new Date().toISOString(),
			session: ctx.sessionManager.getSessionId(),
			type: "turn_start",
			prompt: event.prompt?.slice(0, 200),
			activeTools: Array.isArray(opts?.selectedTools) ? opts.selectedTools : [],
			loadedSkills: Array.isArray(opts?.skills) ? opts.skills.map((s) => s.name) : [],
			skillCount: Array.isArray(opts?.skills) ? opts.skills.length : 0,
			contextFiles: Array.isArray(opts?.contextFiles) ? opts.contextFiles.map((f) => f.path) : [],
			customPrompt: opts?.customPrompt?.slice(0, 100),
		});
	});

	// Track skill activations + tool calls.
	pi.on("tool_call", async (event, ctx) => {
		const toolName = event.toolName;
		const input = event.input as Record<string, unknown> | undefined;

		// Skill activation: model reads a SKILL.md (progressive disclosure).
		if (toolName === "read") {
			const path = String(input?.path ?? "");
			if (path.includes("SKILL.md")) {
				appendTrace(cfg, {
					ts: new Date().toISOString(),
					session: ctx.sessionManager.getSessionId(),
					type: "skill_activated",
					skill: extractSkillName(path),
					path,
				});
			}
		}

		// Log every tool call (lightweight — just the name + input keys).
		appendTrace(cfg, {
			ts: new Date().toISOString(),
			session: ctx.sessionManager.getSessionId(),
			type: "tool_call",
			tool: toolName,
			inputKeys: input ? Object.keys(input) : [],
		});
	});

	// Log agent end: how many messages this run produced.
	// Also detect PTM skill injection: check session entries for customType === "skill-loaded".
	// PTM emits these messages when it mechanically injects a skill via:
	//   - skill: frontmatter pin (Grade A — e.g. /build pins tdd)
	//   - /skill:name command (Grade B — e.g. /skill:to-tickets)
	// Without this check, trace.ts can only see Grade C (model reads SKILL.md via read tool).
	// With this check, trace.ts sees ALL THREE grades.
	pi.on("agent_end", async (event, ctx) => {
		// Check session entries for skill-loaded custom messages added this turn.
		// PTM emits entries with type="custom_message", customType="skill-loaded",
		// and details.{skillName, skillPath} at the TOP LEVEL of the entry.
		try {
			const branch = ctx.sessionManager.getBranch();
			const messageCount = Array.isArray(event.messages) ? event.messages.length : 0;
			// Scan recent entries for skill-loaded custom messages.
			// Only check entries near the end (this turn's additions).
			const scanStart = Math.max(0, branch.length - messageCount - 5);
			for (let i = scanStart; i < branch.length; i++) {
				const entry = branch[i] as {
					customType?: string;
					details?: { skillName?: string; skillPath?: string };
				};
				if (entry.customType === "skill-loaded" && entry.details?.skillName) {
					appendTrace(cfg, {
						ts: new Date().toISOString(),
						session: ctx.sessionManager.getSessionId(),
						type: "skill_injected",
						skill: entry.details.skillName,
						path: entry.details.skillPath ?? "",
						grade: "A_or_B",
					});
				}
			}
		} catch {
			// Session access may fail in edge cases — never break the agent.
		}

		appendTrace(cfg, {
			ts: new Date().toISOString(),
			session: ctx.sessionManager.getSessionId(),
			type: "agent_end",
			messageCount: Array.isArray(event.messages) ? event.messages.length : 0,
		});
	});

	// Session start: prune old files + set status indicator.
	pi.on("session_start", async (_event, ctx) => {
		const pruned = pruneOldTraceFiles(cfg);
		if (pruned > 0) {
			ctx.ui.notify(`trace: pruned ${pruned} old trace file(s)`, "info");
		}
		ctx.ui.setStatus("trace", ctx.ui.theme.fg("dim", "👁 trace"));
	});

	// /trace — show the last N activations from today's log.
	pi.registerCommand("trace", {
		description: "Show recent activation trace (what skills/tools the workflow invoked)",
		handler: async (args, ctx) => {
			const entries = readTodayTrace(cfg);
			if (entries.length === 0) {
				ctx.ui.notify("trace: no trace entries for today yet.", "info");
				return;
			}

			// Parse count from args (default 20).
			const n = Number.parseInt((args ?? "").trim(), 10);
			const count = Number.isNaN(n) || n <= 0 ? 20 : Math.min(n, 200);
			const recent = entries.slice(-count);

			const lines = recent.map((e) => {
				const time = e.ts.slice(11, 19); // HH:MM:SS
				switch (e.type) {
					case "turn_start":
						return `${time} TURN  skills:${e.skillCount ?? 0}  tools:${(e.activeTools as string[])?.length ?? 0}  prompt:"${(e.prompt as string)?.slice(0, 60) ?? ""}"`;
					case "skill_activated":
						return `${time} SKILL ✓ ${e.skill} (read by model)`;
					case "skill_injected":
						return `${time} SKILL ⚡ ${e.skill} (mechanically injected by PTM)`;
					case "tool_call":
						return `${time} TOOL  ${e.tool}`;
					case "agent_end":
						return `${time} END   msgs:${e.messageCount ?? 0}`;
					default:
						return `${time} ${e.type}`;
				}
			});

			ctx.ui.notify(
				`trace: last ${recent.length} activations (of ${entries.length} today)\n${lines.join("\n")}`,
				"info",
			);
		},
	});

	// /trace-skills — the orphan detector. Shows available vs activated skills.
	pi.registerCommand("trace-skills", {
		description: "Show the skill activation gap: which skills were available but never loaded (orphan detector)",
		handler: async (_args, ctx) => {
			const entries = readTodayTrace(cfg);
			if (entries.length === 0) {
				ctx.ui.notify("trace: no trace entries for today yet. Run a workflow first.", "info");
				return;
			}

			const sessionId = ctx.sessionManager.getSessionId();

			// Collect ALL skills seen in system prompt across this session's turns.
			const availableSkills = new Set<string>();
			for (const e of entries) {
				if (e.type === "turn_start" && e.session === sessionId) {
					const skills = e.loadedSkills as string[] | undefined;
					if (skills) for (const s of skills) availableSkills.add(s);
				}
			}

			// Collect all skills ACTUALLY activated this session.
			// Grade C: model read SKILL.md via read tool.
			const activatedSkills = new Set<string>();
			for (const e of entries) {
				if (e.type === "skill_activated" && e.session === sessionId) {
					activatedSkills.add(e.skill as string);
				}
				// Grade A/B: PTM mechanically injected the skill.
				if (e.type === "skill_injected" && e.session === sessionId) {
					activatedSkills.add(e.skill as string);
				}
			}

			// Compute the gap.
			const orphans = [...availableSkills]
				.filter((s) => !activatedSkills.has(s))
				.sort();
			const activated = [...activatedSkills].sort();

			const lines: string[] = [];
			lines.push(`trace-skills: session ${sessionId.slice(0, 8)}`);
			lines.push(`Available (in system prompt): ${availableSkills.size} skills`);
			lines.push(`Activated (model read SKILL.md): ${activated.length} skills`);
			lines.push(`NEVER ACTIVATED (potential orphans): ${orphans.length} skills`);

			if (activated.length > 0) {
				lines.push("");
				lines.push(`✓ Activated: ${activated.join(", ")}`);
			}

			if (orphans.length > 0) {
				lines.push("");
				lines.push(`✗ Never activated:`);
				// Show in columns of 3 for readability.
				for (let i = 0; i < orphans.length; i += 3) {
					const row = orphans.slice(i, i + 3);
					lines.push(`  ${row.join(", ")}`);
				}
			}

			if (availableSkills.size === 0) {
				lines.push("");
				lines.push("(no turn_start entries with skills found — may need a full agent turn)");
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
