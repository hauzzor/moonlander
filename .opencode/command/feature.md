---
description: Interview-first intake, change brief, contract freeze, and ticket plan for a non-trivial Moonlander change.
agent: lead
---

Request: $ARGUMENTS

Read `AGENTS.md`, `docs/spec.md`, `docs/autonomy.md`, the latest change briefs,
and the relevant source and tests before doing anything else.

1. Restate the request. Identify affected packages, interfaces, current
   behavior, and constraints.
2. Classify the change as Tier 1, 2, or 3 using `AGENTS.md`. Tier 1 may proceed
   without the full interview. Tier 2 and Tier 3 require the full interview.
3. For Tier 2/3, interview the user using
   `docs/templates/intake-questionnaire.md`. Ask every independent question in
   one round, with concrete options and tradeoffs. Use at most two rounds.
   Consult `reviewer`, `test-engineer`, and the responsible engineer read-only
   for risks and acceptance criteria; they must not implement or write tests.
4. Write the brief from `docs/changes/TEMPLATE.md` at
   `docs/changes/YYYY-MM-DD-<slug>.md`. Include the test matrix from
   `docs/templates/test-matrix.md`. Record every answer in the Decision Log and
   leave no open questions.
5. For Tier 2/3, complete `docs/templates/contract-freeze.md`: freeze public
   types, constants, and exports in `docs/spec.md`, create compiling stubs with
   no behavior, and run typecheck.
6. Present the brief, your understanding, and the proposed ticket split. Ask for
   an explicit "confirmed" or "start development."
7. Do not create tickets or implement anything before confirmation.
8. After confirmation, create confirmed `ready` tickets with narrow scopes and
   dependencies. Do not implement. Report the brief path and ticket IDs.

If any non-trivial design question remains unresolved, stop and ask instead of
assuming.
