---
name: release-pipeline
description: Use when verifying, committing, pushing, deploying, or running the Moonlander live Playwright suite. Covers direct pushes to main, GitHub Pages deployment, no-force-push rules, explicit staging, and delivery failure handling.
---

# Release pipeline

## Gate

Delivery happens only after:

- `reviewer` has passed the ticket or change
- `npm.cmd run verify` is green
- the working tree contains only intended changes

`release-engineer` is the only agent allowed to commit or push.

## Pre-commit inspection

```powershell
git status
git diff
git diff --cached
```

Stage explicit paths. Never stage secrets, `.env` files, build output, report
directories, logs, worktrees, or unrelated changes. `.gitignore` covers
`node_modules/`, `dist/`, `coverage/`, Playwright reports, test results, ticket
logs, and worktrees; verify rather than assume.

## Commit and push

- Use a conventional message: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`,
  `chore:`.
- Push directly to `origin/main` as requested.
- Prefer `npm.cmd run deliver -- --message "..."`; it verifies, commits staged
  changes, pushes `main`, waits for the live asset, and runs the live suite.
- Manual fallback: stage, commit, `git push origin main`, poll the live asset,
  then `npm.cmd run test:e2e:live`.

Hard rules:

- never force-push, amend, reset `--hard`, clean, or rewrite history
- never commit or push a failing build
- never hide a failed verify, push, deployment, or live test

## Deployment

GitHub Actions deploys `main` to GitHub Pages. The live game is
https://hauzzor.github.io/moonlander/. The delivery script polls the deployed
HTML for the new built asset, then runs the live Playwright suite.

Early rebuild tickets may not be deployable yet. Use `--no-live` only when the
lead explicitly accepts that the current ticket is not yet a deployable game;
restore the full live suite before the final ticket.

## Failure handling

If auth, verify, push, deployment, or the live suite fails, stop and report:

- exact command and output
- commit hash and branch state
- whether the push happened
- the live URL and last observed asset
- the safest next action

Do not retry with force. Do not commit generated artifacts to work around a
failure.
