# Parallel Ticket Execution and Rebuild Wave Decomposition

> Superseded for the live cadence and fast wave protocol by
> [`2026-10-20-faster-development-cycle.md`](2026-10-20-faster-development-cycle.md).
> The ticket decomposition, scopes, and dependencies in this brief remain
> authoritative.

## Change tier

Development-cycle tooling change plus ticket re-decomposition. No gameplay,
physics, balance, or public API behavior change.

The tooling, templates, and docs are implemented directly by the lead and
`release-engineer`. The ticket re-decomposition changes confirmed game-ticket
scopes and was confirmed by the user on 2026-10-20 before the queue was edited.
This is not a Tier 2 game behavior change; every re-scoped ticket retains the
original acceptance criteria and test coverage.

## Original request

The user asked to always check whether new tickets or parts of them can run in
parallel, to break tasks down when that helps parallelization, and to execute
with multiple subagent teams where possible. The user proposed a separate
parallelization agent and asked for an opinion.

Decisions:

- Keep parallelization lead-owned; do not add a separate agent.
- Add a `parallel-ticket-planning` skill and a deterministic `tickets:plan`
  command.
- Cap in-session concurrency at two implementation tickets per wave.
- Re-plan the current rebuild tickets T-0005 through T-0012.

## Goal

Make parallelization a required, lead-owned planning step, add a deterministic
wave planner, and re-decompose the remaining rebuild tickets into leaf/trunk
units so up to two disjoint implementation tickets can run per wave without
changing game behavior or acceptance coverage.

## Current behavior

- One-session execution is effectively serial. `tickets:plan` reports the
  conflicting scope pairs: T-0005, T-0006, and T-0007 share
  `packages/sim/src/simulation.ts`; T-0007 and T-0009 share
  `packages/game/src/render`; and T-0009 and T-0010 share
  `packages/game/test`.
- The current ready tickets do not contain the new mandatory
  `## Parallelization plan` section, so the planner marks them unscheduled until
  they are re-scoped.
- No deterministic wave planner existed before this change.
- The proposed separate parallelization agent is not added; the lead owns the
  process.

## Desired behavior

### Process

- `AGENTS.md` and `.opencode/agent/lead.md` define the wave model, the two-ticket
  cap, shared-file serialization, coordination, and verification order.
- Ticket and change templates include a `Parallelization plan`.
- The `parallel-ticket-planning` skill documents the decision tree, split
  patterns, and handoff protocol.
- `npm.cmd run tickets:plan` prints ready tickets, scope conflicts, suggested
  waves, and unscheduled reasons.
- `/ticket` accepts one or more tickets and executes them in waves.

### Re-decomposed tickets

Existing tickets are narrowed; new tickets use the next IDs. Every original
acceptance criterion and test must move to one of these tickets.

| Ticket | Title | Scopes | Depends on |
| --- | --- | --- | --- |
| T-0005 | Physics module | `packages/sim/src/physics.ts`, `packages/sim/test/physics.test.ts` | T-0003 |
| T-0006 | Collision module | `packages/sim/src/collision.ts`, `packages/sim/test/collision-module.test.ts` | T-0003, T-0004, T-0005 |
| T-0007 | Sensor module | `packages/sim/src/sensor.ts`, `packages/sim/test/sensor-module.test.ts` | T-0003, T-0004 |
| T-0013 | Simulation integration | `packages/sim/src/simulation.ts`, `packages/sim/test/simulation.test.ts`, `packages/sim/test/collision.test.ts`, `packages/sim/test/eye-sensor.test.ts`, `packages/sim/test/navigation-sensors.test.ts`, `packages/sim/test/observation.test.ts`, `packages/sim/test/helpers.ts` | T-0005, T-0006, T-0007 |
| T-0008 | Autopilot controller | `packages/sim/src/autopilot.ts`, `packages/sim/test/autopilot.test.ts` | T-0005, T-0007 |
| T-0014 | Autopilot benchmark | `packages/sim/test/autopilot-benchmark.test.ts`, `packages/sim/examples/headless-demo.ts` | T-0008, T-0013 |
| T-0015 | Game pure modules and render | `packages/game/src/dom.ts`, `packages/game/src/input.ts`, `packages/game/src/hud.ts`, `packages/game/src/seed.ts`, `packages/game/src/style.css`, `packages/game/src/render/index.ts`, `packages/game/src/render/ship.ts`, `packages/game/src/render/backdrop.ts`, `packages/game/index.html`, `packages/game/test` | T-0003, T-0004 |
| T-0016 | Sensor console and sensor render | `packages/game/src/sensor-console.ts`, `packages/game/src/render/sensor.ts`, `packages/game/src/render/radar.ts` | T-0015 |
| T-0009 | Game wiring and playable integration | `packages/game/src/main.ts`, `packages/game/src/game.ts`, `packages/game/src/seed-controls.ts` | T-0013, T-0014, T-0015, T-0016 |
| T-0010 | E2E coverage and hooks | `e2e`, `playwright.config.ts` | T-0009 |
| T-0017 | CI, Pages, and live harness | `.github`, `scripts`, `package.json`, `package-lock.json` | T-0009 |
| T-0011 | Docs reconciliation and live verification | `README.md`, `docs/spec.md`, `docs/autonomy.md` | T-0010, T-0017 |
| T-0012 | Final rebuild parity and report | `docs/tickets`, `docs/changes`, `AGENTS.md` | T-0011 |

