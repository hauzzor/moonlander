# Continuous Local Ticket Queue and Runner

## Change tier

Tier 2 — process and tooling change; no gameplay or simulation behavior.

## Original request

The user wants to add new tasks continuously while agents are working, with
tasks treated as tickets that agents pick and implement.

Confirmed choices: local Markdown queue, only confirmed ready tickets are
auto-picked, a background `opencode run` runner, as much safe parallelism as
possible with tickets split into smaller tickets, and per-ticket delivery.

## Goal

Add a durable local ticket queue, a scope/dependency-aware background runner,
an isolated per-ticket worktree and lead agent, and inspection tooling. Keep the
existing intake, TDD, review, and delivery rules.

## Current behavior

- Work is requested in chat and executed synchronously by the lead.
- Subagents run only when the lead invokes them.
- There is no persistent queue, ticket status, worktree isolation, or merge
  queue.
- Delivery is per build via `scripts/deliver.mjs`.

## Desired behavior

### Ticket queue

- Local Markdown tickets under `docs/tickets/` with status directories:
  `inbox`, `needs-info`, `ready`, `in-progress`, `review`, `done`, `blocked`.
- Frontmatter: id, title, status, priority, parent, depends-on, scopes,
  contract, confirmed, confirmed-at.
- `inbox` tickets can be added at any time. The interactive lead triages them.
- Only tickets with `confirmed: true` in `ready` are claimable.
- Ticket body is the confirmed brief (goal, decisions, contract, test matrix,
  acceptance, open questions, verification).

### Parallel scheduling

- The runner claims ready tickets whose dependencies are done.
- Claimed ticket scopes must not overlap any active ticket scope.
- Contract/shared-file tickets run first and are serialized.
- Default maximum parallel implementation tickets: 3.
- One Playwright suite and one delivery/merge at a time.
- Large requests are decomposed into child tickets by triage; children get
  narrow scopes and explicit dependencies.
- Ticket agents work in isolated git worktrees and branches.

### Runner

- `scripts/ticket-runner.mjs` polls `ready/`, claims tickets atomically, creates
  worktrees, installs dependencies, and invokes a per-ticket lead:
  `opencode run --agent ticket-runner --auto --dir <worktree> ...`.
- The ticket-runner agent follows `AGENTS.md`, uses TDD, spawns specialists and
  the reviewer, and does not commit or push.
- The runner verifies, reviews, and commits the ticket branch.
- A single merge queue rebases each ticket onto `main`, runs full verification,
  merges, delivers, waits for the live asset, runs the live suite, and marks the
  ticket done.
- Failed tickets move to `blocked` with logs.
- A `PAUSE` file stops claiming new tickets; stale locks are reported.

### Inspection

- Runner stdout streams ticket transitions, agent sessions, test results, and
  delivery status.
- `npm.cmd run tickets:status` / `tickets:list` / `tickets:show` snapshot state.
- Per-ticket logs and agent reports under `docs/tickets/logs/<id>/`.
- The ticket records the opencode session title/ID for `opencode session list`,
  `opencode export`, or live `opencode attach`.
- `.locks/<id>.json` records PID, heartbeat, branch, and worktree.

## Non-goals

- Auto-triage or auto-confirmation of ambiguous tickets.
- Parallel delivery to `main`.
- A web dashboard or database.
- GitHub Issues integration in this version.
- Changing the game behavior.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Queue | Local Markdown | User choice; inspectable and offline |
| Auto-pick | Confirmed ready only | Preserves the intake gate |
| Runner | Background `opencode run` | Only way work continues between chat turns |
| Parallelism | Max 3 ticket worktrees, scoped/dependency-limited | User wants safe parallelism |
| Decomposition | Triage creates child tickets | Smaller scopes enable parallel work |
| Browser/delivery | One global lock each | Port 4173 and `origin/main` are shared |
| Delivery | Per ticket via merge queue | User choice; deployments are serialized |

## Contract freeze

New files:

- `docs/tickets/TEMPLATE.md`, `docs/tickets/README.md`, status directories.
- `scripts/lib/tickets.mjs` — parsing, IDs, dependency/scope scheduling, status.
- `scripts/tickets.mjs` — CLI.
- `scripts/ticket-runner.mjs` — background runner.
- `scripts/test/tickets.test.mjs` — queue core tests.
- `.opencode/agent/ticket-runner.md` — per-ticket lead, no commit/push.
- `.opencode/command/ticket.md` — process a ticket in the TUI.

Changed files:

- `package.json` — ticket commands.
- `.gitignore` — `.worktrees/`, ticket logs/locks.
- `playwright.config.ts` and `packages/game/vite.config.ts` — `TICKET_PORT`.
- `scripts/deliver.mjs` — `--push-current` merge-queue mode.
- `AGENTS.md` — continuous ticket queue rules and ownership.
- `README.md` — ticket workflow.

## Test matrix

| Area | Tests |
| --- | --- |
| Frontmatter | Parse/serialize IDs, booleans, arrays, block scopes |
| Scheduling | Dependency readiness, scope overlap, priority ordering |
| IDs | Next ID across status folders |
| CLI | `new`, `list`, `status`, `show`, move validation |
| Runner | Dry-run selection, pause, stale locks, atomic claim (manual/dry-run) |
| Ports | `TICKET_PORT` local e2e uses a unique port |
| Delivery | `--push-current` pushes HEAD without committing |

## Acceptance criteria

1. A ticket can be added to `inbox` at any time and inspected.
2. Only confirmed ready tickets with satisfied dependencies and disjoint scopes
   are claimed.
3. The background runner can process tickets while the user adds more.
4. Each ticket runs in its own worktree; the ticket agent cannot commit/push.
5. Per-ticket verification, review, merge, push, live asset check, and live
   suite run through the merge queue.
6. `tickets:status`, `tickets:list`, `tickets:show`, and logs expose runner
   state.
7. `PAUSE` stops claiming; locks and blocked tickets are recoverable.
8. Unit tests, typecheck, local e2e, build, and live delivery pass.

## Edge cases

- Dependency not done; scope conflict; shared contract ticket.
- Ticket edited after claim; missing confirmation; open questions.
- Runner crash/stale lock; worktree already exists; branch exists.
- `npm ci` failure; agent timeout; tests fail; review fails.
- Merge conflict/rebase failure after another ticket delivered.
- Browser port conflict; delivery lock contention.
- Live deployment failure after a ticket.
- User edits code in the main worktree while the runner is active.

## Verification plan

1. Add the queue, templates, core library, CLI, runner, agent, and command.
2. Add core tests and run `npm.cmd run verify`.
3. Dry-run the runner against sample tickets and inspect selection/logs.
4. Deliver with `npm.cmd run deliver`.

## Open questions

None.

## Delivery waiver

None.

## Confirmation

Confirmed by the user on 2026-10-19.
