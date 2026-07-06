# Package Load-Order + Interaction Audit

**Date:** 2026-07-07
**Scope:** 15 npm packages (settings.json `packages` array) + 5 local extensions (`~/.pi/agent/extensions/`)
**Settings file:** `/Users/rom.iluz/.pi/agent/settings.json`

---

## 1. ORDER VERDICT: CORRECT ✅

### Full load order (runtime-verified)

The Pi runtime (`discoverAndLoadExtensions` in `loader.js:495`) loads in this order:
1. Project-local extensions (`cwd/.pi/extensions/`) — none in this setup
2. Global extensions (`~/.pi/agent/extensions/`, alphabetical): **coach → guardrails → handoff → loop → palette**
3. Package extensions (in `packages` array order):

| # | Package | Load position |
|---|---------|--------------|
| 0 | @spences10/pi-confirm-destructive | 6th overall |
| 1 | @spences10/pi-context | 7th overall |
| 2 | @hypabolic/pi-hypa | 8th overall |
| 3 | @juicesharp/rpiv-ask-user-question | 9th overall |
| 4 | @narumitw/pi-statusline | 10th overall |
| 5 | pi-btw | 11th overall |
| 6 | pi-hermes-memory | 12th overall |
| 7 | pi-intercom | 13th overall |
| 8 | @spences10/pi-observability | 14th overall |
| 9 | pi-lens | 15th overall |
| 10 | pi-observational-memory | 16th overall |
| 11 | pi-prompt-template-model | 17th overall |
| 12 | pi-rewind | 18th overall |
| 13 | pi-subagents | 19th overall |
| 14 | pi-web-access | 20th overall |

### Claim 1: confirm-destructive BEFORE pi-hypa → CORRECT ✅