T-0010 no longer edits `packages/game/test`; T-0015 owns the pure game tests.
T-0010 owns only the browser suite and Playwright configuration.

Existing simulation integration tests `collision.test.ts`, `eye-sensor.test.ts`,
`navigation-sensors.test.ts`, `observation.test.ts`, `simulation.test.ts`, and
`helpers.ts` belong to T-0013. T-0006 and T-0007 add new pure module test files;
they must not delete or weaken the integration files.

### Wave plan

| Wave | Tickets | Why it is safe |
| --- | --- | --- |
| 1 | T-0005, T-0007 | Physics and sensor modules; disjoint files. |
| 2 | T-0006, T-0008 | Collision module and autopilot controller; disjoint files. |
| 3 | T-0013, T-0015 | Serialized simulation integration plus game pure modules. |
| 4 | T-0014, T-0016 | Autopilot benchmark plus sensor console and sensor render. |
| 5 | T-0009 | Game wiring and playable integration. |
| 6 | T-0010, T-0017 | E2E coverage plus CI, Pages, and live harness. |
| 7 | T-0011 | Docs reconciliation and live verification. |
| 8 | T-0012 | Final parity and rebuild report. |

T-0006 depends on T-0005 because `collision.ts` imports `rotate` from
`physics.ts`. T-0015 depends on T-0004 because it consumes the rebuilt camera and
field renderer. T-0010 and T-0017 both depend on T-0009 so their checks run
against the integrated game, not a red partial build.

### Contract freeze

- The public `@moonlander/sim` contract from T-0003 stays frozen: `Action`,
  `ShipState`, `SimState`, `SimulationOptions`, `Simulation`, `Observation`,
  sensor types, and constants.
- The following internal signatures are frozen for the leaf tickets:
  - `physics.ts`: `rotate(vector: Vec2, angle: number): Vec2`,
    `ThrusterEffect`, `thrusterEffect(angle: number, action: Action):
    ThrusterEffect`.
  - `collision.ts`: `Capsule { start: Vec2; end: Vec2 }`,
    `capsuleEndpoints(position: Vec2, angle: number): Capsule`,
    `AdvanceResult { position: Vec2; velocity: Vec2; angle: number;
    maxImpactSpeed: number }`,
    `advanceWithCollisions(field: Field, initialPosition: Vec2,
    initialVelocity: Vec2, initialAngle: number, angularVelocity: number,
    dt: number): AdvanceResult`,
    `nearestWallDistance(field: Field, position: Vec2, angle: number): number`.
  - `sensor.ts`: `clampEyeSensorRadius(radius: number): number`,
    `scanEyeSensor(field: Field, origin: Vec2, heading: number, radius: number,
    tick: number): EyeSensorReading`.
  - `geometry.ts` and `constants.ts` from T-0003/T-0004 remain frozen.
- `simulation.ts` has exactly one writer, T-0013. Leaf tickets must not edit it.
  If a leaf needs a changed internal signature, stop and coordinate through the
  lead; T-0013 adapts the trunk.
