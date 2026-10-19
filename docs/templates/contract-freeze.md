# Contract Freeze

Use this before writing tests or starting parallel implementation for a Tier 2
or Tier 3 change.

## Checklist

- [ ] Public types, constants, and exports are written in `docs/spec.md`.
- [ ] Module and file boundaries are named.
- [ ] Compiling stubs exist for every new export or module.
- [ ] Stubs contain no behavior; they may throw a clear "not implemented" error.
- [ ] `npm.cmd run typecheck` passes after the scaffold.
- [ ] Test files can import the contract without path or export errors.
- [ ] The expected red failure is missing behavior, not a missing export.
- [ ] No production behavior is hidden in the scaffold.
- [ ] Shared interfaces are frozen before parallel work starts.

## Commands

```powershell
npm.cmd run typecheck:sim
npm.cmd run typecheck:game
npm.cmd run typecheck
```

## Handoff

1. Test engineer writes failing tests against the frozen contract.
2. The lead proves the red tests fail for the intended reason.
3. Implementation agents work in parallel only on disjoint files.
4. The lead updates the contract if scope changes, then restarts the cycle.
