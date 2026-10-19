# Moonlander Agent Guide

> Non-trivial changes require a change intake interview and explicit user
> confirmation of the written brief before any implementation or test work.
> See [Change intake interview](#change-intake-interview).
>
> After every successful production build, commit, push, and verify the live
> GitHub Pages deployment. See
> [Delivery after every build](#delivery-after-every-build).

## Product

Moonlander is a 2D side-view Starship endless-course game. The player fires two
canted thrusters (Q = left, W = right) to weave through a seeded, procedurally
generated field of curved walls and gates, surviving hull damage while
accumulating distance and gate score. Fuel is unlimited. The simulation is
deterministic and headless so it can later be used to train and evaluate
autonomous controllers.

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
- Delivery: `npm.cmd run deliver -- --message "..."`

## Change intake interview

No non-trivial change may be implemented, tested, or delegated for
implementation until the intake interview is complete and the user has
explicitly confirmed the written brief.

A change is non-trivial when it:

- adds or changes gameplay, physics, controls, balance, HUD, rendering,
  terrain, or landing rules;
- changes the public `@moonlander/sim` API, observation shape, or the
  simulation/game boundary;
- spans multiple packages or requires coordinated test, implementation, and
  review work;
- has more than one reasonable interpretation or ambiguous acceptance
  criteria;
- fixes a bug not already pinned by a failing test with a clear expected
  behavior.

Trivial edits may proceed directly: typos, comments, formatting, documentation
wording, dependency updates without behavior changes, mechanical refactors,
and fixes fully specified by an existing failing test. When in doubt, treat the
change as non-trivial.

The lead owns this gate and must:

1. Stop. Do not edit code, write tests, or spawn implementation agents.
2. Restate the request and identify affected packages, interfaces, current
   behavior, and constraints.
3. Consult the relevant read-only specialists, at minimum `game-architect` for
   scope and interface impact and `test-engineer` for acceptance criteria, plus
   the responsible engineer for feasibility. Specialists may draft questions,
   risks, options, and criteria but must not implement or write tests.
   Subagents cannot talk to the user directly; the lead relays questions and
   answers.
4. Interview the user in focused rounds until every open question is resolved.
   Offer concrete interpretations and tradeoffs rather than assumptions.
5. Write `docs/changes/YYYY-MM-DD-<slug>.md` with the original request, goal,
   current behavior, desired behavior, non-goals, acceptance criteria, edge
   cases, affected interfaces, determinism/boundary impact, verification plan,
   and open questions. Open questions must be empty before confirmation. This
   brief is the only file change permitted before confirmation.
6. Read the brief back, state the lead's understanding, and ask for an
   unambiguous go-ahead such as "confirmed" or "start development."
7. Begin the test-driven development cycle only after that confirmation.

If scope changes during implementation, stop and re-run the intake interview.
If the user explicitly waives the interview for a specific change, record the
waiver in the brief. The brief complements the tests; tests remain the
executable specification.

## Test-driven development

Complete the change intake interview before starting this cycle.

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

## Delivery after every build

After every successful production build, the lead must run:

```powershell
npm.cmd run deliver -- --message "feat: ..."
```

The script verifies the build, commits the intended changes, pushes to
`origin/main`, waits for the live asset, runs the live Playwright suite, and
reports the result. Use `--dry-run` first, `--stage-all` only when every
working-tree change is intended, and `--help` for the full flag list. The manual
fallback remains: inspect `git status`/`git diff`, stage only intended changes,
commit, push, wait for the GitHub Pages deployment, and run
`npm.cmd run test:e2e:live`.

Do not commit or push a failing build. If the user explicitly waives delivery
for a specific build, record the waiver in the change brief. This rule applies
to every build from now on.

## Agent ownership

- `game-architect`: architecture, simulation API, and boundary reviews. Read-only.
- `test-engineer`: tests only (`packages/*/test`, `e2e`).
- `sim-engineer`: implementation only in `packages/sim/src` and
  `packages/sim/examples`.
- `gameplay-engineer`: implementation only in `packages/game`.
- `release-engineer`: CI, deployment, Playwright live verification, scripts.
- `code-reviewer`: independent review. Read-only.

Agents must not run `git commit`, `git push`, or modify `.git`. The lead owns
integration and delivery.

Subagents may spawn additional subagents of their own kind when it genuinely
parallelizes disjoint work. Delegated agents inherit the same ownership
boundaries, may not commit or push, and must not change shared interfaces. Keep
delegation to one additional level and no more than two concurrent children.
The lead remains responsible for integration and final verification.

## Parallel execution

The lead may run multiple subagents concurrently only when their edit scopes
are disjoint (for example, simulation tests and game tests, or `packages/sim`
implementation and `packages/game` implementation). The lead freezes shared
interfaces in `docs/spec.md` before parallel work starts.

Only one Playwright process may run at a time because the local Vite server uses
port 4173. Unit tests and typechecks may run in parallel. The lead serializes
browser runs, integrates all changes, runs the full verification suite, and owns
the final commit and push.

## Engineering rules

- TypeScript strict mode; no `any` in public APIs.
- Physics is deterministic, fixed-timestep, and seeded.
- Rendering reads simulation state; it never mutates it.
- Keep the public `@moonlander/sim` API stable and documented.
- Prefer small pure functions with unit tests.
- No comments unless they explain non-obvious invariants or physics.
- Keep the whole project runnable from Node 24 and deployable as static files.
