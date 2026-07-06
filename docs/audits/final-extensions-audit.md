# Pi Extensions Audit — 5 Custom Extensions

Date: 2026-07-07
Reviewer: independent review subagent
Scope: `~/.pi/agent/extensions/{coach,loop,guardrails,palette,handoff}.ts`
Reference docs: `docs/extensions.md`, `dist/core/extensions/types.d.ts`, `dist/core/slash-commands.d.ts`, `dist/core/session-manager.d.ts`, `dist/core/system-prompt.d.ts`

---

## Per-Extension Verdicts

### 1. coach.ts — NEEDS-FIX

**Hook/event signature verification:**
- `pi.on("input", handler)` → `ExtensionHandler<InputEvent, InputEventResult>` (types.d.ts:853). ✓
- `InputEventResult` = `{action:"continue"} | {action:"transform", text, images?} | {action:"handled"}` (types.d.ts:616-624). coach returns `{action:"continue"}` and `{action:"transform", text}`. ✓
- `InputEvent.source` = `"interactive" | "rpc" | "extension"` (types.d.ts:603). coach skips `source === "extension"`. ✓
- `ctx.ui.select(title, options)` → `Promise<string | undefined>` (types.d.ts:69). ✓
- `ctx.ui.setStatus`, `ctx.ui.notify`, `ctx.ui.theme.fg` — all on `ExtensionUIContext`. ✓
- `pi.registerCommand("coach", {description, handler})` — handler receives `(args: string, ctx: ExtensionCommandContext)`. ✓

**BUG (coach.ts:265-273): `/coach test <sample>` is unreachable.**
```ts
const sub = (args ?? "").trim().toLowerCase();   // full lowercased arg
if (sub === "off") { ... }
if (sub === "on")  { ... }
if (sub === "test") {                              // only matches exact "/coach test"
    const sample = (args ?? "").replace(/^test\s*/i, "").trim();
    ...
}
```
`sub` is the **entire** lowercased arg string. `/coach test build a web app` → `sub = "test build a web app"` → `sub === "test"` is false → falls through to the default usage message. The test feature can never classify a sample — it only ever shows "Usage: /coach test <your task>".

**Fix:** `if (sub === "test" || sub.startsWith("test "))` — one-line change, enables the documented feature.

**Note (coach.ts:101-104): classify() misroutes "push the button" → ship.**
`/^(ship|commit|pr|push|release)($|\b)/` matches any sentence starting with "push", including non-git contexts. Edge case — low impact since the user can pick "just do it" from the select dialog.

**Note (coach.ts:118-123): `words.length > 6` catch-all routes long questions to build.**
Questions that don't start with what/why/how/explain/etc. AND are >6 words default to `build` intent. E.g., "should I use redux or zustand for this" (8 words, no exploration prefix) → build. The user can override via the dialog, so not a blocker.

---

### 2. loop.ts — NEEDS-FIX (BLOCKER)

**Hook/event signature verification:**
- `pi.on("tool_call", handler)` → `ExtensionHandler<ToolCallEvent, ToolCallEventResult>` (types.d.ts:850). ✓
- `ToolCallEventResult` = `{block?: boolean, reason?: string}` (types.d.ts:753-756). loop returns `{block: true, reason: "..."}`. ✓
- `pi.on("agent_end", handler)` → `ExtensionHandler<AgentEndEvent>` (types.d.ts:839). ✓ (handler ignores event, uses `ctx.sessionManager.getBranch()` — `getBranch` is on `ReadonlySessionManager`, types.d.ts:242). ✓
- `pi.on("session_before_compact", handler)` → `ExtensionHandler<SessionBeforeCompactEvent, SessionBeforeCompactResult>` (types.d.ts:829). Handler returns `undefined` — valid (`ExtensionHandler` allows `void`). ✓
- `pi.registerCommand`, `pi.registerShortcut(Key.ctrlShift("l"), ...)` — correct. ✓
- `pi.getActiveTools()`, `pi.setActiveTools(string[])` — on `ExtensionAPI` (types.d.ts:901-903). ✓

