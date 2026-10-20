---
description: Execute one confirmed Moonlander ticket in the current session.
agent: lead
---

Ticket: $ARGUMENTS

Read `AGENTS.md`, `docs/spec.md`, the ticket, and its change brief. Confirm the
ticket is `confirmed: true`, has no open questions, and its dependencies are
`done`.

Execute this ticket in the current session. There is no background runner.

1. Move the ticket to `in-progress` and record the start.
2. Dispatch `test-engineer` and the responsible implementation engineer so tests
   are written alongside implementation from the same acceptance criteria.
3. Keep edits inside the ticket's declared scopes. Do not weaken or delete a
   valid test.
4. Dispatch `reviewer` for an independent read-only review.
5. Run `npm.cmd run verify` yourself.
6. If review and verify pass, dispatch `release-engineer` to commit and push to
   `main`, wait for GitHub Pages, and run the live suite when the game is
   deployable.
7. Update the ticket to `done` with evidence, then continue to the next ticket
   in the confirmed sequence.

Stop and report on ambiguity, failing verify, rejected review, missing
credentials, or scope conflict. Do not commit or push yourself.
