---
name: ticket-only-changes
description: Use when the user proposes a Moonlander game code change (gameplay, physics, controls, balance, HUD, rendering, terrain, sim/game API, or game tests). Enforce intake, confirmation, and ticket creation, with only the ticket runner implementing. Do not use for development-cycle changes such as ticket/runner/delivery tooling, AGENTS.md, or agent/skill configuration; those are implemented directly.
---

# Ticket-only game code changes

## Trigger

Use this skill when the user proposes or requests a **game code** change to
Moonlander, including gameplay, physics, controls, balance, tunnel, HUD,
rendering, simulation API, or game tests.

Do not use it for development-cycle changes, explicit opencode configuration or
skill changes, ticket status inspection, runner start/pause/resume, or read-only
questions.

## Hard rule

The interactive lead must not edit, implement, test, build, or deliver a
user-proposed game code change in this session. That includes changes that look
trivial. Do not spawn implementation agents for the change.

The lead may perform read-only inspection, conduct the intake interview, write
the change brief, and create tickets. Only the ticket runner implements,
verifies, merges, and delivers game code.

Development-cycle changes (the ticket queue and runner scripts, delivery and CI
automation, `AGENTS.md`, agent and skill configuration, workflow documentation,
and tests that cover this tooling) are not game code. Implement them directly
without intake, tickets, or TDD; see [Development-cycle changes](#development-cycle-changes).

## Game code workflow

1. Stop before editing anything.
2. Inspect the relevant code and specification read-only. Restate the request
   and identify affected packages, interfaces, and behavior.
3. Classify the change using `AGENTS.md`. For a non-trivial or ambiguous game
   code change, consult the required read-only specialists (`game-architect`,
   `test-engineer`, and the responsible engineer) for scope, acceptance, and
   feasibility. Specialists must not implement or write tests.
4. Interview the user with `docs/templates/intake-questionnaire.md`. Ask every
   independent question in one round, offer concrete options, and use at most
   two rounds. Record answers in the brief.
5. Write the brief from `docs/changes/TEMPLATE.md` at
   `docs/changes/YYYY-MM-DD-<slug>.md`. Include the test matrix from
   `docs/templates/test-matrix.md`. Open questions must be empty before
   confirmation.
6. Complete the contract freeze from `docs/templates/contract-freeze.md` for
   Tier 2/3 changes.
7. Read the brief back, state your understanding, and ask for explicit
   confirmation of the brief and the ticket split.
8. After confirmation, create confirmed `ready` tickets. Do not move a ticket
   to `ready` unless the user confirmed its written brief, the frontmatter has
   `confirmed: true`, and `open-questions` is empty.
9. Stop. Do not start the runner automatically. Tell the user the ticket IDs
   and the command to start it.

## Ticket creation

- Use `docs/tickets/TEMPLATE.md` for each ticket body.
- Set narrow `scopes`, accurate `depends-on`, and either `contract: true` for a
  shared contract freeze or `false` for implementation.
- Decompose large changes. A serialized contract ticket comes before child
  tickets that share public interfaces.
- Scopes must not overlap active tickets. If the runner is active, queue behind
  the active ticket with `depends-on` instead of editing the active worktree.
- Keep the simulation and renderer changes together when an intermediate
  delivery would show collision geometry that disagrees with the rendered
  tunnel.
- Record the ticket IDs and dependencies in the brief and final response.
- Ticket creation is not implementation. Do not edit production code, tests,
  or e2e files.

## Trivial game code changes

A trivial game code change still becomes a ticket unless the user explicitly
asks for a direct edit. If a direct edit is requested, record the waiver in the
brief and keep the edit narrowly scoped. Do not bypass the ticket policy
silently.

## Development-cycle changes

Development-cycle changes are not game code. Implement them directly:

- the ticket queue and runner scripts, delivery and CI automation;
- `AGENTS.md`, agent, command, and skill definitions;
- workflow documentation and tests that cover this tooling.

Do not run the intake, create a ticket, or use the TDD cycle for these changes.
Make the change, run the relevant existing checks (unit tests, typecheck,
build, or delivery verification), and deliver. Keep game code untouched; if part
of the request needs a game code change, stop and use the game code workflow for
that part.

## Active runner

While the ticket runner is active, do not leave unrelated uncommitted changes
in the main worktree. The runner's queue commit blocks on files outside
`docs/tickets/`. Commit development-cycle or configuration changes promptly so
the runner can continue.

Do not stop, pause, or restart the runner unless the user asks. Do not start a
second runner.

## Exceptions

Direct handling is also allowed for:

- explicit opencode configuration, agent, command, or skill installation;
- ticket status, queue inspection, pause/resume, and runner control;
- read-only architecture, test, or logs inspection;
- committing or delivering an already-confirmed ticket when the user asks.

These exceptions do not permit direct implementation of game code.

## Completion

For a game code change, never report "implemented" or "fixed". Report the intake
result, brief path, ticket IDs, dependencies, and that implementation is owned
by the ticket runner.

For a development-cycle change, report the files changed, the checks run, and
the delivery result.
