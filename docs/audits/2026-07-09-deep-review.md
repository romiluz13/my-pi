> **HISTORICAL** — this review found real issues, but most of the critical extension bugs (loop.ts `pi.sendUserMessage`, coach.ts `/coach test`, palette.ts `clear()`, guardrails.ts notification, scripts/install.sh gaps) were fixed in the live source shortly after. Kept for the decision trail. For the current state, run a fresh audit.

# Deep Review — my-pi (8 fresh-context reviewers, 2026-07-09)

Method: 8 fresh-context `reviewer` subagents, each owning one domain, validating
against installed Pi **v0.80.3** docs + dist `.d.ts` type definitions as ground
truth. No reviewer saw the others' work. Full per-domain reports in
`/tmp/my-pi-review/0[1-8]-*.md`.

The `failed`/`needs-attention` control-plane signals were stale artifacts — all 8
deliverables were written before the nudges fired. The `reviewer` agent exits
non-zero by convention; acceptance was "checked" but the subagent harness rejected
on a "changed-files evidence missing" rule (these were read-only reviews, so no
files were changed — a false negative). Reports are complete and valid.

## Verdict by area

| # | Area | Verdict | C | H | M | L |
| --- | ------ | --------- | --- | --- | --- | --- |
| 01 | loop.ts engine | **Not runnable** — core steer primitive calls a non-existent API | 2 | 7 | 6 | 3 |
| 02 | coach.ts + guardrails.ts | Coach blocked (transform bypasses extension cmds); guardrails solid | 1 | 3 | 3 | 5 |
| 03 | handoff.ts + palette.ts | Palette has 2 blockers (crash + keybind shadow); handoff minor | 2 | 0 | 2 | 9 |
| 04 | config + scripts | update.sh aborts on line 2; install.sh doesn't install its headline features | 2 | 3 | 2 | 0 |
| 05 | agents.md workflow | **Clean** — internally consistent, zero dead references | 0 | 0 | 1 | 4 |
| 06 | skills | Brainstorming still leaks Superpowers branding + telemetry; 3 dead skill refs | 0 | 4 | 5 | 7 |
| 07 | prompts | install.sh never deploys prompts; config/prompts/ is dead duplicate | 2 | 1 | 0 | 2 |
| 08 | README + harmony | Numbers wrong (71 skills not 56); 8 audit docs stale; axis list stale | 0 | 3 | 8 | 5 |

Totals: **9 CRITICAL/BLOCKER · 21 HIGH · 27 MEDIUM · 35 LOW** (after dedupe; some
findings recur across reports — e.g. install.sh gaps appear in 04/06/07/08).

---

## CRITICAL / BLOCKER (9)

### C1 — loop.ts: `ctx.sendUserMessage` does not exist → loop engine cannot steer

**Files:** `extensions/loop.ts:234` (`await ctx.sendUserMessage(message, { deliverAs: "steer" })`)
**Evidence (verified by parent against Pi v0.80.3 `dist/core/extensions/types.d.ts`):**

- `ExtensionContext` (line 208) has NO `sendUserMessage`.
- `ExtensionCommandContext extends ExtensionContext` (line 246) has NO `sendUserMessage`.
- `sendUserMessage` exists only on `ReplacedSessionContext` (line 289 — inside
  `withSession()` callbacks only) and `ExtensionAPI` (line 882 — the `pi` object).
- The command handler receives `ExtensionCommandContext`; calling
  `ctx.sendUserMessage(...)` throws `TypeError` on the very first steer.
**Cross-reviewer note:** Report 08 said the old `ctx.ui.sendUserMessage` bug was
"fixed" to `ctx.sendUserMessage`. That's textually true, but the fix moved the
call from one non-existent location to another. Report 01 is the deeper truth.
**Fix:** Call `pi.sendUserMessage(...)` (capture `pi` in the closure), not `ctx.sendUserMessage(...)`.
**Severity: CRITICAL** — the loop's entire steering model is dead.

