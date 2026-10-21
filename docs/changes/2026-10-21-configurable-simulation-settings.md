# Configurable Simulation Speed, Gravity, and Thruster Power

## Change tier

Tier 3 — cross-package simulation API, game UI, persistence, autopilot
compensation, browser hooks, and documentation. No change to the base physics
model, default benchmark, or the fixed 120 Hz step.

## Original request

Make simulation speed configurable from the UI from 0.1x to 10x. Make gravity
configurable in the same range. During intake the user also asked for separate
bottom and rear thruster-power sliders, each 0.1x-10x, and a collapsible SIM
panel containing all four controls.

## Goal

Give the player live control over wall-clock simulation speed, gravity, and
bottom/rear thruster authority without breaking fixed-step determinism or the
default autopilot benchmark.

## Current behavior

- Simulation speed is fixed to real time: one fixed tick per `1/120 s`.
- Gravity is the constant `GRAVITY = 1.62 m/s²`.
- Bottom and rear thrusters use the constant forces `1800 N` and `900 N`.
- The autopilot imports the gravity constant and assumes default thrust.
- There is no SIM settings panel.
- The only persisted UI setting is the seed; the eye radius persists across
  reset but not across reload.

## Desired behavior

### Time scale

- UI range 0.1x-10x, default 1x.
- `10x` means ten simulated seconds per real second at normal frame rates.
- `FIXED_DT` stays `1/120`. The game scales wall-clock elapsed time before the
  fixed-step accumulator; the simulation never receives a scaled `dt`.
- Dynamic per-frame step cap:
  `maxSteps = ceil(MAX_STEPS_PER_FRAME * timeScale)` with a hard ceiling of
  `1200` steps. Normal and long frames within the existing `0.25 s` raw-frame
  clamp must not silently drop time at 10x; wall time beyond that clamp remains
  the existing safety behavior.
- Camera easing uses scaled simulation time.
- Time scale is game-only; `Simulation` has no time-scale concept.
- Changes apply live on the next frame.

### Gravity

- UI range 0.1x-10x of `1.62 m/s²`, default 1x.
- Effective gravity is `GRAVITY * gravityScale` (0.162-16.2 m/s²).
- `SimulationOptions.gravityScale`, `setGravityScale`, and `SimState` /
  `Observation` fields.
- Clamp finite values to `[0.1, 10]`; non-finite falls back to `1`.
- Apply inside the fixed tick's force/gravity term; preserve fixed-step drag,
  collision, invulnerability, scan cadence, and tick counts.
- Changes apply from the next tick; reset preserves the configured scale.

### Thruster power

- Separate bottom (Q/W) and rear (Space) multipliers, each 0.1x-10x, default 1x.
- Scale force and torque proportionally at the mounts.
- `SimulationOptions.bottomThrusterScale` / `rearThrusterScale` plus setters.
- Expose both scales in `SimState` and `Observation`.
- Changes apply from the next tick; reset preserves the configured scales.
- The combined effect at extreme gravity/power is intentionally a sandbox; it
  may be difficult or impossible to fly.

### Autopilot

- The controller uses effective `gravity`, `bottomThrusterScale`, and
  `rearThrusterScale` from the observation.
- The confirmed 8-seed benchmark remains a **default-scale** contract
  (`gravityScale = 1`, bottom/rear `= 1`).
- Extreme-scale smoke tests require finite observations and deterministic
  behavior; they do not require the default benchmark thresholds.

### SIM panel

- Four logarithmic sliders with numeric readouts:
  - simulation speed (`0.1x`-`10x`, 1x centered)
  - gravity multiplier (`0.1x`-`10x`, effective m/s² shown)
  - bottom thruster power (`0.1x`-`10x`)
  - rear thruster power (`0.1x`-`10x`)
- Slider position is `-1..1` in `log10` space, step `0.05`; scale is
  `10 ** position`.
- The panel is collapsible via a labeled toggle; default expanded.
- It is always visible in manual and autopilot, outside the sensor console.
- While a SIM-panel slider is focused, game keys Q/W/Space/E/R are ignored so
  adjusting settings does not fly the ship. The sensor radius slider keeps its
  existing pass-through behavior from T-0018.
- Readouts update live and expose numeric `data-value` attributes.

### Persistence

