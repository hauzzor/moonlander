import { describe, expect, it } from "vitest";
import type { Planet, Vec2, World } from "../src/index";
import {
  distance,
  magnitude,
  planetDistance,
  planetsWithin,
  sim,
} from "./helpers";

const SEED = 314_159;
const QUERY_RADIUS = 3_000;
const FAR_CENTERS: readonly Vec2[] = [
  { x: 0, y: 0 },
  { x: 1_000_000, y: -1_000_000 },
  { x: -1_000_000, y: 1_000_000 },
  { x: 987_654, y: 321_000 },
  { x: -1_250_000, y: -987_654 },
];
const EPSILON = 1e-9;

function sortedById(planets: readonly Planet[]): Planet[] {
  return [...planets].sort((first, second) =>
    first.id < second.id ? -1 : first.id > second.id ? 1 : 0,
  );
}

function query(
  world: World,
  center: Vec2,
  radius = QUERY_RADIUS,
): Planet[] {
  return planetsWithin(world, center, radius + sim.PLANET_RADIUS + EPSILON);
}

describe("infinite Gravity map queries", () => {
  it("returns deterministic, finite planets at large positive and negative coordinates", () => {
    const world = sim.createSpaceField("gravity", SEED, sim.START_POSITION);
    const repeatedWorld = sim.createSpaceField(
      "gravity",
      SEED,
      sim.START_POSITION,
    );

    for (const center of FAR_CENTERS) {
      const first = query(world, center);
      const repeated = query(world, center);
      const otherWorld = query(repeatedWorld, center);

      expect(first.length, `no planets near ${JSON.stringify(center)}`).toBeGreaterThan(0);
      expect(repeated).toEqual(first);
      expect(otherWorld).toEqual(first);

      for (const planet of first) {
        expect(Number.isFinite(planet.position.x)).toBe(true);
        expect(Number.isFinite(planet.position.y)).toBe(true);
        expect(Number.isFinite(magnitude(planet.position))).toBe(true);
      }
    }
  });

  it("sorts stable ids and is independent of query order", () => {
    const forward = sim.createSpaceField("gravity", SEED, sim.START_POSITION);
    const reverse = sim.createSpaceField("gravity", SEED, sim.START_POSITION);
    const forwardResults = new Map<string, Planet[]>();

    for (const center of FAR_CENTERS) {
      const result = query(forward, center);
      const ids = result.map((planet) => planet.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([...ids].sort());
      expect(result).toEqual(sortedById(result));
      forwardResults.set(`${center.x},${center.y}`, result);
    }

    for (let index = FAR_CENTERS.length - 1; index >= 0; index -= 1) {
      const center = FAR_CENTERS[index]!;
      expect(query(reverse, center)).toEqual(
        forwardResults.get(`${center.x},${center.y}`),
      );
    }
  });

  it("applies spawn clearance and relative Euclidean progress at large coordinates", () => {
    const spawn: Vec2 = { x: -1_250_000, y: 987_654 };
    const world = sim.createSpaceField("gravity", SEED, spawn);
    const nearby = world.planetsInView(spawn, 1_500);

    expect(nearby.length).toBeGreaterThan(0);
    for (const planet of nearby) {
      expect(planetDistance(spawn, planet)).toBeGreaterThanOrEqual(
        sim.PLANET_SPAWN_CLEARANCE - EPSILON,
      );
    }

    expect(world.progressAt(spawn)).toBe(0);
    expect(
      world.progressAt({ x: spawn.x + 3, y: spawn.y + 4 }),
    ).toBeCloseTo(5, 12);
    expect(
      world.progressAt({ x: spawn.x - 3, y: spawn.y + 4 }),
    ).toBeCloseTo(5, 12);
    expect(
      world.progressAt({ x: spawn.x + 1e6, y: spawn.y + 1e6 }),
    ).toBeCloseTo(Math.hypot(1e6, 1e6), 8);
  });

  it("keeps gravity and repeated planet lookups finite far from the origin", () => {
    const world = sim.createSpaceField("gravity", SEED, sim.START_POSITION);
    const probe: Vec2 = { x: 1_000_000, y: -1_000_000 };
    const planets = query(world, probe);
    const planet = planets[0]!;
    const surface = {
      x: planet.position.x + planet.radius,
      y: planet.position.y,
    };

    const gravity = world.gravityAt(surface);
    expect(Number.isFinite(gravity.x)).toBe(true);
    expect(Number.isFinite(gravity.y)).toBe(true);
    expect(magnitude(gravity)).toBeGreaterThan(0);

    expect(planetDistance(probe, planet)).toBeCloseTo(
      distance(probe, planet.position),
      12,
    );
    expect(world.planetsInView(probe, QUERY_RADIUS)).toEqual(
      world.planetsInView(probe, QUERY_RADIUS),
    );
  });
});
