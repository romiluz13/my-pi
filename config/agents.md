# Global AI Agent Rules

Single source of truth for every AI coding tool on this machine (Claude Code, Codex, Cursor, Copilot, Gemini CLI, Pi).

- Keep this file under 200 lines total — every line is a token cost on every session.
- Append only what the agent gets wrong without being told. If an instruction is obvious from the code, delete it.
- Short sentences, imperative mood.

## Environment

- macOS, zsh shell. Node via `mise`.
- AWS profile `ai-prod-llm`; Bedrock is the Claude Code backend.
- Canonical file: `~/.ai/AGENTS.md`. `~/.claude/CLAUDE.md` imports it via `@~/.ai/AGENTS.md`. `~/.codex/AGENTS.md` is a symlink here.
- Personal skills: edit ONLY in `~/Dev/ux-skills/`. Install to `~/.claude/skills/` ONLY via `~/Dev/ux-skills/scripts/install-symlinks.sh`. Cursor reads that path via compat — do NOT also install in `~/.cursor/skills/` or `~/.agents/skills/` (causes duplicate loading).
- Global subagents: real files in `~/.claude/agents/` only. Do not mirror to `~/.cursor/agents/`.
- `~/.agents/skills/` is for third-party `npx skills` installs only, not personal skills.
- Never put files or symlinks in `~/.cursor/skills-cursor/`.
- Validate: `~/.ai/validate-skills-layout.sh`. Repair: `~/Dev/ux-skills/scripts/install-symlinks.sh`. Plugin cache: `~/.ai/clean-plugin-cache.sh --apply`.
- Install plugins per-project (`.claude/settings.json` in each repo) unless truly used everywhere.
- cc10x is installed (`cc10x@cc10x`, v11.1.0). Do not remove or reinstall without explicit user request.

## Pi

- Pi config: `~/.pi/agent/settings.json`. Provider: Grove (OpenAI-compatible). Default model: FW-GLM-5.2.
- Installed packages: `pi-hermes-memory` (persistent memory, session search), `pi-subagents` (child agent delegation), `pi-lens` (LSP/lint/format on edit), `pi-context-prune` (token savings, enabled via `~/.pi/agent/context-prune/settings.json`), `@narumitw/pi-statusline` (status bar), `pi-intercom` (subagent-to-parent communication), `pi-prompt-template-model` (model/skill auto-switching per command), `pi-btw` (side conversations without context pollution), `@juicesharp/rpiv-ask-user-question` (structured clarifying questions).
- Code research: `npx octocode` CLI (14 tools: search, AST, LSP, GitHub, npm, binary, OQL). 5 skills installed: `octocode`, `octocode-research`, `octocode-brainstorming`, `octocode-rfc-generator`, `octocode-roast`. NOT installed: `@octocodeai/pi-extension` (conflicts with pi-hermes-memory, pi-context-prune, bdata — registers duplicate tools). NOT installed: `octocode-awareness` (uses Claude Code hooks, conflicts with pi-hermes-memory).
- Web access: `bdata` CLI (Bright Data). Auth via OAuth (`bdata login`). Free tier: 5,000 credits/month. Skills: `search`, `scrape`, `discover-api`, `data-feeds`, `live-research`, `rag-pipeline`, `brightdata-cli`, `bright-data-best-practices`, `proxy`, `python-sdk-best-practices`, `js-sdk-best-practices`, `agent-onboarding`.
- Memory: pi-hermes-memory stores facts, corrections, failures across sessions. Policy-only injection by default — agent calls `memory_search` when it needs context. One-time setup: `/memory-interview`, `/memory-index-sessions`, `/learn-memory-tool`.
- Subagents: delegate via natural language ("Use reviewer to review this diff"). No config needed. Subagents can ask parent session via pi-intercom when blocked.
- Thinking: `defaultThinkingLevel: high`. Compaction keeps 30k recent tokens.
- `/btw` for side questions without polluting main context. `ask_user_question` tool for structured clarifications.
- Skills load from `~/.pi/agent/skills/` and `~/.agents/skills/`. Pi deduplicates by canonical path (symlinks resolved).

## Autonomous workflow

When given a task, follow this flow automatically. Don't ask which skill to use — pick based on task size and type.

