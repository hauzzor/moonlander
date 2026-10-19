---
description: Run the Moonlander red-green-review workflow for a feature.
agent: build
---

Implement this feature using strict TDD: $ARGUMENTS

1. Have `test-engineer` add failing tests and prove the failure.
2. Run the failing tests yourself and record the evidence.
3. Commit the failing tests locally.
4. Have `sim-engineer`, `gameplay-engineer`, or both implement the minimum
   production code. A test must not be edited to obtain green.
5. Have `code-reviewer` review behavior, architecture, and TDD evidence.
6. Run `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run test:e2e`, and
   `npm.cmd run build`.
7. Commit the green implementation, push, and verify GitHub Actions and the
   live GitHub Pages site.

Stop and report if a test is wrong, the specification is ambiguous, or a
required architectural change falls outside the current ownership boundaries.
