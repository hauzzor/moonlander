# Headless Simulation and Autonomous Control

The simulation package is intentionally separated from the browser game so it
can run in Node for controller training, evaluation, and replay.

## Boundary

`@moonlander/sim` contains only pure TypeScript:

- no DOM library or browser globals
- no dependencies on `packages/game`
- no `Math.random`
- fixed timestep and seeded field generation

`packages/sim/tsconfig.json` omits the DOM library, so browser coupling is a
compile error. Unit tests run in Node.

## Simulation API

```ts
import { createSimulation, type Controller } from "@moonlander/sim";

const controller: Controller = {
  act(observation) {
    return {
      left:
        observation.nearestWallDistance < 45 ||
        observation.vy < -2 ||
        observation.nearestGateAngle > 0,
      right: observation.hull < 50 || observation.nearestGateAngle < 0,
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
field.

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
| `progress` | Farthest distance reached from spawn in meters |
| `score` | Current score, including gate bonuses |
| `nearestWallDistance` | Hull-surface distance to the nearest wall, capped at `SENSOR_RANGE`; may be negative during penetration |
| `nearestGateDistance` | Distance to the nearest unpassed gate center, or `-1` |
| `nearestGateAngle` | World angle to that gate center in radians, or `0` |

All values are finite. The Starship collision capsule has radius 9 m and
half-length 15 m. The ground is at `y = 0`.

## Model lifecycle

- `createSimulation({ seed, hull?, start?, field? })` creates a run.
- The default seed is `1`; seeds are unsigned 32-bit integers.
- `reset(seed?)` restores the configured start and hull. Without a pinned
  field, it regenerates the field when a seed is provided and reuses the current
  seed otherwise.
- `SimulationOptions.field` pins a field for the simulation lifetime. It is
  useful for deterministic tests and authored courses; `reset` keeps it.
- `simulation.field` exposes deterministic chunks, curved wall polylines, and
  gates for rendering and analysis.
- `simulation.getState()` exposes tick, time, seed, ship state, hull,
  invulnerability, thrusters, outcome, score, progress, and gates passed.
- `controller.reset?.()` is available for stateful controllers.

## Field

- The field is an infinite grid of 80 m chunks.
- Chunks below the ground and around the safe spawn zone are empty.
- Other chunks contain one or two static curved wall polylines and may contain
  a gate.
- `field.getChunk(cx, cy)` is deterministic for a given seed and coordinates,
  including negative coordinates.
- `field.chunksInView(center, radius)` returns intersecting chunks sorted by
  chunk y and x.
- Walls, gate frames, and the ground are solid. Gate passes are one-time and
  worth 50 points.

## Reference headless run

```powershell
npm.cmd run sim:demo
```

This runs a deterministic, non-trained controller in Node. It prints finite
telemetry every five seconds and the final outcome, seed, gate count, and
score. It is a baseline for the controller interface, not a training
implementation.

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

Rewards and termination can be derived from progress, gates passed, hull
remaining, impact damage, and the final score. No renderer or browser is
required.
