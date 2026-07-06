# AGENTS.md + Skills + Prompts — Pi-Ideology Alignment Audit

Date: 2026-07-07
Scope: `~/.ai/AGENTS.md` (single source of truth), `~/.pi/agent/prompts/` (8 slash-command prompts), `~/.pi/agent/skills/` + `~/.agents/skills/` (skill set), Pi `docs/skills.md` + `docs/settings.md` (spec), `~/.pi/agent/extensions/` (harness code).

---

## 1. AGENTS.md verdict — line/instruction ceiling & duplication

**Line count:** exactly **150 lines** (`wc -l`). The file self-imposes "Keep this file under 200 lines" — it is 50 lines under that cap. The task framing of a "~150-instruction ceiling" is satisfied: counting actual imperative sentences (bulleted imperatives across all sections) yields ~110–120 distinct imperatives, all dense and non-redundant. **Not bloated.**

**Duplication / drift risk between AGENTS.md and prompts:**
The 8 prompts intentionally restate the workflow steps they cover (`build.md` restates steps 4–5; `debug.md` restates step 5 failure path; `plan.md` restates steps 1–3; `review.md` restates step 6; `ship.md` restates steps 7–8). Each prompt opens with "Follow workflow steps X-Y" which anchors it to AGENTS.md. This is **intentional self-containment**, not accidental drift — but it IS a real drift surface: if a workflow step is edited in AGENTS.md without updating the matching prompt, the two diverge and the prompt's restated copy would win inside that command's context. **Low risk, by design; worth noting, not worth removing** (removing the restatement would make prompts context-dependent on AGENTS.md surviving compaction, which guardrails mitigates but doesn't guarantee inside a subagent).

**Duplication between AGENTS.md and skills:** The "Domain skills" manifest is the router — it lists skills + trigger conditions. The skills' own `SKILL.md` frontmatter `description` is what Pi actually loads into the system prompt (per `docs/skills.md` § "How Skills Work"). AGENTS.md's prose descriptions and the frontmatter descriptions are *similar but not verbatim* — this is the intended progressive-disclosure split (AGENTS.md = human-edited router hint, SKILL.md = machine-loaded trigger). No verbatim duplication found.

**No content in AGENTS.md is harmfully duplicated by a skill or prompt.** The restatements are bounded and anchored.

---

## 2. Prompt-chain verdict

**All 8 prompts reference skills that exist.** Verified each `skill:` frontmatter and in-body skill reference against both skill directories:

| Prompt | `skill:` frontmatter | Other skills referenced in body | All exist? |
|--------|----------------------|---------------------------------|-----------|
| `build.md` | `tdd` | `/implement`, `diagnosing-bugs`, `tdd` | ✅ |
| `debug.md` | `diagnosing-bugs` | (none external) | ✅ |
| `feature.md` | — (chain only) | — | ✅ |
| `fix.md` | — (chain only) | — | ✅ |
| `plan.md` | `brainstorming` | `/to-spec`, `/to-tickets`, `/wayfinder`, `prototype`, `grill-with-docs`, `research`, `octocode-research` | ✅ |
| `research.md` | `research` | `bdata`→`brightdata-cli`, `octocode` | ✅ |
| `review.md` | `code-review` (+ `subagent: reviewer`) | `receiving-code-review`, `improve-codebase-architecture` | ✅ |
| `ship.md` | `verification-before-completion` | `commit`, `domain-modeling`, `github`, `diagnosing-bugs` | ✅ |

**Chain integrity:**
- `/feature` → `chain: plan -> build -> review -> ship` — **all 4 prompts exist and compose.** ✅
- `/fix` → `chain: debug -> build -> review -> ship` — **all 4 prompts exist and compose.** ✅
- Both chains use `chainContext: summary` (valid prompt-template feature).

**Slash-command descriptions in AGENTS.md vs prompt frontmatter `description`:** all 8 match (e.g. `/feature` "full chain: plan → build → review → ship" matches `feature.md`'s `chain:`; `/build` "TDD: test first, see fail, implement, see pass" matches `build.md`). **No description drift.** ✅

**Prompt-chain verdict: CLEAN. No broken references. No broken chains.**

---

## 3. Skill-redundancy findings

### Skill counts in AGENTS.md — all verified accurate
MongoDB (8), Vercel/React (5), UI (3), Web (8), Code research (5), User-invoked (12), Internal reference (2), Python/OSS (3), Auto-safety (2). Spot-checked every count against installed skills — **all match.** The "User-invoked (12 — `disable-model-invocation: true`)" claim verified: all 12 listed skills (`/teach`, `/triage`, `/writing-great-skills`, `/setup-pre-commit`, `/wizard`, `/implement`, `/to-spec`, `/to-tickets`, `/grill-with-docs`, `/handoff`, `/improve-codebase-architecture`, `/compact-safe`) carry `disable-model-invocation: true` in their `SKILL.md`. ✅

### Skills installed but NOT referenced in AGENTS.md
| Skill | Location | Verdict |
|-------|----------|---------|
| `bright-data-best-practices` | `~/.pi/agent/skills/` (symlink → `~/Dev/ux-skills/`) | **Doesn't earn its slot — see below.** |
| `grilling` | `~/.agents/skills/` | **Not dead.** `grill-with-docs` depends on it (`SKILL.md`: "Run a `/grilling` session, using the `/domain-modeling` skill."). Internal dependency, correctly omitted from the manifest. |
| `setup-matt-pocock-skills` | `~/.agents/skills/` | One-off repo-setup utility, `dmi:true`. Reasonable to omit from the manifest (not a workflow skill). Not dead. |
| `find-skills` | both dirs | Referenced in AGENTS.md "External tech" step 3 ("Run `find-skills` for that tech"). Not orphaned. |

### `bright-data-best-practices` — the one skill that doesn't earn its system-prompt slot
- **Problem 1 (spec violation):** Its frontmatter uses `user-invocable: false` to hide itself from auto-invocation. But `user-invocable` is **NOT a valid Agent Skills frontmatter field** — per `docs/skills.md` § Validation: "Unknown frontmatter fields are ignored." The correct field is `disable-model-invocation: true`. So the skill's intent (hide from auto-trigger) is **silently not enforced** — Pi still exposes it to the model for auto-invocation, and its 1024-char-ish description consumes system-prompt tokens on every session.
- **Problem 2 (redundancy):** It overlaps heavily with `brightdata-cli` (same Bright Data CLI, same `bdata` tooling). `brightdata-cli` is the one AGENTS.md actually routes to. This skill is a 380-line reference doc that duplicates the same surface.
- **AGENTS.md rule violated:** "`~/.agents/skills/` should contain only skills that earn their place in the system prompt." This one earns a slot it explicitly *tried* to opt out of.

### Cross-directory symlink collisions (informational, not actionable as zero-risk)
~/.pi/agent/skills/ contains ~17 symlinks pointing into ~/.agents/skills/ (e.g. `tdd → ../../../.agents/skills/tdd`, `frontend-design → ...`, `grill-with-docs → ...`) plus octocode skills symlinking to `~/.octocode/skills/` from BOTH dirs. Per `docs/skills.md`: "Name collisions (same name from different locations) warn and keep the first skill found." Pi scans both `~/.pi/agent/skills/` AND `~/.agents/skills/`, so each symlinked skill is discovered twice → a name-collision warning per skill. These symlinks exist so Claude Code/Codex (which read `~/.agents/skills/`) can find Pi-installed skills, but for Pi itself they're redundant. **Not a zero-risk fix** (removing them could break Claude Code/Codex discovery; the symlinks serve a cross-harness purpose), so flagged as a note, not an action.

---

## 4. "Pi harness" section — doc vs. code accuracy

All six harness claims verified against installed code:

| AGENTS.md claim | Verified against | Result |
|-----------------|------------------|--------|
| **Coach** (`coach.ts`): default UI, classifies plain-English input, suggests `/loop`/`/research`/`/review`/`/ship`/"just do it" | `~/.pi/agent/extensions/coach.ts` header: "You type a task in plain English. Before the agent runs, Coach classifies it and suggests the right workflow" | ✅ Accurate |
| **`/loop`**: bounded (cap 3), plateau-aware, independent verifier (santa, `--cross-model`), test-honesty gates, reconciliation over assertion, durable state `~/.pi/workflows/` | `~/.pi/agent/extensions/loop.ts`: "bounded remediation loop-back (cap 3), plateau detection, independent verifier convergence (santa-method), test-honesty gates, and reconciliation over assertion"; `WORKFLOWS_DIR = ~/.pi/workflows` | ✅ Accurate. Also confirmed AGENTS.md's framing "a router FUNCTION built the Pi way (an extension that steers + gates, NOT a subagent)" — loop.ts harmony contract: "Registers ZERO tools. Does NOT re-implement subagent dispatch." |
| **Context sidecar** (`@spences10/pi-context`): >24KB/300 lines → SQLite, receipt, `context_search`/`context_get` | `pi-context/dist/config.js`: `DEFAULT_CONTEXT_CAPTURE_MAX_LINES = 300`; "capture after 24 KiB / 300 lines". Package in `settings.json` packages list. Observed live (this very session indexed two large reads). | ✅ Accurate |
| **Guardrails** (`guardrails.ts`): re-inject AGENTS.md every turn (prominence + compaction-survival) | `~/.pi/agent/extensions/guardrails.ts`: "AGENTS.md prominence re-injection … Re-inject the rules block every turn (default true)" | ✅ Accurate |
| **Destructive-command gate** (`@spences10/pi-confirm-destructive`): system confirms destructive ops | Package present in `settings.json` packages list: `"npm:@spences10/pi-confirm-destructive"` | ✅ Accurate |
| **Observability** (`/observability`): live browser dashboard at `127.0.0.1:43190` | `pi-observability/dist/index.js`: `DEFAULT_OBSERVABILITY_URL = 'http://127.0.0.1:43190'`; `options.js` default port `43190`. Package `@spences10/pi-observability` in settings. | ✅ Accurate |

**No drift between the "Pi harness" section and the actual code.** The section is a faithful, non-overstated summary. ✅

---

## 5. Zero-risk improvements

### Improvement A (zero-risk, recommended): fix `bright-data-best-practices` frontmatter
**File:** `~/Dev/ux-skills/bright-data-best-practices/SKILL.md` (canonical; `~/.pi/agent/skills/bright-data-best-practices` is a symlink to it).
**Change:** `user-invocable: false` → `disable-model-invocation: true`
**Why zero-risk:** `user-invocable` is an unknown field that Pi silently ignores — the skill's stated intent (don't auto-trigger) is currently *not enforced*. Swapping to the correct field name (`disable-model-invocation: true`, per `docs/skills.md` frontmatter spec) makes the intent actually work. No behavior regression: the skill is still loadable via `/skill:bright-data-best-practices`; it just stops consuming a system-prompt auto-invocation slot it was never meant to occupy. This also satisfies the AGENTS.md hygiene rule ("skills that earn their place in the system prompt").
**Scope:** one frontmatter field, one file. No moving parts added.

### Improvement B (zero-risk, optional): consolidate or remove `bright-data-best-practices`
If the Bright Data reference material is already covered by `brightdata-cli` (it largely is), removing `bright-data-best-practices` from `~/.pi/agent/skills/` eliminates the redundancy and the collision outright. Slightly higher touch than A (deletes a skill), so A is the preferred minimal fix; B is the cleaner long-term option.

### Improvement C (note, not an edit): prompt↔AGENTS.md restatement drift surface
The 8 prompts restate workflow steps. This is intentional, but a future edit to an AGENTS.md workflow step could silently diverge from a prompt's restated copy. Consider adding a one-line comment in each prompt like `<!-- keep in sync with AGENTS.md step N -->` (scar-style) so the next editor knows to update both. **Not applied** — adding comments to prompts is a style change beyond audit scope; flagged for the owner.

### No zero-risk improvement found for: AGENTS.md line count (already lean), prompt chains (already clean), harness section (already accurate), skill manifest counts (already correct).

---

## Summary verdict

| Area | Verdict |
|------|---------|
| AGENTS.md ceiling | ✅ 150 lines, ~110–120 imperatives, under the 200-line self-cap. Not bloated. |
| AGENTS.md ↔ skill/prompt duplication | ✅ No harmful duplication. Prompt restatements are intentional & anchored. |
| Prompt skill references | ✅ All 8 prompts reference existing skills. No broken references. |
| Prompt chains (`/feature`, `/fix`) | ✅ All 4 links in each chain exist and compose. |
| Skill manifest counts in AGENTS.md | ✅ All 8 category counts and the `dmi:true` claim verified accurate. |
| Skills that don't earn their slot | ⚠️ `bright-data-best-practices` — uses non-standard `user-invocable: false` (ignored by Pi), so it auto-invokes despite intent; overlaps with `brightdata-cli`. One zero-risk fix (Improvement A). |
| Dead/duplicate skills | ✅ No dead skills. `grilling` is a live dependency of `grill-with-docs`. Cross-dir symlinks cause collision warnings but serve cross-harness discovery (not a zero-risk fix). |
| "Pi harness" section accuracy | ✅ All 6 claims (coach/loop/context/guardrails/gate/observability) verified against installed code. No drift. |

**One actionable zero-risk improvement: fix the `user-invocable: false` → `disable-model-invocation: true` frontmatter field in `bright-data-best-practices/SKILL.md`.** Everything else is clean or informational.
