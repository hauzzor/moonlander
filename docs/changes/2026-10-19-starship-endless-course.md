# Starship Endless Course Replacement

## Original request

> I want to make changes to the game. instead of trying to land on the moon The
> player should fly the Starship through a course with Bending walls and
> obstacles . also remove fuel this should be infinite. thrusters should feel a
> little more responsive Not so slow

## Goal

Replace the lunar-landing game with an endless, side-view Starship flight game
in a deterministic, seeded, infinite 2D field. The player flies with retuned
Q/W thrusters, weaves through static curved walls and narrow gates, accumulates
distance and gate score, and survives as long as possible with hull health.
Fuel is removed entirely.

## Current behavior

- 600 m lunar terrain, landing pad, touchdown rules, and `landed` /
  `missed-pad` / `crashed` outcomes.
- Finite fuel, fuel burn, and fuel telemetry.
- Fixed whole-world camera and landing-specific HUD (altitude, vertical speed,
  horizontal speed, tilt, fuel).
- Landing-specific public simulation API: `Terrain`, `pad`, `altitude`,
  `padOffsetX`, `fuel`, and `LandingOutcome`.
- Unit and e2e tests pin the landing physics, fuel, HUD, and outcomes. These
  tests will be replaced as part of this change, not weakened.

## Desired behavior

- **Mode:** Full replacement. No landing mode, pad, heightfield terrain, or
  fuel.
- **Flight:** Side-view, gravity remains at 1.62 m/s² downward. `Q` fires the
  left thruster, `W` fires the right thruster, and `R` starts a fresh run with a
  new seed.
- **Field:** Infinite procedural field in all directions with an infinite solid
  ground plane at `y = 0`. Deterministic chunks generate around the ship. The
  same seed and action sequence produce the same field and state. There is no
  hard boundary.
- **Ship:** New longer, sleeker Starship hull with two rear/downward engines and
  a new collision outline. Physics is retuned to the hull.
- **Hazards:** Static curved wall segments and narrow gates/rings only. No
  floating rocks, moving hazards, or difficulty ramp. Walls, gate frames, and
  the ground are solid.
- **Health:** 100 hull. Impacts below roughly 2 m/s are harmless. Above that,
  damage scales with impact speed. The ship bounces away from the surface. A
  brief invulnerability window follows damage. At 0 hull, the run ends and the
  simulation freezes.
- **Camera:** Smooth 2D follow with look-ahead. The field generates around the
  ship.
- **Scoring:** Progress is the farthest Euclidean distance from spawn. Score is
  `floor(progress)` plus a one-time bonus for each gate passed. Gates are
  optional scoring challenges.
- **HUD:** Hull, speed, progress, score, and thruster indicators. Fuel is
  removed. The current seed is displayed, editable, and copyable.
- **Restart/seed:** `R` generates a new seed. Loading a specific seed replays
  that course deterministically.
- **Branding:** Keep the Moonlander name and add a Starship-course subtitle and
  theme.

## Proposed tuning defaults

- Hull: 48 m long, 18 m tall, mass 200 kg. Engines at `{ x: -16, y: -9 }` and
  `{ x: 16, y: -9 }`, 700 N each, 15° cant. This yields about 1.5× the previous
  linear and angular response.
- Damage above the 2 m/s threshold:
  `max(1, round((impactSpeed - 2) * 4))`, 0.75 s invulnerability, bounce
  restitution 0.35.
- Gate bonus: 50 points each, counted once.
- Field: 80 m chunks, constant obstacle density, and a safe spawn radius of
  100 m.
- Observation: `x`, `y`, `vx`, `vy`, `angle`, `angularVelocity`, `hull`,
  `progress`, `score`, `nearestWallDistance`, `nearestGateDistance`, and
  `nearestGateAngle`. All values are finite.
- Start: position `{ x: 0, y: 60 }`, zero velocity, angle `0`, hull `100`,
  score `0`, progress `0`.

## Non-goals

- Landing mode, pad, heightfield terrain, finite fuel, or landing outcomes.
- Moving or deforming walls, floating rocks, moving hazards, or a difficulty
  ramp.
- Multiple authored levels, checkpoints, respawns, leaderboards, multiplayer,
  touch controls, or audio.
