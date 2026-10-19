# Workflow Speedups: Delivery Automation, Templates, Contract Freeze, Game Modules

## Original request

The user asked for proposals to reduce agent thinking and lead time after the
Starship endless-course build, then confirmed the four highest-leverage
proposals:

1. delivery automation,
2. structured intake and test templates,
3. contract-first scaffolding,
4. game modularization.

The user also confirmed that delivery (commit, push, live deployment check)
must happen after every successful build from now on.

## Goal

Reduce future change lead time and thinking without changing gameplay behavior.
Move mechanical delivery, requirements synthesis, test planning, and game
rendering/input/HUD responsibilities out of the lead's critical path, and make
future game work safely parallelizable.

## Baseline

From the Starship session:

- Lead: 122,233 reasoning tokens (36.3% of total), 137.3 min elapsed.
- Game implementation: 57,118 reasoning tokens (17.0%).
- Simulation tests: 47,280 reasoning tokens (14.0%).
- Simulation implementation: 42,113 reasoning tokens (12.5%).
- Review: 34,807 reasoning tokens (10.3%).
- Intake: 26,427 reasoning tokens (7.8%).
- About 38 minutes of wall-clock was GitHub Pages queue/polling.

Targets after this change:

- Lead reasoning share below 25% on future Tier 2/3 changes.
- Intake limited to two rounds.
- Test critical path under 8 minutes.
- Implementation critical path under 25 minutes.
- Delivery waiting automated and reported without manual API polling.

## Workstream A: Delivery automation

### Files

- `scripts/deliver.mjs` (new)
- `package.json` (add `deliver` script)
- `AGENTS.md` (make the script the standard delivery path)
- `README.md` (document the command)

### Behavior

- Explicit command, not a `postbuild` hook, to avoid recursive builds/commits.
- `--message` is required for a commit.
- Staged-only by default; `--stage-all` is required to stage automatically.
- Preflight checks: git repository, branch, remote, merge conflicts, staged
  diff, whitespace.
- Runs `npm.cmd run verify` unless `--skip-verify`.
- Commits, pushes to `origin/main`.
- Reads the local built asset path from `packages/game/dist/index.html`.
- Polls the live site with cache-busting until that asset is served.
- Runs `npm.cmd run test:e2e:live` against the live URL.
- Supports `--dry-run`, `--no-push`, `--no-live`, `--timeout`, `--branch`,
  `--remote`, and `--help`.
- Never force-pushes, amends, or resets.
- Fails without committing or pushing if verification fails.

### Acceptance

- A dry run performs no mutations and prints the planned steps.
- A real run commits and pushes, detects the deployed asset, and passes the
  live suite.
- A failing verification blocks commit and push.
- A deployment that never serves the expected asset exits non-zero with a clear
  status.

## Workstream B: Intake, test, and contract templates

### Files

- `docs/changes/TEMPLATE.md` (new)
- `docs/templates/intake-questionnaire.md` (new)
- `docs/templates/test-matrix.md` (new)
- `docs/templates/contract-freeze.md` (new)
- `AGENTS.md` (reference the templates and enforce the rules)
- `README.md` (optional links)

### Rules

- Ask independent intake questions in one round; maximum two rounds.
- Decision order: scope, view/physics, world, hazards, failure, goal, camera,
  ship, HUD, seed, branding.
- Include contradiction checks.
- Record every answer in the brief decision log.
- Open questions must be empty before confirmation.
- Include a test matrix in every Tier 2/3 brief.
- Freeze public types, constants, and exports before test writing.
- Create compiling stubs with no behavior before parallel implementation.
- Run typecheck after the scaffold so red tests fail for missing behavior, not
  missing exports.

### Acceptance

- The templates cover the sections used by this brief and the previous
  Starship brief.
- `AGENTS.md` points to the templates.
- The game modularization change is the first change delivered using the new
  templates.

## Workstream C: Game modularization

### Target modules