- `render/index.ts` has exactly one writer, T-0015. It accepts an optional
  sensor-render hook so T-0016 can add `render/sensor.ts` without a second writer
  on `render/index.ts`.
- T-0015 owns the static `data-testid` hooks in `index.html`; T-0016 only wires
  the sensor-console behavior.
- `packages/sim/test/helpers.ts` is owned by T-0013. Leaf tickets use local
  helpers or request a change through the lead.
- Run `npm.cmd run typecheck` before wave 1.

### Test matrix

| Area | Ticket | Required coverage |
| --- | --- | --- |
| Physics module | T-0005 | Constants, thruster forces and torque, rear booster, drag helper/order, pure determinism. |
| Collision module | T-0006 | Capsule versus wall, swept/substepped impact, penetration push-out, restitution, impact speed, no tunneling, corner/seam. |
| Sensor module | T-0007 | 360 eye rays, rim origin, radius inputs, hit/no-hit distances, finite values. Direction, distance, and velocity are integrated by T-0013. |
| Simulation integration | T-0013 | 120 steps equal one second, gravity 1.62 m/s², reset, action handling, drag order, lateral >= 2.0 m/s², climb >= 12 m/s², angular >= 0.5 rad/s², 90 degree turn <= 2.7 s, release >= 25% after one second, terminal <= 5 m/s, damage formula/threshold, one damage event per tick, multiple contacts, invulnerability, hull clamp, destruction freeze, scan cadence and radius persistence, direction/distance/velocity, observation suite/state, deterministic sequence. |
| Autopilot controller | T-0008 | Deterministic actions, full observation use, all three thrusters, centerline following, low-clearance rear cut. |
| Autopilot benchmark | T-0014 | Fixed seeds, 60 seconds, progress, median progress, average world-x speed, hull 100, zero contact, reduced 20 m radius safety. |
| Game pure modules | T-0015 | Camera integration read-only, input, HUD formatting, seed helpers, static instructions text (Q/W/Space/E/R and staying inside the tunnel), layout, DPR, render-only state access. |
| Sensor console | T-0016 | Console values, radius slider, chart, scan tick, direction needle, distance and velocity blocks, world-aligned radar overlay. |
| Game wiring | T-0009 | Q/W/Space/E/R, rear latch reset, autopilot ownership, restart, destroyed overlay, hooks. |
| E2E coverage | T-0010 | Every documented hook and flow, instructions text (Q/W/Space/E/R and staying inside the tunnel), no uncaught or console errors, no flaky timing, local Playwright green. |
| CI, Pages, live | T-0017 | CI runs typecheck, unit tests, `sim:demo`, local Playwright, and build; Pages deploys `dist`; live suite command and delivery stop-on-failure. |
| Docs and live | T-0011 | Spec, autonomy, and README reconciled; stale benchmark/staging references removed; live suite passes. |
| Final parity | T-0012 | Full verify, `sim:demo`, live suite, spec parity, backup branch and history intact, rebuild report. |

### Acceptance crosswalk

