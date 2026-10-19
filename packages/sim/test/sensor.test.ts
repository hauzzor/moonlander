import { describe, expect, it } from "vitest";
import type { SensorReading } from "../src/index";
import {
  createControlledField,
  createSimulationWithField,
  createWideTunnelField,
  noThrusters,
  sim,
} from "./helpers";

function expectDistancesWithinRadius(reading: SensorReading): void {
  expect(reading).toBeDefined();
  expect(reading.distances).toHaveLength(sim.SENSOR_RAY_COUNT);
  for (const distance of reading.distances) {
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThanOrEqual(reading.radius);
  }
}

describe("ship-relative 360-degree sensor", () => {
  it("creates the tick-zero 360-ray scan with wall-surface and no-hit distances", () => {
    const simulation = createSimulationWithField(createControlledField());
    const state = simulation.getState();
    const reading = state.sensor;

    expect(state.tick).toBe(0);
    expect(state.sensorRadius).toBe(sim.SENSOR_VIEW_DEFAULT);
    expect(reading).toMatchObject({
      radius: sim.SENSOR_VIEW_DEFAULT,
      tick: 0,
      origin: { x: 0, y: 60 },
      heading: 0,
    });
    expect(reading.distances[90]).toBe(sim.TUNNEL_HALF_WIDTH - sim.WALL_RADIUS);
    expect(reading.distances[270]).toBe(sim.TUNNEL_HALF_WIDTH - sim.WALL_RADIUS);
    expect(reading.distances[0]).toBe(reading.radius);
    expect(reading.distances[180]).toBe(reading.radius);
    expectDistancesWithinRadius(reading);
  });

  it("points ray zero along the ship nose and increases ray angles counter-clockwise", () => {
    const simulation = createSimulationWithField(createControlledField(), {
      start: { angle: Math.PI / 2 },
    });
    const reading = simulation.getState().sensor;

    expect(reading.heading).toBe(Math.PI / 2);
    expect(reading.distances[0]).toBe(sim.TUNNEL_HALF_WIDTH - sim.WALL_RADIUS);
    expect(reading.distances[90]).toBe(reading.radius);
    expect(reading.distances[180]).toBe(sim.TUNNEL_HALF_WIDTH - sim.WALL_RADIUS);
    expect(reading.distances[270]).toBe(reading.radius);
  });

  it.each([
    { requested: 10, expected: sim.SENSOR_VIEW_MIN },
    { requested: 20, expected: sim.SENSOR_VIEW_MIN },
    { requested: sim.SENSOR_VIEW_DEFAULT, expected: sim.SENSOR_VIEW_DEFAULT },
    { requested: 200, expected: sim.SENSOR_VIEW_MAX },
    { requested: 250, expected: sim.SENSOR_VIEW_MAX },
  ])("clamps SimulationOptions.sensorRadius $requested to $expected", ({ requested, expected }) => {
    const state = sim.createSimulation({ sensorRadius: requested }).getState();

    expect(state.sensorRadius).toBe(expected);
    expect(state.sensor.radius).toBe(expected);
    expect(state.sensor.tick).toBe(0);
    expectDistancesWithinRadius(state.sensor);
  });

  it("keeps the tick-zero scan through ticks 1..119 and scans at ticks 120 and 240", () => {
    const simulation = createSimulationWithField(createWideTunnelField(18), {
      start: {
        position: { x: 5, y: 60 },
        velocity: { x: 2, y: 0 },
        angle: 0.35,
        angularVelocity: 0.15,
      },
    });
    const initialReading = simulation.getState().sensor;

    expect(initialReading.tick).toBe(0);
    for (let tick = 1; tick < 120; tick += 1) {
      const state = simulation.step(noThrusters);
      expect(state.sensor).toEqual(initialReading);
      expect(state.sensor.tick).toBe(0);
    }

    const at120 = simulation.step(noThrusters);
    expect(at120.tick).toBe(120);
    expect(at120.sensor.tick).toBe(120);
    expect(at120.sensor.origin).toEqual(at120.ship.position);
    expect(at120.sensor.heading).toBe(at120.ship.angle);
    expect(at120.sensor).not.toEqual(initialReading);

    const readingAt120 = at120.sensor;
    for (let tick = 121; tick < 240; tick += 1) {
      const state = simulation.step(noThrusters);
      expect(state.sensor).toEqual(readingAt120);
      expect(state.sensor.tick).toBe(120);
    }

    const at240 = simulation.step(noThrusters);
    expect(at240.tick).toBe(240);
    expect(at240.sensor.tick).toBe(240);
    expect(at240.sensor.origin).toEqual(at240.ship.position);
    expect(at240.sensor.heading).toBe(at240.ship.angle);
  });

  it("applies setSensorRadius at the next scan without changing the previous reading", () => {
    const simulation = createSimulationWithField(createWideTunnelField());
    const initialReading = simulation.getState().sensor;

    simulation.setSensorRadius(80);
    expect(simulation.getState().sensorRadius).toBe(80);
    expect(simulation.getState().sensor.radius).toBe(sim.SENSOR_VIEW_DEFAULT);
    expect(simulation.getState().sensor).toEqual(initialReading);

    for (let tick = 0; tick < 119; tick += 1) {
      const state = simulation.step(noThrusters);
      expect(state.sensor).toEqual(initialReading);
    }
    const at120 = simulation.step(noThrusters);

    expect(at120.sensorRadius).toBe(80);
    expect(at120.sensor.radius).toBe(80);
    expect(at120.sensor.tick).toBe(120);
    expect(at120.sensor.distances[0]).toBe(80);
    expect(at120.sensor.distances.every((distance) => distance === 80)).toBe(true);
    expectDistancesWithinRadius(at120.sensor);
  });

  it.each([
    { requested: -10, expected: sim.SENSOR_VIEW_MIN },
    { requested: 10, expected: sim.SENSOR_VIEW_MIN },
    { requested: 200, expected: sim.SENSOR_VIEW_MAX },
    { requested: 250, expected: sim.SENSOR_VIEW_MAX },
  ])("clamps setSensorRadius($requested) to $expected without rescanning", ({ requested, expected }) => {
    const simulation = createSimulationWithField(createWideTunnelField());
    const initialReading = simulation.getState().sensor;

    simulation.setSensorRadius(requested);

    expect(simulation.getState().sensorRadius).toBe(expected);
    expect(simulation.getState().sensor.radius).toBe(sim.SENSOR_VIEW_DEFAULT);
    expect(simulation.getState().sensor).toEqual(initialReading);
  });

  it("preserves the configured radius across reset and creates a new tick-zero scan", () => {
    const simulation = sim.createSimulation({ seed: 11, sensorRadius: 80 });
    simulation.setSensorRadius(95);
    simulation.step(noThrusters);

    const reset = simulation.reset(29);

    expect(reset.seed).toBe(29);
    expect(reset.tick).toBe(0);
    expect(reset.sensorRadius).toBe(95);
    expect(reset.sensor.radius).toBe(95);
    expect(reset.sensor.tick).toBe(0);
    expect(reset.sensor.origin).toEqual(reset.ship.position);
    expect(reset.sensor.heading).toBe(reset.ship.angle);
    expectDistancesWithinRadius(reset.sensor);
  });

  it("exposes finite sensor readings in state and observation and replays them deterministically", () => {
    const first = createSimulationWithField(createControlledField({ seed: 43 }));
    const second = createSimulationWithField(createControlledField({ seed: 43 }));

    expect(first.getState().sensor).toEqual(first.getObservation().sensor);
    expect(first.getState().sensorRadius).toBe(first.getObservation().sensorRadius);
    for (let tick = 0; tick < 240; tick += 1) {
      const firstState = first.step(noThrusters);
      const secondState = second.step(noThrusters);
      expect(firstState.sensor).toEqual(secondState.sensor);
      expect(firstState.sensorRadius).toBe(secondState.sensorRadius);
      expect(firstState.sensor).toEqual(first.getObservation().sensor);
      expectFiniteSensorValues(firstState.sensor);
    }
  });

  it("falls back to the default radius for non-finite values", () => {
    const fromOption = sim.createSimulation({
      sensorRadius: Number.NaN,
    }).getState();
    expect(fromOption.sensorRadius).toBe(sim.SENSOR_VIEW_DEFAULT);
    expect(fromOption.sensor.radius).toBe(sim.SENSOR_VIEW_DEFAULT);

    const simulation = sim.createSimulation();
    simulation.setSensorRadius(Number.NaN);
    expect(simulation.getState().sensorRadius).toBe(sim.SENSOR_VIEW_DEFAULT);

    for (let tick = 0; tick < 120; tick += 1) {
      simulation.step(noThrusters);
    }
    const reading = simulation.getState().sensor;
    expect(reading.radius).toBe(sim.SENSOR_VIEW_DEFAULT);
    expect(reading.distances.every(Number.isFinite)).toBe(true);
  });

  it("scans real tunnel geometry at negative x and through bends", () => {
    const field = sim.createField(314159);
    for (const x of [-200, 300, 600]) {
      const center = field.tunnel.centerAt(x);
      const simulation = sim.createSimulation({
        field,
        start: { position: { x, y: center.y } },
      });
      const reading = simulation.getState().sensor;
      expect(reading.distances).toHaveLength(sim.SENSOR_RAY_COUNT);
      expect(reading.distances.every(Number.isFinite)).toBe(true);
      expect(
        reading.distances.every(
          (distance) => distance >= 0 && distance <= reading.radius,
        ),
      ).toBe(true);
      expect(
        reading.distances.some((distance) => distance < reading.radius),
      ).toBe(true);
    }
  });

  it("reports close clearance near the ceiling", () => {
    const field = sim.createField(7);
    const center = field.tunnel.centerAt(500);
    const simulation = sim.createSimulation({
      field,
      start: {
        position: {
          x: 500,
          y: center.y + sim.TUNNEL_HALF_WIDTH - sim.SHIP_RADIUS - 3,
        },
      },
    });
    const reading = simulation.getState().sensor;

    expect(reading.distances[90]).toBeGreaterThanOrEqual(0);
    expect(reading.distances[90]).toBeLessThan(12);
  });

  it("keeps the last reading when the ship is destroyed", () => {
    const simulation = sim.createSimulation({
      hull: 1,
      start: {
        position: { x: 0, y: 26 + sim.SHIP_RADIUS + 0.01 },
        velocity: { x: 0, y: -4 },
      },
    });
    let state = simulation.getState();
    for (let tick = 0; tick < 10 && state.outcome === "flying"; tick += 1) {
      state = simulation.step(noThrusters);
    }

    expect(state.outcome).toBe("destroyed");
    const frozen = state.sensor;
    const after = simulation.step(noThrusters);
    expect(after.outcome).toBe("destroyed");
    expect(after.sensor).toEqual(frozen);
  });
});

function expectFiniteSensorValues(reading: SensorReading): void {
  expectDistancesWithinRadius(reading);
  expect(Number.isFinite(reading.tick)).toBe(true);
  expect(Number.isFinite(reading.radius)).toBe(true);
  expect(Number.isFinite(reading.heading)).toBe(true);
  expect(Number.isFinite(reading.origin.x)).toBe(true);
  expect(Number.isFinite(reading.origin.y)).toBe(true);
}
