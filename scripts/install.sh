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

info()  { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
error() { echo -e "${RED}✗${RESET} $*" >&2; exit 1; }
step()  { echo -e "\n${BOLD}→ $*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PI_AGENT_DIR="${HOME}/.pi/agent"
SKIP_CLI=false

[[ "${1:-}" == "--skip-cli" ]] && SKIP_CLI=true

echo -e "${BOLD}my-pi installer${RESET}"
echo -e "The best Pi coding agent setup — 10 packages, 44 skills, autonomous workflow.\n"

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
  # Backup existing
  cp "$PI_AGENT_DIR/settings.json" "$PI_AGENT_DIR/settings.json.bak.$(date +%s)"
  
  # Merge: keep existing provider/model, add our packages + thinking + compaction
  cat "$PI_AGENT_DIR/settings.json" | jq '. + {
    "defaultThinkingLevel": "high",
    "compaction": {
      "enabled": true,
      "reserveTokens": 16384,
      "keepRecentTokens": 30000
    },
    "packages": (input | .packages)
  }' "$SCRIPT_DIR/config/settings.json" > /tmp/pi-settings-merged.json 2>/dev/null || {
    # Fallback: just use our settings
    cp "$SCRIPT_DIR/config/settings.json" "$PI_AGENT_DIR/settings.json"
  }
  mv /tmp/pi-settings-merged.json "$PI_AGENT_DIR/settings.json" 2>/dev/null || true
else
  cp "$SCRIPT_DIR/config/settings.json" "$PI_AGENT_DIR/settings.json"
fi

info "Pi settings configured"

# ── Packages ───────────────────────────────────────────────────────────────

step "Installing 10 Pi packages"

PACKAGES=(
  pi-hermes-memory
  pi-subagents
  pi-lens
  pi-context-prune
  @narumitw/pi-statusline
  pi-intercom
  pi-prompt-template-model
  pi-btw
  @juicesharp/rpiv-ask-user-question
  pi-rewind
)

for pkg in "${PACKAGES[@]}"; do
  echo "  installing $pkg..."
  pi install "npm:$pkg" 2>&1 | tail -1
done

# Rebuild better-sqlite3 for pi-hermes-memory
step "Rebuilding native modules"
(cd "$PI_AGENT_DIR/npm" && npm rebuild better-sqlite3 2>&1 | tail -1) || warn "better-sqlite3 rebuild failed — may need manual fix"
info "Native modules rebuilt"

# ── Context prune config ───────────────────────────────────────────────────

step "Configuring context pruning"

mkdir -p "$PI_AGENT_DIR/context-prune"
cp "$SCRIPT_DIR/config/prune.json" "$PI_AGENT_DIR/context-prune/settings.json"
info "Context pruning enabled (agent-message mode)"

# ── External CLIs ──────────────────────────────────────────────────────────

if [ "$SKIP_CLI" = false ]; then
  step "Installing external CLIs"

  # Bright Data CLI
  if ! command -v bdata >/dev/null 2>&1; then
    echo "  installing bdata (Bright Data CLI)..."
    npm install -g @brightdata/cli 2>&1 | tail -1
    info "bdata installed — run 'bdata login' to authenticate (free, 5,000 credits/month)"
  else
    info "bdata already installed ($(bdata --version 2>/dev/null))"
  fi

  # Octocode CLI (via npx, no global install needed)
  echo "  octocode available via 'npx octocode'"
  info "Run 'npx octocode auth login' to authenticate with GitHub"
fi

# ── Bright Data skills ─────────────────────────────────────────────────────

step "Installing Bright Data skills"

BD_SKILLS=(
  agent-onboarding search scrape discover-api data-feeds
  brightdata-cli live-research rag-pipeline
  bright-data-best-practices proxy
  python-sdk-best-practices js-sdk-best-practices
)

# Clone Bright Data skills if not present
BD_REPO="$HOME/.my-pi-sources/brightdata-skills"
if [ ! -d "$BD_REPO" ]; then
  mkdir -p "$(dirname "$BD_REPO")"
  git clone --depth 1 https://github.com/brightdata/skills.git "$BD_REPO" 2>&1 | tail -1
fi

for skill in "${BD_SKILLS[@]}"; do
  if [ -d "$BD_REPO/skills/$skill" ]; then
    ln -sfn "$BD_REPO/skills/$skill" "$PI_AGENT_DIR/skills/$skill"
  fi
done
info "12 Bright Data skills installed"

# ── Octocode skills ────────────────────────────────────────────────────────

step "Installing Octocode skills"

OC_SKILLS=(
  octocode octocode-research octocode-brainstorming
  octocode-rfc-generator octocode-roast
)

for skill in "${OC_SKILLS[@]}"; do
  npx octocode skill --name "$skill" --platform pi 2>&1 | tail -1
done
info "5 Octocode skills installed"

# ── AGENTS.md ──────────────────────────────────────────────────────────────

step "Installing global AGENTS.md"

AI_DIR="${HOME}/.ai"
mkdir -p "$AI_DIR"

if [ -f "$AI_DIR/AGENTS.md" ]; then
  cp "$AI_DIR/AGENTS.md" "$AI_DIR/AGENTS.md.bak.$(date +%s)"
  warn "Existing AGENTS.md backed up — review and merge manually"
else
  cp "$SCRIPT_DIR/config/agents.md" "$AI_DIR/AGENTS.md"
  info "Global AGENTS.md installed"
fi

# ── Done ───────────────────────────────────────────────────────────────────

echo -e "\n${BOLD}${GREEN}✓ my-pi setup complete!${RESET}\n"
echo -e "Next steps:"
echo -e "  1. ${BOLD}bdata login${RESET}           — authenticate Bright Data (free)"
echo -e "  2. ${BOLD}npx octocode auth login${RESET}  — authenticate Octocode with GitHub"
echo -e "  3. ${BOLD}pi${RESET}                  — start Pi"
echo -e "  4. ${BOLD}/memory-interview${RESET}    — one-time setup (tells Pi who you are)"
echo -e "  5. ${BOLD}/memory-index-sessions${RESET} — one-time setup (index past sessions)"
echo -e "  6. ${BOLD}/learn-memory-tool${RESET}   — one-time setup (learn memory tools)"
echo -e "\nThen just start coding. Pi plans, builds, tests, reviews, documents, remembers — all autonomous.\n"
