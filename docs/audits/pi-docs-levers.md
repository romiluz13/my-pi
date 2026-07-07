# Pi Docs: Unused Capabilities vs. Our Setup

Audited: README.md, usage.md, sessions.md, session-format.md, settings.md, quickstart.md, terminal-setup.md, tmux.md, shell-aliases.md, keybindings.md, containerization.md, security.md, development.md, termux.md, windows.md (v0.80.x docs at `.../pi-coding-agent/docs/`).

Our setup baseline: 15 npm packages, 5 custom extensions (coach, loop, guardrails, palette, handoff), `settings.json` with `{npmCommand, lastChangelogVersion, defaultProvider, defaultModel, retry{enabled,maxRetries,baseDelayMs}, observational-memory{...}, theme:dark, packages[15], defaultThinkingLevel:xhigh, subagents.agentOverrides{8 roles→xhigh}, compaction{enabled,reserveTokens:65536,keepRecentTokens:50000}, defaultProjectTrust:always}`, `AGENTS.md`, 8 prompt templates, ~54 skills, **no `keybindings.json`**.

Each item below is tagged: **ZERO-RISK** (adopt now, how), **NICHE** (only if a specific need arises), or **N/A** (not applicable to a solo terminal setup). Doc file + section cited.

---

## CLI flags we don't use (usage.md §CLI Reference)

1. **`PI_CACHE_RETENTION=long`** — **ZERO-RISK.** Env var enables extended prompt cache where supported, lowering cost/latency on long sessions. Add `export PI_CACHE_RETENTION=long` to shell rc. No behavior change beyond caching. [usage.md §Environment Variables](usage.md)

2. **`--export <in> [out]`** (CLI) and **`/export [file]`** (slash) — **ZERO-RISK.** Export any session to HTML (or JSONL) for review/archive. One-shot, no state change. Useful for handing context to reviewers or filing run records. [usage.md §Modes, §Slash Commands](usage.md)

3. **`/share`** — **ZERO-RISK but opt-in.** Uploads session as a private GitHub gist with shareable HTML link. Requires gist auth. Use for sharing a run with a collaborator without pasting. [sessions.md §Session Commands](sessions.md); [usage.md §Exporting and Sharing Sessions](usage.md)

4. **`--tools <list>` / `-t` (allowlist)** and **`--exclude-tools <list>` / `-xt`** — **NICHE→high value.** Allowlist or disable specific built-in/extension/custom tools per run. Real leverage for read-only review subagents (`--tools read,grep,find,ls`) or disabling `ask_question` noise. We currently let every subagent see all tools. Worth wiring into the subagent dispatch presets. [usage.md §Tool Options](usage.md)

5. **`--no-builtin-tools` / `-nbt`** and **`--no-tools` / `-nt`** — **NICHE.** Disable built-in tools while keeping extension tools, or all tools. Only relevant for pure-extension or no-tool runs. [usage.md §Tool Options](usage.md)

6. **`--name <name>` / `-n`** and **`/name <name>`** — **ZERO-RISK.** Set session display name at startup or mid-session; makes sessions findable in `/resume` and `pi -r`. We rely on auto-naming. Adding `--name` to common launch aliases is free leverage. [sessions.md §Naming Sessions](sessions.md); [usage.md §Session Options](usage.md)

7. **`--models <patterns>`** — **NICHE.** Per-run model cycling list. The persistent equivalent is `enabledModels` in settings (see below). [usage.md §Model Options](usage.md)

8. **`--mode rpc`** and **`--mode json`** — **NICHE.** Headless process integration. RPC = JSON protocol over stdin/stdout for embedding in IDEs/custom UIs; JSON = event stream. We run interactively only. Adopt only if wiring pi into an editor/CI/dashboards. [usage.md §Modes](usage.md); [rpc.md](rpc.md)

9. **`--max-turns`** — **N/A.** Not a real flag. Not present in `args.ts` Args interface or any docs. Do not chase it. The turn cap lives in `observational-memory.agentMaxTurns` (we already set 16) and the `/loop` engine cap. [usage.md §CLI Reference](usage.md)

10. **`--system-prompt <text>` / `--append-system-prompt <text>`** — **NICHE.** Replace or append to default system prompt per run. We use AGENTS.md + skills + templates instead, which is the intended pattern. Only useful for one-off experiments. [usage.md §Other Options](usage.md)

