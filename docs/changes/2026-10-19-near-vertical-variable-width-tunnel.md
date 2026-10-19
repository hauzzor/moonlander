# Near-Vertical Variable-Width Tunnel

## Change tier

- [ ] Tier 1
- [ ] Tier 2
- [x] Tier 3 — terrain, physics-adjacent geometry, public simulation API,
  autopilot behavior, simulation/game coordination, and tests.

## Original request

"add more height changes to the tunnel. it should go vertically sometimes even"

Confirmed intake choices:

- Near-vertical but still rightward: 80-85° climbs and dives, no true 90°
  sections and no backtracking.
- Variable corridor width, measured perpendicular to the tunnel direction.
- Local total width range 50-110 m, with the first 120 m straight and 68 m wide.
- Dramatic vertical travel: about 100-150 m above and below `y = 60`, with
  several major climbs and dives per 1-2 km.
- Keep the autopilot, allow retuning, and keep x-based progress/score.
- Existing seeds may generate new layouts.
- After brief confirmation, create confirmed tickets for the ticket runner
  rather than implementing in the interactive session.

## Goal

Make the endless rightward tunnel dramatically more vertical and more varied
without turning it into a reversing path. The tunnel should sometimes climb or
dive at 80-85°, and the floor and ceiling should vary independently enough to
create visibly taller and shorter sections. The result must remain deterministic,
collidable, sensor-readable, autopilot-navigable, and rendered correctly.

## Current behavior

- `packages/sim/src/field.ts` generates `centerAt(x)` from a seeded sum of
  sines. The first 120 m is straight; after that the maximum centerline offset
  is 24 m and the maximum slope is 0.35.
- Walls are generated as vertical offsets
  `centerY(x) ± TUNNEL_HALF_WIDTH`, with constant total width 68 m.
- Wall samples are spaced by 8 m of x. The tunnel is assigned to 80 m chunks by
  wall-segment midpoint.
- `packages/sim/src/types.ts` exposes a constant `Tunnel.halfWidth` and only
  `centerAt(x)` / `headingAt(x)`.
- `packages/sim/src/simulation.ts` reports a constant `tunnelHalfWidth` and a
  vertical `tunnelCenterOffset`.
- `packages/sim/src/autopilot.ts` is tuned for mostly horizontal, gravity-down
  flight and uses the existing center offset and clearance thresholds.
- `packages/game/src/render/field.ts` samples the tunnel by x and draws a
  constant-width corridor.
- `packages/sim/test/field.test.ts` freezes the old 24 m / 0.35 / constant-width
  contract. The autopilot benchmark requires 400 m progress per seed, median
  500 m, and average forward speed 8 m/s.

## Desired behavior

### Tunnel path

- The tunnel remains a single-valued, rightward, x-monotonic centerline
  `y = f(x)`. It never reaches exactly 90° and never doubles back.
- `x <= TUNNEL_START_STRAIGHT = 120` is straight at `y = TUNNEL_CENTER_Y = 60`,
  with total width 68 m, including negative x.
- After the straight, the seeded centerline reaches near-vertical slopes:
  at least one sampled section with `|slope| >= tan(80°)` in every 1,000 m of
  x after the straight, and no slope greater than `tan(85°)` anywhere.
- The centerline stays within `TUNNEL_BEND_AMPLITUDE = 150 m` of `y = 60`.
  Across the first 2,000 m after the straight, it must reach at least
  `+100 m` and at least `-100 m` from `y = 60` for every benchmark seed.
- Each 2,000 m window after the straight contains at least three local maxima
  and three local minima of the centerline elevation, so variation is frequent,
  not one isolated hill.
- The generated wall surface must not self-intersect. Adjacent wall segments
  must share endpoints and remain within the chunk that owns their midpoint.

### Tunnel width

- The local corridor width is measured perpendicular to the local centerline.
  It varies smoothly and remains within 50-110 m total (25-55 m half-width).
- The first 120 m remains exactly 68 m wide.
- Every 2,000 m window after the straight must contain a local width at or below
  60 m and a local width at or above 90 m.
- The floor and ceiling vary independently through a seeded local center bias
  plus a seeded local width. The public centerline is the local midpoint of the
  floor and ceiling; the public half-width is half the perpendicular opening.
- No section may narrow below 50 m, and the generator must preserve enough
  clearance for the 18 m ship and its attitude.

### Geometry and rendering

- Walls use normal offsets from the centerline and local width, not fixed
  vertical offsets. A wall segment is sampled to a maximum world-space chord
  length of `TUNNEL_SAMPLE_STEP = 8 m`; the sample parameter may be smaller than
  8 m of x on near-vertical sections.