**Positions:** confirm-destructive (#0) loads before pi-hypa (#2).

**Handler logic that proves order matters:**

- **confirm-destructive** (`dist/index.js`): hooks `pi.on('tool_call', ...)` and inspects `event.input.command` for the **original** bash command. Calls `assess_tool_call(event, ctx.cwd, session_created_files)` to determine if the command is destructive. If destructive and not approved, returns `{ block: true, reason }`.

- **pi-hypa** (`extensions/index.ts:69`): hooks `pi.on('tool_call', ...)` for bash events and **mutates the command in place**: `event.input.command = status.command` (line 76, case `"rewritten"`). Hypa is an AI command rewriter that can transform, deny, or passthrough commands.

**If hypa loaded first:** hypa would rewrite `event.input.command` before confirm-destructive sees it. confirm-destructive would assess the **rewritten** (potentially sanitized) command, not the original destructive one. A destructive command that hypa rewrites to a "safe" variant would bypass the user confirmation prompt entirely.

**Current order (confirm-destructive first):** confirm-destructive sees the original command and can block it before hypa ever touches it. If the user approves, hypa then rewrites the approved command. ✅

### Claim 2: pi-context BEFORE pi-lens → CORRECT ✅

**Positions:** pi-context (#1) loads before pi-lens (#9).

**Handler logic that proves order matters:**

- **pi-context** (`dist/lifecycle.js:23`): hooks `pi.on('tool_result', ...)` and **replaces the entire content array** with a receipt: `return { content: [{ type: 'text', text: stored.receipt }] }` (line 44). This only triggers for large outputs (>24KB/300 lines); small outputs pass through untouched.

- **pi-lens** (`dist/clients/runtime-tool-result.js`): hooks `pi.on('tool_result', ...)` and **appends diagnostics to content**: `return { content: [...event.content, { type: 'text', text: output }] }` (lines 406, 486, 507). Uses spread to preserve existing content items and add diagnostic notices.

**If pi-lens loaded first (WRONG order):** lens would append diagnostics to the large output → content = [large_original, diagnostic]. Then pi-context would replace the **entire** content with a receipt → lens diagnostics **LOST**. The user would see only the receipt, not the lint/diagnostic feedback.

**Current order (pi-context first):** pi-context replaces large content with a small receipt → content = [receipt]. Then pi-lens appends diagnostics to the receipt → content = [receipt, diagnostic]. Lens diagnostics **PRESERVED**. The agent sees both the sidecar receipt and lens feedback. ✅

**Additional subtlety:** pi-lens also reads `event.content` for bash grep search-read extraction (`runtime-tool-result.js:216`). With pi-context first, this extraction runs on the receipt (not the original grep output). This is a minor degradation — grep search-read registration may miss some `file:line` patterns — but it does NOT affect lens diagnostics, which is the primary concern. This is an acceptable trade-off since grep outputs exceeding 24KB are rare, and lens primarily handles edit/write tools (which read from disk, not event.content).

---

## 2. FULL TOOL / COMMAND / SHORTCUT INVENTORY

### Tools (35 total across all packages)

| # | Package | Tool Name | Guard |
|---|---------|-----------|-------|
| 1 | pi-context | `context_export` | — |
| 2 | pi-context | `context_purge` | — |
| 3 | pi-context | `context_list` | — |
| 4 | pi-context | `context_get` | — |
| 5 | pi-context | `context_search` | — |
| 6 | pi-context | `context_stats` | — |
| 7 | pi-hypa | `hypa_mcp_proxy` | — |
| 8 | pi-hypa | `hypa_shell` | — |
| 9 | pi-hypa | `hypa_read` | — |
| 10 | pi-hypa | `hypa_grep` | — |
| 11 | pi-hypa | `hypa_find` | — |
| 12 | pi-hypa | `hypa_ls` | — |
| 13 | rpiv-ask-user-question | `ask_user_question` | — |
| 14 | pi-hermes-memory | `memory_search` | — |
| 15 | pi-hermes-memory | `session_search` | variant guard (anchors vs legacy — mutually exclusive) |
| 16 | pi-hermes-memory | `skill_manage` | — |
| 17 | pi-hermes-memory | `memory` | — |
| 18 | pi-intercom | `contact_supervisor` | `if (childOrchestratorMetadata)` — child sessions only |
| 19 | pi-intercom | `intercom` | — (always registered) |
| 20 | pi-lens | `ast_grep_outline` | try/catch (first-wins) |
| 21 | pi-lens | `ast_grep_replace` | try/catch (first-wins) |
| 22 | pi-lens | `ast_grep_search` | try/catch (first-wins) |
| 23 | pi-lens | `ast_grep_dump` | try/catch (first-wins) |
| 24 | pi-lens | `ast_dump` | try/catch (first-wins, compat alias) |
| 25 | pi-lens | `lens_diagnostics` | try/catch (first-wins) |
| 26 | pi-lens | `lsp_diagnostics` | try/catch (first-wins) |
| 27 | pi-lens | `lsp_navigation` | try/catch (first-wins) |
| 28 | pi-lens | `module_report` | try/catch (first-wins) |
| 29 | pi-lens | `read_enclosing` | try/catch (first-wins) |
| 30 | pi-lens | `read_symbol` | try/catch (first-wins) |
| 31 | pi-observational-memory | `recall_observation` | — |
| 32 | pi-prompt-template-model | `run-prompt` | — |
| 33 | pi-subagents | `subagent` | — |
| 34 | pi-subagents | `wait` | — |
| 35 | pi-subagents | `subagent_supervisor` | child sessions only (`readChildMetadata()` guard) |
| 36 | pi-subagents | `contact_supervisor` | `hasTool` guard — first-wins, no duplicate (pi-intercom #18 wins) |
| 37 | pi-subagents | `intercom` | `hasTool` guard — first-wins, no duplicate (pi-intercom #19 wins) |
| 38 | pi-subagents | `structured_output` | subagent runtime only (not parent session) |
| 39 | pi-web-access | `web_search` | — |
| 40 | pi-web-access | `fetch_content` | — |
| 41 | pi-web-access | `get_search_content` | — |

**Tool duplicate analysis:** The runtime's `getAllRegisteredTools()` (runner.js:252) uses **first-wins** semantics (`if (!toolsByName.has(tool.definition.name))`). The two potential tool duplicates (`contact_supervisor`, `intercom`) are both properly guarded by `hasTool()` checks in pi-subagents, and pi-intercom loads earlier (index 7 vs 13). **No tool duplicates.** ✅

### Commands (52 total across all packages + local extensions)

| Package | Command Name | Guard |
|---------|-------------|-------|
| **LOCAL EXTENSIONS** | | |
| coach.ts | `coach` | — |
| guardrails.ts | `guardrails` | — |
| handoff.ts | `handoff` | — |
| loop.ts | `loop` | — |
| loop.ts | `loop-status` | — |
| loop.ts | `loop-abort` | — |
| palette.ts | `palette` | — |
| **PACKAGES** | | |
| pi-context | `context` | — |
| pi-context | `context-stats` | — |
| pi-hypa | `hypa` | — |
| pi-btw | `btw` | — |
| pi-btw | `btw:tangent` | — |
| pi-btw | `btw:new` | — |
| pi-btw | `btw:clear` | — |
| pi-btw | `btw:inject` | — |
| pi-btw | `btw:summarize` | — |
| pi-btw | `btw:model` | — |
| pi-btw | `btw:thinking` | — |
| pi-hermes-memory | `memory-insights` | — |
| pi-hermes-memory | `memory-consolidate` | — |
| pi-hermes-memory | `learn-memory-tool` | — |
| pi-hermes-memory | `memory-preview-context` | — |
| pi-hermes-memory | `memory-skills` | — |
| pi-hermes-memory | `memory-interview` | — |
| pi-hermes-memory | `memory-sync-markdown` | — |
| pi-hermes-memory | `memory-index-sessions` | — |
| pi-hermes-memory | `memory-switch-project` | — |
| pi-intercom | `intercom` | — |
| pi-observability | `observability` | — |
| pi-lens | `lens-toggle` | — |
| pi-lens | `lens-context-toggle` | — |
| pi-lens | `lens-widget-toggle` | — |
| pi-lens | `lens-booboo` | — |
| pi-lens | `lens-tdi` | — |
| pi-lens | `lens-health` | — |
| pi-lens | `lens-tools` | — |
| pi-lens | `lens-allow-edit` | — |
| pi-observational-memory | `om:status` | — |
| pi-observational-memory | `om:view` | — |
| pi-prompt-template-model | *(dynamic: one per prompt template file)* | `registerPromptCommand(name)` at session_start |
| **pi-prompt-template-model** | **`chain-prompts`** | **NO GUARD** ⚠️ |
| pi-prompt-template-model | `prompt-tool` | — |
| pi-rewind | `rewind` | — |
| pi-subagents | `run` | — |
| pi-subagents | `chain` | — |
| pi-subagents | `run-chain` | — |
| pi-subagents | `parallel` | — |
| pi-subagents | `subagent-cost` | — |
| pi-subagents | `subagents-doctor` | — |
| pi-subagents | `subagents-fleet` | — |
| pi-subagents | `subagents-models` | — |
| pi-subagents | `subagents-profiles` | — |
| pi-subagents | `subagents-load-profile` | — |
| pi-subagents | `subagents-refresh-provider-models` | — |
| pi-subagents | `subagents-generate-profiles` | — |
| pi-subagents | `subagents-check-profile` | — |
| pi-subagents | `prompt-workflow` | — |
| **pi-subagents** | **`chain-prompts`** | **NO GUARD** ⚠️ |
| pi-web-access | `websearch` | — |
| pi-web-access | `curator` | — |
| pi-web-access | `google-account` | — |
| pi-web-access | `search` | — |

### ⚠️ DUPLICATE COMMAND FOUND: `chain-prompts`

**Both pi-prompt-template-model (index 11) and pi-subagents (index 13) register `chain-prompts` with NO guard.**

**Evidence:**
- `pi-prompt-template-model/index.ts:1777`: `pi.registerCommand("chain-prompts", { description: "Chain prompt templates sequentially [template -> template -> ...]", ... })`
- `pi-subagents/src/slash/prompt-workflows.ts:303`: `pi.registerCommand("chain-prompts", { description: "Run prompt templates as a native subagent chain: /chain-prompts analyze -> fix -- args", ... })`

**Runtime behavior** (`runner.js:360` `resolveRegisteredCommands`): When two extensions register the same command name, the runtime creates disambiguated invocation names: `chain-prompts:1` and `chain-prompts:2`. Neither responds to `/chain-prompts` — the user must type `/chain-prompts:1` or `/chain-prompts:2`. **This breaks the `/chain-prompts` command.**

**Impact:** `/chain-prompts` is non-functional. Both variants exist but are inaccessible by their intended name. The two implementations are also functionally different (pi-prompt-template-model chains templates sequentially in-process; pi-subagents chains them as native subagent runs).

**Fix options (pick one):**
1. Remove the `chain-prompts` registration from pi-subagents (pi-prompt-template-model's version is the original sequential chain).
2. Remove the `chain-prompts` registration from pi-prompt-template-model (pi-subagents' version uses native subagent runs).
3. Rename one (e.g., pi-subagents → `subagent-chain`).

**Note:** pi-prompt-template-model also registers dynamic commands (`registerPromptCommand(name)`) from prompt template files at `session_start`. If any prompt template is named `run`, `chain`, `search`, `parallel`, etc., it would collide with pi-subagents/pi-web-access commands. This is a runtime risk dependent on user prompt files — cannot be statically verified.

### Shortcuts (8 total — NO duplicates ✅)

| Package/Extension | Shortcut | Description |
|-------------------|----------|-------------|
| palette.ts (local) | `ctrl+shift+p` | Open command palette |
| loop.ts (local) | `ctrl+shift+l` | Start a loop |
| pi-btw | `alt+/` | BTW focus |
| pi-btw | `ctrl+alt+w` | BTW focus |
| pi-intercom | `alt+m` | Open session intercom |
| pi-rewind | `escape escape` | Rewind |
| pi-web-access | `ctrl+shift+s` | Curate |
| pi-web-access | `ctrl+shift+w` | Activity |

All shortcuts are unique. ✅

---

## 3. ZERO-RISK SETTINGS IMPROVEMENT

### Finding: `compaction.reserveTokens: 629146` is excessively high

**Current value:** `629146` (~614 KB of text)
**Default:** `16384`
**Schema docs:** "Tokens reserved for LLM response"

**Analysis:** `reserveTokens` defines how much context window space is set aside for the LLM's response. Compaction triggers when `tokens_used >= context_window - reserveTokens`. With 629146 reserved:

- No LLM generates 629K tokens in a single response. Typical max output: 4K–32K tokens. Even the most verbose models cap at ~64K.
- This causes **premature compaction** — the agent loses context far earlier than necessary, triggering more summarization LLM calls (higher cost) and reducing the effective context window.
- The model ("FW-GLM-5.2" via grove-openai) must have a context window > 630K for this setup to function at all (otherwise compaction triggers at session start). Since the user is actively working, the context window is likely ≥1M tokens.

**Zero-risk fix:** Reduce to `65536` (generous — covers the longest possible LLM response with headroom):

```json
"compaction": {
    "enabled": true,
    "reserveTokens": 65536,
    "keepRecentTokens": 50000
}
```

**Benefits:**
- Less frequent compaction → fewer summarization LLM calls → **lower cost**
- More context retained per session → **better agent performance**
- 65536 tokens is more than any model produces in a single response → **no risk of truncation**
- No new moving parts → **zero-risk**

**Alternative if the user intentionally uses high reserveTokens as a context cap:** Set to `32768` (still 2× the default, covers any realistic response).

### Secondary note: `retry.maxRetries: 10` (not zero-risk, but worth flagging)

**Current value:** `10` (default: `3`)
**With `baseDelayMs: 2000`**, exponential backoff produces delays of 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 512s, 1024s. Total worst-case wait: ~34 minutes.

This is NOT zero-risk to change (reducing retries could cause failures on transient errors the user's provider may have). But if the provider is unreliable enough to warrant 10 retries, consider adding `retry.provider.maxRetryDelayMs` explicitly (defaults to 60000) to ensure server-requested delays don't cause silent multi-hour hangs. No change needed — the default is already in effect. Flagging only as awareness.

---

## SUMMARY

| Check | Verdict |
|-------|---------|
| confirm-destructive before pi-hypa | ✅ CORRECT — confirm-destructive sees original command |
| pi-context before pi-lens | ✅ CORRECT — lens diagnostics preserved |
| Tool duplicates | ✅ NONE — `contact_supervisor` and `intercom` properly guarded |
| Command duplicates | ⚠️ ONE: `chain-prompts` registered by both pi-prompt-template-model and pi-subagents — **breaks `/chain-prompts`** |
| Shortcut duplicates | ✅ NONE — all 8 unique |
| Zero-risk settings improvement | Reduce `compaction.reserveTokens` from 629146 to 65536 |
