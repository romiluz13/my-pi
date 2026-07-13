// structured-output.ts — Structured returns axis.
//
// Generates a temporary Pi extension that registers an `emit_result` tool with
// a caller-supplied JSON schema. The sub-agent MUST call this tool to return
// its result. Pi validates the arguments against the schema and retries the
// model on validation errors. The parent extracts the final `emit_result` call
// arguments as structured data.
//
// Inspired by pi-dynamic-workflow (milanglacier) — same mechanism, adapted for
// auto-pi's loop engine.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const EMIT_RESULT_TOOL = "emit_result";

export interface StructuredOutputExtension {
	/** Path to the generated extension file (pass to `pi -e`). */
	path: string;
	/** Remove the temp file and directory. */
	cleanup(): void;
}

/**
 * Generate a temporary Pi extension that registers an `emit_result` tool with
 * the given JSON schema. The sub-agent must call this tool as its final action.
 * Pi validates the tool call arguments against the schema.
 */
/**
 * Validate that a schema is a plain JSON Schema object with no string values
 * that could escape the JSON.stringify embedding (H1 fix — schema injection).
 */
function validateSchema(schema: unknown, depth = 0): void {
	if (depth > 10) throw new Error("Schema nesting too deep");
	if (typeof schema !== "object" || schema === null) {
		throw new Error("Schema must be an object");
	}
	for (const [key, val] of Object.entries(schema as Record<string, unknown>)) {
		if (typeof val === "string") {
			// Strings are embedded via JSON.stringify — safe as long as they're
			// actual strings (JSON.stringify escapes quotes/backslashes).
			// But reject strings containing template-literal delimiters just in case.
			if (val.includes("`") || val.includes("${")) {
				throw new Error(
					`Schema string at key "${key}" contains unsafe characters`,
				);
			}
		} else if (typeof val === "object" && val !== null) {
			validateSchema(val, depth + 1);
		} else if (typeof val === "function") {
			throw new Error(`Schema contains function at key "${key}"`);
		}
	}
}

export async function createStructuredOutputExtension(
	schema: Record<string, unknown>,
): Promise<StructuredOutputExtension> {
	validateSchema(schema);
	const dir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "auto-pi-schema-"),
	);
	const filePath = path.join(dir, "structured-output.ts");

	const source = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const schema = ${JSON.stringify(schema, null, "\t")} as const;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "${EMIT_RESULT_TOOL}",
    label: "Emit Result",
    description:
      "Emit the final structured result for this task. Call this exactly once, as your last action, with the complete answer matching the required schema.",
    promptSnippet: "Emit the final structured result (required last action)",
    parameters: schema,
    async execute(_toolCallId: string, params: unknown) {
      return {
        content: [{ type: "text", text: JSON.stringify(params) }],
        details: {},
      };
    },
  });
}
`;

	await fs.promises.writeFile(filePath, source, "utf-8");

	return {
		path: filePath,
		cleanup() {
			try {
				rmSyncRecursive(dir);
			} catch {
				/* best effort */
			}
		},
	};
}

function rmSyncRecursive(dir: string): void {
	if (!fs.existsSync(dir)) return;
	for (const entry of fs.readdirSync(dir)) {
		const fullPath = path.join(dir, entry);
		if (fs.statSync(fullPath).isDirectory()) {
			rmSyncRecursive(fullPath);
		} else {
			fs.unlinkSync(fullPath);
		}
	}
	fs.rmdirSync(dir);
}

// No-op Pi extension factory — this file is a library module imported by loop.ts,
// not a standalone extension. Pi requires a default export to load without error.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (_pi: any) {
	/* library module — no hooks */
}
