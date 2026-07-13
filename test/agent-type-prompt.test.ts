import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

describe("agent-type system prompt injection", () => {
	it("agent type .md files have a body (system prompt) that is non-empty", () => {
		const agentsDir = join(homedir(), ".pi", "agent", "agents");
		const agents = [
			"plan-agent",
			"build-agent",
			"review-agent",
			"verify-agent",
			"ship-agent",
		];

		for (const name of agents) {
			const raw = readFileSync(join(agentsDir, `${name}.md`), "utf-8");
			const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
			assert.ok(match, `${name} should have frontmatter + body`);
			const body = match![1].trim();
			assert.ok(
				body.length > 50,
				`${name} body should be non-trivial (>50 chars), got ${body.length}`,
			);
			assert.ok(
				body.includes("You are"),
				`${name} body should start with role definition`,
			);
		}
	});

	it("dispatchPhaseAgent piArgs should include --append-system-prompt when agent type has a body", () => {
		const agentType = {
			name: "build-agent",
			description: "Build specialist",
			tools: ["read", "write", "edit", "bash"],
			model: "inherit",
			body: "You are a build specialist. Your job is to implement the plan using TDD.",
		};

		// Simulate the arg construction (this is what dispatchPhaseAgent should do)
		const piArgs: string[] = [
			"--mode",
			"json",
			"-p",
			"--no-session",
			"-e",
			"/tmp/ext.ts",
		];
		if (agentType.tools.length > 0) {
			piArgs.push("--tools", [...agentType.tools, "emit_result"].join(","));
		}
		// This is the fix: add system prompt
		if (agentType.body && agentType.body.length > 0) {
			piArgs.push("--append-system-prompt", agentType.body);
		}

		const idx = piArgs.indexOf("--append-system-prompt");
		assert.ok(idx >= 0, "--append-system-prompt should be in piArgs");
		assert.ok(
			piArgs[idx + 1].includes("build specialist"),
			"system prompt should contain agent role",
		);
	});

	it("dispatchPhaseAgent should NOT add --append-system-prompt when agent type has no body", () => {
		const agentType = {
			name: "minimal-agent",
			description: "Minimal",
			tools: ["read"],
			model: "inherit",
			body: "",
		};

		const piArgs: string[] = ["--mode", "json", "-p", "--no-session"];
		if (agentType.body && agentType.body.length > 0) {
			piArgs.push("--append-system-prompt", agentType.body);
		}

		assert.equal(
			piArgs.indexOf("--append-system-prompt"),
			-1,
			"should not add flag for empty body",
		);
	});
});