```
packages/game/src/main.ts                 bootstrap only
packages/game/src/game.ts                 wiring, reset, fixed-step loop
packages/game/src/dom.ts                  element/canvas helpers
packages/game/src/seed.ts                 seed parsing, next seed, constants
packages/game/src/camera.ts               camera target, snap, update, projection
packages/game/src/input.ts                Q/W/R input and release behavior
packages/game/src/hud.ts                  telemetry, seed display, outcome
packages/game/src/seed-controls.ts        seed input/load/copy wiring
packages/game/src/render/index.ts         renderer orchestration and resize
packages/game/src/render/backdrop.ts      stars, nebula, ground
packages/game/src/render/field.ts         walls, gates, chunk traversal
packages/game/src/render/ship.ts          Starship, flames, invulnerability ring
```

### Contracts

- `Renderer.resize(): void`
- `Renderer.render(state, camera): void`
- `Hud.update(state): void`
- `Input.keys` and `Input.release(): void`
- `SeedControls.setSeed(seed): void` and `SeedControls.setInvalid(invalid): void`
- `Camera.target(state)`, `Camera.snap(state)`, `Camera.update(state, dt)`

### Tests first

- `packages/game/test/seed.test.ts`: valid and invalid seeds, unsigned 32-bit
  normalization, deterministic next seed.
- `packages/game/test/camera.test.ts`: look-ahead clamps, target math, screen
  projection.
- Existing 13 e2e tests remain unchanged and are the behavior gate.

### Acceptance

- No behavior or visual change.
- `main.ts` is bootstrap-only (under ~100 lines).
- Rendering, HUD, input, seed controls, camera, and loop responsibilities are
  separated as above.
- No duplicated simulation constants; shared values are imported from
  `@moonlander/sim`.
- All typecheck, unit, e2e, build, and live checks pass.
- Manual dev-server visual check covers walls, gates, Starship, camera, HUD, and
  seed controls.

## Non-goals

- Gameplay, physics, scoring, collision, or visual redesign.
- New features beyond the workflow and refactor.
- Session-metrics automation (recommended follow-up, not part of this change).
- Installing GitHub CLI; the delivery script works without it.
- Changing the 120 Hz simulation, determinism, or public simulation API.

## Acceptance criteria

1. `npm.cmd run deliver` implements the safe delivery flow and is documented.
2. The templates and contract-first rules are documented and referenced by
   `AGENTS.md`.
3. Game modularization is behavior-neutral and covered by existing e2e tests
   plus new pure helper tests.
4. Every delivery runs verification and the live suite.
5. No landing/fuel remnants are introduced or reintroduced.
6. The live site continues to serve the Starship build after every delivery.

## Edge cases

- Dirty working tree with unstaged and untracked files.
- No changes to commit.
- Verification failure.
- Push failure.
- Live asset not yet updated.
- Live asset cached by the browser or CDN.
- GitHub Actions queued or stuck.
- Invalid or empty seed input.
- Game refactor import cycles or duplicate constants.
- HUD/input initialization before the canvas is available.

## Affected interfaces

- `package.json` scripts.
- `scripts/deliver.mjs` command-line interface.
- `AGENTS.md` workflow rules.
- `README.md` development/delivery instructions.
- `packages/game/src` module boundaries and test imports.
- `packages/game/test` new unit tests.
- `vitest.config.ts` remains unchanged because game tests already match
  `packages/*/test/**/*.test.ts`.

## Determinism and boundary impact

- No simulation changes.
- Game modules still read simulation state only.
- No new browser globals in `packages/sim`.
- The game refactor must preserve the existing deterministic 120 Hz loop.
- Delivery automation does not affect runtime behavior.

## Verification plan

Workstream A:

- `npm.cmd run verify`
- `node scripts/deliver.mjs --dry-run --message "chore: add delivery automation"`
- Real delivery run
- Live Playwright suite

Workstream B:

- Template and AGENTS review
- `npm.cmd run verify`
- Delivery via `npm.cmd run deliver`
- Live Playwright suite

Workstream C:

- Test engineer writes failing game helper tests and proves red.
- Gameplay engineer extracts modules and makes tests green.
- Code reviewer checks for behavior drift and boundary violations.
- `npm.cmd run verify`
- Manual visual check
- Delivery via `npm.cmd run deliver`
- Live Playwright suite

## Open questions

None.