- Changing the 120 Hz fixed-timestep, deterministic, headless simulation
  architecture.
- Browser dependencies or `Math.random` inside `packages/sim`.

## Acceptance criteria

1. No landing, pad, terrain-heightfield, or fuel behavior remains.
2. The same seed and action sequence produce identical field geometry, state,
   collisions, and scores.
3. `Q` and `W` fire the correct thrusters. `R` starts a fresh run with a new
   seed. A specific seed can be loaded.
4. Thrust works indefinitely. Fuel is absent from state, observation, HUD, and
   tests.
5. Linear and angular response is measurably about 1.5× the previous values.
6. Curved walls, gates, and the ground collide correctly. Impacts bounce the
   ship and damage hull above the threshold. Invulnerability prevents rapid
   multi-hit drain. 0 hull ends the run.
7. Infinite field generation and the ground continue around the ship. The
   camera follows smoothly.
8. The HUD shows finite hull, speed, progress, score, and thruster state. Seed
   controls work.
9. Gate passes grant a one-time score bonus. Progress and score update
   correctly. Flying backward does not reduce progress.
10. Typecheck, unit tests, e2e, build, and the live smoke test pass.
    `packages/sim` remains DOM-free.

## Edge cases

- High-speed collision and tunneling.
- Simultaneous wall, gate, and ground contacts.
- Joints and corners on curved wall polylines.
- Repeated contact during invulnerability.
- Hull clamped to `0..100`.
- Progress and score monotonicity.
- Invalid, empty, or negative seed input.
- Restart during flight and after destruction.
- Chunk-boundary continuity and negative chunk coordinates.
- Very long runs and large coordinates remaining finite.
- Flying back toward or past spawn.
- Gate pass counted only once.
- Ship at rest on the ground.

## Affected interfaces

- `packages/sim/src/types.ts`: replace landing types with `ShipState`,
  `RunOutcome`, `CurvedWall`, `Gate`, `FieldChunk`, `Field`, and a course-aware
  `Observation`. Remove fuel, terrain, pad, and landing types.
- `packages/sim/src/index.ts`: export the new API and remove landing exports.
- `packages/sim/src/simulation.ts`: new field-aware simulation, seed reset, and
  scoring.
- `packages/sim/src/physics.ts`: retuned hull, thrust, torque, and gravity.
- `packages/sim/src/collision.ts`: capsule/segment collision, bounce, damage,
  invulnerability, gates, and ground.
- `packages/sim/src/terrain.ts`: replace with deterministic field generation.
- `packages/game/src/main.ts`: follow camera, field rendering, Starship
  rendering, new HUD, seed controls, and outcome overlay.
- `packages/game/index.html` and `packages/game/src/style.css`: new HUD,
  controls, and branding.
- `packages/sim/test`, `packages/game/test`, and `e2e`: replace landing tests
  and add course tests.
- `docs/spec.md`, `docs/autonomy.md`, `README.md`, and the `AGENTS.md` product
  description: update to the new game.

## Determinism and boundary impact

- Keep `FIXED_DT = 1/120`.
- No `Math.random` or wall-clock time inside `packages/sim`.
- Generate chunks deterministically from the seed and integer chunk
  coordinates, independent of generation order.
- Use stable iteration order for collision and scoring.
- Use swept collision or substepping to prevent tunneling at high speed.
- Keep observation fields finite. Do not use `Infinity`.
- Rendering reads simulation state and never mutates it.
- The public `@moonlander/sim` API intentionally breaks from the landing API;
  no compatibility aliases are required.

## Verification plan

- The test engineer writes failing tests first for field determinism, chunk
  continuation, collision/bounce/damage, invulnerability, hull destruction,
  scoring, seed/reset, observation finiteness, and the new HUD/controls.
- The simulation engineer implements `packages/sim`.
- The gameplay engineer implements `packages/game`.
- The code reviewer checks behavior, architecture, determinism, and TDD
  evidence.
- The lead runs `npm.cmd run typecheck`, `npm.cmd test`,
  `npm.cmd run test:e2e`, and `npm.cmd run build`, then verifies the live
  deployment when delivery is requested.

## Open questions

None.