- All four settings survive `R`, seed loads, autopilot toggles, and simulation
  reset.
- On page load: URL > localStorage > defaults.
- URL parameters: `?speed=`, `?gravity=`, `?bottomPower=`, `?rearPower=`;
  invalid or out-of-range values clamp or fall back.
- localStorage keys: `moonlander.speed`, `moonlander.gravity`,
  `moonlander.bottomPower`, `moonlander.rearPower`.
- Changing a setting updates the URL with `history.replaceState` so a copied URL
  reproduces the settings.

## Non-goals

- No change to `FIXED_DT` or per-tick physics semantics at default scales.
- No change to the default autopilot benchmark thresholds or seed set.
- No new keyboard shortcuts.
- No change to build metadata or the changelog modal.
- No runtime network dependency.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Speed semantics | Game-loop time scale; fixed ticks | Preserves determinism and physics |
| Gravity semantics | 0.1x-10x multiplier of 1.62 | Matches requested range; keeps default benchmark |
| Thruster power | Separate bottom and rear multipliers | User choice |
| Control layout | Four log sliders in a collapsible SIM panel | User choice |
| Apply timing | Live, next tick | User choice |
| Persistence | R/seed + URL + localStorage | User choice |
| Autopilot | Use effective gravity/power; default benchmark | User choice |
| Frame cap | Scale cap with time scale, hard ceiling 1200 | Avoid dropped time at 10x |
| SIM-panel keys | Ignore game keys while focused | Avoid accidental flight while adjusting |
| Camera | Scaled simulation delta | Keeps easing consistent with speed |

## Contract freeze

### Simulation constants

- `GRAVITY_SCALE_MIN = 0.1`, `GRAVITY_SCALE_MAX = 10`,
  `GRAVITY_SCALE_DEFAULT = 1`.
- `THRUSTER_SCALE_MIN = 0.1`, `THRUSTER_SCALE_MAX = 10`,
  `THRUSTER_SCALE_DEFAULT = 1`.

### Simulation types

- `SimulationOptions.gravityScale?: number`,
  `bottomThrusterScale?: number`, `rearThrusterScale?: number`.
- `SimState.gravityScale`, `gravity`, `bottomThrusterScale`,
  `rearThrusterScale`.
- `Observation.gravityScale`, `gravity`, `bottomThrusterScale`,
  `rearThrusterScale`.
- `Simulation.setGravityScale(scale: number): void`,
  `setBottomThrusterScale(scale: number): void`,
  `setRearThrusterScale(scale: number): void`.
- `thrusterEffect(angle: number, action: Action, bottomScale?: number,
  rearScale?: number): ThrusterEffect` with optional defaults of `1`.
- Default `gravityScale = 1`, bottom/rear `= 1`; reset preserves scales.

### Game contract

- `GameOptions.timeScale?: number`.
- `Game.setTimeScale(scale: number): void`, `Game.getTimeScale(): number`.
- `SIM_TIME_SCALE_MIN = 0.1`, `MAX = 10`, `DEFAULT = 1`.
- `advance(elapsedSeconds)` scales by time scale; `maxSteps` scales with it.
- URL/localStorage precedence as above.

### UI hooks

- `data-testid="sim-panel"`, `sim-panel-toggle` with `aria-expanded` and
  `data-collapsed`.
- `sim-speed`, `sim-speed-value` with `data-value`.
- `gravity-scale`, `gravity-scale-value` with `data-value` (multiplier) and
  `data-gravity` (m/s²).
- `bottom-power`, `bottom-power-value` with `data-value`.
- `rear-power`, `rear-power-value` with `data-value`.
- `simulation-status` with `data-tick`, `data-time`, `data-time-scale`,
  `data-gravity-scale`, `data-gravity`, `data-bottom-power`, `data-rear-power`.

## Test matrix

