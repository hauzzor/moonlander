---
name: change-workflow
description: Use when proposing, shaping, or executing a Moonlander game change, writing a change brief, creating tickets, or running a ticket. Enforces the interview gate for non-trivial changes, tests alongside implementation, one-session sequential tickets, and review plus verify before push. Do not use for read-only questions or development-cycle tooling changes, which are handled directly.
---

# Moonlander change workflow

## Trigger

Use for Moonlander game changes: gameplay, physics, controls, balance, tunnel,
HUD, rendering, simulation API, game tests, or cross-package behavior.

Do not use for development-cycle work such as agent configuration, ticket
tooling, CI/delivery scripts, `AGENTS.md`, or workflow documentation. Those are
implemented directly with the relevant checks.

## Interview gate

For any non-trivial game change:

1. Stop before editing, writing tests, or spawning implementation agents.
2. Inspect read-only and restate the request, affected packages, interfaces,
   current behavior, and constraints.
3. Consult `reviewer`, `test-engineer`, and the responsible engineer read-only.
   They may draft risks, options, and acceptance criteria; they must not
   implement or write tests.
4. Interview the user with `docs/templates/intake-questionnaire.md`. Ask every
   independent question in one round, with concrete options and tradeoffs. Use
   at most two rounds.
5. Record every answer in the brief Decision Log. No open questions may remain
   before confirmation.
6. Write the brief from `docs/changes/TEMPLATE.md` at
   `docs/changes/YYYY-MM-DD-<slug>.md`, including the test matrix.
7. For Tier 2/3, complete `docs/templates/contract-freeze.md`.
8. Read the brief back and ask for an explicit "confirmed" or "start
   development."
9. Do not create tickets, write code, or write tests before confirmation.

If scope changes later, pause and re-run the interview. Tier 1 trivial changes
may skip the full interview.

## Tests alongside implementation

Tests are the executable specification, but they do not have to be red-first.
For each ticket:

- `test-engineer` derives coverage from the spec and acceptance criteria while
  the implementation engineer writes the code.
- `test-engineer` owns `packages/*/test` and `e2e`; implementation agents must
  not edit tests.
- Never weaken, skip, or delete a valid test to obtain green.
- If a test is wrong, explain the defect and fix the requirement explicitly.

## One-session ticket execution

There is no background runner. The lead executes confirmed tickets sequentially
in the current session.

1. Read the ticket and brief; confirm `confirmed: true`, no open questions, and
   satisfied dependencies.
2. Move the ticket to `in-progress`.
3. Dispatch `test-engineer` and the responsible engineer.
4. Dispatch `reviewer` for an independent read-only review.
5. Run `npm.cmd run verify`.
6. Dispatch `release-engineer` to commit and push only after review and verify
   pass.
7. Record evidence and move the ticket to `done`.
8. Continue to the next ticket.

Stop on ambiguity, failing verify, rejected review, missing credentials, or scope
conflict. Ticket files are the durable checkpoint if the session ends.

## Ticket rules

- Use `docs/tickets/TEMPLATE.md`.
- Set narrow `scopes`, accurate `depends-on`, and `contract: true` for shared
  contract freezes.
- A ticket may move to `ready` only after the user confirms its written brief,
  the frontmatter has `confirmed: true`, and `open-questions` is empty.
- Decompose large requests into child tickets with explicit dependencies.
- Keep simulation and renderer changes together when an intermediate delivery
  would show disagreement between collision geometry and the rendered tunnel.

## Delivery

`release-engineer` is the only agent allowed to commit or push. The lead must
verify and the reviewer must pass first. Push to `origin/main` directly, wait
for GitHub Pages, and run the live suite. Never force-push, amend, reset, or
clean. Record the commit and live result in the ticket.
