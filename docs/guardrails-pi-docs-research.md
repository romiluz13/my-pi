# Research: Pi-native mechanisms to enforce AGENTS.md / context-file rule compliance

## Summary

Pi has **no built-in AGENTS.md compliance enforcement** — `AGENTS.md` (and `CLAUDE.md`) are loaded as `contextFiles` and concatenated into the system prompt as prose, then re-sent every turn. That is purely instruction-level, so the known failure ("I didn't pay attention to AGENTS.md") is expected: compaction can drop it, weak models ignore it, and nothing re-verifies it. The smartest Pi-native fix is to move enforcement out of prose and into **tool-level hooks**: use `before_agent_start` to re-inject a hard rules block every turn (prominence + compaction survival), `tool_call` returning `{ block: true, reason }` to physically stop violating writes/bash, `event.systemPromptOptions.contextFiles` to verify AGENTS.md was actually loaded, and `ctx.getSystemPrompt()` to confirm the rules survived compaction. This is the exact pattern used by the community `pi-context-enforcer` extension.

---

## Findings

### (1) Built-in AGENTS.md compliance? No — prose only.

- Pi loads `AGENTS.md` / `CLAUDE.md` regardless of project trust (they are "context files" loaded even before trust is resolved) and feeds them into `BuildSystemPromptOptions.contextFiles` (`Array<{ path: string; content: string }>`). [`system-prompt.d.ts`](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.d.ts); [security.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)
- `buildSystemPrompt(options)` concatenates those files' `content` into the system prompt string. There is no validator, no gate, no "did the model follow the rules" check in core. The system prompt is rebuilt each turn from `systemPromptOptions`, so context files survive normal turns, but **compaction** (`/compact`, threshold, overflow) replaces the message history with a summary and the rules only persist if they're still in the rebuilt system prompt — prose rules inside user/assistant messages are lost. [`extensions.md` §session_before_compact](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md); [`session-format.md` §CompactionEntry](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md)
- Conclusion: compliance is **purely prose-in-system-prompt**. Any enforcement must be added via an extension. This is confirmed by the community extension's framing: "Write instructions in `AGENTS.md` and a cheap model ignores them. A frontier model follows them for a while, then forgets mid-session." [pi-context-enforcer README](https://github.com/guyinwonder168/pi-context-enforcer)

### (2) `before_agent_start` — exact signature for re-injecting a rules block every turn.

Fires after the user submits a prompt, before the agent loop, **every prompt**. Signature from `types.d.ts`:

```ts
export interface BeforeAgentStartEvent {
  type: "before_agent_start";
  prompt: string;
  images?: ImageContent[];
  systemPrompt: string;                 // chained prompt (earlier handlers' edits visible)
  systemPromptOptions: BuildSystemPromptOptions;
}
export interface BeforeAgentStartEventResult {
  message?: Pick<CustomMessage, "customType" | "content" | "display" | "details">;
  systemPrompt?: string;                // REPLACE the system prompt for this turn (chained)
}
// registration:
pi.on("before_agent_start", handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>)
```

Smartest re-injection pattern (verbatim from `pi-context-enforcer/extensions/index.ts`):

```ts
pi.on("before_agent_start", async (event) => {
  if (loadedContexts.size > 0) return;          // optional: skip once gate satisfied
  return {
    systemPrompt:
      event.systemPrompt +                       // append, don't replace — keep Pi's base
      "\n\n## ⚡ MANDATORY: Load Context Before Execution\n\n" +
      "Before any write/edit/bash, call `read_context()` ... Enforced at system level — BLOCKED otherwise.\n",
  };
});
```

