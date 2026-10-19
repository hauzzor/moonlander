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

interface Observation {
  x: number;
  altitude: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  fuel: number;
  padOffsetX: number;
}

interface Controller {
  act(observation: Observation): Action;
  reset?(): void;
}

interface Simulation {
  getState(): SimState;
  getObservation(): Observation;
  step(action: Action): SimState;
  reset(seed?: number): SimState;
  readonly terrain: Terrain;
}
```

Observation semantics:

- `x` is horizontal position in meters.
- `altitude` is lander center height above the terrain directly below it.
- `vx` and `vy` are world velocity in m/s.
- `angle` is in radians and `angularVelocity` in rad/s.
- `fuel` is remaining fuel units.
- `padOffsetX` is `padCenterX - x`, positive when the pad is to the right.

All observation fields are finite numbers. The controller only consumes the
observation and returns an `Action`; the simulation never depends on browser
input.

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

## Terrain and landing API

```ts
interface Terrain {
  seed: number;
  points: readonly Vec2[];
  pad: {
    left: number;
    right: number;
    y: number;
  };
  heightAt(x: number): number;
}
```

- The terrain spans `x = 0..600`. The pad is `x = 250..350` at `y = 0`.
- Terrain from `x = 200..400` is a flat plateau at `y = 0`; seeded lunar hills
  rise outside that range, kept within the drawable world.
- The same seed produces identical terrain and `heightAt` values. Different
  seeds should produce different terrain profiles.
- `heightAt(x)` linearly interpolates between terrain points.

Lander contact geometry in body coordinates:

- left foot `{ x: -14, y: -16 }`
- right foot `{ x: 14, y: -16 }`
- nose `{ x: 0, y: 14 }`

`SAFE_LANDING` is `{ verticalSpeed: 2.5, horizontalSpeed: 1.5,
tilt: 12 degrees in radians }`. Speeds are absolute values.

A touchdown requires both feet in contact and no nose contact. If only one foot
or the nose contacts, the outcome is `crashed`. Contact on the pad is decided by
both feet's world x coordinates being within `terrain.pad.left` and
`terrain.pad.right`. The simulation freezes at a terminal outcome. The
`thrusters` field reports only thrusters that actually produced thrust during
the last step, so both are false when fuel is exhausted.

## Game test hooks

The playable page must expose these stable hooks for Playwright:

- `data-testid="game-canvas"`
- `data-testid="hud-altitude"`, `hud-vspeed`, `hud-hspeed`, `hud-tilt`, and
  `hud-fuel`, each with a `data-value` attribute containing the raw numeric
  value in meters, m/s, degrees, or fuel units respectively
- `data-testid="thruster-left"` and `data-testid="thruster-right"` with
  `data-active="true"` only while that thruster produces thrust
- `data-testid="instructions"` mentioning Q, W, and R
- `data-testid="outcome"` visible only after a terminal outcome

The page remains fully playable with `Q`, `W`, and `R`. The HUD updates from
the simulation state, never from render-only mutable state.

## Testing strategy

- Vitest unit tests run in Node for the simulation and pure game helpers.
- Playwright verifies the real page, Canvas presence, keyboard thrusters, HUD,
  and restart.
- CI runs typecheck, unit tests, browser tests, and production build.
- A live Playwright smoke test runs against the deployed GitHub Pages URL.

## Delivery

The remaining scope is delivered as one combined build: deterministic flight,
seeded terrain and landing outcomes, the playable Canvas game, and the
autonomy-ready observation/controller API with a headless example and docs.
