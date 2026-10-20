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
| Lead coordination | — | $0.025 |
| Dispatch and handoff gaps | 0m21s | — |
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
3. **Guarded session use.** Use fresh `test-engineer` and `reviewer` sessions for
   each wave. Reuse a `sim-engineer` session only when it is below about 30
   messages and 300k input tokens. Reused sessions re-read changed files only and
   stop on stale assumptions or contract drift. If a subagent returns empty,
   immediately start a fresh session with the wave context card.
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
| Sessions | Fresh test/reviewer; guarded sim reuse | Wave 2 empty long-session responses; fresh sessions are reliable |
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

## Wave 2 measurement and reassessment

Measured from wave 2 dispatch (2026-10-20 19:39:09 UTC) to ticket completion
(20:15:14 UTC): **36m05s**, about **$0.444**. This is slower than the 27m23s
wave 1 baseline.

| Phase | Wall-clock | Notes |
| --- | --- | --- |
| Dispatch | 12m23s | Reused test-engineer session returned empty |
| Focused tests and typecheck | 2m44s | Includes two short bash checks |
| Collision test recovery | 8m55s | 28 table-driven tests in the same session |
| Review attempt | 7m15s | Reused reviewer session returned empty |
| Review recovery | 1m40s | Same session, full report |
| Delivery and ticket completion | 3m08s | Merged task, `--no-live` |
| **Total** | **36m05s** | Slower than the 27m23s baseline |

What worked:

- Merged delivery and ticket completion took 3m08s instead of 6m12s. This is not
  purely merge overhead: wave 1's 6m12s includes a live delivery plus a separate
  ticket task; wave 2's 3m08s includes both in one task and skipped the live
  suite.
- Skipping the live suite for a sim-only wave removed the Pages wait and live
  run.
- The collision test recovery wrote 28 table-driven tests in 8m55s; wave 1
  physics tests took 10m38s for 37 tests.
- The wave 2 review recovery produced the full report in 1m40s; the new policy
  still starts fresh instead of retrying the long session.

What failed:

- The dispatch phase took 12m23s; the reused test-engineer session (72 messages,
  671k input) returned empty.
- The reused reviewer session (58 messages, 1.16M input) returned empty after
  7m15s.
- The reliable reused sessions were the sim-engineer sessions (44 messages).

Reassessment:

1. Reuse a `sim-engineer` session only when its prior message count is below
   about 30 and its input is below about 300k; otherwise start fresh.
2. Use a fresh reviewer session per wave. Keep the focused review packet so the
   fresh review is fast.
3. If any subagent returns empty, immediately start a fresh session with a
   compact wave-context prompt; do not retry the same long session.
4. Keep the other quick wins: test contracts, table-driven tests, merged
   delivery, milestone live checks.
5. Measure wave 3 with the guard and compare by wave type. Small pure-module
   waves target 15-20 minutes; integration/game waves target 30-40 minutes. The
   guard was confirmed by the user on 2026-10-20.

## Wave 3 measurement

Wave 3 (T-0013 simulation integration + T-0015 game modules and renderer) is a
much larger wave than waves 1-2. Measured 41m36s from dispatch, 42m55s including
preparation, at about $0.528.

| Phase | Wall-clock | Notes |
| --- | --- | --- |
| Preparation | 1m19s | Test contracts, wave context, ticket moves |
| Dispatch and implementation/tests | 17m28s | Four fresh agents; no empty results |
| Lead checks | 1m19s | |
| Review | 8m26s | Reviewer found the blocking `tunnelCenterOffset` spec defect |
| Fix | 3m39s | Perpendicular offset plus stronger tests |
| Lead verify | 1m57s | |
| Review confirmation | 1m22s | |
| Delivery and ticket completion | 7m25s | Live suite 21/21, merged ticket completion |
| **Total** | **41m36s** | Excludes preparation; 42m55s including it |

The total row excludes the 1m19s preparation phase; including it, the wave took
42m55s.

What worked:

- Fresh test-engineer and reviewer sessions were reliable; there were no empty
  results and no failed-session recovery cost.
- The reviewer caught a real public-contract defect (`tunnelCenterOffset` was
  vertical instead of perpendicular), which would have fed the T-0014 benchmark
  the wrong field.
- The merged delivery and ticket completion task handled the live milestone in
  7m25s, including the 21/21 live suite.
- Fresh-session reliability is confirmed: there were no empty sessions, unlike
  wave 2. The guarded `sim-engineer` reuse threshold remains to be exercised in a
  later wave.

What dominated:

- The wave itself: T-0013 touched the simulation trunk and five integration test
  files; T-0015 rebuilt the game modules, renderer, static hooks, and 179 game
  tests.
- The review, fix, and confirmation cycle: 13m27s total, plus 1m57s of lead
  verify. This was justified by the spec defect, not process overhead.

Conclusion: the guarded fast protocol is working; wave size dominates. Keep the
guard and compare future waves by type:
- Small pure-module waves: target 15-20 minutes.
- Integration/game waves: target 30-40 minutes.

The next wave is T-0014 (autopilot benchmark) + T-0016 (sensor console/radar),
and T-0014 owns the 8-seed benchmark.

## Open questions

None.

## Delivery waiver

The docs-only process delivery may use `--no-live` under the user-approved
milestone cadence. The first live check in the remaining rebuild is T-0013,
followed by T-0009, T-0010, T-0011, and T-0012.

## Confirmation

Confirmed by the user on 2026-10-20. The guarded session policy was confirmed on
the same date after the wave 2 reassessment.