### C2 — loop.ts: `ctx.fork()` called with no entryId, in an event handler with no fork → checkpoint no-op

**File:** `extensions/loop.ts` (the checkpoint/`fork` path)
**Problem:** `fork(entryId, opts)` requires an `entryId` and is only on
`ExtensionCommandContext`. The code calls it inside an event handler (which
receives `ExtensionContext`, no `fork`) with no entryId, wrapped in a try/catch
that swallows the error. The advertised "checkpoint" feature silently does nothing.
**Fix:** Capture an entryId from the session manager and call `fork` from a
command context, or remove the dead checkpoint code.
**Severity: CRITICAL** — silently broken safety feature.

### C3 — palette.ts: `listContainer.clearChildren()` is not a method → palette crashes on every open

**File:** `extensions/palette.ts` (`renderList()`)
**Evidence:** `Container` from `@earendil-works/pi-tui` declares `clear()`, not
`clearChildren()` (verified in `pi-tui/dist/tui.d.ts` + runtime
`node -e "...'clearChildren' in c"` → `false`). `renderList()` runs immediately
inside the `ctx.ui.custom()` factory, so the palette throws before any interaction.
**Fix:** `listContainer.clear()`.
**Severity: BLOCKER.**

### C4 — palette.ts: `Ctrl+Shift+P` silently shadows built-in `app.model.cycleBackward`

**File:** `extensions/palette.ts` (`Key.ctrlShift("p")`)
**Problem:** Built-in `app.model.cycleBackward` ("cycle to previous model") has
defaultKeys `shift+ctrl+p`. `matchesKey()` normalizes modifier order, so both
match the same input; but Pi's conflict detection does string comparison
(`"ctrl+shift+p" !== "shift+ctrl+p"`) so it's not caught. Extension shortcuts
are checked first → built-in is lost. The harmony contract claimed pi-rewind and
pi-btw were checked but did NOT check `app.model.cycleBackward`.
**Fix:** Pick an unreserved key (check `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS`).
**Severity: BLOCKER.**

### C5 — coach.ts: `transform` action bypasses extension-command re-checking → `/loop` etc. sent as literal text

**File:** `extensions/coach.ts:276` (`return { action: "transform", text: command }`)
**Problem:** The `input` event's `transform` runs AFTER Pi checks extension
commands (on the original text). Post-transform, only skill + prompt-template
expansion run — NOT extension-command re-check. So:

- Prompt-template commands (`/feature`, `/build`, `/research`, `/debug`, `/fix`,
  `/plan`, `/review`, `/ship`) → work (template expansion runs post-transform).
- Extension commands (`/loop`, `/palette`, `/handoff`, `/rewind`, `/btw`, all
  npm-package commands) → **BROKEN**: sent to the agent as literal text.
`/loop` is the command AGENTS.md recommends for hard tasks — Coach will suggest
it, and selecting it sends garbage.
**Fix:** Use `ctx.ui.setEditorText(command)` + `return { action: "handled" }`
(re-enters `prompt()` → full command check). Or split: `transform` for templates,
`setEditorText`+`handled` for extension commands.
**Severity: BLOCKER** — defeats Coach's stated purpose.

### C6 — update.sh: `set -euo pipe-fail` is invalid → script aborts on line 2

**File:** `scripts/update.sh:3`
**Evidence:** `bash -c 'set -euo pipe-fail'` → `set: pipe-fail: invalid option
name`. Correct is `pipefail` (no hyphen), which `install.sh:9` uses correctly.
The script exits before doing anything on every run.
**Fix:** `set -euo pipefail`.
**Severity: BLOCKER.**

### C7 — install.sh: never installs AGENTS.md symlinks, skills, or prompts; ends mid-script

