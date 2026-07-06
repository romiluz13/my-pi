# What to Learn from Archon (coleam00/Archon)

> Read from the local clone ~/Dev/Archon. 5 subagents ran but got paused mid-read;
> I synthesized from the actual prompt files (the highest-value artifacts) myself.
> Archon is a TypeScript self-hosted AI coding agent: MCP server + chat UI + GitHub
> PR workflow + 36-prompt command library + 13 subagent roles.

## The verdict in one line

**Archon's PROMPT ENGINEERING is genuinely ahead of ours. Its architecture is
over-engineered for our use case (Docker, auth-service, Postgres, Caddy — we
don't need any of that). The steal is 4 prompt techniques + 1 workflow idea.**

---

## What Archon has that we don't (and whether to steal it)

### STEAL 1 — Per-phase CHECKPOINT gates in every prompt (high value)
Every Archon prompt ends a phase with an explicit checkbox block:
```
**PHASE_2_CHECKPOINT:**
- [ ] Explore agent launched and completed successfully
- [ ] At least 3 similar implementations found with file:line refs
- [ ] Code snippets are ACTUAL (copy-pasted from codebase, not invented)
- [ ] Integration points mapped with specific file paths
```
**Why it's smart:** This is the "visible evidence requirement" the Claude Code
#7777 model admitted it needs. A checkpoint makes skipping *visible* — the model
can't silently fall through a phase. Our /loop steers phases but has no per-phase
evidence gate; the gate is only at VERIFY.
**How to steal (harmony-preserving):** Add checkpoint blocks to the phasePrompt()
function in loop.ts — each phase's steering message ends with a CHECKPOINT the
agent must satisfy before signaling completion. No new axis, no new tool — just
richer steering text.

### STEAL 2 — "Patterns to Mirror" with ACTUAL file:line code snippets (high value)
Archon's plan prompt requires the Explore agent to return **actual code snippets
copied from the codebase, not invented**, with file:line refs, in a table:
```
| NAMING | src/features/X/service.ts:10-15 | camelCase functions | export function createThing() |
| ERRORS | src/features/X/errors.ts:5-20   | Custom error classes| class ThingNotFoundError |
```
Then the IMPLEMENT prompt's tasks each have a `MIRROR: {source-file:lines}` field
the agent must follow exactly.
**Why it's smart:** This is dispatch-by-reference for *patterns*, not just diffs.
Our /loop BUILD phase says "follow existing patterns" in prose — Archon makes the
agent extract and cite the actual pattern first, then mirror it. Kills the
"invented generic example" failure.
**How to steal:** Add a "Pattern extraction" mini-phase between PLAN and BUILD in
loop.ts — the PLAN steering message requires the agent to produce a patterns
table with file:line refs before BUILD starts. Pure steering change, no new axis.

### STEAL 3 — 5 specialized parallel reviewers + synthesis (the strongest steal)
Archon runs **5 review agents in parallel**, each with a narrow focus:
1. code-review (quality, CLAUDE.md compliance, bugs)
2. error-handling (silent failures, swallowed errors)
3. test-coverage (missing tests, edge cases)
4. comment-quality (stale comments, misleading docs)
5. docs-impact (does a docs change need to happen?)

Then a 6th prompt (`synthesize-review`) aggregates them by severity
(CRITICAL/HIGH/MEDIUM/LOW) into one consolidated report.
**Why it's smart:** Our /loop REVIEW phase says "2-3 reviewers (standards, spec,
security)" — Archon's 5-role split is sharper and the synthesis step is the
convergence pattern. "Error-handling" and "test-coverage" as dedicated roles
catch exactly the failures our AGENTS.md mentions (swallowed errors, missing
tests) — but as *separate agents*, not one reviewer trying to check everything.
**How to steal:** Expand the REVIEW phase steering in loop.ts to fan out 5 named
roles via pi-subagents instead of 3. The convergence (synthesize) is already what
our santa-method does — we just make the roles sharper. No new axis (still uses
pi-subagents); richer steering.

### STEAL 4 — "NOT Building (Scope Limits)" as an explicit artifact section
Archon's plan has a mandatory `## NOT Building (Scope Limits)` section:
```
NOT_BUILDING (explicit scope limits):
- [Item 1 - explicitly out of scope and why]
- [Item 2 - explicitly out of scope and why]
```
And the code-review agent is explicitly told: *"Check for 'NOT Building' section.
Items listed there are intentionally excluded — do NOT flag them as bugs or
missing features!"*
**Why it's smart:** This is the anti-scope-creep gate as a *first-class artifact*.
Our AGENTS.md says "every changed line should trace to the user's request" — but
that's prose. Archon makes the agent write down what it's NOT doing, and the
reviewer respects it. This kills the "I also refactored X while I was in there"
failure.
**How to steal:** Add a `nonGoals` requirement to the /loop pre-flight contract
(we already have a `nonGoals` field in the Intent! — just make the reviewer
phases honor it). One-line steering change in loop.ts's review prompt: "Respect
intent.nonGoals — do not flag them."

