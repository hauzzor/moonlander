# Game Modularization

## Change tier

Tier 2 — mechanical refactor with no gameplay, physics, scoring, or visual
change.

## Original request

The user confirmed the workflow speedups plan, including splitting the
943-line `packages/game/src/main.ts` into focused modules so future game work
can be parallelized safely.

## Goal

Preserve the current Starship game behavior while separating bootstrap,
wiring/loop, camera, input, HUD, seed controls, and rendering into small
modules. Add pure helper tests for seed and camera behavior.

## Current behavior

- `packages/game/src/main.ts` owns DOM lookup, canvas setup, viewport, camera,
  input, HUD, seed controls, reset/restart, the fixed-step loop, and all
  rendering.
- `parseSeed`, `nextSeed`, camera target/snap/update, and `worldToScreen` are
  private functions.
- Existing e2e tests cover the playable page, HUD, seeds, controls, and canvas.

## Desired behavior

No user-visible change. The same page renders the same Starship, field, HUD,
camera, seed controls, and outcomes.

Module boundaries:

```
main.ts                 bootstrap only
game.ts                 wiring, reset, fixed-step loop
dom.ts                  element/canvas helpers
seed.ts                 parseSeed, nextSeed, seed constants
camera.ts               Camera, Viewport, target, snap, update, worldToScreen
input.ts                Q/W/R listeners and release behavior
hud.ts                  telemetry, seed display, outcome
seed-controls.ts        seed input/load/copy wiring
render/index.ts         renderer orchestration and resize
render/backdrop.ts      stars, nebula, ground
render/field.ts         walls, gates, chunk traversal
render/ship.ts          Starship, flames, invulnerability ring
```

## Non-goals

- No gameplay, physics, scoring, collision, HUD wording, color, or camera
  behavior changes.
- No new dependencies.
- No simulation changes.
- No test-hook changes.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Module granularity | Separate render/backdrop, render/field, and render/ship | Enables future disjoint parallel work |
| Camera state | `Camera { x, y, ready }` with `createCamera`, `snapCamera`, `updateCamera` | Makes the current private `cameraReady` state testable |
| Pure helper tests | `seed.test.ts` and `camera.test.ts` | Pin behavior before extraction |
| Rendering behavior | Preserve current draw order and constants | Refactor must be behavior-neutral |
| Main entry | Bootstrap only | Keep wiring in `game.ts` |

## Contract freeze

Public game-local contracts:

```ts
interface Camera {
  x: number;
  y: number;
  ready: boolean;
}

interface Viewport {
  width: number;
  height: number;
  scale: number;
  dpr: number;
}

function createCamera(): Camera;
function cameraTarget(state: SimState): Vec2;
function snapCamera(camera: Camera, state: SimState): void;
function updateCamera(camera: Camera, state: SimState, deltaSeconds: number): void;
function worldToScreen(
  viewport: Viewport,
  camera: Camera,
  x: number,
  y: number,
): Vec2;

function parseSeed(raw: string | null): number | null;
function nextSeed(seed: number): number;
```

Stub files:

- `packages/game/src/seed.ts`
- `packages/game/src/camera.ts`

Typecheck command: `npm.cmd run typecheck:game`.

Expected red failure: the stubs throw `not implemented`; tests fail for
missing behavior, not missing exports.

## Test matrix

| Area | Unit tests | E2E tests | Determinism / edge cases | Owner |
| --- | --- | --- | --- | --- |
| Seed parsing | Valid, whitespace, zero, max, negative, overflow, decimal, empty, null | Seed input/load via existing e2e | 32-bit normalization | test-engineer |
| Next seed | Known deterministic values, wraparound, 32-bit range | R changes seed via existing e2e | Same seed input → same next seed | test-engineer |
| Camera target | Zero velocity, positive/negative look-ahead, clamps | Camera behavior visually via e2e canvas | Large velocities | test-engineer |
| Camera snap/update | Snap sets ready and target; update blends; not-ready snaps | Existing game behavior | Large/small dt | test-engineer |
| Screen projection | Center and offset projection | Canvas renders | DPR-independent math | test-engineer |
| Full game | — | Existing 13 Playwright tests unchanged | Reset, destroyed, seed load | lead |

## Acceptance criteria

1. `main.ts` is bootstrap-only and under ~100 lines.
2. No rendering, HUD, input, seed, camera, or loop logic remains in `main.ts`.
3. `seed.ts` and `camera.ts` exports match the frozen contract.
4. `packages/game/test/seed.test.ts` and `camera.test.ts` pass.
5. Existing 13 e2e tests pass unchanged.
6. Typecheck, 38 simulation tests, build, and live suite pass.
7. No visual or behavioral change in a manual dev-server check.

## Edge cases

- Empty, null, negative, decimal, and overflowing seed strings.
- `nextSeed` wrapping at 32 bits.
- Camera not ready yet.
- Large positive/negative velocities and look-ahead clamps.
- Resize before the first render.
- Seed input focus and Enter handling.
- R during flight.
- HUD update after reset.

## Affected interfaces

- New game-local exports in `seed.ts`, `camera.ts`, `dom.ts`, `input.ts`,
  `hud.ts`, `seed-controls.ts`, `game.ts`, and `render/*`.
- Existing page test hooks unchanged.
- No changes to `@moonlander/sim`.

## Determinism and boundary impact

- The 120 Hz fixed-step loop remains in the game package.
- Rendering still reads simulation state only.
- `packages/sim` remains DOM-free.
- No new randomness.

## Verification plan

1. Create the contract stubs and run `npm.cmd run typecheck:game`.
2. Test engineer writes failing seed/camera tests and proves red.
3. Gameplay engineer implements the modules and rewires `main.ts`.
4. Run `npm.cmd run verify`.
5. Manual dev-server visual check.
6. Code review for behavior drift.
7. Deliver with `npm.cmd run deliver -- --message "refactor: modularize Starship game"`.

## Open questions

None.

## Delivery waiver

None.

## Confirmation

Confirmed by the user's "confirmed" on the workflow speedups plan,
2026-10-19.
