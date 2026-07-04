---
description: Ship — verify, commit, document (workflow steps 7-8)
skill: verification-before-completion
---
Ship the current work. Follow workflow steps 7-8.

1. **Independent verification.** You are an independent auditor — a passing test or green build is never sufficient by itself.
   - List every claim from prior steps (what was built, what was tested, what was fixed).
   - Mark each claim UNVERIFIED.
   - Run the project's test/lint/typecheck command. Read the FULL output. Don't scan for "passed" — read the details.
   - For each claim, mark it VERIFIED or CONTRADICTED. If any is CONTRADICTED, stop and fix before proceeding.

2. **Commit.** Use the `commit` skill for clean conventional commits. Stage only relevant files. Write a clear commit message:
   - Subject: imperative mood, under 72 chars.
   - Body: what changed, why it changed, what was tested.

3. **Document.**
   - Durable gotcha/workflow change → update repo AGENTS.md.
   - Domain term resolved → update `CONTEXT.md` (`domain-modeling` skill).
   - Architecture decision → write ADR in `docs/adr/`.
   - User-facing change → update CHANGELOG.
   - Don't create random markdown files.

4. **Push + PR.** Use the `github` skill via `gh` CLI:
   - Push to a branch (not main).
   - Create a PR with a clear description linking to the spec/issue.
   - If CI fails → `diagnosing-bugs` → fix → return to step 1.

Do NOT push to main directly. Do NOT skip verification. Evidence before claims.