### STEAL 5 — Validation commands per-task, not per-workflow
Archon's plan generates per-task validation:
```
### Task 1: CREATE `src/features/x/models.ts`
- VALIDATE: `bun run type-check` - must pass before next task
```
The IMPLEMENT prompt runs type-check **after every file change**, not at the end.
**Why it's smart:** Catches breakage at the smallest possible blast radius. Our
/loop BUILD phase says "fix type/LSP errors immediately when detected" — Archon
enforces "run type-check after every change" as a per-task rule. With pi-lens
already streaming real-time LSP diagnostics, we partially have this — but the
per-task validation command is sharper.
**How to steal:** Steer the BUILD phase to run the project's type-check/lint after
each file change, not just at VERIFY. pi-lens already surfaces errors live; this
just makes the loop steering explicit about "fix before next task."

---

## What Archon has that we should SKIP (with reasons)

### SKIP 1 — Docker + docker-compose + Caddy + auth-service + Postgres
Archon ships a full self-hosted stack: Dockerfile, docker-compose.yml, Caddy
reverse proxy, a separate auth-service, Postgres/Supabase for state.
**Why skip:** This is multi-user self-hosted-server architecture. Our setup is a
single-user terminal harness. Adding Docker + auth + Postgres would 10x the
moving parts for zero solo-user benefit. Pi's ideology is "minimal terminal
harness" — Archon's deployment model is the opposite. Our durable state
(~/.pi/workflows/ JSON) is simpler and sufficient.

### SKIP 2 — The 964-line AGENTS.md / 973-line CLAUDE.md
Archon's context files are ~4x past the IFScale instruction-following ceiling.
**Why skip:** We just proved (guardrails research) that rules decay past ~150
instructions. Our 150-line AGENTS.md + guardrails re-injection is the
evidence-backed approach. Archon is on the wrong side of that research.

### SKIP 3 — LangGraph-style graph engine
Archon's "workflows" are actually thin (store-adapter bridges to a DB) — the
real workflow is the 36-prompt command library, not a LangGraph state machine.
**Why skip:** There's no graph engine to steal; the prompts ARE the workflow.
Our /loop state machine (phase + iteration + score history + plateau detection)
is structurally MORE sophisticated than Archon's prompt-chain approach. We win
this axis.

### SKIP 4 — The crawl4ai / RAG doc-ingestion pipeline
Archon ingests docs for RAG. We don't have a RAG pipeline.
**Why skip:** Our pi-context SQLite sidecar + pi-web-access + skills
(progressive disclosure) cover retrieval without a dedicated RAG ingest
pipeline. Adding crawl4ai would be a new axis for a problem we don't
measurably have. Defer unless doc-RAG becomes a felt pain.

### SKIP 5 — GitHub-PR-centric workflow (gh pr comment posting, PR scopes)
Archon's whole loop is built around GitHub PRs: post review as PR comment,
checkout PR branch, sync with main. Our /loop is cwd-local.
**Why skip:** Our setup works on the local working tree; the GitHub stuff is a
cc10x-style PR-automation layer that's a different product. Our `/ship` +
`github` skill cover the commit/PR case without making the whole loop PR-bound.

---

## The ONE thing that would most improve our setup

**Steal 3 (5 specialized reviewers + synthesis) is the highest-value adoption.**
It's the one place Archon is structurally stronger than our /loop REVIEW phase,
it composes on pi-subagents (no new axis), and it catches exactly the failures
(swallowed errors, missing tests, stale comments) that our AGENTS.md worries
about but our current "3 reviewers" prompt underspecifies.

Steal 1 (checkpoints) and Steal 2 (mirror patterns) are close seconds — both
are pure steering-text improvements to loop.ts, zero new moving parts, and they
directly attack the "model skips phases / invents generic examples" failures.

---

## Implementation plan (ONLY after approval — read-only research now)

All 5 steals are **loop.ts steering-text changes**, not new extensions or
packages. They preserve harmony because:
- No new tools registered.
- No new event hooks.
- No new storage.
- They enrich the phasePrompt() function + the pre-flight contract requirement.
- They compose on pi-subagents (Steal 3) which we already use.

The change is ~30-50 lines in loop.ts: richer PLAN prompt (pattern table +
checkpoints), richer BUILD prompt (per-task validation + mirror refs), richer
REVIEW prompt (5 named roles + respect nonGoals + synthesize), and the Intent
already has nonGoals (just honor it in review).

## Sources (read directly from ~/Dev/Archon)
- .archon/commands/defaults/archon-create-plan.md (the 8-phase plan prompt — checkpoints, mirror patterns, scope limits, confidence score)
- .archon/commands/defaults/archon-implement.md (per-task validation, golden rule "fix before moving on")
- .archon/commands/defaults/archon-code-review-agent.md (CLAUDE.md compliance + bug detection)
- .archon/commands/defaults/archon-synthesize-review.md (5-agent convergence by severity)
- .archon/commands/defaults/archon-self-fix-all.md (aggressive remediation loop)
- .archon/commands/defaults/archon-validate.md (validation suite gate)
- .claude/agents/ (13 subagent role prompts)
- AGENTS.md (964 lines — the anti-pattern), CLAUDE.md (973 lines)
- packages/core/src/workflows/ (thin store-adapter, not a graph engine)
