# Multi-Level Space: Sandworm Gut, Gravity, and Anti Gravity

## Change tier

Tier 3 — cross-package simulation world model, public API, new controls, game
UI, level menu, open-space rendering, and documentation. No change to the fixed
120 Hz step or the default Level 1 autopilot benchmark.

## Original request

Add a second level with no ground, freely floating space, and planets as
gravity-source obstacles; add a third level with inverted gravity and drifting
planets; add a start menu with free level selection and an in-game menu button;
add an advanced gravity heat-map view; add a top downward thruster and remap
controls. Level 1 becomes "Inside the Sandworm's Gut".

## Goal

Turn Moonlander into a three-level game without weakening the deterministic
simulation or the existing tunnel level. The player can choose any level from a
start menu, pause and return to it from the game, and explore open 2D space with
planet gravity, collisions, absolute-distance progress, and a heat-map view.

## Current behavior

- `Field` is tunnel-only: `tunnel`, wall chunks, wall collision, eye rays against
  walls, and x-forward progress.
- `Action` has `left`, `right`, `rear`; no top thruster.
- Gravity is a single uniform scalar; open space has no planet sources.
- The game starts directly into Level 1; there is no start menu, level selection,
  pause menu, or heat-map view.
- Level 1 controls are Q/W/Space/E/R; E is autopilot.

## Desired behavior

### Levels

**Level 1 — Inside the Sandworm's Gut**
- Keep the current bending tunnel, wall collision, eye sensor/radar, x-forward
  progress, and default autopilot benchmark.
- Display name: `Inside the Sandworm's Gut`; internal id `sandworm`.
- Keep uniform downward gravity, scaled by the existing `gravityScale` control.
- Add the new top thruster, controls, menu, and heat-map view.

**Level 2 — Gravity**
- Open 2D space, no ground, no tunnel walls, no uniform downward gravity.
- Planet gravity only; the ship can move infinitely in every direction.
- Planets are fixed seeded obstacles and gravity sources.
- Progress is the maximum Euclidean distance from spawn; score is
  `floor(progress)`.
- Planets are solid; ship collisions use the existing damage, bounce, and
  invulnerability rules.
- Eye rays hit planet surfaces; the sensor console/radar remains usable.
- A is available but may be unsafe; show an explicit open-space warning.
- Heat map shows planet gravity magnitude.

**Level 3 — Anti Gravity**
- Same open-space layout and progress as Gravity.
- Planet gravity is repulsive; no uniform base gravity.
- Planets drift slowly and repel each other; if they collide, they bounce as
  equal-mass hard bodies with restitution `0.8` and no destruction.
- The ship is pushed away from planets instead of pulled.
- A is available but may be unsafe; same warning.
- Heat map shows repulsive gravity magnitude.

### Planet model

