import { describe, expect, it } from "vitest";
import type { Planet, Vec2 } from "../src/index";
import {
  distance,
  magnitude,
  planetDistance,
  planetsWithin,
  sim,
} from "./helpers";

const BENCHMARK_SEEDS = [1, 7, 42, 1234, 2026, 5678, 99991, 314159] as const;
const GENERATION_CENTER: Vec2 = { x: 25_000, y: -18_000 };
const GENERATION_RADIUS = 8_000;
const DENSITY_RADIUS = 7_500;
const DENSITY_BOX = 5_000;
const EPSILON = 1e-9;

function worldFor(seed: number) {
  return sim.createSpaceField("gravity", seed, sim.START_POSITION);
}

function planetsAt(seed: number, center: Vec2, radius: number): Planet[] {
  return planetsWithin(worldFor(seed), center, radius);
}

function cellKey(position: Vec2): string {
  return `${Math.floor(position.x / sim.PLANET_CELL_SIZE)},${Math.floor(
    position.y / sim.PLANET_CELL_SIZE,
  )}`;
}

describe("deterministic Gravity planet generation", () => {
  it("freezes the documented planet model constants", () => {
    expect(sim.PLANET_RADIUS).toBe(24);
    expect(sim.PLANET_SURFACE_GRAVITY).toBe(8);
    expect(sim.PLANET_GRAVITY_RANGE).toBe(480);
    expect(sim.PLANET_CELL_SIZE).toBe(500);
    expect(sim.PLANET_DENSITY).toBe(0.6);
    expect(sim.PLANET_MIN_SURFACE_GAP).toBe(192);
    expect(sim.PLANET_SPAWN_CLEARANCE).toBe(300);
  });

  it("repeats exactly for the same seed and differs for another seed", () => {
    for (const seed of BENCHMARK_SEEDS) {
      const first = planetsAt(seed, GENERATION_CENTER, GENERATION_RADIUS);
      const repeated = planetsAt(seed, GENERATION_CENTER, GENERATION_RADIUS);

      expect(first.length).toBeGreaterThan(0);
      expect(repeated).toEqual(first);
    }

    const baseline = planetsAt(1, GENERATION_CENTER, GENERATION_RADIUS);
    const different = planetsAt(7, GENERATION_CENTER, GENERATION_RADIUS);
    expect(different).not.toEqual(baseline);
  });

  it("uses radius 24, surface gravity 8, attract polarity, and no Level 2 drift", () => {
    for (const seed of BENCHMARK_SEEDS) {
      const planets = planetsAt(seed, GENERATION_CENTER, GENERATION_RADIUS);

      for (const planet of planets) {
        expect(planet.id.length).toBeGreaterThan(0);
        expect(planet.radius).toBe(sim.PLANET_RADIUS);
        expect(planet.surfaceGravity).toBe(sim.PLANET_SURFACE_GRAVITY);
        expect(planet.polarity).toBe("attract");
        expect(planet.velocity).toEqual({ x: 0, y: 0 });
        expect(Number.isFinite(planet.position.x)).toBe(true);
        expect(Number.isFinite(planet.position.y)).toBe(true);
        expect(Number.isFinite(planet.velocity.x)).toBe(true);
        expect(Number.isFinite(planet.velocity.y)).toBe(true);
      }
    }
  });

  it("keeps at least 192 m of empty space between every pair of planet surfaces", () => {
    const failures: string[] = [];

    for (const seed of BENCHMARK_SEEDS) {
      const planets = planetsAt(seed, GENERATION_CENTER, GENERATION_RADIUS);
      for (let first = 0; first < planets.length; first += 1) {
        for (let second = first + 1; second < planets.length; second += 1) {
          const a = planets[first]!;
          const b = planets[second]!;
          const surfaceGap =
            planetDistance(a.position, b) - a.radius - b.radius;
          if (surfaceGap < sim.PLANET_MIN_SURFACE_GAP - EPSILON) {
            failures.push(
              `seed ${seed}: ${a.id} and ${b.id} have ${surfaceGap} m of surface gap`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps the ship spawn clear of every planet by at least 300 m", () => {
    for (const seed of BENCHMARK_SEEDS) {
      const world = worldFor(seed);
      const nearby = world.planetsInView(world.spawn, 1_000);

      expect(nearby.length).toBeGreaterThan(0);
      for (const planet of nearby) {
        expect(planetDistance(world.spawn, planet)).toBeGreaterThanOrEqual(
          sim.PLANET_SPAWN_CLEARANCE - EPSILON,
        );
      }
      for (const planet of world.planets) {
        expect(planetDistance(world.spawn, planet)).toBeGreaterThanOrEqual(
          sim.PLANET_SPAWN_CLEARANCE - EPSILON,
        );
      }
    }
  });

  it("places at most one planet per 500 m cell with medium occupancy", () => {
    const world = worldFor(42);
    const planets = planetsWithin(world, GENERATION_CENTER, DENSITY_RADIUS).filter(
      (planet) =>
        Math.abs(planet.position.x - GENERATION_CENTER.x) < DENSITY_BOX &&
        Math.abs(planet.position.y - GENERATION_CENTER.y) < DENSITY_BOX,
    );
    const counts = new Map<string, number>();

    for (const planet of planets) {
      const key = cellKey(planet.position);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(planets.length).toBeGreaterThan(0);
    for (const [key, count] of counts) {
      expect(count, `cell ${key} contains ${count} planets`).toBe(1);
    }

    const cellsPerSide = (DENSITY_BOX * 2) / sim.PLANET_CELL_SIZE;
    const totalCells = cellsPerSide * cellsPerSide;
    const occupancy = counts.size / totalCells;
    expect(occupancy).toBeGreaterThanOrEqual(0.2);
    expect(occupancy).toBeLessThanOrEqual(0.85);
  });

  it("uses unique, stable, sorted planet ids for repeated and reordered queries", () => {
    const world = worldFor(1234);
    const first = world.planetsInView(GENERATION_CENTER, GENERATION_RADIUS);
    const second = world.planetsInView(GENERATION_CENTER, GENERATION_RADIUS);
    const ids = first.map((planet) => planet.id);

    expect(first.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    expect(second).toEqual(first);

    const reversed = [...first].reverse();
    expect([...reversed].sort((a, b) => a.id.localeCompare(b.id))).toEqual(first);
  });

  it("keeps generated positions finite and bounded by the query radius", () => {
    const world = worldFor(7);
    const planets = world.planetsInView(GENERATION_CENTER, 1_200);

    expect(planets.length).toBeGreaterThan(0);
    for (const planet of planets) {
      expect(Number.isFinite(planet.position.x)).toBe(true);
      expect(Number.isFinite(planet.position.y)).toBe(true);
      expect(Number.isFinite(magnitude(planet.position))).toBe(true);
      expect(distance(GENERATION_CENTER, planet.position)).toBeLessThanOrEqual(
        1_200 + sim.PLANET_RADIUS + EPSILON,
      );
    }
  });
});
