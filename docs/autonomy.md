# Headless Simulation and Autonomous Control

The simulation package is intentionally separated from the browser game so it
can run in Node for controller training, evaluation, and replay.

## Boundary

`@moonlander/sim` contains only pure TypeScript:

- no DOM library or browser globals
- no dependencies on `packages/game`
- no `Math.random`
- fixed timestep and seeded tunnel generation

`packages/sim/tsconfig.json` omits the DOM library, so browser coupling is a
compile error. Unit tests run in Node.

## Simulation API

```ts
import { createAutopilot, createSimulation } from "@moonlander/sim";

const controller = createAutopilot();
const simulation = createSimulation({ seed: 1234 });
let state = simulation.getState();

while (state.outcome === "flying") {
  const observation = simulation.getObservation();
  state = simulation.step(controller.act(observation));
}
```

Manual controllers return `{ left, right, rear }`. Controller inputs include
the full observation, including the eye, direction, distance-to-start, and
velocity sensors. The reference autopilot is deterministic and safety-first;
it maximizes progress and speed within its empirical zero-contact benchmark.

`step` advances exactly one fixed tick (`FIXED_DT = 1 / 120`). The same seed,
initial state, scale schedule, and action sequence produce the same state
sequence and the same tunnel.

Gravity and thrust are configurable multipliers in `0.1..10`, default `1`:

```ts
const simulation = createSimulation({
  seed: 1234,
  gravityScale: 1,
  bottomThrusterScale: 1,
  rearThrusterScale: 1,
});
simulation.setGravityScale(2);
simulation.setBottomThrusterScale(0.5);
simulation.setRearThrusterScale(2);
```

`SimState` and `Observation` expose the scales and effective `gravity`. The
setters clamp finite values and apply from the next tick; reset preserves the
scales. The autopilot uses the observed effective gravity and thrust scales.
The default 8-seed benchmark is defined at scale `1`.

Time scale is a game-loop setting, not a simulation option. Headless callers
run more or fewer `step` calls; `FIXED_DT` never changes.

## Observation

| Field | Meaning |
| --- | --- |
| `x` | Starship center x position in meters |
| `y` | Starship center y position in meters |
| `vx` | World horizontal velocity in m/s |
| `vy` | World vertical velocity in m/s |
| `angle` | Tilt in radians, positive counter-clockwise |
| `angularVelocity` | Angular velocity in rad/s |
| `hull` | Remaining hull, `0..100` |
| `progress` | Maximum forward x-distance from spawn in meters |
| `score` | `floor(progress)` |
| `nearestWallDistance` | Hull-surface distance to the nearest tunnel wall, capped at `WALL_SENSOR_RANGE`; may be negative during penetration |
| `tunnelCenterOffset` | Signed perpendicular offset from the local tunnel centerline, positive along the local normal and consistent with `lateralSpeed` |
| `tunnelHalfWidth` | Local perpendicular half-width in meters |
| `tunnelHeading` | Centerline tangent angle in radians |
| `forwardSpeed` | Velocity projected onto the tunnel tangent |
| `lateralSpeed` | Velocity projected onto the tunnel normal |
| `eyeSensorRadius` | Configured eye view radius in meters |
| `gravityScale` | Gravity multiplier in `0.1..10` |
| `gravity` | Effective gravity in m/s² (`GRAVITY * gravityScale`) |
| `bottomThrusterScale` | Bottom thruster force/torque multiplier in `0.1..10` |
| `rearThrusterScale` | Rear thruster force multiplier in `0.1..10` |
| `sensors` | Four-block sensor suite: eye, direction, distance-to-start, velocity |

All values are finite. The Starship collision capsule has radius 9 m and
half-length 15 m. The tunnel varies between 50 and 110 m total width, bends
near-vertically (up to 85 degrees), and has no ground plane or gates.

### Ship sensors

The `sensors` suite contains:

