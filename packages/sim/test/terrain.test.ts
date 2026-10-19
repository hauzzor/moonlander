import { describe, expect, it } from "vitest";
import {
  createSimulation,
  SAFE_LANDING,
  WORLD_WIDTH,
} from "../src/index";

const noThrusters = { left: false, right: false };
const bothThrusters = { left: true, right: true };

const feet = [
  { x: -14, y: -16 },
  { x: 14, y: -16 },
] as const;
const nose = { x: 0, y: 14 };

function rotate(point: { x: number; y: number }, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function createNearGroundSimulation(options: {
  x: number;
  angle?: number;
  velocity?: { x: number; y: number };
  seed?: number;
}) {
  const seed = options.seed ?? 41;
  const angle = options.angle ?? 0;
  const terrain = createSimulation({ seed }).terrain;
  const centerHeight = Math.max(
    ...feet.map((foot) => {
      const offset = rotate(foot, angle);
      return terrain.heightAt(options.x + offset.x) - offset.y;
    }),
  );

  return createSimulation({
    seed,
    start: {
      position: { x: options.x, y: centerHeight + 0.08 },
      velocity: options.velocity ?? { x: 0, y: -0.8 },
      angle,
      angularVelocity: 0,
    },
  });
}

function stepUntilTerminal(simulation: ReturnType<typeof createSimulation>) {
  let state = simulation.getState();
  for (let step = 0; step < 600 && state.outcome === "flying"; step += 1) {
    state = simulation.step(noThrusters);
  }
  return state;
}

describe("seeded terrain", () => {
  it("spans 600 units and exposes the exact flat pad and plateau", () => {
    const terrain = createSimulation({ seed: 41 }).terrain;

    expect(terrain.points[0].x).toBe(0);
    expect(terrain.points[terrain.points.length - 1].x).toBe(WORLD_WIDTH);
    expect(terrain.pad).toEqual({ left: 250, right: 350, y: 0 });

    for (let x = 200; x <= 400; x += 1) {
      expect(terrain.heightAt(x)).toBe(0);
    }
    expect(
      terrain.points
        .filter((point) => point.x >= 200 && point.x <= 400)
        .every((point) => point.y === 0),
    ).toBe(true);
  });

  it("linearly interpolates terrain points and returns finite heights", () => {
    const terrain = createSimulation({ seed: 314159 }).terrain;
    const segments = terrain.points.slice(1).map((right, index) => ({
      left: terrain.points[index],
      right,
    }));

    expect(segments.some(({ left, right }) => left.y !== right.y)).toBe(true);
    for (const { left, right } of segments) {
      expect(Number.isFinite(terrain.heightAt(left.x))).toBe(true);
      expect(Number.isFinite(terrain.heightAt(right.x))).toBe(true);
      const midpoint = (left.x + right.x) / 2;
      expect(Number.isFinite(terrain.heightAt(midpoint))).toBe(true);
      expect(terrain.heightAt(midpoint)).toBeCloseTo((left.y + right.y) / 2, 12);
    }
    for (let x = 0; x <= WORLD_WIDTH; x += 1) {
      expect(Number.isFinite(terrain.heightAt(x))).toBe(true);
    }
  });

  it("generates identical profiles for identical seeds and different profiles for different seeds", () => {
    const first = createSimulation({ seed: 1234 }).terrain;
    const sameSeed = createSimulation({ seed: 1234 }).terrain;
    const otherSeed = createSimulation({ seed: 5678 }).terrain;

    expect(first.points).toEqual(sameSeed.points);
    for (const point of first.points) {
      expect(first.heightAt(point.x)).toBe(sameSeed.heightAt(point.x));
    }
    expect(first.points).not.toEqual(otherSeed.points);
  });

  it("reset(seed) regenerates terrain deterministically and restores the initial flight state", () => {
    const options = {
      seed: 17,
      fuel: 31,
      start: {
        position: { x: 275, y: 90 },
        velocity: { x: 1.25, y: -0.5 },
        angle: 0.08,
        angularVelocity: -0.02,
      },
    };
    const simulation = createSimulation(options);
    const initialState = simulation.getState();
    const initialTerrain = simulation.terrain.points;

    simulation.step(noThrusters);
    simulation.step({ left: true, right: false });
    const resetState = simulation.reset(29);
    const expectedTerrain = createSimulation({ seed: 29 }).terrain;

    expect(resetState).toEqual(initialState);
    expect(simulation.terrain.seed).toBe(29);
    expect(simulation.terrain.points).toEqual(expectedTerrain.points);
    expect(simulation.terrain.points).not.toEqual(initialTerrain);
  });
});

describe("terrain-aware landing outcomes", () => {
  it("lands after a gentle upright touchdown centered on the pad", () => {
    const simulation = createNearGroundSimulation({ x: 300 });
    const state = stepUntilTerminal(simulation);

    expect(state.outcome).toBe("landed");
    expect(Math.abs(state.lander.velocity.y)).toBeLessThanOrEqual(
      SAFE_LANDING.verticalSpeed,
    );
    expect(Math.abs(state.lander.velocity.x)).toBeLessThanOrEqual(
      SAFE_LANDING.horizontalSpeed,
    );
    expect(Math.abs(state.lander.angle)).toBeLessThanOrEqual(SAFE_LANDING.tilt);
  });

  it("marks a gentle upright touchdown on the flat off-pad shoulder as missed-pad", () => {
    const simulation = createNearGroundSimulation({ x: 225 });
    const state = stepUntilTerminal(simulation);

    expect(state.outcome).toBe("missed-pad");
  });

  it.each([
    {
      condition: "excessive vertical speed",
      x: 300,
      angle: 0,
      velocity: { x: 0, y: -(SAFE_LANDING.verticalSpeed + 1) },
    },
    {
      condition: "excessive horizontal speed",
      x: 300,
      angle: 0,
      velocity: { x: SAFE_LANDING.horizontalSpeed + 1, y: -0.8 },
    },
    {
      condition: "excessive tilt",
      x: 300,
      angle: SAFE_LANDING.tilt + 0.1,
      velocity: { x: 0, y: -0.8 },
    },
  ])("crashes on touchdown with $condition", ({ x, angle, velocity }) => {
    const state = stepUntilTerminal(
      createNearGroundSimulation({ x, angle, velocity }),
    );

    expect(state.outcome).toBe("crashed");
  });

  it("crashes on one-foot contact even when speed and tilt are within limits", () => {
    const angle = SAFE_LANDING.tilt / 2;
    const leftFootOffset = rotate(feet[0], angle);
    const rightFootOffset = rotate(feet[1], angle);
    expect(leftFootOffset.y).toBeLessThan(rightFootOffset.y);

    const state = stepUntilTerminal(createNearGroundSimulation({ x: 300, angle }));

    expect(state.outcome).toBe("crashed");
  });

  it("crashes when the nose reaches the ground before either foot", () => {
    const angle = Math.PI;
    const terrain = createSimulation({ seed: 41 }).terrain;
    const noseOffset = rotate(nose, angle);
    const centerY =
      terrain.heightAt(300 + noseOffset.x) - noseOffset.y + 0.08;
    const simulation = createSimulation({
      seed: 41,
      start: {
        position: { x: 300, y: centerY },
        velocity: { x: 0, y: -0.8 },
        angle,
      },
    });
    const state = stepUntilTerminal(simulation);

    expect(state.outcome).toBe("crashed");
  });

  it("does not change simulation state after a terminal outcome", () => {
    const simulation = createNearGroundSimulation({ x: 300 });
    const terminalState = stepUntilTerminal(simulation);
    expect(terminalState.outcome).toBe("landed");

    expect(simulation.step(bothThrusters)).toEqual(terminalState);
    expect(simulation.getState()).toEqual(terminalState);
  });

  it("reports no active thrusters when commanded with zero fuel", () => {
    const simulation = createSimulation({ fuel: 0 });
    const state = simulation.step(bothThrusters);

    expect(state.thrusters).toEqual(noThrusters);
  });
});
