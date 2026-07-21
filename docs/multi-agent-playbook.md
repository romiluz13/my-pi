# Multi-Agent Session Playbook

How to actually use the cross-session collaboration tools we built — with real Pi model names (Opus 4.8, Sonnet 5, GPT-5.4, DeepSeek V4 Pro, Kimi K2.6, GLM-5.2, Grok 4.3, etc.).

## What you have

| Tool | What it does | When to use |
| --- | --- | --- |
| `/bearings` | 4-section digest of all active sessions | When you come back to work, after a break, morning |
| `intercom ask` | Send a message to another session, WAIT for reply | When you want another agent to review/respond |
| `intercom send` | Send a message to another session, don't wait | When you want to notify, not block |
| `session-handoff` skill | Write handoff doc + save memory + notify target session | When a session is getting long or you're switching context |
| `/loop --cross-model` | Autonomous multi-model review with convergence gate | When you want autonomous review (not manual) |

## The anti-sycophancy rules (paste into every cross-session review ask)

```
Rules:
1. Zero findings on non-trivial change = insufficient depth, re-scan before CLEAN
2. Each finding needs file:line + code snippet
3. APPROVE with zero findings + <3 citations = rubber stamp → trigger fallback
4. Steelman the opposing view BEFORE agreeing — argue AGAINST the change, then explain why it survives
```

## Scenario 1: Manual cross-session code review

**You're in Session A (Opus 4.8), just finished building a feature. You want Session B (DeepSeek V4 Pro) to review it.**

```
You: "Ask the deepseek session to review the changes I just made"

Agent A:
  1. Runs intercom list → finds Session B
  2. Sends intercom ask to Session B with:
     - The diff (git diff output)
     - Anti-sycophancy rules (above)

Session B receives the ask, reviews, replies with:
  - Findings (severity, file:line, code snippet)
  - Steelman argument (what's wrong with the change)
  - Verdict (approve / changes requested / reject)

You: "Apply the feedback" or "Push back — tell them X is intentional"

Agent A sends another intercom ask with the pushback.

Session B defends or concedes.

Repeat until you say "stop" or "good enough".
```

## Scenario 2: Two-model debate (different models, same codebase)

**You want Opus 4.8 (Session A) and Kimi K2.6 (Session B) to debate a design decision.**

```
You (to Session A): "I'm considering approach X vs approach Y for the auth module.
Ask the kimi session to debate this with you.
Send them the context and ask them to argue for approach Y while you argue for X."

Session A:
  1. Sends intercom ask to Session B:
     "We're debating X vs Y for auth. I'm arguing for X because [reasons].
      You argue for Y. Rules: steelman my position before attacking it.
      Cite specific files/configs from the repo. Don't agree just to be agreeable."

Session B replies with:
  - Steelman of X (the strongest case for X)
  - Argument for Y with evidence
  - Specific concerns about X

You see both sides. You decide.
```

## Scenario 3: Plan + Review split

**Session A (Sonnet 5) plans, Session B (GPT-5.4) reviews the plan before you build.**

```
You (to Session A): "Plan the Phase 3 self-healing feature.
When the plan is ready, ask the gpt session to review it before I approve."

Session A:
  1. Reads the codebase, writes a plan
  2. Sends intercom ask to Session B with the plan + anti-sycophancy rules

Session B reviews, replies with:
  - Concerns (specific, with evidence)
  - Steelman of the plan
  - Missing edge cases
  - Alternative approaches

You (to Session A): "Apply the feedback and revise the plan"

Session A revises, sends back to Session B for final approval.

Session B approves (with specific reasons, not just "looks good").

You: "Good. Build it."
```

## Scenario 4: Debug collaboration

**Session A (GLM-5.2) is debugging a hard bug. Session B (Grok 4.3) has different model knowledge.**

```
You (to Session A): "I'm stuck on this bug [describe bug].
Ask the grok session for a second opinion. Send them the error,
the relevant code, and what you've tried so far."

Session A:
  1. Sends intercom ask to Session B:
     "Bug: [error message]. Relevant code: [file:lines].
      Tried: [list of attempts]. What's your diagnosis?
      Rules: (1) Don't agree with my diagnosis just because I sent it.
      (2) Form your own hypothesis independently.
      (3) If you agree, explain WHY with evidence, not just 'yes'.
      (4) If you disagree, cite specific code."

Session B replies with:
  - Independent diagnosis (not anchored to A's hypothesis)
  - Evidence (file:line, error text)
  - Agreement or disagreement with specific reasoning

You: "Try B's approach" or "Merge both diagnoses"
```

## Scenario 5: Morning bearings

**You come back to work the next day. Multiple sessions ran overnight.**

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
  - auto-pi — idle (019f623e)

  ### Charted Next
  - Phase 3: self-healing (6 remaining failure modes)

You: "Continue with the sdr-ai session on Phase 3"
```

## Scenario 6: Session handoff (context getting long)

**Session A is approaching context limits. You want to continue in a fresh session.**

```
You (to Session A): "Hand off to a new session. I want to continue Phase 3 work."

