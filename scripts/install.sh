#!/usr/bin/env bash
# auto-pi installer — a Pi coding agent config where the workflow decides what to do
#
# Usage:
#   ./scripts/install.sh          # install everything
#
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info() { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
error() {
	echo -e "${RED}✗${RESET} $*" >&2
	exit 1
}
step() { echo -e "\n${BOLD}→ $*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PI_AGENT_DIR="${HOME}/.pi/agent"
AGENTS_SKILLS_DIR="${HOME}/.agents/skills"

echo -e "${BOLD}auto-pi installer${RESET}"
echo -e "A Pi coding agent config where the workflow decides what to do — auto-pi — 14 packages, 6 custom extensions (coach + loop engine + guardrails + trace), autonomous workflow.\n"

# ── Prerequisites ──────────────────────────────────────────────────────────

step "Checking prerequisites"

command -v pi >/dev/null 2>&1 || error "Pi is not installed. Run: curl -fsSL https://pi.dev/install.sh | sh"
command -v npm >/dev/null 2>&1 || error "npm is not installed. Install Node.js first."
command -v git >/dev/null 2>&1 || error "git is not installed."
command -v mise >/dev/null 2>&1 || warn "mise not found — settings.json requires mise exec node@24 -- npm"
command -v gh >/dev/null 2>&1 || warn "gh CLI not found — GitHub features will be limited."

info "Prerequisites OK"

# ── Settings ───────────────────────────────────────────────────────────────

step "Configuring Pi settings"

mkdir -p "$PI_AGENT_DIR"

# Merge our settings into existing Pi settings (preserve provider/model)
if [ -f "$PI_AGENT_DIR/settings.json" ]; then
	cp "$PI_AGENT_DIR/settings.json" "$PI_AGENT_DIR/settings.json.bak.$(date +%s)"
	# Merge our curated keys over the existing settings, preserving the user's
	# provider/model/apiKey. Deep-merge so we carry every curated key (not just
	# a subset) while never clobbering auth/provider choices the user already made.
	existing=$(cat "$PI_AGENT_DIR/settings.json")
	ours=$(cat "$SCRIPT_DIR/config/settings.json")
	echo "$existing" | jq --argjson ours "$ours" '. + {
    "defaultThinkingLevel": $ours.defaultThinkingLevel,
    "compaction": $ours.compaction,
    "retry": $ours.retry,
    "observational-memory": $ours["observational-memory"],
    "theme": $ours.theme,
    "packages": $ours.packages,
    "subagents": $ours.subagents,
    "enabledModels": $ours.enabledModels,
    "treeFilterMode": $ours.treeFilterMode,
    "defaultProjectTrust": $ours.defaultProjectTrust,
    "branchSummary": $ours.branchSummary,
    "externalEditor": $ours.externalEditor,
    "lastChangelogVersion": $ours.lastChangelogVersion,
    "npmCommand": $ours.npmCommand
  }' >/tmp/pi-settings-merged.json
	mv /tmp/pi-settings-merged.json "$PI_AGENT_DIR/settings.json"
else
	cp "$SCRIPT_DIR/config/settings.json" "$PI_AGENT_DIR/settings.json"
fi

info "Pi settings configured"

# ── Models ─────────────────────────────────────────────────────────────────

step "Deploying model definitions"

cp "$SCRIPT_DIR/config/models.json" "$PI_AGENT_DIR/models.json"
info "Model definitions deployed (set $GROVE_API_KEY for Grove providers)"

# ── Packages ───────────────────────────────────────────────────────────────

step "Installing 14 Pi packages"

# Order matters: confirm-destructive must run BEFORE the rest so it sees
# the original bash command. pi-context must run BEFORE pi-lens so
# large-output receipts don't replace lens diagnostics.
PACKAGES=(
	@spences10/pi-confirm-destructive
	@spences10/pi-context
	pi-hermes-memory
	pi-observational-memory
	pi-subagents
	@spences10/pi-observability
	pi-lens
	@narumitw/pi-statusline
	pi-intercom
	pi-prompt-template-model
	pi-btw
	@juicesharp/rpiv-ask-user-question
	pi-rewind
	pi-web-access
)

for pkg in "${PACKAGES[@]}"; do
	echo "  installing $pkg..."
	pi install "npm:$pkg" 2>&1 | tail -1
done

# ── Legacy namespace shims (pi-intercom, pi-rewind) ─────────────────────────
step "Installing legacy namespace shims for pi-intercom and pi-rewind"

# These two packages were published against the old @mariozechner namespace
# before Pi moved to @earendil-works. They still work, but only if the old
# import names resolve. We provide thin shims that re-export the current API.
LEGACY_SHIM_DIR="$SCRIPT_DIR/vendor/@mariozechner"
TARGET_DIR="$PI_AGENT_DIR/npm/node_modules/@mariozechner"

mkdir -p "$TARGET_DIR"
for shim in pi-coding-agent pi-tui; do
	if [ -d "$LEGACY_SHIM_DIR/$shim" ]; then
		rm -rf "$TARGET_DIR/$shim"
		ln -sf "$LEGACY_SHIM_DIR/$shim" "$TARGET_DIR/$shim"
		echo "  linked @mariozechner/$shim shim"
	fi
done
info "Legacy namespace shims installed"

# Rebuild native modules whose install scripts are blocked by npm's allowScripts policy.
# better-sqlite3 is required by pi-hermes-memory / pi-observational-memory.
step "Rebuilding native modules"
(
	cd "$PI_AGENT_DIR/npm"
	npm install-scripts approve better-sqlite3 2>&1 | tail -1
	npm rebuild better-sqlite3 2>&1 | tail -1
) || warn "better-sqlite3 rebuild failed — may need manual fix"
info "Native modules rebuilt"

# ── Web Search Config (pi-web-access) ───────────────────────────────────────

step "Configuring web search (pi-web-access)"

if [ ! -f "${HOME}/.pi/web-search.json" ]; then
	cat >"${HOME}/.pi/web-search.json" <<'WSEOF'
{
  "provider": "brave",
  "workflow": "summary-review"
}
WSEOF
	info "Created ~/.pi/web-search.json (add your API keys: braveApiKey, tavilyApiKey, geminiApiKey)"
else
	info "web-search.json already exists — keeping your keys"
fi

# ── Custom Extensions ─────────────────────────────────────────────────────

step "Installing custom extensions (coach, loop, guardrails, palette, handoff, trace)"

mkdir -p "$PI_AGENT_DIR/extensions"
for ext in "$SCRIPT_DIR"/extensions/*.ts; do
	[ -f "$ext" ] || continue
	name=$(basename "$ext")
	cp "$ext" "$PI_AGENT_DIR/extensions/$name"
	echo "  installed extension: $name"
done
# Copy the extensions README (documentation, not code)
[ -f "$SCRIPT_DIR/extensions/README.md" ] && cp "$SCRIPT_DIR/extensions/README.md" "$PI_AGENT_DIR/extensions/README.md"
info "Custom extensions installed — /reload in Pi to activate (Ctrl+Shift+K for palette, /handoff for session handoff, /trace-skills for activation audit)"

# ── AGENTS.md (single source of truth across Pi + Claude Code + Codex) ──────

step "Installing AGENTS.md (shared across Pi, Claude Code, Codex)"

mkdir -p "${HOME}/.ai" "${HOME}/.codex" "${HOME}/.claude"
# ~/.ai/AGENTS.md is the real file; the others symlink to it.
if [ ! -f "${HOME}/.ai/AGENTS.md" ] || ! cmp -s "$SCRIPT_DIR/config/agents.md" "${HOME}/.ai/AGENTS.md"; then
	cp "$SCRIPT_DIR/config/agents.md" "${HOME}/.ai/AGENTS.md"
	echo "  installed ~/.ai/AGENTS.md"
else
	echo "  ~/.ai/AGENTS.md already up to date"
fi
ln -sf "${HOME}/.ai/AGENTS.md" "${PI_AGENT_DIR}/AGENTS.md"
ln -sf "${HOME}/.ai/AGENTS.md" "${HOME}/.codex/AGENTS.md"
# Claude Code uses an @import in CLAUDE.md.
CLAUDE_MD="${HOME}/.claude/CLAUDE.md"
touch "$CLAUDE_MD"
if ! grep -q '@~/.ai/AGENTS.md' "$CLAUDE_MD" 2>/dev/null; then
	printf '\n@~/.ai/AGENTS.md\n' >>"$CLAUDE_MD"
	echo "  added @~/.ai/AGENTS.md import to ~/.claude/CLAUDE.md"
else
	echo "  ~/.claude/CLAUDE.md already imports AGENTS.md"
fi
info "AGENTS.md wired across Pi + Claude Code + Codex"

# ── Prompt Templates (the user-facing command surface) ──────────────────────

step "Installing prompt templates"

mkdir -p "$PI_AGENT_DIR/prompts"
for prompt in "$SCRIPT_DIR"/prompts/*.md; do
	[ -f "$prompt" ] || continue
	cp "$prompt" "$PI_AGENT_DIR/prompts/$(basename "$prompt")"
done
info "Prompt templates installed ($(ls "$PI_AGENT_DIR/prompts"/*.md 2>/dev/null | wc -l | tr -d ' ') commands)"

# ── Repo Skills ──────────────────────────────────────────────────────────────

step "Installing repo skills"

mkdir -p "$AGENTS_SKILLS_DIR"
for skill_dir in "$SCRIPT_DIR"/skills/*/; do
	[ -d "$skill_dir" ] || continue
	name=$(basename "$skill_dir")
	cp -R "$skill_dir" "$AGENTS_SKILLS_DIR/$name"
done
# ~/.pi/agent/skills is populated by installed npm packages + fetched skills
# (Bright Data via update.sh, Octocode via `npx octocode skill`). The repo
# skills live in ~/.agents/skills which all three agents read.
info "Repo skills installed to ~/.agents/skills ($(ls -d "$AGENTS_SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ') directories)"

# ── Community Skills ────────────────────────────────────────────────────────

step "Provisioning community skills (Matt Pocock, MongoDB, Vercel, Bright Data, Octocode, Python/OSS, UX)"

SOURCES_DIR="$HOME/.my-pi-sources"
mkdir -p "$SOURCES_DIR"

# Helper: clone if not present (idempotent)
clone_if_missing() {
	local url="$1"
	local path="$2"
	if [ ! -d "$path" ]; then
		git clone --depth 1 "$url" "$path" 2>&1 | tail -1
		echo "  cloned $path"
	else
		echo "  $path already exists — skipping"
	fi
}

# Helper: symlink a skill dir into ~/.agents/skills/ (idempotent)
symlink_skill() {
	local src="$1"
	local name="$2"
	if [ -d "$src" ] && [ ! -e "$AGENTS_SKILLS_DIR/$name" ]; then
		ln -sf "$src" "$AGENTS_SKILLS_DIR/$name"
		echo "  linked $name"
	fi
}

# 1. Matt Pocock (19 skills across engineering/, productivity/, misc/)
MATT_DIR="$SOURCES_DIR/mattpocock-skills"
clone_if_missing "https://github.com/mattpocock/skills.git" "$MATT_DIR"
for sub in engineering productivity misc; do
	for d in "$MATT_DIR/skills/$sub"/*/; do
		[ -d "$d" ] || continue
		name=$(basename "$d")
		# Skip non-skill dirs (README.md files, etc.)
		[ -f "$d/SKILL.md" ] || continue
		symlink_skill "$d" "$name"
	done
done

# 2. MongoDB (7 skills)
MONGO_DIR="$SOURCES_DIR/mongodb-agent-skills"
clone_if_missing "https://github.com/mongodb/agent-skills.git" "$MONGO_DIR"
for d in "$MONGO_DIR/skills"/*/; do
	[ -d "$d" ] || continue
	name=$(basename "$d")
	[ -f "$d/SKILL.md" ] || continue
	symlink_skill "$d" "$name"
done

# 3. Vercel (5 skills: vercel-react-best-practices, vercel-composition-patterns, deploy-to-vercel, web-design-guidelines, agent-browser)
VERCEL_DIR="$SOURCES_DIR/vercel-agent-skills"
clone_if_missing "https://github.com/vercel-labs/agent-skills.git" "$VERCEL_DIR"
for name in vercel-react-best-practices vercel-composition-patterns deploy-to-vercel web-design-guidelines agent-browser; do
	# Vercel skills may be in different subdirs — find by name
	skill_dir=$(find "$VERCEL_DIR" -maxdepth 3 -type d -name "$name" -print -quit 2>/dev/null)
	[ -n "$skill_dir" ] && symlink_skill "$skill_dir" "$name"
done

# 4. Bright Data (8 skills)
BD_DIR="$SOURCES_DIR/brightdata-skills"
clone_if_missing "https://github.com/brightdata/skills.git" "$BD_DIR"
for name in search scrape discover-api data-feeds live-research brightdata-cli bright-data-best-practices rag-pipeline; do
	skill_dir=$(find "$BD_DIR" -maxdepth 3 -type d -name "$name" -print -quit 2>/dev/null)
	[ -n "$skill_dir" ] && symlink_skill "$skill_dir" "$name"
done

# 5. Octocode (5 skills via npx)
echo "  Installing Octocode skills via npx..."
for name in octocode octocode-research octocode-brainstorming octocode-rfc-generator octocode-roast; do
	npx octocode skill --name "$name" --platform pi 2>&1 | tail -1 || warn "Octocode skill $name failed — run update.sh later"
done

# 6. Python/OSS (3 skills: uv, github, commit)
MITSU_DIR="$SOURCES_DIR/mitsuhiko-agent-stuff"
clone_if_missing "https://github.com/mitsuhiko/agent-stuff.git" "$MITSU_DIR"
for name in uv github commit; do
	symlink_skill "$MITSU_DIR/skills/$name" "$name"
done

# 7. UX skills (3 skills: compact-safe, impeccable, mongodb-mcp-cluster-per-project)
UX_DIR="$SOURCES_DIR/ux-skills"
clone_if_missing "https://github.com/10gen/ux-skills.git" "$UX_DIR"
for name in compact-safe impeccable mongodb-mcp-cluster-per-project; do
	symlink_skill "$UX_DIR/$name" "$name"
done

# 8. Post-clone notation fix: ensure skill-body slash refs use /skill: prefix
# This applies the same fix we applied to live copies — fresh installs get it too.
# CRITICAL: only rewrite /<name> when it's a slash command ref, NOT inside URLs.
# The pattern \b/<name>\b matches "/github" in "use /github" but NOT "github.com"
# in "https://github.com/..." because the / in the URL is preceded by a domain,
# not a word boundary before the slash. However, \b/ matches a word boundary
# BEFORE the slash, which means "https://github" could match if the sed engine
# treats : as a word boundary. To be safe, we use a negative lookbehind pattern
# that excludes :// and : preceding the match.
echo "  Fixing skill-body slash notation..."
for d in "$AGENTS_SKILLS_DIR"/*/; do
	[ -f "$d/SKILL.md" ] || continue
	for ref_dir in "$AGENTS_SKILLS_DIR"/*/; do
		ref_name=$(basename "$ref_dir")
		# Only rewrite /<name> at start of line or after whitespace/backtick/paren —
		# NEVER inside a URL (after :// or within a path). This prevents corrupting
		# "https://github.com/..." → "https://skill:github.com/..."
		# Use a two-step approach: first protect URLs, then rewrite, then restore.
		if grep -q "[^:a-zA-Z/]\/$ref_name\b" "$d/SKILL.md" 2>/dev/null; then
			# Only match /<name> preceded by whitespace, backtick, or start-of-line
			# (not by :// or within a URL path)
			sed "s|\(^\|[[:space:]]\|\`\|(\)/$ref_name\b|\1/skill:$ref_name|g" "$d/SKILL.md" >"${d}/SKILL.md.tmp" && mv "${d}/SKILL.md.tmp" "$d/SKILL.md" 2>/dev/null || true
		fi
	done
done

info "Community skills provisioned ($(ls -d "$AGENTS_SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ') total skill directories)"

# ── Done ───────────────────────────────────────────────────────────────────

echo -e "\n${BOLD}${GREEN}✓ auto-pi installed!${RESET}"
echo -e "Run \`pi\` to start. Type a task in plain English — Coach suggests the workflow."
echo -e "(Monthly: ./scripts/update.sh · audit: /setup-audit)"
