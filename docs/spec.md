# Moonlander Specification

## Goal

Build a complete browser game in which a Starship flies endlessly through a
deterministic, procedurally generated 2D field of curved walls and gates. The
same deterministic simulation must be usable headlessly from Node for future
controller training and evaluation.

## World and physics

- 2D side view. Physics coordinates use +x right and +y up.
- The ground is an infinite solid plane at `y = 0`.
- The field extends infinitely in every direction; there is no hard world
  boundary.
- Fixed simulation step: `1 / 120` seconds. No wall-clock or frame-rate
  dependence inside `packages/sim`.
- Gravity is `1.62 m/s²` downward.
- The field is generated deterministically from an integer seed. The same seed
  and action sequence must produce the same field, collisions, and state.
- The ship is a rigid body with position, velocity, angle, and angular
  velocity. Inertia is derived from mass and hull size.
- No atmosphere, no drag, and no fuel. Thrust is available indefinitely.
- The simulation is collision-resolved and deterministic. The implementation
  must use swept collision or substepping so high-speed travel cannot tunnel
  through thin walls or thin gates.

Fixed ship values:

- mass `200` kg
- hull length `48` m, height `18` m
- collision capsule radius `9` m, half-length `15` m
- inertia `43800 kg·m²`, computed as
  `(mass * (length² + height²)) / 12`
- thruster force `700` N each
- thruster cant `15` degrees
- mounting points `{ x: -16, y: -9 }` and `{ x: 16, y: -9 }`

The resulting linear and angular response is approximately 1.5× the previous
lander response.

## Ship and controls

- Two independent thrusters, canted 15° outward from vertical.
- The left nozzle is mounted below and left of the center of mass. Pressing
  `Q` fires it. Its reaction force points upward and to the right and produces
  clockwise torque.
- The right nozzle mirrors it. Pressing `W` fires it. Its reaction force points
  upward and to the left and produces counter-clockwise torque.
- Both thrusters together produce balanced vertical lift.
- `R` starts a new run with a new seed.
- Fuel does not exist. Thrust never depletes.

## Field and hazards

The field is made of deterministic square chunks. A chunk is addressed by
integer coordinates `(cx, cy)` and covers:

- `x` from `cx * FIELD_CHUNK_SIZE` to `(cx + 1) * FIELD_CHUNK_SIZE`
- `y` from `cy * FIELD_CHUNK_SIZE` to `(cy + 1) * FIELD_CHUNK_SIZE`

`FIELD_CHUNK_SIZE` is `80`.

- Chunks entirely below the ground or intersecting the safe spawn circle are
  empty.
- The safe spawn circle is centered at `START_POSITION` with radius
  `SAFE_SPAWN_RADIUS` (`100` m). No wall or gate may appear inside it.
- Every other chunk contains one or two static curved walls and may contain one
  gate.
- Each wall is a simple polyline of 5–9 points inside the chunk, above the
  ground. Walls are static; they never move or deform.
- Each gate is a circular opening with radius `12..18` m, a unit `normal`, and
  a solid frame. Gates are placed in free space at least `10` m from every wall
  segment. Gates are optional scoring challenges.
- No floating rocks, moving hazards, difficulty ramp, or moving walls exist in
  this scope.
- `getChunk(cx, cy)` returns the same chunk contents for the same seed and
  coordinates regardless of call order. Negative chunk coordinates are valid.
- `chunksInView(center, radius)` returns every chunk whose bounds intersect the
  circle, sorted by `cy` ascending and then `cx` ascending.

## Collision, damage, and outcomes

- The ship collides with the ground, wall segments, and gate frames using a
  capsule collision shape.
- A contact has an impact speed equal to the component of the ship's velocity
  into the surface. Contacts below `DAMAGE_SPEED_THRESHOLD` (`2 m/s`) are
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
  freezes at that terminal state.
- Crossing a gate plane inside the gate opening counts as a gate pass. A gate
  can be passed only once and in either direction. A gate pass does not count
  if the ship collides with that gate's frame during the same tick.
- Progress is the farthest Euclidean distance from the spawn position reached
  so far. It is monotonic; flying backward does not reduce it.
- Score is `floor(progress) + gatesPassed * 50`.
- The simulation stops advancing after `destroyed`.

## Camera and presentation

- Canvas 2D side view with a star field, the infinite ground plane, curved
  walls, glowing gates, the Starship, and visible thruster flames.
- The camera smoothly follows the ship in two dimensions with a small
  velocity-based look-ahead.
- The field is rendered from chunks intersecting the camera view. Rendering
  reads simulation state and never mutates it.
