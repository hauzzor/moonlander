# Ship Radar Sensors and Sensor Diagram

## Change tier

Tier 3 — changes the simulation/observation API, adds periodic ray casting,
and adds new radar and chart UI.

## Original request

> now for the automation part. I want to add sensors to the spaceship. Should
> detect nearby obstacles. having spaceship as origin The sensor detects
> distance to nearby obstacles. For every single degree in a circle around the
> spaceship a ray is cast outwards ultimately colliding with an obstacle or
> reaching nothing within the view radius. the view radius should be adjustable
> from the UI. from this 360 data points are created storing the distance to the
> corresponding obstacle. one sensor is placed on the ship and fires new view
> rays once a second. this should look like a radar effect on the Ui. also make
> a diagram part of the UI that shows The currently read sensor data as distance
> on the Y axis and angle on the X axis.

## Goal

Add a deterministic, ship-relative 360° radar to the simulation and expose it
to autonomous controllers through `SimState` and `Observation`. Render the last
scan as a radar overlay around the ship and as a filled distance-vs-angle chart
in a sensor panel with an adjustable view radius.

## Current behavior

- The simulation already exposes a scalar `nearestWallDistance`, but no
  directional sensor data.
- The game has a tunnel, HUD, seed controls, and a radar-free Canvas renderer.
- There is no sensor panel, chart, range slider, or radar sweep.
- The tunnel walls are the only obstacles.

## Desired behavior

### Sensor model

- One sensor at the ship center. The ship is the scalar origin for all rays.
- The sensor is ship-relative: ray angle `0°` points along the ship's nose and
  angles increase counter-clockwise. The stored reading includes the ship
  heading at scan time.
- `360` rays, one per degree, with indices `0..359`.
- Each ray reports the distance from the ship center to the nearest tunnel wall
  surface within the view radius.
- `SensorReading.distances[i]` is the wall-surface distance for angle `i`.
  A ray that reaches no wall within the view radius stores the view radius.
- Distances are finite, non-negative, and at most the scan view radius.
- The scan uses the tunnel floor/ceiling walls only. There are no gates, free
  obstacles, or self-hits.
- The sensor scans at tick `0` and every `120` ticks (`1 s`). The initial scan
  is available at load. The reading stores `radius`, `tick`, `origin`,
  `heading`, and the 360 distances.
- The configured view radius is separate from the last scan radius so a slider
  change can wait for the next scan without changing the last reading.
- `setSensorRadius(radius)` clamps to the allowed range and updates the
  configured radius. The next scheduled scan uses it; it does not immediately
  rescan. The last reading remains visible until that scan.
- The configured radius persists across `reset`/seed changes. The new start is
  scanned at tick `0` with the configured radius.

### View radius control

- UI slider range `20..200 m`, step `5 m`, default `120 m`.
- The slider updates the visible configured-radius value immediately and calls
  `simulation.setSensorRadius(value)`.
- The chart and radar keep showing the last scan radius/data until the next
  one-second scan.
- The chart Y axis uses the last scan radius; the slider label shows the
  configured radius. At the next scan they converge.

### Radar overlay

- Overlay on the game canvas around the current ship.
- Ship-relative: the display rotates with the current ship angle (`0°` = nose).
- Shows the last scan's 360 distances as a radar silhouette/points, range
  rings, and a 1 Hz sweep line.
- The radar uses the last scan data and is centered on the current ship; it is
  up to one second stale by design.
- Subtle cyan/teal styling; must not obscure the tunnel or ship.

### Sensor chart panel

- A bottom-right HUD panel with:
  - a filled line chart: distance on Y, angle `0..360°` on X, 360 points;
  - grid, axes, and labels;
  - a view-radius slider and numeric readout;
  - a small indication of the last scan tick or time.
- The chart uses the last scanned reading. It updates when a new scan is
  produced, not continuously.
- The panel must be responsive and must not cover the ship or controls on the
  normal desktop viewport.

### Public simulation API

Add:

```ts
interface SensorReading {
  radius: number;
  tick: number;
  origin: Vec2;
  heading: number;
  distances: readonly number[];
}

interface SimState {
  // existing fields...
  sensorRadius: number;
  sensor: SensorReading;
}

interface Observation {
  // existing fields...
  sensorRadius: number;
  sensor: SensorReading;
}

interface SimulationOptions {
  // existing fields...
  sensorRadius?: number;
}

interface Simulation {
  // existing methods...
  setSensorRadius(radius: number): void;
}
```

Constants:

- `SENSOR_RAY_COUNT = 360`
- `SENSOR_INTERVAL_SECONDS = 1`
- `SENSOR_VIEW_MIN = 20`
- `SENSOR_VIEW_MAX = 200`
- `SENSOR_VIEW_DEFAULT = 120`

The existing `nearestWallDistance` and `SENSOR_RANGE` remain unchanged; the new
360° sensor is additive.

## Non-goals

- Free obstacles, gates, or moving hazards.
- Changing the tunnel, drag, thrust, scoring, or collision rules.
- Auto-forward or new flight controls.
- Sensor fusion, noise, occlusion other than tunnel walls, or line-of-sight
  memory.
