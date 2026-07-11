# auto-pi

A Pi coding agent config where the **workflow** — not the model — decides what
to do. Type a task in plain English. The system plans, builds, reviews, debugs,
and ships it through explicit workflows, not LLM whim. No command to remember.
No skill to recall. One rule file, shared across Pi, Claude Code, and Codex.

[![Pi](https://img.shields.io/badge/Pi-v0.80+-blue.svg)](https://pi.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/romiluz13/auto-pi?style=social)](https://github.com/romiluz13/auto-pi)

---

## The idea

Every coding agent ships the same gap: **the model decides what to do, when.**
You get a box of skills and a hope that the LLM picks the right one at the right
time. It won't. It forgets the rules by turn 20, skips the review when it's
"obviously fine," and reports tests passing that it never ran.

auto-pi closes that gap with **structure the model is steered through** — enforced
where Pi's runtime allows (tool restrictions, iteration bounds), prompted where
it doesn't (phase transitions, verification claims):

- **A 10-step autonomous workflow** — Understand → Brainstorm → Plan → Build →
  Test → Review → Verify → Document → Remember → Handoff. The workflow *is* the
  router. Each step names the exact skill to invoke. No router subagent, no
  free will.
- **Guardrails** — keeps the rule file in the system prompt: a one-line reminder
  every turn, the full rules re-injected on session start and after compaction.
  Rules don't fade out of the attention window.
- **A real loop engine** — `/loop` runs Plan → Build → Review → Verify → Ship
  with bounded remediation, plateau detection, independent verifier
  convergence, and a RED guard that refuses to advance a self-reported failing
  test to "done."
- **Coach** — an LLM reads your plain-English task, picks the right workflow
  from the live command catalog, and offers it in one tap. You never type a
  slash command.

The human steers. The structure enforces. The model executes.

## See it

```
you:   add dark mode to the dashboard

coach: → BUILD — add a dark theme token set + toggle
       1. /build  2. /feature  3. just do it
       [enter to accept]

→ /build "add dark mode to the dashboard"
  PLAN   contract gate → design tokens + toggle hook
  BUILD  implement, TDD (red → green), paste exit code as proof
  REVIEW 3 fresh reviewers (standards / spec / security), converge
  VERIFY independent score ≥ 8, no test-honesty hits, reconcile vs anchor
  SHIP   clean conventional commit
```

No slash command was typed. No skill was recalled. The workflow ran itself.

## What's inside

**14 npm packages** — one per capability axis, conflict-checked. Memory,
subagents, LSP/lens, web, intercom, rewind, destructive-command gate, context
sidecar, observability, statusline, structured questions, prompt-template
engine, side conversations. Full list with the axis each owns in
[`config/settings.json`](config/settings.json).

**6 custom extensions** — harmony-preserving glue, each owns one axis:

| Extension | What it does |
| ----------- | -------------- |
| `coach.ts` | Plain-English → workflow. LLM classifies over the live `pi.getCommands()` catalog. One tap to accept. |
| `loop.ts` | Bounded autonomous loop. Contract gate → Plan → Build → Review → Verify → Ship. RED guard, plateau detection, santa convergence, two exits (PASS / CAP). |
| `guardrails.ts` | Keeps AGENTS.md in the system prompt: reminder every turn, full rules on start + after compaction. Defeats mid-session forgetting by construction. |
| `palette.ts` | Fuzzy command palette over every slash command (`Ctrl+Shift+K`). Zero drift — discovers dynamically. |
| `handoff.ts` | Deterministic `HANDOFF.md` generation. No LLM call, no compaction — just the session ledger, rendered. |
| `trace.ts` | Activation observability. Logs what skills/tools the workflow actually activates at each turn. `/trace-skills` shows available vs activated — the orphan detector. |

**9 slash commands** — the user-facing surface, all Coach-routable:

`/build` `/debug` `/feature` `/fix` `/plan` `/research` `/review` `/ship` `/setup-audit`

Plus `/trace` and `/trace-skills` for activation observability.

`/feature` chains `plan → build → review → ship`. `/fix` chains
`debug → build → review → ship`. The rest are single-phase.

**11 hand-tuned skills** — the workflow's executable knowledge:

`brainstorming` · `code-review` · `codebase-hygiene` · `diagnosing-bugs` ·
`diff-driven-docs` · `grilling` · `memory-compounding` · `receiving-code-review` ·
`setup-maintenance` · `setup-matt-pocock-skills` · `verification-before-completion`

Plus **53 community skills** provisioned by `scripts/install.sh` — Matt Pocock's
engineering suite (19), MongoDB (7), Vercel (5), Bright Data (8), Octocode (5),
Python/OSS (3), UX skills (3) — plus package-shipped skills from pi-lens,
pi-subagents, pi-hermes-memory, and pi-web-access. Discovered live by the
harness, invoked by the workflow, never by memorization.

**One 131-line rule file** — `config/agents.md`, the single source of truth
loaded by Pi (contextFiles), Claude Code (`@import`), and Codex (symlink).
Edit once, every agent follows it.

## Why it's different

| Every other agent setup | auto-pi |
| ------------------------ | ------- |
| LLM picks which skill to run, when | The **workflow** picks. The model executes. |
| Rules fade out of context by turn 20 | **Guardrails** keeps them in the prompt — reminder every turn, full rules on start + after compaction |
| "Tests pass" is trusted on the agent's word | **RED guard + evidence block** — a self-reported failing test loops back to fix, not forward to ship; build demands the command + exit code + output as proof |
| One forward-only pipeline | A real **loop engine** with bounded remediation, plateau detection, verifier convergence |
| Remember 20 slash commands | Type English. **Coach** routes. |
| A pile of packages that may conflict | **Harmony-checked** — every axis has one owner, every extension audited by 8 fresh-context reviewers |
| Tied to one tool | One rule file, **three agents** (Pi / Claude Code / Codex) |
| Rots and drifts | **Self-maintaining** — `/setup-audit` runs 6 parallel checks monthly |

## Install

```bash
git clone https://github.com/romiluz13/auto-pi.git
cd auto-pi
./scripts/install.sh
```

The installer wires the rule file across all three agents, installs the 14
packages, deploys the 6 extensions + 9 commands + 11 repo skills, deploys model
definitions, and configures web search. One command. Reload Pi (`/reload`) and
type a task.

**Prerequisites:** Pi (`curl -fsSL https://pi.dev/install.sh | sh`), Node 20+,
npm, git, [mise](https://mise.jdx.dev/) (for `mise exec node@24 -- npm`). `gh` optional.

**Update packages + community skills:** `./scripts/update.sh`

## Use it

```
pi
> add pagination to the user list          # Coach suggests /feature
> !just fix this one typo                  # '!' = raw, no routing
> /loop "migrate auth to JWT end to end"   # hard task → bounded autonomous loop
> /setup-audit                             # monthly health check
```

Prefix `!` for raw mode (no Coach). Prefix `/` to run a command directly.
`Ctrl+Shift+K` opens the palette. `/handoff` writes a continuation doc.

## How it's built

- **It dogfoods itself.** The 2026-07-08 Pocock-alignment prune (issues #1–#8)
  was researched, specced, ticketed, built, and verified by Pi running this
  config. The commits are in the log.
- **It's audited, not just built.** 8 fresh-context reviewers checked every
  extension, package, config, skill, prompt, and doc against the installed Pi
  v0.80.3 type definitions. Findings and fixes live in
  [`docs/audits/`](docs/audits/).
- **It's honest about what it rejected.** Curation is the proof — packages
  excluded for conflict (`pi-dynamic-workflows`, team-mode RPC, the
  `tomsej/pi-ext` bundle) are documented in `extensions/README.md`.

## Structure

```
config/agents.md        the rule file (131 lines, shared across 3 agents)
config/settings.json    14 packages, compaction, retry, memory, subagents
config/models.json      provider + model definitions
extensions/             6 custom TypeScript extensions (coach, loop, guardrails, palette, handoff, trace)
prompts/                9 slash commands (the user interface)
skills/                 11 hand-tuned skills
scripts/install.sh      one-command setup
scripts/update.sh       monthly refresh
docs/audits/            the audit trail
```

## License

MIT
