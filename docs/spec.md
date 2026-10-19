# Moonlander Specification

## Goal

Build a complete browser game in which a two-thruster lunar lander descends to
a marked pad. The same deterministic simulation must be usable headlessly from
Node for future controller training and evaluation.

## World and physics

- 2D side view. Physics coordinates use +x right and +y up. Ground is at y = 0.
- Fixed simulation step: `1 / 120` seconds. No wall-clock or frame-rate
  dependence inside `packages/sim`.
- Moon gravity: 1.62 m/s² downward.
- The world is 600 m wide. The landing pad is centered and 100 m wide.
- Terrain is generated deterministically from an integer seed. The pad is flat.
- The lander is a rigid body with position, velocity, angle, and angular
  velocity. Inertia is derived from mass and body size.
- No atmosphere, no drag, and no fake stabilization. Torque comes only from
  thrusters applied at their mount points.
- Fuel is shared. A thruster consumes fuel while active. At zero fuel no thrust
  is produced.

## Controls and thrusters

- Two independent thrusters, canted 15° outward from vertical.
- The left nozzle is mounted below and left of the center of mass. Pressing
  `Q` fires it. Its reaction force points upward and to the right and produces
  clockwise torque.
- The right nozzle mirrors it. Pressing `W` fires it. Its reaction force points
  upward and to the left and produces counter-clockwise torque.
- Both thrusters together produce balanced vertical lift.
- `R` resets the game.

## Landing rules

The lander has two landing feet. Contact with the nose or a single foot is a
crash. A touchdown requires both feet to contact the ground.

A touchdown is safe when all conditions hold:

- `|vertical speed| <= 2.5 m/s`
- `|horizontal speed| <= 1.5 m/s`
- `|tilt| <= 12°`

Outcomes:

- `landed`: safe touchdown with both feet inside the landing pad.
- `missed-pad`: safe touchdown outside the pad.
- `crashed`: unsafe speeds, excessive tilt, nose contact, or one-foot contact.
- `flying`: no contact yet.

The simulation stops advancing after any terminal outcome.

## Rendering and HUD

- Canvas 2D side view with a star field, lunar terrain, marked pad, lander,
  landing legs, and visible thruster flames.
- HUD telemetry: altitude above ground, vertical speed, horizontal speed, tilt,
  fuel, and each thruster's active state.
- On-screen controls: `Q` left thruster, `W` right thruster, `R` restart.
- Outcome overlay for landed, missed-pad, and crashed.
- Renderer only reads simulation state.

## Public simulation API

The public API lives in `packages/sim/src/index.ts` and is imported as
`@moonlander/sim`.

Core shapes:

```ts
interface Vec2 {
  x: number;
  y: number;
}

interface Action {
  left: boolean;
  right: boolean;
}

type LandingOutcome = "flying" | "landed" | "missed-pad" | "crashed";

interface LanderState {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
}

interface SimState {
  tick: number;
  time: number;
  lander: LanderState;
  fuel: number;
  thrusters: Action;
  outcome: LandingOutcome;
}

interface LanderStart {
  position?: Vec2;
  velocity?: Vec2;
  angle?: number;
  angularVelocity?: number;
}

interface SimulationOptions {
  seed?: number;
  fuel?: number;
  start?: LanderStart;
}

interface Simulation {
  getState(): SimState;
  getObservation(): Observation;
  step(action: Action): SimState;
  reset(seed?: number): SimState;
  readonly terrain: Terrain;
}
```

Required exports:

- `FIXED_DT = 1 / 120`, `MOON_GRAVITY = 1.62`, `WORLD_WIDTH = 600`,
  `PAD_WIDTH = 100`, `INITIAL_FUEL = 100`, and `SAFE_LANDING` limits.
- `createSimulation(options?)` creates a deterministic simulation. The same
  seed, initial state, and action sequence must produce exactly the same state.
- Default start: position `{ x: 300, y: 90 }`, zero velocity, angle `0`, zero
  angular velocity, full fuel, outcome `flying`.
- `simulation.getState()` returns the current state.
- `simulation.getObservation()` returns numeric controller observations.
- `simulation.step(action)` advances exactly one fixed tick.
- `simulation.reset(seed?)` returns to the initial state of that seed.
- `simulation.terrain` exposes the generated terrain and pad bounds for
  rendering and analysis.
- `Controller` defines the seam for future autonomous controllers.

Fixed physics values for the initial lander:

- mass `200` kg
- body `36` m wide, `24` m tall
- thruster force `500` N each
- thruster cant `15` degrees
- mounting points `{ x: -12, y: -12 }` and `{ x: 12, y: -12 }`
- fuel burn rate `5` units per second per active thruster

Use seeded pseudo-randomness for terrain. Do not use `Math.random` in the
simulation package.

## Testing strategy

- Vitest unit tests run in Node for the simulation and pure game helpers.
- Playwright verifies the real page, Canvas presence, keyboard thrusters, HUD,
  and restart.
- CI runs typecheck, unit tests, browser tests, and production build.
- A live Playwright smoke test runs against the deployed GitHub Pages URL.

## Milestones

0. Deployable shell and CI/CD.
1. Deterministic flight model.
2. Seeded terrain and landing outcomes.
3. Playable Canvas game.
4. Autonomy-ready API, headless example, documentation, and polish.
