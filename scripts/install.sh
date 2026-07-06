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
echo -e "The best Pi coding agent setup — 12 packages, 60 skills, autonomous workflow.\n"

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
	# Keep existing provider/model, add our packages + thinking + compaction + retry + memory
	existing=$(cat "$PI_AGENT_DIR/settings.json")
	ours=$(cat "$SCRIPT_DIR/config/settings.json")
	echo "$existing" | jq --argjson ours "$ours" '. + {
    "defaultThinkingLevel": $ours.defaultThinkingLevel,
    "compaction": $ours.compaction,
    "retry": $ours.retry,
    "observational-memory": $ours["observational-memory"],
    "theme": $ours.theme,
    "packages": $ours.packages
  }' >/tmp/pi-settings-merged.json
	mv /tmp/pi-settings-merged.json "$PI_AGENT_DIR/settings.json"
else
	cp "$SCRIPT_DIR/config/settings.json" "$PI_AGENT_DIR/settings.json"
fi

info "Pi settings configured"

# ── Packages ───────────────────────────────────────────────────────────────

step "Installing 12 Pi packages"

PACKAGES=(
	pi-hermes-memory
	pi-observational-memory
	pi-subagents
	pi-lens
	@hypabolic/pi-hypa
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

# ── Done ───────────────────────────────────────────────────────────────────