Why this is the smartest place: (a) it runs every turn so the rules are **re-prominent** at the top of context each time, defeating mid-session forgetting; (b) it survives compaction because Pi **rebuilds** the system prompt from `systemPromptOptions` after compaction and re-runs `before_agent_start` on the retried turn (compaction aborts the in-flight turn and `willRetry: true` re-enters the loop → `before_agent_start` fires again). (c) `event.systemPrompt` is the chained value, so multiple enforcers compose without clobbering. [`extensions.md` §before_agent_start + §session_before_compact](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)

### (3) `tool_call` — exact return shape to BLOCK a violating call.

From `types.d.ts`:

```ts
export interface ToolCallEventResult {
  /** Block tool execution. To modify arguments, mutate `event.input` in place instead. */
  block?: boolean;
  reason?: string;
}
```

Returning `{ block: true, reason: "..." }` prevents execution and feeds `reason` back to the LLM as the tool error. This is the **only** sanctioned way to stop a violating tool call; return values otherwise only control blocking (argument mutation is done by mutating `event.input` in place, which later handlers see and which is NOT re-validated). Working pattern from `pi-context-enforcer`:

```ts
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName !== "write" && event.toolName !== "edit" && event.toolName !== "bash") return;
  // ...derive requiredContext from event.input.filePath / event.input.command...
  if (!loadedContexts.has(requiredContext)) {
    ctx.ui.notify(`⚠️ Blocked ${event.toolName}: load '${requiredContext}' context first`, "warning");
    return {
      block: true,
      reason: `Context '${requiredContext}' not loaded yet. Call read_context({ context_type: "${requiredContext}" }) first, then retry.`,
    };
  }
});
```

Use `isToolCallEventType("bash"|"read"|"write"|"edit", event)` to get typed `event.input` (direct `event.toolName === "bash"` narrowing does NOT work because `CustomToolCallEvent.toolName` is `string`). Note: in parallel tool mode, sibling tool calls are preflighted sequentially and `tool_call` is **not** guaranteed to see sibling results in `ctx.sessionManager`. [`extensions.md` §tool_call](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md); `types.d.ts` `ToolCallEventResult`/`isToolCallEventType`

### (4) Can `before_agent_start` read `event.systemPromptOptions.contextFiles` to verify AGENTS.md was loaded? **Yes.**

`BeforeAgentStartEvent.systemPromptOptions: BuildSystemPromptOptions` exposes:

```ts
export interface BuildSystemPromptOptions {
  customPrompt?: string;
  selectedTools?: string[];
  toolSnippets?: Record<string, string>;
  promptGuidelines?: string[];
  appendSystemPrompt?: string;
  cwd: string;
  contextFiles?: Array<{ path: string; content: string }>;   // ← AGENTS.md lives here
  skills?: Skill[];
}
```

So an enforcer can assert AGENTS.md was actually loaded and abort/inject if missing:

```ts
pi.on("before_agent_start", async (event) => {
  const agents = event.systemPromptOptions.contextFiles?.find(f => /AGENTS\.md$/.test(f.path));
  if (!agents) {
    ctx.ui.notify("⚠️ AGENTS.md not loaded — injecting fallback rules", "warning");
    return { systemPrompt: event.systemPrompt + "\n\n## RULES (AGENTS.md missing)\n..." };
  }
  // optionally re-affirm the loaded rules verbatim each turn:
  return { systemPrompt: event.systemPrompt + "\n\n## HARD RULES (from " + agents.path + ")\n" + agents.content };
});
```

`ExtensionCommandContext.getSystemPromptOptions()` exposes the same shape inside command handlers. `contextFiles` may include full file contents — treat as sensitive. [`system-prompt.d.ts`](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.d.ts); [`extensions.md` §ExtensionCommandContext.getSystemPromptOptions + §before_agent_start](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)

### (5) `turn_end` / `agent_end` for a "did it follow the rules?" check? **Yes, both exist** (notification-only — they cannot block retroactively).

```ts
export interface TurnEndEvent { type: "turn_end"; turnIndex: number; message: AgentMessage; toolResults: ToolResultMessage[]; }
export interface AgentEndEvent { type: "agent_end"; messages: AgentMessage[]; }
```