| Original ticket | Original criterion or edge case | New ticket(s) |
| --- | --- | --- |
| T-0005 | AC1-2, AC5; both thrusters together, rear plus bottom thrusters, release from 20 m/s, free fall/terminal speed | T-0005 |
| T-0005 | AC3 drag/response thresholds, AC4 deterministic state sequence | T-0005, T-0013 |
| T-0005 | Reset during flight | T-0013 |
| T-0006 | AC1; corner/seam, high-speed steep wall | T-0006 |
| T-0006 | AC2 bounce and impact speed versus damage application | T-0006, T-0013 |
| T-0006 | AC3 one damage event, AC4 hull clamp/freeze, repeated contact during invulnerability, hull exactly 0, reset during/after destruction | T-0013 |
| T-0006 | AC5 | T-0006, T-0013 |
| T-0007 | AC2 eye rays; ray at endpoint/parallel, ship touching wall, radius 20/200 | T-0007 |
| T-0007 | AC1 observation suite/state exposure, AC3 cadence and radius persistence | T-0013 |
| T-0007 | AC4 direction, distance, velocity | T-0013 |
| T-0007 | AC5 console, radar overlay, responsive console overlap, hooks | T-0016, T-0010 |
| T-0007 | AC6 | T-0007, T-0013, T-0016 |
| T-0007 | Reset while radius change is pending, destroyed ship and first-second data | T-0013 |
| T-0008 | AC1-2; near-vertical climbs/dives, minimum-width sections, sharp width changes, reset and repeated same-seed runs, destroyed state and autopilot off | T-0008 |
| T-0008 | AC2 game autopilot ownership | T-0009 |
| T-0008 | AC3-5 benchmark, hull 100, reduced 20 m radius | T-0014 |
| T-0008 | AC6 | T-0008, T-0014 |
| T-0009 | AC1-3, AC5; seed focus/Enter, R, blur/page hide, manual input, resize before first render, narrow viewport | T-0015, T-0009, T-0010 |
| T-0009 | AC4 responsive layout and DPR | T-0015, T-0010 |
| T-0009 | AC6 | T-0015, T-0009 |
| T-0010 | AC1-5; R, seed focus/Enter, slider drag then next scan, autopilot plus manual, narrow viewport, canvas resize/DPR | T-0010 |
| T-0011 | AC1-4; Pages propagation delay, PR without deploy, live timeout, docs references to removed behavior, missing/stale npm scripts, no force-push | T-0017 |
| T-0011 | AC5-6 docs, full verify, live suite | T-0011 |
| T-0012 | AC1-5; Pages delay, live flake, stale spec references, backup branch and history intact | T-0012 |

## Non-goals

- No gameplay, physics, balance, control, HUD, or rendering behavior change.
- No public simulation API change.
- No separate parallelization agent.
- No background-runner or worktree changes in this brief.
- No weakening of any existing test.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Ownership | Lead-owned parallelization | Planning is inseparable from scope, dependency, integration, and verify ownership. |
| Separate agent | No | Duplicates lead context and adds a coordination hop; the planner script handles mechanical checks. |
| In-session cap | Two implementation tickets | Balances wall-clock gain against shared-worktree and merge risk. |
| Tooling | `tickets:plan` plus skill and templates | Deterministic checks with lead judgment. |
| Current queue | Re-decompose | Current tickets share `simulation.ts`, `render`, and `game/test`, so the queue is effectively serial. |
| Split pattern | Leaf/trunk | Parallel pure modules, then one serialized simulation integration. |
| E2E split | One ticket after wiring | A red authoring ticket cannot pass verify or delivery; local Playwright runs after the shell is integrated. |
| CI timing | After game wiring | CI, Pages, and live checks run against a playable build. |

## Acceptance criteria

1. Every acceptance criterion and named edge case in T-0005 through T-0012 maps
   to a ticket in the crosswalk; no coverage is dropped.
2. No two tickets in a wave share a scope. `simulation.ts` and `helpers.ts` have
   one writer (T-0013), `render/index.ts`, `index.html`, and `packages/game/test`
   have one writer (T-0015), `autopilot.test.ts` has one writer (T-0008),
   `radar.ts` belongs to T-0016, `e2e` and `playwright.config.ts` have one writer
   at a time (T-0010), `.github`/`scripts`/`package.json` belong to T-0017,
   public docs belong to T-0011, and queue/change/`AGENTS.md` docs belong to
   T-0012.
3. After re-scoping, `npm.cmd run tickets:plan -- --max-parallel 2` reports the
   proposed eight waves with no conflicts and no unscheduled tickets.
4. The public sim API and the frozen internal leaf signatures are unchanged;
   fixed-step, seeded determinism, the DOM-free boundary, and finite observations
   are preserved.
5. Each re-scoped ticket contains a completed, non-empty `## Parallelization
   plan` before it is moved to `ready` or executed; `tickets:plan` rejects a
   heading with only blank template fields.
6. Tests are written alongside implementation; no valid test is weakened,
   skipped, or deleted.
7. `npm.cmd run verify` passes after each wave; `sim:demo` and the live suite pass
   in T-0011/T-0012.
8. Delivery remains serialized through `release-engineer`, and the process/
   tooling change is delivered before wave 1.

## Edge cases

