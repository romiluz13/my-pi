---
description: Full setup health audit — versions, harmony, Coach coverage, disk, AGENTS.md, ecosystem steals
argument-hint: "[focus: versions|harmony|coach|disk|all]"
skill: setup-maintenance
---

Run a full health audit of this Pi setup. Fan out parallel read-only subagents — one per audit axis — then synthesize into a report with recommended actions. This is read-only: do NOT change anything, just report.

> **Note:** This prompt writes its report to disk (`~/Dev/my-pi/docs/audits/`) — it is an intentional deliverable, not a read-only audit. This prompt implements the `setup-maintenance` skill procedure.

Setup location: `~/.pi/agent/` (extensions, settings.json, models.json), `~/.agents/skills/`, `~/Dev/my-pi/` (the published repo). The live config is NOT a git repo — never push from here; the repo at ~/Dev/my-pi is the source of truth for publishing.

## Axes — dispatch one subagent per axis (parallel, read-only)

### 1. Version freshness

Check installed vs latest-published for Pi core + all npm packages in `~/.pi/agent/settings.json` packages array.

- Pi core: `~/.local/share/mise/installs/node/*/lib/node_modules/@earendil-works/pi-coding-agent/package.json` version vs `npm view @earendil-works/pi-coding-agent version`.
- Each package: read its installed `package.json` version vs `npm view <pkg> version`.
- Flag any deprecated packages (check peer deps for deprecated namespaces).
- Report: table of installed vs latest, any drift, any deprecation risk.

### 2. Harmony re-audit (conflicts)

Scan all 14 packages + 6 custom extensions for collisions on: registered tools, registered commands, event hooks (same event → does ordering matter?), storage paths (SQLite DBs, file dirs).

- Read each package's main extension file + each `~/.pi/agent/extensions/*.ts`.
- Flag: tool name collisions, command name collisions, hook ordering risks, storage path overlaps.
- Report: conflict table with severity (critical/major/minor/informational), file:line evidence.

### 3. Coach coverage scan (the improvement loop — part 1)

List EVERY available command + skill. Check which ones Coach (`~/.pi/agent/extensions/coach.ts`) never routes to.

- Enumerate: prompt templates (`~/.pi/agent/prompts/*.md`), extension commands (registerCommand in `~/.pi/agent/extensions/*.ts`), package commands, user-invocable skills (disable-model-invocation: true), auto-skills.
- For each, grep coach.ts `classifyWithLLM()` — does any intent route to it? (Note: there is no `suggestionsFor()` function; suggestions are built inline in the `input` handler.)
- Flag the gaps: commands/skills Coach never surfaces. These are leverage the setup has but Coach doesn't activate.
- Report: coverage table (command/skill → which Coach intent routes to it, or GAP).

### 4. Disk growth

Check disk usage of stores that don't auto-prune:

- `du -sh ~/.pi/agent/sessions/` + count session files.
- `du -sh ~/.pi/agent/pi-hermes-memory/sessions.db` (if exists).
- `du -sh ~/.pi/workflows/` (if exists).
- `du -sh ~/.pi/agent/context.db` (pi-context sidecar, if exists).
- Flag any store > 100MB or growing unbounded.
- Report: disk table + prune recommendations.

### 5. AGENTS.md accuracy

- `wc -l ~/.ai/AGENTS.md` — must be under 200 lines.
- Read it. Does it match the current setup? (package count, extension count, skill count, workflow steps)
- Flag any stale references (packages removed, skills renamed, counts off).
- Report: line count + accuracy findings.

### 6. Ecosystem scan (the improvement loop — part 2)

Search for new Pi packages, skills, and public setups worth stealing from (like we did with cc10x and Archon).

- `npm search pi-coding-agent` + check @earendil-works scope for new packages.
- GitHub: search "pi coding agent" + "pi setup" + awesome-pi lists for new notable setups.
- For any new finding: does it conflict with existing packages? Does it add a NEW axis (not duplicating existing)?
- Report: ranked list of candidate steals with conflict assessment.

## Synthesis

After all 6 subagents complete, synthesize into ONE report:

- **Health score** (0-10) per axis + overall.
- **Critical findings** (must fix) vs **recommended** (should fix) vs **informational**.
- **Coach coverage gaps** — the highest-leverage improvements (each gap = a capability the setup has but doesn't surface).
- **Candidate steals** — ranked by value, each with a conflict verdict.
- **Recommended actions** — ordered, with the specific command/edit to run.

Write the report to `~/Dev/my-pi/docs/audits/setup-audit-YYYY-MM-DD.md` (the repo, so it's publishable). Do NOT push — leave that to the human.
