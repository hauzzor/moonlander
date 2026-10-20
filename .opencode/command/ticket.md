---
description: Process a confirmed local ticket through the ticket-runner lead.
agent: ticket-runner
---

Process the confirmed ticket: $ARGUMENTS

Read the ticket from `docs/tickets/` and follow `AGENTS.md`, the ticket brief,
and the ticket type. Game code tickets use strict TDD. Development-cycle tickets
skip TDD and are implemented directly with the relevant checks. Review and
verification are required for both. Do not commit or push; the lead/runner owns
integration and delivery. End with `REVIEW: PASS` only if the ticket is complete
and reviewed, otherwise `BLOCKED: <reason>`.
