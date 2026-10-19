# Eye Sensor, Rear Thruster, Navigation Sensors, and Autopilot

## Change tier

Tier 3 — changes controls, physics, the public action/sensor API, the UI, and
adds an autonomous controller.

## Original request

Add a rear-facing thruster at the back, half as strong as the bottom thrusters,
toggled with Space. Rename the 360° sensor to the eye sensor. Add a direction
sensor for the ship angle toward the horizon with a needle UI. Add an E-toggled
autopilot that uses all sensor data and controls the thrusters, aiming to go as
far and as fast as possible without touching obstacles. Add distance-to-start
and velocity sensor blocks and show them in the UI.

The user confirmed a full API rename and two behavior changes for the eye
sensor: rays use absolute world angles and distances are measured from the
ship's hull rim, not its center.

## Goal

Add a third propulsion option, a four-block navigation sensor suite, and a
deterministic safety-first autopilot. Preserve the tunnel, drag, collision,
scoring, seed, and fixed-step architecture.

## Current behavior

- `Action` is `{ left, right }`; no rear thruster.
- The 360° eye-like sensor is called `sensor`, uses ship-relative angles, and
  measures from the ship center.
- The UI has one sensor panel, no direction needle, no distance-to-start or
  velocity blocks, and no autopilot.
- The observation has world state, tunnel-relative fields, and the 360° scan.
- The `Controller` seam exists but is not used by the game.
- The game supports Q/W/R only.

## Desired behavior

### Rear thruster

- Stern-centered nozzle at `REAR_MOUNT = { x: -24, y: 0 }`.
- Thrust force `900 N` along the ship's local `+x` (forward); zero torque.
- Space is a press-to-toggle latch. Reset it on R, blur, and page hide.
- While autopilot is active, Space is ignored and the autopilot controls the
  rear thruster.
- HUD chip and rear flame; active only while the sim reports rear thrust.

### Eye sensor rename and behavior

- Full API rename: `sensor` → `sensors.eye`, `sensorRadius` →
  `eyeSensorRadius`, `setSensorRadius` → `setEyeSensorRadius`,
  `SensorReading` → `EyeSensorReading`, and eye-specific `SENSOR_*` constants →
  `EYE_SENSOR_*`.
- The generic wall-proximity `SENSOR_RANGE` becomes `WALL_SENSOR_RANGE`.
- Test hooks rename from `sensor-*` to `eye-sensor-*`.
- 360 rays at **absolute world angles**: index `i` is world angle `i°`, with
  `0°` pointing right and angles increasing counter-clockwise.
- Each ray starts at the **ship hull rim** (capsule surface) in that world
  direction; the stored distance is from that rim point to the nearest tunnel
  wall surface. No hit stores the view radius.
- The reading stores `radius`, `tick`, `origin` (ship center at scan),
  `heading` (ship angle at scan), and `distances`.
- Scan at tick 0 and every 120 ticks. View radius slider `20..200`, default
  `120`. `setEyeSensorRadius` clamps and applies at the next scan; the last
  reading remains until then. The radius persists across reset.
- The radar overlay is world-aligned, not rotated with the ship, and uses the
  last scan's rim distances. The chart X axis is world angle `0..360°`.

### New navigation sensors

- **Direction sensor:** normalized world-horizon ship angle, signed
  `-π..π` in the API and `-180°..180°` in the UI; `0°` = level, positive
  nose-up. Continuous reading.
- **Distance to start:** Euclidean current distance from the spawn position;
  continuous; meters.
- **Velocity sensor:** world `vx`, `vy`, speed, and velocity angle; continuous.
- `SimState` and `Observation` expose `sensors` and `eyeSensorRadius`.

### Autopilot

- Deterministic sim-side controller `createAutopilot()` exported from
  `@moonlander/sim`.
- E toggles autopilot; default off.
- While active, it exclusively controls all three thrusters; Q/W/Space are
  ignored. E off restores manual control with the manual rear latch off.
- R resets the run and the autopilot controller, and keeps the autopilot mode.
- Uses the full observation: eye sensor, direction, distance-to-start,
  velocity, tunnel center/heading, and continuous nearest-wall clearance.