- Collision, the eye sensor, and nearest-wall sensing continue to consume wall
  segments and must handle the steeper, variable geometry. Damage, bounce,
  invulnerability, and outcome rules are unchanged.
- The game renderer draws the actual local center, width, and wall points. The
  camera continues to follow the ship in 2D and keep the tunnel readable.
- The opening 120 m remains a safe onboarding section.

### Observation and autopilot

- `Observation.tunnelHalfWidth` becomes the local perpendicular half-width.
- `Observation.tunnelCenterOffset` becomes the signed perpendicular offset from
  the local centerline, consistent with `lateralSpeed`; it is no longer a
  vertical offset.
- `Tunnel` gains `halfWidthAt(x): number`. `Tunnel.halfWidth` remains the
  nominal 34 m for compatibility, but is not the local width.
- The autopilot still receives the full observation, exclusively controls all
  three thrusters, and is retuned for steep and variable-width terrain.
- The autopilot benchmark is 8 fixed seeds, 60 seconds each, zero wall contact,
  hull 100, at least 200 m progress per seed, median progress at least 300 m,
  and average world-x speed at least 4 m/s.
- Progress and score remain x-based. Steep sections are expected to reduce x
  progress; the lower autopilot thresholds acknowledge that.

### Determinism and seeds

- Same seed produces the same tunnel, walls, collisions, and observations.
- Different seeds produce different terrain.
- No `Math.random`; the simulation remains DOM-free and deterministic.
- Existing seed layouts are intentionally not preserved.

## Non-goals

- True 90° vertical runs or x-non-monotonic/backtracking paths.
- Arc-length progress or score changes.
- Changing Q/W/Space/E controls, thruster forces, gravity, drag, damage, or
  outcome rules.
- New gates, obstacles, moving hazards, fuel, or difficulty ramp.
- Tunnel ceilings/floors that narrow below 50 m total width.
- Preserving old seed tunnel layouts.
- Rewriting the game loop or rendering architecture.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Geometry | Near-vertical rightward, 80-85° | Gives the requested vertical feel without a reversing path or station-based API. |
| Topology | x-monotonic, single-valued `y=f(x)` | Preserves `centerAt(x)`/`headingAt(x)`, x-progress, and collision/chunk assumptions. |
| Width | Variable, perpendicular, 50-110 m total | Keeps a real flyable cross-section at steep angles; visible wide/tight variation. |
| Width model | Independent floor/ceiling via local midpoint + half-width; 120 m start at 68 m | Varies both walls while keeping one coherent navigation centerline. |
| Vertical range | Up to 150 m from `y=60`; reaches at least ±100 m within 2 km | Dramatic but bounded. |
| Vertical frequency | At least three local maxima and three local minima per 2 km; 80° section per 1 km | Matches "several" and "vertically sometimes". |
| Straight start | 120 m at y=60 and 68 m width | Keeps onboarding and safe spawn. |
| Progress/score | x-based, unchanged | User chose to retain the current model. |
| Autopilot | Keep, retune; 8 seeds, 60 s, zero contact, progress 200/median 300, average x-speed 4 m/s | Preserves autonomy as a first-class feature while accepting steeper terrain. |
| Seeds | Regenerate all layouts | New generator changes all seeded courses; old compatibility is out of scope. |
| Execution | Create confirmed contract + implementation tickets | User selected the durable queue workflow instead of in-session implementation. |

## Contract freeze

- Public types, constants, and exports:
  - Add `Tunnel.halfWidthAt(x: number): number`; keep `Tunnel.halfWidth` as the
    nominal 34 m.
  - Change the semantics of `Observation.tunnelHalfWidth` to the local
    perpendicular half-width.
  - Change `Observation.tunnelCenterOffset` to the signed perpendicular offset.
  - Keep `TUNNEL_HALF_WIDTH = 34` as the nominal half-width.
  - Add `TUNNEL_MIN_HALF_WIDTH = 25` and `TUNNEL_MAX_HALF_WIDTH = 55`.
  - Change `TUNNEL_BEND_AMPLITUDE` to 150.
  - Add `TUNNEL_MAX_CLIMB_ANGLE = 85°` and set
    `TUNNEL_MAX_SLOPE = tan(TUNNEL_MAX_CLIMB_ANGLE)`.
  - Keep `TUNNEL_START_STRAIGHT = 120`, `TUNNEL_CENTER_Y = 60`.
  - Redefine `TUNNEL_SAMPLE_STEP = 8` as the maximum wall chord length.
  - Keep the public `Field`, `FieldChunk`, `CurvedWall`, `SimState`, and
    `Observation` object shapes except for the semantics above.
