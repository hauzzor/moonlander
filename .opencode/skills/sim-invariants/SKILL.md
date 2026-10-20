---
name: sim-invariants
description: Use when editing packages/sim, physics, tunnel or field generation, collision, sensors, autopilot, observation, or simulation tests. Covers determinism, fixed timestep, the DOM-free boundary, seeded geometry, swept collision, finite observations, and the autopilot benchmark.
---

# Simulation invariants

## Boundary

`packages/sim` is pure TypeScript:

- no DOM library or browser globals
- no dependency on `packages/game`
- no `Math.random`, wall-clock time, or query-order-dependent caches
- `packages/sim/tsconfig.json` omits the DOM library, so browser coupling is a
  compile error

Rendering reads simulation state and never mutates it.

## Determinism

- Fixed step `FIXED_DT = 1 / 120`; no frame-rate dependence.
- Same seed, start state, and action sequence produce the same state sequence.
- Field generation is a pure deterministic function of seed and coordinates,
  including negative x and chunk boundaries.
- Stable iteration order for collision, sensors, and scoring.
- Observations contain finite numbers only; never `Infinity` or `NaN`.

## Physics

- Gravity `1.62 m/s²` downward, +x right and +y up.
- Ship mass, inertia, hull geometry, canted thrusters, rear booster, and drag
  constants are frozen in `docs/spec.md` unless a confirmed brief changes them.
- Drag applies after thrust, gravity, and torque and before position
  integration.
- Collision must be swept or substepped so high-speed travel cannot tunnel
  through walls.
- Damage, bounce, invulnerability, and destruction are applied once per tick
  using the highest impact speed.

## Tunnel and field

- The tunnel is endless, enclosed, x-monotonic, and single-valued.
- The first `TUNNEL_START_STRAIGHT = 120` m is straight at
  `TUNNEL_CENTER_Y = 60` with the nominal width.
- Near-vertical sections, local width variation, normal-offset walls, and
  maximum chord sampling follow the frozen spec.
- Wall segments belong to exactly one chunk by midpoint; adjacent chunks share
  endpoints.
- `Tunnel.halfWidthAt(x)` is the local perpendicular half-width;
  `Tunnel.halfWidth` is only the nominal value.

## Sensors and autopilot

- Eye: 360 absolute world-angle rays from the ship hull rim, distances to the
  wall surface or the view radius, scans at tick 0 and every 120 ticks.
- Direction: normalized `-π..π` horizon angle.
- Distance to start: Euclidean from spawn.
- Velocity: world vector, speed, and direction.
- Autopilot: deterministic, observation-driven, exclusively controls all three
  thrusters, and prioritizes zero wall contact over speed. Its empirical
  benchmark is part of the spec; do not lower thresholds to pass.

## Before reporting done

Run `npm.cmd run typecheck:sim` and the focused unit tests, then
`npm.cmd run verify` at the ticket level. Report any test that contradicts the
spec instead of editing it.