**BLOCKER BUG (loop.ts:234): `steer()` calls `ctx.ui.sendUserMessage()` — this method does NOT exist.**
```ts
async function steer(ctx: ExtensionContext, message: string): Promise<void> {
    await ctx.ui.sendUserMessage(message, { deliverAs: "steer" });
}
```
- `ExtensionUIContext` (types.d.ts:67-127) has: `select`, `confirm`, `input`, `notify`, `setStatus`, `setEditorText`, `custom`, `theme`, etc. **No `sendUserMessage`.**
- `ExtensionContext` (types.d.ts:208-247) has: `ui`, `mode`, `cwd`, `sessionManager`, `getSystemPrompt`, etc. **No `sendUserMessage`.**
- `sendUserMessage` exists on `ExtensionAPI` (types.d.ts:882-884) and `ReplacedSessionContext` (types.d.ts:257-260, only inside `withSession` callbacks).
- Docs (extensions.md:1376-1392): `pi.sendUserMessage(content, options?)` — documented on `pi`, never on `ctx.ui`.

The `steer` function is the **core steering mechanism** of the loop engine — every phase transition calls it. If `ctx.ui.sendUserMessage` is not a real runtime method, the loop cannot steer at all: it would throw `TypeError: ctx.ui.sendUserMessage is not a function` on the first phase transition.

**Fix:** Capture `pi` at module level (like `active` is module-scoped) and call `pi.sendUserMessage(message, { deliverAs: "steer" })`. The `steer` function needs `pi`, not just `ctx`:
```ts
let api: ExtensionAPI | null = null;  // set in loopEngineExtension()

async function steer(ctx: ExtensionContext, message: string): Promise<void> {
    if (!api) return;
    await api.sendUserMessage(message, { deliverAs: "steer" });
}
```
Or pass `pi` through `runLoop` → `steer`. Either way, `ctx.ui.sendUserMessage` → `pi.sendUserMessage`.

**BUG (loop.ts:592): `ship` phase signal `[0-9a-f]{7,40}` is too loose.**
```ts
ship: /\bcommit\b|commit hash:|[0-9a-f]{7,40}/i,
```
`[0-9a-f]{7,40}` matches ANY hex-like string of 7-40 chars: UUIDs, memory addresses, SHA hashes in error messages, hex colors (if 7+ chars), commit-hash substrings in paths. In the SHIP phase, if the agent mentions any hex string (e.g., "dependency abc1234 has a vulnerability"), the loop prematurely transitions to `done` — "SHIPPED" — without an actual commit.

**Fix:** Require the hex string to be prefixed: `commit hash:?\s*[0-9a-f]{7,40}` or `committed:?\s*[0-9a-f]{7,40}`. Or remove the bare hex alternative and rely on `\bcommit\b` + `commit hash:`.

**BUG (loop.ts:589): `verify` phase signal misses natural phrasings.**
```ts
verify: /\bscore:?\s*(\d+(?:\.\d+)?)/i,
```
The number must immediately follow "score" (with optional colon + spaces). "score is 8" → `score` + `:?` (nothing) + `\s*` (" ") + `(\d)` needs digit, gets "i" → no match. "score of 8" → same failure. "I'd rate this 8/10" → no "score" prefix → no match. If the agent doesn't format the score as `score: 8` or `score 8`, the loop stalls in verify (no progression, no remediation — silent wedge).

**Fix:** Broaden to `/\bscore\b[^0-9]{0,10}(\d+(?:\.\d+)?)/i` or add alternative patterns: `/\b(?:score|rating)\b\D{0,10}(\d+(?:\.\d+)?)/i`.

**Note (loop.ts:588): `build` signal `\bRED\b|\bGREEN\b` with `/i` flag matches any "red"/"green".**
With `/i`, "I see a green button" in a BUILD-phase response would trigger build→review transition. Low risk in practice (build-phase responses are about code, not colors), but the regex could be tightened to `tests?\s+(red|green)\b` for the color variant.

**Note (loop.ts:52,62): Dead code.**
- `matchesKey` imported from pi-tui but never used.
- `SANTA_MAX_ROUNDS = 3` defined but never referenced.

**Note (loop.ts:739-747): Wedge detection is a no-op.**
The `session_before_compact` handler has an empty body (`return undefined`). The comment describes wedge/orphaned-tool-call detection but it's unimplemented. The `wedgeDetected` field in `LoopState` is always `false`. Not a bug (the loop has CAP and PLATEAU exits), but the documented WEDGE exit is non-functional.

**Note (loop.ts:525): `agent_end` handler fires on every agent_end, not just loop-steered turns.**
If a user manually types a message during an active loop, the response to that manual message is parsed for phase signals, potentially causing false phase transitions. The loop should ideally only parse responses to its own steers (e.g., by tagging steers with a marker and checking the preceding user message).

