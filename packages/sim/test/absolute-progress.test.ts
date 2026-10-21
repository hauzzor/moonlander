import { describe, expect, it } from "vitest";
import type { Action, SimState, Simulation, Vec2 } from "../src/index";
import { bothThrusters, distance, noThrusters, sim } from "./helpers";

const ACTION_SCHEDULE: readonly Action[] = [
  noThrusters,
  bothThrusters,
  { left: true, right: false, rear: false },
  { left: false, right: true, rear: false },
  { left: false, right: false, rear: true },
  { left: true, right: true, rear: true },
];

function distanceFromSpawn(state: SimState, spawn: Vec2): number {
  return distance(state.ship.position, spawn);
}

function worldPlanets(simulation: Simulation) {
  if (simulation.world.kind !== "space") {
    return [];
  }
  return simulation.world.planets.map((planet) => ({
    id: planet.id,
    position: { x: planet.position.x, y: planet.position.y },
  }));
}

describe("max-Euclidean open-space progress", () => {
  it("measures world progressAt as Euclidean distance from the spawn in every direction", () => {
    const spawn: Vec2 = { x: -120, y: 45 };
    const world = sim.createSpaceField("gravity", 42, spawn);

    expect(world.progressAt(spawn)).toBe(0);
    expect(world.progressAt({ x: spawn.x + 3, y: spawn.y + 4 })).toBeCloseTo(
      5,
      12,
    );
    expect(world.progressAt({ x: spawn.x - 3, y: spawn.y + 4 })).toBeCloseTo(
      5,
      12,
    );
    expect(world.progressAt({ x: spawn.x, y: spawn.y - 12 })).toBeCloseTo(12, 12);
    expect(
      world.progressAt({ x: spawn.x + 1e6, y: spawn.y - 1e6 }),
    ).toBeCloseTo(Math.hypot(1e6, 1e6), 8);
  });

  it("starts at progress and score zero and uses floor(progress) for the score", () => {
    const simulation = sim.createSimulation({
      level: "gravity",
      seed: 42,
      start: { velocity: { x: 3, y: 4 } },
    });
    const initial = simulation.getState();
    expect(initial.progress).toBe(0);
    expect(initial.score).toBe(0);

    const first = simulation.step(noThrusters);
    const expected = distanceFromSpawn(
      first,
      sim.START_POSITION,
    );
    expect(first.progress).toBeCloseTo(expected, 12);
    expect(first.score).toBe(Math.floor(first.progress));
    expect(first.progress).toBeGreaterThan(0);
    expect(simulation.getObservation().progress).toBe(first.progress);
    expect(simulation.getObservation().score).toBe(first.score);
  });

  it("never decreases progress and records score as floor(progress) across a mixed run", () => {
    const simulation = sim.createSimulation({
      level: "gravity",
      seed: 7,
      start: { velocity: { x: 4, y: 2 } },
    });
    let previous = simulation.getState();
    let furthest = distanceFromSpawn(previous, sim.START_POSITION);

    for (let tick = 0; tick < 600; tick += 1) {
      const state = simulation.step(
        ACTION_SCHEDULE[tick % ACTION_SCHEDULE.length]!,
      );
      furthest = Math.max(
        furthest,
        distanceFromSpawn(state, sim.START_POSITION),
      );

      expect(state.progress).toBeGreaterThanOrEqual(previous.progress);
      expect(state.progress).toBeCloseTo(furthest, 9);
      expect(state.score).toBe(Math.floor(state.progress));
      expect(simulation.getObservation().progress).toBe(state.progress);
      expect(simulation.getObservation().score).toBe(state.score);
      previous = state;
    }

    expect(previous.progress).toBeGreaterThan(0);
    expect(previous.score).toBeGreaterThanOrEqual(0);
  });

  it("increases progress when flying backwards or sideways in Level 2", () => {
    const backwards = sim.createSimulation({
      level: "gravity",
      seed: 7,
      start: { velocity: { x: -8, y: 0 } },
    });
    let state = backwards.getState();
    for (let tick = 0; tick < 120; tick += 1) {
      state = backwards.step(noThrusters);
    }

    expect(state.ship.position.x).toBeLessThan(sim.START_POSITION.x);
    expect(state.progress).toBeCloseTo(
      distanceFromSpawn(state, sim.START_POSITION),
      9,
    );
    expect(state.progress).toBeGreaterThan(0);
    expect(state.score).toBe(Math.floor(state.progress));

    const sideways = sim.createSimulation({
      level: "gravity",
      seed: 7,
      start: { velocity: { x: 0, y: 8 } },
    });
    let sidewaysState = sideways.getState();
    for (let tick = 0; tick < 120; tick += 1) {
      sidewaysState = sideways.step(noThrusters);
    }
    expect(sidewaysState.ship.position.y).toBeGreaterThan(
      sim.START_POSITION.y,
    );
    expect(sidewaysState.progress).toBeCloseTo(
      distanceFromSpawn(sidewaysState, sim.START_POSITION),
      9,
    );
    expect(sidewaysState.progress).toBeGreaterThan(0);
  });

  it("resets progress, score, planets, and the run deterministically", () => {
    const first = sim.createSimulation({ level: "gravity", seed: 2026 });
    const second = sim.createSimulation({ level: "gravity", seed: 2026 });
    const beforePlanets = worldPlanets(first);

    for (let tick = 0; tick < 480; tick += 1) {
      const action = ACTION_SCHEDULE[tick % ACTION_SCHEDULE.length]!;
      expect(first.step(action)).toEqual(second.step(action));
    }

    const reset = first.reset(2026);
    const fresh = sim.createSimulation({ level: "gravity", seed: 2026 });

    expect(reset).toEqual(fresh.getState());
    expect(reset.progress).toBe(0);
    expect(reset.score).toBe(0);
    expect(reset.tick).toBe(0);
    expect(first.getState()).toEqual(fresh.getState());
    expect(worldPlanets(first)).toEqual(beforePlanets);

    first.step(ACTION_SCHEDULE[1]!);
    const resetSameSeed = first.reset();
    expect(resetSameSeed).toEqual(fresh.getState());
    expect(resetSameSeed.seed).toBe(2026);
  });

  it("uses a different deterministic planet layout for a different seed", () => {
    const first = sim.createSpaceField("gravity", 2026, sim.START_POSITION);
    const second = sim.createSpaceField("gravity", 2027, sim.START_POSITION);
    const firstPlanets = first.planetsInView(sim.START_POSITION, 3_000);
    const secondPlanets = second.planetsInView(sim.START_POSITION, 3_000);

    expect(firstPlanets.length).toBeGreaterThan(0);
    expect(secondPlanets.length).toBeGreaterThan(0);
    expect(secondPlanets).not.toEqual(firstPlanets);
  });
});