- Safety-first two-layer controller:
  - follow the tunnel centerline and tangent using tunnel/direction/velocity;
  - rear thrust for forward speed; bottom thrusters for lift/attitude;
  - safety governor cuts rear thrust and prioritizes clearance when the eye
    forward clearance or nearest wall is low.
- HUD status `MANUAL` / `AUTOPILOT`, with `data-active`.

### UI

- Expanded bottom-right sensor console:
  - **EYE SENSOR** chart with world-angle X axis and rim distances; radius
    slider and scan tick.
  - **DIRECTION** needle dial with signed-degree readout.
  - **DIST TO START** numeric meters.
  - **VELOCITY** speed, `vx`, `vy`, and direction.
- Top HUD: autopilot status and `thruster-rear` active state.
- Instructions: Q/W bottom thrusters, Space rear latch, E autopilot, R restart.
- Responsive two-column console on desktop; stacked/scrollable on narrow
  screens.
- New test hooks:
  - `eye-sensor-panel`, `eye-sensor-chart`, `eye-sensor-radius`,
    `eye-sensor-radius-value`, `eye-sensor-scan-tick`
  - `direction-needle`, `direction-value`
  - `distance-to-start`
  - `velocity-speed`, `velocity-vx`, `velocity-vy`, `velocity-angle`
  - `autopilot-status`, `thruster-rear`

## Non-goals

- Changing the tunnel, drag, collision, damage, score, or seed rules.
- A formal collision-free autopilot guarantee.
- Autopilot lookahead beyond the observation/sensor data.
- Touch controls, multiplayer, or a new rendering technology.
- Parallax, radar persistence, or sensor noise.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Rear force | 900 N forward, stern centerline, no torque | Half of one bottom thruster; predictable |
| Space | Latch toggle | User said toggled; reset on R/blur |
| Eye sensor rename | Full API and test-hook rename | User confirmed |
| Eye angles | Absolute world angles | User confirmed |
| Eye distance | Rim-to-wall surface | User confirmed |
| Eye radius | 20–200, default 120, next scan | Existing slider behavior, renamed |
| Direction | World horizon, signed, 0° level | User confirmed |
| Distance to start | Euclidean from spawn | User confirmed |
| Velocity | Speed + world vector | User confirmed |
| Autopilot | Sim-side Controller, exclusive | Reusable and deterministic |
| Safety | Empirical zero-contact benchmark | Feasible and testable |
| UI | Expanded bottom-right console + top status | User confirmed |

## Contract freeze

```ts
interface Action {
  left: boolean;
  right: boolean;
  rear: boolean;
}

interface EyeSensorReading {
  radius: number;
  tick: number;
  origin: Vec2;
  heading: number;
  distances: readonly number[];
}

interface DirectionSensorReading {
  angle: number;
}

interface VelocitySensorReading {
  vx: number;
  vy: number;
  speed: number;
  angle: number;
}

interface SensorSuite {
  eye: EyeSensorReading;
  direction: DirectionSensorReading;
  distanceToStart: number;
  velocity: VelocitySensorReading;
}

interface SimState {
  // existing fields...
  thrusters: Action;
  eyeSensorRadius: number;
  sensors: SensorSuite;
}

interface Observation {
  // existing fields...
  eyeSensorRadius: number;
  sensors: SensorSuite;
}

interface SimulationOptions {
  // existing fields...
  eyeSensorRadius?: number;
}

interface Simulation {
  // existing methods...
  setEyeSensorRadius(radius: number): void;
}
```

New constants:

- `REAR_THRUSTER_FORCE = 900`
- `REAR_MOUNT = { x: -24, y: 0 }`
- `EYE_SENSOR_RAY_COUNT = 360`
- `EYE_SENSOR_INTERVAL_SECONDS = 1`
- `EYE_SENSOR_VIEW_MIN = 20`
- `EYE_SENSOR_VIEW_MAX = 200`
- `EYE_SENSOR_VIEW_DEFAULT = 120`
- `WALL_SENSOR_RANGE = 200` (renamed from `SENSOR_RANGE`)

Stubs before tests:

- New `action`/`thrusters` fields and rear product.
- New sensor types and suite; old sensor names removed.
- `EyeSensorReading` placeholder/world-rim scan stub.
- `createAutopilot()` stub.
- Compiling sim and game shells.

## Test matrix