---

### 3. guardrails.ts — NEEDS-FIX (minor)

**Hook/event signature verification:**
- `pi.on("before_agent_start", handler)` → `ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>` (types.d.ts:837). ✓
- `BeforeAgentStartEvent` has `systemPrompt: string` (required) and `systemPromptOptions: BuildSystemPromptOptions` (required) (types.d.ts:505-514). ✓
- `BeforeAgentStartEventResult` = `{message?, systemPrompt?}` (types.d.ts:774-778). guardrails returns `{systemPrompt: event.systemPrompt + rulesBlock(...)}`. ✓ — Pi chains `systemPrompt` across handlers (docs confirm: "If multiple extensions return this, they are chained").
- `BuildSystemPromptOptions.contextFiles` = `Array<{path: string; content: string}> | undefined` (system-prompt.d.ts:19-22). guardrails' `findAgentsMd` handles `undefined` and accesses `f.path` / `f.content`. ✓
- `pi.on("session_compact", handler)` → `ExtensionHandler<SessionCompactEvent>` (no result type) (types.d.ts:830). Handler returns nothing. ✓
- `ctx.getSystemPrompt()` — on `ExtensionContext` (types.d.ts:240). ✓
- `ctx.getSystemPromptOptions?.()` in `/guardrails test` — `getSystemPromptOptions` is on `ExtensionCommandContext` (types.d.ts:253). Command handlers receive `ExtensionCommandContext`. The `?.` is defensive but unnecessary (method always present in command context). ✓
- `pi.registerCommand("guardrails", ...)` — correct. ✓

**BUG (guardrails.ts:~137): `warnIfMissing` config option is non-functional — empty if-body.**
```ts
pi.on("before_agent_start", async (event) => {
    if (!cfg.enabled) return;
    const agentsMd = findAgentsMd(event.systemPromptOptions?.contextFiles);
    if (!agentsMd && cfg.warnIfMissing) {
        // Surface the missing-rules case loudly once; still inject the block
        // so the model at least sees that rules were expected.
    }                                          // ← EMPTY BODY, no notify call
    return { systemPrompt: event.systemPrompt + rulesBlock(agentsMd, cfg) };
});
```
The comment says "Surface the missing-rules case loudly once" but there is no code. The user is never notified when AGENTS.md is missing from contextFiles. The `warnIfMissing` config does nothing beyond the default behavior (the `rulesBlock` function already injects a "not found" message for the model, but the USER sees nothing).

**Fix:** Add `ctx` to the handler signature and call `ctx.ui.notify`:
```ts
pi.on("before_agent_start", async (event, ctx) => {
    ...
    if (!agentsMd && cfg.warnIfMissing) {
        ctx.ui.notify("guardrails: AGENTS.md not found in contextFiles — no rules to re-inject.", "warning");
    }
    ...
});
```
Zero-risk: only fires in a degraded state (AGENTS.md missing), adds a user-visible warning.

**Note (guardrails.ts:~107): `event.systemPromptOptions?.contextFiles` — `?.` is unnecessary.**
`systemPromptOptions` is a required field on `BeforeAgentStartEvent` (types.d.ts:514). The optional chaining is dead but harmless.

**Note (guardrails.ts:truncate): Truncation is safe.**
`maxChars: 3500` keeps the head (primacy window). The truncation marker `[…truncated; full AGENTS.md already in context above…]` is accurate — Pi already loaded the full AGENTS.md into `event.systemPrompt` via `contextFiles`. The re-injection is for prominence, not completeness. ✓

---

### 4. palette.ts — HARMONIOUS

**Hook/event/API verification:**
- `pi.getCommands()` → `SlashCommandInfo[]` (types.d.ts:902). `SlashCommandInfo` has `name: string, description?: string, source: SlashCommandSource, sourceInfo: SourceInfo` (slash-commands.d.ts:4-9). `SlashCommandSource = "extension" | "prompt" | "skill"`. ✓
- palette uses `cmd.source ?? "extension"` — `source` is required (not optional), so `?? "extension"` is dead but harmless. ✓
- `ctx.ui.custom<string | null>(factory)` → `Promise<T>` (types.d.ts:116-127). Factory returns `Component & {dispose?()}`. palette returns `{render, invalidate, handleInput}` — matches `Component` interface from pi-tui. ✓
- `ctx.ui.setEditorText`, `ctx.ui.setStatus`, `ctx.ui.notify` — all on `ExtensionUIContext`. ✓
- `pi.registerCommand("palette", ...)`, `pi.registerShortcut(Key.ctrlShift("p"), ...)` — correct. ✓
- Imports `Container, Key, Text, fuzzyFilter, matchesKey, SelectItem` from `@earendil-works/pi-tui`. ✓