1. **Understand.** Read repo AGENTS.md, relevant files, existing patterns. Search memory for relevant context. If ambiguous, ask ONE clarifying question. If clear, proceed.
2. **Brainstorm (new features).** Before building anything new, use `brainstorming` skill — explore context, ask questions one at a time, propose approaches, present design, get user approval. Save design doc to `docs/specs/`.
3. **Plan (big tasks only).** >3 files or new feature → write a spec via `/to-spec`. Break into tickets via `/to-tickets`. For enormous fog-of-war tasks → `/wayfinder`. Bug fix or small change → skip to step 4.
4. **Build.** Implement following existing patterns. Don't over-engineer. LSP runs automatically on every edit via pi-lens — fix type errors immediately.
5. **Test.** Run relevant tests. No tests for changed code → write them (TDD skill: test first, see fail, implement, see pass). Tests fail → diagnose (`diagnosing-bugs` skill: root cause, not symptom).
6. **Review.** Run a reviewer subagent: "Use reviewer to review this diff." Fix issues found. For critical code → run `code-review` skill (parallel standards + spec review). When receiving review feedback → use `receiving-code-review` skill (verify before implementing, push back if wrong).
7. **Verify.** Before claiming work is complete → use `verification-before-completion` skill: run the verification command, read full output, confirm. Evidence before claims, always.
8. **Document.** Change alters durable contract, API, workflow, or gotcha → update repo AGENTS.md. User-facing change → update CHANGELOG. Don't create new doc files unless significant.
9. **Remember.** Save decisions, gotchas, failures, corrections to memory via `memory` tool. Don't save obvious things — save what you'd want to know next time.
10. **Handoff.** Session getting long or task incomplete → `/handoff` to create continuation doc. Don't lose context.

Skip steps that don't apply. Don't ask permission for steps that do apply — just do them. External tech → validate APIs first (see below).

## Working style

- Trust but verify. State results directly — no "Let me..." narration, no end-of-turn recaps unless asked.
- Don't add features, abstractions, or error handling beyond what the task requires. Three similar lines beats a premature helper.
- Default to writing no comments. Explain WHY (hidden constraint, non-obvious invariant) never WHAT.
- Never mark a task complete if tests fail, implementation is partial, or there are unresolved errors.

## External tech: mandatory validation

Any time the project pulls in an external technology (framework, SDK, hosted service — Next.js, React, Clerk, MongoDB driver, AWS SDK, Tailwind, etc.) you MUST validate latest-version APIs before writing code that uses it. Training data goes stale fast.

Steps (do them; don't skip):
1. Check installed version (`package.json`, `node_modules/<pkg>/package.json`, project AGENTS.md).
2. Validate against current docs + GitHub. Tool depends on which agent you are:
   - Claude Code: WebFetch/WebSearch + `mcp__octocode__githubGetFileContent` / `githubSearchCode` against the upstream repo at the installed version's tag.
   - Pi: `bdata search "<tech> latest version breaking changes" --json` + `bdata scrape "<docs-url>" -f markdown`. For npm packages: `bdata search "npm <package>" --json`.
   - Codex: Web search + `mcp__octocode` tools.
3. Run `/find-skills` (or `find-skills` for Pi) for that tech — if a high-install skill exists (e.g. vercel-react-best-practices), surface it before installing.
4. Read local docs if shipped (`node_modules/<pkg>/dist/docs/`, README, CHANGELOG) — Next.js ships docs in node_modules now.

Skip only for: pure utility libs with stable APIs (date-fns, zod, lodash) where installed types are enough. When in doubt, validate.

## Safety

- Never commit `.env*`, credentials, secrets, or keys.
- Never run destructive git operations (`push --force`, `reset --hard`, branch deletion) without explicit confirmation.
- Never skip hooks (`--no-verify`, `--no-gpg-sign`) unless the user requests it.
- Before installing a plugin, MCP server, or skill from a public source, confirm the source is trustworthy.

## Repository conventions

- Respect existing patterns over introducing new ones.
- Prefer editing an existing file over creating a new one.
- `CLAUDE.md` in a repo overrides these global rules for that repo.
- Complex repos get ONE lean root `AGENTS.md` (symlink `CLAUDE.md` → it) holding only non-inferable facts: gotchas, deploy mechanics, project-specific overrides. Read it before editing; update it after a change alters a durable contract, workflow, or gotcha. No nested per-folder tree, no index files — bloat hurts more than it helps. Trust the code for everything inferable.

## Hygiene

- Monthly: run `/doctor`, `/memory`, `/mcp`, `/context` in Claude Code. Disable anything unused.
- Monthly in Pi: `/memory-insights`, `/memory-consolidate`. Check `bdata zones` for credit usage.
- Matt Pocock skills repo cloned at `~/Dev/pi-optimize/mattpocock-skills`. Update with `git pull` and re-copy changed skills. Renames: `/to-prd` → `/to-spec`, `/to-issues` → `/to-tickets`. New: `code-review`, `research`, `wayfinder`, `wizard`.
- When a plugin auto-updates, old version dirs may linger in `~/.claude/plugins/cache/` — Claude Code loads skills from ALL of them, duplicating the system prompt. Periodically clean stale versions.
- `~/.agents/skills/` should contain only skills that earn their place in the system prompt. Remove skills that are not coding-related, one-time migrations, or redundant with another skill.
