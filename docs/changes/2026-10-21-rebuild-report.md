# Rebuild Report: Deterministic Near-Vertical Moonlander

## Result

The rebuild from `docs/spec.md` is complete. The game is playable at
https://hauzzor.github.io/moonlander/, the deterministic simulation passes its
response, collision, sensor, and autopilot benchmarks, and the full local and
live browser suites pass.

## Baseline and final metrics

| Metric | Before rebuild | Final |
| --- | --- | --- |
| Unit tests | 136 | **631** |
| Playwright tests | 21 | **40** |
| Typecheck | Passed | **Passed** |
| Production build | Passed | **Passed** |
| Live Playwright | 21/21 | **40/40** |
| Autopilot benchmark | Old 400/500/8 target | **200/300/4 confirmed target** |

Autopilot benchmark on the integrated simulation (60 s per seed):

| Metric | Result | Required |
| --- | --- | --- |
| Zero wall contact | 8/8 seeds | 8/8 |
| Hull | 100 | 100 |
| Minimum progress | 507.5 m | >= 200 m |
| Median progress | 509.0 m | >= 300 m |
| Average world-x speed | 8.48 m/s | >= 4 m/s |
| Reduced 20 m radius | PASS, min wall 10.46 m, hull 100 | PASS |

`npm.cmd run sim:demo` prints the same benchmark and reduced-radius results and
is byte-identical across runs.

## Architecture

- `packages/sim` — pure TypeScript, fixed 120 Hz, seeded, DOM-free, no
  `Math.random`. Owns physics, collision, sensors, observation, autopilot, and
  the deterministic field.
- `packages/game` — Vite + Canvas 2D shell, fixed-step accumulator, input, HUD,
  seed controls, sensor console, radar, and the playable loop.
- `e2e` — 40 Playwright tests covering the real page, controls, seeds, HUD,
  sensors, autopilot, outcome, responsive layout, high-DPI canvas, and console
  errors.
- `.github/workflows/ci.yml` — typecheck, unit tests, `sim:demo`, local
  Playwright, build, GitHub Pages deploy, then the full live suite against the
  deployed URL.

## Rebuild tickets

| Ticket | Scope | Status |
| --- | --- | --- |
| T-0003 | Contract alignment: spec, types, constants, exports | Done |
| T-0004 | Deterministic near-vertical variable-width field | Done |
| T-0005 | Physics module | Done |
| T-0006 | Collision module | Done |
| T-0007 | Sensor module | Done |
| T-0008 | Autopilot controller | Done |
| T-0009 | Game wiring and playable integration | Done |
| T-0010 | Playwright coverage and hooks | Done |
| T-0011 | Docs reconciliation and live verification | Done |
| T-0012 | Final parity and report | This report |
| T-0013 | Simulation integration | Done |
| T-0014 | Autopilot benchmark | Done |
| T-0015 | Game pure modules, renderer, static hooks | Done |
| T-0016 | Sensor console and radar | Done |
| T-0017 | CI, Pages, and live harness | Done |
| T-0018 | Radius-slider focus fix | Done |

T-0002 is blocked and superseded by the rebuild. It was not executed.

## Main delivery ledger

The earlier contract and configuration commits `33ac76a`, `930aced`, `ca46b31`,
and `e5146de` are omitted for brevity; this is the main delivery and feature
ledger.

| Commit | Summary |
| --- | --- |
| `0cd1a43` | Rebuild the near-vertical variable-width tunnel |
| `b3158a0` | Add parallel ticket planning and wave decomposition |
| `31e9166` | Rebuild physics and sensor modules |
| `3ad54b0` | Complete T-0005 and T-0007 |
| `9d9835d` | Add fast wave protocol and milestone live checks |
| `d0ec532` | Rebuild collision and autopilot modules |
| `0996d87` | Complete T-0006 and T-0008 |
| `ba88a14` | Guard session reuse after wave 2 |
| `8fc7a49` | Integrate simulation trunk and rebuild game renderer |
| `4a5eb5e` | Complete T-0013 and T-0015 |
| `7d10fe7` | Record wave 3 measurement |
| `ca0fdcf` | Add autopilot benchmark and sensor console |
| `18ea6ce` | Complete T-0014 and T-0016 |
| `e527760` | Wire the playable game shell |
| `2846ae0` | Complete T-0009 |
| `24b9ab8` | Rebuild e2e coverage, live pipeline, and slider focus fix |
| `2762ff2` | Complete T-0010, T-0017, and T-0018 |
| `bcfc65d` | Reconcile rebuild documentation |
| `7590657` | Complete T-0011 |

The final T-0012 delivery records this report; the ticket completion commit
closes the rebuild.

## Verification evidence

- `npm.cmd run verify` — typecheck, 631 unit tests, 40 local Playwright, build.
- `npm.cmd run test:e2e:live` — 40/40 against GitHub Pages.
- `npm.cmd run sim:demo` — 8-seed benchmark PASS and reduced-radius PASS.
- Live deployment: https://hauzzor.github.io/moonlander/, asset
  `assets/index-DrJFlspQ.js`.
- CI and Pages workflow succeeded on the final game commits; the final docs
  commit re-runs CI without changing the game asset.
- `backup/pre-rebuild` exists and the pre-rebuild history is intact.

## Residual risks

- `sim:demo` prints PASS/FAIL but does not set a non-zero exit code on failure;
  the Vitest benchmark test remains the CI gate.
- The live asset/deploy helpers are exercised by the live suite and manual
  fail-closed checks, but have no dedicated unit tests.
- Radar and manual-input suppression during autopilot are covered primarily by
  unit tests; browser coverage is indirect.
- The expanded Playwright suite is timing-sensitive by nature. Local workers are
  capped at 2, and CI retains retries.
- `gh` is not installed in this environment, so CI runs were verified through
  the public API and the successful Pages/live checks rather than the CLI.

## Conclusion

The rebuilt game matches the confirmed contract, the simulation invariants, the
sensor and autopilot benchmarks, and the documented browser hooks. The rebuild
is complete and live.
