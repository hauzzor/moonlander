# Build Info, Change Log, and Autopilot-Only Sensor Instruments

## Change tier

Tier 3 — cross-package game UI, build metadata, test hooks, and documentation.
No simulation, physics, autopilot behavior, or public `@moonlander/sim` API
change.

## Original request

Show a build number and build date/time in the game UI. Show the sensor
instruments only when autopilot is on. During intake the user also asked for a
Change Log button that opens a short overview and an expandable history of all
previous change logs.

## Goal

Make the running build identifiable from the page, provide an in-game change log
without a runtime network dependency, and reduce manual-flight visual clutter by
showing the entire sensor console and radar only in autopilot mode.

## Current behavior

- `packages/game/index.html` has a top bar with only the brand; no build or
  change-log UI.
- The sensor console aside (`eye-sensor-panel`), including the eye chart, radius
  slider, direction, distance, and velocity blocks, is always visible. The radar
  is always drawn through the renderer sensor hook.
- `game.ts` always calls `sensorConsole.update(state)` and always uses the
  radar sensor renderer, regardless of autopilot mode.
- Autopilot mode persists across `R`; the sensor UI does not follow it.
- `packages/game/vite.config.ts` injects no build metadata.
- The spec currently requires the sensor console and radar unconditionally:
  `docs/spec.md` “UI and controls” and “Game test hooks”.

## Desired behavior

### Build information

- The top bar right side shows:
  `BUILD 42 · abc1234 · 2026-10-21 02:30 UTC`
- The build number is the GitHub Actions run number
  (`GITHUB_RUN_NUMBER`) when available, otherwise `DEV`.
- The short SHA is `GITHUB_SHA` shortened to 7 characters, otherwise
  `git rev-parse --short HEAD`, otherwise `unknown`.
- The timestamp is the actual build time in UTC, formatted
  `YYYY-MM-DD HH:MM UTC`.
- Local/dev builds show `BUILD DEV · <short-sha> · <UTC build time>`.
- The label is injected into `index.html` at build time. Build metadata must not
  be embedded in the hashed JS/CSS bundle, because delivery and live smoke wait
  for the exact asset filename. Two consecutive builds with different build
  times must produce the same JS/CSS asset names.
- Stable hook: `data-testid="build-info"` with
  `data-build-number`, `data-build-sha`, `data-build-time`, and
  `data-build-source="ci|local"`.

### Change log

- A `CHANGE LOG` button sits beside the build label in the top bar.
- It opens a modal dialog containing the full curated change log, newest first.
- Every previous change brief gets one entry with a short summary. Each entry is
  expandable/collapsible; the latest entry is open by default.
- The dialog is scrollable, closes with Escape, an outside click, or a close
  button, and returns focus to the Change Log button.
- Changelog content is curated in `docs/CHANGELOG.md`. A build-time Vite
  transform parses it into structured JSON injected into `index.html`; there is
  no runtime fetch and no Markdown parser dependency.
- While the dialog is open, Q/W/Space/E/R must not affect the game.
- Hooks: `data-testid="changelog-button"`, `changelog-dialog`,
  `changelog-close`, `changelog-list`, and `changelog-entry` with
  `data-expanded` and `aria-expanded`.

### Sensor visibility

- In manual mode (initial state and after E off), hide the entire sensor console
  aside and the radar overlay.
- In autopilot mode, show the sensor console and radar.
- The radius slider is autopilot-only because it lives inside the console.
- Autopilot mode persists across `R` and seed loads; visibility follows the mode.
- Keep all documented sensor test IDs attached to the DOM. When hidden, set
  `hidden`, `aria-hidden="true"`, `inert`, and `data-visible="false"` on
  `eye-sensor-panel`; when visible, remove them and set `data-visible="true"`.
- Add `data-testid="radar-status"` with `data-active="true|false"` so the canvas
  radar state is observable without pixel hashing. Alternatively expose
  `data-radar-visible` on the canvas; choose one and document it.
- On reveal, force a chart resize/redraw because a hidden canvas has zero client
  size. Do not skip sensor-console state updates while hidden.
