import { describe, expect, it } from "vitest";
import type { Planet, Vec2, World } from "../src/index";
import {
  distance,
  dot,
  magnitude,
  planetsWithin,
  sim,
  unit,
} from "./helpers";

const SEEDS = [1, 7, 42, 1234, 2026, 5678, 99991, 314159] as const;
const SEARCH_CENTERS: readonly Vec2[] = [
  { x: 0, y: 0 },
  { x: 8_000, y: 0 },
  { x: -8_000, y: 0 },
  { x: 0, y: 8_000 },
  { x: 0, y: -8_000 },
];
const INFLUENCE_DISTANCE = sim.PLANET_GRAVITY_RANGE + sim.PLANET_RADIUS;
const MAX_SUPERPOSITION_SEPARATION = 2 * INFLUENCE_DISTANCE * 0.8;
const SUPERPOSITION_FRACTION = 0.4;
const EPSILON = 1e-9;
const TAU = Math.PI * 2;

interface GravityProbe {
  world: World;
  planet: Planet;
  outward: Vec2;
}

function directions(count: number): Vec2[] {
  return Array.from({ length: count }, (_unused, index) => {
    const angle = (index / count) * TAU;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
}

function findGravityProbe(): GravityProbe {
  for (const seed of SEEDS) {
    const world = sim.createSpaceField("gravity", seed, sim.START_POSITION);
    for (const center of SEARCH_CENTERS) {
      const planets = world.planetsInView(center, 4_000);
      if (planets.length === 0) {
        continue;
      }
      const broad = world.planetsInView(center, 4_000 + INFLUENCE_DISTANCE * 2);

      for (const planet of planets) {
        const nearbyAtCenter = broad.filter(
          (other) =>
            other.id !== planet.id &&
            distance(planet.position, other.position) <= INFLUENCE_DISTANCE,
        );
        if (nearbyAtCenter.length > 0) {
          continue;
        }

        for (const outward of directions(72)) {
          const surface = {
            x: planet.position.x + outward.x * planet.radius,
            y: planet.position.y + outward.y * planet.radius,
          };
          const far = {
            x:
              planet.position.x +
              outward.x * (planet.radius + sim.PLANET_GRAVITY_RANGE),
            y:
              planet.position.y +
              outward.y * (planet.radius + sim.PLANET_GRAVITY_RANGE),
          };
          const surfaceInfluences = broad.filter(
            (other) =>
              distance(surface, other.position) <= INFLUENCE_DISTANCE + EPSILON,
          );
          const farInfluences = broad.filter(
            (other) =>
              distance(far, other.position) <= INFLUENCE_DISTANCE + EPSILON,
          );
          if (
            surfaceInfluences.every((other) => other.id === planet.id) &&
            farInfluences.every((other) => other.id === planet.id)
          ) {
            return { world, planet, outward };
          }
        }
      }
    }
  }

  throw new Error("could not find an isolated Gravity probe");
}

function findGravitySample(): { seed: number; gravity: Vec2 } {
  for (let seed = 1; seed <= 128; seed += 1) {
    const world = sim.createSpaceField("gravity", seed, sim.START_POSITION);
    const gravity = world.gravityAt(sim.START_POSITION);
    if (magnitude(gravity) > 0.001) {
      return { seed, gravity };
    }
  }

  throw new Error("could not find a spawn with a non-zero planet gravity");
}

interface SuperpositionCase {
  world: World;
  first: Planet;
  second: Planet;
  point: Vec2;
  firstIsolated: Vec2;
  secondIsolated: Vec2;
}

function isolatedRadialPoint(
  world: World,
  planet: Planet,
  radius: number,
): Vec2 | undefined {
  const candidates = world.planetsInView(
    planet.position,
    radius + INFLUENCE_DISTANCE + 1,
  );

  for (const direction of directions(96)) {
    if (radius <= planet.radius + EPSILON) {
      continue;
    }
    const point = {
      x: planet.position.x + direction.x * radius,
      y: planet.position.y + direction.y * radius,
    };
    const influences = candidates.filter(
      (other) =>
        distance(point, other.position) <= INFLUENCE_DISTANCE + EPSILON,
    );
    if (influences.length === 1 && influences[0]!.id === planet.id) {
      return point;
    }
  }

  return undefined;
}

function findSuperposition(): SuperpositionCase {
  for (const seed of SEEDS) {
    const world = sim.createSpaceField("gravity", seed, sim.START_POSITION);
    const center: Vec2 = { x: 0, y: 0 };
    const broad = world.planetsInView(center, 7_500);
    const local = broad.filter(
      (planet) => distance(center, planet.position) <= 6_000,
    );

    for (let firstIndex = 0; firstIndex < local.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < local.length;
        secondIndex += 1
      ) {
        const first = local[firstIndex]!;
        const second = local[secondIndex]!;
        const separation = distance(first.position, second.position);
        if (
          separation <= first.radius + second.radius + EPSILON ||
          separation > MAX_SUPERPOSITION_SEPARATION
        ) {
          continue;
        }

        const point = {
          x:
            first.position.x +
            (second.position.x - first.position.x) * SUPERPOSITION_FRACTION,
          y:
            first.position.y +
            (second.position.y - first.position.y) * SUPERPOSITION_FRACTION,
        };
        if (
          distance(point, first.position) <= first.radius + EPSILON ||
          distance(point, second.position) <= second.radius + EPSILON
        ) {
          continue;
        }

        const influences = broad.filter(
          (planet) =>
            distance(point, planet.position) <= INFLUENCE_DISTANCE + EPSILON,
        );
        if (
          influences.length !== 2 ||
          !influences.some((planet) => planet.id === first.id) ||
          !influences.some((planet) => planet.id === second.id)
        ) {
          continue;
        }

        const firstIsolated = isolatedRadialPoint(
          world,
          first,
          distance(point, first.position),
        );
        const secondIsolated = isolatedRadialPoint(
          world,
          second,
          distance(point, second.position),
        );
        if (firstIsolated === undefined || secondIsolated === undefined) {
          continue;
        }

        return {
          world,
          first,
          second,
          point,
          firstIsolated,
          secondIsolated,
        };
      }
    }
  }

  throw new Error("could not find an overlapping Gravity field");
}

describe("inverse-square planet gravity", () => {
  it("is 8.0 m/s² at the surface and points toward an attracting planet", () => {
    const { world, planet, outward } = findGravityProbe();
    const surface = {
      x: planet.position.x + outward.x * planet.radius,
      y: planet.position.y + outward.y * planet.radius,
    };
    const gravity = world.gravityAt(surface);
    const inward = { x: -outward.x, y: -outward.y };

    expect(magnitude(gravity)).toBeCloseTo(sim.PLANET_SURFACE_GRAVITY, 9);
    expect(dot(gravity, inward)).toBeCloseTo(sim.PLANET_SURFACE_GRAVITY, 9);
    expect(dot(gravity, outward)).toBeCloseTo(
      -sim.PLANET_SURFACE_GRAVITY,
      9,
    );
  });

  it("is exactly zero at 480 m beyond the surface and stays zero beyond", () => {
    const { world, planet, outward } = findGravityProbe();
    const atCutoff = {
      x:
        planet.position.x +
        outward.x * (planet.radius + sim.PLANET_GRAVITY_RANGE),
      y:
        planet.position.y +
        outward.y * (planet.radius + sim.PLANET_GRAVITY_RANGE),
    };
    const beyond = {
      x:
        planet.position.x +
        outward.x * (planet.radius + sim.PLANET_GRAVITY_RANGE + 1),
      y:
        planet.position.y +
        outward.y * (planet.radius + sim.PLANET_GRAVITY_RANGE + 1),
    };

    expect(world.gravityAt(atCutoff)).toEqual({ x: 0, y: 0 });
    expect(magnitude(world.gravityAt(beyond))).toBe(0);
  });

  it("is finite near and inside the planet and softened to zero at the center", () => {
    const { world, planet, outward } = findGravityProbe();
    const center = world.gravityAt(planet.position);
    const nearCenter = world.gravityAt({
      x: planet.position.x + outward.x * 1e-6,
      y: planet.position.y + outward.y * 1e-6,
    });
    const halfRadius = world.gravityAt({
      x: planet.position.x + outward.x * planet.radius * 0.5,
      y: planet.position.y + outward.y * planet.radius * 0.5,
    });
    const almostSurface = world.gravityAt({
      x:
        planet.position.x +
        outward.x * (planet.radius - EPSILON * 1_000),
      y:
        planet.position.y +
        outward.y * (planet.radius - EPSILON * 1_000),
    });

    expect(magnitude(center)).toBe(0);
    for (const gravity of [nearCenter, halfRadius, almostSurface]) {
      expect(Number.isFinite(gravity.x)).toBe(true);
      expect(Number.isFinite(gravity.y)).toBe(true);
      expect(magnitude(gravity)).toBeGreaterThan(0);
    }
  });

  it("adds overlapping planet fields by vector superposition", () => {
    const {
      world,
      first,
      second,
      point,
      firstIsolated,
      secondIsolated,
    } = findSuperposition();
    const firstGravity = world.gravityAt(firstIsolated);
    const secondGravity = world.gravityAt(secondIsolated);
    const firstDirection = unit({
      x: first.position.x - point.x,
      y: first.position.y - point.y,
    });
    const secondDirection = unit({
      x: second.position.x - point.x,
      y: second.position.y - point.y,
    });
    const expected = {
      x:
        magnitude(firstGravity) * firstDirection.x +
        magnitude(secondGravity) * secondDirection.x,
      y:
        magnitude(firstGravity) * firstDirection.y +
        magnitude(secondGravity) * secondDirection.y,
    };
    const combined = world.gravityAt(point);

    expect(combined.x).toBeCloseTo(expected.x, 6);
    expect(combined.y).toBeCloseTo(expected.y, 6);
  });

  it("multiplies planet gravity by gravityScale without adding uniform gravity", () => {
    const { seed, gravity: baseGravity } = findGravitySample();
    const base = sim.createSimulation({ level: "gravity", seed });
    const scaled = sim.createSimulation({
      level: "gravity",
      seed,
      gravityScale: 2.5,
    });

    const baseState = base.getState();
    const scaledState = scaled.getState();
    expect(magnitude(baseState.gravityAcceleration)).toBeGreaterThan(0);
    expect(baseState.gravityAcceleration.x).toBeCloseTo(baseGravity.x, 10);
    expect(baseState.gravityAcceleration.y).toBeCloseTo(baseGravity.y, 10);
    expect(scaledState.gravity).toBe(0);
    expect(scaledState.gravityAcceleration.x).toBeCloseTo(
      baseState.gravityAcceleration.x * 2.5,
      9,
    );
    expect(scaledState.gravityAcceleration.y).toBeCloseTo(
      baseState.gravityAcceleration.y * 2.5,
      9,
    );
    expect(scaled.getObservation().gravityAcceleration).toEqual(
      scaledState.gravityAcceleration,
    );

    base.setGravityScale(0.5);
    const halved = base.getState().gravityAcceleration;
    expect(halved.x).toBeCloseTo(baseState.gravityAcceleration.x * 0.5, 9);
    expect(halved.y).toBeCloseTo(baseState.gravityAcceleration.y * 0.5, 9);
  });

  it("keeps gravity finite for planets discovered by large-coordinate queries", () => {
    const world = sim.createSpaceField("gravity", 424242, sim.START_POSITION);
    const center: Vec2 = { x: -1_250_000, y: 987_654 };
    const planets = planetsWithin(world, center, 2_000);

    expect(planets.length).toBeGreaterThan(0);
    for (const planet of planets) {
      for (const direction of [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
      ]) {
        const gravity = world.gravityAt({
          x: planet.position.x + direction.x * planet.radius,
          y: planet.position.y + direction.y * planet.radius,
        });
        expect(Number.isFinite(gravity.x)).toBe(true);
        expect(Number.isFinite(gravity.y)).toBe(true);
      }
    }
  });
});
