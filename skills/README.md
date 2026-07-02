# Skills

Skills are installed by `scripts/install.sh` from these sources:

- **Bright Data** (12 skills) — cloned from `brightdata/skills` repo, symlinked to `~/.pi/agent/skills/`
- **Octocode** (5 skills) — installed via `npx octocode skill --platform pi`
- **Matt Pocock** (19 skills) — install separately via `npx skills add mattpocock/skills`
- **Vercel** (2 skills) — install separately via `npx skills add vercel-labs/skills`

The installer handles Bright Data and Octocode automatically. Matt Pocock and Vercel skills
should be installed to `~/.agents/skills/` (shared across all agents) using the skills CLI.
