# Moonlander Agent Guide

> Non-trivial **game code** changes require an in-depth intake interview and
> explicit user confirmation of the written brief before any implementation or
> test work. See [Change intake interview](#change-intake-interview).
>
> Tests are written alongside implementation. Review and `npm.cmd run verify`
> must pass before any push. See
> [Tests alongside implementation](#tests-alongside-implementation).
>
> Game code changes are ticket-based and executed sequentially in one session.
> There is no background runner. See
> [One-session ticket execution](#one-session-ticket-execution).
>
> Only `release-engineer` commits and pushes. Delivery is a direct push to
> `origin/main` after review and verification, followed by GitHub Pages and the
> live Playwright suite. See [Delivery](#delivery).
>
> Development-cycle changes are not game code and are handled directly. See
> [Development-cycle changes](#development-cycle-changes).

## Product

Moonlander is a 2D side-view Starship endless-tunnel game. The player flies
through a seeded, enclosed tunnel that winds rightward using two aggressive
canted thrusters (Q = left, W = right), a rear booster (Space), and an optional
autopilot (E). Atmospheric drag damps motion for responsive control, while hull
damage and tunnel collisions create the challenge. An absolute-angle rim-based
eye sensor plus direction, distance-to-start, and velocity sensors support manual
and autonomous flight. Fuel is unlimited. The simulation is deterministic and
headless so it can later be used to train and evaluate autonomous controllers.

Repository: https://github.com/hauzzor/moonlander
Live game: https://hauzzor.github.io/moonlander/

## Architecture

- `packages/sim` — pure TypeScript simulation. No DOM APIs, no browser globals,
  no `Math.random`, and no dependencies on the game package.
- `packages/game` — Vite + Canvas 2D presentation, input, HUD, and game loop.
- `e2e` — Playwright browser tests.
- `.github/workflows` — CI and GitHub Pages deployment.
- `scripts` — delivery, live-suite, and ticket tooling.
- `docs/spec.md` — the source of truth for behavior and the public API.
- `docs/autonomy.md` — headless simulation and controller usage.
- `docs/changes/` — change briefs and historical design decisions.
- `docs/tickets/` — the durable ticket queue.

The simulation boundary is enforced by TypeScript: `packages/sim/tsconfig.json`
must not include the DOM library.

## Commands

On Windows in this environment, use the `.cmd` executables because PowerShell
script execution is disabled.

- Install: `npm.cmd ci`
- Dev server: `npm.cmd run dev`
- Unit tests: `npm.cmd test`
- Typecheck: `npm.cmd run typecheck`
- Build: `npm.cmd run build`
- Browser tests: `npm.cmd run test:e2e`
- Full verification: `npm.cmd run verify`
- Headless demo: `npm.cmd run sim:demo`
- Delivery: `npm.cmd run deliver -- --message "..."`
- Live browser suite: `npm.cmd run test:e2e:live`
- Tickets: `npm.cmd run tickets:new -- "Title"`, `tickets:list`,
  `tickets:status`, `tickets:plan [--max-parallel 2]`, `tickets:show -- T-0001`,
  `tickets:confirm -- T-0001`, `tickets:move -- T-0001 ready`,
  `tickets:recover -- T-0001 [--force]`

`npm.cmd run verify` runs typecheck, all unit tests, local Playwright, and the
production build. CI additionally runs `npm.cmd run sim:demo`.

## Change policy

Game code includes gameplay, physics, controls, balance, HUD, rendering,
terrain, the public `@moonlander/sim` API, game tests, and the simulation/game
boundary.

- Tier 1: typo, docs, formatting, or a fix fully pinned by an existing failing
  test. The lead may delegate a small ticket without the full interview.
- Tier 2: single-package feature or behavior change. Requires the interview,
  written brief, and test matrix.
- Tier 3: cross-package, public API, physics, gameplay, terrain, or architecture
  change. Requires the interview, written brief, contract freeze, and test
  matrix.

No non-trivial game change may be implemented, tested, or delegated to an
implementation agent until the interview is complete, the brief is written, and
the user has explicitly confirmed it.

## Change intake interview

The lead owns the gate and must:

1. Stop. Do not edit code, write tests, or spawn implementation agents.
2. Restate the request and identify affected packages, interfaces, current
   behavior, and constraints.
3. Consult `reviewer`, `test-engineer`, and the responsible engineer read-only
   for risks, options, and acceptance criteria. They must not implement or write
   tests. Subagents cannot talk to the user directly; the lead relays questions
   and answers.
4. Interview the user using `docs/templates/intake-questionnaire.md`. Ask every
   independent question in one round, with concrete options and tradeoffs. Use
   at most two rounds total.
5. Record every answer in the brief Decision Log. No open questions may remain
   before confirmation.
6. Write the brief from `docs/changes/TEMPLATE.md` at
   `docs/changes/YYYY-MM-DD-<slug>.md`, including the test matrix from
   `docs/templates/test-matrix.md`.
7. For Tier 2/3, complete `docs/templates/contract-freeze.md`: freeze public
   types, constants, and exports in `docs/spec.md`, create compiling stubs with
   no behavior, and run typecheck.
8. Read the brief back, state the lead's understanding, and ask for an
   unambiguous go-ahead such as "confirmed" or "start development."
9. After confirmation, create confirmed `ready` tickets with narrow scopes and
   dependencies. Do not implement.

If scope changes during implementation, stop and re-run the interview. Record
any explicit waiver in the brief. Tests remain the executable specification.

## Tests alongside implementation

Tests do not have to be red-first, but they are not optional.

- `test-engineer` derives coverage from `docs/spec.md`, the acceptance criteria,
  and the edge cases. It writes tests while the implementation engineer writes
  code.
- `test-engineer` owns `packages/*/test`, `e2e`, and the test configuration.
  Implementation agents must not edit tests.
- Tests must cover determinism, physics thresholds, collision and damage,
  sensors, observation shape, the autopilot benchmark, pure game helpers, and
  the documented Playwright hooks.
- Never weaken, skip, or delete a valid test to obtain green. If a test is
  wrong, explain the defect and change the requirement explicitly.
- `reviewer` blocks missing coverage, weakened assertions, and tests that only
  mirror the implementation.

## One-session ticket execution and waves

The local Markdown queue in `docs/tickets/` is the durable backlog. For the
current mode there is no background runner; `lead` executes confirmed tickets in
waves in the current session.

- A ticket may move to `ready` only after the user confirms its written brief,
  the frontmatter has `confirmed: true`, and `open-questions` is empty.
- `inbox` tickets can be added at any time. The lead triages them.
- Every ticket and change brief must contain a `Parallelization plan`. Before
  creating or claiming tickets, check whether the work can be split into
  file-disjoint units. Split only when the split reduces the critical path;
  never split merely to increase ticket count.
- Tickets declare narrow `scopes` and accurate `depends-on`. Declared scopes of
  concurrently edited tickets must not overlap.
- Shared contract files are handled by a serialized contract ticket first.
- Shared implementation files (`simulation.ts`, `render/index.ts`, package
  files, configs, and shared test files) have one writer at a time. If two
  tickets need the same file, serialize them or introduce an integration
  ticket.
- A wave may run at most two implementation tickets concurrently in one session.
  Each implementation ticket is paired with `test-engineer`; the lead dispatches
  both and keeps their file scopes disjoint.
- The lead writes the wave plan, moves tickets to `in-progress`, and dispatches
  the implementation teams. The lead is the only coordinator; subagents report
  to the lead and do not coordinate directly.
- Coordination notes go in `docs/tickets/logs/<id>/handoff.md` or the ticket
  body: files touched, decisions, remaining work, and integration order.
- The lead integrates the wave, dispatches `reviewer`, and runs
  `npm.cmd run verify`. Serialize browser suites, verify, delivery, and live
  verification. Only after review and verify pass does `release-engineer`
  commit and push.
- The lead records evidence and moves each ticket to `done`, then continues to
  the next wave.
- Stop on ambiguity, failing verify, rejected review, missing credentials, a
  scope conflict, or contract drift. Do not guess.
- Ticket files are the checkpoint if the session ends. The background runner
  remains available for later use but is not used in this mode.

## Delivery

After every successful production build, `release-engineer` runs:

```powershell
npm.cmd run deliver -- --message "feat: ..."
```

The script verifies the build, commits intended staged changes, pushes to
`origin/main`, waits for the live asset, and runs the live Playwright suite.

- `release-engineer` is the only agent allowed to commit or push.
- Inspect `git status`, `git diff`, and `git diff --cached` first.
- Stage explicit paths. Never commit secrets, build output, logs, worktrees, or
  unrelated changes.
- Never force-push, amend, reset `--hard`, or clean.
- Do not commit or push a failing build.
- Direct pushes to `main` trigger GitHub Actions and GitHub Pages.
- Early rebuild tickets may use `--no-live` only with explicit lead approval;
  the full live suite must pass before the final ticket.
- The safety branch `backup/pre-rebuild` preserves the pre-rebuild game. Do not
  delete it.

If delivery fails, stop and report the exact command, output, commit hash,
whether the push happened, the live URL, and the safest next action.

## Current rebuild

The project is in a full rebuild from `docs/spec.md`. The previous game remains
available on `backup/pre-rebuild` and in history.

- Baseline before the rebuild: 136 unit tests, 21 Playwright tests, typecheck,
  and production build all passed.
- `docs/spec.md` wins over historical change briefs when they disagree.
- The autopilot benchmark in the confirmed near-vertical brief (at least 200 m
  progress per seed, median at least 300 m, average world-x speed at least
  4 m/s) supersedes the older 400/500/8 values in the spec. The contract ticket
  must update the spec before implementation.
- T-0003 and T-0004 are done. The remaining rebuild is confirmed in
  `docs/changes/2026-10-20-parallel-ticket-execution.md` and runs in waves:
  1. T-0005, T-0007
  2. T-0006, T-0008
  3. T-0013, T-0015
  4. T-0014, T-0016
  5. T-0009
  6. T-0010, T-0017
  7. T-0011
  8. T-0012
- The confirmed wave plan supersedes the old sequential ticket order.

T-0002 is blocked and superseded by the rebuild; do not run it.

## Development-cycle changes

Development-cycle changes are not game code. They include the ticket queue,
delivery and CI automation, `AGENTS.md`, agent/command/skill configuration,
workflow documentation, and tests for that tooling.

- Implement them directly in the interactive session.
- Do not create a ticket or run the intake interview.
- Tests do not need a red-first cycle; run the relevant existing checks.
- Keep game code untouched. If part of the request needs a game change, stop and
  use the game change workflow for that part.
- Delivery rules still apply to every successful production build.

## Agent ownership

| Agent | Mode | Model | Ownership |
| --- | --- | --- | --- |
| `lead` | primary | `opencode-go/deepseek-v4.1-flash` | intake, briefs, tickets, delegation, review/verify coordination, final report |
| `sim-engineer` | subagent | `opencode-go/deepseek-v4.1-flash` | `packages/sim/src`, `packages/sim/examples`, package config |
| `gameplay-engineer` | subagent | `opencode-go/deepseek-v4.1-flash` | `packages/game`, excluding tests |
| `test-engineer` | subagent | `opencode-go/deepseek-v4.1-flash` | `packages/*/test`, `e2e`, test config |
| `reviewer` | subagent | `opencode-go/deepseek-v4.1-flash` | independent read-only review |
| `release-engineer` | subagent | `opencode-go/deepseek-v4.1-flash` | CI, scripts, root tooling, commit/push, live verification |

- The `lead` does not edit game code; it delegates.
- `reviewer` never edits, commits, or pushes.
- Only `release-engineer` commits and pushes.
- Subagents may spawn one additional level of their own kind for disjoint work,
  with at most two concurrent children. Delegated agents inherit the same
  boundaries.
- The lead owns parallelization planning and final integration. There is no
  separate parallelization agent.

## Parallel execution

- The lead may run subagents concurrently only when their edit scopes are
  disjoint and the shared contract is already frozen.
- In-session subagents share the main working tree; there is no worktree
  isolation. Never run two writers on the same file, package, or test config.
- The in-session cap is two implementation tickets per wave. Each ticket gets
  its own `test-engineer`; the lead integrates the results.
- True worktree isolation requires the background runner. Do not exceed the
  in-session cap by adding more writers; repair and use the runner instead.
- Serialize browser suites, `npm.cmd run verify`, delivery, and live
  verification.
- The lead serializes tickets unless a ticket explicitly allows disjoint
  concurrent work and its `Parallelization plan` documents the integration
  order.
- Use `npm.cmd run tickets:plan` to inspect ready tickets, scope conflicts, and
  suggested waves before dispatch. Load the `parallel-ticket-planning` skill
  when decomposing a change.

## Engineering rules

- TypeScript strict mode; no `any` in public APIs.
- Physics is deterministic, fixed-timestep, and seeded.
- Rendering reads simulation state; it never mutates it.
- Keep the public `@moonlander/sim` API stable and documented.
- Prefer small pure functions with unit tests.
- No comments unless they explain non-obvious invariants or physics.
- Keep the whole project runnable from Node 24 and deployable as static files.
- Preserve the documented `data-testid` hooks unless a confirmed brief changes
  them.

## Permission behavior

- Run commands that the project permission rules allow without asking the user.
- Do not ask for approval for routine reads, tests, builds, typecheck, or git
  inspection.
- Ask only when the permission rules require approval, an action is irreversible
  or user-visible, or the change workflow requires a decision.
- Subagents must not ask the user directly; return questions to the lead.
- Commit, push, and delivery stay reserved to `release-engineer`.