**File:** `scripts/install.sh`
**Problem:** Defines `AGENTS_SKILLS_DIR` (line 26) and `CLAUDE_SKILLS_DIR`
(line 27) and never uses them. After the extensions copy, the file ends at a bare
`# ── Done ──` comment with NO code and NO success banner. README ("How AGENTS.md
works") claims the installer creates `~/.ai/AGENTS.md` + symlinks to
`~/.pi/agent/` and `~/.codex/`, an `@~/.ai/AGENTS.md` import in
`~/.claude/CLAUDE.md`, and copies skills + prompts. None of that wiring exists.
**Fix:** Add the missing steps (create `~/.ai/AGENTS.md` from `config/agents.md`,
symlinks, Claude import, copy skills to `~/.agents/skills`, copy prompts to
`~/.pi/agent/prompts`) and finish with a real success banner — or correct the README.
**Severity: BLOCKER** — a fresh install produces the README's headline config in
name only; AGENTS.md/skills/prompts are absent.

### C8 — install.sh: never deploys prompts → fresh install gets zero slash commands

**File:** `scripts/install.sh` (no prompt copy step)
**Problem:** `/build`, `/feature`, `/review`, etc. would all be absent on a fresh
machine. The 9 files currently in `~/.pi/agent/prompts/` were manually placed.
**Fix:** Add a prompt-install step copying `prompts/*.md` → `~/.pi/agent/prompts/`.
**Severity: BLOCKER** (subset of C7, called out because prompts are the entire
user-facing command surface).

### C9 — config/prompts/ is dead duplicate of prompts/

**File:** `config/prompts/` (8 files, byte-identical to `prompts/`)
**Problem:** `config/prompts/` is not referenced by any script, settings, or load
mechanism. The deployed files match `prompts/` (which has 9 files incl
`setup-audit.md`). Edits to one won't propagate — maintenance hazard.
**Fix:** Delete `config/prompts/`; make `prompts/` the single canonical source.
**Severity: BLOCKER** (structural duplication).

---

## HIGH (21, deduped)

### Loop engine (7) — all `extensions/loop.ts`

1. **Wedge detection entirely unimplemented.** One of the three advertised exits
   (PASS/CAP/WEDGE) does not exist in code — WEDGE is never produced.
2. **Plateau detection unreachable at default cap.** `iteration ≥ 3 AND no
   improvement in last 2` can't fire when cap is 3; cap wins.
3. **BUILD-complete treats RED / "tests fail" as completion.** A failing test
   state is accepted as "BUILD done", defeating test-honesty.
4. **Test-honesty greps the agent's prose**, not the changed files — the agent
   can claim "tests pass" in prose and pass the gate.
5. **Tools never restored on terminal exits** (PASS/CAP/WEDGE/abort) —
   `setActiveTools` restricts per phase but the remediation never resets, leaving
   the agent with a restricted toolset after the loop ends.
6. **Durable state is write-only** — `~/.pi/workflows/{wf}.json` is written but
   never resumed; `/loop-status` reads it but a crashed loop can't restart.
7. **PLAN/BUILD can stall indefinitely** — no per-phase cap or liveness check;
   a stuck subagent wedges the loop with no timeout.

### Coach + guardrails (3)

1. **coach.ts: hardcoded `/palette` fallback always filtered out.** `buildCatalog`
   filters `palette` out, so `isCommandSafe("/palette", valid)` is false → the
   "Browse all commands" escape hatch is dead code.
2. **coach.ts: `{ role: "system" }` is not a valid `Message` type.** Works at
   runtime for `grove-openai` (openai-completions) but silently loses the system
   prompt for Anthropic-based coach models. Use `Context.systemPrompt`. Also the
   user message is missing the required `timestamp` field.
3. **coach.ts + guardrails.ts: module-level mutable state shared across
    concurrent sessions.** `let enabled` (coach) and `let fullInjectNext`
    (guardrails) are process-global; `/coach off` in the main session disables
    coach for subagents too; a subagent's `session_compact` flips
    `fullInjectNext` for the main session. Scope to a `Map<sessionId, …>`.

### Skills (4)

1. **brainstorming `server.cjs` still carries Superpowers branding + a
    third-party telemetry endpoint** (`primeradiant.com` logo URL,
    `github.com/obra/superpowers`). README claims these were removed. A user
    opening the visual companion fetches the logo from primeradiant.com (IP +
    version query) unless telemetry env vars are set.
2. **`.superpowers/` references contradict the actual `.brainstorm/` directory.**
    `visual-companion.md:58` and `stop-server.sh:6` say `.superpowers/`;
    `start-server.sh:117` uses `.brainstorm/`. Users add the wrong dir to `.gitignore`.
3. **`setup-matt-pocock-skills/SKILL.md:37` references `to-issues`, `to-prd`,
    `qa`** — skills that don't exist. Actual equivalents: `to-spec`, `to-tickets`,
    `triage`. Partial adaptation left Matt Pocock's original names.
4. **`frame-template.html:5` title still says "Superpowers Brainstorming"**
    (user-visible in browser).

### Config + scripts (3)

1. **settings.json has a duplicate `retry` key** (lines 12 and 102). jq/Python
    keep the last (the one with nested `provider`); the first is silently
    discarded. Delete the first block.
2. **install.sh banner "15 packages, 60 skills"** contradicts its own PACKAGES
    array (14), settings.json (14), and README ("14 packages, 56 skills"). Two
    of three numbers are wrong.
3. **install.sh merge path drops most curated settings keys.** When
    `~/.pi/agent/settings.json` exists, the jq merge carries only 6 keys
    (thinking/compaction/retry/observational-memory/theme/packages) and silently
    drops `subagents`, `enabledModels`, `treeFilterMode`, `defaultProjectTrust`,
    `branchSummary`, `externalEditor`, `lastChangelogVersion`, `npmCommand`.
    Upgrading over an existing config loses the curated subagent overrides +
    model list.

### README + harmony (3)

1. **README "56 skills" is wrong — actual unique count is 71.** (53 in
    `~/.agents/skills` + ~10 unique in `~/.pi/agent/skills` + 8 package skills.)
2. **extensions/README "12 installed npm packages" axis list is stale.** Lists
    removed `pi-hypa` (compression axis now unowned) and omits 4 active packages
    (`pi-confirm-destructive`, `pi-context`, `pi-observability`,
    `pi-prompt-template-model`). Should be 14.
3. **README: `@hypabolic/pi-hypa` listed as "Removed" but is still in
    `~/.pi/agent/npm/package.json` deps and `node_modules`.** It's
    "deactivated", not uninstalled.

*(Report 07's "README stale re: prompt location + setup-audit" is folded into C9.)*

---

## MEDIUM (27, summarized)

**Loop (6):** plateau-vs-cap ambiguity (cap wins at 3); contract retry says "3
attempts" but message says "2"; verify/review remediation cap is 3-after-initial
(4 total) — ambiguous vs "max 3 iterations"; empty catches swallow C1/C2;
`runLoop` async with no top-level try/catch → unhandled rejection on C1;
`extractContract` conflates malformed JSON with "no JSON".

**Coach/guardrails (3):** default coach model `grove-openai/deepseek-v4-flash` is
provider-specific — no-op for other users with no visible feedback; guardrails'
"ETH Zurich 'Evaluating AGENTS.md' Feb 2026 + +20% inference cost" citation not
found in any research doc and appears fabricated (the real IFScale citation is
correct); guardrails `maxChars: 3500` may truncate before the "Safety" section.

**Handoff/palette (2):** palette printable-input broken on Kitty/Ghostty/WezTerm
(needs `decodePrintableKey`); palette harmony contract says "hooks no events"
but hooks `session_start`.

**Skills (5):** skills/README falsely claims install.sh installs skills;
skills/README documents only 3 of 11 repo skills (6 undocumented);
`setup-matt-pocock-skills` `disable-model-invocation` removed → auto-triggers
instead of user-invoked; `readSuperpowersVersion()` returns 'unknown';
brainstorming "MUST use before ANY modifying behavior" conflicts with AGENTS.md
"skip for small changes".

**Config/scripts (2):** dead `AGENTS_SKILLS_DIR`/`CLAUDE_SKILLS_DIR` vars; stale
"Installing custom extensions (palette + handoff)" step label names 2 of 5.

**README/harmony (8):** README "9 packages rejected" (intro) vs "13" (conclusion);
`pi-observability` (excluded, unscoped, TUI) vs `@spences10/pi-observability`
(installed, scoped, browser) name confusion; 8 audit docs stale
(gap-analysis, version-freshness, final-extensions-audit, final-agents-md-audit,
final-packages-order-audit, harmony-audit, pi-docs-levers — all reference
pre-prune state: 12/15 packages, pi-hypa active, 150-line AGENTS.md, fixed bugs);
agents.md references `compact-safe` which is missing from the shared
`~/.agents/skills` dir (installation inconsistency, not a content error).

**Prompts (1):** `review.md` frontmatter `subagent: reviewer` + body "fan out
2-3 reviewer subagents" requires nested subagent spawning — may not be supported.
Simplest fix: remove `subagent: reviewer` so `/review` runs in the main session
where it CAN fan out.

---

## What is CORRECT (verified clean — no action)

- **config/agents.md autonomous workflow** (Report 05): internally consistent,
  zero dead references. All 16 skills, 7 slash-commands, 2 extensions, and 3
  convention references (`docs/adr/`, `CONTEXT.md`, `CHANGELOG`) verified. This
  is the strongest part of the repo.
- **models.json** (Report 04): valid, 30 models, no duplicate IDs, all provider
  refs resolve, all fields conform to v0.80.3 schema.
- **settings.json shapes** (Report 04): observational-memory, compaction, retry
  (winning), subagents.agentOverrides (all 8 names valid), enabledModels,
  defaultProjectTrust, treeFilterMode, lastChangelogVersion all conform.
- **prompt frontmatter** (Report 07): all fields (`skill`, `chain`,
  `chainContext: summary`, `subagent: reviewer`) valid in v0.80.3; chains
  resolve; referenced skills exist.
- **guardrails.ts state machine + append-only composition** (Report 02): sound.
  The IFScale citation is real; the conditional-injection design is consistent
  with the research.
- **handoff.ts** (Report 03): largely correct — `sessionManager.getBranch()`,
  `ctx.mode`, `setEditorText` all exist and are used correctly.
- **diagnosing-bugs skill** (Report 06): excellent — phased discipline with
  checkable completion criteria.
- **grilling vs grill-with-docs, brainstorming vs octocode-brainstorming**
  (Report 06): complementary, not duplicative.

---

## Recommended fix order

1. **C6** (`pipefail` typo) — 1-char fix, unblocks update.sh.
2. **C7 + C8** (install.sh missing steps) — the installer doesn't install its own
   headline features. Highest user-facing impact.
3. **C9** (delete config/prompts/) + **C1/C2** (loop.ts API fixes) + **C3/C4**
   (palette crash + keybind) + **C5** (coach transform) — the 5 extension
   blockers that make the headline features non-functional.
4. **HIGH 11-14** (Superpowers branding/telemetry cleanup) — privacy + accuracy.
5. **HIGH 15-17** (settings dedupe, banner numbers, merge path) — config hygiene.
6. **HIGH 18-20 + MEDIUM stale docs** — README/audit accuracy pass.
7. Loop engine logic HIGHs (wedge detection, plateau, test-honesty, tool
   restore, durable resume, phase liveness) — these are real but secondary to
   the steer blocker (C1) that makes the whole loop unable to run.

---

## Raw reports

- `/tmp/my-pi-review/01-loop-engine.md` (442 lines)
- `/tmp/my-pi-review/02-coach-guardrails.md` (265 lines)
- `/tmp/my-pi-review/03-handoff-palette.md` (285 lines)
- `/tmp/my-pi-review/04-config-scripts.md` (70 lines)
- `/tmp/my-pi-review/05-agents-workflow.md` (256 lines)
- `/tmp/my-pi-review/06-skills.md` (272 lines)
- `/tmp/my-pi-review/07-prompts.md` (89 lines)
- `/tmp/my-pi-review/08-readme-harmony.md` (219 lines)
