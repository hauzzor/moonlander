# Moonlander Agent Guide

## Product

Moonlander is a 2D side-view lunar landing game. The player fires two canted,
downward-facing thrusters (Q = left, W = right) to land on a marked lunar pad.
The simulation is deterministic and headless so it can later be used to train
and evaluate autonomous controllers.

Repository: https://github.com/hauzzor/moonlander
Live game: https://hauzzor.github.io/moonlander/

## Architecture

- `packages/sim` — pure TypeScript simulation. No DOM APIs, no browser globals,
  no `Math.random`, and no dependencies on the game package.
- `packages/game` — Vite + Canvas 2D presentation, input, HUD, and game loop.
- `e2e` — Playwright browser tests.
- `.github/workflows` — CI, GitHub Pages deployment, and live smoke test.

The simulation boundary is enforced by TypeScript: `packages/sim/tsconfig.json`
must not include the DOM library.

## Commands

On Windows in this environment, use the `.cmd` executables because PowerShell
script execution is disabled.

- Install: `npm.cmd install`
- Dev server: `npm.cmd run dev`
- Unit tests: `npm.cmd test`
- Typecheck: `npm.cmd run typecheck`
- Build: `npm.cmd run build`
- Browser tests: `npm.cmd run test:e2e`
- Live browser smoke test: `npm.cmd run test:e2e:live`

## Test-driven development

Every feature follows this order:

1. The test engineer defines failing tests and proves they fail for the
   intended reason.
2. The failing test is committed locally.
3. The responsible implementation engineer writes the minimum production code
   to make the tests pass.
4. The code reviewer checks the behavior, architecture, and TDD evidence.
5. The lead runs all checks, commits the green implementation, pushes, and
   verifies the GitHub Pages deployment.

Tests are the specification. Do not weaken or delete a test to obtain a green
run. If a test is wrong, the test engineer must explain the defect and update
it as a separate red/green cycle.

## Agent ownership

- `game-architect`: architecture, simulation API, and boundary reviews. Read-only.
- `test-engineer`: tests only (`packages/*/test`, `e2e`).
- `sim-engineer`: implementation only in `packages/sim/src` and
  `packages/sim/examples`.
- `gameplay-engineer`: implementation only in `packages/game`.
- `release-engineer`: CI, deployment, Playwright live verification, scripts.
- `code-reviewer`: independent review. Read-only.

Agents must not run `git commit`, `git push`, or modify `.git`. The lead owns
integration and delivery. Agents must not spawn additional agents.

## Engineering rules

- TypeScript strict mode; no `any` in public APIs.
- Physics is deterministic, fixed-timestep, and seeded.
- Rendering reads simulation state; it never mutates it.
- Keep the public `@moonlander/sim` API stable and documented.
- Prefer small pure functions with unit tests.
- No comments unless they explain non-obvious invariants or physics.
- Keep the whole project runnable from Node 24 and deployable as static files.
