---
description: Execute one or more confirmed Moonlander tickets in fast waves in the current session.
agent: lead
---

Tickets: $ARGUMENTS

Read `AGENTS.md`, `docs/spec.md`, the tickets, and their change briefs. Confirm
each ticket is `confirmed: true`, has no open questions, and its dependencies are
`done`.

Execute these tickets in fast waves in the current session. There is no
background runner. Load the `parallel-ticket-planning` skill before planning the
wave.

1. Write the wave plan and `docs/tickets/logs/wave-<n>/context.md` from
   `docs/templates/wave-context.md`.
2. Confirm every ticket has a non-empty `### Test contract` with exact formulas,
   constants, expected values, thresholds, and test file names.
3. Confirm the tickets' scopes are disjoint. If two tickets share a file,
   serialize them or create an integration ticket.
4. Move the wave tickets to `in-progress` and record the start.
5. Use a fresh test-engineer and reviewer for each wave. Reuse a sim-engineer
   session only when it is below about 30 messages and 300k input tokens; tell
   reused sessions to re-read changed files only and stop on stale assumptions or
   contract drift. If a subagent returns empty, immediately start a fresh session
   with the wave context card.
6. Dispatch up to two implementation teams. Each team is `test-engineer` plus
   the responsible implementation engineer, working from the same acceptance
   criteria. Do not dispatch two writers to the same file.
7. Start a ticket's review as soon as its files are stable, while the other
   ticket's tests are still running. Give the reviewer the diff, new test names,
   focused test output, acceptance checklist, and wave context card.
8. Integrate the wave, run `npm.cmd run verify`, and keep edits inside the
   declared scopes. Do not weaken or delete a valid test.
9. If review and verify pass, dispatch `release-engineer`. It commits and pushes,
   updates ticket evidence/status, and pushes the queue update in the same task.
   Use `--no-live` for sim-only intermediate waves; run the live suite at
   T-0013, T-0009, T-0010, T-0011, and T-0012.
10. Start the next wave after the push while `release-engineer` finishes the
    delivery tail.

Stop and report on ambiguity, failing verify, rejected review, missing
credentials, or a scope conflict. Do not commit or push yourself.
