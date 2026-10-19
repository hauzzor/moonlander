# Atmospheric Tunnel, Aggressive Thrusters, and Drag

## Change tier

Tier 3 — changes physics, field generation, collision, scoring, observation
shape, rendering, and tests across both packages.

## Original request

> make the thrusters more aggressive And also add more drag like in an
> atmosphere. so movement impulses are damped. the Starship should feel more
> reactive to inputs. also change the environment so there are no free
> obstacles But instead the ship travels along a curved tunnel that follows a
> somewhat horizontal path right wards.

## Goal

Replace the open free-obstacle field with a deterministic, enclosed, mostly
horizontal tunnel that winds rightward. Make the Q/W thrusters much more
aggressive and add atmospheric linear and angular drag so the ship responds
quickly and settles quickly. Keep manual Q/W flight, hull damage, bounce,
invulnerability, destruction, seeded runs, and the current HUD/seed controls.

## Current behavior

- Infinite open field of independently generated chunks with curved walls and
  free-standing scoring gates (`packages/sim/src/field.ts`).
- No drag or atmosphere; velocity and angular velocity grow while thrust is
  held (`packages/sim/src/simulation.ts`).
- 700 N thrusters, 200 kg mass, 43,800 kg·m² inertia, 15° cant (`constants.ts`).
- Infinite ground plane; hull damage/bounce/invulnerability; gate passes and
  gate bonuses; progress is farthest Euclidean distance (`docs/spec.md`).
- Follow camera, star field, ground, walls, gates, Starship, HUD (`packages/game`).
- Tests pin the open field, gate scoring, no-drag physics, and current
  observation shape.

## Desired behavior

### Physics and feel

- Full replacement; manual Q/W flight with no auto-forward.
- Gravity remains `1.62 m/s²`.
- Ship geometry, mass, inertia, 15° cant, and mounts remain unchanged.
- Thruster force increases to `1800 N` (about 2.5×).
- Linear drag `0.35 s⁻¹`; angular drag `0.25 s⁻¹`; drag applies after
  thrust/gravity/torque and before position integration.
- Q/W remain continuous while held.
- Target response:
  - single-thruster lateral acceleration ≥ `2.0 m/s²`;
  - both-thruster net climb ≥ `12 m/s²`;
  - angular acceleration ≥ `0.5 rad/s²`;
  - 90° turn from rest ≤ `2.7 s`;
  - release from 20 m/s loses ≥25% speed after one second;
  - free-fall terminal speed ≤ `5 m/s`;
  - no control latency beyond one tick.

### Tunnel

- Enclosed floor and ceiling; no open sky, no free walls, no gates, rocks, or
  moving hazards.
- Constant total width `68 m` (`TUNNEL_HALF_WIDTH = 34`).
- Centerline starts at `y = 60`, straight for the first `120 m`, then follows a
  seeded, continuous sum-of-sines path.
- Bend amplitude ≤ `24 m`; absolute slope ≤ `0.35`; wavelength ≥ `240 m`.
- Wall samples every `8 m`; top and bottom walls derived from the centerline.
- Endless in both directions; negative x is valid; no difficulty ramp.
- Same seed produces the same tunnel; different seeds produce different bends.
- No infinite ground; tunnel floor and ceiling are the collision surfaces.
- Ship starts at `(0, 60)`, angle `0`, velocity `0`.

### Progress and score

- `progress = max(0, maxX - spawnX)`.
- `score = floor(progress)`.
- Remove `gatesPassed`, gate bonuses, gate types/constants, gate collision, and
  gate observations.
- HUD keeps hull, speed, progress, and score; progress and score both represent
  forward distance.
- Instructions change from threading gates to staying inside the tunnel.

### Collision and failure

- Keep hull `100`, bounce restitution `0.35`, damage threshold/formula,
  invulnerability `0.75 s`, and destruction freeze.
- Tunnel floor/ceiling contacts bounce and damage.
- Swept/substepped collision prevents tunneling at high speed.

### Presentation

- Follow camera with rightward look-ahead; no camera rotation.
- Subtle speed-based zoom and atmosphere cues: speed streaks/dust, tunnel haze,
  structural ribs.