- Multi-sensor placement or sensor mounts other than the ship center.
- Persisting sensor data across page reloads.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Angle reference | Ship-relative, 0° = nose, CCW | User confirmed; radar rotates with the ship |
| Radar placement | Overlay on the game canvas + chart panel | User confirmed; radar effect plus diagram |
| Radar anchoring | Current ship, last scan data | User confirmed; intuitive and simple |
| Sensor API | Simulation + observation | Automation controllers and UI share the readings |
| View radius | Slider 20–200, default 120, next scan | User confirmed; avoids rescan while dragging |
| Chart | Filled line chart, distance Y, angle X | User confirmed |
| Sensor origin | Ship center | User request: spaceship as origin |
| Scan interval | Tick 0, then every 120 ticks | One scan per second at 120 Hz |
| No-hit value | View radius | Finite data point at the range limit |
| Wall distance | Wall surface | The sensor reports obstacle surface distance |

## Contract freeze

- Add the `SensorReading` type and the `sensor`/`sensorRadius` fields.
- Add `Simulation.setSensorRadius` and `SimulationOptions.sensorRadius`.
- Add the five sensor constants.
- Implement the scan in a new `packages/sim/src/sensor.ts` with compiling stubs
  before tests.
- Raycast against `FieldChunk.walls`; the wall surface distance is the
  centerline intersection minus `WALL_RADIUS`, clamped to `0..radius`.
- Scan at tick 0 and every 120 ticks.
- Add UI hooks:
  - `data-testid="sensor-panel"`
  - `data-testid="sensor-chart"`
  - `data-testid="sensor-radius"` (range input)
  - `data-testid="sensor-radius-value"`
  - `data-testid="sensor-scan-tick"`
- Red tests must fail for missing behavior, not missing exports.

## Test matrix

| Area | Unit tests | E2E tests | Determinism / edge cases | Owner |
| --- | --- | --- | --- | --- |
| Sensor shape | 360 finite distances, index/angle mapping, radius bounds | Chart panel/chart visible | Initial scan at tick 0 | test-engineer |
| Ray casting | Floor/ceiling surface distances, no-hit = radius, ship-relative angles, no self/free obstacles | Radar overlay and chart non-empty | Negative x, bent tunnel, near-wall poses | test-engineer |
| Scan cadence | Scans at 0 and every 120 ticks, no scan between | Chart update at next scan | Radius change between scans | test-engineer |
| View radius | Clamp min/max, configured vs last-scan radius, reset persistence | Slider min/max/default and readout | 20, 120, 200, out-of-range | test-engineer |
| State/observation | `sensor`/`sensorRadius` exposed and finite | — | Reset/seed/pinned field | test-engineer |
| UI | Seed/camera tests unchanged | Panel, chart, slider, label, scan tick | Slider drag then next scan | test-engineer |
| Radar overlay | — | Canvas renders; no console errors | Sweep/time behavior | lead |

## Acceptance criteria

1. The simulation exposes a ship-relative 360-point sensor reading in both
   `SimState` and `Observation`.
2. Rays hit tunnel walls or return the configured scan radius; distances are
   finite and ship-relative.
3. Scans occur at tick 0 and every 1 second; radius changes apply at the next
   scan.
4. The view radius slider is 20–200 m, default 120, and updates the configured
   value immediately.
5. The radar overlay and filled chart render the last scan; the chart updates
   at the next scan.
6. Existing tunnel, drag, collision, scoring, HUD, seed, and control behavior
   remain intact.
7. Typecheck, unit tests, e2e, build, and live suite pass.

## Edge cases

- Ship touching or nearly touching a wall.
- Rays parallel to a wall or exactly at a segment endpoint.
- Wall intersections behind the ray origin.
- Bent tunnel and negative-x positions.
- Scan radius at the minimum and maximum.
- Slider changes just before and just after a scan tick.
- Reset/seed change while a radius change is pending.
- Destroyed ship (no new scans).
- Chart and radar data during the first second.
- Responsive canvas and panel at smaller viewport sizes.

## Affected interfaces

- `packages/sim/src/types.ts`, `constants.ts`, `index.ts`, `simulation.ts`,
  and a new `sensor.ts`.
- `packages/sim/test`, `packages/game/test`, and `e2e`.
- `packages/game/src/render`, `game.ts`, `hud.ts`/`sensor-controls`, `dom.ts`,
  `index.html`, `style.css`.
- `docs/spec.md`, `docs/autonomy.md`, `README.md`, `AGENTS.md` product summary.
- `packages/sim/examples/headless-demo.ts`.

## Determinism and boundary impact

- Sensor scans are deterministic for the same seed, state, actions, and radius
  changes.
- No `Math.random` or wall-clock time in `packages/sim`.
- The UI animation uses simulation time for the sweep; it does not mutate the
  simulation.
- The 360-point array is read-only data exposed through state/observation.

## Verification plan

1. Write this brief and update `docs/spec.md`.
2. Freeze the sensor types/constants and add compiling stubs.
3. Test engineer writes failing sim/e2e tests and proves red.
4. Sim engineer implements ray casting, scan cadence, radius handling, and demo
   telemetry.
5. Gameplay engineer implements the radar overlay, chart panel, slider, and
   test hooks.
6. Code reviewer checks determinism, API shape, UI behavior, and TDD evidence.
7. Lead runs `npm.cmd run verify`.
8. Deliver with `npm.cmd run deliver -- --message "feat: add ship radar sensors"`.

## Open questions

None.

## Delivery waiver

None.

## Confirmation

Confirmed by the user on 2026-10-19.