- New module or file boundaries: no new modules required. Extend
  `packages/sim/src/types.ts`, `constants.ts`, `field.ts`, `simulation.ts`,
  `autopilot.ts`, and `packages/game/src/render/field.ts`.
- Stub files created: the contract ticket changes types/constants/exports and
  makes `halfWidthAt` return `TUNNEL_HALF_WIDTH` with no new behavior. Existing
  field geometry remains unchanged until the implementation ticket.
- Typecheck command: `npm.cmd run typecheck`.
- Expected red-test failure reason: after the contract ticket, new field and
  autopilot tests fail because the generator still clamps to 24 m / 0.35,
  walls are still vertically offset at constant width, observation still uses a
  vertical offset and constant half-width, and the autopilot still assumes the
  old terrain. The failures must be missing behavior, not missing exports.

## Test matrix

| Area | Unit tests | E2E tests | Determinism / edge cases | Owner | Expected red reason |
| --- | --- | --- | --- | --- | --- |
| Straight start and seed layout | Field reaches 80°; max 85°; ±100 m; 3 maxima + 3 minima per 2 km; same seed identical; different seeds differ | — | Negative x; x=120 transition; 2 km windows; float bounds | test-engineer | Old generator never approaches 80° or ±100 m |
| Variable width | Width in 50-110; reaches ≤60 and ≥90 per 2 km; 68 m for x≤120; independent center/width variation | — | Width minima/maxima; no pinch below 50; chunk seams | test-engineer | Old walls are constant 68 m |
| Wall sampling and chunks | Max chord 8 m; shared endpoints; each segment owned once; normal-offset walls; no self-intersection | — | Steep 80-85° samples; negative x; chunk seams | test-engineer | Old 8 m x-sampling exceeds max chord on steep sections |
| Collision | Contacts on steep/variable walls; high-speed sweep does not tunnel; bounce/damage unchanged | — | High speed, minimum width, ceiling/floor labels at steep angles | test-engineer | Old collision tests only cover straight/sloped constant widths |
| Eye sensor | 360 finite rim distances; near steep walls; no wall returns radius | — | Steep and wide/tight walls; chunk boundaries | test-engineer | Old sensor cases use fixed-width straight/sloped fields |
| Observation | Local half-width; perpendicular center offset; heading; finite values; forward/lateral projection | — | Near-vertical tangent; min/max width; reset | test-engineer | Old observation reports constant half-width and vertical offset |
| Autopilot | 8 seeds × 60 s, zero contact, hull 100, progress ≥200 each, median ≥300, mean vx ≥4 | Autopilot still makes progress and can be toggled | Determinism; reset; near-vertical sections; min-width sections | test-engineer | Old controller and benchmark assume 0.35 slope and constant width |
| Rendering and camera | — | Fixed-seed page shows steep tunnel and varying width; canvas non-empty; controls/HUD unchanged | Camera follows through steep climbs; no render mutation | gameplay-engineer | Old renderer draws constant-width vertical-offset walls |
| Regression | Existing straight-start, collision, sensor, thruster, HUD, seed tests remain green | Existing 21 e2e tests remain green | Reset, destruction, seed load | test-engineer | New geometry breaks old assumptions |

## Acceptance criteria

1. For every fixed benchmark seed, the first 120 m is straight at `y=60` with
   68 m total width, including negative x.
2. After x=120, the centerline stays within 150 m of `y=60`, reaches at least
   `+100 m` and `-100 m` within the first 2,000 m, and contains at least three
   local maxima and three local minima per 2,000 m window.
3. The centerline reaches at least one section with `|slope| >= tan(80°)` per
   1,000 m and never exceeds `tan(85°)`.
4. Local perpendicular width stays within 50-110 m, reaches ≤60 m and ≥90 m per
   2,000 m window, and never narrows below 50 m.
5. Floor and ceiling vary independently through a seeded center bias and width;
   the public centerline is their local midpoint.
6. Wall segments have a maximum chord length of 8 m, share endpoints at chunk
   seams, and are assigned to exactly one chunk by midpoint.
7. The generated walls do not self-intersect and leave the ship able to fly the
   full corridor.
8. Collision remains swept, prevents tunneling at high speed, and preserves
   bounce, damage, invulnerability, and outcome behavior.
9. The eye sensor remains 360 finite rim distances and detects the steep,
   variable walls.
10. `Observation.tunnelHalfWidth` is local and `tunnelCenterOffset` is
    perpendicular; all observation values remain finite.
11. The autopilot meets the 8-seed benchmark: zero contact, hull 100, at least
    200 m progress per seed, median at least 300 m, average world-x speed at
    least 4 m/s.
