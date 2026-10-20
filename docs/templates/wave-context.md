# Wave <n> Context

One page for the lead, implementation teams, test engineers, and reviewer. Keep
it factual; do not duplicate the full spec.

## Tickets and scopes

| Ticket | Owner | Scopes | Depends on |
| --- | --- | --- | --- |
|  |  |  |  |

## Exact contract

- Formulas and constants:
- Signatures that must not change:
- Expected values and thresholds:
- Test file names:
- Table-driven cases:

## Commands

```powershell
npm.cmd test -- <focused test files>
npm.cmd run typecheck:sim
npm.cmd run verify
```

## Known traps

- Shared files and single-writer ownership:
- Contract or signature pressure:
- Existing tests that must remain green:
- Concurrency or timing risks:

## Review packet

- Diff:
- New test names:
- Focused test output:
- Acceptance-criteria checklist:
- Review depth: focused leaf review or full integration review

## Delivery decision

- Local verify: required.
- Live suite: required at T-0013, T-0009, T-0010, T-0011, and T-0012; otherwise
  `--no-live` under the recorded waiver.
- Ticket completion: `release-engineer` updates evidence/status in the delivery
  task.

## Measurement

- Start:
- Dispatch complete:
- Implementation and tests complete:
- Review complete:
- Delivery complete:
- Ticket completion:
- Total wall-clock:
- Cost:
- Notes for the next wave:
