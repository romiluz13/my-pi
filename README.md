# my-pi

**The best Pi coding agent setup - 15 packages, 57 skills, 8 slash commands, 5 custom extensions (incl. coach + loop engine + guardrails), 10-step autonomous workflow. You never have to remember a command - Coach suggests the right one. Every Pi power leveraged. Zero bloat, pure Pi ideology.**

[![Pi](https://img.shields.io/badge/Pi-v0.80+-blue.svg)](https://pi.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What This Is

A curated, reproducible Pi coding agent setup built on three principles:

1. **Every piece earns its place.** No bloat, no duplicates, no "just in case" packages.
2. **CLI + skills, not MCP.** Pi's philosophy is minimal — web access via CLI, code research via CLI, not MCP servers with 93 deps.
3. **Autonomous by default.** The agent brainstorms, plans, builds, tests, reviews, verifies, documents, and remembers without manual skill invocation.

---

## Quick Start (3 commands)

```bash
# 1. Clone and install everything
git clone https://github.com/romiluz13/my-pi.git
cd my-pi && ./scripts/install.sh

# 2. Authenticate external CLIs (one time, free)
bdata login              # Bright Data — web search + scrape, 5,000 free credits/month
npx octocode auth login  # GitHub — code research

# 3. Start Pi and tell it who you are
pi
# Then type: /memory-interview
```

After that, just describe what you want. Pi handles the rest.

---

## The User Interface — 8 Slash Commands

These are the commands you type. Each one kicks off an autonomous workflow.

| Command | What it does | Skills it loads |
| --------- | ------------- | ---------------- |
| `/feature "add dark mode"` | **Full chain:** plan → build → review → ship | brainstorming → tdd → code-review → verification |
| `/fix "login button broken"` | **Full chain:** debug → build → review → ship | diagnosing-bugs → tdd → code-review → verification |
| `/plan "redesign auth"` | Brainstorm, design, write spec + tickets | brainstorming |
| `/build "add JWT validation"` | TDD: write test → see fail → implement → see pass | tdd |
| `/debug "payment fails on Stripe"` | Build feedback loop, find root cause, fix | diagnosing-bugs |
| `/review` | Parallel reviewers on current diff, anti-anchored | code-review |
| `/ship` | Verify with evidence, commit, document | verification-before-completion |
| `/research "compare state libraries"` | Parallel fan-out across web, GitHub, codebase | research |

**`/feature` and `/fix` are the power commands** — they chain 4 skills end-to-end and run autonomously until done. Type one command, get a fully reviewed, verified, committed feature.

---

## The 10-Step Autonomous Workflow

Every task flows through these steps automatically. The workflow IS the skill router — each step names the exact skill to use. No separate router skill needed.

```
 1. Understand       → read repo, search memory, ask ONE question if ambiguous
 2. Brainstorm       → new features: design before code, get user approval
 3. Plan             → /to-spec + /to-tickets, or /wayfinder for fog-of-war
 4. Build            → /build or /feature (TDD: test first, see fail, implement, pass)
 5. Test             → run tests, diagnosing-bugs skill if fail (repro loop first)
 6. Review           → 2-3 parallel reviewer subagents, anti-anchored, fresh context
 7. Verify + commit  → evidence before claims, independent auditor, then commit
 8. Document         → AGENTS.md for gotchas, ADR for decisions, CHANGELOG for users
 9. Remember         → save to memory (SQLite + observational), capture before compaction
10. Handoff          → compact-safe skill if session gets long
```

**Context hygiene:** Steps 1-3 stay in one unbroken context window. Compaction mid-planning loses the thread.

---

## 15 Pi Packages

Every package earns its slot. No duplicates, no bloat.

| Package | What it does |
| --------- | ------------- |
| pi-hermes-memory | Persistent cross-session memory (SQLite FTS5), session search, learns from corrections |
| pi-observational-memory | Within-session memory that survives compaction — observations + reflections |
| pi-subagents | Delegate to child agents — review, scout, parallel work, chains |
| pi-lens | LSP diagnostics, linters, formatters, ast-grep rules on every edit |
| @hypabolic/pi-hypa | Summarize old tool outputs → 60-80% token savings on long sessions |
| @narumitw/pi-statusline | Model, tokens, cost, git branch in status bar |
| pi-intercom | Subagents can ask parent session when blocked — planner-worker coordination |
| pi-prompt-template-model | Slash commands auto-switch model + skills, then restore |
| pi-btw | Side questions without polluting main context |
| @juicesharp/rpiv-ask-user-question | Structured clarifying questions instead of guessing |
| pi-rewind | `/rewind` — checkpoint browser, diff preview, redo stack |
| pi-web-access | `web_search` + `fetch_content` tools — YouTube transcripts, PDFs, video analysis |
| @spences10/pi-confirm-destructive | Git-aware confirmation layer for destructive ops (rm unrecoverable, git reset --hard, destructive SQL, disk tools). Placed BEFORE pi-hypa so it sees the original command. Aligns with AGENTS.md Safety section. |
| @spences10/pi-context | SQLite FTS sidecar for oversized tool output (>24KB/300 lines) — stores out-of-context, returns a receipt, retrievable via `context_search`/`context_get`. Complements pi-hypa (compresses in-context; pi-context stores out-of-context). |
| @spences10/pi-observability | Live local browser dashboard (port 43190) + SSE event stream. Read-only forwarder — never mutates agent state, never touches the footer (pi-statusline owns it), never spawns LSP (pi-lens owns it), redacts secrets before streaming. `/observability` to open. |

### Two Memory Layers (structural advantage)

```
pi-hermes-memory        → cross-session, SQLite FTS5, searchable
pi-observational-memory → within-session, survives compaction, observations + reflections
```

Together they solve the #1 agent problem: losing context across sessions AND across compaction boundaries. No other setup has this two-layer structure.

---

## 5 Custom Extensions

User-local TypeScript glue in `extensions/` — the Pi way: primitives, not features. Each reads from an existing store and owns no axis that a package already owns. Hot-reloadable with `/reload`. Full harmony contract in [`extensions/README.md`](extensions/README.md).

| Extension | Trigger | What it does |
| --------- | -------- | ------------ |
| `coach.ts` | automatic (every input) | **The adoption layer.** You type a task in plain English; Coach classifies it and suggests the right workflow (/loop, /research, /review, /ship, or "just do it"). One-tap confirm — you never remember a command. Skip with `!` prefix or `/coach off`. |
| `palette.ts` | `Ctrl+Shift+P` / `/palette` | Fuzzy command palette over **every** slash command (prompts + skills + extension commands). Discovers dynamically via `pi.getCommands()` — zero drift. Inserts `/<cmd>` into the editor for native dispatch. |
| `handoff.ts` | `/handoff [next task]` | Generates a self-contained `HANDOFF.md` from the session ledger and drafts a continuation prompt. **Deterministic — no LLM call**, so it never competes with the memory layers' background work. |
| `loop.ts` | `/loop "<task>"` / `Ctrl+Shift+L` | **Bounded loop engine** — pre-flight contract gate → plan → build → review → verify → ship, with remediation loop-back (cap 3), plateau detection, independent verifier convergence (santa, cross-model opt-in), test-honesty gates, reconciliation over assertion. Three exits: PASS / CAP / WEDGE. Owns one new axis (durable workflow state + gates), composes on all 12 packages via steering, registers zero tools. |
| `guardrails.ts` | automatic (every turn) | Re-injects a HARD RULES block from AGENTS.md into the system prompt every turn via `before_agent_start`. Defeats the "I didn't pay attention to AGENTS.md" failure + survives compaction. `/guardrails on\|off\|test`. Prominence tier (research: ~90-95% reliable); upgrade path to `tool_call` gates documented. |

**Harmony audit** (3 fresh-context reviewers): 0 critical/major conflicts across all 12 packages + 2 extensions. Full reports in [`docs/audits/`](docs/audits/).

---

## 54 Skills

Skills are loaded into the system prompt on every session. Each one earns its place — no duplicates, no dead weight.

### Core Workflow (14) — Matt Pocock

The backbone of autonomous work. Each skill is a discipline, not a script.

| Skill | Triggers | What it does |
| ------- | --------- | ------------- |
| `brainstorming` | Before any creative work | Design before code — explore intent, propose approaches, get approval |
| `tdd` | Writing features or fixing bugs | Test first → see fail → implement → see pass → refactor |
| `diagnosing-bugs` | Something broken/throwing/failing/slow | 10-rung feedback loop ladder, ranked hypotheses, causal chain gate |
| `code-review` | Review a branch, PR, or WIP | Two-axis review: Standards + Spec, parallel subagents |
| `receiving-code-review` | When receiving feedback | Verify before implementing, push back with evidence if wrong |
| `verification-before-completion` | Before claiming done | Run test/lint/typecheck, read output, evidence before assertions |
| `commit` | Before git commits | Clean conventional commits |
| `github` | Issues, PRs, CI | gh CLI for issues, PRs, CI runs |
| `prototype` | Design question answerable by building | Throwaway prototype, answer the question, discard |
| `wayfinder` | Fog of war, loose idea | Turn loose idea into investigation tickets, resolve one at a time |
| `research` | Need evidence from primary sources | Background agent, cited markdown, 3+ sources agree → stop |
| `domain-modeling` | Domain terminology, ADRs | Build glossary, record architecture decisions |
| `codebase-design` | Module/interface design | Deep modules, seams, Ousterhout vocabulary |
| `resolving-merge-conflicts` | Git merge/rebase conflict | Resolve in-progress conflicts |

### Adapted Superpowers (3)

Cherry-picked from Superpowers, references removed, transitions point to Matt Pocock skills.

| Skill | What it does |
| ------- | ------------- |
| `brainstorming` | Design before code (adapted, overlaps with Matt Pocock's) |
| `verification-before-completion` | Evidence before claims (adapted) |
| `receiving-code-review` | Verify before implementing (adapted) |

### MongoDB (8) — Official

Auto-trigger when working with MongoDB.

`mongodb-schema-design` · `mongodb-search-and-ai` · `mongodb-query-optimizer` · `mongodb-connection` · `mongodb-mcp-setup` · `mongodb-natural-language-querying` · `mongodb-atlas-stream-processing` · `mongodb-mcp-cluster-per-project`

### Vercel/React (5)

Auto-trigger when building React or deploying to Vercel.

`vercel-react-best-practices` · `vercel-composition-patterns` · `deploy-to-vercel` · `vercel-optimize` · `web-design-guidelines`

### Bright Data (8) — Web Data

Auto-trigger for web tasks. Uses `bdata` CLI.

`search` · `scrape` · `discover-api` · `data-feeds` · `live-research` · `rag-pipeline` · `brightdata-cli` · `bright-data-best-practices`

### Octocode (5) — Code Research

Auto-trigger for evidence-first research.

`octocode` · `octocode-research` · `octocode-brainstorming` · `octocode-rfc-generator` · `octocode-roast`

### UI (3)

`frontend-design` · `impeccable` · `agent-browser`

### Python/OSS (3)

`uv` (use uv not pip) · `github` · `commit`

### Pi Extension Skills (8) — From Packages

Loaded automatically by installed packages.

`pi-intercom` · `pi-subagents` · `prompt-template-authoring` · `librarian` · `ast-grep` · `lsp-navigation` · `write-ast-grep-rule` · `write-tree-sitter-rule`

---

## External CLIs

| CLI | What it does | Free tier |
| ----- | ------------- | ----------- |
| `bdata` (Bright Data) | Web search, scrape, discover, structured data from 40+ platforms | 5,000 credits/month |
| `octocode` | Code research — AST search, cross-repo, PR deep-read, OQL | Free with GitHub auth |
| `gh` | GitHub CLI — issues, PRs, CI | Free |

---

## What We Deliberately Rejected (and why)

| Rejected | Why |
| ---------- | ----- |
| MCP bridge / pi-mcp-adapter | CLI + skills is the Pi way — no subprocess bloat |
| @octocodeai/pi-extension | Conflicts with 6 of our packages (duplicate tools) |
| Superpowers (as package) | Bootstrap injection overrides AGENTS.md workflow — took only 3 unique skills |
| monopi | Bundle installer — we curated individually |
| pi-simplify | code-review skill + subagents cover this |
| rpiv-todo | Pi intentionally has no todos |
| @spences10/pi-team-mode | Conflicts with pi-intercom (second message bus — broker.sock). We keep intercom. |
| @spences10/pi-redact | Redundant — pi-hermes-memory secret-scans on input, pi-observability redacts on stream. Covered. |
| OpenRouter Fusion | We have santa-method cross-model in the loop engine (--cross-model). Don't double up. |

### What we adopted from spences10/my-pi (after 3-reviewer conflict audit)

Adopted (new axes, zero conflict, read the code first): `@spences10/pi-confirm-destructive` (destructive-command gate, aligns with AGENTS.md Safety), `@spences10/pi-context` (oversized-output SQLite sidecar, complements pi-hypa), `@spences10/pi-observability` (read-only browser dashboard). Full audit with file:line evidence in `docs/audits/`.
| GBrain | Personal knowledge brain, not coding, MCP-based |
| octocode-awareness | Claude Code hooks, conflicts with pi-hermes-memory |
| 15 bloat skills | Non-coding, one-time, deprecated, or redundant |

---

## How AGENTS.md Works

The installer creates a single source of truth at `~/.ai/AGENTS.md` and wires all three agents to load it:

```
~/.ai/AGENTS.md  (real file, 124 lines)
     ↑              ↑              ↑
     symlink        @import        symlink
     Pi             Claude Code    Codex
```

- **Pi**: `~/.pi/agent/AGENTS.md` → symlink to `~/.ai/AGENTS.md`
- **Claude Code**: `~/.claude/CLAUDE.md` contains `@~/.ai/AGENTS.md`
- **Codex**: `~/.codex/AGENTS.md` → symlink to `~/.ai/AGENTS.md`

All three agents read the same 124-line workflow on every session start. One file, three agents, zero drift.

---

## Repository Structure

```
my-pi/
├── README.md                          This file
├── LICENSE                            MIT
├── config/
│   ├── settings.json                  12 packages, high thinking, tuned compaction
│   ├── agents.md                      Global AGENTS.md (124 lines, 10-step workflow)
│   ├── models.json                    Grove provider compat config
│   └── prompts/                       8 slash commands (the user interface)
│       ├── build.md                   /build → TDD
│       ├── debug.md                   /debug → diagnosing-bugs
│       ├── feature.md                 /feature → plan→build→review→ship chain
│       ├── fix.md                     /fix → debug→build→review→ship chain
│       ├── plan.md                    /plan → brainstorming
│       ├── research.md                /research → parallel fan-out
│       ├── review.md                  /review → code-review subagents
│       └── ship.md                    /ship → verify + commit + document
├── scripts/
│   ├── install.sh                     One-command installer
│   └── update.sh                      Update all packages + skills
└── skills/                            5 enhanced skills (cc10x audit wins)
    ├── brainstorming/                 Design before code
    ├── code-review/                   Two-axis review + friction scan + AI anti-patterns
    ├── diagnosing-bugs/               10-rung ladder + causal chain gate + loop cap
    ├── receiving-code-review/         Dispute needs proving command
    └── verification-before-completion/ Evidence before claims
```

The installer fetches the other 49 skills from their source repositories (Matt Pocock, MongoDB, Vercel, Bright Data, Octocode).

---

## Pi Ideology

From [Pi's blog](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/):

> Pi keeps the core small and pushes workflow-specific behavior into extensions, skills, prompt templates, and packages. It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash.

This setup respects that. Every capability is an extension, skill, or CLI — never MCP bloat.

---

## Every Pi Power Leveraged

Beyond the 15 packages + 5 extensions + 54 skills, the setup pulls every zero-risk lever the Pi docs offer (full audit in [`docs/audits/pi-docs-levers.md`](docs/audits/pi-docs-levers.md) + [`docs/audits/pi-extension-api-powers.md`](docs/audits/pi-extension-api-powers.md)):

| Lever | What it does |
| --------- | ------------ |
| `enabledModels` (10 patterns) | Ctrl+P one-key model cycling across Claude/GPT/Grok/Kimi/DeepSeek/GLM |
| `externalEditor: code --wait` | Ctrl+G opens VS Code for long prompts (not nano fallback) |
| `treeFilterMode: no-tools` | Cleaner `/tree` navigation through tool-heavy sessions |
| `branchSummary.skipPrompt` | No "Summarize branch?" friction on every `/tree` jump |
| `retry.provider.timeoutMs` + `maxRetryDelayMs` | Fail fast on hung requests / long provider-requested delays |
| `pi.appendEntry` in loop.ts | Loop state persists to the session ledger — survives compaction AND restarts |
| `ctx.fork()` in loop.ts | Each remediation iteration is a rewindable branch point (composes on pi-rewind) |
| `defaultThinkingLevel: xhigh` | Max reasoning on every turn + all 8 subagent roles |
| Two-layer memory | pi-hermes-memory (cross-session SQLite FTS5) + pi-observational-memory (within-session, survives compaction) |
| Context sidecar | @spences10/pi-context stores oversized output (>24KB) in SQLite, retrievable — complements pi-hypa compression |
| Live observability | @spences10/pi-observability browser dashboard at 127.0.0.1:43190 |

**Nothing wasted, nothing over-built.** Every lever is zero-risk (no new moving parts) and harmony-audited (0 critical/major conflicts across all 15 packages + 5 extensions — audits in `docs/audits/`).

> **Note on `PI_CACHE_RETENTION`:** the Pi docs list this env var for extended prompt caching (Anthropic 1h / OpenAI 24h), but it is **NOT compatible with custom OpenAI-compatible gateways** — it injects a `prompt_cache_retention` field the gateway rejects with a 400. Skip it if your provider is a proxy/gateway (like our grove-openai). It only works against native Anthropic/OpenAI endpoints.

---

## Skill Selection Methodology

Every skill was compared prompt-by-prompt against alternatives:

- **TDD:** Matt Pocock vs Superpowers → Matt wins (leaner, seam concept, anti-patterns)
- **Debugging:** Matt Pocock vs Superpowers → Matt wins (feedback loop first, 10 loop types)
- **Code review:** Matt Pocock vs Superpowers → Matt wins (two-axis: standards + spec, Fowler smells)
- **Writing skills:** Matt Pocock vs Superpowers → Matt wins (information hierarchy, context load)
- **Planning:** Matt Pocock vs Superpowers → Matt wins (vertical tracer bullets vs micro-steps)

3 unique Superpowers skills were adapted (references removed, transitions point to Matt Pocock skills).

---

## License

MIT