- HUD telemetry: hull, speed, progress, score, and each thruster's active
  state. Fuel is not displayed.
- The current seed is displayed. The player can copy it or enter a specific
  seed to replay a course.
- `R` generates a new seed and restarts.
- Outcome overlay for a destroyed Starship, including the final score.
- The page remains fully playable with `Q`, `W`, and `R`.

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

## Seed behavior

- Seeds are unsigned 32-bit integers.
- The default seed is `1`, or the value of the `?seed=` URL parameter when it
  is a valid integer.
- `R` advances to a new deterministic seed. The game uses a fixed integer
  transition such as `seed * 1664525 + 1013904223` truncated to 32 bits.
- The seed input lets the player load any valid unsigned 32-bit seed. Loading a
  seed resets the run deterministically.
- The game must not use `Math.random` for seed selection or scene layout.

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
  gatesPassed: number;
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

interface Gate {
  id: string;
  center: Vec2;
  radius: number;
  normal: Vec2;
}

interface FieldChunk {
  coord: Vec2;
  walls: readonly CurvedWall[];
  gates: readonly Gate[];
}

interface Field {
  seed: number;
  chunkSize: number;
  groundY: number;
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
  nearestGateDistance: number;
  nearestGateAngle: number;
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
- `GROUND_Y = 0`
- `FIELD_CHUNK_SIZE = 80`
- `INITIAL_HULL = 100`
- `SHIP_MASS = 200`
- `SHIP_LENGTH = 48`
- `SHIP_HEIGHT = 18`
- `SHIP_RADIUS = 9`
- `SHIP_CAPSULE_HALF_LENGTH = 15`
- `SHIP_INERTIA = 43800`
- `THRUSTER_FORCE = 700`
- `THRUSTER_CANT = 15 degrees in radians`
- `LEFT_MOUNT = { x: -16, y: -9 }`
- `RIGHT_MOUNT = { x: 16, y: -9 }`
- `WALL_RADIUS = 2`
- `GATE_FRAME_RADIUS = 2`
- `GATE_MIN_RADIUS = 12`
- `GATE_MAX_RADIUS = 18`
- `DAMAGE_SPEED_THRESHOLD = 2`
- `DAMAGE_SCALE = 4`
- `INVULNERABILITY_SECONDS = 0.75`
- `BOUNCE_RESTITUTION = 0.35`
- `GATE_BONUS = 50`
- `SAFE_SPAWN_RADIUS = 100`
- `START_POSITION = { x: 0, y: 60 }`
- `SENSOR_RANGE = 200`
- `createField(seed)` creates a deterministic field.
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
- `simulation.reset(seed?)` resets the ship, hull, score, progress, gates, and
  field. If `seed` is provided, it becomes the new seed; otherwise the current
  seed is reused.
- `simulation.field` exposes the seeded field for rendering and analysis.
- If `SimulationOptions.field` is provided, the simulation uses that field for
  its lifetime and sets its seed from `field.seed`. `reset(seed?)` keeps the
  pinned field and ignores `seed`. This seam exists for deterministic tests and
  custom or authored courses; the game uses seeded fields.
- `Controller` defines the seam for autonomous controllers.

Observation semantics:

- `x` and `y` are the ship center in meters.
- `vx` and `vy` are world velocity in m/s.
- `angle` is in radians, positive counter-clockwise.
- `angularVelocity` is in rad/s.
- `hull`, `progress`, and `score` mirror the state.
- `nearestWallDistance` is the distance from the ship hull surface to the
  nearest wall surface within `SENSOR_RANGE`; it is `SENSOR_RANGE` when no wall
  is nearby and can be negative while the hull is penetrating a surface.
- `nearestGateDistance` is the distance from the ship center to the nearest
  unpassed gate center within `SENSOR_RANGE`; it is `-1` when no gate is nearby.
- `nearestGateAngle` is the world angle to that gate center in radians; it is
  `0` when no gate is nearby.
- All observation fields are finite numbers.

## Testing strategy

- Vitest unit tests run in Node for the simulation and pure game helpers.
- Playwright verifies the real page, Canvas presence, keyboard thrusters, HUD,
  seed controls, and restart.
- CI runs typecheck, unit tests, browser tests, and production build.
- A live Playwright smoke test runs against the deployed GitHub Pages URL.

## Delivery

The change is delivered as one combined build: deterministic side-view flight,
a seeded infinite field with curved walls and gates, collision damage and
scoring, the playable Canvas game, and the autonomy-ready observation and
controller API with a headless example and updated docs.
