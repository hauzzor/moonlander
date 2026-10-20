---
description: Verify, commit, push main, wait for GitHub Pages, and run the live suite.
agent: release-engineer
---

Delivery message: $ARGUMENTS

Deliver only after the user explicitly requests it and `reviewer` plus
`npm.cmd run verify` have passed.

1. Inspect `git status`, `git diff`, and `git diff --cached`.
2. Stage only the intended paths. Never commit secrets, build output, logs,
   worktrees, or unrelated changes.
3. Commit with the supplied conventional message and push to `origin/main`.
4. Use `npm.cmd run deliver -- --message "..."`, or the manual fallback.
5. Never force-push, amend, reset, or clean.
6. Wait for the GitHub Pages asset to update, then run
   `npm.cmd run test:e2e:live`.
7. If verification, push, deployment, or the live suite fails, stop and report.

Report the commit hash, push result, deployment URL, live suite result, and any
remaining risk.