**Note (palette.ts:handleInput): DEL (0x7f) may be added to filter.**
The printable-char branch: `if (data.length === 1) { const code = data.charCodeAt(0); if (code >= 0x20 && data !== " ") { filter += data; ... } }`. DEL is 0x7f (≥ 0x20, ≠ " "), so if a terminal sends DEL as a raw byte and `matchesKey(data, "backspace")` doesn't catch it earlier, DEL gets appended to the filter string. Low risk — most terminals send recognized key sequences that `matchesKey` handles. But if it manifests, the filter would contain an invisible control character.

**Note (palette.ts:handleInput): Redundant space handling.**
Space (0x20) is caught by `code >= 0x20 && data !== " "` (excluded), then by `else if (data === " ")` (added). Both branches add space to filter, so behavior is correct. The logic is just convoluted — could be simplified to `if (code >= 0x20) { filter += data; ... }` in one branch.

---

### 5. handoff.ts — HARMONIOUS

**Hook/event/API verification:**
- `pi.registerCommand("handoff", ...)` — correct. ✓
- `ctx.sessionManager.getBranch()` → `SessionEntry[]` (session-manager.d.ts:242, on `ReadonlySessionManager`). ✓
- `ctx.cwd` — on `ExtensionContext` (types.d.ts:220). ✓
- `ctx.mode !== "tui"` — `mode: ExtensionMode` on `ExtensionContext` (types.d.ts:212). ✓
- `ctx.ui.notify`, `ctx.ui.setEditorText` — on `ExtensionUIContext`. ✓
- `SessionEntry` union (session-manager.d.ts:101) includes `SessionMessageEntry` (has `message`) and `CompactionEntry` (has `summary: string`). handoff's `entryMessage` and compaction handling match. ✓
- No event hooks, no tools, no shortcuts. ✓

