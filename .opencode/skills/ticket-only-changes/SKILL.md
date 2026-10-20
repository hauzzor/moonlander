---
name: ticket-only-changes
description: Use when the user proposes a Moonlander project change (feature, bug, physics, gameplay, balance, HUD, terrain, tests, docs, or tooling) or asks for implementation; enforce intake, confirmation, and ticket creation, with only the ticket runner implementing.
---

# Ticket-only project changes

## Trigger

Use this skill when the user proposes or requests any change to the Moonlander
project, including gameplay, physics, controls, balance, tunnel, HUD,
rendering, simulation API, tests, documentation, project tooling, or delivery.

Do not use it for explicit opencode configuration or skill changes, ticket
status inspection, runner start/pause/resume, or read-only questions.

## Hard rule

The interactive lead must not edit, implement, test, build, or deliver a
user-proposed project change in this session. That includes changes that look
trivial. Do not spawn implementation agents for the change.

The lead may perform read-only inspection, conduct the intake interview, write
the change brief, and create tickets. Only the ticket runner implements,
verifies, merges, and delivers.

## Workflow

1. Stop before editing anything.
2. Inspect the relevant code and specification read-only. Restate the request
   and identify affected packages, interfaces, and behavior.
3. Classify the change using `AGENTS.md`. For a non-trivial or ambiguous
   change, consult the required read-only specialists (`game-architect`,
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

## Trivial changes

A trivial change still becomes a ticket unless the user explicitly asks for a
direct edit. If a direct edit is requested, record the waiver in the brief and
keep the edit narrowly scoped. Do not bypass the ticket policy silently.

## Active runner

While the ticket runner is active, do not leave unrelated uncommitted changes
in the main worktree. The runner's queue commit blocks on files outside
`docs/tickets/`. Restrict lead edits to the brief, tickets, and explicitly
requested configuration changes; commit configuration changes separately.

Do not stop, pause, or restart the runner unless the user asks. Do not start a
second runner.

## Exceptions

Direct handling is allowed for:

- explicit opencode configuration, agent, command, or skill installation;
- ticket status, queue inspection, pause/resume, and runner control;
- read-only architecture, test, or logs inspection;
- committing or delivering an already-confirmed ticket when the user asks.

These exceptions do not permit direct implementation of a game or project
change.

## Completion

For a project change, never report "implemented" or "fixed". Report the intake
result, brief path, ticket IDs, dependencies, and that implementation is owned
by the ticket runner.
