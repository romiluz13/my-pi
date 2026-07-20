/**
 * Session Status — lightweight cross-session visibility.
 *
 * Inspired by FirstMate's "bearings" + Herdr's agent status sidebar.
 * Writes a JSONL line on every agent_start/agent_end so any session can
 * see what every other session is doing. Zero dependencies, zero npm.
 *
 * Writes to ~/.pi/agent/session-status.jsonl (append-only, auto-pruned to
 * last 100 lines). The /bearings command reads this to produce the digest.
 *
 * Harmony contract:
 * - Owns ONE axis: cross-session status visibility.
 * - Hooks agent_start (write "working"), agent_end (write "idle"), agent_settled (write "settled").
 * - Does NOT register tools (except /bearings command). Does NOT block. Does NOT touch session storage.
 * - Composes with all other extensions (additive status writes).
 */

import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_FILE = join(homedir(), ".pi", "agent", "session-status.jsonl");
const DECISIONS_FILE = join(homedir(), ".pi", "agent", "decisions.json");
const MAX_LINES = 100;

interface StatusEntry {
	sessionId: string;
	project: string;
	task: string;
	status: "working" | "idle" | "settled";
	phase?: string;
	ts: string;
}

function pruneStatusFile(): void {
	try {
		if (!existsSync(STATUS_FILE)) return;
		const lines = readFileSync(STATUS_FILE, "utf-8").trim().split("\n");
		if (lines.length > MAX_LINES) {
			writeFileSync(STATUS_FILE, lines.slice(-MAX_LINES).join("\n") + "\n");
		}
	} catch {
		// fail silently — status is best-effort
	}
}

function writeStatus(entry: StatusEntry): void {
	try {
		appendFileSync(STATUS_FILE, JSON.stringify(entry) + "\n");
	} catch {
		// fail silently
	}
}

function getProject(cwd: string): string {
	return cwd.split("/").pop() ?? cwd;
}

export default function sessionStatusExtension(pi: ExtensionAPI): void {
	pi.on("agent_start", async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId();
		const cwd = ctx.cwd ?? process.cwd();
		writeStatus({
			sessionId,
			project: getProject(cwd),
			task: "(active)",
			status: "working",
			ts: new Date().toISOString(),
		});
		pruneStatusFile();
	});

	pi.on("agent_settled", async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId();
		const cwd = ctx.cwd ?? process.cwd();
		writeStatus({
			sessionId,
			project: getProject(cwd),
			task: "(active)",
			status: "settled",
			ts: new Date().toISOString(),
		});
	});

	// /bearings command — read all session states + produce digest
	pi.registerCommand("bearings", {
		description:
			"Show what's happening across all active Pi sessions (pick up where you left off)",
		handler: async (_args, ctx) => {
			try {
				if (!existsSync(STATUS_FILE)) {
					ctx.ui.notify("No session status recorded yet.", "info");
					return;
				}
				const lines = readFileSync(STATUS_FILE, "utf-8").trim().split("\n");
				// Keep only the latest status per sessionId
				const latestBySession = new Map<string, StatusEntry>();
				for (const line of lines) {
					try {
						const entry = JSON.parse(line) as StatusEntry;
						latestBySession.set(entry.sessionId, entry);
					} catch {
					}
				}
				const sessions = [...latestBySession.values()];
				const working = sessions.filter((s) => s.status === "working");
				const settled = sessions.filter((s) => s.status === "settled");

				// Read open decisions
				let decisionsCount = 0;
				if (existsSync(DECISIONS_FILE)) {
					try {
						const decisions = JSON.parse(readFileSync(DECISIONS_FILE, "utf-8"));
						decisionsCount = Array.isArray(decisions)
							? decisions.filter((d: { resolved?: boolean }) => !d.resolved).length
							: 0;
					} catch {
						// fail silently
					}
				}

				// Build the 4-section digest
				const sections: string[] = [];
				sections.push("## Bearings — " + new Date().toISOString().slice(0, 10));
				sections.push("");

				// Your Call
				sections.push("### Your Call");
				if (decisionsCount > 0) {
					sections.push(`${decisionsCount} open decision(s) need your input. Run /decisions to see them.`);
				} else {
					sections.push("Nothing needs your action right now.");
				}
				sections.push("");

				// Recently Landed
				sections.push("### Recently Landed");
				sections.push("Check `git log --oneline -5` in each active project for recent commits.");
				sections.push("");

				// Underway
				sections.push("### Underway");
				if (working.length > 0) {
					for (const s of working) {
						sections.push(`- ${s.project} — ${s.status} (${s.sessionId.slice(0, 8)})`);
					}
				} else if (settled.length > 0) {
					for (const s of settled) {
						sections.push(`- ${s.project} — settled (${s.sessionId.slice(0, 8)})`);
					}
				} else {
					sections.push("Nothing is underway.");
				}
				sections.push("");

				// Charted Next
				sections.push("### Charted Next");
				// Check for active loop workflows
				const workflowsDir = join(homedir(), ".pi", "workflows");
				let queuedCount = 0;
				try {
					if (existsSync(workflowsDir)) {
						const { readdirSync } = require("node:fs");
						for (const f of readdirSync(workflowsDir) as string[]) {
							if (f.endsWith(".json")) {
								const wf = JSON.parse(
									readFileSync(join(workflowsDir, f), "utf-8"),
								);
								if (wf.status && wf.status !== "done" && wf.status !== "rejected") {
									queuedCount++;
								}
							}
						}
					}
				} catch {
					// fail silently
				}
				if (queuedCount > 0) {
					sections.push(`${queuedCount} active loop workflow(s). Run /loop-status for details.`);
				} else {
					sections.push("Nothing is queued.");
				}

				ctx.ui.notify(sections.join("\n"), "info");
			} catch (err) {
				ctx.ui.notify(`bearings error: ${err}`, "warning");
			}
		},
	});
}
