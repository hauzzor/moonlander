# Moonlander Specification

## Goal

Build a complete browser game in which a Starship flies manually through a
deterministic, enclosed, mostly horizontal tunnel that winds rightward. The
ship uses aggressive Q/W thrusters and atmospheric drag for responsive,
damped control. The same deterministic simulation must be usable headlessly
from Node for controller training and evaluation.

## World and physics

- 2D side view. Physics coordinates use +x right and +y up.
- Fixed simulation step: `1 / 120` seconds. No wall-clock or frame-rate
  dependence inside `packages/sim`.
- Gravity is `1.62 m/s²` downward.
- The world is an endless enclosed tunnel. There is no open sky, free obstacle
  field, or infinite ground plane.
- The tunnel is generated deterministically from an integer seed. The same seed
  and action sequence must produce the same tunnel, collisions, and state.
- The ship is a rigid body with position, velocity, angle, and angular
  velocity. Inertia is derived from mass and hull size.
- No fuel. Thrust is available indefinitely.
- Atmospheric drag acts on linear and angular velocity. It is applied after
  thrust, gravity, and torque and before position integration.
- The simulation must use swept collision or substepping so high-speed travel
  cannot pass through the tunnel walls.

Fixed ship values:

- mass `200` kg
- hull length `48` m, height `18` m
- collision capsule radius `9` m, half-length `15` m
- inertia `43800 kg·m²`, computed as
  `(mass * (length² + height²)) / 12`
- thruster force `1800` N each
- thruster cant `15` degrees
- mounting points `{ x: -16, y: -9 }` and `{ x: 16, y: -9 }`

Atmospheric drag:

- linear drag `0.35 s⁻¹`
- angular drag `0.25 s⁻¹`
- discrete damping model:
  `v = (v + a * dt) / (1 + LINEAR_DRAG * dt)` and
  `ω = (ω + α * dt) / (1 + ANGULAR_DRAG * dt)`
- drag applies to both linear axes and to angular velocity.

Target response:

- single-thruster lateral acceleration at least `2.0 m/s²`
- both-thruster net climb at least `12 m/s²`
- angular acceleration at least `0.5 rad/s²`
- 90° turn from rest in at most `2.7 s`
- release from 20 m/s loses at least 25% speed after one second
- free-fall terminal speed at most `5 m/s`
- no control latency beyond one fixed tick

## Ship and controls

- Two independent thrusters, canted 15° outward from vertical.
- The left nozzle is mounted below and left of the center of mass. Pressing
  `Q` fires it. Its reaction force points upward and to the right and produces
  clockwise torque.
- The right nozzle mirrors it. Pressing `W` fires it. Its reaction force points
  upward and to the left and produces counter-clockwise torque.
- Both thrusters together produce balanced vertical lift.
- `Q`/`W` are continuous while held. There is no auto-forward or boost control.
- `R` starts a new run with a new seed.
- Fuel does not exist. Thrust never depletes.

## Tunnel

The tunnel is a continuous corridor with a constant total width of `68 m`
(`TUNNEL_HALF_WIDTH = 34`).

- The centerline starts at `TUNNEL_CENTER_Y = 60`.
- The first `TUNNEL_START_STRAIGHT = 120` m of x is straight at `y = 60`,
  including negative x.
- After the straight section, the centerline bends using a seeded,
  deterministic sum-of-sines function with a smooth C1 transition at
  `x = 120`.
- The absolute vertical bend is at most `TUNNEL_BEND_AMPLITUDE = 24` m from
  `y = 60`.
- The absolute centerline slope is at most `TUNNEL_MAX_SLOPE = 0.35`.
- Wall samples are spaced every `TUNNEL_SAMPLE_STEP = 8` m.
- Top and bottom walls are vertical offsets from the centerline:
  `centerY(x) ± TUNNEL_HALF_WIDTH`.
- Wall segments are assigned to exactly one `FIELD_CHUNK_SIZE = 80` m chunk
  based on the segment midpoint. Adjacent chunks share endpoint coordinates so
  the tunnel is continuous.
- The tunnel is endless in both directions. Negative x is valid.
- The tunnel has no gates, free walls, rocks, or moving hazards.
- There is no difficulty ramp; width and bend limits are constant.
- The ship starts at `START_POSITION = { x: 0, y: 60 }`, angle `0`, zero
  velocity.
- The old infinite ground is removed. The tunnel floor and ceiling are the
  collision surfaces.

Seed behavior:

- Seeds are unsigned 32-bit integers.
- The default seed is `1`, or the value of the `?seed=` URL parameter when it
  is a valid integer.