Both are `ExtensionHandler<...>` with no result type (return value ignored) — so they can **observe and surface** violations (notify, log, append a `CustomMessage` to the session via `pi.sendMessage(..., { deliverAs: "steer" | "followUp" })` to re-steer the model, or `pi.appendEntry` for state) but **cannot block** the already-executed call. The blocking happens upstream in `tool_call`; `turn_end` is the place for a post-hoc compliance audit ("you called write without read_context — re-running with the gate"). [`types.d.ts` TurnEndEvent/AgentEndEvent + §turn_start/turn_end in extensions.md](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)

A full "verify the rules are still in the prompt after compaction" check is best done in `session_compact` (post-compaction) or `before_agent_start` (next turn) using `ctx.getSystemPrompt()`, not `turn_end`.

### (6) Does `getSystemPrompt()` let an extension verify the rules survived compaction? **Yes, with caveats.**

`ExtensionContext.getSystemPrompt(): string` returns Pi's current effective system prompt string. Documented behavior:
- During `before_agent_start`, reflects chained system-prompt changes made so far for the current turn.
- Does **not** include later `context` message mutations.
- Does **not** include `before_provider_request` payload rewrites.
- Later-loaded extensions can still change what is ultimately sent.

So the correct compaction-survival verification flow is:

```ts
pi.on("session_compact", async (_e, ctx) => {
  const sp = ctx.getSystemPrompt();              // post-compaction rebuilt prompt
  if (!/HARD RULES/.test(sp)) {
    ctx.ui.notify("⚠️ Rules dropped after compaction — will re-inject next turn", "warning");
  }
});
pi.on("before_agent_start", async (event, ctx) => {
  // re-inject unconditionally each turn — guarantees survival regardless of getSystemPrompt() result
  return { systemPrompt: event.systemPrompt + RULES_BLOCK };
});
```

The robust answer: **don't rely on inspecting** — re-inject every `before_agent_start` so the rules are always present by construction. Use `getSystemPrompt()` only as a belt-and-suspenders audit. [`extensions.md` §ctx.getSystemPrompt() + §before_provider_request caveat](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)

### (7) Official Pi recommendation for "agent ignores my rules"?