- Remove star field, ground, free walls, and gates from the playable view.
- Preserve all test hooks: canvas, HUD values, thrusters, seed controls,
  instructions, outcome.

## Non-goals

- Auto-forward cruise, new controls, boost/brake, or touch controls.
- Multiple modes or keeping the open field.
- Gates, free obstacles, moving hazards, difficulty ramps, or checkpoints.
- Changing ship geometry, mass, inertia, cant, or mounts.
- Changing gravity, fixed timestep, determinism, or the headless boundary.
- Session-metrics automation.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Scope | Full replacement, manual Q/W flight | User confirmed; preserves the current control identity |
| Tunnel | Enclosed medium tunnel, ~68 m wide, gentle bends, straight start | User confirmed; readable and manageable |
| Progress/score | Rightward distance only; no gates | User confirmed; aligns with the rightward course |
| Feel | Aggressive thrusters + medium linear/angular drag | User confirmed; quick response and settling |
| Collisions | Keep hull, bounce, invulnerability, destruction | User confirmed; current failure loop retained |
| Presentation | Follow camera + subtle atmosphere cues, slight speed zoom | User confirmed; communicates drag and speed |
| Gravity | Keep 1.62 m/s² | Not part of the request |
| Difficulty | Constant width and bend intensity | Not part of the request |
| Seed | Keep unsigned 32-bit seeds, R, and seed input | Existing contract remains useful |
| API | Clean break; remove gates/ground, add tunnel metadata and observations | Required by the new course |

## Contract freeze

### Public types

```ts
interface Tunnel {
  halfWidth: number;
  centerAt(x: number): Vec2;
  headingAt(x: number): number;
}

interface Field {
  seed: number;
  chunkSize: number;
  tunnel: Tunnel;
  getChunk(cx: number, cy: number): FieldChunk;
  chunksInView(center: Vec2, radius: number): readonly FieldChunk[];
}

interface FieldChunk {
  coord: Vec2;
  walls: readonly CurvedWall[];
}

interface SimState {
  tick: number;
  time: number;
  seed: number;
  ship: ShipState;
  hull: number;
  invulnerable: boolean;
  thrusters: Action;
  outcome: RunOutcome;
  score: number;
  progress: number;
}

interface Observation {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  hull: number;
  progress: number;
  score: number;
  nearestWallDistance: number;
  tunnelCenterOffset: number;
  tunnelHalfWidth: number;
  tunnelHeading: number;
  forwardSpeed: number;
  lateralSpeed: number;
}
```

Remove `Gate`, `gatesPassed`, `nearestGateDistance`, `nearestGateAngle`, and
ground-related public fields.

### Constants

- Keep: `FIXED_DT`, `GRAVITY`, `SHIP_*`, `THRUSTER_CANT`, `LEFT_MOUNT`,
  `RIGHT_MOUNT`, `WALL_RADIUS`, `DAMAGE_*`, `INVULNERABILITY_SECONDS`,
  `BOUNCE_RESTITUTION`, `SENSOR_RANGE`, `START_POSITION`, `DEFAULT_SEED`.
- Change: `THRUSTER_FORCE = 1800`.
- Add: `LINEAR_DRAG = 0.35`, `ANGULAR_DRAG = 0.25`, `TUNNEL_HALF_WIDTH = 34`,
  `TUNNEL_CENTER_Y = 60`, `TUNNEL_START_STRAIGHT = 120`,
  `TUNNEL_BEND_AMPLITUDE = 24`, `TUNNEL_MAX_SLOPE = 0.35`,
  `TUNNEL_SAMPLE_STEP = 8`, `FIELD_CHUNK_SIZE = 80`.
- Remove: `GROUND_Y`, `SAFE_SPAWN_RADIUS`, all `GATE_*` constants,
  `GATE_BONUS`.

### Stubs and red expectation

- Replace the old field/collision/simulation with compiling stubs that throw
  `not implemented`.
- Freeze the new types and constants in `packages/sim/src/types.ts`,
  `constants.ts`, and `index.ts`.
- `npm.cmd run typecheck:sim` must pass after the test rewrite and before
  implementation.