- `R` advances to a new deterministic seed. The game uses a fixed integer
  transition such as `seed * 1664525 + 1013904223` truncated to 32 bits.
- The seed input lets the player load any valid unsigned 32-bit seed. Loading a
  seed resets the run deterministically.
- The game must not use `Math.random` for seed selection or scene layout.

## Progress and score

- `progress = max(0, maxX - spawnX)`, where `spawnX` is the ship's initial x.
- Progress is monotonic. Flying backward or upward does not increase it.
- `score = floor(progress)`.
- There are no gate bonuses or checkpoint bonuses.
- The HUD shows hull, speed, progress, score, and thruster state. Fuel is not
  displayed.

## Collision, damage, and outcomes

- The ship collides with the tunnel floor and ceiling using its capsule shape.
- A contact has an impact speed equal to the component of the ship's velocity
  into the surface. Contacts at or below `DAMAGE_SPEED_THRESHOLD = 2 m/s` are
  harmless.
- Above the threshold, damage is:
  `max(1, round((impactSpeed - 2) * 4))`.
- At most one damage event occurs per simulation tick. When several contacts
  happen in one tick, use the highest impact speed.
- The ship is pushed out of penetration and bounces. The normal velocity is
  reflected with restitution `0.35`; tangential velocity is preserved.
- A damage event grants `0.75` seconds of invulnerability. During
  invulnerability, collisions still bounce but deal no damage.
- `hull` starts at `100` and is clamped to `0..100`.
- When `hull` reaches `0`, the outcome becomes `destroyed` and the simulation
  freezes.
- The only run outcomes are `flying` and `destroyed`.

## Camera and presentation

- Canvas 2D side view with the tunnel interior, floor and ceiling walls,
  structural ribs, atmospheric haze, subtle speed streaks or dust, and the
  Starship with visible thruster flames.
- The camera smoothly follows the ship in two dimensions with velocity
  look-ahead on both axes and a small vertical bias. It never rotates.
- The renderer may apply a subtle speed-based zoom-out. Camera target, snap, and
  easing math remain deterministic presentation logic.
- Rendering reads simulation and tunnel state; it never mutates them.
- Remove gates, free walls, the star field, and the infinite ground from the
  playable view.
- HUD telemetry: hull, speed, progress, score, and each thruster's active state.
  Fuel is not displayed.
- The current seed is displayed. The player can copy it or enter a specific
  seed to replay a tunnel.
- `R` generates a new seed and restarts.
- Outcome overlay for a destroyed Starship, including the final score.
- The page remains fully playable with `Q`, `W`, and `R`.
- Instructions mention Q, W, and R, and describe staying inside the tunnel.

## Game test hooks

The playable page must expose these stable hooks for Playwright:

- `data-testid="game-canvas"`
- `data-testid="hud-hull"`, `hud-speed`, `hud-progress`, and `hud-score`, each
  with a `data-value` attribute containing a numeric value in hull units, m/s,
  meters, or points respectively; progress is reported in whole meters
- `data-testid="thruster-left"` and `data-testid="thruster-right"` with
  `data-active="true"` only while that thruster produces thrust
- `data-testid="instructions"` mentioning Q, W, and R
- `data-testid="outcome"` visible only after destruction, containing the final
  score
- `data-testid="seed-display"` showing the current seed
- `data-testid="seed-input"` accepting an unsigned seed and
  `data-testid="seed-load"` loading it

The page remains fully playable with `Q`, `W`, and `R`. The HUD updates from
the simulation state, never from render-only mutable state.

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

type RunOutcome = "flying" | "destroyed";

