#!/usr/bin/env bash
# Update all my-pi packages and skills
set -euo pipe-fail

BOLD="\033[1m"
GREEN="\033[0;32m"
RESET="\033[0m"

info() { echo -e "${GREEN}✓${RESET} $*"; }
step() { echo -e "\n${BOLD}→ $*${RESET}"; }

step "Updating Pi packages"
pi update --all 2>&1 | tail -3
info "Packages updated"

step "Rebuilding native modules"
(cd "$HOME/.pi/agent/npm" && npm rebuild better-sqlite3 2>&1 | tail -1)
info "Native modules rebuilt"

step "Updating Bright Data skills"
BD_REPO="$HOME/.my-pi-sources/brightdata-skills"
if [ -d "$BD_REPO" ]; then
  (cd "$BD_REPO" && git pull --ff-only 2>&1 | tail -1)
  info "Bright Data skills updated"
else
  echo "  Bright Data repo not found — run install.sh first"
fi

step "Updating Octocode skills"
OC_SKILLS=(octocode octocode-research octocode-brainstorming octocode-rfc-generator octocode-roast)
for skill in "${OC_SKILLS[@]}"; do
  npx octocode skill --name "$skill" --platform pi 2>&1 | tail -1
done
info "Octocode skills updated"

step "Cleaning stale package versions"
# Remove old version dirs that Pi leaves behind
find "$HOME/.pi/agent/npm/node_modules" -maxdepth 3 -name "*.old" -delete 2>/dev/null || true

echo -e "\n${BOLD}${GREEN}✓ Update complete!${RESET}"