- If E hides the console while focus is inside it, move focus to the canvas or
  autopilot status; do not leave focus in a hidden subtree.
- When the console is hidden, the instructions area expands into the freed
  space. No dead reserved width or overlap at desktop, 1280, 760, 680, and 560
  breakpoints.
- Rendering remains read-only and the simulation continues scanning normally
  while the console is hidden.

## Non-goals

- No simulation, physics, collision, sensor math, autopilot algorithm, or public
  API changes.
- No new controls beyond the Change Log button and its dialog.
- No runtime GitHub API or network dependency for build information.
- No full Markdown renderer or arbitrary HTML injection.
- No changelog editing from the game UI.
- No change to scoring, seeds, outcomes, or controls.

## Decision log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Sensor scope | Whole console plus radar | User selected the literal interpretation |
| Radius slider | Autopilot-only | Slider lives inside the console; user selected |
| Build number | CI run number plus short SHA | User selected option 1 |
| Build time | Actual build time, UTC | User selected |
| Build label location | Top bar, right side | User selected |
| Local dev | `DEV` plus commit/time | User selected |
| Change log source | Curated `CHANGELOG.md` plus expandable history | User selected option 1 plus history |
| Change log UI | Modal dialog | User selected |
| Change log scope | Full scrollable changelog | User selected |
| Build label format | `BUILD 42 · abc1234 · 2026-10-21 02:30 UTC` | User selected |
| Build injection | `transformIndexHtml` HTML only | Preserves hashed JS/CSS for delivery/live waiters |

## Contract freeze

- `data-testid="build-info"` with the attributes above and stable visible text.
- `data-testid="changelog-button"`, `changelog-dialog`, `changelog-close`,
  `changelog-list`, and `changelog-entry`.
- `data-testid="eye-sensor-panel"` keeps its ID and gains `data-visible` plus
  `hidden`/`aria-hidden`/`inert` while manual.
- `data-testid="radar-status"` (or documented `data-radar-visible`) reports true
  only while the radar is drawn.
- `SensorConsoleController` gains an additive `setVisible(visible: boolean)`
  method; existing `update(state)` and `resize()` signatures stay.
- The renderer interface stays `render(state, field, camera)`; radar gating is a
  game-side wrapper around `drawSensorOverlay`, not a renderer API break.
- `docs/CHANGELOG.md` format: `## YYYY-MM-DD — Title` followed by `-` bullets.
- Build placeholders in `index.html`:
  `__BUILD_NUMBER__`, `__BUILD_SHA__`, `__BUILD_TIME__`, `__BUILD_SOURCE__`,
  `__CHANGELOG_JSON__`.
- No public `@moonlander/sim` change.

## Test matrix

| Area | Unit tests | E2E tests | Determinism/edge cases | Owner |
| --- | --- | --- | --- | --- |
| Build label | Formatter: CI/local, missing SHA, UTC, escaping | Visible, format, attributes, no overflow | DEV fallback; no undefined/null | test-engineer |
| Hash stability | — | Build twice; JS/CSS names unchanged | Build time differs, assets stable | release-engineer |
| Changelog parser | Parse entries, order, empty/malformed | Modal opens, entries expand/collapse | Latest open; newest first | test-engineer |
| Changelog dialog | Focus/close logic | Close button, Escape, outside click, focus return | Open modal blocks Q/W/Space/E/R | test-engineer |
| Sensor visibility | `setVisible`, reveal redraw, renderer gating | Manual hidden, E visible, E hidden | R/seed persistence; destroyed state | test-engineer |
| Layout | — | Desktop 1440×900, narrow 390×844, no overflow | Instructions expand when hidden | test-engineer |
| Spec/docs | — | Build info, changelog, visibility hooks documented | No stale unconditional-visibility text | reviewer |

## Acceptance criteria

1. The top bar shows a build label matching the confirmed format, with CI run
   number in CI and `DEV` locally, short SHA, UTC build time, and stable
   attributes.