- Red tests must fail for missing behavior, not missing exports.

## Test matrix

| Area | Unit tests | E2E tests | Determinism / edge cases | Owner |
| --- | --- | --- | --- | --- |
| Tunnel generation | Same seed identical; different seed differs; width/samples/bounds | Tunnel visible on canvas | Cross-chunk seams; negative x; straight start; slope limit | test-engineer |
| Drag | Linear decay; terminal speeds; angular decay | Speed settles after release | Fixed-step determinism; extreme injected velocity | test-engineer |
| Response | Lateral/climb/angular thresholds; 90° turn target | Q/W produces visible movement | One-tick latency; release behavior | test-engineer |
| Collision | Floor/ceiling bounce; high-speed no tunneling; damage; invulnerability; destruction | Hull changes and outcome | Corners; repeated contacts; reset | test-engineer |
| Progress/score | Forward distance only; monotonic; no gates | HUD values; input-driven progress; reset | Backward flight; negative x; reset | test-engineer |
| Observation | New tunnel fields; no gate fields; finite | — | No wall/no tunnel sentinels | test-engineer |
| HUD/seed/controls | Seed/camera helpers unchanged | HUD, Q/W, R, seed load, instructions, canvas | Reset during flight | test-engineer |
| Headless demo | Controller uses tunnel fields; finite telemetry | — | Deterministic run | lead/sim-engineer |

## Acceptance criteria

1. No free walls, gates, or ground remain in the playable tunnel.
2. The tunnel is enclosed, continuous, mostly horizontal, and deterministic
   from the seed.
3. Q/W thrusters are significantly more aggressive; drag damps velocity and
   angular velocity to the target metrics.
4. Manual flight can progress right; no auto-forward.
5. Progress and score are forward-distance only and monotonic.
6. Hull damage, bounce, invulnerability, and destruction work against tunnel
   walls.
7. Camera, HUD, seed controls, and instructions reflect the tunnel.
8. Typecheck, unit tests, e2e, build, live asset check, and live suite pass.
9. `packages/sim` remains DOM-free and deterministic.

## Edge cases

- Chunk seams and duplicate wall segments.
- Negative x and backward flight.
- Tunnel start straight section.
- Slope and bend limits.
- High-speed wall tunneling.
- Repeated wall contact during invulnerability.
- Hull reaching zero.
- Release from high speed under drag.
- Reset/seed load while moving.
- Small/large delta times in the game loop.
- Speed zoom and atmospheric effects at high speed.
- No free obstacles in generated chunks outside the tunnel.

## Affected interfaces

- `packages/sim/src/types.ts`, `constants.ts`, `index.ts`, `field.ts`,
  `collision.ts`, `simulation.ts`, `physics.ts`.
- `packages/sim/test` and `packages/game/test`.
- `packages/game/src/render`, `camera.ts`, `hud.ts`, `game.ts` and
  `packages/game/index.html` instructions.
- `e2e`.
- `docs/spec.md`, `docs/autonomy.md`, `README.md`, `AGENTS.md` product summary.
- `packages/sim/examples/headless-demo.ts`.

## Determinism and boundary impact

- Keep `FIXED_DT = 1/120`; no wall-clock or `Math.random` in `packages/sim`.
- Tunnel generation must be deterministic from seed and x, including negative x.
- Drag and collision ordering must be stable and documented.
- Rendering reads simulation/field state only.
- The API break is intentional; no gate/ground compatibility aliases.

## Verification plan

1. Write this brief and rewrite `docs/spec.md`.
2. Freeze types/constants and add compiling stubs.
3. Test engineer writes failing sim/e2e tests and proves red.
4. Sim engineer implements tunnel, drag, collision, scoring, observation, demo.
5. Gameplay engineer implements tunnel rendering, atmosphere, HUD/instructions.
6. Code reviewer checks behavior, determinism, boundary, and TDD evidence.
7. Lead runs `npm.cmd run verify`.
8. Deliver with `npm.cmd run deliver -- --message "feat: add atmospheric tunnel course"` and run the live suite.

## Open questions

None.

## Delivery waiver

None.

## Confirmation

Confirmed by the user on 2026-10-19.
