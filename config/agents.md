# Global AI Agent Rules

Single source of truth for every AI coding tool on this machine (Claude Code, Codex, Cursor, Copilot, Gemini CLI, Pi).

- Keep this file under 200 lines total — every line is a token cost on every session.
- Append only what the agent gets wrong without being told. If an instruction is obvious from the code, delete it.
- Short sentences, imperative mood.

## Environment

- macOS, zsh shell. Node via `mise`.
- Canonical file: `~/.ai/AGENTS.md`. `~/.claude/CLAUDE.md` imports it via `@~/.ai/AGENTS.md`. `~/.codex/AGENTS.md` is a symlink here.
- `~/.agents/skills/` is for third-party skill installs only, not personal skills.

## Pi

- Pi config: `~/.pi/agent/settings.json`. Default thinking: high. Compaction keeps 30k recent tokens.
- Installed packages: `pi-hermes-memory` (persistent memory), `pi-subagents` (child agent delegation), `pi-lens` (LSP/lint/format on edit), `pi-context-prune` (token savings, enabled), `@narumitw/pi-statusline` (status bar), `pi-intercom` (subagent-to-parent communication), `pi-prompt-template-model` (model/skill auto-switching), `pi-btw` (side conversations), `@juicesharp/rpiv-ask-user-question` (structured questions), `pi-rewind` (checkpoint/undo).
- Code research: `npx octocode` CLI (14 tools: search, AST, LSP, GitHub, npm, binary, OQL). 5 skills: `octocode`, `octocode-research`, `octocode-brainstorming`, `octocode-rfc-generator`, `octocode-roast`.
- Web access: `bdata` CLI (Bright Data). Auth via OAuth (`bdata login`). Free tier: 5,000 credits/month. Skills: `search`, `scrape`, `discover-api`, `data-feeds`, `live-research`, `rag-pipeline`, `brightdata-cli`, `bright-data-best-practices`, `proxy`, `python-sdk-best-practices`, `js-sdk-best-practices`, `agent-onboarding`.
- Memory: pi-hermes-memory stores facts, corrections, failures across sessions. Policy-only injection — agent calls `memory_search` when it needs context. One-time setup: `/memory-interview`, `/memory-index-sessions`, `/learn-memory-tool`.
- Subagents: delegate via natural language ("Use reviewer to review this diff"). Subagents can ask parent via pi-intercom when blocked.
- `/rewind` for checkpoint-based undo. `/btw` for side questions. `ask_user_question` for structured clarifications.

## Autonomous workflow

When given a task, follow this flow automatically. Don't ask which skill to use — pick based on task size and type.

1. **Understand.** Read repo AGENTS.md, relevant files, existing patterns. Search memory for relevant context. If ambiguous, ask ONE clarifying question. If clear, proceed.
2. **Plan (big tasks only).** >3 files or new feature → write a spec via `/to-spec`. Break into tickets via `/to-tickets`. For enormous fog-of-war tasks → `/wayfinder`. Bug fix or small change → skip to step 3.
3. **Build.** Implement following existing patterns. Don't over-engineer. LSP runs automatically on every edit via pi-lens — fix type errors immediately.
4. **Test.** Run relevant tests. No tests for changed code → write them (TDD skill: test first, see fail, implement, see pass). Tests fail → diagnose (`diagnosing-bugs` skill: root cause, not symptom).
5. **Review.** Run a reviewer subagent: "Use reviewer to review this diff." Fix issues found. For critical code → run `code-review` skill (parallel standards + spec review).
6. **Document.** Change alters durable contract, API, workflow, or gotcha → update repo AGENTS.md. User-facing change → update CHANGELOG. Don't create new doc files unless significant.
7. **Remember.** Save decisions, gotchas, failures, corrections to memory via `memory` tool. Don't save obvious things — save what you'd want to know next time.
8. **Handoff.** Session getting long or task incomplete → `/handoff` to create continuation doc. Don't lose context.

Skip steps that don't apply. Don't ask permission for steps that do apply — just do them. External tech → validate APIs first (see below).

## Working style

- Trust but verify. State results directly — no "Let me..." narration, no end-of-turn recaps unless asked.
- Don't add features, abstractions, or error handling beyond what the task requires. Three similar lines beats a premature helper.
- Default to writing no comments. Explain WHY (hidden constraint, non-obvious invariant) never WHAT.
- Never mark a task complete if tests fail, implementation is partial, or there are unresolved errors.

## External tech: mandatory validation

Any time the project pulls in an external technology (framework, SDK, hosted service) you MUST validate latest-version APIs before writing code that uses it.

Steps:
1. Check installed version (`package.json`, `node_modules/<pkg>/package.json`).
2. Validate against current docs: Pi uses `bdata search` + `bdata scrape`, or `npx octocode` for GitHub/npm.
3. Run `find-skills` for that tech — if a skill exists (e.g. vercel-react-best-practices), use it.
4. Read local docs if shipped (`node_modules/<pkg>/dist/docs/`, README, CHANGELOG).

Skip only for: pure utility libs with stable APIs (date-fns, zod, lodash). When in doubt, validate.

## Safety

- Never commit `.env*`, credentials, secrets, or keys.
- Never run destructive git operations (`push --force`, `reset --hard`, branch deletion) without explicit confirmation.
- Never skip hooks (`--no-verify`) unless the user requests it.
- Before installing a plugin, MCP server, or skill from a public source, confirm the source is trustworthy.

## Repository conventions

- Respect existing patterns over introducing new ones.
- Prefer editing an existing file over creating a new one.
- `CLAUDE.md` in a repo overrides these global rules for that repo.
- Complex repos get ONE lean root `AGENTS.md` holding only non-inferable facts: gotchas, deploy mechanics, project-specific overrides.

## Hygiene

- Monthly: run `/memory-insights`, `/memory-consolidate` in Pi. Check `bdata zones` for credit usage.
- `~/.agents/skills/` should contain only skills that earn their place in the system prompt.
