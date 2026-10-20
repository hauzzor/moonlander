---
name: game-contract
description: Use when editing packages/game, Canvas rendering, camera, input, HUD, seed controls, sensor console, responsive layout, or the documented data-testid hooks. Covers render-only state access, the fixed-step loop, controls, and Playwright stability.
---

# Game presentation contract

## Architecture

`packages/game` is Vite plus Canvas 2D. It owns bootstrap, the fixed-step loop,
camera, input, HUD, seed controls, sensor console, and rendering. It imports the
simulation as `@moonlander/sim` and never reimplements physics.

- The loop uses an accumulator with the fixed simulation step.
- Rendering reads simulation and field state; it never mutates them.
- Camera presentation may use deterministic easing and speed-based zoom, but the
  simulation is unaffected.
- No `Math.random` for scene layout or seeds.

## Controls

- `Q` fires the left bottom thruster.
- `W` fires the right bottom thruster.
- `Space` toggles the rear booster; reset the latch on `R`, blur, and page hide.
- `E` toggles the autopilot; manual input is ignored while active.
- `R` starts a new seeded run and resets the autopilot controller.
- The seed input loads an unsigned 32-bit seed deterministically.

## Documented hooks

Preserve every `data-testid` listed in `docs/spec.md`, including:

- `game-canvas`
- `hud-hull`, `hud-speed`, `hud-progress`, `hud-score`
- `thruster-left`, `thruster-right`, `thruster-rear`
- `autopilot-status`, `instructions`, `outcome`
- `seed-display`, `seed-input`, `seed-load`
- `eye-sensor-panel`, `eye-sensor-chart`, `eye-sensor-radius`,
  `eye-sensor-radius-value`, `eye-sensor-scan-tick`
- `direction-needle`, `direction-value`
- `distance-to-start`
- `velocity-speed`, `velocity-vx`, `velocity-vy`, `velocity-angle`

HUD values come from simulation state, never from render-only mutable state.
`data-value` carries numeric values; `data-active` reflects the simulation.

## Presentation

- Canvas side view: tunnel, walls, ribs, haze, Starship, thruster flames, radar.
- Camera follows in 2D with look-ahead; it never rotates.
- Bottom-right sensor console: eye chart, radius slider, direction needle,
  distance to start, velocity.
- Responsive two-column console on desktop; stacked or scrollable on narrow
  screens.
- Destroyed overlay includes the final score; instructions mention Q, W, Space,
  E, and R.

## Testing

Tests are owned by `test-engineer`. Do not edit `packages/game/test` or `e2e`.
Run typecheck, unit tests, build, and relevant Playwright tests. Report visual
or behavioral risks, including canvas sizing, DPR, focus handling, and responsive
overlap.
