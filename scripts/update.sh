#!/usr/bin/env bash
# Update all auto-pi packages and skills
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
RESET="\033[0m"

info() { echo -e "${GREEN}✓${RESET} $*"; }
step() { echo -e "\n${BOLD}→ $*${RESET}"; }

step "Updating Pi packages"
pi update --all 2>&1 | tail -3
info "Packages updated"

step "Re-linking vendor namespace shims"
# pi update --all can clear node_modules, breaking pi-intercom/pi-rewind
# imports. Re-link the @mariozechner shims after every update.
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LEGACY_SHIM_DIR="$SCRIPT_DIR/vendor/@mariozechner"
TARGET_DIR="$HOME/.pi/agent/npm/node_modules/@mariozechner"
mkdir -p "$TARGET_DIR"
for shim in pi-coding-agent pi-tui; do
	if [ -d "$LEGACY_SHIM_DIR/$shim" ]; then
		rm -rf "$TARGET_DIR/$shim"
		ln -sf "$LEGACY_SHIM_DIR/$shim" "$TARGET_DIR/$shim"
		echo "  linked @mariozechner/$shim shim"
	fi
done
info "Vendor namespace shims re-linked"

step "Rebuilding native modules"
(cd "$HOME/.pi/agent/npm" && npm rebuild better-sqlite3 2>&1 | tail -1)
info "Native modules rebuilt"

step "Updating community skill sources"
SOURCES_DIR="$HOME/.my-pi-sources"

# Helper: pull if dir exists
pull_if_exists() {
	local path="$1"
	local name="$2"
	if [ -d "$path" ]; then
		(cd "$path" && git pull --ff-only 2>&1 | tail -1)
		info "$name skills updated"
	else
		echo "  $name not found — run install.sh first"
	fi
}

pull_if_exists "$SOURCES_DIR/mattpocock-skills" "Matt Pocock"
pull_if_exists "$SOURCES_DIR/mongodb-agent-skills" "MongoDB"
pull_if_exists "$SOURCES_DIR/vercel-agent-skills" "Vercel"
pull_if_exists "$SOURCES_DIR/brightdata-skills" "Bright Data"
pull_if_exists "$SOURCES_DIR/mitsuhiko-agent-stuff" "Python/OSS"
pull_if_exists "$SOURCES_DIR/ux-skills" "UX skills"

step "Updating Octocode skills"
OC_SKILLS=(octocode octocode-research octocode-brainstorming octocode-rfc-generator octocode-roast)
for skill in "${OC_SKILLS[@]}"; do
	npx octocode skill --name "$skill" --platform pi 2>&1 | tail -1
done
info "Octocode skills updated"

step "Re-deploying curated assets (extensions, prompts, AGENTS.md)"

# Re-copy extensions, prompts, and AGENTS.md from the repo to the live Pi dir
# so update.sh is a complete refresh (not just packages + skills).
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PI_AGENT_DIR="${HOME}/.pi/agent"

if [ -d "$SCRIPT_DIR/extensions" ]; then
	for ext in "$SCRIPT_DIR"/extensions/*.ts; do
		[ -f "$ext" ] || continue
		cp "$ext" "$PI_AGENT_DIR/extensions/$(basename "$ext")"
	done
	[ -f "$SCRIPT_DIR/extensions/README.md" ] && cp "$SCRIPT_DIR/extensions/README.md" "$PI_AGENT_DIR/extensions/README.md"
	echo "  extensions re-deployed"
fi

if [ -d "$SCRIPT_DIR/prompts" ]; then
	for prompt in "$SCRIPT_DIR"/prompts/*.md; do
		[ -f "$prompt" ] || continue
		cp "$prompt" "$PI_AGENT_DIR/prompts/$(basename "$prompt")"
	done
	echo "  prompts re-deployed"
fi

if [ -f "$SCRIPT_DIR/config/agents.md" ]; then
	cp "$SCRIPT_DIR/config/agents.md" "${HOME}/.ai/AGENTS.md"
	echo "  AGENTS.md re-deployed"
fi

info "Curated assets re-deployed"

step "Cleaning stale package versions"
# Remove old version dirs that Pi leaves behind
find "$HOME/.pi/agent/npm/node_modules" -maxdepth 3 -name "*.old" -delete 2>/dev/null || true

echo -e "\n${BOLD}${GREEN}✓ Update complete!${RESET}"
