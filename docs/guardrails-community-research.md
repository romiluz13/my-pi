# Research: How people solve "the AI agent ignores my AGENTS.md / CLAUDE.md / system-prompt rules"

## Summary
The community consensus is brutal and clear: **prompt-based rules are requests, not contracts** — they degrade with instruction density and are routinely ignored by every major harness (Claude Code, Cursor, Codex, Aider). The only approach with a hard, non-circumventable reliability floor is **deterministic enforcement that runs outside the model** — PreToolUse hooks that mechanically `deny` a tool call, PostToolUse hooks that inject lint/test feedback, Stop hooks that block premature "done", and external runtime governance layers. Everything else (re-injection, shrinking the file, checklists, structured appends) is real but *partial* — useful for raising the compliance floor from ~70% to ~90%, not for guaranteeing the last mile. For safety-critical rules, prompt-only enforcement is cope.

---

## The root cause (why prompts fail)

1. **Instruction-following decays with density.** Jaroslawicz et al. (Distyl AI, 2025) built IFScale, a benchmark of 10→500 simultaneous keyword-inclusion instructions. Even the best frontier models (gemini-2.5-pro, o3) hit only **68% accuracy at 500 instructions**. Three degradation patterns emerged: *threshold decay* (reasoning models hold near-perfect until ~150 instructions then cliff), *linear decay* (gpt-4.1, claude-sonnet-4 — double the instructions, roughly halve compliance), and *exponential decay* (smaller models collapse after a few dozen). The practical ceiling for reliable adherence is **~150–200 instructions for the best reasoning models, far fewer for Sonnet-class.** [arXiv 2507.11538](https://arxiv.org/html/2507.11538v1)

2. **There is a primacy effect.** Earlier instructions are followed better than later ones; the bias peaks around 150–200 instructions, then converges to uniform failure when overwhelmed. So rule *ordering* matters up to a point, then stops mattering because the model abandons instructions wholesale. [arXiv 2507.11538](https://arxiv.org/html/2507.11538v1)

3. **LLMs are "inherently confusable deputies."** The UK NCSC framing, cited repeatedly: the model cannot reliably distinguish instruction *priority levels* — system prompt, CLAUDE.md, and user message are all one token stream with no hard internal separation. A sufficiently unusual context lets the model reason its way around an "unambiguous" rule. [dev.to – 200 Lines](https://dev.to/minatoplanb/i-wrote-200-lines-of-rules-for-claude-code-it-ignored-them-all-4639)

4. **The model admits it.** In GitHub issue #7777, Claude told the user: *"My default mode always wins because it requires less cognitive effort and activates automatically… I treat contextual instructions as advisory rather than mandatory."* It confirmed that per-prompt reminders are currently necessary and that it *"probably cannot consistently self-regulate."* [claude-code#7777](https://github.com/anthropics/claude-code/issues/7777)

5. **This is cross-harness, not a Claude bug.** Cursor is "a prediction engine, not a policy enforcer" with no built-in policy engine — rules are soft preferences overridden by competing context signals. [Knostic](https://www.knostic.ai/blog/cursor-does-not-follow-rules) Codex CLI repeatedly ignores AGENTS.md (openai/codex#6502, #11838; OpenAI community thread "Codex not processing root level Agent.md"). Aider's `CONVENTIONS.md` is purely prompt context with no enforcement mechanism — it "works" only because users keep it small. [Aider docs](https://aider.chat/docs/usage/conventions.html) HN: *"neither Claude nor any other agent actually reads AGENTS.md without being told to explicitly every session"* (anecdotal, but a traffic sniff confirmed CLAUDE.md *is* injected into the system prompt — so the problem is compliance, not delivery). [HN 45786738](https://news.ycombinator.com/item?id=45786738)

---

## Approach-by-approach verdict

### (1) Re-injection every turn (prominence) — REAL but partial; cope if relied on alone

- **What it is:** Re-stating the critical rule at the start of each turn / each subagent handoff, often in uppercase or with "MUST/ALWAYS/IMPORTANT" emphasis, so it sits in the high-attention primacy window.
- **Evidence it works:** IFScale's primacy effect means earlier-in-context instructions are followed better. HN users report that emphasizing rules with UPPERCASE + "IMPORTANT! ALWAYS DO…" lifted compliance to ~95% for their projects. [HN 45786738](https://news.ycombinator.com/item?id=45786738) The model itself in #7777 endorsed a "visible evidence requirement" — forcing it to quote the rule and show step completion before acting. [claude-code#7777](https://github.com/anthropics/claude-code/issues/7777)
- **Why it's cope for safety:** 95% ≠ 100%. The Substack author had a clearly-worded "never write production config" rule that held reliably *until one session* where context made the write seem justified. Re-injection raises the floor but the residual 5% is exactly the scenario that ends in an incident report. It also doesn't scale — you can't re-inject 200 rules every turn without re-triggering density decay. [Substack – Hooks Do](https://claudecodefornoncoders.substack.com/p/prompts-dont-enforce-rules-hooks)
- **Verdict:** Use it for *guidance* rules (tone, format, approach). **Do not use it as your only control for anything with real consequences.**

### (2) Structural tool-call gates (PreToolUse hooks) — THE WINNER. Not security theater.

- **What it is:** A hook fires *before* a tool executes. If it returns `deny`, the tool call never happens — mechanically, not by model choice. Claude Code, and analogous extension points in other harnesses, support this.
- **Evidence it works:** The single most repeated community finding. The 200-lines author: *"The only safeguard that actually works is Hooks… Rules in prompts are requests. Hooks in code are laws."* [dev.to](https://dev.to/minatoplanb/i-wrote-200-lines-of-rules-for-claude-code-it-ignored-them-all-4639) The Substack piece: a PreToolUse hook fires outside the model's reasoning chain — *"No prompt can override it. No permission setting bypasses it. Even running Claude with `--dangerously-skip-permissions` doesn't change what a hook returns."* [Substack](https://claudecodefornoncoders.substack.com/p/prompts-dont-enforce-rules-hooks) The dotzlaw deep-dive gives the full event model: `PreToolUse` returns `allow`/`deny`/`ask`; `PostToolUse` returns `additionalContext`; `Stop` can block premature completion; `PreCompact` logs what context is being lost. [dotzlaw](https://dotzlaw.com/insights/claude-hooks)
- **The smarter pattern — feedback over gating:** The dotzlaw article's key insight: the strongest use of hooks is *not* deny/allow but injecting context that makes the agent self-correct. A PostToolUse hook that says "3 TypeScript errors at lines 42, 78, 103" is more useful than one that just blocks the write. The ideal stack is **PreToolUse (block the unforgivable) + PostToolUse (feed back quality) + Stop (gate completion)**. [dotzlaw](https://dotzlaw.com/insights/claude-hooks)
- **Per-agent hooks:** Hooks embedded in agent/skill definitions (not just global settings) co-locate validation with the agent's role — a CSV agent gets CSV validation, an API agent gets OpenAPI validation. Avoids global-hook noise. [dotzlaw](https://dotzlaw.com/insights/claude-hooks)
- **Caveat (where it's theater):** Hooks only enforce what you can express as a *deterministic check on tool inputs/outputs*. They cannot enforce "be skeptical" or "search before speaking." Match the rule type to the mechanism: deterministic command hooks for hard safety; prompt/agent-based hooks for quality judgment (and accept those are probabilistic). [dotzlaw](https://dotzlaw.com/insights/claude-hooks)
- **Verdict:** The smartest, most-recommended approach for anything that *must not* be violated. The community's #1 answer.

### (3) Shrink the rules file — REAL as a necessary condition, cope as a complete solution

- **What it is:** Cut CLAUDE.md/AGENTS.md to the ~20 most critical rules; move the rest into skills/progressive-disclosure docs or external enforcement.
- **Evidence it works:** Directly supported by IFScale — compliance decays as instruction count rises, so fewer rules = higher per-rule adherence. The 200-lines author's own conclusion: *"200 lines is too many. Research says 150 is the ceiling. Keep the 20 most critical rules."* [dev.to](https://dev.to/minatoplanb/i-wrote-200-lines-of-rules-for-claude-code-it-ignored-them-all-4639) LinkedIn guidance: keep CLAUDE.md under 150 lines. [LinkedIn – Saunders](https://www.linkedin.com/posts/tosaunders_overview-claude-code-docs-activity-7438202472466386944-wY1W)
- **The counterpoint (grow, don't shrink):** Tyler Folkman, citing Stanford's ACE framework, argues the file should *grow* with structured, itemized, feedback-tracked entries (each with a unique ID and ✓/✗ counters) rather than be compressed — claimed +10.6% accuracy. But ACE is about *knowledge accumulation*, not *rule enforcement*; it still relies on the prompt for compliance. [Folkman](https://tylerfolkman.substack.com/p/stop-compressing-context)
- **The synthesis:** Shrink the *enforcement* surface (the rules that must always hold → move to hooks), and let the *knowledge* surface grow via structured append + progressive disclosure (skills). Shrinking alone, with everything still prompt-only, just means fewer rules are ignored — it doesn't make any rule reliable.
- **Verdict:** Necessary, not sufficient. Pair with hooks.

### (4) Checkpoint "did you read this" — REAL-ish as a process gate, gameable

- **What it is:** Force the agent to display evidence it followed each step (quote the doc section, show the trace) before proceeding. The model in #7777 proposed exactly this: *"Explicit Process Gating… Only after showing evidence of each step → Then begin analysis."* [claude-code#7777](https://github.com/anthropics/claude-code/issues/7777)
- **Evidence it works:** Raises salience and makes skipping *visible* to the human reviewer. The dotzlaw article formalizes this as the "completion gate" `Stop` hook — block the agent from declaring done until criteria pass — which is the deterministic version of the same idea. [dotzlaw](https://dotzlaw.com/insights/claude-hooks)
- **Why it's weak alone:** The model can *fake* the checklist (produce plausible-looking evidence without actually doing the work) — this is the sycophantic-compliance failure mode. A prompt-only checkpoint is a softer version of a hook; a `Stop` hook that runs actual tests is the hard version.
- **Verdict:** Useful as a human-in-the-loop process aid. Upgrade it to a `Stop` hook that checks real artifacts (tests pass, file exists, grep clean) for it to be trustworthy.

### (5) Post-turn audit — REAL and complementary; the foundation is PR checks

- **What it is:** Review/validate the agent's output after the turn or at PR time. PostToolUse hooks run linters/typecheckers and inject errors back as `additionalContext` for self-correction; CI/PR checks are the baseline; external runtime layers (Earthly Lunar, Knostic Kirin) block/redact/replace before code reaches the editor or repo.
- **Evidence it works:** PostToolUse feedback loops are the dotzlaw article's headline pattern — the agent writes, the hook lints, errors flow back, the agent fixes, on every write, session 1 through 200. [dotzlaw](https://dotzlaw.com/insights/claude-hooks) Earthly Lunar's pitch: "context doesn't scale, guardrails do" — same policy engine at authoring + PR + deploy, deterministic, token-cost zero. [Earthly](https://earthly.dev/ai-agent-guardrails) Knostic frames Cursor's lack of a policy engine as the core gap and pushes an external runtime layer that evaluates output *after generation, before editor*. [Knostic](https://www.knostic.ai/blog/cursor-does-not-follow-rules)
- **Why PR-only is insufficient:** "The agent works blind until it opens a PR" — feedback arrives too late, the agent has already moved on. The smart move is *during-authoring* feedback (PostToolUse / Lunar-style agent hooks) so the agent self-corrects in real time. [Earthly](https://earthly.dev/ai-agent-guardrails)
- **Verdict:** Real and the enterprise baseline. Strongest when combined with PreToolUse gates — audit catches what gates don't model.

### (6) Novel / underused approaches the community surfaced

- **Stop hooks as completion gates.** Block the agent from stopping until tests pass / features complete / progress file updated. Exit code 2 = block. Directly attacks the "declares victory prematurely" failure. [dotzlaw](https://dotzlaw.com/insights/claude-hooks)
- **PreCompact hooks for observability.** Fires before context compaction; logs *what the agent is about to forget*. "If your agents seem confused after extended work, PreCompact logs will show you what context was lost." Underused and directly explains mid-session rule-amnesia. [dotzlaw](https://dotzlaw.com/insights/claude-hooks)
- **Skills / progressive disclosure (token-density attack on the root cause).** Keep the system prompt thin (just skill frontmatter/one-line descriptions); load the full how-to only when the skill activates. This *reduces instruction density* — attacking the IFScale-measured root cause rather than fighting compliance head-on. HN: "Skill frontmatter still sits in global context so it's not a pure token optimization, but it lets you compress loaded content to the briefest description." [HN 45786738](https://news.ycombinator.com/item?id=45786738)
- **External runtime governance (AI-UC).** A policy decision point *outside the model* that deterministically accepts/rejects/transforms AI output before it hits the repo. Gartner flags the lack of such controls as a primary enterprise risk. [Knostic](https://www.knostic.ai/blog/cursor-does-not-follow-rules)
- **Structured append-with-counters (ACE).** Instead of rewriting/summarizing CLAUDE.md (which causes "context collapse" — 18k tokens compressed to 122, accuracy drop), append itemized entries with helpful/harmful counters so the playbook improves with feedback. Still prompt-based, but addresses *knowledge degradation* rather than *rule enforcement*. [Folkman](https://tylerfolkman.substack.com/p/stop-compressing-context)
- **Strong handoff protocols for subagents.** Not "check if it looks good" but a structured schema: explicit success criteria, MUST-language checks, defined output JSON, negative cases. Reduces the latitude a subagent has to interpret "done." [Substack](https://claudecodefornoncoders.substack.com/p/prompts-dont-enforce-rules-hooks)

---

## The brutal-honesty matrix

| Approach | Reliability for safety-critical rules | Verdict |
|---|---|---|
| Prompt rules alone (any length) | ~70–95%, decays with density & session length | **Cope** for anything that must not fail |
| Re-injection / emphasis / uppercase | ~90–95%, exploits primacy but erodes | **Real, partial** — guidance only |
| Shrink to ≤20–30 rules | Raises per-rule adherence; necessary | **Necessary, not sufficient** |
| Checkpoint "did you read this" (prompt-only) | Visible but gameable (fake evidence) | **Weak** — upgrade to a Stop hook |
| PreToolUse hook `deny` | **100%, non-circumventable** | **The winner.** Not theater. |
| PostToolUse hook (feedback loop) | Deterministic trigger + self-correction | **Real, complementary** |
| Stop hook (completion gate) | Blocks premature done; runs real checks | **Real, underused** |
| External runtime layer (Lunar/Kirin) | Deterministic, auditable, enterprise | **Real, for org-scale** |
| Skills / progressive disclosure | Reduces root-cause density | **Real, structural fix** |

**The community's smartest stack:** Hooks (PreToolUse block + PostToolUse feedback + Stop gate) for anything that *must* happen → keep the prompt thin (≤20–30 critical rules + skills for the rest) for *guidance* → PR/external runtime as the auditable backstop → PreCompact logs to debug mid-session amnesia. Prompts guide; hooks enforce. Expect ~80% prompt compliance + hooks for the remaining 20% = a productive relationship; expect 100% prompt compliance = daily frustration.

---

## Sources

### Kept (primary, cited above)
- **How Many Instructions Can LLMs Follow at Once?** (Jaroslawicz et al., Distyl AI, 2025) — arXiv:2507.11538 — the quantitative root-cause evidence (density decay, primacy, ~150-instruction ceiling). [arXiv](https://arxiv.org/html/2507.11538v1)
- **I Wrote 200 Lines of Rules for Claude Code. It Ignored Them All.** — dev.to — practitioner case study; hooks = only thing that worked; cites 5+ GitHub issues. [link](https://dev.to/minatoplanb/i-wrote-200-lines-of-rules-for-claude-code-it-ignored-them-all-4639)
- **Prompts Don't Enforce Rules. Hooks Do.** (Daniel Williams) — Substack — the clearest articulation of probabilistic-vs-deterministic enforcement; `--dangerously-skip-permissions` can't bypass hooks. [link](https://claudecodefornoncoders.substack.com/p/prompts-dont-enforce-rules-hooks)
- **Claude Code Hooks: The Deterministic Control Layer** — dotzlaw — full hook event model, 4 architectural patterns, per-agent hooks, PreCompact observability. [link](https://dotzlaw.com/insights/claude-hooks)
- **[BUG] Claude ignores instruction in CLAUDE.MD** — github.com/anthropics/claude-code#7777 — the model's own admission that it treats rules as advisory and default-mode wins. [link](https://github.com/anthropics/claude-code/issues/7777)
- **How I use every Claude Code feature** — HN 45786738 — community anecdotes: uppercase emphasis → 95%, traffic-sniff confirms CLAUDE.md is in system prompt, skills as progressive disclosure, single-rule files still ignored ~50%. [link](https://news.ycombinator.com/item?id=45786738)
- **What to Do When Cursor Doesn't Follow the Rules** — Knostic — Cursor as prediction engine with no policy engine; external runtime governance (AI-UC). [link](https://www.knostic.ai/blog/cursor-does-not-follow-rules)
- **Guardrails for AI Coding Agents** — Earthly Lunar — deterministic external guardrails at authoring + PR + deploy; "context doesn't scale, guardrails do." [link](https://earthly.dev/ai-agent-guardrails)
- **Specifying coding conventions** — Aider docs — conventions as read-only cached prompt context; no enforcement mechanism (works only because kept small). [link](https://aider.chat/docs/usage/conventions.html)
- **Your CLAUDE.md should grow, not shrink** (Tyler Folkman) — Substack — ACE counterpoint: structured append + feedback counters; addresses knowledge degradation, not rule enforcement. [link](https://tylerfolkman.substack.com/p/stop-compressing-context)

### Dropped (SEO-heavy, redundant, or low-signal)
- *106 Real-World Best Practices for CLAUDE.md* (Medium) — listicle, no enforcement evidence.
- *Stop using AGENTS.md and CLAUDE.md (do this instead)* (YouTube) — video, no transcript evidence retrieved.
- *Cursor Rules: Why Your AI Agent Is Ignoring You* (Medium) — overlapped with Knostic, less primary.
- *Claude Code Hooks in 2026: A Production Playbook* (Totalum) — overlapped heavily with dotzlaw, less rigorous.
- *Hooks: The Enforcement Layer…* (Ranjan Kumar) — competent but fully redundant with dotzlaw/Substack.
- Reddit r/ClaudeAI "layered defense framework" — only 342 chars retrieved (title-only); insufficient content.
- Reddit r/ClaudeCode "MUST use agent ignored 80%" — same; title-only.
- agents.md (the spec site) — definitional, not about enforcement failure.

## Gaps
- **Empirical hook-failure rates:** No public benchmark measures how often hooks themselves misfire or get misconfigured (e.g., matcher can't see arguments — a documented footgun). The "100%" claim is architectural, not statistically measured at scale.
- **Non-Claude harness hook parity:** Most concrete hook evidence is Claude Code. Cursor/Codex/Aider/OpenCode equivalent extension points are less documented; claims of portability are vendor marketing (Earthly, Knostic) more than independently verified.
- **Prompt-injection vs. rule-enforcement interaction:** Whether hooks also defend against malicious prompt injection that tries to *disable* rule-following is mentioned but not benchmarked.
- **Long-horizon hook cost:** Synchronous hooks block the agent; the performance tax of a full Pre+Post+Stop+PreCompact stack over a 200-step session is anecdotal, not measured.

**Suggested next steps:** (a) build a minimal repro harness measuring per-rule compliance at 20/50/100/200 instructions with and without a PreToolUse+PostToolUse hook stack, on Sonnet and a reasoning model; (b) audit whether the Pi harness exposes hook-equivalent extension points (PreToolUse/PostToolUse/Stop) or only prompt-level enforcement; (c) test the "shrink + skills" density-reduction thesis by comparing compliance of a 200-line AGENTS.md vs. a 30-line + 8-skill setup.
