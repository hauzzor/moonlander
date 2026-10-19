# Headless Simulation and Autonomous Control

The simulation package is intentionally separated from the browser game so it
can run in Node for controller training, evaluation, and replay.

## Boundary

`@moonlander/sim` contains only pure TypeScript:

- no DOM library or browser globals
- no dependencies on `packages/game`
- no `Math.random`
- fixed timestep and seeded terrain

`packages/sim/tsconfig.json` omits the DOM library, so browser coupling is a
compile error. Unit tests run in Node.

## Simulation API

```ts
import { createSimulation, type Controller } from "@moonlander/sim";

const controller: Controller = {
  act(observation) {
    return {
      left: observation.vy < -2,
      right: observation.vy < -2,
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
initial state, and action sequence produce the same state sequence.

## Observation

| Field | Meaning |
| --- | --- |
| `x` | Horizontal position in meters |
| `altitude` | Lander center height above terrain directly below |
| `vx` | World horizontal velocity in m/s |
| `vy` | World vertical velocity in m/s |
| `angle` | Tilt in radians, positive counter-clockwise |
| `angularVelocity` | Angular velocity in rad/s |
| `fuel` | Remaining fuel units |
| `padOffsetX` | Pad center minus lander x |

All values are finite numbers. The landing feet are 16 m below the center, so
landing clearance is approximately `altitude - 16` while upright.

## Model lifecycle

- `createSimulation({ seed, fuel?, start? })` creates a run.
- `reset(seed?)` restores the configured start and optionally regenerates the
  terrain for a new seed.
- `simulation.terrain` exposes points, pad bounds, and `heightAt(x)`.
- `simulation.getState()` exposes the full rigid-body state and outcome.
- `controller.reset?.()` is available for stateful controllers.

## Reference headless run

```powershell
npm.cmd run sim:demo
```

This runs a deterministic, non-trained reference controller for a complete
landing in Node. It is a baseline for the controller interface, not a training
implementation. It prints observations every five seconds and the final
outcome.

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

Rewards and termination can be derived from the final outcome, pad position,
impact speeds, tilt, and remaining fuel. No renderer or browser is required.