12. The game renders the actual center, width, and walls; the camera follows the
    ship through steep and variable-width sections.
13. Controls, HUD, seed loading, sensors, rear thruster, autopilot toggle, and
    destruction behavior remain intact.
14. Same-seed determinism and different-seed variation hold; no `Math.random`
    enters `packages/sim`.
15. `npm.cmd run verify`, the live delivery, and the live Playwright suite pass.

## Edge cases

- Transition exactly at `x=120`; negative x remains straight.
- Maximum 85° slope, minimum 50 m width, maximum 150 m bend.
- Local width extrema and center-bias extrema at different x positions.
- Wall segments near 80-85° with normal offsets; chunk-boundary ownership.
- High-speed impact and swept collision on a near-vertical wall.
- Eye rays parallel to and perpendicular to steep walls.
- Ship at the minimum-width section with nonzero angle.
- Autopilot at a near-vertical climb, a sharp width change, and reset.
- Seed load/reset and repeated same-seed runs.
- Camera framing at the top and bottom of large climbs.
- Renderer and collision agreeing on the same wall geometry.

## Affected interfaces

- `packages/sim/src/types.ts`: `Tunnel.halfWidthAt`; observation semantics.
- `packages/sim/src/constants.ts`: new/changed tunnel constants.
- `packages/sim/src/index.ts`: exported constants.
- `packages/sim/src/field.ts`: generator, normal-offset walls, adaptive
  sampling, chunk ownership.
- `packages/sim/src/simulation.ts`: local half-width and perpendicular offset.
- `packages/sim/src/autopilot.ts`: retuned controller.
- `packages/sim/src/collision.ts` and `sensor.ts`: verify/adapt if geometry
  assumptions surface.
- `packages/game/src/render/field.ts` and camera: render actual walls and
  width.
- `packages/sim/test`, `packages/game/test`, `e2e`: new and updated tests.
- `docs/spec.md`: frozen tunnel, observation, and autopilot contract.
- Existing public constants and `Tunnel.halfWidth` semantics require an
  intentional documented API change.

## Determinism and boundary impact

- Fixed `1/120` s step and seeded generation remain unchanged.
- The generator must be a pure function of seed and x; no wall-clock,
  query-order-dependent caches, or `Math.random`.
- Adaptive sampling must be deterministic and independent of view order.
- Wall generation stays in `packages/sim`; no DOM APIs enter the simulation.
- Chunk order remains deterministic; `getChunk` remains stable per coordinate.
- The game renderer reads simulation/field state and never mutates it.

## Verification plan

- Write red simulation tests first for the new field, sampling, collision,
  sensor, observation, and autopilot behavior; prove them red for the old
  generator/controller.
- Implement the contract ticket, then the behavior ticket, with code review and
  TDD evidence in each ticket log.
- Run focused tests:
  `npm.cmd test -- packages/sim/test/field.test.ts`,
  `npm.cmd test -- packages/sim/test/autopilot.test.ts`, and the related
  collision/sensor/observation suites.
- Run `npm.cmd run verify` for typecheck, 100+ unit tests, 21 e2e tests, and the
  production build.
- Manually inspect a fixed seed in the browser at the opening straight, a
  80-85° climb, a minimum-width section, and a maximum-width section.
- Deliver each completed ticket through the ticket runner's merge queue,
  `npm.cmd run deliver`, live asset wait, and live Playwright suite.

## Ticket plan

Two confirmed, serialized tickets are created only after this brief is
confirmed:

1. **Contract ticket** — `docs/spec.md`, `packages/sim/src/types.ts`,
   `packages/sim/src/constants.ts`, `packages/sim/src/index.ts`, the
   no-behavior `halfWidthAt` stub in `packages/sim/src/field.ts`, and the
   constant assertions in `packages/sim/test/field.test.ts` and
   `packages/sim/test/simulation.test.ts`. Acceptance: typecheck, existing
   suite green, and no change to the generated wall geometry; the new limits
   are frozen but the old gentle generator remains until the next ticket.
2. **Terrain implementation ticket** — field generation, adaptive normal-offset
   walls, observation, autopilot, renderer, tests, and e2e. Depends on the
   contract ticket. Acceptance: this brief's criteria and full delivery.

The implementation ticket keeps the simulation and renderer changes together so
the delivered game never shows collision geometry that disagrees with the
rendered tunnel.

## Open questions

None.

## Delivery waiver

None.

## Confirmation

Confirmed by the user on 2026-10-19 via "Confirmed - create tickets". The
confirmed split is T-0001 (contract freeze) followed by T-0002 (terrain
implementation), which depends on T-0001.