- Contract drift discovered during a leaf ticket.
- A leaf needs a new export or signature from `simulation.ts`.
- A ready ticket overlaps an in-progress or review ticket.
- A ready ticket is missing the `## Parallelization plan` section.
- A contract ticket must be serialized ahead of other work.
- A wave ticket blocks; do not start the next wave with a shared-file conflict.
- Autopilot controller and benchmark tests accidentally share a test file.
- `render/index.ts` needs the sensor hook before T-0016 exists.
- `index.html` sensor hooks are owned by T-0015, not T-0016.
- CI changes land before the integrated game is deployable.
- Intermediate sim-only waves are not live-deployable; record any `--no-live`
  approval explicitly.
- Existing uncommitted agent and permission changes must not be mixed into
  ticket commits.

## Affected interfaces

- Process docs: `AGENTS.md`, `.opencode/agent/lead.md`, `.opencode/skills/**`,
  `.opencode/command/ticket.md`.
- Templates and docs: `docs/tickets/TEMPLATE.md`, `docs/changes/TEMPLATE.md`,
  `docs/tickets/README.md`, `README.md`.
- Tooling: `scripts/lib/plan.mjs`, `scripts/tickets.mjs`,
  `scripts/test/plan.test.mjs`, `package.json`.
- Queue: T-0005 through T-0012 edited; T-0013 through T-0017 created.
- No game code in this brief; the tickets implement the existing spec.
- Pre-existing uncommitted changes to the other agent files and `opencode.json`
  are out of scope and must be delivered separately or explicitly included by
  the user.

## Parallelization plan

- Candidate split: leaf/trunk for simulation; pure modules versus wiring for the
  game; local e2e after wiring; CI, Pages, and live checks after wiring.
- Disjoint scopes: see the re-decomposed ticket table and wave plan.
- Shared files and integration points: `simulation.ts` and `helpers.ts` (T-0013),
  `render/index.ts` and `packages/game/test` (T-0015), `autopilot.test.ts`
  (T-0008), `e2e` and `playwright.config.ts` (T-0010), `.github`/`scripts`/
  `package.json` (T-0017), and `README.md`/`docs/spec.md`/`docs/autonomy.md`
  (T-0011).
- Wave order: see the wave plan.
- Verification order: focused tests per ticket, then `npm.cmd run verify` after
  each wave. Browser suites, `npm.cmd run verify`, delivery, and live
  verification are serialized.
- Why no separate agent: the lead owns planning and integration; the planner
  script handles dependency and scope checks deterministically.

## Determinism and boundary impact

- No simulation behavior change in this brief.
- Pure module rebuilds and the integration ticket must preserve fixed-step,
  seeded determinism, the DOM-free simulation boundary, and finite observations.
- Rendering reads simulation state only and never mutates it.
- No public API change.

## Verification plan

> The wave execution and live cadence in this section are superseded by
> [`2026-10-20-faster-development-cycle.md`](2026-10-20-faster-development-cycle.md);
> the ticket decomposition remains authoritative.

1. Run `npm.cmd test`, including the planner tests.
2. Run `npm.cmd run tickets:plan -- --max-parallel 2` on the current queue and
   confirm that missing parallelization plans are reported before re-scoping.
3. Deliver the process, tooling, templates, and this brief through
   `release-engineer` before wave 1. Intermediate sim-only deliveries may use
   `--no-live` only with explicit lead approval because the rebuilt game is not
   yet deployable.
4. After confirmation, re-scope T-0005 through T-0012, create T-0013 through
   T-0017, add the `Parallelization plan` section to every ticket, and run
   `tickets:plan` again. Confirm the eight waves with no conflicts.
5. Execute waves 1 through 8; after each wave, dispatch `reviewer` and run
   `npm.cmd run verify`.
6. Deliver each wave through `release-engineer`, serialized. Run local Playwright
   at T-0010; run the live suite in T-0011 and T-0012.
7. Final `npm.cmd run sim:demo`, full `verify`, live suite, spec parity, and
   rebuild report in T-0012.

## Open questions

None.

## Delivery waiver

None. If an intermediate wave uses `--no-live`, record the exact approval here.

## Confirmation

Confirmed by the user on 2026-10-20. The queue may be re-scoped and executed in
the eight waves above.
