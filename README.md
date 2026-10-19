# Moonlander

A 2D side-view Starship endless-course game. Fire the two canted thrusters to
weave through a seeded, procedurally generated field of curved walls and gates.
Thrust is unlimited; the hull is not.

Play: https://hauzzor.github.io/moonlander/

## Controls

- `Q` — fire the left thruster (upward and rightward force, clockwise torque)
- `W` — fire the right thruster (upward and leftward force, counter-clockwise torque)
- `R` — start a new run with a new seed
- Seed field — enter an unsigned 32-bit seed and load it to replay a course

Both thrusters together produce balanced vertical lift. There is no fuel.

## Rules

- The Starship starts with 100 hull.
- Impacts below roughly 2 m/s are harmless; faster impacts damage the hull and
  bounce the ship away from the surface.
- A short invulnerability window follows each damaging impact.
- The run ends when hull reaches zero.
- Progress is the farthest distance reached from the spawn point.
- Score is `floor(progress)` plus 50 points for each gate passed.
- Gates are optional scoring challenges. Hitting a gate frame is a collision.

The field is infinite in every direction with a solid ground plane at `y = 0`.
The course is generated deterministically from the seed, so the same seed and
actions produce the same run.

## Project layout

- `packages/sim` — pure, deterministic, headless TypeScript simulation. No DOM,
  browser globals, runtime dependencies, or `Math.random`.
- `packages/game` — Vite + Canvas 2D presentation, keyboard input, HUD, and the
  fixed-step game loop.
- `e2e` — Playwright tests for the shell and playable game.
- `.github/workflows/ci.yml` — verification, GitHub Pages deployment, and live
  browser tests against the deployed URL.

The simulation is fixed at 120 Hz with a seeded infinite field and exposes
observations and a `Controller` interface for autonomous control experiments:
[`docs/autonomy.md`](docs/autonomy.md).

## Local development

Node 24 is required. On Windows in this environment, use the `.cmd` executables
because PowerShell script execution is disabled.

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run sim:demo
```

The production build is emitted to `packages/game/dist`.

## Verification

`npm.cmd run verify` runs typecheck, unit tests, browser tests, and the
production build. Every push to `main` runs the same checks, deploys the built
site to GitHub Pages, and then runs the full Playwright suite against the live
deployment.

`npm.cmd run test:e2e:live` runs the browser suite against
`https://hauzzor.github.io/moonlander/` by default.
