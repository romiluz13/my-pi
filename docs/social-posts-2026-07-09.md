# Social posts — my-pi launch (2026-07-09)

Three platform-specific posts. Same proof, different formats. Review, tweak, post.

---

## X (Twitter) — thread format

**Tweet 1:**

I've been building a Pi coding agent setup that does what I always wanted: the agent decides, I never memorize a command.

14 packages. 56 skills. 5 custom extensions. One 131-line rule file shared across Pi + Claude Code + Codex.

Here's what it actually does ↓

[repo: github.com/romiluz13/my-pi]

**Tweet 2:**

You type a task in plain English. Coach routes it via an LLM call to the right workflow — one tap to confirm.

"add dark mode to the dashboard"
→ Coach suggests /feature (plan→build→review→ship)
→ also activates frontend-design + web-design-guidelines skills
→ runs autonomously until done

No memorized commands.

**Tweet 3:**

The routing isn't a hard-coded regex table. It reads the live command catalog (pi.getCommands()) every call.

Drop a new skill in the folder → Coach can route to it on the next input. Zero code or config edit.

This is the Matt Pocock school: the agent is smart, give it judgment.

**Tweet 4:**

It self-maintains:

/setup-audit runs 6 parallel subagents — versions, harmony, Coach coverage, disk, AGENTS.md, ecosystem steals.

And it dogfoods itself: the coach rewrite + guardrails change + skill flips were all researched, specced, built, and verified using this exact setup. Commits are in the git log.

**Tweet 5:**

What it rejected (curation is proof):

- MCP bridge → CLI + skills is the Pi way
- @hypabolic/pi-hypa → broke multi-line bash
- Superpowers as package → overrode the workflow, took 3 skills
- 9 more with documented reasons

13 rejections, each with a reason. Read them in the repo.

github.com/romiluz13/my-pi

---

## Reddit — r/ClaudeCode or r/codingagents or r/LocalLLaMA

**Title:** I built a Pi coding agent setup where the agent decides and I never memorize a command — 14 packages, 56 skills, 5 custom extensions, zero bloat

**Body:**

I've been using Pi (the coding agent by Mario Zechner) for a while and kept hitting the same wall: great primitives, but I had to remember which slash command to type and which skill to activate. So I built a setup that inverts that — the agent decides, I just describe what I want.

## What it does

You type a task in plain English. An extension called Coach routes it — via an LLM call over the live command catalog — to the right workflow. One tap to confirm, or pick another.

Example: I type "add dark mode to the dashboard." Coach suggests `/feature` (plan→build→review→ship), auto-activates the frontend-design and web-design-guidelines skills, and runs autonomously until the feature is reviewed, verified, and committed. I didn't memorize a command or manually invoke a skill.

## Why it's not just another skill dump

1. **The routing is LLM judgment, not a regex table.** Coach reads the live command list (`pi.getCommands()`) every call. Add a new skill tomorrow and Coach can route to it automatically — zero code or config edit. This is the Matt Pocock methodology: the agent is smart, give it judgment.

2. **Every piece earns its place.** 13 packages/skills were rejected with documented reasons (in the README). The one package that broke multi-line bash got removed. The AGENTS.md was slimmed from 152 to 131 lines because ETH Zurich research showed re-injecting a huge rulebook every turn actually *breaks* reasoning (+20% inference cost).

3. **It self-maintains.** `/setup-audit` runs 6 parallel subagents checking versions, harmony, Coach coverage, disk, AGENTS.md, and ecosystem steals. Run it monthly.

4. **It dogfoods itself.** The latest prune — rewriting Coach from regex to LLM, flipping 14 user-invoked skills to auto-decide, conditional guardrails injection — was researched, specced, ticketed, built, and verified using this exact setup. The GitHub issues (#1-#8) and commits are public.

## What's in it

- **14 packages** — two-layer memory (cross-session SQLite + within-session compaction-survival), LSP diagnostics, subagents, context sidecar, observability dashboard, destructive-op gate, and more
- **5 custom extensions** — Coach (LLM routing), loop engine (bounded with phase gates + cross-model verifier), guardrails (conditional re-injection), palette, handoff
- **56 skills** — Matt Pocock core workflow, MongoDB (8), Vercel/React (5), Bright Data web (8), Octocode code research (5), UI, Python, code quality
- **9 slash commands** + `/loop` for hard multi-phase tasks
- **3 external CLIs** — bdata (web), octocode (code research), gh (GitHub)

## The ideology

Pi keeps the core small and pushes workflow into extensions, skills, and CLIs — no built-in MCP, no subprocess bloat. This setup respects that. Every capability is an extension, skill, or CLI.

The 10-step autonomous workflow (understand → brainstorm → plan → build → test → review → verify → document → remember → handoff) is defined in one 131-line file shared across Pi, Claude Code, and Codex via symlink/@import.

Repo: <https://github.com/romiluz13/my-pi>

Happy to answer questions. The audit reports are in `docs/audits/` if you want to verify the harmony claims yourself.

---

## LinkedIn — professional tone, longer-form

**Post:**

I've been quietly building something I'm proud of: a coding agent setup where the agent decides and I never have to memorize a command.

The problem I kept hitting: great AI coding tools (Pi, Claude Code, Codex) give you powerful primitives — slash commands, skills, subagents — but the cognitive load is on the human. You have to remember which command for which task, which skill to activate, when to fan out reviewers vs. build solo.

So I built a setup that inverts that.

You type a task in plain English: "add dark mode to the dashboard." An extension called Coach routes it — via an LLM call over the live command catalog — to the right workflow. It auto-activates the relevant skills (frontend-design, web-design-guidelines). It runs autonomously: plan → build → review → verify → commit. One tap to confirm at the start; then it goes to done.

Three things I'm proud of:

**1. The routing is LLM judgment, not a hard-coded regex table.** Coach reads the live command list every call. Add a new skill tomorrow and it's automatically routable — zero code or config edit. This is the Matt Pocock methodology: the agent is smart, give it judgment. (I previously had a 370-line regex classifier and ripped it out because it contradicted the ideology.)

**2. It's been audited, not just built.** 3 fresh-context reviewers checked every extension and package for conflicts. 13 packages/skills were rejected with documented reasons. The AGENTS.md rule file was slimmed because ETH Zurich research showed re-injecting a huge rulebook every turn actually breaks reasoning (+20% cost) — so guardrails now inject fully only on session start and after compaction, with a 1-line reminder otherwise.

**3. It dogfoods itself.** The latest improvements — rewriting Coach from regex to LLM, flipping 14 user-invoked skills to auto-decidable, conditional guardrails — were researched, specced, ticketed, built, and verified using this exact setup. The GitHub issues and commits are public.

What's in it: 14 packages, 56 skills, 5 custom TypeScript extensions, 9 slash commands, a bounded loop engine with cross-model verifier convergence, two-layer persistent memory (cross-session SQLite + within-session compaction-survival), and a self-maintaining `/setup-audit` command.

It's open source (MIT). One-command install. Works with Pi, and the rule file is shared with Claude Code and Codex via symlink/@import.

Repo: <https://github.com/romiluz13/my-pi>

The audit reports are in `docs/audits/` if you want to verify the claims. Happy to answer questions about the architecture or the methodology.

# AICoding #DeveloperTools #OpenSource #CodingAgents #Pi
