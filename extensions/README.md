# Pi Custom Extensions

User-local TypeScript glue for the Pi coding agent. These extensions are
**harmony-preserving glue**: each reads from an existing store or surface and
owns no axis that an installed package already owns. They are hot-reloadable
with `/reload`.

## Files

### `palette.ts` — Leader-key command palette

Fuzzy command palette over **every** slash command Pi has registered (prompts,
skills, extension commands). Discovers dynamically via `pi.getCommands()` — no
manual registry, no drift when prompts/skills are added.

- **Trigger:** `Ctrl+Shift+K` or `/palette`
- **On select:** inserts `/<command>` into the editor; Pi's native dispatch
  handles execution. Zero re-implementation of any command.
- **Harmony contract:** owns NO axis (no tools, no events, no storage). Reserves
  only `Ctrl+Shift+K` (chosen to avoid the built-in `app.model.cycleBackward` =
  `shift+ctrl+p`, which `matchesKey` normalizes to the same input). pi-rewind
  (`Esc+Esc`) and pi-btw (`/btw`) untouched.
- **Why it exists:** closes the single biggest ideology gap — Pi's primary
  extensibility primitive is the TypeScript extension, and this dir previously
  had zero. Also folds in the telescope/fuzzy-finder gap as one navigation
  primitive over the existing command surface.

### `handoff.ts` — Session handoff (`/handoff`)

Generates a self-contained `HANDOFF.md` from the current session and drafts a
continuation prompt into the editor — **without** compacting (lossy) and
**without** an extra LLM call (which would compete with pi-hermes-memory /
pi-observational-memory background work).

- **Usage:** `/handoff` or `/handoff now implement tests`
- **Captures:** last compaction summary, recent user messages, file paths
  mentioned, your next task. Deterministic — no model call, no token cost.
- **Harmony contract:** reads `ctx.sessionManager` (Pi core), writes one file
  (`HANDOFF.md` in cwd). Owns no axis, hooks no events, registers no tools.
  Complements the `handoff` **skill** (prose guidance) with mechanical doc
  generation. Does NOT touch compaction (pi-observational-memory) or search
  (pi-hermes-memory).

### `loop.ts` — Bounded autonomous loop engine (`/loop`)

The one structural capability auto-pi was missing: a real **loop engine**, not a
forward-only pipeline. Pre-flight contract gate → PLAN → BUILD → REVIEW →
VERIFY → SHIP, with bounded remediation loop-back (cap 3), plateau detection
(`iteration ≥ 3` AND no improvement in last 2), independent verifier
convergence (santa-method, cross-model opt-in), test-honesty gates, and
reconciliation over assertion. **Three exits: PASS / CAP / WEDGE.**

- **Trigger:** `/loop "<task>"` or `Ctrl+Shift+L`. Flags: `--max-iterations N`
  (default 3), `--cross-model` (santa cross-model review). `/loop-status`,
  `/loop-abort`.
- **Harmony contract:** owns ONE new axis (durable workflow state + phase gates
  - iteration control). Registers ZERO tools. Pi has no `executeTool` API, so
  the engine COMPOSES on pi-subagents/pi-lens/hermes by STEERING the agent
  (`sendUserMessage({deliverAs:'steer'})` + `setActiveTools` per phase +
  `on('tool_call')` gates) — it never re-implements delegation. Durable state
  at `~/.pi/workflows/{wf}.json` + `.events.jsonl` (separate from hermes SQLite
  - observational ledger). The `tool_call` hook is additive (pi-rewind and
  pi-hypa hook the same event for different concerns; this one only blocks
  tools outside the phase allowlist).
- **7 design principles:** five-mode pre-flight, plateau-aware, GAN-shaped (3
  exits), convergence (santa), liveness (wedge detection), reconciliation over
  assertion, thought-it-through gate (pre-loop contract).
- **5 prompt techniques stolen from Archon** (all steering-text — zero new moving
  parts): (1) 5 specialized parallel reviewers + synthesis (code-review /
  error-handling / test-coverage / comment-quality / docs-impact) instead of
  generic "2-3 reviewers"; (2) per-phase CHECKPOINT gates (visible evidence
  before signaling completion); (3) "Patterns to Mirror" with actual file:line
  code snippets extracted in PLAN, referenced as MIRROR on each BUILD task; (4)
  honor the contract's `nonGoals` in review (anti-scope-creep — don't flag
  intentional exclusions); (5) per-task validation in BUILD (type-check after
  every file change — "never accumulate broken state"). See
  `docs/archon-learnings.md`.
- **Design doc:** `docs/loop-engine-design.md` (or `/tmp/pi-loop/DESIGN.md` in
  dev). Full rationale + cc10x comparison in `docs/audits/`.

### `guardrails.ts` — AGENTS.md prominence re-injection

Solves the known failure: "the agent says it didn't pay attention to AGENTS.md."
Every turn, `before_agent_start` re-appends a HARD RULES block — pulled from
the AGENTS.md that Pi already loaded into `systemPromptOptions.contextFiles` —
to the top-attention region of the system prompt. Defeats mid-session forgetting
and survives compaction by construction (Pi re-runs `before_agent_start` on the
retried turn). Plus `session_compact` audit + `/guardrails on|off|test`.

- **Trigger:** automatic (loads on session_start, runs every before_agent_start).
- **Harmony contract:** owns NO axis, registers NO tools, hooks NO tool_call.
  `before_agent_start` is append-only (composes with hermes + ptm + rewind).
  `session_compact` is read-only (composes with hermes flush + observational
  compaction summary).
