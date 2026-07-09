#!/usr/bin/env bash
# my-pi installer — sets up the best Pi coding agent configuration
#
# Usage:
#   ./scripts/install.sh          # install everything
#   ./scripts/install.sh --skip-cli  # skip bdata/octocode CLI install
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
CLAUDE_SKILLS_DIR="${HOME}/.claude/skills"
SKIP_CLI=false

[[ "${1:-}" == "--skip-cli" ]] && SKIP_CLI=true

echo -e "${BOLD}my-pi installer${RESET}"
echo -e "A Pi coding agent config where the workflow decides what to do — 14 packages, 5 custom extensions (coach + loop engine + guardrails), autonomous workflow.\n"

# ── Prerequisites ──────────────────────────────────────────────────────────

step "Checking prerequisites"

command -v pi >/dev/null 2>&1 || error "Pi is not installed. Run: curl -fsSL https://pi.dev/install.sh | sh"
command -v npm >/dev/null 2>&1 || error "npm is not installed. Install Node.js first."
command -v git >/dev/null 2>&1 || error "git is not installed."
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

# Rebuild better-sqlite3 for pi-hermes-memory
step "Rebuilding native modules"
(cd "$PI_AGENT_DIR/npm" && npm rebuild better-sqlite3 2>&1 | tail -1) || warn "better-sqlite3 rebuild failed — may need manual fix"
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

step "Installing custom extensions (coach, loop, guardrails, palette, handoff)"

mkdir -p "$PI_AGENT_DIR/extensions"
for ext in "$SCRIPT_DIR"/extensions/*.ts; do
	[ -f "$ext" ] || continue
	name=$(basename "$ext")
	cp "$ext" "$PI_AGENT_DIR/extensions/$name"
	echo "  installed extension: $name"
done
# Copy the extensions README (documentation, not code)
[ -f "$SCRIPT_DIR/extensions/README.md" ] && cp "$SCRIPT_DIR/extensions/README.md" "$PI_AGENT_DIR/extensions/README.md"
info "Custom extensions installed — /reload in Pi to activate (Ctrl+Shift+K for palette, /handoff for session handoff)"

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

mkdir -p "$AGENTS_SKILLS_DIR" "$CLAUDE_SKILLS_DIR"
for skill_dir in "$SCRIPT_DIR"/skills/*/; do
	[ -d "$skill_dir" ] || continue
	name=$(basename "$skill_dir")
	cp -R "$skill_dir" "$AGENTS_SKILLS_DIR/$name"
done
# ~/.pi/agent/skills is populated by installed npm packages + fetched skills
# (Bright Data via update.sh, Octocode via `npx octocode skill`). The repo
# skills live in ~/.agents/skills which all three agents read.
info "Repo skills installed to ~/.agents/skills ($(ls -d "$AGENTS_SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ') directories)"

# ── Done ───────────────────────────────────────────────────────────────────

echo -e "\n${BOLD}${GREEN}✓ my-pi installed!${RESET}"
echo -e "Run \`pi\` to start. Type a task in plain English — Coach suggests the workflow."
echo -e "(Monthly: ./scripts/update.sh · audit: /setup-audit)"
