---
id: T-0000
title: Short ticket title
status: inbox
priority: normal
parent: null
depends-on: []
scopes: []
contract: false
confirmed: false
confirmed-at: null
open-questions: []
---

## Original request

Quote or faithfully summarize the user's request.

## Goal

One short paragraph describing the outcome.

## Current behavior

What the game or code does today.

## Desired behavior

Precise behavior, controls, defaults, failure behavior, and UI.

## Non-goals

What is explicitly out of scope.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
|  |  |  |

## Contract freeze

Public types, constants, exports, module boundaries, stubs, and typecheck
command. Use `docs/templates/contract-freeze.md`.

### Test contract

- Formulas and constants:
- Expected values:
- Thresholds:
- Test file names:
- Table-driven cases:

## Test matrix

Copy `docs/templates/test-matrix.md` and fill every row.

## Acceptance criteria

Numbered, observable, testable.

## Edge cases

Boundaries, invalid input, reset, long runs, concurrency, and delivery cases.

## Affected interfaces

Packages, APIs, UI, docs, scripts, and tests.

## Parallelization plan

Every ticket must fill this in. Split only when the result is file-disjoint or
creates a clean leaf/trunk boundary.

- Independent units:
- Disjoint scopes:
- Shared files / integration points:
- Wave and dependencies:
- Max concurrency (default 2):
- Coordination / handoff notes:
- Why sequential, if no split:

## Verification plan

Commands, tests, manual checks, review, and delivery.

## Open questions

None.
