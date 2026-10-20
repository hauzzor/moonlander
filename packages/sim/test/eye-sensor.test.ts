import { describe, expect, it } from "vitest";
import type { EyeSensorReading } from "../src/index";
import {
  createControlledField,
  createSimulationWithField,
  createWideTunnelField,
  noThrusters,
  sim,
} from "./helpers";

function expectDistancesWithinRadius(reading: EyeSensorReading): void {
  expect(reading.distances).toHaveLength(sim.EYE_SENSOR_RAY_COUNT);
  for (const distance of reading.distances) {
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThanOrEqual(reading.radius);
  }
}

describe("absolute-angle hull-rim eye sensor", () => {
  it("scans tick zero from the hull rim at all 360 absolute world angles", () => {
    const simulation = createSimulationWithField(createControlledField());
    const state = simulation.getState();
    const reading = state.sensors.eye;

    expect(state.tick).toBe(0);
    expect(state.eyeSensorRadius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);
    expect(reading).toMatchObject({
      radius: sim.EYE_SENSOR_VIEW_DEFAULT,
      tick: 0,
      origin: { x: 0, y: 60 },
      heading: 0,
    });
    expect(reading.distances[90]).toBe(
      sim.TUNNEL_HALF_WIDTH - sim.WALL_RADIUS - sim.SHIP_RADIUS,
    );
    expect(reading.distances[270]).toBe(
      sim.TUNNEL_HALF_WIDTH - sim.WALL_RADIUS - sim.SHIP_RADIUS,
    );
    expect(reading.distances[0]).toBe(reading.radius);
    expect(reading.distances[180]).toBe(reading.radius);
    expectDistancesWithinRadius(reading);
    expect("sensor" in state).toBe(false);
    expect("sensorRadius" in state).toBe(false);
  });

  it("keeps ray indices world-aligned for a rotated ship and starts at its capsule rim", () => {
    const simulation = createSimulationWithField(createControlledField(), {
      start: { angle: Math.PI / 2 },
    });
    const reading = simulation.getState().sensors.eye;
    const verticalCapsuleSupport = sim.SHIP_CAPSULE_HALF_LENGTH + sim.SHIP_RADIUS;
    const expectedVerticalClearance =
      sim.TUNNEL_HALF_WIDTH - sim.WALL_RADIUS - verticalCapsuleSupport;

    expect(reading.heading).toBe(Math.PI / 2);
    expect(reading.distances[0]).toBe(reading.radius);
    expect(reading.distances[90]).toBe(expectedVerticalClearance);
    expect(reading.distances[180]).toBe(reading.radius);
    expect(reading.distances[270]).toBe(expectedVerticalClearance);
    expect("setSensorRadius" in simulation).toBe(false);
  });

  it.each([
    { requested: 10, expected: sim.EYE_SENSOR_VIEW_MIN },
    { requested: 20, expected: sim.EYE_SENSOR_VIEW_MIN },
    { requested: sim.EYE_SENSOR_VIEW_DEFAULT, expected: sim.EYE_SENSOR_VIEW_DEFAULT },
    { requested: 200, expected: sim.EYE_SENSOR_VIEW_MAX },
    { requested: 250, expected: sim.EYE_SENSOR_VIEW_MAX },
  ])("clamps SimulationOptions.eyeSensorRadius $requested to $expected", ({ requested, expected }) => {
    const state = sim.createSimulation({ eyeSensorRadius: requested }).getState();

    expect(state.eyeSensorRadius).toBe(expected);
    expect(state.sensors.eye.radius).toBe(expected);
    expect(state.sensors.eye.tick).toBe(0);
    expectDistancesWithinRadius(state.sensors.eye);
  });

  it("keeps the tick-zero eye scan through ticks 1..119 and scans at ticks 120 and 240", () => {
    const simulation = createSimulationWithField(createWideTunnelField(18), {
      start: {
        position: { x: 5, y: 60 },
        velocity: { x: 2, y: 0 },
        angle: 0.35,
        angularVelocity: 0.15,
      },
    });
    const initialReading = simulation.getState().sensors.eye;

    expect(initialReading.tick).toBe(0);
    for (let tick = 1; tick < 120; tick += 1) {
      const state = simulation.step(noThrusters);
      expect(state.sensors.eye).toEqual(initialReading);
      expect(state.sensors.eye.tick).toBe(0);
    }

    const at120 = simulation.step(noThrusters);
    expect(at120.tick).toBe(120);
    expect(at120.sensors.eye.tick).toBe(120);
    expect(at120.sensors.eye.origin).toEqual(at120.ship.position);
    expect(at120.sensors.eye.heading).toBe(at120.ship.angle);
    expect(at120.sensors.eye).not.toEqual(initialReading);

    const readingAt120 = at120.sensors.eye;
    for (let tick = 121; tick < 240; tick += 1) {
      const state = simulation.step(noThrusters);
      expect(state.sensors.eye).toEqual(readingAt120);
      expect(state.sensors.eye.tick).toBe(120);
    }

    const at240 = simulation.step(noThrusters);
    expect(at240.tick).toBe(240);
    expect(at240.sensors.eye.tick).toBe(240);
    expect(at240.sensors.eye.origin).toEqual(at240.ship.position);
    expect(at240.sensors.eye.heading).toBe(at240.ship.angle);
  });

  it("applies setEyeSensorRadius at the next scan without changing the previous reading", () => {
    const simulation = createSimulationWithField(createWideTunnelField());
    const initialReading = simulation.getState().sensors.eye;

    simulation.setEyeSensorRadius(80);
    expect(simulation.getState().eyeSensorRadius).toBe(80);
    expect(simulation.getState().sensors.eye.radius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);
    expect(simulation.getState().sensors.eye).toEqual(initialReading);

    for (let tick = 0; tick < 119; tick += 1) {
      const state = simulation.step(noThrusters);
      expect(state.sensors.eye).toEqual(initialReading);
    }
    const at120 = simulation.step(noThrusters);

    expect(at120.eyeSensorRadius).toBe(80);
    expect(at120.sensors.eye.radius).toBe(80);
    expect(at120.sensors.eye.tick).toBe(120);
    expect(at120.sensors.eye.distances[0]).toBe(80);
    expect(at120.sensors.eye.distances.every((distance) => distance === 80)).toBe(true);
    expectDistancesWithinRadius(at120.sensors.eye);
  });

  it.each([
    { requested: -10, expected: sim.EYE_SENSOR_VIEW_MIN },
    { requested: 10, expected: sim.EYE_SENSOR_VIEW_MIN },
    { requested: 200, expected: sim.EYE_SENSOR_VIEW_MAX },
    { requested: 250, expected: sim.EYE_SENSOR_VIEW_MAX },
  ])("clamps setEyeSensorRadius($requested) to $expected without rescanning", ({ requested, expected }) => {
    const simulation = createSimulationWithField(createWideTunnelField());
    const initialReading = simulation.getState().sensors.eye;

    simulation.setEyeSensorRadius(requested);

    expect(simulation.getState().eyeSensorRadius).toBe(expected);
    expect(simulation.getState().sensors.eye.radius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);
    expect(simulation.getState().sensors.eye).toEqual(initialReading);
  });

  it("preserves the configured eye radius across reset and scans the new start at tick zero", () => {
    const simulation = sim.createSimulation({ seed: 11, eyeSensorRadius: 80 });
    simulation.setEyeSensorRadius(95);
    simulation.step(noThrusters);

    const reset = simulation.reset(29);

    expect(reset.seed).toBe(29);
    expect(reset.tick).toBe(0);
    expect(reset.eyeSensorRadius).toBe(95);
    expect(reset.sensors.eye.radius).toBe(95);
    expect(reset.sensors.eye.tick).toBe(0);
    expect(reset.sensors.eye.origin).toEqual(reset.ship.position);
    expect(reset.sensors.eye.heading).toBe(reset.ship.angle);
    expectDistancesWithinRadius(reset.sensors.eye);
  });

  it("exposes finite eye readings in state and observation and replays scans deterministically", () => {
    const first = createSimulationWithField(createControlledField({ seed: 43 }));
    const second = createSimulationWithField(createControlledField({ seed: 43 }));

    expect(first.getState().sensors.eye).toEqual(first.getObservation().sensors.eye);
    expect(first.getState().eyeSensorRadius).toBe(first.getObservation().eyeSensorRadius);
    for (let tick = 0; tick < 240; tick += 1) {
      const firstState = first.step(noThrusters);
      const secondState = second.step(noThrusters);
      expect(firstState.sensors.eye).toEqual(secondState.sensors.eye);
      expect(firstState.eyeSensorRadius).toBe(secondState.eyeSensorRadius);
      expect(firstState.sensors.eye).toEqual(first.getObservation().sensors.eye);
      expectFiniteEyeValues(firstState.sensors.eye);
    }
  });

  it("falls back to the default eye radius for non-finite values", () => {
    const fromOption = sim.createSimulation({
      eyeSensorRadius: Number.NaN,
    }).getState();
    expect(fromOption.eyeSensorRadius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);
    expect(fromOption.sensors.eye.radius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);

    const simulation = sim.createSimulation();
    simulation.setEyeSensorRadius(Number.NaN);
    expect(simulation.getState().eyeSensorRadius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);

    for (let tick = 0; tick < 120; tick += 1) {
      simulation.step(noThrusters);
    }
    const reading = simulation.getState().sensors.eye;
    expect(reading.radius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);
    expect(reading.distances.every(Number.isFinite)).toBe(true);
  });

  it.each([
    { label: "NaN", value: Number.NaN },
    { label: "Infinity", value: Number.POSITIVE_INFINITY },
    { label: "-Infinity", value: Number.NEGATIVE_INFINITY },
  ])(
    "falls back to the default radius for $label in options and setEyeSensorRadius",
    ({ value }) => {
      const fromOption = sim.createSimulation({ eyeSensorRadius: value }).getState();
      expect(fromOption.eyeSensorRadius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);
      expect(fromOption.sensors.eye.radius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);

      const simulation = createSimulationWithField(createWideTunnelField());
      simulation.setEyeSensorRadius(value);
      expect(simulation.getState().eyeSensorRadius).toBe(
        sim.EYE_SENSOR_VIEW_DEFAULT,
      );
      expect(simulation.getState().sensors.eye.radius).toBe(
        sim.EYE_SENSOR_VIEW_DEFAULT,
      );
    },
  );

  it("uses a radius configured mid-interval only at the next scheduled scan", () => {
    const simulation = createSimulationWithField(createWideTunnelField());

    for (let tick = 0; tick < 60; tick += 1) {
      simulation.step(noThrusters);
    }
    simulation.setEyeSensorRadius(150);

    const beforeScan = simulation.getState();
    expect(beforeScan.tick).toBe(60);
    expect(beforeScan.eyeSensorRadius).toBe(150);
    expect(beforeScan.sensors.eye.radius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);

    let state = beforeScan;
    for (let tick = 60; tick < 120; tick += 1) {
      state = simulation.step(noThrusters);
    }

    expect(state.tick).toBe(120);
    expect(state.eyeSensorRadius).toBe(150);
    expect(state.sensors.eye.tick).toBe(120);
    expect(state.sensors.eye.radius).toBe(150);
    expectDistancesWithinRadius(state.sensors.eye);
  });

  it("keeps a pending radius change across reset and scans it at tick zero", () => {
    const simulation = sim.createSimulation({ seed: 11, eyeSensorRadius: 80 });
    simulation.setEyeSensorRadius(250);

    expect(simulation.getState().eyeSensorRadius).toBe(sim.EYE_SENSOR_VIEW_MAX);
    expect(simulation.getState().sensors.eye.radius).toBe(80);

    const reset = simulation.reset(29);

    expect(reset.seed).toBe(29);
    expect(reset.tick).toBe(0);
    expect(reset.eyeSensorRadius).toBe(sim.EYE_SENSOR_VIEW_MAX);
    expect(reset.sensors.eye.radius).toBe(sim.EYE_SENSOR_VIEW_MAX);
    expect(reset.sensors.eye.tick).toBe(0);
    expect(reset.sensors.eye.origin).toEqual(reset.ship.position);
    expectDistancesWithinRadius(reset.sensors.eye);
  });

  it("scans a negative-x pose and a bent real tunnel at absolute world angles", () => {
    const field = sim.createField(314159);
    for (const x of [-200, 300, 600]) {
      const center = field.tunnel.centerAt(x);
      const simulation = sim.createSimulation({
        field,
        start: { position: { x, y: center.y }, angle: 0.4 },
      });
      const reading = simulation.getState().sensors.eye;
      expect(reading.heading).toBe(0.4);
      expect(reading.distances).toHaveLength(sim.EYE_SENSOR_RAY_COUNT);
      expectDistancesWithinRadius(reading);
      expect(reading.distances.some((distance) => distance < reading.radius)).toBe(true);
    }
    expect(Math.abs(field.tunnel.headingAt(600))).toBeGreaterThan(0);
  });

  it("reports rim clearance near the ceiling in absolute world direction", () => {
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
    const reading = simulation.getState().sensors.eye;

    expect(reading.distances[90]).toBeGreaterThanOrEqual(0);
    expect(reading.distances[90]).toBeLessThan(12);
  });

  it("keeps the last eye scan when the ship is destroyed", () => {
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
    const frozen = state.sensors.eye;
    const after = simulation.step(noThrusters);
    expect(after.outcome).toBe("destroyed");
    expect(after.sensors.eye).toEqual(frozen);
  });
});

function expectFiniteEyeValues(reading: EyeSensorReading): void {
  expectDistancesWithinRadius(reading);
  expect(Number.isFinite(reading.tick)).toBe(true);
  expect(Number.isFinite(reading.radius)).toBe(true);
  expect(Number.isFinite(reading.heading)).toBe(true);
  expect(Number.isFinite(reading.origin.x)).toBe(true);
  expect(Number.isFinite(reading.origin.y)).toBe(true);
}
