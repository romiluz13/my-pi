# my-pi

**The best Pi coding agent setup — 10 packages, 59 skills, 10-step autonomous workflow. Zero bloat, zero MCP, pure Pi ideology.**

[![Pi](https://img.shields.io/badge/Pi-v0.80+-blue.svg)](https://pi.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What This Is

A curated, reproducible Pi coding agent setup built on three principles:

1. **Every piece earns its place.** No bloat, no duplicates, no "just in case" packages.
2. **CLI + skills, not MCP.** Pi's philosophy is minimal — web access via CLI, code research via CLI, not MCP servers with 93 deps.
3. **Autonomous by default.** The agent brainstorms, plans, builds, tests, reviews, verifies, documents, and remembers without manual skill invocation.

## What You Get

### 10 Pi Packages

| Package | What it does |
| --------- | ------------- |
| pi-hermes-memory | Persistent memory, session search, learns from corrections |
| pi-subagents | Delegate to child agents — review, scout, parallel work |
| pi-lens | LSP diagnostics, linters, formatters on every edit |
| pi-context-prune | Summarize old tool outputs → token savings |
| @narumitw/pi-statusline | Model, tokens, cost, git branch in status bar |
| pi-intercom | Subagents can ask parent session when blocked |
| pi-prompt-template-model | `/build` → auto-switch model+skills → restore |
| pi-btw | Side questions without polluting main context |
| @juicesharp/rpiv-ask-user-question | Structured clarifying questions instead of guessing |
| pi-rewind | `/rewind` — checkpoint browser, diff preview, redo stack |

### External CLIs

| CLI | What it does |
| ----- | ------------- |
| `bdata` (Bright Data) | Web search, scrape, discover — 5,000 free credits/month |
| `octocode` | Code research — AST search, minify, cross-repo, PR deep-read, OQL |
| `gh` | GitHub CLI — issues, PRs, CI |

### 59 Skills

**Matt Pocock** (19) — tdd, handoff, prototype, grill-with-docs, to-spec, to-tickets, triage, implement, code-review, research, wayfinder, wizard, codebase-design, domain-modeling, diagnosing-bugs, resolving-merge-conflicts, writing-great-skills, teach, improve-codebase-architecture

**MongoDB** (7 official) — schema-design, search-and-ai, query-optimizer, connection, mcp-setup, natural-language-querying, atlas-stream-processing

**Vercel** (5) — react-best-practices, composition-patterns, deploy-to-vercel, web-design-guidelines, agent-browser

**Bright Data** (6) — search, scrape, discover-api, data-feeds, live-research, brightdata-cli

**Octocode** (5) — octocode, octocode-research, octocode-brainstorming, octocode-rfc-generator, octocode-roast

**Adapted Superpowers** (3) — brainstorming (design before code), verification-before-completion (evidence before claims), receiving-code-review (verify before implementing)

**Python/OSS** (3) — uv, github, commit

**Other** (11) — find-skills, frontend-design, impeccable, compact-safe, skill-router, git-guardrails-claude-code, setup-pre-commit, mongodb-mcp-cluster-per-project, octocode, vercel-optimize, to-spec

### 10-Step Autonomous Workflow

```
1.  Understand       → read repo, search memory, ask one question if needed
2.  Brainstorm       → new features: design before code, get user approval
3.  Plan             → /to-spec + /to-tickets, or /wayfinder for fog-of-war
4.  Build            → implement, LSP catches errors on every edit
5.  Test             → TDD (test first, see fail, implement, see pass)
6.  Review           → subagent reviewer + code-review + receiving-code-review
7.  Verify           → verification-before-completion: evidence before claims
8.  Document         → update AGENTS.md on durable changes
9.  Remember         → save to memory via pi-hermes-memory
10. Handoff          → /handoff if session gets long
```

## Quick Start

```bash
# 1. Clone and run the installer
git clone https://github.com/romiluz13/my-pi.git
cd my-pi
./scripts/install.sh

# 2. Authenticate external CLIs (one time)
bdata login              # Bright Data — browser OAuth, free
npx octocode auth login  # GitHub — for code research

# 3. Start Pi and run one-time setup
pi
/memory-interview        # tells Pi who you are
/memory-index-sessions   # indexes past sessions
/learn-memory-tool       # teaches memory tools

# 4. Just start coding
```

## What We Deliberately Rejected (and why)

| Rejected | Why |
| ---------- | ----- |
| MCP bridge / pi-mcp-adapter | CLI + skills is the Pi way — no subprocess bloat |
| @octocodeai/pi-extension | Conflicts with 6 of our packages (duplicate tools) |
| Superpowers (as package) | Bootstrap injection overrides AGENTS.md workflow — we took only the 3 unique skills |
| pi-web-access | bdata CLI covers web access |
| pi-permission-system | Pi trusts the agent — no permission popups |
| monopi | Bundle installer — we curated individually |
| pi-simplify | code-review skill + subagents cover this |
| rpiv-todo | Pi intentionally has no todos |
| GBrain | Personal knowledge brain, not coding, MCP-based |
| octocode-awareness | Claude Code hooks, conflicts with pi-hermes-memory |
| 15 bloat skills | Non-coding, one-time, deprecated, or redundant |

## Skill Selection Methodology

Every skill was compared prompt-by-prompt against alternatives:

- **TDD:** Matt Pocock vs Superpowers → Matt wins (leaner, seam concept, anti-patterns)
- **Debugging:** Matt Pocock vs Superpowers → Matt wins (feedback loop first, 10 loop types)
- **Code review:** Matt Pocock vs Superpowers → Matt wins (two-axis: standards + spec, Fowler smells)
- **Writing skills:** Matt Pocock vs Superpowers → Matt wins (information hierarchy, context load)
- **Planning:** Matt Pocock vs Superpowers → Matt wins (vertical tracer bullets vs micro-steps)

3 unique Superpowers skills were adapted (Superpowers references removed, transitions point to Matt Pocock skills).

## Pi Ideology

From [Pi's blog](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/):

> Pi keeps the core small and pushes workflow-specific behavior into extensions, skills, prompt templates, and packages. It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash.

This setup respects that. Every capability is an extension, skill, or CLI — never MCP bloat.

## Structure

```
my-pi/
├── README.md               This file
├── LICENSE                 MIT
├── config/
│   ├── settings.json       Pi settings (10 packages, high thinking, tuned compaction)
│   ├── agents.md           Global AGENTS.md with 10-step autonomous workflow (real file)
│   └── prune.json          pi-context-prune config
├── scripts/
│   ├── install.sh          One-command installer (packages + CLIs + skills + AGENTS.md + symlinks)
│   └── update.sh           Update all packages + skills
└── skills/
    ├── brainstorming/              Adapted from Superpowers (design before code)
    ├── verification-before-completion/  Adapted from Superpowers (evidence before claims)
    ├── receiving-code-review/      Adapted from Superpowers (verify before implementing)
    └── README.md           Skill sources documentation
```

## How AGENTS.md is loaded

The installer creates a single source of truth at `~/.ai/AGENTS.md` and wires all three agents to load it:

```
~/.ai/AGENTS.md  (real file, 120 lines)
     ↑              ↑              ↑
     symlink        @import        symlink
     Pi             Claude Code    Codex
```

- **Pi**: `~/.pi/agent/AGENTS.md` → symlink to `~/.ai/AGENTS.md`
- **Claude Code**: `~/.claude/CLAUDE.md` contains `@~/.ai/AGENTS.md`
- **Codex**: `~/.codex/AGENTS.md` → symlink to `~/.ai/AGENTS.md`

All three agents read the same 120-line workflow on every session start.

## License

MIT
