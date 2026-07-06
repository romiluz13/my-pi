# The Loop Engine — Design Brief

> **Goal:** give my-pi a real bounded loop engine — the one structural capability
> it lacks — in perfect harmony with the 12 installed packages and Pi ideology.
> **Status:** DESIGN (read-only). Build only after user approval.
> **Sources:** 4 research subagents (cc10x internals, Pi ecosystem loops, Pi API
> surfaces, loop-design principles) + direct API verification.

---

## The one-line thesis

**"The loop thinks; the contract thinks first."**

A loop is an amplifier of prior thought, not a substitute for it. The engine
requires a machine-verifiable pre-loop contract before any iteration is allowed
to run. The loop then iterates with three exits (pass / cap / plateau), driven
by steering + gates — never by re-implementing the agent's tools.

---

## Why this is harmony-safe (the #1 constraint)

The loop engine owns **one new axis**: structured workflow state + phase gates +
bounded iteration. It composes ON every existing axis; it re-implements none.

| Existing axis | Owner | How the loop engine COMPOSES (not competes) |
|---|---|---|
| Subagent delegation | pi-subagents | The LLM still calls the `subagent` tool. The loop engine STEERS the agent to dispatch the right role at the right phase via `sendUserMessage({deliverAs:'steer'})`. **No `executeTool` API exists** — so composition-via-steering is the only path, and it's the correct one. |
| Memory (cross-session) | pi-hermes-memory | Loop writes durable state to its OWN file (`~/.pi/workflows/{wf}.json`), not hermes's SQLite. Hermes can index the workflow artifacts as session entries if desired. |
| Memory (within-session) | pi-observational-memory | Loop hooks `session_before_compact` ONLY to flush a workflow-state summary into the compaction (additive, like hermes does). Does NOT touch observational's observation/reflection loop. |
| Verification / LSP | pi-lens | The VERIFY phase sets `setActiveTools` to include `lsp_diagnostics`/`lens_diagnostics` and steers the agent to use them. Lens keeps owning the LSP axis. |
| Checkpoints | pi-rewind | Loop calls `ctx.fork()` at iteration boundaries as a checkpoint. Rewind keeps owning the undo stack. |
| Status / footer | pi-statusline | Loop uses `ctx.ui.setStatus("loop", …)` — additive status slot, doesn't touch the footer render. |
| Compression | pi-hypa | No interaction. Hypa keeps compressing tool output. |

**New axis owned by the loop engine (no existing owner):**
- `~/.pi/workflows/{wf}.json` + `{wf}.events.jsonl` — durable workflow state
- `/loop` command — single entry point (like cc10x-router)
- Phase-exit gates via `on("tool_call")` — block tools outside the current phase's allowlist
- Iteration caps + plateau detection + re-review-until-clean — the loop control law

**Explicitly does NOT register:** any tool that duplicates `subagent`, `read`,
`edit`, `bash`, `lsp_*`, `memory_*`, `recall`, `web_*`, `intercom`, `wait`. The
loop engine registers **zero tools** — it is a control plane, not a tool.

---

## The 7 design principles (from research, evidence-backed)

1. **Five-mode pre-flight.** No loop runs unless it survives the 5 failure-mode
   checklist: (1) spinning/no damping, (2) self-judge, (3) Goodhart/test-deletion,
   (4) 2am-guess, (5) wrong-answer-to-completion. Mode 3 is the worst because it
   is silent — "all tests pass" reads green while the agent has corrupted the
   metric.
2. **Plateau-aware.** `iteration >= 3` AND no improvement in last 2 → stop early
   and surface (not silently done). Add a tolerance band for noisy evaluators.
3. **GAN-shaped.** Every refinement loop = generator + **independent** evaluator
   + fixed rubric + pass-threshold (ends success early) + hard cap (ends failure
   safely) + plateau stop (ends futility early). **Three exits, not one.**
4. **Convergence, not single-judge.** Done = two fresh independent reviewers
   agree (santa-method); cross-model when possible; fresh each round; 3-round
   cap → escalate. "Two agree" is the done-criterion, not "one said yes."
