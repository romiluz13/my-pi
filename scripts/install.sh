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
AGENTS_SKILLS_DIR="${HOME}/.agents/skills"
CLAUDE_SKILLS_DIR="${HOME}/.claude/skills"
SKIP_CLI=false

[[ "${1:-}" == "--skip-cli" ]] && SKIP_CLI=true

echo -e "${BOLD}my-pi installer${RESET}"
echo -e "The best Pi coding agent setup — 10 packages, 59 skills, autonomous workflow.\n"

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
  # Keep existing provider/model, add our packages + thinking + compaction
  existing=$(cat "$PI_AGENT_DIR/settings.json")
  ours=$(cat "$SCRIPT_DIR/config/settings.json")
  echo "$existing" | jq --argjson ours "$ours" '. + {
    "defaultThinkingLevel": $ours.defaultThinkingLevel,
    "compaction": $ours.compaction,
    "theme": $ours.theme,
    "packages": $ours.packages
  }' > /tmp/pi-settings-merged.json
  mv /tmp/pi-settings-merged.json "$PI_AGENT_DIR/settings.json"
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

  echo "  octocode available via 'npx octocode'"
  info "Run 'npx octocode auth login' to authenticate with GitHub"
fi

# ── Skills ─────────────────────────────────────────────────────────────────

step "Installing skills"

mkdir -p "$AGENTS_SKILLS_DIR" "$CLAUDE_SKILLS_DIR" "$PI_AGENT_DIR/skills"

# Bright Data skills (6 core — search, scrape, discover, data-feeds, live-research, cli)
BD_SKILLS=(search scrape discover-api data-feeds live-research brightdata-cli)
BD_REPO="${HOME}/.my-pi-sources/brightdata-skills"
if [ ! -d "$BD_REPO" ]; then
  mkdir -p "$(dirname "$BD_REPO")"
  git clone --depth 1 https://github.com/brightdata/skills.git "$BD_REPO" 2>&1 | tail -1
fi
for skill in "${BD_SKILLS[@]}"; do
  if [ -d "$BD_REPO/skills/$skill" ]; then
    ln -sfn "$BD_REPO/skills/$skill" "$PI_AGENT_DIR/skills/$skill"
  fi
done
info "6 Bright Data skills installed"

# Octocode skills (5)
OC_SKILLS=(octocode octocode-research octocode-brainstorming octocode-rfc-generator octocode-roast)
for skill in "${OC_SKILLS[@]}"; do
  npx octocode skill --name "$skill" --platform pi 2>&1 | tail -1
  npx octocode skill --name "$skill" --platform common 2>&1 | tail -1
done
info "5 Octocode skills installed"

# MongoDB skills (7 official from mongodb/agent-skills)
MDB_REPO="${HOME}/.my-pi-sources/mongodb-agent-skills"
if [ ! -d "$MDB_REPO" ]; then
  mkdir -p "$(dirname "$MDB_REPO")"
  git clone --depth 1 https://github.com/mongodb/agent-skills.git "$MDB_REPO" 2>&1 | tail -1
fi
MDB_SKILLS=(mongodb-atlas-stream-processing mongodb-connection mongodb-mcp-setup mongodb-natural-language-querying mongodb-query-optimizer mongodb-schema-design mongodb-search-and-ai)
for skill in "${MDB_SKILLS[@]}"; do
  if [ -d "$MDB_REPO/skills/$skill" ]; then
    cp -r "$MDB_REPO/skills/$skill" "$AGENTS_SKILLS_DIR/$skill"
  fi
done
info "7 MongoDB skills installed"

# Vercel skills (5 — react-best-practices, composition-patterns, deploy-to-vercel, web-design-guidelines, agent-browser)
VC_SKILLS=(vercel-react-best-practices vercel-composition-patterns deploy-to-vercel web-design-guidelines)
for skill in "${VC_SKILLS[@]}"; do
  npx skills add vercel-labs/agent-skills --skill "$skill" -y 2>&1 | tail -1
done
npx skills add vercel-labs/agent-browser --skill agent-browser -y 2>&1 | tail -1
info "5 Vercel skills installed"