| Area | Unit tests | E2E tests | Determinism / edge cases | Owner |
| --- | --- | --- | --- | --- |
| Rear thruster | 900 N +x, no torque, combined Q/W/rear, one-tick velocities | Space latch/readout, rear flame/active | Reset/blur; autopilot control | test-engineer |
| Eye sensor | Absolute world angles, rim distances, no-hit=radius, 360 finite | Panel/chart/world-axis/scan | Bent/negative x, near walls, radius 20/200, reset | test-engineer |
| Eye rename | Old names absent, new names exported | Eye hooks/labels | API compatibility break | test-engineer |
| Direction | Signed horizon angle, normalization | Needle/value | ±180°, multiple turns | test-engineer |
| Distance/velocity | Euclidean/value updates, finite | Blocks/values | Backward flight, zero speed | test-engineer |
| Autopilot | E equivalent controller, deterministic, uses sensors | E toggle/status, manual ignored, R mode | Destruction, reset, 8 seeds × 60 s | test-engineer |
| Autopilot safety | Zero contact, hull 100, progress/speed floors | — | Seed set, minimum radius | test-engineer |
| UI layout | — | Console/needle/blocks/status responsive | — | test-engineer |

Autopilot benchmark:

- Seeds: `1, 7, 42, 1234, 2026, 5678, 99991, 314159`.
- 60 s (7,200 ticks) each.
- `nearestWallDistance > 0` every tick; hull remains 100.
- Progress ≥ 400 m per seed; median ≥ 500 m.
- Average forward speed ≥ 8 m/s.
- Identical deterministic replays.
- Reduced-speed safety check at the 20 m eye radius.

## Acceptance criteria

1. Action/rear thruster works with 900 N, zero torque, Space latch, HUD, flame,
   and autopilot control.
2. Eye sensor is fully renamed, uses absolute world angles, rim-to-wall
   distances, 1 Hz scans, radius 20–200/default 120, next-scan radius changes.
3. Direction, distance-to-start, and velocity sensors are finite, exposed in
   state/observation, and shown in the UI.
4. E toggles the sim-side autopilot; it uses the full observation, exclusively
   controls all thrusters, and is deterministic.
5. Autopilot meets the empirical zero-contact/progress/speed benchmark.
6. UI console, needle, blocks, autopilot status, rear HUD, and instructions are
   complete; test hooks are stable.
7. Typecheck, unit tests, e2e, build, and live suite pass.

## Edge cases

- Eye rays exactly at the ship rim / wall tangent; no-hit and near-wall.
- Absolute-angle wrap at 0°/360°.
- Direction normalization beyond ±π.
- Rear latch reset on R/blur and mode changes.
- Autopilot at eye radius 20 and 200.
- Autopilot destruction and R reset.
- Manual input while autopilot is active.
- Velocity zero direction; distance-to-start backward flight.
- Responsive console overlap; focused sliders/buttons and Space/E handling.

## Affected interfaces

- `packages/sim/src/types.ts`, `constants.ts`, `index.ts`, `physics.ts`,
  `sensor.ts`, `simulation.ts`, new `autopilot.ts`.
- `packages/sim/test`, `packages/game/test`, `e2e`.
- `packages/game/src/input.ts`, `game.ts`, `sensor-panel.ts`, render modules,
  `index.html`, `style.css`.
- `docs/spec.md`, `docs/autonomy.md`, `README.md`, `AGENTS.md`.
- `packages/sim/examples/headless-demo.ts`.

## Determinism and boundary impact

- Fixed 1/120 step; no Math.random/wall-clock in sim.
- Absolute eye scan deterministic from seed/pose/radius.
- Autopilot is a pure observation-driven controller with deterministic output.
- Rendering reads state; UI animation uses simulation time.

## Verification plan

1. Write this brief and update the spec.
2. Freeze action/sensor/autopilot contracts and add compiling stubs.
3. Test engineer writes red sim/e2e tests.
4. Sim engineer implements rear thrust, eye sensor, suite, and autopilot.
5. Gameplay engineer implements input, rear art/HUD, console, needle, and
   autopilot UI.
6. Code review; `npm.cmd run verify`.
7. `npm.cmd run deliver -- --message "feat: add eye sensor, rear thruster, and autopilot"` and live suite.

## Open questions

None.

## Delivery waiver

None.

## Confirmation

Confirmed by the user on 2026-10-19.
