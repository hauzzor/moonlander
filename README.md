# Moonlander

A 2D side-view Starship endless-tunnel game. Fire two aggressive canted
thrusters and a rear booster to fly through a seeded, enclosed tunnel that
winds rightward. Atmospheric drag makes inputs responsive and damped. An
eye sensor, navigation sensors, and an optional autopilot support manual and
autonomous flight. Thrust is unlimited; the hull is not.

Play: https://hauzzor.github.io/moonlander/

## Controls

- `Q` — fire the left thruster (upward and rightward force, clockwise torque)
- `W` — fire the right thruster (upward and leftward force, counter-clockwise torque)
- `Space` — toggle the rear booster on/off
- `E` — toggle the autopilot on/off
- `R` — start a new run with a new seed
- Seed field — enter an unsigned 32-bit seed and load it to replay a tunnel
- View radius slider — adjust the eye sensor range from 20 to 200 m

Both bottom thrusters together produce balanced vertical lift. The rear booster
is half the strength of one bottom thruster and produces no torque. There is no
fuel.

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
- The eye sensor scans 360 absolute world directions once per second. Each ray
  starts at the ship hull rim and reports the distance to the tunnel wall.
  The view radius defaults to 120 m and is adjustable from 20 to 200 m. The
  bottom-right chart shows distance on the Y axis and world angle on the X axis.
- The navigation console also shows a signed direction-to-horizon needle,
  distance from spawn, and the velocity vector.
- The autopilot uses all sensors and the continuous tunnel state, prioritizes
  zero wall contact, and targets maximum safe progress and speed. It is toggled
  with E.

The tunnel is enclosed and endless in both directions. The first 120 m is
straight and 68 m wide; after that the local width varies between 50 and 110 m
total and the seeded centerline bends near-vertically (up to 85 degrees) without
doubling back. The same seed and actions produce the same run.

## Project layout

- `packages/sim` — pure, deterministic, headless TypeScript simulation. No DOM,
  browser globals, runtime dependencies, or `Math.random`.
- `packages/game` — Vite + Canvas 2D presentation, keyboard input, HUD, and the
  fixed-step game loop.
- `e2e` — Playwright tests for the shell and playable game.
- `.github/workflows/ci.yml` — verification, GitHub Pages deployment, and live
  browser tests against the deployed URL.

The simulation is fixed at 120 Hz with a seeded endless tunnel and exposes a
four-block sensor suite, observations, and a deterministic autopilot
`Controller` for autonomous control experiments:
[`docs/autonomy.md`](docs/autonomy.md).

## Change workflow

Non-trivial changes use the intake interview and templates described in
[`AGENTS.md`](AGENTS.md). The brief template is
[`docs/changes/TEMPLATE.md`](docs/changes/TEMPLATE.md); the questionnaire, test
matrix, and contract freeze are under [`docs/templates`](docs/templates/).

## Ticket runner

This section describes background-runner mode. The current interactive mode uses
one-session waves; see `AGENTS.md`.

New work can be queued locally while the runner is busy with other tickets.

```powershell
npm.cmd run tickets:new -- "Change the thruster sound"
npm.cmd run tickets:list
npm.cmd run tickets:status
npm.cmd run tickets:plan
npm.cmd run tickets:run
```

Tickets live under `docs/tickets/` and move through `inbox`, `needs-info`,
`ready`, `in-progress`, `review`, `done`, and `blocked`. Only confirmed `ready`
tickets with satisfied dependencies and non-overlapping scopes are claimed.
Large requests should be split into child tickets, and every ticket declares a
`Parallelization plan`. The current one-session mode executes up to two
implementation tickets per wave. `npm.cmd run tickets:plan` prints scope
conflicts and suggested waves; shared files, verification, delivery, and live
checks are serialized. Waves use a test contract, a wave context pack, focused
review packets, fresh test and review sessions, and guarded sim-engineer reuse.
Local verify runs every wave; live Playwright runs at the milestone tickets
defined in `AGENTS.md`.

The runner runs in a dedicated terminal and streams claims, agent sessions,
test results, the merge queue, and delivery status. Use
`npm.cmd run tickets:status -- --watch` for a live snapshot and
`npm.cmd run tickets:logs -- T-0001 --follow` for per-ticket logs. See
[`docs/tickets/README.md`](docs/tickets/README.md).

Implementation can run in parallel in isolated worktrees in background-runner
mode; merging, deployment, and live verification are serialized per ticket. In
the current one-session mode, subagents share the working tree, so use the
two-ticket wave cap and disjoint scopes.

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
production build. Every push to `main` runs the same checks plus `sim:demo`,
deploys the built site to GitHub Pages, and runs the full live Playwright suite.

`npm.cmd run deliver -- --message "feat: ..."` verifies the build, commits the
staged changes, and pushes to `origin/main`. The delivery task runs the live
Playwright suite at milestones T-0013, T-0009, T-0010, T-0011, and T-0012;
sim-only intermediate waves use `--no-live` under the recorded waiver. Use
`--dry-run` first and `--stage-all` only when every working-tree change is
intended. See `node scripts/deliver.mjs --help`.

`npm.cmd run test:e2e:live` runs the browser suite against
`https://hauzzor.github.io/moonlander/` by default.