# Matt Pocock skills (19 — via npx skills)
echo "  Installing Matt Pocock skills..."
npx skills add mattpocock/skills --skill tdd -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill handoff -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill prototype -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill grill-with-docs -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill to-spec -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill to-tickets -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill triage -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill implement -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill code-review -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill research -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill wayfinder -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill wizard -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill codebase-design -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill domain-modeling -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill diagnosing-bugs -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill resolving-merge-conflicts -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill writing-great-skills -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill teach -y 2>&1 | tail -1
npx skills add mattpocock/skills --skill improve-codebase-architecture -y 2>&1 | tail -1
info "19 Matt Pocock skills installed"

# Adapted Superpowers skills (3 — brainstorming, verification-before-completion, receiving-code-review)
# These are bundled in the repo under skills/
for skill in brainstorming verification-before-completion receiving-code-review; do
  if [ -d "$SCRIPT_DIR/skills/$skill" ]; then
    cp -r "$SCRIPT_DIR/skills/$skill" "$AGENTS_SKILLS_DIR/$skill"
    ln -sfn "$AGENTS_SKILLS_DIR/$skill" "$CLAUDE_SKILLS_DIR/$skill"
  fi
done
info "3 adapted Superpowers skills installed"

# Python/OSS skills (3 — uv, github, commit from mitsuhiko/agent-stuff)
MIT_REPO="${HOME}/.my-pi-sources/mitsuhiko-agent-stuff"
if [ ! -d "$MIT_REPO" ]; then
  mkdir -p "$(dirname "$MIT_REPO")"
  git clone --depth 1 https://github.com/mitsuhiko/agent-stuff.git "$MIT_REPO" 2>&1 | tail -1
fi
for skill in uv github commit; do
  if [ -d "$MIT_REPO/skills/$skill" ]; then
    cp -r "$MIT_REPO/skills/$skill" "$AGENTS_SKILLS_DIR/$skill"
  fi
done
info "3 Python/OSS skills installed"

# Link shared skills to Claude Code
for skill in "$AGENTS_SKILLS_DIR"/*; do
  name=$(basename "$skill")
  ln -sfn "$skill" "$CLAUDE_SKILLS_DIR/$name"
done
info "All skills linked to Claude Code"

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

# Create symlinks so all agents load the same brain
# Pi loads from ~/.pi/agent/AGENTS.md
mkdir -p "${HOME}/.pi/agent"
ln -sfn "${AI_DIR}/AGENTS.md" "${HOME}/.pi/agent/AGENTS.md"
info "Pi: ~/.pi/agent/AGENTS.md symlink created"

# Codex loads from ~/.codex/AGENTS.md
mkdir -p "${HOME}/.codex"
ln -sfn "${AI_DIR}/AGENTS.md" "${HOME}/.codex/AGENTS.md"
info "Codex: ~/.codex/AGENTS.md symlink created"

# Claude Code uses @import in ~/.claude/CLAUDE.md
mkdir -p "${HOME}/.claude"
if [ -f "${HOME}/.claude/CLAUDE.md" ]; then
  if ! grep -q "@~/.ai/AGENTS.md" "${HOME}/.claude/CLAUDE.md" 2>/dev/null; then
    echo "@~/.ai/AGENTS.md" >> "${HOME}/.claude/CLAUDE.md"
    info "Claude Code: @import added to CLAUDE.md"
  else
    info "Claude Code: @import already present"
  fi
else
  echo "@~/.ai/AGENTS.md" > "${HOME}/.claude/CLAUDE.md"
  info "Claude Code: CLAUDE.md created with @import"
fi

# ── Done ───────────────────────────────────────────────────────────────────

echo -e "\n${BOLD}${GREEN}✓ my-pi setup complete!${RESET}\n"
echo -e "Next steps:"
echo -e "  1. ${BOLD}bdata login${RESET}              — authenticate Bright Data (free)"
echo -e "  2. ${BOLD}npx octocode auth login${RESET}     — authenticate Octocode with GitHub"
echo -e "  3. ${BOLD}pi${RESET}                     — start Pi"
echo -e "  4. ${BOLD}/memory-interview${RESET}       — one-time setup (tells Pi who you are)"
echo -e "  5. ${BOLD}/memory-index-sessions${RESET}  — one-time setup (index past sessions)"
echo -e "  6. ${BOLD}/learn-memory-tool${RESET}      — one-time setup (learn memory tools)"
echo -e "\nThen just start coding. Pi plans, builds, tests, reviews, verifies, documents, remembers — all autonomous.\n"
