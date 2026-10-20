---
name: parallel-ticket-planning
description: Use when creating, splitting, or executing Moonlander tickets in parallel. Covers the parallelization check, leaf/trunk splits, scope disjointness, wave planning, test contracts, focused review packets, session reuse, milestone live checks, coordination handoffs, and serialized verification and delivery. Load before dispatching concurrent implementation teams.
---

# Parallel ticket planning

## Trigger

Use when creating tickets from a brief, triaging the queue, planning a wave, or
deciding whether work can run concurrently. Do not use it to force parallelism
on a serial dependency chain.

## Decision checklist

Run this before creating or claiming tickets:

1. Is the contract frozen? Shared types, constants, and exports must be in
   `docs/spec.md` and compiling stubs must exist. If not, stop.
2. Can the work be split into units with disjoint files? If not, keep it
   sequential and record why in the ticket's `Parallelization plan`.
3. Does any unit share `simulation.ts`, `render/index.ts`, a package file, a
   config, or a shared test file? Give that file one writer, or add a serialized
   integration ticket.
4. Are dependencies satisfied and are the tickets confirmed with no open
   questions? If not, defer.
5. Is the wall-clock gain larger than the coordination cost? If not, run
   sequentially.
6. Can verification be serialized? Browser suites, `npm.cmd run verify`,
   delivery, and live verification always run one at a time.

## Split patterns

- Leaf/trunk: rebuild pure modules in parallel, then one integration ticket
  wires them into the shared simulation.
- Sim/UI: rebuild simulation modules while the game shell is built against the
  frozen API and stubs. Integrate after both sides pass their focused tests.
- Test/implementation: author e2e or determinism tests from the spec while the
  implementation is built; run them after integration. A red authoring suite is
  not a deliverable wave while `npm.cmd run verify` runs Playwright.
- Delivery/tooling: update CI, Pages, and the live harness in parallel with game
  work; reconcile docs after the behavior is final.

## Wave template

```markdown
| Wave | Tickets | Scopes | Integration order | Verification |
| --- | --- | --- | --- | --- |
| 1 | T-0005, T-0007 | physics.ts, sensor.ts | independent | focused tests, then integrate |
```

Check module imports before calling a pair independent. For example, collision
depends on physics for `rotate`, so those two are not a safe wave.


- Maximum two implementation tickets per in-session wave.
- One writer per file.
- Each ticket gets its own `test-engineer`.
- The lead integrates, reviews, verifies, and delivers.

## Fast wave protocol

- Before dispatch, write `docs/tickets/logs/wave-<n>/context.md` from
  `docs/templates/wave-context.md`: tickets, scopes, exact formulas and
  signatures, test commands, known traps, review packet, and delivery decision.
- Every ticket records a `### Test contract` with exact formulas, constants,
  expected values, thresholds, and test file names. Prefer `it.each` tables and
  about 20-25 cases per pure module.
- Reuse the same `sim-engineer`, `test-engineer`, and `reviewer` sessions across
  waves with `task_id`. Tell them to re-read changed files only and stop on stale
  assumptions or contract drift.
- Give the reviewer a packet: diff, new test names, focused test output,
  acceptance-criteria checklist, and the wave context card.
- Start a ticket's review as soon as its files are stable, while the other
  ticket's tests are still running.
- Leaf pure modules get a focused review. T-0013, T-0009, T-0011, and T-0012 get
  the full review.
- After review, verify, and push, start the next wave while `release-engineer`
  finishes the delivery tail.
- Run local `npm.cmd run verify` every wave. Run the live Playwright suite at
  T-0013, T-0009, T-0010, T-0011, and T-0012. Sim-only intermediate waves may use
  `--no-live` under the recorded waiver.
- `release-engineer` updates ticket evidence and status and pushes the queue
  update in the same delivery task.

## Coordination protocol

- The lead is the only coordinator. Subagents report to the lead; they do not
  coordinate directly.
- Write handoffs to `docs/tickets/logs/<id>/handoff.md` or the ticket body:
  files touched, decisions, assumptions, remaining work, tests run, and the next
  integration step.
- Announce contract or scope changes to the lead before editing a shared file.
- If a ticket needs a file owned by another ticket, stop and create an
  integration ticket or serialize the work.

## `tickets:plan`

Run:

```powershell
npm.cmd run tickets:plan -- --max-parallel 2
```

The command prints ready tickets, scope conflicts, suggested waves, and
unscheduled tickets with reasons. Reconcile its output with the written wave
plan; the command does not replace judgment about contract readiness or
verification order.

## Anti-patterns

- Two writers on `simulation.ts`, `render/index.ts`, or a shared test file.
- Parallelizing a dependency chain without a contract freeze.
- Splitting a ticket into pieces that all need the same integration file.
- Running two Playwright suites or two deliveries at once.
- Treating a wave plan as permission to ignore declared scopes.
- Reusing a subagent session without re-reading changed files.
- Deferring live verification past T-0012.
- Adding a separate parallelization agent; the lead owns this process.
