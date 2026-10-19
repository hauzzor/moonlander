---
description: Process a confirmed local ticket through the ticket-runner lead.
agent: ticket-runner
---

Process the confirmed ticket: $ARGUMENTS

Read the ticket from `docs/tickets/` and follow `AGENTS.md`, the ticket brief,
strict TDD, review, and verification. Do not commit or push; the lead/runner
owns integration and delivery. End with `REVIEW: PASS` only if the ticket is
complete and reviewed, otherwise `BLOCKED: <reason>`.
