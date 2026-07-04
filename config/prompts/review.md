---
description: Review current diff — parallel reviewers, silent failure hunt, anti-anchored
skill: code-review
subagent: reviewer
---
Review the current uncommitted changes. Follow workflow step 6.

1. Get the diff: `git diff` (unstaged) and `git diff --cached` (staged).
2. Fan out 2-3 reviewer subagents with different focuses:
   - **Standards reviewer**: coding conventions, Fowler code smells, pattern compliance.
   - **Spec reviewer**: does the diff match the issue/PRD/spec intent?
   - **Security reviewer**: injection, auth, secrets, unsafe operations.
3. Give each reviewer fresh context — only the diff, not the builder's reasoning (anti-anchored review).
4. After reviews return, use `receiving-code-review` skill: verify each suggestion before implementing. Push back if wrong. Don't blindly agree.
5. Grep changed files for swallowed errors: empty catches, discarded promises, TODO/FIXME, debug logging left in.
6. If architecture issues are found → use `improve-codebase-architecture` skill → fix → return to review.

Report findings by severity: CRITICAL (blocks), HIGH (should fix), LOW (nice to have).
