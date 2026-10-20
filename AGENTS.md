# Moonlander Agent Guide

> Non-trivial changes require a change intake interview and explicit user
> confirmation of the written brief before any implementation or test work.
> See [Change intake interview](#change-intake-interview).
>
> After every successful production build, commit, push, and verify the live
> GitHub Pages deployment. See
> [Delivery after every build](#delivery-after-every-build).
>
> User-proposed project changes are ticket-only: do not implement them in the
> interactive session. Run the intake when needed, confirm the brief, and create
> tickets for the runner. See
> [Ticket-only change policy](#ticket-only-change-policy).

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
- New ticket: `npm.cmd run tickets:new -- "Title"`
- Ticket queue: `npm.cmd run tickets:list`, `npm.cmd run tickets:status`
- Manual recovery: `npm.cmd run tickets:recover -- T-0002 [--force]`
- Ticket runner: `npm.cmd run tickets:run`

## Ticket-only change policy

When the user proposes a project change, the interactive lead must not edit,
implement, test, or deliver it in this session. This includes changes that would
otherwise be trivial. The lead may inspect read-only, conduct the intake, write
the brief, and create tickets. After explicit confirmation, create confirmed
`ready` tickets and leave implementation to the ticket runner. This supersedes
the direct-edit allowance below for user-proposed project changes.

Explicit opencode configuration, skill, ticket-management, and runner-control
requests may be handled directly. If the user explicitly requests direct
implementation of a project change, record the waiver in the brief.

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

Trivial changes still become tickets under the ticket-only policy. If the user
explicitly asks for a direct edit, record the waiver; otherwise create a ticket.
When in doubt, treat the change as non-trivial.

Tier 2 and Tier 3 changes use the full brief, questionnaire, test matrix, and
contract freeze. Tier 1 edits may skip the templates. The templates are:

- `docs/changes/TEMPLATE.md` — change brief.
- `docs/templates/intake-questionnaire.md` — decision tree and contradictions.
- `docs/templates/test-matrix.md` — required test coverage.
- `docs/templates/contract-freeze.md` — pre-test interface freeze.

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
4. Interview the user using `docs/templates/intake-questionnaire.md`. Ask every
   independent question in one round and use at most two rounds total. Offer
   concrete interpretations and tradeoffs rather than assumptions. Record the
   answers in the brief decision log.
5. Write the brief from `docs/changes/TEMPLATE.md` at
   `docs/changes/YYYY-MM-DD-<slug>.md`. Include the test matrix from
   `docs/templates/test-matrix.md`. Open questions must be empty before
   confirmation. This brief is the only file change permitted before
   confirmation.
6. Complete `docs/templates/contract-freeze.md` for Tier 2/3 changes: freeze the
   public types, constants, and exports in `docs/spec.md`, create compiling
   stubs with no behavior, and run typecheck. Red tests must fail for missing
   behavior, not missing exports.
7. Read the brief back, state the lead's understanding, and ask for an
   unambiguous go-ahead such as "confirmed" or "start development."
8. Create confirmed `ready` ticket(s) with scopes and dependencies. Do not
   implement; the ticket runner begins the test-driven cycle.

If scope changes during implementation, stop and re-run the intake interview.
If the user explicitly waives the interview for a specific change, record the
waiver in the brief. The brief complements the tests; tests remain the
executable specification.

## Test-driven development

Complete the change intake interview and, for Tier 2/3 changes, the contract
freeze before starting this cycle.

Every feature follows this order:

1. The test engineer defines failing tests and proves they fail for the
   intended reason.
2. The failing test is committed locally. In a ticket worktree, the per-ticket
   lead records the red proof in the ticket log; the runner commits the
   completed ticket branch after green.
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

## Continuous ticket queue

The local Markdown queue in `docs/tickets/` is the durable backlog for work that
can be added continuously, including while ready tickets are being implemented.

- `inbox` tickets can be added at any time. The interactive lead triages them.
- The interactive lead never implements a proposed change; it runs the intake
  and creates confirmed tickets. The ticket runner implements them.
- A ticket may move to `ready` only after the user confirms its written brief
  and the frontmatter has `confirmed: true` with no open questions.
- The background runner picks only confirmed `ready` tickets whose dependencies
  are `done` and whose declared file scopes do not overlap active tickets.
- Recoverable blocked tickets are requeued once automatically with their
  preserved worktree and a longer agent timeout. Ambiguous tickets move to
  `needs-info`; exhausted tickets stay `blocked` with
  `recovery-exhausted: true`. Disable the behavior with `--no-recover`.
- The runner holds a global lock, heartbeats active tickets, and recovers
  tickets left `in-progress` by a stale runner lock.
- Large requests are decomposed into child tickets with narrow scopes and
  explicit dependencies. Shared contract files are handled by a serialized
  contract ticket first.
- Default maximum parallel ticket worktrees is 3. One Playwright/browser suite
  and one merge/delivery run at a time.
- Each ticket runs in its own worktree and branch. The `ticket-runner` agent is
  the lead for that ticket: it follows this guide, TDD, review, and the ticket
  brief, but must not commit or push.
- The runner script owns verification, the serialized merge queue, commit,
  push, live asset polling, the live suite, and ticket status updates.
- Per-ticket delivery is serialized. The runner may rebase in-flight tickets
  after a delivery and must re-run verification before merging them.
- The runner never interviews the user. Ambiguous work stops and is reported as
  `needs-info`/`blocked`; the interactive lead resolves it.
- New tickets added while the runner is active wait for triage and scheduling.
- Ticket status, logs, locks, worktrees, and agent sessions are inspectable; see
  `docs/tickets/README.md`.
- The runner must pause instead of mixing unrelated uncommitted code changes in
  the main worktree into a ticket.

The queue is operated with `npm.cmd run tickets:run` in a separate terminal,
or with the interactive `ticket-runner` agent/command for one ticket at a time.

## Agent ownership

- `game-architect`: architecture, simulation API, and boundary reviews. Read-only.
- `test-engineer`: tests only (`packages/*/test`, `e2e`).
- `sim-engineer`: implementation only in `packages/sim/src` and
  `packages/sim/examples`.
- `gameplay-engineer`: implementation only in `packages/game`.
- `release-engineer`: CI, deployment, Playwright live verification, scripts.
- `code-reviewer`: independent review. Read-only.
- `ticket-runner`: per-ticket lead; may edit and spawn specialists but must not
  commit, push, or change shared interfaces without the confirmed ticket brief.

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

The ticket runner assigns `TICKET_PORT` per worktree, so isolated ticket
worktrees may run Playwright in parallel on distinct ports up to the configured
parallel limit. The main worktree uses port 4173. Only one live/deployment
verification may run at a time, and the merge queue serializes ticket delivery.
The interactive lead still serializes browser runs outside the ticket runner.
The lead owns final integration and delivery.

## Engineering rules

- TypeScript strict mode; no `any` in public APIs.
- Physics is deterministic, fixed-timestep, and seeded.
- Rendering reads simulation state; it never mutates it.
- Keep the public `@moonlander/sim` API stable and documented.
- Prefer small pure functions with unit tests.
- No comments unless they explain non-obvious invariants or physics.
- Keep the whole project runnable from Node 24 and deployable as static files.