**Note (handoff.ts:extractPaths): Path regex false positives for slash-joined words.**
```ts
const re = /(^|[=\s("'])(\.?\/|~\/|\.\.\/)?([A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+(\.[A-Za-z0-9]+)?)/g;
```
Group 3 requires at least one `/`. Common English phrases with slashes match: "and/or", "yes/no", "his/her", "client/server", "input/output" — all extracted as "file paths". Low impact (adds noise to the files list, doesn't break the handoff doc).

**Note (handoff.ts): Writes `HANDOFF.md` to `ctx.cwd`.**
This may be a git-tracked repo directory. The file is not gitignored by default. User-invoked (intentional), but could clutter repos if forgotten. Consider writing to a `.pi/` subdirectory or adding a `.gitignore` entry. Not a bug — a UX note.

---

## Cross-Extension Collisions

| Axis | coach.ts | loop.ts | guardrails.ts | palette.ts | handoff.ts | Collision? |
|------|----------|---------|---------------|------------|------------|------------|
| Commands | `/coach` | `/loop`, `/loop-status`, `/loop-abort` | `/guardrails` | `/palette` | `/handoff` | **No** |
| Shortcuts | — | Ctrl+Shift+L | — | Ctrl+Shift+P | — | **No** |
| Event hooks | `input`, `session_start` | `tool_call`, `agent_end`, `session_before_compact`, `session_start`, `session_shutdown` | `before_agent_start`, `session_compact`, `session_start` | `session_start` | — | **No** |
| Status slots | `coach` | `loop` | `guardrails` | `palette` | — | **No** |
| Tools | none | none | none | none | none | **No** |

All 5 hook `session_start` — this is fine: `session_start` is a broadcast event, multiple handlers are expected and they don't conflict (each sets its own status slot). No extension-vs-extension collision exists.

---

## Pi-Ideology Violations

**None found.** All 5 extensions follow the "minimal core, extend via TS extensions" philosophy:

- **No reimplementation of built-ins.** None of the 5 register tools that duplicate Pi's built-in read/write/edit/bash/grep/find/ls. loop.ts uses `setActiveTools` to *restrict* the existing toolset per phase — it doesn't re-implement any tool. palette.ts dispatches to existing commands via `setEditorText` — it doesn't re-implement command execution. handoff.ts reads `ctx.sessionManager` — it doesn't re-implement session storage.
- **No MCP/subagents/permission-popups baked in.** loop.ts's phase prompts *instruct* the agent to dispatch subagents (via the existing `subagent` tool), but the extension itself doesn't implement subagent dispatch — it just steers the agent and gates tools.
- **Primitives not features.** palette.ts is a navigation primitive (fuzzy search → dispatch). coach.ts is a routing primitive (classify → suggest command). guardrails.ts is a prominence primitive (re-inject rules). handoff.ts is a capture primitive (read session → write doc). loop.ts is a control-plane primitive (state machine + gates + steering).
- **No fighting the minimal-core philosophy.** Each extension owns a distinct axis (coach: input routing; loop: workflow state; guardrails: prompt prominence; palette: command navigation; handoff: session capture). None overlaps with another's axis.

---

## Latent Bugs Summary

| Severity | Extension | Location | Bug |
|----------|-----------|----------|-----|
| **BLOCKER** | loop.ts | :234 | `ctx.ui.sendUserMessage` doesn't exist on `ExtensionUIContext` or `ExtensionContext`. Should be `pi.sendUserMessage`. Loop steering is broken. |
| **BUG** | coach.ts | :265 | `/coach test <sample>` unreachable — `sub === "test"` requires exact match, sample arg falls through to default. |
| **BUG** | loop.ts | :592 | `ship` signal `[0-9a-f]{7,40}` matches any hex string → premature "shipped". |
| **BUG** | loop.ts | :589 | `verify` signal `\bscore:?\s*(\d+)` misses "score is 8" / "score of 8" → silent wedge. |
| **BUG** | guardrails.ts | :~137 | `warnIfMissing` if-body is empty — user never notified when AGENTS.md missing. |
| Note | loop.ts | :588 | `build` signal `\bRED\b|\bGREEN\b` with `/i` matches any "red"/"green". |
| Note | loop.ts | :52,62 | Dead import `matchesKey`, dead constant `SANTA_MAX_ROUNDS`. |
| Note | loop.ts | :739 | Wedge detection no-op (documented but unimplemented). |
| Note | loop.ts | :525 | `agent_end` fires on manual user messages during active loop → potential false phase transitions. |
| Note | palette.ts | handleInput | DEL (0x7f) may be added to filter if terminal sends raw byte. |
| Note | handoff.ts | extractPaths | "and/or", "yes/no" etc. extracted as file paths. |

---

## Zero-Risk Improvements

1. **loop.ts:234 (BLOCKER fix):** Change `ctx.ui.sendUserMessage(message, {deliverAs:"steer"})` to `pi.sendUserMessage(message, {deliverAs:"steer"})`. Capture `pi` at module level or pass through `runLoop` → `steer`. This is the only fix that is *required* for the loop to function.

2. **coach.ts:265 (one-line fix):** Change `if (sub === "test")` to `if (sub === "test" || sub.startsWith("test "))`. Enables the documented `/coach test <sample>` feature.

3. **guardrails.ts:~137 (add notify):** Change handler to `async (event, ctx) =>` and add `ctx.ui.notify("guardrails: AGENTS.md not found in contextFiles.", "warning")` in the empty if-body. Only fires in degraded state — zero risk.

4. **loop.ts:592 (tighten regex):** Change `[0-9a-f]{7,40}` to `commit hash:?\s*[0-9a-f]{7,40}` (or `committed:?\s*[0-9a-f]{7,40}`). Reduces false-positive "shipped" transitions.

5. **loop.ts:589 (broaden regex):** Change `\bscore:?\s*(\d+(?:\.\d+)?)` to `\bscore\b\D{0,10}(\d+(?:\.\d+)?)` to catch "score is 8", "score of 8".

6. **loop.ts:52,62 (cleanup):** Remove unused `matchesKey` import and `SANTA_MAX_ROUNDS` constant.

7. **loop.ts (optional, from docs):** Use `pi.appendEntry("loop_state", active)` in the `session_before_compact` handler to persist workflow state into the session ledger (docs: "Session persistence — Store state that survives restarts via `pi.appendEntry()`"). Currently the `session_before_compact` handler is a no-op — this would make the loop state survive compaction without any risk to existing functionality.

8. **All extensions:** All 5 are in `~/.pi/agent/extensions/` (auto-discovery location), so they support `/reload` hot-reloading per docs:1. No change needed — already zero-risk-friendly.