interface ShipState {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
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

interface ShipStart {
  position?: Vec2;
  velocity?: Vec2;
  angle?: number;
  angularVelocity?: number;
}

interface SimulationOptions {
  seed?: number;
  hull?: number;
  start?: ShipStart;
  field?: Field;
}

interface CurvedWall {
  id: string;
  points: readonly Vec2[];
}

interface Tunnel {
  halfWidth: number;
  centerAt(x: number): Vec2;
  headingAt(x: number): number;
}

interface FieldChunk {
  coord: Vec2;
  walls: readonly CurvedWall[];
}

interface Field {
  seed: number;
  chunkSize: number;
  tunnel: Tunnel;
  getChunk(cx: number, cy: number): FieldChunk;
  chunksInView(center: Vec2, radius: number): readonly FieldChunk[];
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

interface Controller {
  act(observation: Observation): Action;
  reset?(): void;
}

interface Simulation {
  getState(): SimState;
  getObservation(): Observation;
  step(action: Action): SimState;
  reset(seed?: number): SimState;
  readonly field: Field;
}
```

Required exports:

- `FIXED_DT = 1 / 120`
- `GRAVITY = 1.62`
- `FIELD_CHUNK_SIZE = 80`
- `INITIAL_HULL = 100`
- `SHIP_MASS = 200`
- `SHIP_LENGTH = 48`
- `SHIP_HEIGHT = 18`
- `SHIP_RADIUS = 9`
- `SHIP_CAPSULE_HALF_LENGTH = 15`
- `SHIP_INERTIA = 43800`
- `THRUSTER_FORCE = 1800`
- `THRUSTER_CANT = 15 degrees in radians`
- `LEFT_MOUNT = { x: -16, y: -9 }`
- `RIGHT_MOUNT = { x: 16, y: -9 }`
- `LINEAR_DRAG = 0.35`
- `ANGULAR_DRAG = 0.25`
- `TUNNEL_HALF_WIDTH = 34`
- `TUNNEL_CENTER_Y = 60`
- `TUNNEL_START_STRAIGHT = 120`
- `TUNNEL_BEND_AMPLITUDE = 24`
- `TUNNEL_MAX_SLOPE = 0.35`
- `TUNNEL_SAMPLE_STEP = 8`
- `WALL_RADIUS = 2`
- `DAMAGE_SPEED_THRESHOLD = 2`
- `DAMAGE_SCALE = 4`
- `INVULNERABILITY_SECONDS = 0.75`
- `BOUNCE_RESTITUTION = 0.35`
- `SENSOR_RANGE = 200`
- `START_POSITION = { x: 0, y: 60 }`
- `DEFAULT_SEED = 1`
- `createField(seed)` creates a deterministic tunnel field.
- `createSimulation(options?)` creates a deterministic simulation.

Simulation semantics:

- Default start: position `{ x: 0, y: 60 }`, zero velocity, angle `0`, zero
  angular velocity, hull `100`, outcome `flying`.
- `simulation.getState()` returns the current state as plain data.
- `simulation.getObservation()` returns finite numeric observations.
- `simulation.step(action)` advances exactly one fixed tick while flying.
  `SimState.thrusters` reports the last commanded action while flying. After
  `destroyed`, the state is frozen, so the last action remains visible; the game
  suppresses flames.
- `simulation.reset(seed?)` resets the ship, hull, score, progress, and tunnel.
  If `seed` is provided, it becomes the new seed; otherwise the current seed is
  reused.
- `simulation.field` exposes the seeded tunnel for rendering and analysis.
- If `SimulationOptions.field` is provided, the simulation uses that field for
  its lifetime and sets its seed from `field.seed`. `reset(seed?)` keeps the
  pinned field and ignores `seed`. This seam exists for deterministic tests and
  custom or authored tunnels.
- `Controller` defines the seam for autonomous controllers.

Observation semantics:

- `x` and `y` are the ship center in meters.
- `vx` and `vy` are world velocity in m/s.
- `angle` is in radians, positive counter-clockwise.
- `angularVelocity` is in rad/s.
- `hull`, `progress`, and `score` mirror the state.
- `nearestWallDistance` is the distance from the ship hull surface to the
  nearest tunnel wall within `SENSOR_RANGE`; it is `SENSOR_RANGE` when no wall
  is nearby and can be negative while the hull is penetrating a surface.
- `tunnelCenterOffset` is `ship.y - tunnel.centerAt(ship.x).y`, positive above
  the centerline.
- `tunnelHalfWidth` is `tunnel.halfWidth`.
- `tunnelHeading` is `tunnel.headingAt(ship.x)` in radians.
- `forwardSpeed` is the velocity projected onto the tunnel tangent.
- `lateralSpeed` is the velocity projected onto the tunnel normal.
- All observation fields are finite numbers.

## Testing strategy

- Vitest unit tests run in Node for the simulation and pure game helpers.
- Playwright verifies the real page, Canvas presence, keyboard thrusters, HUD,
  seed controls, input-driven progress, restart, and the hidden outcome overlay.
- CI runs typecheck, unit tests, browser tests, and production build.
- A live Playwright smoke test runs against the deployed GitHub Pages URL.

## Delivery

The change is delivered as one combined build: deterministic tunnel
generation, aggressive thrusters and atmospheric drag, tunnel collision and
forward-distance scoring, the playable Canvas game, and the autonomy-ready
observation and controller API with a headless example and updated docs.
