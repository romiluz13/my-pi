# Global AI Agent Rules

Single source of truth for every AI coding tool on this machine (Claude Code, Codex, Cursor, Copilot, Gemini CLI, Pi).

- Keep this file under 200 lines total — every line is a token cost on every session.
- Append only what the agent gets wrong without being told. If an instruction is obvious from the code, delete it.
- Short sentences, imperative mood.

## Environment

- macOS, zsh shell. Node via `mise`.
- AWS profile `ai-prod-llm`; Bedrock is the Claude Code backend.
- Canonical file: `~/.ai/AGENTS.md`. `~/.claude/CLAUDE.md` imports it via `@~/.ai/AGENTS.md`. `~/.codex/AGENTS.md` is a symlink here.
- Personal skills: edit ONLY in `~/Dev/ux-skills/`. Install to `~/.claude/skills/` ONLY via `~/Dev/ux-skills/scripts/install-symlinks.sh`.
- `~/.agents/skills/` is for third-party `npx skills` installs only, not personal skills.
- cc10x is installed (`cc10x@cc10x`, v11.1.0). Do not remove or reinstall without explicit user request.

## Pi

- Pi config: `~/.pi/agent/settings.json`. Provider: Grove (OpenAI-compatible). Default model: FW-GLM-5.2. Thinking: high. Compaction: 30k recent tokens.
- 10 packages: pi-hermes-memory, pi-subagents, pi-lens, pi-context-prune (enabled), @narumitw/pi-statusline, pi-intercom, pi-prompt-template-model, pi-btw, @juicesharp/rpiv-ask-user-question, pi-rewind.
- Web access: `bdata` CLI (Bright Data). Auth via `bdata login`. Free tier: 5,000 credits/month.
- Code research: `npx octocode` CLI (14 tools: search, AST, LSP, GitHub, npm, binary, OQL).
- Memory: pi-hermes-memory. Policy-only injection — agent calls `memory_search` when needed. One-time: `/memory-interview`, `/memory-index-sessions`, `/learn-memory-tool`.
- `/rewind` for undo. `/btw` for side questions. `/handoff` for session continuation.

## Autonomous workflow

When given a task, follow this flow automatically. The workflow IS the skill router — each step names the exact skill. Don't spawn a router subagent.

1. **Understand.** Read repo AGENTS.md, relevant files, existing patterns. Search memory for relevant context. If ambiguous, ask ONE clarifying question. If clear, proceed.
2. **Brainstorm (new features).** Before building anything new → `brainstorming` skill: explore context, ask questions one at a time, propose approaches, present design, get user approval.
3. **Plan (big tasks).** >3 files or new feature → `/to-spec` then `/to-tickets`. Enormous fog-of-war → `/wayfinder`. Uncertain design → `prototype` or `grill-with-docs` to stress-test. Bug fix or small change → skip to step 4.
4. **Build.** Implement following existing patterns. Don't over-engineer. Python → use `uv` (not pip/venv). LSP runs on every edit via pi-lens — fix type errors immediately.
5. **Test.** Run relevant tests. No tests for changed code → write them (`tdd` skill: test first, see fail, implement, see pass). Tests fail → `diagnosing-bugs` skill (build feedback loop, root cause, not symptom).
6. **Review.** Spawn reviewer subagent: "Use reviewer to review this diff." Critical code → `code-review` skill (parallel standards + spec). Receiving feedback → `receiving-code-review` skill (verify before implementing, push back if wrong). Architecture issues found → `improve-codebase-architecture` skill.
7. **Verify + commit.** Before claiming done → `verification-before-completion` skill: run verification command, read full output, confirm. Evidence before claims. Then use `commit` skill for clean conventional commits.
8. **Document.** Durable contract, API, workflow, or gotcha changed → update repo AGENTS.md. User-facing change → update CHANGELOG. Don't create new doc files unless significant.
9. **Remember.** Save decisions, gotchas, failures, corrections to memory. Don't save obvious things — save what you'd want to know next time. If memory contradicts current code, trust the code.
10. **Handoff.** Session getting long → `compact-safe` skill to preserve constraints, or `/handoff` to create continuation doc. Don't lose context.

Skip steps that don't apply. Don't ask permission for steps that do apply — just do them. External tech → validate APIs first (see below).

## Domain skills (auto-trigger from description)

- **MongoDB** (8): `mongodb-schema-design`, `mongodb-search-and-ai`, `mongodb-query-optimizer`, `mongodb-connection`, `mongodb-mcp-setup`, `mongodb-natural-language-querying`, `mongodb-atlas-stream-processing`, `mongodb-mcp-cluster-per-project` — auto-trigger when working with MongoDB.
- **Vercel/React** (5): `vercel-react-best-practices`, `vercel-composition-patterns`, `deploy-to-vercel`, `vercel-optimize`, `web-design-guidelines` — auto-trigger when building React or deploying to Vercel.
- **UI** (3): `frontend-design` (aesthetic direction), `impeccable` (UI quality/polish), `web-design-guidelines` (UI review) — auto-trigger when building or reviewing UI.
- **Web** (8): `search`, `scrape`, `discover-api`, `data-feeds`, `live-research`, `agent-browser`, `rag-pipeline`, `brightdata-cli` — auto-trigger for web tasks. `bright-data-best-practices` is a model-invoked reference for BD APIs. Use `bdata` CLI, not MCP.
- **Code research** (5): `octocode`, `octocode-research`, `octocode-brainstorming`, `octocode-rfc-generator`, `octocode-roast` — auto-trigger for evidence-first research, RFCs, or code critique.
- **User-invoked** (5): `/teach`, `/triage`, `/writing-great-skills`, `/setup-pre-commit`, `/wizard` (interactive setup for third-party services) — user types these explicitly.
- **Internal reference** (2): `codebase-design` (module/interface vocabulary), `domain-modeling` (domain glossary) — auto-loaded by other skills (tdd, grill-with-docs, to-spec, improve-codebase-architecture).
- **Auto-safety** (2): `git-guardrails-claude-code`, `resolving-merge-conflicts` — auto-trigger on git operations and merge conflicts.

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

- Monthly: `/memory-insights`, `/memory-consolidate` in Pi. `/doctor`, `/memory`, `/context` in Claude Code. Check `bdata zones` for credit usage.
- Memory hygiene: review and prune stale memory entries monthly. If memory contradicts current code, trust the code.
- Matt Pocock skills repo at `~/Dev/pi-optimize/mattpocock-skills`. Update with `git pull` and re-copy.
- `~/.agents/skills/` should contain only skills that earn their place in the system prompt.