11. **`-c`/`--continue`, `-r`/`--resume`, `--session <id>`, `--fork <id>`** — **ZERO-RISK, already available.** We don't reference these in AGENTS.md but they're core. Worth a one-line note in the harness section so the agent suggests `pi -c`/`pi -r` when resuming. [sessions.md §Session Storage](sessions.md)

12. **`--no-context-files` / `-nc`** — **N/A.** Disable AGENTS.md loading; contradicts our whole setup. [usage.md §Resource Options](usage.md)

---

## Slash commands we don't reference in AGENTS.md (usage.md §Slash Commands)

These are all **ZERO-RISK** — they exist by default, just not surfaced in our ruleset.

13. **`/copy`** — copy last assistant message to clipboard. Free, useful for pasting diffs/answers into PRs. [usage.md §Slash Commands](usage.md)

14. **`/changelog`** — display version history. We set `lastChangelogVersion` in settings, so pi already tracks changelog state; `/changelog` surfaces it. Useful after `pi update`. [usage.md §Slash Commands](usage.md)

15. **`/hotkeys`** — show all keybindings. No keybindings.json in our setup, so this shows defaults. Useful discovery tool. [usage.md §Slash Commands](usage.md)

16. **`/import <file>`** — resume a session from an exported JSONL. Pair with `/export` for cross-machine session transfer. [usage.md §Slash Commands](usage.md)

17. **`/trust`** — save project trust decision to `~/.pi/agent/trust.json`. We set `defaultProjectTrust: "always"`, so this is **N/A** for our global mode but useful if we ever switch a sensitive repo to `"ask"`. [usage.md §Project Trust](usage.md)

18. **`/compact [prompt]`** — manual compaction with optional custom focus. We have auto-compaction + observational-memory compaction, but manual `/compact "keep the API contract"` is a precision tool we don't mention. **ZERO-RISK** to document. [sessions.md §Session Commands](sessions.md)

19. **`/reload`** — reload keybindings/extensions/skills/prompts/context files without restart. We mention this implicitly via "restart pi or run /reload" in quickstart but not in AGENTS.md. **ZERO-RISK** to make explicit. [usage.md §Slash Commands](usage.md)