5. **Liveness, not just caps.** Detect wedged iterations (orphaned tool calls
   with no result). A wedged iteration is killed and re-armed, not counted
   toward the budget.
6. **Reconciliation over assertion.** Done-criterion anchored to an external
   golden fact the agent cannot rewrite. If none exists, **freeze a reference
   before iteration 1** and diff against the frozen reference.
7. **Thought-it-through gate.** No loop without a pre-loop contract:
   done-criterion (machine-verifiable) + boundary conditions (anti-Goodhart) +
   reconciliation anchor + retry cap + escalation path.

---

## The Pi-native mechanisms (verified against the actual API)

| Mechanism | Pi API surface | How the loop engine uses it |
|---|---|---|
| Durable workflow state | `pi.appendEntry("loop-state", data)` + a state file at `~/.pi/workflows/{wf}.json` | Survives compaction + restart. The cc10x schema (workflow_uuid, intent, normalized_phases, phase_cursor, phase_status, results, evidence, telemetry.loop_counts, quality.convergence_state, pending_gate, remediation_history) ported to Pi. |
| Phase tool restriction | `pi.setActiveTools([...])` | PLAN phase → `["read","grep","find","ls","lsp_*"]`. BUILD phase → full set. VERIFY phase → `["read","bash","lsp_*","lens_*"]` (no write/edit). Gate enforced by `on("tool_call")` blocking tools outside the set. |
| Steer the agent through phases | `pi.sendUserMessage(text, {deliverAs:"steer"})` | After each phase gate passes, inject a steering message: "Phase VERIFY: run the project's test/lint/typecheck. Do not edit. Report results." The LLM calls the existing tools. |
| Block advancing on partial evidence | `pi.on("tool_call", e => ({block:true, reason}))` | If a VERIFY-phase tool tries `edit`/`write`, block it. If BUILD-phase tries to skip tests, block `commit`/`push` until evidence is recorded. |
| Iteration checkpoint | `ctx.fork(entryId)` | Fork the session at each iteration boundary — a cheap checkpoint that pi-rewind can later rewind to. |
| Read session for dispatch-by-reference | `ctx.sessionManager.getBranch()` | Write the diff to a file, pass the PATH to the reviewer subagent via steering — never paste the body (cc10x's 42k-char scar). |
| Loop status UI | `ctx.ui.setStatus("loop", …)` + `ctx.ui.custom()` for a `/loop` TUI | Non-invasive status slot + an optional full TUI showing phase, iteration, score progression, convergence state. |
| Register the entry point | `pi.registerCommand("loop", …)` + `pi.registerShortcut(Key.ctrlShift("l"), …)` | `/loop "<task>"` is the single entry point. Auto-detects intent (build/debug/plan) like cc10x-router. |

**Key constraint discovered:** Pi has **no `executeTool` API** — an extension
cannot programmatically invoke the `subagent` tool. This forces the correct
design: the loop engine is a **steering + gating control plane**, not a
dispatcher. It composes on pi-subagents by steering the LLM to call it.

---

## The state machine (bounded loops, three exits)

```
/loop "build user auth"
        │
        ▼
┌─────────────────┐    FAILS pre-flight (no
│  PRE-FLIGHT     │    done-criterion / anchor)
│  5-mode check + │──────────────────────► REJECT: "define the contract first"
│  contract gate  │
└────────┬────────┘
         │ PASS
         ▼
┌─────────────────┐
│  PLAN phase     │  tools: read/grep/find/ls/lsp_*  (no write/edit)
│  (read-only)    │  gate: block edit/write/bash-mutating
└────────┬────────┘
         │ plan written to disk, reviewed by fresh reviewer
         ▼
┌─────────────────┐
│  BUILD phase    │  tools: full set
│  (generator)    │  TDD: test first, see fail, implement, see pass
└────────┬────────┘
         │
         ▼
┌─────────────────┐    reviewer ∥ failure-hunter (parallel, via pi-subagents)
│  REVIEW phase   │    findings need file:line quotes @ confidence≥80
│  (evaluator)    │    or auto-demoted
└────────┬────────┘
         │ findings?
         │   YES ──► REMEDIATION ──► back to BUILD (iteration++, cap=3)
         │                                    │
         │                                    ▼ plateau (iter≥3, no improve 2)
         │                                 SURFACE + ESCALATE
         │   NO
         ▼
┌─────────────────┐
│  VERIFY phase   │  tools: read/bash/lsp_*/lens_* (NO write/edit)
│  (independent)  │  test-honesty grep + reconciliation vs frozen reference
│  GAN evaluator  │  two fresh reviewers must converge (santa)
└────────┬────────┘
         │ pass threshold met (7.0/10) AND convergence?
         │   NO ──► REMEDIATION ──► BUILD (iteration++)
         │   YES
         ▼
┌─────────────────┐
│  SHIP phase     │  commit (only after evidence recorded)
└─────────────────┘

THREE EXITS: PASS (threshold + convergence) · CAP (iteration=3, plateau) · WEDGE (liveness)
```

---

## The durable state schema (ported from cc10x, Pi-native)

```jsonc
// ~/.pi/workflows/{wf}.json
{
  "workflow_uuid": "...",
  "workflow_type": "build" | "debug" | "plan",
  "user_request": "...",
  "intent": {
    "goal": "machine-verifiable done-criterion",
    "non_goals": [],          // anti-Goodhart boundary conditions
    "constraints": [],
    "acceptance_criteria": [], // MUST be anchored to external fact (principle 6)
    "reconciliation_anchor": "path/to/frozen-reference | upstream-total | golden-sample",
    "open_decisions": []
  },
  "phase": "plan" | "build" | "review" | "verify" | "ship",
  "phase_cursor": null,
  "phase_status": {},
  "iteration": 0,              // increments on remediation loop-back
  "max_iterations": 3,         // hard cap (principle 2/3)
  "plateau": { "detect_at": 3, "no_improve_window": 2, "tolerance": 0.3 },
  "results": { "builder": null, "reviewer": null, "verifier": null },
  "evidence": { "builder": [], "reviewer": [], "verifier": [] },
  "quality": {
    "score": null,             // 0-10, from evaluator rubric
    "score_history": [],       // per-iteration — for plateau detection
    "convergence_state": "pending" | "converged" | "diverged",
    "evidence_complete": false
  },
  "telemetry": {
    "loop_counts": { "re_review": 0, "re_verify": 0 },
    "wall_clock_seconds": 0,
    "wedge_detected": false
  },
  "pending_gate": null,
  "remediation_history": [],
  "status_history": [{ "event": "workflow_started", "ts": "...", "phase": "plan" }],
  "created_at": "...",
  "updated_at": "..."
}
```

The `~/.pi/workflows/{wf}.events.jsonl` is the append-only event log (phase
transitions, gate decisions, iteration bumps, scores) — the audit trail.

---

## The pre-loop contract (principle 7 — the "thought-it-through" gate)

`/loop "build user auth"` first asks the agent to produce a contract with these
fields, THEN reviews it against the 5 failure modes, THEN — only if it passes —
starts iterating:

1. **Done-criterion** — machine-verifiable, NOT "tests pass" (Goodhart).
   e.g. "`pytest -q` exits 0 AND `curl /health` returns 200 AND no `as any`/`getByTestId('-mock')` in changed files."
2. **Boundary conditions** — what the agent must NOT do (anti-Goodhart).
   e.g. "must not modify test files in the verify phase; must not delete failing tests."
3. **Reconciliation anchor** — external fact the agent can't rewrite.
   e.g. "frozen reference: `git stash && pytest -q --tb=no > .loop-ref.txt; git stash pop` before iteration 1. Done = diff vs `.loop-ref.txt` shows ONLY new passing tests, no deleted assertions."
4. **Retry cap + escalation** — max 3 iterations; on plateau or cap → halt and surface to human, never silently finish.

If the contract is missing any field → **REJECT** with a message explaining
which failure mode it would trigger. This is the "2am-guess" guard (mode 4).

---

## Test honesty gates (principle 6 — anti-Goodhart)

The VERIFY phase greps changed files before counting any test as PASS:
- `getByTestId('…-mock')` — mock test
- `as any` — type bypass
- `.find(` — bypasses real query
- `setTimeout(` waits — flaky
- `xit(`/`test.skip(`/`describe.skip(` — skipped tests
- deleted test files in the diff — Goodhart mode 3

A hit → that test's PASS doesn't count toward the done-criterion. This is the
silent-failure cure that my-pi currently lacks entirely.

---

## What this changes about the "best in the world" claim

| Before (today) | After (with loop engine) |
|---|---|
| Linear pipeline (`plan→build→review→ship`), forward-only | Bounded loop engine with 3 exits (pass/cap/plateau) + re-review-until-clean |
| Prose guardrails ("don't skip gates") | Code gates that BLOCK advancement (`on("tool_call")` + `setActiveTools`) |
| Same agent audits its own work | Independent verifier via fresh pi-subagents reviewer (santa convergence) |
| "All tests pass" = done | Reconciliation against frozen reference + test-honesty grep |
| Unbounded "return to step 5" | Hard cap (3) + plateau detection (iter≥3, no improve 2) |
| No durable workflow state | `~/.pi/workflows/{wf}.json` + events.jsonl (resumable, auditable) |
| No liveness check | Wedge detection (orphaned tool calls) |

This closes the exact gap cc10x exploits — **in the Pi-ideology way**: one
extension, owns one new axis, composes on all 12 existing packages, registers
zero competing tools, adds zero competing event handlers (the `tool_call` hook
is additive — pi-rewind and pi-hypa already hook it for different concerns).

---

## Build plan (ONLY after approval)

1. `~/.pi/agent/extensions/loop.ts` — the engine (~400-500 lines):
   - `registerCommand("loop")` + `Ctrl+Shift+L` shortcut
   - Pre-flight contract gate → 5-mode check
   - Phase state machine with `setActiveTools` + `on("tool_call")` gates
   - `sendUserMessage({deliverAs:"steer"})` to drive phase transitions
   - Durable state to `~/.pi/workflows/{wf}.json` + `.events.jsonl`
   - Plateau detection + iteration cap + wedge detection
   - `ctx.fork()` at iteration boundaries
   - `setStatus("loop", …)` + optional `/loop-status` TUI via `ui.custom()`
2. Wire into `scripts/install.sh` (deploy `extensions/loop.ts`)
3. Update README: "12 packages, 54 skills, 8 slash commands, **3 custom extensions incl. loop engine**, 10-step autonomous workflow"
4. Update `config/agents.md`: the loop engine is now the router (replaces the "don't spawn a router subagent" line — the loop extension IS the router, built the Pi way)
5. Push to `romiluz13/my-pi`

---

## Open questions for you (the brainstorm)

1. **Iteration cap — 3 or 5?** cc10x defaults to 3 (conservative). ECC's GAN uses 15 (generous). For coding tasks, 3 is the safer default — most real fixes converge in 1-2, and 3+ usually means you're polishing a wrong answer (mode 5). I recommend **3 with a `/loop --max-iterations N` override**.

2. **Should the loop engine REPLACE the `/feature` chain, or sit alongside it?** Two options:
   - **Replace** — `/feature` becomes a thin wrapper that calls `/loop` with build intent. Cleaner, one entry point (like cc10x-router).
   - **Alongside** — keep `/feature` as the simple pipeline, `/loop` as the bounded engine for hard tasks. No conflict (different commands), but two mental models.
   I recommend **alongside first, replace later if `/loop` proves strictly better** — harmony-preserving (no existing command broken).

3. **Santa-method cross-model — do you want it?** Your Grove gateway has both Anthropic (Fable/Sonnet/Opus) and OpenAI (gpt-5.4/grok/kimi) models. The loop engine could route reviewer B to a different family than reviewer A (real model diversity → stronger convergence signal). Costs more tokens but catches single-model blind spots. I recommend **yes, opt-in via `/loop --cross-model`**.

4. **The "don't spawn a router subagent" line in AGENTS.md** — the loop engine is an extension, not a subagent. It honors the spirit (no router SUBAGENT) while providing the router FUNCTION. Should I update that line to reflect the extension-as-router pattern?
