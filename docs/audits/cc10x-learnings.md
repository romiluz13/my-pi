# cc10x Exhaustive Sweep — What We DON'T Yet Have

> Source: ~/Dev/cc10x (your own Claude Code setup). Read directly from the skill
> files after the 5-researcher fleet got paused mid-synthesis. This list is
> EXHAUSTIVE — only items we do NOT already have in the Pi setup, with the
> harmony-preserving way to steal each.

## Our setup already has (the baseline — not re-reported)

/loop engine (plan→build→review→verify→ship, bounded cap 3, plateau detection
iter≥3/no-improve-2, GAN 3-exits, santa 2-reviewer convergence, reconciliation-
over-assertion, test-honesty grep); pre-flight contract (5 failure modes); 5
specialized reviewers + synthesis; per-phase CHECKPOINT gates; Patterns-to-Mirror
with file:line; honor nonGoals; per-task type-check in BUILD; Coach; guardrails
(AGENTS.md re-injection); confirm-destructive; pi-context sidecar; pi-
observability; pi-hermes-memory; pi-observational-memory; handoff.ts;
compact-safe skill; ~/.pi/workflows/{wf}.json + .events.jsonl.

---

## STEAL 1 — Bounded PLAN review DAG (3-check adversarial gate) — HIGH VALUE

cc10x's `plan-review-gate` skill: after the plan is written, a **fail-closed
adversarial review** runs 3 checks in sequence, with a 3-iteration cap:
1. **Feasibility** — Glob every referenced file path exists; read 1-2 real files
   to confirm proposed patterns/libs match the codebase; verify dependency
   ordering; flag unstated infra assumptions; flag invented/unverified file
   assumptions; verify plan mode fits task; verify verification rigor fits risk.
2. **Completeness** — all requirements mapped; verification steps defined; edge
   cases addressed; cross-file integration; plan-vs-code gaps surfaced;
   assumption ledger honest (proven_by_code/inferred/needs_user_confirmation);
   phase dependency map present; Durable Decisions present for multi-phase.
3. **Scope & Alignment** — matches request; no scope creep; no under-scoping;
   execution order real; complexity proportional; defaults framed honestly;
   agreement fidelity; hidden future work explicit; architecture contradictions
   surfaced.
**Output:** `SPEC_GATE_PASS` or `SPEC_GATE_FAIL` (no "approved with comments").
3 iterations → escalation. The gate is an auditor, not a collaborator — no
suggestions, no softening.
**Why we don't have it:** our PLAN phase does ONE fresh-reviewer pass. cc10x does
a bounded, structured, 3-check adversarial DAG with fail-closed blocking. Our
plan review is "did a reviewer approve it"; cc10x's is "did it survive 3 specific
failure-mode checks with evidence."
**The anti-patterns table is gold:** "Skipping file path verification — fabricated
paths are the #1 plan failure mode"; "Accepting repo-agnostic summaries — a clean
summary is worthless if the plan ignores real code constraints."
**Harmony-preserving steal:** enrich the PLAN phase steering in loop.ts — after
the plan is written, the steering demands a 3-check self-audit (feasibility via
Glob/read, completeness, scope) with a `SPEC_GATE_PASS/FAIL` verdict and a 3-try
cap before BUILD. Pure steering text. The PLAN phase already allows read/grep/
find/ls/lsp_* (the tool allowlist), so the Glob-equivalent (find/ls) + read are
available. No new tool, no new hook.

## STEAL 2 — The "change an input before re-dispatch" circuit-breaker rule — HIGH VALUE

cc10x's remediation-and-research.md has a law we DON'T enforce:
> "When an agent returns BLOCKED (or a fix attempt fails), the circuit breaker
> only BOUNDS the loop — it does not improve it. Re-dispatching the SAME agent
> with the SAME model on the SAME unchanged input just burns a circuit-breaker
> cycle and produces the same failure. Before any re-dispatch, the router MUST
> change at least one input: (1) change the task scope, (2) escalate the model
> tier, (3) change the approach (different strategy/tool), (4) escalate to the
> human — if the plan itself is wrong, stop and ask; do not loop."

