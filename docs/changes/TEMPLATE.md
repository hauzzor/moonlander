# <Change title>

## Change tier

- [ ] Tier 1 — typo, docs, formatting, or a fix fully pinned by an existing
  failing test.
- [ ] Tier 2 — single-package feature or behavior change.
- [ ] Tier 3 — cross-package, public API, physics, gameplay, or architecture
  change.

Tier 2 and Tier 3 changes require the full brief, test matrix, and contract
freeze. Tier 1 edits may proceed directly unless the user asks for a brief.

## Original request

Quote or faithfully summarize the user's request.

## Goal

What outcome the user wants, in one short paragraph.

## Current behavior

What the game or code does today, including relevant file references.

## Desired behavior

Precise user-visible and technical behavior. Include controls, outcomes,
defaults, and failure behavior.

## Non-goals

What is explicitly out of scope.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
|  |  |  |

Record every intake answer. Open questions must not appear here before
confirmation.

## Contract freeze

- Public types, constants, and exports:
- New module or file boundaries:
- Stub files created:
- Typecheck command:
- Expected red-test failure reason:

See [`docs/templates/contract-freeze.md`](../templates/contract-freeze.md).

## Test matrix

Copy the matrix from [`docs/templates/test-matrix.md`](../templates/test-matrix.md)
and fill every row.

| Area | Unit tests | E2E tests | Determinism/edge cases | Owner |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Acceptance criteria

Numbered, observable, and testable.

## Edge cases

Collision, boundaries, invalid input, long runs, reset behavior, caching, and
browser/runtime cases.

## Affected interfaces

Packages, public API, observation shape, game modules, scripts, docs, and tests.

## Determinism and boundary impact

Fixed timestep, seeded generation, stable ordering, DOM-free simulation, and any
intentional API break.

## Verification plan

Commands, unit/e2e coverage, manual checks, visual checks, and delivery path.

## Open questions

None.

## Delivery waiver

None. If the user waives delivery for this build, record the exact waiver here.

## Confirmation

Record the user's explicit confirmation (for example, "confirmed") and the
date.