- **Honest scope:** this is the PROMINENCE tier (~90-95% reliable per IFScale
  research), NOT the ENFORCEMENT tier. For safety-critical rules that must
  never fail, add `on('tool_call') {block:true}` gates later — see the upgrade
  path in `docs/guardrails-research.md`. This extension makes rules hard to
  ignore; it cannot physically prevent violation.
- **Research basis:** arXiv 2507.11538 (IFScale — density decay, primacy),
  claude-code#7777 (model admits rules are advisory), community consensus.

### `coach.ts` — the system comes to you (auto-coach)

Solves the adoption problem: "I can't remember all the commands."
You type a task in plain English. Before the agent runs, Coach classifies it
(build / debug / plan / research / review / ship / trivial) and shows a
one-tap suggestion of the right workflow. You press Enter to accept — Coach
transforms your input into the matching slash command. You never have to
remember /loop, /feature, /research — Coach tells you which fits THIS task.

- **Trigger:** automatic — intercepts every user input via the `input` event.
  Skip with: prefix `!` (raw) or `/` (already a command). `/coach on|off|test`.
- **Harmony contract:** owns NO axis, registers NO tools, hooks NO tool_call,
  NO before_agent_start. The `input` event is NOT used by any installed
  package or other extension — it's a free axis. Skips `source:"extension"`
  messages so it never interferes with loop steering or hermes background work.
  Trivial tasks pass through untouched (zero friction for the common case).
- **Why this exists:** a system you don't use is worth zero. 8 slash commands +
  4 extension triggers is past the human instruction ceiling. Coach inverts
  the interface — the system surfaces the command, you don't recall it.

## Harmony guardrails (for any future extension added here)

1. **One moving part per axis.** Each capability axis already has an owner
   among the 14 installed npm packages (see `~/.pi/agent/npm/package.json`):
   memory=hermes, search=hermes, context-sidecar=pi-context,
   compaction=observational, rewind=pi-rewind, statusline=pi-statusline,
   feedback=pi-lens, subagents=pi-subagents, messaging=pi-intercom,
   web=pi-web-access, observability=pi-observability,
   questions=rpiv-ask-user-question, side-convo=pi-btw,
   destructive-guard=pi-confirm-destructive. A new extension must
   declare which axis it owns and touch no other.
2. **Extensions over packages for glue.** Local orchestration/doc/mode glue
   belongs here as `.ts` reading from existing stores — never a re-implementation
   of a published package.
3. **Single source of truth for roles.** `subagents.agentOverrides` (in
   `settings.json`) is the role vocabulary; `prompts/*.md` is the command
   surface. New commands/modes must *reference* these, not duplicate.
4. **Read, don't duplicate, event streams.** Subscribe to hermes/observational/
   lens events; never re-emit.
5. **Trust settings are user intent.** No extension may silently override
   `defaultProjectTrust`.

## Verified but NOT installed (needs a user decision)

### `pi-mcp-adapter` (npm, v2.11.0) — VERIFIED SAFE, ready to install

MCP protocol bridge — the one axis no installed package owns. Conflict-checked
against all 14 installed packages:

- Tools registered: `mcp`, `pi-mcp-probe` — no collision with any installed
  package or built-in.
- Commands: `/mcp`, `/mcp-auth` — no collision.
- Shortcuts: none — no keybinding collision with palette (`Ctrl+Shift+K`),
  pi-rewind (`Esc+Esc`), or pi-btw (`/btw`).
- Events: `session_start`, `session_shutdown` (additive lifecycle cleanup),
  `tool_result`. The `tool_result` hook only re-flags MCP-tool failures
  (`details.error === "tool_error" | "call_failed"`) and does not mutate
  content/details — scoped to MCP tools, so it cannot interfere with pi-hypa,
  pi-lens, or pi-rewind.

**Not auto-installed** because it needs an MCP server config to be useful, and
the right first server is a MongoDB one (matching the `mongodb-*` skill suite),
which needs your connection credentials. A dormant adapter with no servers is a
moving part that does nothing.

To install when ready:

```bash
pi install npm:pi-mcp-adapter
# then add a server config, e.g. a MongoDB MCP server, and /reload
```

### Semantic git (`pi-sem`) — NOT available standalone; build as glue instead

`pi-sem` ships only inside `tomsej/pi-ext` (a git bundle that also brings
leader-key, telescope, tool-pills, session-snap, and permissions). Installing
that whole bundle would **conflict** with `palette.ts` (leader-key + telescope
overlap) and add a competing permissions axis — a harmony violation.

**Recommendation:** if you want semantic git, build it as a future
`extensions/sem-git.ts` glue file that shells out to the `sem` CLI and feeds
labels into pi-hermes-memory — orthogonal to pi-rewind (which owns working-tree
rewind, not commit semantics). Do not install the `tomsej/pi-ext` bundle.

## Explicitly excluded (would conflict — do NOT add)

- `pi-dynamic-workflows` — re-implements fan-out; conflicts with pi-subagents +
  pi-btw + pi-intercom.
- Team-mode RPC — second message bus; conflicts with pi-intercom (`broker.sock`).
- `pi-observability` dashboard — TUI real-estate fight with pi-statusline +
  duplicates pi-lens / pi-observational-memory event streams.
- `tomsej/pi-ext` bundle — brings a competing palette + permissions (conflicts
  with `palette.ts`).

## Verification

Both extensions load cleanly at Pi startup (Pi surfaces extension load failures
to stderr as `Failed to load extension ...`; these two produce none). LSP
diagnostics: 0 errors. Biome: clean.
