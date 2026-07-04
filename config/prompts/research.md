---
description: Research a topic — parallel fan-out across web, GitHub, codebase
argument-hint: "<topic to research>"
skill: research
---
Research the following topic. Follow workflow step 1 (fan-out research).

Topic: $@

Fan out parallel research across multiple sources. Each subagent reads a different source:

1. **Web research** — use `bdata search` and `bdata scrape` to find current docs, blog posts, and tutorials. Focus on primary sources (official docs, not secondary write-ups).

2. **GitHub research** — use `npx octocode` tools to search code across repositories. Find how other projects implement this. Look at recent commits and PRs for the latest patterns.

3. **Codebase research** — search the current repo for existing implementations, patterns, or dependencies related to this topic. Use `grep`, `find`, and LSP navigation.

4. **Memory search** — search memory for any past decisions, failures, or insights about this topic.

After all research returns:

- Synthesize findings into a single summary.
- Cite each claim to its source.
- Flag any contradictions between sources.
- Save key findings to memory (decisions, gotchas, insights — not obvious facts).

Do NOT write any code. This is research only.
