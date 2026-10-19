# Moonlander

A 2D side-view lunar landing game. Fire the two canted thrusters to slow the
lander and set it down on the marked pad.

Play: https://hauzzor.github.io/moonlander/

## Controls

- `Q` — fire the left thruster (upward and rightward force, clockwise torque)
- `W` — fire the right thruster (upward and leftward force, counter-clockwise torque)
- `R` — restart

Both thrusters together produce balanced vertical lift. Fuel is shared and
limited.

## Landing rules

A touchdown begins when either landing foot touches down; one foot may contact
first. Nose or body contact crashes. The landing is safe when:

- vertical speed is at most 2.5 m/s
- horizontal speed is at most 1.5 m/s
- tilt is at most 12 degrees

A safe touchdown on the pad wins. A safe touchdown elsewhere is a missed pad;
unsafe contact crashes.

## Project layout

- `packages/sim` — pure, deterministic, headless TypeScript simulation. No DOM,
  browser globals, runtime dependencies, or `Math.random`.
- `packages/game` — Vite + Canvas 2D presentation, keyboard input, HUD, and the
  fixed-step game loop.
- `e2e` — Playwright tests for the shell and playable game.
- `.github/workflows/ci.yml` — verification, GitHub Pages deployment, and live
  browser tests against the deployed URL.

The simulation is fixed at 120 Hz with seeded terrain and exposes observations
and a `Controller` interface for future autonomous control experiments:
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