Searched docs + README for *ignore / compliance / enforce / guardrail / rule*:
- **No official "agent ignores rules" troubleshooting entry** in `extensions.md`, `settings.md`, `sessions.md`, `session-format.md`, or `security.md`. The docs describe the *mechanism* (context files → system prompt) but not a remedy for non-compliance.
- The closest official guidance is the extensions docs themselves, which explicitly list "Permission gates (confirm before `rm -rf`, `sudo`, etc.)", "Path protection (block writes to `.env`, `node_modules/`)", and "Custom compaction (summarize conversation your way)" as example use cases — i.e. Pi's sanctioned answer to "the model might do the wrong thing" is **tool-level interception via `tool_call` + `before_agent_start`**, not stronger prose. [`extensions.md` §Example use cases + §Quick Start](file:///Users/rom.iluz/.local/share/mise/installs/node/24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)
- The only purpose-built artifact in the ecosystem is the third-party **`pi-context-enforcer`** package, which operationalizes exactly this: "Tool-level enforcement, not instruction-level... No amount of rationalization bypasses it." Installable via `pi install git:github.com/guyinwonder168/pi-context-enforcer`. [README](https://github.com/guyinwonder168/pi-context-enforcer); source verified at `/tmp/pi-github-repos/guyinwonder168/pi-context-enforcer/extensions/index.ts`

---

## The smartest Pi-native enforcement stack (recommendation)

Combine four hooks — prose for prominence, tools for hard enforcement:

1. **`before_agent_start`** (every turn): append a `## HARD RULES` block to `event.systemPrompt`. Pull the canonical text from `event.systemPromptOptions.contextFiles` (the AGENTS.md entry) so it's always the source of truth and survives compaction by construction.
2. **`tool_call`** for `write`/`edit`/`bash`: return `{ block: true, reason }` for violations (e.g. writing outside allowed paths, skipping a mandatory `read_context`/TDD gate, touching `.env`). This is unbypassable by any model.
3. **`session_compact`** + **`ctx.getSystemPrompt()`**: audit that the rules survived; re-inject on the next `before_agent_start` if dropped (redundant if step 1 always re-injects, but cheap insurance).
4. **`turn_end`** / **`agent_end`**: post-hoc compliance audit — log violations, `pi.sendMessage(..., { deliverAs: "steer" })` to re-steer, or `pi.appendEntry` to persist audit state. Cannot block retroactively.

Optional hardening:
- `pi.registerTool({ name: "read_context", promptGuidelines: [...] })` — force the model to load rules via a tool the enforcer controls (the `pi-context-enforcer` pattern). `promptGuidelines` bullets are appended to the default Guidelines section, so they're always visible.
- `before_provider_request` to rewrite/strip provider-level system instructions if a provider injects conflicting guidance (advanced; changes are NOT visible to `getSystemPrompt()`).
- `session_before_compact` with `customInstructions` to ensure the summarizer preserves the rule set.

This moves compliance from "hope the model reads the prose" to "the tool physically will not execute," which is the only reliable fix across cheap and frontier models alike.

---

## Sources
- Kept: `dist/core/extensions/types.d.ts` — authoritative type signatures for every hook (`BeforeAgentStartEvent`, `ToolCallEventResult`, `TurnEndEvent`, `isToolCallEventType`, `ExtensionContext.getSystemPrompt`, `BuildSystemPromptOptions` import).
- Kept: `dist/core/system-prompt.d.ts` — `BuildSystemPromptOptions.contextFiles: Array<{path, content}>` shape (proves AGENTS.md is reachable from `before_agent_start`).
- Kept: `docs/extensions.md` — lifecycle, hook semantics, `before_agent_start` systemPrompt chaining, `tool_call` block guarantee, `getSystemPrompt()` caveats, `before_provider_request` payload-rewrite note.
- Kept: `docs/settings.md`, `docs/sessions.md`, `docs/session-format.md` — compaction entry shape + `willRetry` behavior, trust flow confirming AGENTS.md loads regardless of trust.
- Kept: `docs/security.md` (web) — "AGENTS.md and CLAUDE.md context files are loaded regardless of project trust."
- Kept: `pi-context-enforcer/extensions/index.ts` (cloned to `/tmp/pi-github-repos/...`) — working reference implementation using exactly `session_start` + `tool_call` (block) + `before_agent_start` (re-inject) + a `read_context` registered tool.
- Dropped: generic `pi-mono` README and `system-prompt.ts` source link — duplicate of the local `.d.ts` already read.

## Gaps
- No controlled benchmark quantifying how often AGENTS.md rules are dropped after compaction vs. ignored by specific models; the failure is documented anecdotally (community extension README) not measured in Pi's own docs.
- `isProjectTrusted()` interaction with `contextFiles` for AGENTS.md specifically: docs say AGENTS.md loads regardless of trust, but an enforcer that *also* reads project-local skills should still gate on `ctx.isProjectTrusted()`.
- The exact point at which `before_agent_start` re-fires after overflow-compaction is inferred from `willRetry: true` semantics; not explicitly stated as "before_agent_start re-fires on retry." Worth a one-line empirical check (log `turnIndex`/`prompt` on the retried turn).
- Suggested next steps: write a minimal `~/.pi/agent/extensions/rules-enforcer.ts` implementing steps 1–3 above and test against a known-violating prompt (e.g. "write to .env") with a cheap model to confirm the block fires.

## Supervisor coordination
None needed — research-only task, no decision points. Returning the brief directly.
