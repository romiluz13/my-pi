---
description: Debug an issue — build feedback loop, find root cause, fix
argument-hint: "<what's wrong>"
skill: diagnosing-bugs
---
Debug the following issue. Follow workflow step 5 (failure path).

Issue: $@

1. **Build a feedback loop FIRST.** Before guessing, create the shortest path to reproduce the issue:
   - Failing test that reproduces it.
   - Minimal script that triggers it.
   - Manual steps that reliably cause it.
2. **Reproduce + minimize.** Confirm the loop fails. Then minimize the reproduction — remove everything that doesn't affect the bug.
3. **Hypothesize.** Based on the minimized repro, form a hypothesis about the root cause.
4. **Instrument.** Add logging, breakpoints, or assertions to confirm the hypothesis. Don't guess — measure.
5. **Fix.** Fix the source, not the symptom. Run the feedback loop — it should now pass.
6. **Test.** Write a regression test using TDD: test first (the failing repro), see it fail, implement the fix, see it pass.
7. **Cleanup.** Remove debugging instrumentation. Run the full test suite. Leave no debug code behind.

Do NOT skip the feedback loop. "I think the problem is..." is not a diagnosis — reproduce it first.