Session A:
  1. Writes handoff doc to docs/handoff/2026-07-21-session-handoff.md
  2. Saves key facts to memory
  3. Runs intercom list to find the target session
  4. Sends intercom send to the target session:
     "Handoff: read docs/handoff/2026-07-21-session-handoff.md.
      Continue Phase 3 self-healing. Start with failure mode #4."

You: switch to the target session, say "continue"
```

## Scenario 7: Autonomous multi-model review (no human in the loop)

**You want two models to review each other's work autonomously, with a convergence gate.**

```
You: /loop --cross-model "Review the Phase 2 changes with two different model reviewers"

The loop engine:
  1. Dispatches reviewer A (one model) + reviewer B (different model) as subagents
  2. Both review in parallel with fresh context
  3. Convergence gate: they must agree on findings
  4. Loops until they converge or plateau
  5. Returns structured findings (severity, file:line, verdict)

You: see the converged findings, decide what to fix
```

**Key:** This is AUTONOMOUS — you can't interact mid-loop. Use Scenario 1 when you want to be in control.

---

## Scenario 8: Swarm review (many cheap agents in parallel)

**You want 5-10 cheap agents (DeepSeek V4 Pro, Kimi K2.6, GLM-5.2, GPT-5.4 Mini, Grok Code Fast) to all review the same diff in parallel.**

### How it works

```
You (to Session A — the coordinator, Opus 4.8):
  "Send this diff to 5 cheap-model sessions for parallel review.
   Use intercom send (not ask) to all of them at once.
   Collect their findings, deduplicate, and report the consensus + dissent."

Session A:
  1. intercom list → finds 5 idle sessions (deepseek, kimi, glm, gpt-mini, grok-fast)
  2. Sends intercom send to EACH with the diff + anti-sycophancy rules
  3. Each session reviews independently (no cross-contamination)
  4. Sessions reply via intercom send back to Session A
  5. Session A deduplicates findings, reports:
     - Consensus findings (found by 3+ reviewers)
     - Dissent (one reviewer found something others missed)
     - Conflicts (reviewers disagree on severity)
```

### Honest assessment — when swarm works vs when it fails

**Swarm works for:**

- Finding MORE bugs — 5 reviewers catch more than 2, especially edge cases
- Reducing false negatives — if one model has a blind spot, another catches it
- Cost efficiency — 5 cheap models (DeepSeek, Kimi, GLM) cost less than 1 Opus

**Swarm fails for:**

- Debate/convergence — 10 agents can't "agree" via intercom. intercom is 1:1, not a chat room. You'd get 10 separate replies, not a discussion.
- Anti-sycophancy — the steelman rule doesn't scale. You can't ask 10 agents to steelman each other's positions — that's N² intercom traffic.
- Coordination overhead — at 10 agents, the coordinator spends more time managing intercom than reviewing findings.
- Diminishing returns — 2 reviewers catch ~80% of findings. 5 catch ~90%. 10 catch ~93%. The marginal value drops fast.

### The practical limit: 3-5 agents, not 10

With intercom as the transport:

- **2 agents**: debate, steelman, converge. Best for design decisions.
- **3-5 agents**: parallel review, collect findings, deduplicate. Best for catching edge cases.
- **6+ agents**: noise exceeds signal. The coordinator spends more time managing traffic than reviewing. The anti-sycophancy rules can't be enforced across N agents.

**If you want 10+ agents, use `/loop --cross-model` with multiple parallel subagents — not intercom.** The loop engine's subagent dispatch handles parallelism, structured output, and convergence. intercom is for manual 1:1 or small-group coordination, not large-scale swarms.

### Why NOT to build a swarm protocol

A swarm protocol (broadcast + collect + deduplicate) would need:

- A broadcast mechanism (intercom doesn't have one — it's 1:1)
- A collect-and-wait mechanism (intercom ask is blocking; you'd need N asks in parallel)
- A deduplication layer (merge findings by file:line)
- A convergence check (what % of agents must agree?)

That's a new system. The loop engine already does this (parallel subagents + structured output + convergence gate). For manual swarms, the coordinator (Session A) can just send 5 intercom sends and collect 5 replies — no protocol needed, just a convention.

**The smartest approach: use the loop engine for autonomous swarms (it already handles parallelism + convergence). Use intercom for manual 2-5 agent review. Don't build a new protocol — the tools you have cover both cases.**

---

## Quick reference: which scenario for which situation

| Situation | Use |
| --- | --- |
| Come back to work, what's running? | `/bearings` |
| Ask another session to review my code | Scenario 1 (intercom ask + anti-sycophancy rules) |
| Two models debate a design | Scenario 2 (intercom ask + steelman) |
| Plan + review before building | Scenario 3 (plan → ask review → revise → build) |
| Stuck on a bug, want a second opinion | Scenario 4 (intercom ask + independent hypothesis) |
| Session getting long, need fresh context | Scenario 6 (session-handoff skill) |
| Want autonomous review, no human in loop | Scenario 7 (`/loop --cross-model`) |
| Want many cheap agents to review in parallel | Scenario 8 (swarm — but cap at 3-5 via intercom; use /loop for more) |