- Radius `24 m` (about the Starship's 48 m length).
- Surface gravity `8.0 m/s²` (slightly below a bottom thruster's 8.69 m/s²
  vertical acceleration at default power).
- Inverse-square magnitude with a smooth cutoff at `480 m` beyond the planet
  surface (10 ship lengths):
  - At the surface: `8.0 m/s²`.
  - At 480 m beyond the surface: exactly zero.
  - Beyond: zero.
  - Near/inside the center: finite (softened to zero at the exact center).
  - `gravityScale` multiplies the magnitude; additive superposition for
    overlapping fields.
- Initial spacing: at least `192 m` of empty space between planet surfaces
  (4 ship lengths). Medium density: deterministic one-candidate-per-500 m cell
  with 60% occupancy; fields often overlap.
- Spawn clearance: no planet within `300 m` of the ship spawn.
- Planet positions/ids are deterministic from the seed; queries are sorted and
  order-independent.
- Level 2 planets are fixed. Level 3 initial drift speed is `0.2..1.0 m/s` in a
  deterministic seeded direction; speed cap `2 m/s`; damping `0.02 s⁻¹`.
- Level 3 mutual repulsion is a soft acceleration inside a short range; it is not
  a hard separation rule, so planets can still collide and bounce.
- Planet-planet collisions: equal mass, circle-circle, restitution `0.8`, no
  destruction, deterministic order.

### Controls and top thruster

- `Q` left bottom thruster, continuous.
- `E` right bottom thruster, continuous.
- `W` top downward thruster, continuous.
- `Space` rear thruster latch.
- `A` autopilot toggle.
- `R` new seed in the current level.
- `Esc` open/close the in-game menu.
- `H` toggle the advanced heat-map view.
- Top thruster: `1800 N`, centered at `{ x: 0, y: 9 }`, local downward force,
  zero torque. Add a separate top-power slider `0.1x..10x` in the SIM panel.
- Autopilot owns all four thrusters (left, right, top, rear) while active.
- Update HUD, instructions, flames, and accessibility labels for the top
  thruster and new keys.

### Start menu and pause menu

- The app boots to a start menu with three freely selectable level cards:
  Inside the Sandworm's Gut, Gravity, Anti Gravity.
- A valid `?level=sandworm|gravity|anti-gravity` deep link auto-starts that
  level; otherwise the menu is shown.
- `?seed=` is honored; level selection starts a new seed unless the URL supplies
  one. R reseeds the current level.
- Starting a level writes `level` and `seed` to the URL while preserving SIM
  parameters (`speed`, `gravity`, `bottomPower`, `topPower`, `rearPower`).
- In-game menu button opens a pause overlay with Resume, Restart, and Return to
  Start. Pause freezes ticks, releases input and the rear latch, and resets the
  accumulator on resume so no catch-up burst occurs.
- Return to Start abandons the run and shows the start menu.
- While a menu is open, Q/E/W/Space/A/R are ignored; focus returns to the menu
  button on resume.
- Destruction does not force the menu; Resume/Restart/Return remain available.

### Progress, HUD, and sensors

- Level 1 progress: current x-forward metric.
- Levels 2/3 progress: maximum Euclidean distance from spawn; monotonic;
  `score = floor(progress)`.
- `distanceToStart` remains current Euclidean distance.
- HUD shows the active level name and progress metric.
- Open-space observation uses finite neutral tunnel fields
  (`tunnelCenterOffset = 0`, `tunnelHalfWidth = 0`, `tunnelHeading = 0`,
  `forwardSpeed = vx`, `lateralSpeed = vy`).
- `nearestWallDistance` becomes nearest solid surface clearance (walls or
  planets); the name is kept for API stability.
- Eye rays hit planet surfaces in open levels and walls in Level 1.
- Autopilot A is available in all levels. Level 1 keeps the existing controller
  and benchmark. Levels 2/3 reuse the tunnel controller and display a visible
  "autopilot is tuned for the tunnel" warning; no open-space safety benchmark is
  claimed.

### Advanced gravity heat map

- Toggle via the pause menu and `H`; available in all levels.
- Magnitude-only heat map; no gravity direction arrows. The ship direction
  needle remains.
- Level 1 shows the uniform downward field scaled by the gravity slider.
- Levels 2/3 show planet fields, attractive or repulsive.
- Rendering-only: sample `gravityAt` at low resolution, cache, and never mutate
  simulation state. Toggle off stops sampling/drawing.

## Non-goals

- No planet destruction, splitting, mining, or resources.
- No true infinite N-body simulation; open space uses deterministic cell
  generation and a practical active set.
- No new open-space autopilot benchmark; A may be unsafe outside Level 1.
- No multiplayer, audio, leaderboards, or touch controls.
- No change to Level 1 tunnel geometry, collision, sensors, or autopilot
  benchmark.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Open gravity | Planet gravity only | User |
| Progress | Max Euclidean distance from spawn | User |
| Planet radius | 24 m | User |
| Gravity law | Inverse-square, smooth cutoff at 10 ship lengths | User |
| Planet spacing | Medium density, 192 m surface gap | User |
| Ship-planet collision | Solid, same damage/bounce/invulnerability | User |
| Open autopilot | A available but may be unsafe | User |
| Open sensors | Eye rays hit planets; keep console/radar | User |
| Menu | Boot menu; pause with Resume/Restart/Return | User |
| URL/seed | Level + seed in URL; new seed on start; R reseeds | User |
| Top thruster | 1800 N top-center downward, zero torque; separate top power | User |
| Heat map | Menu + H, magnitude-only, all levels | User |
| Anti-gravity planets | Gentle seeded drift + mutual repulsion | User |
| Planet collisions | Equal-mass bounce, restitution 0.8 | User |

## Contract freeze

### Simulation types

- `LevelId = "sandworm" | "gravity" | "anti-gravity"`.
- `Planet { id: string; position: Vec2; velocity: Vec2; radius: number;
  surfaceGravity: number; polarity: "attract" | "repel" }`.
- `Field` becomes a discriminated union:
  - `TunnelField { kind: "tunnel"; tunnel: Tunnel; ... }`
  - `SpaceField { kind: "space"; planets: readonly Planet[]; ... }`
  - Both expose `gravityAt(position): Vec2`, `progressAt(position): number`,
    `planetsInView(center, radius): readonly Planet[]`, and `wallsInView(...)`.
- `Action.top?: boolean`, defaulting to `false`; `SimState.thrusters.top` is
  always present.
- `SimulationOptions.level?: LevelId`, `topThrusterScale?: number`.
- `SimState.level`, `thrusters.top`, `topThrusterScale`, `gravityAcceleration`,
  and nearby `planets`.
- `Observation.level`, `topThrusterScale`, `gravityAcceleration`, nearby
  `planets`; neutral tunnel fields in open levels.
- `Simulation.level`, `world`, `setTopThrusterScale(scale)`, and existing
  setters. `world` is the authoritative level seam; `field` remains the Level 1
  tunnel compatibility accessor.
- `createSimulation({ level })`; default `"sandworm"`. Switching levels creates a
  new simulation; no `setLevel`.
- `createField(seed)` remains the tunnel field; add
  `createSpaceField(level, seed)`.

### Constants

- `PLANET_RADIUS = 24`, `PLANET_SURFACE_GRAVITY = 8.0`,
  `PLANET_GRAVITY_RANGE = 480`, `PLANET_CELL_SIZE = 500`,
  `PLANET_DENSITY = 0.6`, `PLANET_MIN_SURFACE_GAP = 192`,
  `PLANET_SPAWN_CLEARANCE = 300`.
- `PLANET_DRIFT_MIN = 0.2`, `PLANET_DRIFT_MAX = 1.0`,
  `PLANET_DRIFT_SPEED_CAP = 2`, `PLANET_DRIFT_DRAG = 0.02`,
  `PLANET_PLANET_RESTITUTION = 0.8`.
- `TOP_THRUSTER_FORCE = 1800`, `TOP_MOUNT = { x: 0, y: 9 }`.
- Reuse `THRUSTER_SCALE_MIN/MAX/DEFAULT` for the top power.

### Game hooks

- `start-menu`, `level-card-sandworm`, `level-card-gravity`,
  `level-card-anti-gravity`, `level-start`, `level-name`.
- `game-menu-button`, `game-menu`, `menu-resume`, `menu-restart`,
  `menu-return`, each with documented state attributes.
- `thruster-top`, `top-power`, `top-power-value`, `gravity-heatmap-toggle`,
  `gravity-heatmap`.
- `current-level` / `hud-level` with `data-level`.
- Keep every existing hook and update instructions/HUD.

### Test contract

- Level 1 regression: current tunnel state/action traces, collision, sensors,
  and 8-seed benchmark unchanged at default scales.
- Level 2: deterministic fixed planets, radius/spacing/spawn clearance, gravity
  formula (8.0 at surface, zero at 480 m, superposition), solid collisions,
  absolute progress, no walls/base gravity.
- Level 3: deterministic drift/repulsion/planet collisions, restitution 0.8,
  speed cap, repulsive ship gravity, reset determinism.
- Top thruster: force/torque/scaling, `Action.top`, HUD/flame, all control
  mappings and negative old mappings.
- Menu: boot menu, deep link, free selection, pause freeze, resume, restart,
  return, URL/seed, key isolation, focus.
- Heat map: magnitude-only sampling, all levels, level-1 uniform field,
  attract/repel, read-only rendering, toggle.
- Tests: sim level/planet/gravity/drift/collision/sensor/progress/top tests; game
  menu/control/HUD/heatmap tests; e2e level/menu/controls/heatmap/layout.

## Test matrix

| Area | Unit tests | E2E tests | Determinism/edge cases | Owner |
| --- | --- | --- | --- | --- |
| Level selection | Config/defaults | Menu cards, deep links | Invalid level, seed | test-engineer |
| Planet generation | Determinism, spacing, radius | Visible planets | Spawn clearance, large coords | test-engineer |
| Gravity | Formula, superposition, attract/repel | Heat map | Surface/zero/inside | test-engineer |
| Ship-planet collision | Swept, relative speed, damage | Crash, bounce | Moving planets | test-engineer |
| Planet-planet collision | Equal mass, restitution 0.8 | Drift/bounce | Speed cap, no destruction | test-engineer |
| Progress | Max Euclidean | HUD values | Monotonic, reset | test-engineer |
| Top thruster | Force/torque/scaling | W flame/HUD | Old keys negative | test-engineer |
| Menu/pause | Freeze/resume/restart/return | Menu, pause, URL | Focus, keys, destruction | test-engineer |
| Heat map | Sampling purity | Toggle, L1/L2/L3 | Cache/read-only | test-engineer |
| Level 1 regression | Existing suite | Existing suite | Benchmark unchanged | test-engineer |

## Acceptance criteria

1. The start menu lists all three levels; any level starts freely; `?level=`
   deep links work; invalid levels show the menu.
2. Level 1 keeps the tunnel, x-progress, sensors, and benchmark, and displays
   `Inside the Sandworm's Gut`.
3. Level 2 has no ground/walls, deterministic fixed planets, additive attractive
   gravity, solid planet collisions, and max-Euclidean progress.
4. Level 3 has repulsive gravity, deterministic drifting planets, mutual
   repulsion, equal-mass bounce with restitution 0.8, and no destruction.
5. A works in all levels; Level 1 benchmark is unchanged; open levels show the
   unsafe-autopilot warning.
6. Eye rays hit planets; console/radar remain usable; `nearestWallDistance` is
   nearest solid surface.
7. Controls are Q left, E right, W top, Space rear, A autopilot, R new seed,
   Esc menu; top thruster and top power work.
8. The in-game menu pauses, resumes without catch-up, restarts, and returns to
   the start menu; keys are isolated; URL/seed state is correct.
9. Heat map toggles in all levels, shows magnitude only, and never mutates state.
10. Level 1 regression and full verify/live suite pass.

## Edge cases

- Invalid/out-of-range level/seed/SIM params.
- Start/pause/changelog modal interaction and focus.
- R during flight/destruction; level change; return to start.
- Planet near spawn, overlapping fields, surface/zero/inside gravity.
- High-speed ship-planet collision; moving-planet relative impact.
- Planet-planet collision at speed cap; no destruction.
- Anti-gravity planet drift and reset determinism.
- Large coordinates and infinite-map queries.
- Level 1 autopilot benchmark unchanged.
- Heat map toggle, cache, narrow layout.
- Existing build label, changelog, sensor visibility, and SIM panel behavior.

## Affected interfaces

- `packages/sim`: `types.ts`, `constants.ts`, `field.ts`, new `space-field.ts`/
  `planet.ts`/`gravity.ts`/`planet-dynamics.ts`, `physics.ts`, `collision.ts`,
  `sensor.ts`, `simulation.ts`, `autopilot.ts`, `index.ts`, sim tests.
- `packages/game`: `main.ts`, `game.ts`, `menu.ts` (new), `input.ts`, `hud.ts`,
  `sim-panel.ts`, `index.html`, `style.css`, `render/index.ts`,
  `render/space.ts`/`planet.ts`/`heatmap.ts` (new), `render/ship.ts`, `camera.ts`,
  game tests.
- `e2e`: new level/menu/heatmap coverage and updates to all existing suites.
- `docs/spec.md`, `docs/autonomy.md`, `docs/CHANGELOG.md`, `AGENTS.md` rebuild
  status.

## Parallelization plan

Contract first, then two-ticket waves with disjoint package scopes:

- **Wave 1 (serial):** T-0022 contract and compiling stubs — LevelId, Planet,
  Field union, Action.top, options/state/observation, constants, stubs; typecheck.
- **Wave 2:** T-0023 sim space field/gravity/collision/sensors and T-0024 game
  start menu/level selection/pause/URL (sim vs game; disjoint).
- **Wave 3:** T-0025 sim top thruster/controls physics and T-0026 game controls/
  top thruster HUD/render/instructions (sim vs game; disjoint).
- **Wave 4:** T-0027 sim anti-gravity drift/repulsion/planet collisions and
  T-0028 game heat map/level-aware renderer/HUD/progress (sim vs game; disjoint).
- **Wave 5:** T-0029 e2e/integration/docs/final regression; serial.

Sim shared files are serialized by wave; game shared files are serialized by
wave. Each ticket pairs with `test-engineer`. Deliver sim-only waves with
`--no-live`; run the live suite at the final wave.

## Determinism and boundary impact

- `FIXED_DT = 1/120` unchanged.
- Level 1 behavior and benchmark remain byte-for-byte stable at default scales.
- Planet generation, drift, repulsion, and collisions are seeded and tick-based;
  no `Math.random`, wall-clock, frame count, or DOM in `packages/sim`.
- Queries are deterministic and sorted; renderer/heat map are read-only.
- Level/speed/gravity/power settings are replay inputs; seed alone is insufficient
  when settings differ.

## Verification plan

1. Contract typecheck after stubs.
2. Unit tests per wave; level 1 regression.
3. `npm.cmd run verify` every wave.
4. Reviewer full review.
5. `--no-live` for sim-only/intermediate waves; live suite at T-0029.
6. Update spec, autonomy, changelog, and final report.

## Open questions

None.

## Delivery waiver

Sim-only/intermediate waves may use `--no-live` under the standing waiver; the
final wave runs the full live suite.

## Confirmation

Confirmed by the user on 2026-10-21.
