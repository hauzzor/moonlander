# Faster Development Cycle: Wave Protocol and Live Milestones

## Change tier

Development-cycle process change. No gameplay, physics, public API, or test
coverage change. The lead and `release-engineer` implement it directly; no game
intake is required.

## Original request

After wave 1 (T-0005 physics and T-0007 sensor), the user asked to analyse the
executed wave and propose ways to make future development cycles faster.

Wave 1 baseline, measured from the "go ahead" message to ticket completion:

| Phase | Wall-clock | Cost |
| --- | --- | --- |
| Parallel implementation and tests | 11m10s | $0.148 |
| Lead integration and focused checks | 1m33s | — |
| Independent review | 8m07s | $0.045 |
| Delivery (verify, push, Pages, live) | 3m47s | $0.008 |
| Ticket evidence, status, separate push | 2m25s | $0.004 |
| **Total** | **27m23s** | **~$0.230** |

The critical path was the T-0005 test engineer at 10m38s, followed by the
reviewer at 7m44s. The two sim engineers finished in about 5.5 minutes. The
delivery included a duplicate verify, a Pages wait, and a live suite for a
simulation-only wave.

## Goal

Reduce the steady-state wave from about 27 minutes to about 19-21 minutes
without weakening review, verification, or test coverage.

## Current behavior

- Tests are written from the ticket and spec without an explicit test contract
  card, so exact formulas and thresholds can be interpreted differently.
- The reviewer re-reads the full spec and brief, reviews both tickets after the
  whole wave finishes, and runs focused plus full unit tests.
- Each wave starts new subagent sessions, so every agent reloads the same
  context.
- Delivery runs a second full verify, waits for Pages, and runs the live suite
  for every wave, including sim-only waves.
- Ticket evidence, status changes, and the queue commit are a separate release
  task after code delivery.

## Desired behavior

### Fast wave protocol

1. **Wave context pack.** Before dispatch, the lead writes
   `docs/tickets/logs/wave-<n>/context.md` from
   `docs/templates/wave-context.md`: tickets, scopes, exact formulas and
   signatures, test commands, known traps, review packet, and the delivery/live
   decision.
2. **Test contract card.** Every ticket records exact formulas, constants,
   expected values, thresholds, and test file names before implementation. Pure
   module tests use `it.each` tables and target about 20-25 cases unless the
   ticket requires more.
3. **Session reuse.** Reuse the same `sim-engineer`, `test-engineer`, and
   `reviewer` sessions across waves with `task_id`. Instruct them to re-read
   changed files only and to stop on stale assumptions or contract drift.
4. **Concurrent per-ticket review.** Start a ticket's review as soon as its files
   are stable, while the other ticket's tests are still running. Leaf pure
   modules get a focused review packet; T-0013, T-0009, T-0011, and T-0012 get
   the full review.
5. **Pipeline the next wave.** After review, verify, and push, start the next
   wave while `release-engineer` finishes the delivery tail. Scopes must remain
   disjoint, and no local edits may overlap the delivery verification.
6. **Merged ticket completion.** `release-engineer` updates ticket evidence and
   status and pushes the queue update in the same delivery task.
7. **Milestone live verification.** Run local `npm.cmd run verify` every wave.
   Run the live Playwright suite at milestones: T-0013, T-0009, T-0010, T-0011,
   and T-0012. Sim-only intermediate waves use `--no-live` under this standing
   waiver. The final live suite remains mandatory.

### Documentation

- `AGENTS.md`, `.opencode/agent/lead.md`, and the
  `parallel-ticket-planning` skill describe the protocol.
- `.opencode/agent/release-engineer.md`, `.opencode/command/ticket.md`, and
  `.opencode/command/deliver.md` describe wave delivery, milestone live checks,
  and merged ticket completion.
- `docs/templates/wave-context.md` is added.
- `docs/tickets/TEMPLATE.md` gains a `### Test contract` subsection.
- `docs/templates/test-matrix.md` gains table-driven test guidance.
- `docs/tickets/README.md` and `README.md` describe the fast wave protocol and
  live milestones.
- The earlier `2026-10-20-parallel-ticket-execution.md` brief notes that this
  brief supersedes its live cadence and wave protocol details.

## Non-goals

- No gameplay, physics, HUD, or public API changes.
- No new agents and no concurrency cap increase.
- No delivery-tooling changes such as verification receipts or batched
  milestone deliveries.
