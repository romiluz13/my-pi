// loop-dispatch.ts — Sub-agent dispatch axis.
//
// Contains the logic for constructing sub-agent dispatch prompts, phase
// schemas for structured output, and agent type profile loading.
// Separated from loop.ts so it can be tested without the Pi runtime.

import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

// ─── Phase schemas for structured output ────────────────────────────────────

export const PHASE_SCHEMAS: Record<string, Record<string, unknown>> = {
	plan: {
		type: "object",
		properties: {
			planPath: {
				type: "string",
				description: "Path to the written plan file",
			},
			contract: { type: "string", description: "One-paragraph plan summary" },
			openDecisions: {
				type: "array",
				items: { type: "string" },
				description: "Unresolved questions (empty if none)",
			},
		},
		required: ["planPath", "contract", "openDecisions"],
	},
	build: {
		type: "object",
		properties: {
			status: {
				type: "string",
				enum: ["green", "red"],
				description: "green if all tests pass, red if any test fails",
			},
			command: { type: "string", description: "The exact test command run" },
			exitCode: { type: "number", description: "Numeric exit code" },
			output: { type: "string", description: "Last 20 lines of test output" },
		},
		required: ["status", "command", "exitCode", "output"],
	},
	review: {
		type: "object",
		properties: {
			findings: {
				type: "array",
				items: {
					type: "object",
					properties: {
						severity: {
							type: "string",
							enum: ["critical", "high", "medium", "low"],
						},
						file: { type: "string" },
						line: { type: "number" },
						issue: { type: "string" },
						recommendation: { type: "string" },
					},
				},
			},
			severity: {
				type: "string",
				enum: ["critical", "high", "medium", "low", "none"],
			},
			verdict: { type: "string", enum: ["approve", "changes-requested"] },
		},
		required: ["findings", "severity", "verdict"],
	},
	verify: {
		type: "object",
		properties: {
			score: { type: "number", description: "0-10 (10 = all claims verified)" },
			converged: { type: "boolean", description: "true if score >= 8" },
			honestyHits: {
				type: "array",
				items: { type: "string" },
				description: "Unverified or false claims",
			},
			evidence: {
				type: "string",
				description: "Literal command + output proving score",
			},
		},
		required: ["score", "converged", "honestyHits", "evidence"],
	},
	ship: {
		type: "object",
		properties: {
			commitHash: { type: "string", description: "Git commit hash (40 chars)" },
			pushed: { type: "boolean", description: "true if pushed to remote" },
			prUrl: {
				type: "string",
				description: "PR URL if created, empty string if not",
			},
		},
		required: ["commitHash", "pushed", "prUrl"],
	},
};

// ─── Agent type profiles ────────────────────────────────────────────────────

export interface AgentType {
	name: string;
	description: string;
	tools: string[];
	model: string;
	body: string;
}

const AGENTS_DIR = path.join(homedir(), ".pi", "agent", "agents");

export function loadAgentType(name: string): AgentType | null {
	// Sanitize name — prevent path traversal (H2 fix)
	if (!/^[a-z0-9-]+$/.test(name)) return null;
	const filePath = path.join(AGENTS_DIR, `${name}.md`);
	if (!fs.existsSync(filePath)) return null;

	const raw = fs.readFileSync(filePath, "utf-8");
	// Parse YAML frontmatter
	const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!frontmatterMatch) return null;

	const frontmatter = frontmatterMatch[1];
	const body = frontmatterMatch[2];

	const get = (key: string): string => {
		const prefix = `${key}:`;
		for (const line of frontmatter.split("\n")) {
			if (line.startsWith(prefix)) {
				return line.substring(prefix.length).trim();
			}
		}
		return "";
	};

	return {
		name: get("name") || name,
		description: get("description"),
		tools: get("tools")
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean),
		model: get("model") || "inherit",
		body,
	};
}

// ─── Dispatch prompt construction ───────────────────────────────────────────

export interface DispatchPromptParams {
	phase: string;
	request: string;
	planPath: string;
	workflowUuid: string;
	iteration: number;
	skillContent?: string;
	reviewFindings?: string;
	verifyScore?: number;
}

export function buildDispatchPrompt(params: DispatchPromptParams): string {
	const parts: string[] = [];

	// Skill content first (procedure before task)
	if (params.skillContent) {
		parts.push(params.skillContent);
	}

	// Task context
	parts.push(`## Task Context`);
	parts.push(`- Task: ${params.request}`);
	parts.push(`- Phase: ${params.phase.toUpperCase()}`);
	parts.push(`- Iteration: ${params.iteration}`);
	parts.push(`- Plan File: ${params.planPath}`);
	parts.push(`- Workflow ID: ${params.workflowUuid}`);
	parts.push("");

	// Phase-specific instructions
	if (params.phase === "plan") {
		parts.push(
			"Read the repo state and produce a plan at " + params.planPath + ".",
		);
		parts.push("Call emit_result with your structured plan result.");
	} else if (params.phase === "build") {
		parts.push(
			"Read the plan at " + params.planPath + " and implement it using TDD.",
		);
		parts.push(
			"Run the test suite and capture the exact command + exit code + output.",
		);
		parts.push("Call emit_result with your structured build result.");
	} else if (params.phase === "review") {
		parts.push(
			"Read the diff (git diff or git log -p) and review the changes.",
		);
		parts.push("Find concrete issues with file:line citations.");
		parts.push("Call emit_result with your structured review findings.");
	} else if (params.phase === "verify") {
		parts.push("Independently verify every claim from prior phases.");
		parts.push("Run the test command yourself. Read the full output.");
		parts.push("Call emit_result with your structured verification score.");
		if (params.verifyScore !== undefined) {
			parts.push(`Previous verify score: ${params.verifyScore}. Improve it.`);
		}
	} else if (params.phase === "ship") {
		parts.push(
			"Run the project's test/lint/typecheck command. Confirm it passes.",
		);
		parts.push("Commit, push, and create a PR if applicable.");
		parts.push("Call emit_result with the commit hash and push status.");
	}

	if (params.reviewFindings) {
		parts.push("");
		parts.push("## Review findings to address:");
		parts.push(params.reviewFindings);
	}

	parts.push("");
	parts.push(
		"Remember: dispatch by reference — read files, don't paste file bodies.",
	);

	return parts.join("\n");
}

// No-op Pi extension factory — this file is a library module imported by loop.ts,
// not a standalone extension. Pi requires a default export to load without error.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (_pi: any) {
	/* library module — no hooks */
}
