# Skills

Skills are installed by `scripts/install.sh` from these sources:

## Bundled (3 — adapted from Superpowers)
- `brainstorming` — design before code, transitions to /to-spec + /to-tickets
- `verification-before-completion` — evidence before claims
- `receiving-code-review` — verify before implementing review feedback

These are included in the repo (skills/ directory) and copied by the installer.
Superpowers-specific references removed. Transitions point to Matt Pocock skills.

## Installed from external sources

| Source | Skills | Count |
|--------|--------|-------|
| **Matt Pocock** (mattpocock/skills) | tdd, handoff, prototype, grill-with-docs, to-spec, to-tickets, triage, implement, code-review, research, wayfinder, wizard, codebase-design, domain-modeling, diagnosing-bugs, resolving-merge-conflicts, writing-great-skills, teach, improve-codebase-architecture | 19 |
| **MongoDB** (mongodb/agent-skills) | mongodb-schema-design, mongodb-search-and-ai, mongodb-query-optimizer, mongodb-connection, mongodb-mcp-setup, mongodb-natural-language-querying, mongodb-atlas-stream-processing | 7 |
| **Vercel** (vercel-labs/agent-skills + vercel-labs/agent-browser) | vercel-react-best-practices, vercel-composition-patterns, deploy-to-vercel, web-design-guidelines, agent-browser | 5 |
| **Bright Data** (brightdata/skills) | search, scrape, discover-api, data-feeds, live-research, brightdata-cli | 6 |
| **Octocode** (bgauryy/octocode) | octocode, octocode-research, octocode-brainstorming, octocode-rfc-generator, octocode-roast | 5 |
| **Python/OSS** (mitsuhiko/agent-stuff) | uv, github, commit | 3 |

## Skill selection methodology

Every skill was compared prompt-by-prompt against alternatives. Matt Pocock
wins all 5 conflicts with Superpowers (tdd, debugging, code-review, writing-skills,
planning). 3 unique Superpowers skills were adapted and bundled.

## What was rejected

- `agent-onboarding` — one-time setup, already done
- `python-sdk-best-practices` / `js-sdk-best-practices` — for building WITH Bright Data SDK
- `proxy` — Bright Data proxy network code gen, niche
- `rag-pipeline` — niche (kept only if you build RAG with Bright Data)
- `bright-data-best-practices` — reference for Bright Data APIs, model-invoked only
- `vercel-cli-with-tokens` — overlaps with deploy-to-vercel
- `vercel-react-native-skills` — only if you build React Native
- `writing-guidelines` — Vercel's internal writing style
- `higgsfield-generate` — AI video/image generation, not coding
- 15 Matt Pocock skills removed (deprecated, one-time, non-coding, or redundant)
