# auto-pi

> The workflow decides what to do. The model executes. You steer.

A Pi coding agent config that makes skills **actually fire** — not sit in a catalog hoping the LLM notices them. Type a task, pick a workflow, and the skill content is mechanically injected. No improvisation. No orphans. One rule file, shared across Pi, Claude Code, and Codex.

[![Pi](https://img.shields.io/badge/Pi-v0.80+-blue.svg)](https://pi.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/romiluz13/auto-pi?style=social)](https://github.com/romiluz13/auto-pi)

---

## The problem

Every coding agent ships the same broken loop:

1. **Skills sit in a catalog** — 70+ skills in the system prompt, the model picks whichever it feels like
2. **Rules fade** — by turn 20, the agent forgot your conventions
3. **"Tests pass" is trusted on faith** — no proof, no evidence, no independent check
4. **Workflows are prose** — the agent reads "use TDD" and improvises, instead of loading the actual TDD skill

auto-pi fixes all four.

## How it works

```
you:   add dark mode to the dashboard

coach: ┌─────────────────────────────────────────────────────────┐
       │ Coach — pick a workflow for: "add dark mode to the       │
       │ dashboard"                                               │
       │                                                          │
       │  1. Just do it (raw agent)                               │
       │  2. /build — Build with TDD (red → green → prove it)     │
       │  3. /feature — Fast chain: plan → build → review → ship  │
       │  4. /loop — Bounded loop with phase gates + approval     │
       │  5. /debug — Debug an issue                              │
       │  6. /fix — Fast chain: debug → build → review → ship     │
       │  7. /plan — Plan only (no code)                          │
       │  8. /research — Research a topic                         │
       │  9. /review — Review current diff                        │
       │ 10. /ship — Ship (verify, document, commit, PR)          │
       │ 11. Browse all commands (/palette)                        │
       └─────────────────────────────────────────────────────────┘

→ you pick 2 → /build "add dark mode to the dashboard"
  ↓ the tdd skill is mechanically injected via the skill: frontmatter pin
  ↓ the model gets the REAL TDD procedure, not an improvisation
  ↓ BUILD  implement, red → green, paste exit code as proof
  ↓ (then /review → code-review skill injected → parallel reviewers)
  ↓ (then /ship → verification skill injected → independent audit → commit)
```

**The skill fires because the prompt command runs.** Not because the model hopefully read a description.

## What makes it different

| Every other setup | auto-pi |
| --- | --- |
| 70 skills in catalog, model picks whatever | **Coach's fixed menu** → you pick a workflow → `skill:` pin fires → skill content is mechanically injected |
| Agent improvises TDD from prose | Agent runs `/build` → `tdd` skill is injected → the actual TDD procedure is in context |
| Rules fade by turn 20 | **Guardrails** re-injects AGENTS.md every turn + full rules after compaction |
| "Tests pass" on faith | **RED guard + evidence block** — failing tests loop back, not forward; build demands command + exit code + output |
| One forward pipeline | **Loop engine** — bounded remediation, plateau detection, independent verifier convergence, phase tool-gates |
| No idea which skills fired | **`/trace-skills`** — shows available vs activated in real time; orphans are visible |
| Packages may conflict | **Harmony-checked** — 8 independent audits, 80+ findings fixed, every axis has one owner |
| Tied to one tool | One rule file, **three agents** (Pi / Claude Code / Codex) |

## The activation guarantee

Six skills are **mechanically pinned** via `skill:` frontmatter — they fire 100% of the time when the prompt runs, no exceptions:

| Skill | Fires when | How |
| --- | --- | --- |
| `brainstorming` | `/plan` | `skill:` frontmatter pin |
| `tdd` | `/build` | `skill:` frontmatter pin |
| `diagnosing-bugs` | `/debug` | `skill:` frontmatter pin |
| `research` | `/research` | `skill:` frontmatter pin |
| `code-review` | `/review` | `skill:` frontmatter pin |
| `verification-before-completion` | `/ship` | `skill:` frontmatter pin |

Eighteen more skills are **explicitly steered** with `/skill:` notation in prompts, AGENTS.md, and loop phases — the model is told to run them at the right moment. The loop engine's four phases each name their skills: PLAN→`brainstorming`, BUILD→`implement`+`tdd`+`diagnosing-bugs`, REVIEW→`code-review`+`receiving-code-review`, SHIP→`verification`+`commit`+`github`.

> **Technical note:** with our installed `pi-prompt-template-model`, `skill:` is one-per-prompt. Multi-skill hard pins would need a package upgrade or separate prompts. The `/skill:` steer pattern is the workaround — it's not a mechanical pin, but it's far better than hoping the model discovers the skill from its description alone.

~50 domain skills (MongoDB, Vercel, Bright Data, Octocode) activate via model auto-discovery from their descriptions — this is by design for domain-specific capabilities.

## What's inside

**14 npm packages** — one per capability axis, zero collisions:
memory · subagents · LSP/lens · web · intercom · rewind · destructive-gate · context-sidecar · observability · statusline · questions · prompt-engine · side-conversations · web-access

**6 custom extensions:**

| Extension | What it does |
| --- | --- |
| `coach.ts` | Fixed 9-option workflow menu for plain-English tasks. You pick → skill fires. |
| `loop.ts` | Bounded autonomous loop: contract gate → plan → build → review → verify → ship. RED guard, plateau detection, per-phase tool restrictions. |
| `guardrails.ts` | Keeps AGENTS.md in the system prompt. Reminder every turn, full rules on start + after compaction. |
| `trace.ts` | Activation observability. `/trace-skills` shows available vs activated — the orphan detector. |
| `palette.ts` | Fuzzy command palette (`Ctrl+Shift+K`). Zero drift — discovers dynamically. |
| `handoff.ts` | Deterministic `HANDOFF.md` from session ledger. No LLM call. |

**9 slash commands** — each with a `skill:` pin that mechanically injects the skill:
`/build` `/debug` `/feature` `/fix` `/plan` `/research` `/review` `/ship` `/setup-audit`

**11 hand-tuned skills** + **53 community skills** (Matt Pocock, MongoDB, Vercel, Bright Data, Octocode, Python/OSS, UX) provisioned by `install.sh`.

**One 137-line rule file** — `config/agents.md`, shared across Pi, Claude Code, and Codex. Says "MUST run `/build`" — not "use TDD" — so skills actually fire.

## Install

```bash
git clone https://github.com/romiluz13/auto-pi.git
cd auto-pi
./scripts/install.sh
```

One command: 14 packages, 6 extensions, 9 commands, 64 skills, model definitions, AGENTS.md wired across three agents. Reload Pi (`/reload`) and type a task.

**Prerequisites:** Pi, Node 20+, npm, git, [mise](https://mise.jdx.dev/). `gh` optional.

**Update:** `./scripts/update.sh` (packages + community skills + curated assets)

## Use it

```
pi
> add pagination to the user list          # Coach shows 9 options → pick /feature
> !just fix this one typo                  # '!' = raw, no Coach
> /loop "migrate auth to JWT end to end"   # hard task → bounded loop
> /trace-skills                            # see which skills fired vs orphaned
```

## Proven, not just built

- **8 independent audits** (48+ subagents across 6 LLM providers) — every extension, package, skill, prompt, and config checked. 80+ findings fixed. 3 refuted by source verification.
- **Dogfooded** — the Pocock-alignment prune was researched, specced, built, and verified by Pi running this config.
- **Observable** — the first dogfood test caught 0/6 Grade A skills activating (the agent improvised from prose). The Coach fixed-menu fix was the response. `/trace-skills` proved it worked.
- **Honest about rejections** — packages excluded for conflict are documented in `extensions/README.md`.

## Structure

```
config/agents.md        the rule file (137 lines, shared across 3 agents)
config/settings.json    14 packages, compaction, retry, memory, subagents
config/models.json      provider + model definitions
extensions/             6 TypeScript extensions
prompts/                9 slash commands (each with a skill: pin)
skills/                 11 hand-tuned skills
scripts/install.sh      one-command setup
scripts/update.sh       refresh everything
docs/audits/            the audit trail
vendor/                 legacy namespace shims
```

## License

MIT