| Area | Unit tests | E2E tests | Determinism/edge cases | Owner |
| --- | --- | --- | --- | --- |
| Gravity scale | Clamp, formula, setter, reset | Readout and effective value | 0.1/1/10, non-finite | test-engineer |
| Thruster scales | Bottom/rear force and torque, combined lift | Readouts | 0.1/1/10, mixed | test-engineer |
| Time scale | Exact ticks, accumulator, cap | Slider, tick ratio | 0.1/1/10, long frame | test-engineer |
| Observation | New fields and autopilot use | — | Default vs extreme | test-engineer |
| Persistence | URL/localStorage/precedence | R/seed/reload | Invalid values | test-engineer |
| SIM panel | Log mapping/readouts/collapse | Open/collapse/overflow | Focus keys ignored | test-engineer |
| Autopilot | Effective gravity/power | — | Default benchmark + extreme smoke | test-engineer |
| Docs/spec | — | Hooks/controls documented | No stale fixed-gravity text | reviewer |

## Acceptance criteria

1. Four sliders exist with the documented ranges, defaults, step, log mapping,
   and numeric readouts.
2. Simulation speed 10x runs ten simulated seconds per real second at normal
   frame rates; fixed 120 Hz ticks and per-tick physics are unchanged.
3. Gravity scales effective acceleration 0.1x-10x; bottom/rear power scales force
   and torque independently 0.1x-10x.
4. Same seed + same scale schedule + same per-tick actions produce identical
   states; time scale does not change the per-tick trajectory.
5. Settings apply live, persist across R/seed, and load from URL/localStorage
   with the documented precedence.
6. The SIM panel collapses/expands, stays usable in manual/autopilot, and does
   not cause horizontal overflow at desktop or narrow widths.
7. Game keys are ignored while a SIM-panel slider is focused; the sensor radius
   slider keeps T-0018 behavior.
8. The autopilot uses effective gravity/power and the default 8-seed benchmark
   still passes unchanged.
9. The long-frame step cap does not silently drop time at 10x.
10. `npm.cmd run verify`, local Playwright, and the live suite pass with updated
    spec/hooks.

## Edge cases

- Values below/above range, non-finite, zero, negative.
- URL/localStorage unavailable or malformed.
- Mid-run changes and R/seed reloads.
- 10x on a long frame; 0.1x with very few ticks.
- Mixed extreme gravity/power; autopilot at extremes.
- Sensor scan cadence and invulnerability at speed extremes.
- SIM panel focus while flying; slider keyboard Home/End/arrows.
- Collapsed panel and narrow viewport.
- Destroyed state with settings changes.

## Affected interfaces

`packages/sim/src/constants.ts`, `types.ts`, `physics.ts`, `simulation.ts`,
`index.ts`, `autopilot.ts`, sim tests; `packages/game/src/game.ts`,
`sim-panel.ts` (new), `hud.ts`, `input.ts`, `index.html`, `style.css`, game
tests; `e2e`; `docs/spec.md`, `docs/autonomy.md`, `docs/CHANGELOG.md`.

## Parallelization plan

- T-0020 Simulation scales (sim-engineer + test-engineer): gravity and
  bottom/rear power API, observation/autopilot, tests.
- T-0021 SIM panel and time scale (gameplay-engineer + test-engineer): depends
  T-0020; game-loop scaling, panel, persistence, tests/e2e.
- Lead owns `docs/spec.md`, `docs/autonomy.md`, and `docs/CHANGELOG.md`.
- Deliver T-0020 with `--no-live` and T-0021 live, or both together at T-0021.
  Use one live suite at the end.

## Determinism and boundary impact

- `FIXED_DT = 1/120` unchanged.
- Per-tick determinism holds for a fixed `(seed, gravityScale, bottomScale,
  rearScale, action sequence)`.
- Time scale is wall-clock pacing only; it cannot change per-tick outcomes.
- Gravity/power scales are part of the replay inputs; seed alone is no longer
  sufficient when scales differ.
- Autopilot benchmark remains default-scale only.
- Rendering remains read-only.

## Verification plan

1. Unit tests for gravity, power, observation, autopilot, time scale, panel,
   persistence, input guard.
2. Local Playwright for sliders, readouts, collapse, persistence, tick scaling
   with fake clock, layout, no console errors.
3. Build/test at default scales and extremes.
4. `npm.cmd run verify`.
5. Reviewer full review.
6. `--no-live` for T-0020; live delivery and suite for T-0021.
7. Update spec, autonomy, and changelog.

## Open questions

None.

## Delivery waiver

T-0020 may use `--no-live` because it is a sim-only API wave; T-0021 runs the
live suite.

## Confirmation

Confirmed by the user on 2026-10-21.