- `eye` — `EyeSensorReading` with `radius`, `tick`, `origin` (ship center at
  scan), `heading` (ship angle at scan), and 360 `distances`.
  - Rays use absolute world angles: index `i` is world angle `i°`, `0°` right,
    counter-clockwise.
  - Each ray starts at the ship hull rim and stores the distance from that rim
    toward the wall. The wall distance subtracts `WALL_RADIUS` from the
    centerline hit along the ray (exact for perpendicular hits, approximate at
    oblique angles). No hit stores the view radius. Use `nearestWallDistance`
    for immediate hull-surface safety.
  - Scans occur at tick 0 and every second. `eyeSensorRadius` defaults to 120 m,
    is bounded to `20..200 m`, and `setEyeSensorRadius` applies at the next
    scan. The configured radius persists across reset.
- `direction.angle` — ship angle to the world horizon, normalized to `-π..π`.
- `distanceToStart` — Euclidean distance from the spawn position in meters.
- `velocity` — world `vx`, `vy`, `speed`, and velocity direction.

`createAutopilot()` is a deterministic controller that uses this full
observation. It exclusively controls all three thrusters while enabled, is
toggled by E in the game, and targets zero wall contact over its empirical
benchmark.

The benchmark runs 60 seconds on the fixed seeds
`1, 7, 42, 1234, 2026, 5678, 99991, 314159` and requires `nearestWallDistance >
0` every tick, hull `100`, progress at least `200 m` per seed, median progress
at least `300 m`, and average world-x speed at least `4 m/s`.

## Model lifecycle

- `createSimulation({ seed, hull?, start?, field?, eyeSensorRadius?,
  gravityScale?, bottomThrusterScale?, rearThrusterScale? })` creates a run.
- The default seed is `1`; seeds are unsigned 32-bit integers.
- `reset(seed?)` restores the configured start and hull. Without a pinned
  field, it regenerates the tunnel when a seed is provided and reuses the
  current seed otherwise. The configured eye radius and gravity/thruster scales
  persist.
- `setEyeSensorRadius(radius)` clamps the configured eye view radius. The next
  scheduled scan uses it; the previous reading remains until then.
- `SimulationOptions.field` pins a field for the simulation lifetime. It is
  useful for deterministic tests and custom tunnels; `reset` keeps it.
- `simulation.field` exposes deterministic chunks, the tunnel centerline, and
  wall segments for rendering and analysis.
- `simulation.getState()` exposes tick, time, seed, ship state, hull,
  invulnerability, thrusters, outcome, score, and progress.
- `controller.reset?.()` is available for stateful controllers.

## Field

- The field is an endless tunnel sampled in 80 m chunks.
- The centerline is straight at `y = 60` for the first 120 m, then follows a
  seeded, x-monotonic, near-vertical curve (up to 85 degrees) that stays within
  150 m of `y = 60`.
- The local corridor width varies perpendicular to the centerline between 50 and
  110 m total. `field.tunnel.halfWidthAt(x)` returns the local half-width.
- Top and bottom walls are normal-offset from the centerline and adaptively
  sampled to a maximum 8 m chord length on steep sections.
- `field.tunnel.centerAt(x)` and `headingAt(x)` expose the centerline.
- `field.getChunk(cx, cy)` is deterministic for a given seed and coordinates,
  including negative coordinates.
- `field.chunksInView(center, radius)` returns intersecting chunks sorted by
  chunk y and x.
- The tunnel floor and ceiling are solid. There are no gates, free walls, rocks,
  or ground plane.

## Reference headless run

```powershell
npm.cmd run sim:demo
```

This runs the deterministic autopilot in Node. It prints finite telemetry every
five seconds, including eye scan data, direction, distance to start, velocity,
minimum wall clearance, and forward speed. It prints the final outcome, seed,
progress, and score. It also runs the 8-seed, 60-second benchmark and the
reduced 20 m eye-radius check and prints PASS/FAIL for each. It is a baseline for
the controller interface, not a training implementation.

## Training loop shape

A training harness can own the loop and use the simulation as a pure transition
function:

```ts
const sim = createSimulation({ seed });
let state = sim.getState();

while (state.outcome === "flying") {
  const observation = sim.getObservation();
  const action = policy(observation);
  state = sim.step(action);
  record(observation, action, state);
}
```

Rewards and termination can be derived from progress, forward speed, centerline
offset, hull remaining, impact damage, eye clearances, navigation sensors, and
the final score. No renderer or browser is required.