- No model or reasoning-variant changes.
- No weakening of tests or review.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Speedup scope | Quick wins plus milestone live checks | Process-only changes with no tooling risk |
| Test authoring | Test contract card and table-driven tests | Prevent formula contradictions; reduce critical path |
| Review | Focused packet, risk-based depth, per-ticket start | Reviewer was 8m07s and waited for the whole wave |
| Sessions | Reuse sim/test/reviewer sessions | Avoid repeated context loading; measured ~6.4M cache reads |
| Delivery | Local verify every wave; live at milestones | Remove Pages wait and live suite from sim-only waves |
| Ticket completion | Merge into delivery task | Remove the separate 2m25s bookkeeping task |
| Pipeline | Start next wave after push | Overlap delivery tail with implementation |
| Model | Unchanged | Measure process gains first |

## Contract freeze

No public API or game contract changes.

The process contract is the wave protocol above plus the templates:

- Wave context pack fields: wave, tickets, scopes, exact formulas/signatures,
  test commands, known traps, review packet, delivery/live decision.
- Test contract fields: formulas/constants, expected values, thresholds, test
  file names, table-driven cases.
- Review packet fields: diff, test names, focused test output, acceptance
  checklist, context pack.

## Test matrix

| Area | Check | Owner |
| --- | --- | --- |
| Process docs | No contradictions across `AGENTS.md`, `lead.md`, skill, templates, READMEs | reviewer |
| Execution files | `release-engineer.md`, `/ticket`, and `/deliver` describe the same wave/live/ticket-completion flow | reviewer |
| Wave context template | Contains every required field | lead |
| Ticket template | Test contract subsection is present and usable | lead |
| Existing tooling | `npm.cmd test` and `npm.cmd run verify` pass | lead |
| Wave 2 measurement | Record phase times and cost; compare with the 27m23s baseline | lead |
| Live cadence | `--no-live` waiver recorded; live milestones named | release-engineer |

## Acceptance criteria

1. The fast wave protocol is documented consistently in `AGENTS.md`,
   `lead.md`, `release-engineer.md`, the `parallel-ticket-planning` skill,
   `/ticket`, `/deliver`, and the ticket README.
2. `docs/templates/wave-context.md` exists and covers every field in the
   protocol.
3. `docs/tickets/TEMPLATE.md` includes a usable `### Test contract` subsection.
4. The old parallel-ticket brief no longer contradicts the milestone live
   cadence.
5. `npm.cmd test` and `npm.cmd run verify` pass.
6. The docs-only process delivery uses `--no-live` with the waiver recorded.
7. Wave 2 is executed with the new protocol and its wall-clock and cost are
   recorded against the baseline.

## Edge cases

- Reused sessions carry stale context; the handoff must require re-reading
  changed files and stopping on drift.
- Concurrent review starts on a moving tree; only start when the ticket's files
  are stable.
- A milestone live run fails; stop and report rather than skipping the next
  milestone.
- A docs-only `--no-live` delivery hides a game regression; local verify and the
  next live milestone remain required.
- Test contract cards become too prescriptive; keep them at spec-level formulas
  and acceptance values.

## Affected interfaces

- `AGENTS.md`, `.opencode/agent/lead.md`,
  `.opencode/agent/release-engineer.md`, `.opencode/agent/reviewer.md`,
  `.opencode/agent/test-engineer.md`
- `.opencode/command/ticket.md`, `.opencode/command/deliver.md`
- `.opencode/skills/parallel-ticket-planning/SKILL.md`
- `docs/templates/wave-context.md` (new)
- `docs/tickets/TEMPLATE.md`, `docs/changes/TEMPLATE.md`,
  `docs/templates/test-matrix.md`
- `docs/tickets/README.md`, `README.md`
- `docs/changes/2026-10-20-parallel-ticket-execution.md` (superseded note)
- No game code, tests, configs, package files, or ticket scopes change.

## Parallelization plan

- This is a single sequential documentation change; splitting it would create
  edit conflicts across shared workflow docs.
- Implementation order: brief, templates, AGENTS/lead/skill, READMEs, old-brief
  note.
- Verification: focused docs review, then `npm.cmd test` and full verify.
- Wave 2 starts only after the process delivery is pushed.

## Determinism and boundary impact

None. No simulation, rendering, or public API behavior changes.

## Verification plan

1. `npm.cmd test`.
2. `npm.cmd run verify`.
3. Dispatch `reviewer` to check for contradictions and stale rules.
4. Deliver via `release-engineer` with `--no-live`; record the waiver.
5. Before dispatch, add `### Test contract` sections to T-0006 and T-0008 and
   write `docs/tickets/logs/wave-2/context.md`.
6. Start wave 2 and measure dispatch, implementation/tests, review, delivery,
   and ticket completion.
7. Report wave 2 against the 27m23s baseline. If it is not at least 20% faster,
   stop and reassess before wave 3.

## Open questions

None.

## Delivery waiver

The docs-only process delivery may use `--no-live` under the user-approved
milestone cadence. The first live check in the remaining rebuild is T-0013,
followed by T-0009, T-0010, T-0011, and T-0012.

## Confirmation

Confirmed by the user on 2026-10-20.
