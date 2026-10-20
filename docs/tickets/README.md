# Local Ticket Queue

The ticket queue is a durable local backlog for **game code** work that should
be picked up by the background ticket runner or the interactive lead.

Development-cycle changes — the ticket/runner/delivery tooling, `AGENTS.md`,
agent and skill configuration, and workflow documentation — are not game code.
The interactive lead implements those directly without a ticket, intake, or TDD.

## Lifecycle

```
inbox → needs-info ↔ ready → in-progress → review → done
                                      ↘ blocked → ready (automatic recovery, once)
```

- `inbox` — raw requests. You can add tickets at any time.
- `needs-info` — the lead is waiting on answers or a confirmed brief.
- `ready` — brief confirmed; dependencies and scopes are declared. Only these
  are claimable.
- `in-progress` — claimed by the runner; a lock and worktree exist.
- `review` — implementation and tests are green; review/merge queue pending.
- `done` — verified, merged, delivered, and live-tested.
- `blocked` — a recoverable failure that the runner will retry once
  automatically, or an exhausted failure awaiting the lead.

A ticket moves forward only after the user explicitly confirms the written
brief and the frontmatter has `confirmed: true` with no open questions.

## Commands

```powershell
npm.cmd run tickets:new -- "My task title"
npm.cmd run tickets:list
npm.cmd run tickets:status
npm.cmd run tickets:show -- T-0001
npm.cmd run tickets:logs -- T-0001 --follow
npm.cmd run tickets:recover -- T-0001 [--force]
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

The runner writes these fields when a ticket blocks:

```yaml
blocked-stage: agent
blocked-category: agent-timeout
blocked-reason: "ticket agent timed out after 2700000ms"
blocked-at: 2026-10-20T09:24:55.411Z
recovery-attempts: 1
recovery-last-at: 2026-10-20T12:30:00.000Z
recovery-exhausted: false
```

- `blocked-stage` is one of `setup`, `agent`, `verify`, `commit`, `queue`,
  `rebase`, `merge`, `delivery`, or `orphaned`.
- `blocked-category` is the classification used for recovery decisions.
- `recovery-attempts` counts automatic recovery runs already scheduled.
- `recovery-exhausted: true` means no further automatic retry will happen.
- History is appended to `docs/tickets/logs/T-0001/recovery.log`.

## Runner behavior

- Default maximum parallel implementation tickets: 3.
- One Playwright/browser suite and one merge/delivery at a time.
- The runner holds a global `docs/tickets/.locks/runner.json` lock and refuses
  to start a second runner unless `--force` is used. Use `--force` only after
  inspecting the reported PID.
- Each claimed ticket gets `.worktrees/T-0001` on branch `ticket/T-0001`.
- The active ticket lock is heartbeated every 30 seconds.
- The ticket-runner agent follows `AGENTS.md`, TDD, and the ticket brief. It may
  spawn the test/implementation/review specialists. It may not commit or push.
- The runner script verifies, runs the merge queue, commits, pushes, waits for
  the live asset, runs the live suite, and updates ticket status.
- Recoverable failures move to `blocked`, are requeued once automatically with
  the preserved worktree and a 90-minute agent timeout, then either finish or
  remain blocked with `recovery-exhausted: true`.
- Ambiguous failures move to `needs-info` instead of retrying.
- `in-progress` tickets with a missing or stale lock are converted to
  `blocked/orphaned` and follow the same recovery path.
- Disable automatic recovery with `--no-recover` or
  `TICKET_MAX_RECOVERY_ATTEMPTS=0`.

## Automatic recovery

A blocked ticket is requeued only when all of these are true:

- it is confirmed and has no open questions;
- it has declared scopes and its dependencies are `done`;
- its scopes do not overlap an active ticket;
- its category is retryable and `recovery-attempts` is below the limit;
- its cooldown has elapsed.

Retryable categories are `agent-timeout`, `agent-incomplete`, `transient`,
`verification`, `delivery`, `infra`, and `orphaned`. `needs-info`,
`merge-conflict`, and `main-dirty` require the interactive lead.

The default policy is one recovery attempt with a 90-minute agent timeout.
Override it with:

```powershell
$env:TICKET_MAX_RECOVERY_ATTEMPTS = "1"
$env:TICKET_RECOVERY_DELAY_MS = "300000"
$env:TICKET_RECOVERY_TIMEOUT_MS = "5400000"
$env:TICKET_STALE_LOCK_MS = "300000"
```

Recovery reuses the existing worktree. The agent is told not to restart the TDD
cycle, not to weaken tests, and to report `BLOCKED` for ambiguity. A delivery
failure whose branch is already merged and whose worktree is clean retries
delivery without rerunning the agent.

Manual recovery after inspection:

```powershell
npm.cmd run tickets:recover -- T-0001
npm.cmd run tickets:recover -- T-0001 --force
```

`--force` clears `recovery-exhausted` and grants one additional recovery run.

## Inspection

- Live terminal output from `npm.cmd run tickets:run`.
- `npm.cmd run tickets:status` for tickets, the runner lock, recoverable
  blocked tickets, locks, worktrees, and ports.
- `npm.cmd run tickets:show -- T-0001` for the ticket and paths.
- `docs/tickets/logs/T-0001/runner.log`, `agent.log`, `verify.log`,
  `review.log`, `recovery.log`, and `delivery.log`.
- `docs/tickets/.locks/runner.json` for the active runner PID and heartbeat.
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
- Only confirmed blocked tickets with no open questions, declared scopes, done
  dependencies, and free scopes are recovered automatically.
- Ambiguous work moves to `needs-info`; it is never retried automatically.
- The recovery agent may not weaken or delete tests to obtain green.
- A stale lock is reclaimed only when its PID is gone or belongs to a ticket
  runner/opencode process. Otherwise recovery stops and reports the PID.
- The ticket-runner agent works in an isolated worktree and is configured not to
  commit or push. The runner script owns git and delivery.
- Ticket text is trusted local input. Do not add tickets from untrusted sources.
- If the main working tree has unrelated uncommitted code changes, the runner
  pauses instead of mixing them into a ticket, and automatic recovery is
  skipped.
- Per-ticket delivery is serialized by a global merge/delivery lock.
