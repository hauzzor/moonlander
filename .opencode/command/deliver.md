---
description: Deliver a wave, update ticket status, and run live checks at milestones.
agent: release-engineer
---

Delivery message: $ARGUMENTS

Deliver after `reviewer` and the lead's `npm.cmd run verify` have passed, as part
of the confirmed wave flow. Do not wait for a separate user request.

1. Inspect `git status`, `git diff`, and `git diff --cached`.
2. Stage only the intended paths. Never commit secrets, build output, logs,
   worktrees, or unrelated changes.
3. Commit with the supplied conventional message and push to `origin/main`.
4. Use `npm.cmd run deliver -- --message "..."` at live milestones. Use
   `npm.cmd run deliver -- --no-live --message "..."` for sim-only intermediate
   waves or docs-only process deliveries under the recorded waiver.
5. Do not use `--skip-verify` without explicit lead approval. Never force-push,
   amend, reset, or clean.
6. At live milestones T-0013, T-0009, T-0010, T-0011, and T-0012, wait for the
   GitHub Pages asset to update and run `npm.cmd run test:e2e:live`.
7. Update ticket evidence and status under `docs/tickets/`, then commit and push
   the queue update in the same task.
8. If verification, push, deployment, or the live suite fails, stop and report.

Report the commit hash, push result, deployment URL, live suite result or
recorded `--no-live` decision, ticket evidence/status, and any remaining risk.
