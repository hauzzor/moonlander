# Changelog

All notable Moonlander changes. Entry format: `## YYYY-MM-DD — Title` followed
by `-` bullet summaries. The game's Change Log modal reads this file at build
time; no runtime network request is used.

## 2026-10-21 — Configurable simulation settings

- Added 0.1x-10x simulation speed (game-loop time scale), gravity, and separate
  bottom/rear thruster power.
- Added a collapsible SIM panel with logarithmic sliders and URL/localStorage
  persistence.
- The autopilot uses effective gravity and power; the default benchmark is
  unchanged.

## 2026-10-21 — Build info, change log, and autopilot-only sensors

- Show build number, short SHA, and UTC build time in the top bar.
- Add a Change Log modal with expandable history of every previous change.
- Hide the entire sensor console and radar unless autopilot is active.
- Keep the radius slider available only in autopilot mode.

## 2026-10-21 — Rebuild complete

- Rebuilt the game from `docs/spec.md`: near-vertical tunnel, canted thrusters,
  drag, collision damage, four-block sensors, and deterministic autopilot.
- Final verification: 631 unit tests, 40 local and live Playwright tests,
  typecheck, and production build.
- Autopilot benchmark PASS: zero contact, hull 100, median 509.0 m, average
  world-x 8.48 m/s; reduced 20 m radius PASS.
- Live at https://hauzzor.github.io/moonlander/.

## 2026-10-20 — Faster development cycle

- Added the fast wave protocol: wave context pack, test contracts, focused
  review packets, and merged ticket completion.
- Moved live Playwright verification to milestones while keeping local verify
  every wave.
- Guarded subagent session reuse after long reused sessions returned empty.

## 2026-10-20 — Parallel ticket execution and rebuild waves

- Re-decomposed the rebuild into leaf/trunk waves with file-disjoint scopes.
- Added `npm.cmd run tickets:plan` for scope conflicts and suggested waves.
- Capped in-session concurrency at two implementation tickets per wave.

## 2026-10-19 — Near-vertical variable-width tunnel

- Replaced the gentle constant-width tunnel with an x-monotonic centerline.
- Added 50-110 m local width, up to 85 degree sections, and adaptive 8 m wall
  sampling.
- Updated the renderer and camera to draw the actual center, width, and walls.

## 2026-10-19 — Eye sensor and autopilot

- Added 360 absolute-world-angle eye rays from the hull rim, 1 Hz scans, and a
  20-200 m adjustable radius.
- Added direction, distance-to-start, and velocity sensors.
- Added a deterministic safety-first autopilot and fixed-seed benchmark.

## 2026-10-19 — Ship sensors

- Added the four-block sensor suite and the observation contract.
- Added the eye-sensor chart, radius slider, direction needle, distance, and
  velocity console.
- Kept all sensor values finite and deterministic.

## 2026-10-19 — Tunnel drag and thrusters

- Replaced the open field with an enclosed tunnel and removed gates and ground.
- Added canted Q/W thrusters, a rear booster, atmospheric drag, hull damage,
  bounce, invulnerability, and forward-distance scoring.
- Added the Starship HUD and staying-inside-the-tunnel instructions.

## 2026-10-19 — Starship endless course

- Replaced the lunar landing game with an endless side-view Starship flight.
- Removed fuel, the landing pad, finite terrain, and landing outcomes.
- Added a seeded tunnel, hull health, score, and restart flow.

## 2026-10-19 — Game modularization

- Split the game into bootstrap, loop, camera, input, HUD, seed controls, and
  renderer modules.
- Preserved behavior and the documented browser hooks.
- Added pure helper tests for camera and seed logic.

## 2026-10-19 — Workflow speedups

- Added delivery automation, intake and test templates, and contract freeze.
- Added compiling stubs before parallel implementation.
- Split rendering, input, HUD, seed, and camera responsibilities.

## 2026-10-19 — Continuous local ticket queue and runner

- Added the durable Markdown ticket queue and status folders.
- Added a scope/dependency-aware background runner with worktrees, verification,
  merge queue, delivery, and recovery.
- Added per-ticket logs and inspection commands.
