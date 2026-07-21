# Multi-Agent Session Playbook

How to use cross-session collaboration in auto-pi — with real Pi model names. This is a reference doc; the rules live in AGENTS.md (injected every turn) and the procedure lives in `skills/session-handoff/SKILL.md`.

## The anti-sycophancy rules (paste into every cross-session review ask)

```
Rules:
1. Zero findings on non-trivial change = insufficient depth, re-scan before CLEAN
2. Each finding needs file:line + code snippet
3. APPROVE with zero findings + <3 citations = rubber stamp → trigger fallback
4. Steelman the opposing view BEFORE agreeing — argue AGAINST the change, then explain why it survives
```

## Scenario 1: Manual cross-session review (diff, design, plan, or bug)

**You're in Session A (Opus 4.8). You want Session B (DeepSeek V4 Pro, FW-Kimi-K2.7-Code, GPT-5.4, or Grok 4.3) to review your work.**

```
You: "Ask the deepseek session to review the changes I just made"

Agent A:
  1. intercom list → finds Session B
  2. intercom ask to Session B with the diff + anti-sycophancy rules

Session B replies with:
  - Findings (severity, file:line, code snippet)
  - Steelman argument (what's wrong with the change)
  - Verdict (approve / changes requested / reject)

You: "Apply the feedback" or "Push back — tell them X is intentional"

Repeat until you say "stop".
```

**Same pattern for:** design debate (send the design, ask B to argue the opposing side), plan review (send the plan, ask B for concerns + steelman), bug diagnosis (send the error + code, ask B for an independent hypothesis). The content changes; the pattern doesn't.

## Scenario 2: Morning bearings

```
You: /bearings

Output:
  ## Bearings — 2026-07-21

  ### Your Call
  - Phase 2 spec needs your approval (Issue #11)

  ### Recently Landed
  - feat(phase2): require full 4-touch cadence (51811fb)

  ### Underway
  - sdr-ai — working (019f3708) — Phase 3 self-healing

  ### Charted Next
  - Phase 3: self-healing (6 remaining failure modes)
```

## Scenario 3: Session handoff (context getting long)

```
You (to Session A): "Hand off to a new session."

Session A:
  1. Writes handoff doc to docs/handoff/<date>-session-handoff.md
  2. Saves key facts to memory
  3. intercom send to the target session with the doc path + next steps
```

## Scenario 4: Autonomous multi-model review (no human in the loop)

```
You: /loop --cross-model "Review the Phase 2 changes with two different model reviewers"

The loop engine:
  1. Dispatches reviewer A + reviewer B (different model families) as subagents
  2. Both review in parallel with fresh context
  3. Convergence gate: they must agree on findings
  4. Loops until they converge or plateau
  5. Returns structured findings (severity, file:line, verdict)
```

**Key:** This is AUTONOMOUS — you can't interact mid-loop. Use Scenario 1 when you want to be in control.

## Scenario 5: Swarm review (3-5 cheap agents in parallel)

**You want 3-5 cheap agents (DeepSeek V4 Pro, FW-Kimi-K2.7-Code, GLM-5.2, GPT-5.4 Mini) to all review the same diff.**

```
You (to Session A — coordinator, Opus 4.8):
  "Send this diff to 4 cheap-model sessions for parallel review.
   Use intercom send to all of them. Collect findings, deduplicate, report consensus + dissent."

Session A:
  1. intercom list → finds 4 idle sessions
  2. intercom send to EACH with the diff + anti-sycophancy rules
  3. Each reviews independently
  4. Sessions reply via intercom send back to Session A
  5. Session A deduplicates, reports:
     - Consensus (found by 3+ reviewers)
     - Dissent (one found something others missed)
     - Conflicts (disagree on severity)
```

**Honest assessment:**

- **2 agents**: debate, steelman, converge. Best for design decisions.
- **3-5 agents**: parallel review, collect findings. Best for catching edge cases.
- **6+ agents**: DON'T use intercom. Use `/loop --cross-model` with parallel subagents — it handles parallelism, structured output, and convergence. intercom is 1:1, not a chat room. At 6+ the noise exceeds signal.

## Quick reference

| Situation | Use |
| --- | --- |
| Come back to work, what's running? | `/bearings` |
| Ask another session to review my code/design/plan/bug | Scenario 1 (intercom ask + anti-sycophancy rules) |
| Session getting long, need fresh context | Scenario 3 (session-handoff skill) |
| Want autonomous review, no human in loop | Scenario 4 (`/loop --cross-model`) |
| Want many cheap agents to review in parallel | Scenario 5 (swarm — cap at 3-5; use /loop for more) |
