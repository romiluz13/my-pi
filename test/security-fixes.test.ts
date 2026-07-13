import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStructuredOutputExtension } from "../extensions/structured-output.ts";
import { loadAgentType } from "../extensions/loop-dispatch.ts";

describe("security fixes", () => {
	it("H1: rejects schema with backtick in string value", async () => {
		await assert.rejects(
			() =>
				createStructuredOutputExtension({
					type: "object",
					properties: {
						evil: { type: "string", description: "`; process.exit(1); //" },
					},
				}),
			/unsafe characters/,
		);
	});

	it("H1: rejects schema with ${} in string value", async () => {
		await assert.rejects(
			() =>
				createStructuredOutputExtension({
					type: "object",
					properties: {
						evil: { type: "string", description: "${process.env.SECRET}" },
					},
				}),
			/unsafe characters/,
		);
	});

	it("H1: rejects schema with function value", async () => {
		await assert.rejects(
			() =>
				createStructuredOutputExtension({
					type: "object",
					properties: {
						evil: {
							type: "string",
							validate: (() => true) as unknown as never,
						},
					},
				}),
			/function/,
		);
	});

	it("H1: accepts valid schema without unsafe chars", async () => {
		const ext = await createStructuredOutputExtension({
			type: "object",
			properties: {
				status: { type: "string", enum: ["green", "red"] },
				message: { type: "string", description: "A normal description" },
			},
		});
		assert.ok(ext.path);
		ext.cleanup();
	});

	it("H2: loadAgentType rejects path traversal with ../", () => {
		const result = loadAgentType("../../etc/passwd");
		assert.equal(result, null, "path traversal should return null");
	});

	it("H2: loadAgentType rejects path traversal with absolute path", () => {
		const result = loadAgentType("/etc/passwd");
		assert.equal(result, null, "absolute path should return null");
	});

	it("H2: loadAgentType rejects names with special chars", () => {
		const result = loadAgentType("agent.md; rm -rf /");
		assert.equal(result, null, "special chars should return null");
	});

	it("H2: loadAgentType accepts valid kebab-case names", () => {
		const result = loadAgentType("build-agent");
		assert.ok(result, "valid kebab-case name should load");
		assert.equal(result?.name, "build-agent");
	});
});