2. Build metadata is injected into `index.html` only; two builds with different
   timestamps keep identical JS/CSS asset filenames.
3. The Change Log button opens a full scrollable modal with all curated entries,
   newest first; entries expand/collapse; close/Escape/outside click work; focus
   returns to the button.
4. Game keys do not affect the simulation while the modal is open.
5. Manual mode hides the entire sensor console and radar; autopilot mode shows
   them; `R` and seed loads preserve the mode and visibility.
6. The hidden panel retains all documented test IDs and reports
   `data-visible="false"`; the radar status reports false while hidden.
7. Revealing the console redraws the chart at its real size immediately.
8. Layout has no dead reserved space or horizontal overflow in either mode at
   desktop and narrow viewports.
9. Rendering remains read-only; simulation scans and autopilot behavior are
   unchanged by visibility.
10. `npm.cmd run verify`, local Playwright, and the live suite pass with the new
    hooks and updated spec.

## Edge cases

- Local build without `GITHUB_RUN_NUMBER`/`GITHUB_SHA` or git.
- CI run number present but SHA missing.
- Build time at midnight/UTC boundary.
- Changelog missing, empty, or malformed.
- Modal open while a game key is pressed; Modal closed with Escape/outside.
- E off while focus is inside the sensor console.
- R and seed load in manual and autopilot modes.
- Destruction while autopilot is active.
- Hidden chart canvas with zero size on boot and reveal.
- Narrow viewport with long build label and open dialog.

## Affected interfaces

- `packages/game/index.html` — top bar, build label, changelog dialog, panel
  attributes.
- `packages/game/vite.config.ts` — build metadata and changelog injection.
- `packages/game/src/changelog.ts` (new) — modal wiring and entry rendering.
- `packages/game/src/game.ts` — visibility wiring, radar gating, input isolation.
- `packages/game/src/sensor-console.ts` — `setVisible`, reveal redraw.
- `packages/game/src/input.ts` — modal-open key guard.
- `packages/game/src/style.css` — top bar, dialog, hidden-console layout.
- `docs/CHANGELOG.md` (new) — curated history of all previous change logs.
- `docs/spec.md` — UI, visibility rule, build/changelog hooks, test strategy.
- `e2e/game.spec.ts`, `e2e/smoke.spec.ts`, `packages/game/test/**` — updated and
  new coverage.
- No `packages/sim` change.

## Parallelization plan

- One implementation ticket is recommended because the build label, changelog,
  and sensor visibility share `index.html`, `style.css`, `game.ts`, and the same
  e2e suite. Splitting would serialize on the same files or create avoidable
  integration conflicts.
- Workstreams inside the ticket: build/changelog (Vite + HTML + changelog module)
  and sensor visibility (`game.ts` + `sensor-console.ts` + CSS). The
  implementation engineer may do them sequentially; the test engineer writes unit
  and e2e tests alongside.
- Review depth: full review because the UI contract, build pipeline, and browser
  hooks change.
- Delivery: one live delivery after review and verify.

## Determinism and boundary impact

- No simulation or public API change.
- Build metadata is presentation-only and injected into HTML; hashed JS/CSS must
  remain stable across builds.
- The changelog parser is deterministic and build-time only.
- Radar visibility is presentation-only; sensor scans continue while hidden.
- Rendering reads state only.

## Verification plan

1. Unit tests for build formatting, changelog parsing, sensor visibility, game
   wiring, renderer gating, and modal input isolation.
2. Local Playwright for build label, changelog modal, sensor visibility, R/seed
   persistence, layout, and no console errors.
3. Build twice with different timestamps and confirm identical JS/CSS names.
4. `npm.cmd run verify`.
5. Reviewer full review.
6. Live delivery and live suite.
7. Update `docs/spec.md` hooks and UI rules in the same change.

## Open questions

None. The test-engineer and reviewer were consulted read-only. The
gameplay-engineer consult endpoint was unavailable during intake; the lead
covered the implementation analysis, and the responsible engineer will validate
the plan before coding.

## Delivery waiver

None.

## Confirmation

Confirmed by the user on 2026-10-21.
