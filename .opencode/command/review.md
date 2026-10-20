---
description: Independently review the current Moonlander working tree, ticket, or named scope.
agent: reviewer
---

Scope: $ARGUMENTS

Review the current working tree, or the named ticket/scope, against `AGENTS.md`,
`docs/spec.md`, and the confirmed brief. You are read-only.

Inspect `git status`, `git diff`, the implementation, and the tests. Run the
relevant verification commands. Check acceptance behavior, test quality and
coverage, determinism, the DOM-free simulation boundary, render/input
immutability, documented test hooks, and delivery readiness.

Report blocking defects first, then non-blocking improvements, with exact file
and line references and command results. If everything passes, state that
clearly. Do not edit, commit, or push.
