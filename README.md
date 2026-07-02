# my-pi

**The best Pi coding agent setup — 10 packages, 44 skills, autonomous workflow. Zero bloat, zero MCP, pure Pi ideology.**

[![Pi](https://img.shields.io/badge/Pi-v0.80+-blue.svg)](https://pi.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What This Is

A curated, reproducible Pi coding agent setup built on three principles:

1. **Every piece earns its place.** No bloat, no duplicates, no "just in case" packages.
2. **CLI + skills, not MCP.** Pi's philosophy is minimal — web access via CLI, code research via CLI, not MCP servers with 93 deps.
3. **Autonomous by default.** The agent plans, builds, tests, reviews, documents, and remembers without manual skill invocation.

## What You Get

### 10 Pi Packages

| Package | What it does |
|---------|-------------|
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
|-----|-------------|
| `bdata` (Bright Data) | Web search, scrape, discover — 5,000 free credits/month |
| `octocode` | Code research — AST search, minify, cross-repo, PR deep-read, OQL |
| `gh` | GitHub CLI — issues, PRs, CI |

### 44 Skills

- **Matt Pocock** (latest, byte-verified): tdd, handoff, prototype, grill-with-docs, to-spec, to-tickets, triage, implement, code-review, research, wayfinder, wizard, codebase-design, domain-modeling, diagnosing-bugs, resolving-merge-conflicts, writing-great-skills, teach, improve-codebase-architecture
- **Bright Data** (13): search, scrape, discover-api, data-feeds, live-research, rag-pipeline, brightdata-cli, bright-data-best-practices, proxy, python-sdk-best-practices, js-sdk-best-practices, agent-onboarding
- **Octocode** (5): octocode, octocode-research, octocode-brainstorming, octocode-rfc-generator, octocode-roast
- **Vercel** (2): vercel-composition-patterns, vercel-react-best-practices
- **Other**: find-skills, frontend-design, skill-router, git-guardrails-claude-code, setup-pre-commit, higgsfield-generate

### Autonomous Workflow

The agent follows this flow automatically — no manual skill invocation:

```
1. Understand    → read repo AGENTS.md, search memory, read existing code
2. Plan          → big tasks → /to-spec + /to-tickets, enormous → /wayfinder
3. Build         → implement following existing patterns, LSP runs on every edit
4. Test          → TDD: write test, see fail, implement, see pass
5. Review        → spawn reviewer subagent, fix issues
6. Document      → update repo AGENTS.md on durable changes
7. Remember      → save decisions, gotchas, failures to memory
8. Handoff       → /handoff if session gets long or task incomplete
```

## Quick Start

```bash
# 1. Clone and run the installer
git clone https://github.com/romiluz13/my-pi.git
cd my-pi
./scripts/install.sh

# 2. Authenticate external CLIs (one time)
bdata login           # Bright Data — browser OAuth, free
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
|----------|-----|
| MCP bridge / pi-mcp-adapter | CLI + skills is the Pi way — no subprocess bloat |
| @octocodeai/pi-extension | Conflicts with 6 of our packages (duplicate tools) |
| pi-web-access | bdata CLI covers web access |
| pi-permission-system | Pi trusts the agent — no permission popups |
| monopi | Bundle installer — we curated individually |
| pi-simplify | code-review skill + subagents cover this |
| rpiv-todo | Pi intentionally has no todos |
| GBrain | Personal knowledge brain, not coding, MCP-based |

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
│   ├── settings.json       Pi settings (packages, thinking, compaction)
│   ├── agents.md           Global AGENTS.md with autonomous workflow
│   └── prune.json          pi-context-prune config
├── scripts/
│   ├── install.sh          One-command installer
│   └── update.sh           Update all packages + skills
└── skills/                 Skill sources (Bright Data, Matt Pocock)
```

## License

MIT
