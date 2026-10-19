import { describe, expect, it } from "vitest";
import {
  createSimulationWithField,
  createWideTunnelField,
  noThrusters,
} from "./helpers";

describe("continuous navigation sensors", () => {
  it.each([
    { angle: (5 * Math.PI) / 2, expected: Math.PI / 2 },
    { angle: (-5 * Math.PI) / 2, expected: -Math.PI / 2 },
  ])("normalizes the world-horizon direction for angle $angle", ({ angle, expected }) => {
    const simulation = createSimulationWithField(createWideTunnelField(), {
      start: { angle },
    });
    const state = simulation.getState();

    expect(state.sensors.direction.angle).toBeCloseTo(expected, 12);
    expect(state.sensors.direction.angle).toBeGreaterThanOrEqual(-Math.PI);
    expect(state.sensors.direction.angle).toBeLessThanOrEqual(Math.PI);
    expect(simulation.getObservation().sensors.direction.angle).toBeCloseTo(expected, 12);
  });

  it("updates direction continuously after a tick of angular motion", () => {
    const simulation = createSimulationWithField(createWideTunnelField(), {
      start: { angle: 0.4, angularVelocity: 0.8 },
    });

    const state = simulation.step(noThrusters);
    expect(state.sensors.direction.angle).toBeCloseTo(state.ship.angle, 12);
    expect(simulation.getObservation().sensors.direction.angle).toBeCloseTo(
      state.ship.angle,
      12,
    );
  });

  it("measures Euclidean distance to the spawn position while moving backward", () => {
    const spawn = { x: 10, y: 60 };
    const simulation = createSimulationWithField(createWideTunnelField(), {
      start: { position: spawn, velocity: { x: -5, y: 0 } },
    });

    expect(simulation.getState().sensors.distanceToStart).toBe(0);
    const state = simulation.step(noThrusters);
    const expectedDistance = Math.hypot(
      state.ship.position.x - spawn.x,
      state.ship.position.y - spawn.y,
    );

    expect(state.ship.position.x).toBeLessThan(spawn.x);
    expect(state.sensors.distanceToStart).toBeCloseTo(expectedDistance, 12);
    expect(state.sensors.distanceToStart).toBeGreaterThan(0);
    expect(simulation.getObservation().sensors.distanceToStart).toBeCloseTo(
      expectedDistance,
      12,
    );
  });

  it("reports world velocity components, speed, and direction", () => {
    const simulation = createSimulationWithField(createWideTunnelField(), {
      start: { velocity: { x: 3, y: 4 } },
    });
    const state = simulation.getState();
    const velocity = state.sensors.velocity;

    expect(velocity).toEqual({ vx: 3, vy: 4, speed: 5, angle: Math.atan2(4, 3) });
    expect(simulation.getObservation().sensors.velocity).toEqual(velocity);
  });

  it("reports finite zero-speed velocity data and the exact sensor-suite keys", () => {
    const simulation = createSimulationWithField(createWideTunnelField());
    const state = simulation.getState();
    const sensors = state.sensors;

    expect(Object.keys(sensors).sort()).toEqual([
      "direction",
      "distanceToStart",
      "eye",
      "velocity",
    ]);
    expect(sensors.velocity).toEqual({ vx: 0, vy: 0, speed: 0, angle: 0 });
    expect(sensors.velocity.speed).toBe(0);
    expect(Number.isFinite(sensors.velocity.angle)).toBe(true);
    expect(Number.isFinite(sensors.direction.angle)).toBe(true);
    expect(Number.isFinite(sensors.distanceToStart)).toBe(true);
  });
});
