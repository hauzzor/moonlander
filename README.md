# Moonlander

A 2D side-view Starship endless-tunnel game. Fire two aggressive canted
thrusters to fly manually through a seeded, enclosed tunnel that winds
rightward. Atmospheric drag makes inputs responsive and damped. Thrust is
unlimited; the hull is not.

Play: https://hauzzor.github.io/moonlander/

## Controls

- `Q` — fire the left thruster (upward and rightward force, clockwise torque)
- `W` — fire the right thruster (upward and leftward force, counter-clockwise torque)
- `R` — start a new run with a new seed
- Seed field — enter an unsigned 32-bit seed and load it to replay a tunnel

Both thrusters together produce balanced vertical lift. There is no fuel.

## Rules

- The Starship starts with 100 hull.
- Atmospheric drag damps linear and angular velocity, so taps and corrections
  settle quickly.
- Impacts below roughly 2 m/s are harmless; faster impacts damage the hull and
  bounce the ship away from the tunnel wall.
- A short invulnerability window follows each damaging impact.
- The run ends when hull reaches zero.
- Progress is the maximum forward x-distance from the spawn point.
- Score is `floor(progress)`.
- There are no gates or free obstacles; the tunnel floor and ceiling are the
  only collision surfaces.

The tunnel is 68 m wide, enclosed, and endless in both directions. The first
120 m is straight, then the seeded centerline bends gently rightward. The same
seed and actions produce the same run.

## Project layout

- `packages/sim` — pure, deterministic, headless TypeScript simulation. No DOM,
  browser globals, runtime dependencies, or `Math.random`.
- `packages/game` — Vite + Canvas 2D presentation, keyboard input, HUD, and the
  fixed-step game loop.
- `e2e` — Playwright tests for the shell and playable game.
- `.github/workflows/ci.yml` — verification, GitHub Pages deployment, and live
  browser tests against the deployed URL.

The simulation is fixed at 120 Hz with a seeded endless tunnel and exposes
observations and a `Controller` interface for autonomous control experiments:
[`docs/autonomy.md`](docs/autonomy.md).

## Change workflow

Non-trivial changes use the intake interview and templates described in
[`AGENTS.md`](AGENTS.md). The brief template is
[`docs/changes/TEMPLATE.md`](docs/changes/TEMPLATE.md); the questionnaire, test
matrix, and contract freeze are under [`docs/templates`](docs/templates/).

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

`npm.cmd run deliver -- --message "feat: ..."` verifies the build, commits the
staged changes, pushes to `origin/main`, waits for the new live asset, and runs
the live Playwright suite. Use `--dry-run` first and `--stage-all` only when
every working-tree change is intended. See `node scripts/deliver.mjs --help`.

`npm.cmd run test:e2e:live` runs the browser suite against
`https://hauzzor.github.io/moonlander/` by default.
