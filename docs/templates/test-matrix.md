# Test Matrix

Every acceptance criterion must map to at least one unit, e2e, determinism, or
manual check. Write the matrix before implementation.

| Area | Unit tests | E2E tests | Determinism / edge cases | Owner |
| --- | --- | --- | --- | --- |
| Example: field generation | Same seed produces identical chunks | — | Negative coordinates; chunk boundaries | test-engineer |
| Example: HUD | — | Hull/speed/progress/score values | Reset and destroyed state | test-engineer |
|  |  |  |  |  |

## Rules

- Tests are the executable specification; do not weaken or delete a test to get
  green.
- Add a row for every acceptance criterion.
- Cover the failure path, not only the happy path.
- Include determinism checks for seeded simulation behavior.
- Include a high-speed or boundary case where collision is involved.
- Include a reset/restart case where state is involved.
- Mark the owner (`test-engineer`, `sim-engineer`, `gameplay-engineer`,
  `release-engineer`) and the expected red failure reason.
- Record exact formulas, expected values, and thresholds in the ticket's
  `### Test contract` before implementation.
- Use `it.each` tables for force, torque, drag, collision, and sensor
  permutations. Target about 20-25 cases for a pure module unless the ticket
  requires more; cover acceptance criteria and named edges, not every
  permutation.
- Browser tests are serialized because the local Vite server uses one port.
  Unit tests and typechecks may run in parallel.
