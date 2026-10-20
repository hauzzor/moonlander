---
description: Execute one or more confirmed Moonlander tickets in waves in the current session.
agent: lead
---

Tickets: $ARGUMENTS

Read `AGENTS.md`, `docs/spec.md`, the tickets, and their change briefs. Confirm
each ticket is `confirmed: true`, has no open questions, and its dependencies are
`done`.

Execute these tickets in waves in the current session. There is no background
runner. Load the `parallel-ticket-planning` skill before planning the wave.

1. Write the wave plan. Confirm the tickets' scopes are disjoint. If two tickets
   share a file, serialize them or create an integration ticket.
2. Move the wave tickets to `in-progress` and record the start.
3. Dispatch up to two implementation teams. Each team is `test-engineer` plus
   the responsible implementation engineer, working from the same acceptance
   criteria. Do not dispatch two writers to the same file.
4. Integrate the wave. Keep edits inside the declared scopes. Do not weaken or
   delete a valid test.
5. Dispatch `reviewer` for an independent read-only review.
6. Run `npm.cmd run verify` yourself.
7. If review and verify pass, dispatch `release-engineer` to commit and push to
   `main`, wait for GitHub Pages, and run the live suite when the game is
   deployable. Serialize browser suites, `npm.cmd run verify`, delivery, and live
   verification.
8. Update each ticket to `done` with evidence, then continue to the next wave.

Stop and report on ambiguity, failing verify, rejected review, missing
credentials, or a scope conflict. Do not commit or push yourself.
