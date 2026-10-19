# Local Ticket Queue

The ticket queue is a durable local backlog for work that should be picked up
by the background ticket runner or the interactive lead.

## Lifecycle

```
inbox → needs-info ↔ ready → in-progress → review → done
                                      ↘ blocked
```

- `inbox` — raw requests. You can add tickets at any time.
- `needs-info` — the lead is waiting on answers or a confirmed brief.
- `ready` — brief confirmed; dependencies and scopes are declared. Only these
  are claimable.
- `in-progress` — claimed by the runner; a lock and worktree exist.
- `review` — implementation and tests are green; review/merge queue pending.
- `done` — verified, merged, delivered, and live-tested.
- `blocked` — failed or ambiguous; inspect the ticket and logs.

A ticket moves forward only after the user explicitly confirms the written
brief and the frontmatter has `confirmed: true` with no open questions.

## Commands

```powershell
npm.cmd run tickets:new -- "My task title"
npm.cmd run tickets:list
npm.cmd run tickets:status
npm.cmd run tickets:show -- T-0001
npm.cmd run tickets:logs -- T-0001 --follow
npm.cmd run tickets:run
```

The runner is a foreground terminal process. Run it in its own terminal. It
streams ticket claims, agent sessions, test results, merge-queue waits, and
delivery results.

Pause claiming safely:

```powershell
npm.cmd run tickets:pause
npm.cmd run tickets:resume
```

or create/remove `docs/tickets/PAUSE`.

## Frontmatter

```yaml
id: T-0001
title: ...
status: ready
priority: normal
parent: null
depends-on: []
scopes:
  - packages/sim/src/sensor.ts
contract: false
confirmed: true
confirmed-at: 2026-10-19T12:00:00Z
open-questions: []
```

- `depends-on` tickets must be in `done` before this ticket can be claimed.
- `scopes` are file or directory paths. Tickets with overlapping scopes never
  run together. Use `*` for a global/shared change.
- `contract: true` tickets are serialized first for shared contract files.
- `confirmed` must be `true`; `open-questions` must be empty.
- Large requests should be split into child tickets with `parent` and
  `depends-on` so disjoint scopes can run in parallel.

## Runner behavior

- Default maximum parallel implementation tickets: 3.
- One Playwright/browser suite and one merge/delivery at a time.
- Each claimed ticket gets `.worktrees/T-0001` on branch `ticket/T-0001`.
- The ticket-runner agent follows `AGENTS.md`, TDD, and the ticket brief. It may
  spawn the test/implementation/review specialists. It may not commit or push.
- The runner script verifies, runs the merge queue, commits, pushes, waits for
  the live asset, runs the live suite, and updates ticket status.
- Failed tickets move to `blocked`; logs and worktrees are preserved for
  inspection.

## Inspection

- Live terminal output from `npm.cmd run tickets:run`.
- `npm.cmd run tickets:status` for tickets, locks, worktrees, and active ports.
- `npm.cmd run tickets:show -- T-0001` for the ticket and paths.
- `docs/tickets/logs/T-0001/runner.log`, `agent.log`, `verify.log`,
  `review.log`, and `delivery.log`.
- `docs/tickets/.locks/T-0001.json` for PID, heartbeat, branch, and worktree.
- The runner records the opencode session title/ID. Inspect with:

```powershell
opencode session list
opencode export <sessionID>
```

For live inspection, run a local opencode server and attach:

```powershell
opencode serve --port 4096
opencode attach http://127.0.0.1:4096
```

## Safety

- Only confirmed `ready` tickets are picked. The runner never invents answers.
- The ticket-runner agent works in an isolated worktree and is configured not to
  commit or push. The runner script owns git and delivery.
- Ticket text is trusted local input. Do not add tickets from untrusted sources.
- If the main working tree has unrelated uncommitted code changes, the runner
  pauses instead of mixing them into a ticket.
- Per-ticket delivery is serialized by a global merge/delivery lock.