20. **`/scoped-models`** — UI to enable/disable models for Ctrl+P cycling. Pairs with `enabledModels` setting (#24). [usage.md §Slash Commands](usage.md)

---

## Keybindings we don't bind (keybindings.md)

We have **no `keybindings.json`** — all defaults apply. Items below are default-available shortcuts we don't mention in AGENTS.md.

21. **Ctrl+L** — open model selector. **ZERO-RISK**, already works. [keybindings.md §Models and Thinking](keybindings.md)

22. **Ctrl+P / Shift+Ctrl+P** — cycle scoped models forward/backward. Needs `enabledModels` configured to be useful. [keybindings.md §Models and Thinking](keybindings.md)

23. **Alt+Enter** — queue follow-up message (delivered after agent finishes all work). **ZERO-RISK**, already works. Powerful for "and then also..." prompts. [keybindings.md §Display and Message Queue](keybindings.md)

24. **Alt+Up** — retrieve queued messages back to editor. Pairs with Alt+Enter. [keybindings.md §Display and Message Queue](keybindings.md)

25. **Ctrl+G** — open external editor (`externalEditor`, else `$VISUAL`/`$EDITOR`). **ZERO-RISK** if we set `externalEditor: "code --wait"` for VS Code users. [keybindings.md §Application](keybindings.md)

26. **Ctrl+T** — collapse/expand thinking blocks. We run `xhigh` thinking, which is verbose; this is a real UX lever. **ZERO-RISK.** [keybindings.md §Models and Thinking](keybindings.md)

27. **Ctrl+O** — collapse/expand tool output. We produce large tool outputs (context sidecar helps), but in-TUI collapse is still useful. [keybindings.md §Display and Message Queue](keybindings.md)

28. **`app.session.new/tree/fork/resume`** — unbound by default. We could bind these in a `keybindings.json` (e.g. `Ctrl+N` for new session). **NICHE** — Coach/palette already cover most navigation. [keybindings.md §Sessions](keybindings.md)

29. **Custom keybindings.json (Emacs/Vim presets)** — **NICHE.** Only if the user wants non-default editing keys. [keybindings.md §Custom Configuration](keybindings.md)

---

## settings.json fields we don't set (settings.md)

30. **`enabledModels: string[]`** — **ZERO-RISK, HIGH leverage.** Model patterns for Ctrl+P cycling, persistent version of `--models`. We switch models via `/model` only. Setting e.g. `["claude-*", "gpt-*", "FW-GLM-*"]` makes Ctrl+P a one-key model toggle. [settings.md §Model Cycling](settings.md)

31. **`shellCommandPrefix: string`** — **ZERO-RISK if aliases are wanted.** Prefix every bash command (pi runs `bash -c`, which doesn't expand aliases). Setting `shopt -s expand_aliases\neval \"$(grep '^alias ' ~/.zshrc)\"` brings zsh aliases into pi's bash. Only adopt if we actually use shell aliases in commands. [shell-aliases.md](shell-aliases.md); [settings.md §Shell](settings.md)

32. **`externalEditor: string`** — **ZERO-RISK.** Set to `code --wait` (or your editor) for Ctrl+G. Currently falls back to `$VISUAL`/`$EDITOR`/`nano`. Explicit setting removes ambiguity. [settings.md §UI & Display](settings.md)

33. **`quietStartup: boolean`** — **ZERO-RISK.** Hide the startup header. We have 15 packages + 54 skills + 8 templates, so the header is large. Set `true` for a cleaner launch, but loses the at-a-glance "what loaded" audit. Tradeoff — **NICHE** unless startup noise bothers you. [settings.md §UI & Display](settings.md)

34. **`editorPaddingX` / `outputPad` / `autocompleteMaxVisible`** — **NICHE.** Cosmetic. `autocompleteMaxVisible` (3-20) could help given our 54 skills produce long `/`-menus. [settings.md §UI & Display](settings.md)

35. **`treeFilterMode: string`** — **ZERO-RISK.** Default `/tree` filter. We do heavy tool-call sessions; setting `"no-tools"` would make `/tree` navigation far cleaner. [settings.md §UI & Display](settings.md); [sessions.md §Tree Controls](sessions.md)

36. **`doubleEscapeAction: string`** — **NICHE.** Default `"tree"` (double-Escape opens tree). Already sane. [settings.md §UI & Display](settings.md)

37. **`branchSummary: { reserveTokens, skipPrompt }`** — **ZERO-RISK.** `skipPrompt: true` stops the "Summarize branch?" prompt on every `/tree` jump. If we branch often and rarely want summaries, this removes friction. If we want summaries, leave default. [settings.md §Branch Summary](settings.md)

38. **`retry.provider: { timeoutMs, maxRetries, maxRetryDelayMs }`** — **ZERO-RISK to set `timeoutMs`.** We set `retry` top-level (maxRetries 10, baseDelayMs 2000) but not the provider sub-fields. `provider.maxRetries` should stay `0` (docs warn it can block on quota resets). `provider.timeoutMs` and `maxRetryDelayMs: 60000` are worth setting explicitly to fail fast on hung requests. [settings.md §Retry](settings.md)

39. **`steeringMode` / `followUpMode`** — **N/A.** Defaults (`one-at-a-time`) are correct for our queue usage. [settings.md §Message Delivery](settings.md)

40. **`transport: "websocket-cached"`** — **NICHE.** For providers supporting multiple transports, `websocket-cached` can reduce connection overhead. Provider-dependent; only if our grove-openai provider benefits. [settings.md §Message Delivery](settings.md)

41. **`httpIdleTimeoutMs` / `websocketConnectTimeoutMs`** — **NICHE.** Network timeouts; defaults (5min/15s) are reasonable. Tune only on flaky networks. [settings.md §Message Delivery](settings.md)

42. **`terminal: { showImages, imageWidthCells, clearOnShrink }`** and **`images: { autoResize, blockImages }`** — **N/A** unless we do image-heavy work. `blockImages: true` is a NICHE cost-saver if we never send images. [settings.md §Terminal & Images](settings.md)

43. **`httpProxy: string`** — **N/A.** Only if behind a proxy. [settings.md §Network](settings.md)

44. **`warnings.anthropicExtraUsage`** — **N/A.** We use grove-openai, not Anthropic subscription. [settings.md §Warnings](settings.md)

45. **`collapseChangelog`, `enableInstallTelemetry`, `enableAnalytics`, `trackingId`** — **N/A / privacy choice.** Telemetry defaults are fine; analytics is opt-in experimental only. [settings.md §UI & Display, §Telemetry](settings.md)

46. **`shellPath: string`** — **N/A.** macOS/zsh; default bash detection works. [settings.md §Shell](settings.md)

47. **`sessionDir: string`** — **N/A.** Default `~/.pi/agent/sessions/` is correct. [settings.md §Sessions](settings.md)

48. **`markdown.codeBlockIndent`** — **N/A.** Cosmetic. [settings.md §Markdown](settings.md)

49. **`extensions` / `skills` / `prompts` / `themes` (local path arrays)** — **N/A.** We use the `packages` array + `~/.pi/agent/extensions|skills|prompts` auto-discovery. These arrays are for ad-hoc local paths. [settings.md §Resources](settings.md)

50. **`enableSkillCommands: boolean`** — **N/A.** Default `true`; we want `/skill:name`. [settings.md §Resources](settings.md)

---

## System prompt files (usage.md §System Prompt Files)

51. **`~/.pi/agent/SYSTEM.md`** — replace default system prompt globally. **N/A / risky.** We use AGENTS.md (appended to default prompt). Replacing the default prompt would discard pi's built-in agent framing — only for advanced customization. [usage.md §System Prompt Files](usage.md)

52. **`APPEND_SYSTEM.md`** (global or project `.pi/`) — append to default system prompt without replacing. **NICHE.** We already append via AGENTS.md; `APPEND_SYSTEM.md` is for content that should sit in the system prompt proper (not the context-file section). Could host cross-tool invariant rules, but AGENTS.md already serves this. [usage.md §System Prompt Files](usage.md)

53. **`customPrompts` / `scopedModels` / `autocomplete` / `completions`** — **N/A.** These are not documented settings.json fields. `customPrompts` is internal extension API context (`extensions.md`), not a user setting. `autocomplete`/`completions` aren't fields — autocomplete is built into the `/` menu and `@` file fuzzy-search. `scopedModels` → the real field is `enabledModels` + `/scoped-models`. Do not chase these names.

---

## Containerization (containerization.md)

54. **Gondolin micro-VM** — **NICHE.** Local Linux micro-VM; routes built-in tools + `!` commands into a VM while keeping auth on host. Requires QEMU + Node ≥23.6. Only for untrusted-repo work. We run trusted solo work — not needed now. [containerization.md §Gondolin](containerization.md)

55. **Plain Docker** — **NICHE.** Run whole `pi` in a container; API keys enter container. For isolated/untrusted work or reproducible environments. [containerization.md §Plain Docker](containerization.md)

56. **OpenShell** — **N/A.** NVIDIA policy-controlled sandbox requiring a gateway. Enterprise/remote-sandbox pattern. Not applicable to a solo terminal setup. [containerization.md §OpenShell](containerization.md)

**Verdict:** We use NO sandbox. For a solo trusted-terminal setup this is correct (security.md confirms pi has no built-in sandbox by design and trust is only an input-loading guard). Adopt a container **only** when working with untrusted repos or unattended automation. [security.md §No Built-in Sandbox, §Running Untrusted Work](security.md)

---

## tmux integration (tmux.md)

57. **tmux extended-keys config** — **NICHE.** If we run pi inside tmux, `~/.tmux.conf` needs `set -g extended-keys on` + `set -g extended-keys-format csi-u` (tmux ≥3.5) for Shift+Enter/Ctrl+Enter to work. We don't reference tmux anywhere. Only relevant if multi-session/background-bash via tmux is adopted. [tmux.md](tmux.md)

58. **Background bash / multi-session via tmux** — **NICHE.** Pi intentionally has no built-in background bash; tmux is the recommended external route. We use subagents + intercom instead. Adopt tmux only if we need long-running shell processes visible alongside pi. [usage.md §Design Principles](usage.md)

---

## Security model (security.md)

59. **Trust flow understanding** — We set `defaultProjectTrust: "always"`, which trusts all project resources (`.pi/settings.json`, project extensions/skills/packages) without prompting. This is intentional for a solo trusted machine. **Key caveat to remember:** trust is only an input-loading guard, NOT a sandbox — it does not restrict what the model can ask tools to do once running. Prompt injection from repo files is expected risk. For untrusted repos, we must drop to `"ask"`/`"never"` or use a container. [security.md §Project Trust, §No Built-in Sandbox](security.md)

60. **`/trust` for per-project decisions** — **NICHE.** If we ever set a sensitive repo to `"ask"` mode, `/trust` saves the decision so we're prompted once. [usage.md §Project Trust](usage.md)

---

## RPC mode (rpc.md)

61. **`pi --mode rpc`** — **NICHE.** JSON protocol over stdin/stdout for embedding in IDEs/custom UIs. Full method set: `get_state`, `set_session_name`, `get_messages`, `send_message`, `interrupt`, `extension_ui_request`, `notify`, etc. We don't use it. Adopt only if building a custom Pi front-end or IDE integration. For TypeScript apps, prefer `AgentSession` from the SDK directly over spawning RPC. [rpc.md §Starting RPC Mode, §Protocol Overview](rpc.md)

---

## SDK embedding (README.md)

62. **`AgentSession` from `@earendil-works/pi-coding-agent`** — **NICHE.** Programmatic embedding of the agent loop in Node/TS apps (vs. RPC subprocess). Real-world example: `openclaw/openclaw`. Only relevant if building a tool on top of pi. [README.md §SDK](README.md)

---

## Session tree features (sessions.md, session-format.md)

63. **`/tree` branching + branch summaries** — **ZERO-RISK, already available.** Sessions are trees; `/tree` jumps to any prior point and continues as a new branch in the same file. Branch summaries preserve context from abandoned paths. We don't mention this in AGENTS.md but it's a strong "undo without git" lever. [sessions.md §Branching with /tree, §Branch Summaries](sessions.md)

64. **`/fork` vs `/clone` vs `/tree`** — **ZERO-RISK to document.** `/fork` = new session file from an earlier user message; `/clone` = duplicate current active branch to new file; `/tree` = in-place branch. We use git checkpoints + rewind; these are complementary. [sessions.md §/tree, /fork, and /clone](sessions.md)

65. **Tree labels (Shift+L) + `labeled-only` filter** — **NICHE.** Bookmark tree nodes for navigation. Useful in very long multi-branch sessions. [sessions.md §Tree Controls](sessions.md); [keybindings.md §Tree Navigation](keybindings.md)

66. **`/export` HTML + `/import` JSONL** — **ZERO-RISK.** Round-trip sessions across machines or archive as HTML. [usage.md §Exporting and Sharing Sessions](usage.md)

---

## Editor features (usage.md §Editor Features)

67. **`@` fuzzy file reference** — **ZERO-RISK, already works.** Type `@` in editor to fuzzy-search project files into the prompt. Not in AGENTS.md. [usage.md §Editor Features](usage.md)

68. **`!command` vs `!!command`** — **ZERO-RISK, already works.** `!cmd` sends output to model; `!!cmd` runs silently (no model context). `!!` is the lever we likely underuse for noisy checks. [usage.md §Editor Features](usage.md)

69. **Image paste (Ctrl+V / drag)** — **N/A** unless doing visual work. [usage.md §Editor Features](usage.md)

---

## Debugging (development.md)

70. **`/debug` (hidden)** — **NICHE.** Writes rendered TUI lines (with ANSI) + last messages sent to LLM to `~/.pi/agent/pi-debug.log`. Useful when reporting pi bugs. [development.md §Debug Command](development.md)

---

## Platform docs (termux.md, windows.md, terminal-setup.md)

71. **Termux, Windows, terminal-setup** — **N/A.** macOS/zsh environment. terminal-setup.md is only relevant if we switch terminal emulators or hit Shift+Enter issues. [termux.md, windows.md, terminal-setup.md]

---

## TOP ZERO-RISK LEVERS WE'RE NOT PULLING (ranked)

1. **`PI_CACHE_RETENTION=long`** — extended prompt cache, direct cost/latency cut. One env var. [usage.md]
2. **`enabledModels: [...]` + Ctrl+P cycling** — persistent one-key model switching instead of `/model` menu. [settings.md]
3. **`/export` + `/share` + `/copy`** — share/ archive sessions and copy answers; zero-config, just undocumented in our rules. [usage.md]
4. **`externalEditor: "code --wait"`** — Ctrl+G opens a real editor for long prompts instead of `nano` fallback. [settings.md]
5. **`treeFilterMode: "no-tools"` + `branchSummary.skipPrompt: true`** — cleaner `/tree` navigation through tool-heavy sessions with less prompting. [settings.md]
6. **`retry.provider.timeoutMs` + `maxRetryDelayMs`** — fail fast on hung requests / long provider-requested delays instead of hanging. [settings.md]