**Why we don't have it:** our loop caps at 3 iterations and detects plateau, but
it doesn't enforce "change an input before retrying." A stuck loop can spin the
same input 3 times and just hit the cap — wasting 2 iterations. cc10x makes the
retry *productive* by requiring an input change.
**Harmony-preserving steal:** enrich the remediation steering in loop.ts — when
looping back to BUILD after VERIFY/REVIEW failure, the steering message adds:
"Before retrying, CHANGE at least one input: narrow scope, escalate model tier
(Ctrl+L mid-session), change approach, or if the plan is wrong — STOP and ask
the human. Do not re-dispatch the same input." Pure steering text. Uses existing
model-switching (Ctrl+L) + ask_user_question.

## STEAL 3 — Memory compounding loop (Keep/Update/Consolidate/Replace/Delete) — MEDIUM-HIGH

cc10x's memory-and-handoff skill has a **knowledge compounding loop** we lack:
after every BUILD/DEBUG cycle, structured learnings compound into reusable
knowledge with 5 outcomes: **Keep** (accurate+useful), **Update** (correct but
incomplete), **Consolidate** (same lesson appears multiple times → merge),
**Replace** (outdated), **Delete** (no longer applies). And a promotion rule:
"when the same gotcha appears 3+ times in patterns.md, promote it to a dedicated
reference file or skill section." Plus `docs/solutions/` for durable structured
learnings that survive across projects.
**Why we don't have it:** our pi-hermes-memory stores memories + auto-
consolidates, but it doesn't have the explicit 5-outcome review rubric or the
"3+ times → promote to skill" rule. Our memories accumulate; cc10x's sharpen.
**Harmony-preserving steal:** this is a SKILL, not an extension — add a
`memory-compounding` skill to ~/.agents/skills/ that codifies the 5-outcome
review + the 3x-promotion rule + the docs/solutions/ pattern. Loads on-demand
(progressive disclosure — no system-prompt cost). Composes on pi-hermes-memory
(it's the memory store; the skill is the *discipline* for reviewing it). No
conflict — it's prose guidance, the same layer as `compact-safe`/`handoff`.

## STEAL 4 — Codebase hygiene: semantic duplicate detection + module deepening — MEDIUM

cc10x's `codebase-hygiene` skill: (1) **semantic duplicate detection** — functions
doing the same thing under different names (invisible to copy-paste detectors);
method: extract catalog → categorize by domain → drop <3 → read implementations
to detect shared intent (NEVER use cheap name-based detection) → emit findings
with file:line. (2) **module deepening** — thin wrappers/pass-through layers that
spread complexity. **Consolidation discipline:** never delete a duplicate until
(1) survivor has tests, (2) all callers updated (Grep to enumerate), (3) re-run
after consolidation passes.
**Why we don't have it:** our `improve-codebase-architecture` skill is about
module/interface design; cc10x's is specifically about *semantic duplicates* and
*shallow modules* — a different, sharper lens. The "high-risk zones" table
(utils/helpers/lib, validation, error formatting, path manipulation, API
response shaping) is concrete.
**Harmony-preserving steal:** add a `codebase-hygiene` skill to ~/.agents/skills/
(lifted/adapted from cc10x's SKILL.md). Read-only advisory (cc10x routes changes
through BUILD; we'd route through /loop or /build). No conflict — it's a new
skill, progressive disclosure, composes with existing code-review/improve-
codebase-architecture skills (different focus).

## STEAL 5 — diff-driven-docs: the 3-layer impact classifier — MEDIUM

cc10x's `diff-driven-docs` skill: after BUILD, classify the diff's doc impact
across 3 layers (Business / Technical / Audit) using a decision table, and write
ONLY the updates genuinely needed. The classifier has SKIP rules: internal
utility change → SKIP business, CHECK technical, SKIP audit; test addition →
SKIP all; style change → SKIP all. ALWAYS check technical when hooks/components/
migrations/schema/routes/exported APIs changed. CREATE audit doc when an
architectural decision was made or a non-obvious tradeoff accepted.
**Why we don't have it:** our AGENTS.md step 8 (Document) says "update
CHANGELOG/AGENTS.md/ADR" but it's prose. cc10x's is a structured classifier that
skips trivial changes fast and forces docs when it matters. Our `/loop` REVIEW
has a "docs-impact" reviewer (steal 1 from Archon) but no *classifier* — it
asks "does a docs change need to happen" generically; cc10x's table is sharper.
**Harmony-preserving steal:** add a `diff-driven-docs` skill to ~/.agents/skills/
with the 3-layer classifier table. The /loop REVIEW "docs-impact" reviewer can
reference it. No conflict — new skill, progressive disclosure.

## STEAL 6 — Hook-enforced remediation-history backstop (artifact-authoritative counting) — MEDIUM

cc10x: "the TaskCompleted guard independently counts remediation_history entries
from the artifact on every remfix completion and flags/blocks when the count
exceeds 3 — this is the enforced version of the LLM-counted rule and does not
depend on the router's own counting being correct. If remediation_history and
the router's own task count ever disagree, the artifact's remediation_history is
authoritative."
**Why we don't have it:** our loop counts iterations in the LoopState
(in-memory + persisted to {wf}.json), but there's no INDEPENDENT backstop — if
the loop.ts logic miscounts, the cap can be missed. cc10x has a hook that
independently reads the artifact and blocks. Our cap is logic-enforced, not
artifact-authoritative.
**Harmony-preserving steal (careful):** this would be a new `on("tool_call")` or
`on("agent_end")` check in loop.ts that re-reads `remediationHistory.length` from
the persisted {wf}.json (not the in-memory state) and blocks if it exceeds
maxIterations — an independent backstop. LOW conflict risk (loop.ts already hooks
agent_end; this is an additional check in the same handler). Honest scope: this
is defense-in-depth; our in-memory count works, this just makes it
tamper-resistant. Medium value.

## STEAL 7 — activeContext.md / progress.md / patterns.md live-focus docs — MEDIUM

cc10x maintains 3 live markdown docs in .cc10x/: activeContext.md (current focus,
recent changes, decisions, learnings, references, blockers), patterns.md
(reusable standards/gotchas/conventions/skill hints), progress.md (current
workflow, tasks snapshot, completed items, verification evidence). The router
loads + auto-heals them before routing/resume. Agents READ them but don't edit
directly — they emit MEMORY_NOTES and the router's memory-finalize task is the
only writer.
**Why we don't have it:** our pi-hermes-memory is the cross-session store;
pi-observational-memory is within-session observations; handoff.ts writes a
HANDOFF.md on demand. But we don't have a *live current-focus* doc the agent
re-reads on resume. Our resume is the session JSONL + events.jsonl (machine
state), not a human-readable "where are we" doc.
**Harmony-preserving steal (careful — possible duplication):** this PARTIALLY
overlaps with pi-hermes-memory (the memory store) + handoff.ts (the doc
generator). Adding 3 more docs risks the "second owner of the memory axis"
conflict. The harmony-preserving version: make handoff.ts optionally maintain a
LIVE ~/.pi/active-context.md (updated at phase transitions) instead of only a
one-shot HANDOFF.md — OR skip this if hermes-memory already feels sufficient.
**My honest call: SKIP this one** — it's the most likely to create axis overlap
with hermes. Our hermes + observational + handoff already cover the
memory/continuity axis. cc10x needs these docs because Claude Code's session
model is weaker than Pi's tree-structured sessions + hermes FTS5.

## STEAL 8 — "Verify-before-implement (bidirectional remediation)" — LOW-MEDIUM

cc10x's remediation-and-research.md §Verify-before-implement: before implementing
a fix, verify the fix direction is correct (don't fix the symptom). "Bidirectional"
= the remediation can go both ways (the fix might be in the plan, not the code).
**Why we don't have it:** our loop has "reconciliation over assertion" + "root
cause not symptom" in the debug path, but not as a named bidirectional gate.
**Harmony-preserving steal:** one line in the remediation steering: "Before
implementing a fix, verify the fix is in the right direction — if the plan is
wrong, fix the plan, not the code." Trivial steering addition.

---

## What we should NOT steal from cc10x (with reasons)

- **The 9 named subagent roles as separate SKILL.md** — we already fan out 5
  review roles via pi-subagents (Archon steal 1). cc10x's bug-investigator /
  failure-hunter / integration-verifier / doc-syncer map onto our 5 reviewers.
  Adding cc10x's roles would duplicate the Archon-derived 5-role split.
- **The full .cc10x/ workflow-artifact schema (traceability, capabilities,
  research_rounds, task_ids, etc.)** — our ~/.pi/workflows/{wf}.json is leaner
  and sufficient. cc10x's schema is over-engineered for a Claude Code session
  model that lacks Pi's tree-structured sessions. Adding 30 fields is bloat.
- **The Claude Code hooks (PreToolUse/SessionStart/PostToolUse/TaskCompleted)
  as a mechanism** — Pi uses extension events (tool_call/before_agent_start/
  agent_end), not Claude Code hooks. The MECHANISM doesn't transfer; only the
  BEHAVIORS do (which we're stealing as steering/skills above).
- **activeContext.md / progress.md / patterns.md (Steal 7)** — axis overlap with
  hermes-memory. SKIP.
- **The router-as-single-entry-point pattern** — our Coach + /loop already
  provide this the Pi way. cc10x's router is Claude-Code-bound.

---

## Ranked recommendation

| # | Steal | Value | Harmony risk | How |
| 1 | Bounded PLAN review DAG (3-check gate) | HIGH | none (steering text) | Enrich PLAN phasePrompt() in loop.ts |
| 2 | "Change an input before re-dispatch" rule | HIGH | none (steering text) | Enrich remediation steering in loop.ts |
| 3 | Memory compounding loop (5 outcomes + 3x promote) | MED-HIGH | none (new skill) | New ~/.agents/skills/memory-compounding skill |
| 4 | Codebase hygiene (semantic dupes + module deepening) | MED | none (new skill) | New ~/.agents/skills/codebase-hygiene skill |
| 5 | diff-driven-docs (3-layer classifier) | MED | none (new skill) | New ~/.agents/skills/diff-driven-docs skill |
| 6 | Hook-enforced remediation backstop | MED | LOW (same hook) | Additional check in loop.ts agent_end |
| 7 | activeContext/progress/patterns live docs | MED | HIGH (axis overlap) | SKIP — hermes covers it |
| 8 | Verify-before-implement (bidirectional) | LOW-MED | none (steering text) | One line in remediation steering |

**The top 2 (PLAN review DAG + change-an-input rule) are the highest-value and
both are pure steering-text changes to loop.ts — zero new moving parts, zero
harmony risk. The next 3 (3,4,5) are new SKILLS (progressive disclosure, no
system-prompt cost, no conflict). Steal 6 is defense-in-depth. Skip 7. Steal 8
is a free one-liner.**

## Sources (read directly from ~/Dev/cc10x)
- plugins/cc10x/skills/plan-review-gate/SKILL.md (the 3-check fail-closed gate)
- plugins/cc10x/skills/cc10x-router/references/remediation-and-research.md (change-an-input rule, verify-before-implement)
- plugins/cc10x/skills/cc10x-router/references/workflow-artifact-and-hook-policy.md (artifact-authoritative counting)
- plugins/cc10x/skills/memory-and-handoff/SKILL.md (compounding loop, 5 outcomes, docs/solutions/)
- plugins/cc10x/skills/codebase-hygiene/SKILL.md (semantic dupes, module deepening, consolidation discipline)
- plugins/cc10x/skills/diff-driven-docs/SKILL.md (3-layer impact classifier)
