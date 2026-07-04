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

1. **Understand.** Read repo AGENTS.md, relevant files, existing patterns. Search memory. Fan out subagents for parallel research (web, GitHub, codebase — each reads a different source). If ambiguous, ask ONE clarifying question. If clear, proceed.
2. **Brainstorm (new features).** Before building anything new → `brainstorming` skill: explore context, ask questions one at a time, propose approaches, present design, get user approval.
3. **Plan (big tasks only).** Pick based on the situation:
   - **You know what to build** (>3 files, new feature) → `/to-spec` then `/to-tickets`.
   - **You don't know what to build** (fog of war, loose idea) → `/wayfinder`.
   - **Design question answerable by building** → `prototype` (throwaway, answer the question, discard).
   - **Design question answerable by thinking** → `grill-with-docs` (relentless interview to stress-test the plan).
   - **Need evidence from primary sources** → `research` or `octocode-research` skill (background agent, cited markdown).
   - Bug fix or small change → skip to step 4.
4. **Build.** Implement following existing patterns. Don't over-engineer. Python → use `uv` (not pip/venv). LSP runs on every edit via pi-lens — fix type errors immediately.
5. **Test.** Run relevant tests. No tests for changed code → write them (`tdd` skill: test first, see fail, implement, see pass). Tests fail → `diagnosing-bugs` skill (build feedback loop, root cause, not symptom) → fix → return to step 5.
6. **Review.** Fan out 2-3 reviewer subagents with different focuses (standards, spec, security). Critical code → `code-review` skill (parallel standards + spec). Receiving feedback → `receiving-code-review` skill (verify before implementing, push back if wrong). Architecture issues found → `improve-codebase-architecture` skill → return to step 4.
7. **Verify + commit.** Before claiming done → `verification-before-completion` skill: run the project's test/lint/typecheck command, read full output, confirm. Evidence before claims. Then use `commit` skill for clean conventional commits. Use `github` skill for PRs, issues, and CI via `gh` CLI. CI fails → `diagnosing-bugs` → fix → return to step 5.
8. **Document.** Prevent unstructured docs — no random markdown files, no duplicating what the code says.
   - Durable gotcha/workflow change → update repo AGENTS.md.
   - Domain term resolved → update `CONTEXT.md` (`domain-modeling` skill).
   - Architecture decision made → write ADR in `docs/adr/` (`domain-modeling` skill).
   - User-facing change → update CHANGELOG.
   - Specs and tickets → GitHub Issues (`/to-spec`, `/to-tickets`), NOT repo filesystem.
   - Create files lazily — only when you have something non-inferable to write.
9. **Remember.** Save decisions, gotchas, failures, corrections to memory. Don't save obvious things — save what you'd want to know next time. If memory contradicts current code, trust the code.
10. **Handoff.** Session getting long → `compact-safe` skill to preserve constraints, or `/handoff` to create continuation doc. Don't lose context.

## Subagent strategy

Fan out for read-only work. Stay solo for write work. Context is everything — parallel research multiplies it, parallel building destroys it.

- **Parallel fan-out (read-only, no conflicts):**
  - Web research: spawn N subagents, each searches a different source (bdata, octocode, gh, docs).
  - GitHub research: one subagent per repo or query.
  - Code research: one subagent per module or file group.
  - Review: spawn 2-3 reviewers with different focuses (standards, spec, security).
  - Validation: one subagent per external tech to validate APIs.
- **Sequential (one writer, no conflicts):**
  - Building: ONE agent writes code. Never parallel-write to the same files.
  - Testing: ONE agent runs tests and fixes failures.
  - Committing: ONE agent commits.
- **Parallel + merge (careful):**
  - Independent file changes (different modules, no shared deps): parallel OK with `worktree: true`, then merge.
  - Always verify merge has no conflicts before proceeding.
- **Safety rules:**
  - pi-rewind does NOT checkpoint subagent file changes — run `git status` after subagent writes to trigger a checkpoint.
  - pi-intercom handles one pending ask at a time — don't fan out decision-needing subagents simultaneously.
  - Always `wait()` for async workers to finish before launching reviewers.

Default: fan out research, build solo, review in parallel.

If `/to-spec` or `/to-tickets` fails, configure the issue tracker first. External tech → validate APIs before step 4 (see below).

## Domain skills (auto-trigger from description)

- **MongoDB** (8): `mongodb-schema-design`, `mongodb-search-and-ai`, `mongodb-query-optimizer`, `mongodb-connection`, `mongodb-mcp-setup` (global first-time install), `mongodb-natural-language-querying`, `mongodb-atlas-stream-processing`, `mongodb-mcp-cluster-per-project` (per-project wiring) — auto-trigger when working with MongoDB.
- **Vercel/React** (5): `vercel-react-best-practices`, `vercel-composition-patterns`, `deploy-to-vercel`, `vercel-optimize`, `web-design-guidelines` — auto-trigger when building React or deploying to Vercel.
- **UI** (3): `frontend-design` (aesthetic direction), `impeccable` (UI quality/polish), `web-design-guidelines` (UI review) — auto-trigger when building or reviewing UI.
- **Web** (8): `search`, `scrape`, `discover-api`, `data-feeds`, `live-research`, `agent-browser`, `rag-pipeline`, `brightdata-cli` — auto-trigger for web tasks. `bright-data-best-practices` is a model-invoked reference for BD APIs. Use `bdata` CLI, not MCP.
- **Code research** (5): `octocode` (CLI quick-reference), `octocode-research` (investigation workflow), `octocode-brainstorming` (evidence validation), `octocode-rfc-generator`, `octocode-roast` — auto-trigger for evidence-first research, RFCs, or code critique.
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
