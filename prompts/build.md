---
description: Build a feature — implement, test, fix (workflow steps 4-5)
argument-hint: "<what to build>"
skill: tdd
---
Build the following. Follow workflow steps 4-5.

Task: $@

1. **Build.** Use `/skill:implement` as the execution wrapper if a spec exists. Otherwise implement directly. Follow existing patterns in the codebase. Don't over-engineer — three similar lines beats a premature helper. Python → use `/skill:uv`. Fix any type/LSP errors immediately when detected.

2. **Test.** Run relevant tests. No tests for changed code → write them using TDD: write the test first, watch it fail, implement, watch it pass. Exit 1 from import/syntax error is NOT a real RED — a genuine RED is a behavioral failure. If tests fail → use `diagnosing-bugs` skill (build a feedback loop, find the root cause, fix the source not the symptom) → return to testing.

3. **Prove it.** Before claiming done, paste the LITERAL verification: the exact command you ran, its exit code, and the first + last 5 lines of output. A GREEN claim without this evidence block is a lie and will be rejected. If a file your tests import does not exist on disk, the tests are RED — do not report GREEN.

Do NOT review or commit yet. This is building + testing only.
