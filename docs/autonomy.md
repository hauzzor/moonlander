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
import { createSimulation, type Controller } from "@moonlander/sim";

const controller: Controller = {
  act(observation) {
    const belowCenter = observation.tunnelCenterOffset < -2;
    const aboveCenter = observation.tunnelCenterOffset > 2;

    return {
      left: belowCenter || observation.forwardSpeed < 6,
      right: aboveCenter || observation.hull < 50,
    };
  },
};

const simulation = createSimulation({ seed: 1234 });
let state = simulation.getState();

while (state.outcome === "flying") {
  const observation = simulation.getObservation();
  state = simulation.step(controller.act(observation));
}
```

`step` advances exactly one fixed tick (`FIXED_DT = 1 / 120`). The same seed,
initial state, and action sequence produce the same state sequence and the same
tunnel.

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
| `nearestWallDistance` | Hull-surface distance to the nearest tunnel wall, capped at `SENSOR_RANGE`; may be negative during penetration |
| `tunnelCenterOffset` | Signed vertical offset from the tunnel centerline, positive above |
| `tunnelHalfWidth` | Half the tunnel width in meters |
| `tunnelHeading` | Centerline tangent angle in radians |
| `forwardSpeed` | Velocity projected onto the tunnel tangent |
| `lateralSpeed` | Velocity projected onto the tunnel normal |

All values are finite. The Starship collision capsule has radius 9 m and
half-length 15 m. The tunnel is 68 m wide and has no ground plane or gates.

## Model lifecycle

- `createSimulation({ seed, hull?, start?, field? })` creates a run.
- The default seed is `1`; seeds are unsigned 32-bit integers.
- `reset(seed?)` restores the configured start and hull. Without a pinned
  field, it regenerates the tunnel when a seed is provided and reuses the
  current seed otherwise.
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
  seeded, bounded sum-of-sines curve.
- The tunnel is 68 m wide; top and bottom walls are sampled every 8 m.
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

This runs a deterministic, non-trained controller in Node. It prints finite
telemetry every five seconds and the final outcome, seed, progress, and score.
It is a baseline for the controller interface, not a training implementation.

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
offset, hull remaining, impact damage, and the final score. No renderer or
browser is required.
