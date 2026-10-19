import { describe, expect, it } from "vitest";
import type { Action, Controller, Observation } from "../src/index";
import {
  bothThrusters,
  createControlledField,
  createSimulationWithField,
  createWideTunnelField,
  noThrusters,
  sim,
} from "./helpers";

const observationKeys = [
  "x",
  "y",
  "vx",
  "vy",
  "angle",
  "angularVelocity",
  "hull",
  "progress",
  "score",
  "nearestWallDistance",
  "tunnelCenterOffset",
  "tunnelHalfWidth",
  "tunnelHeading",
  "forwardSpeed",
  "lateralSpeed",
  "eyeSensorRadius",
  "sensors",
].sort();

function expectFiniteObservation(observation: Observation): void {
  const { sensors, ...numericFields } = observation;
  expect(observation.eyeSensorRadius).toBeDefined();
  expect(sensors).toBeDefined();
  expect(Object.values(numericFields).every(Number.isFinite)).toBe(true);
  expect(Number.isFinite(sensors.eye.radius)).toBe(true);
  expect(Number.isFinite(sensors.eye.tick)).toBe(true);
  expect(Number.isFinite(sensors.eye.heading)).toBe(true);
  expect(Number.isFinite(sensors.eye.origin.x)).toBe(true);
  expect(Number.isFinite(sensors.eye.origin.y)).toBe(true);
  expect(sensors.eye.distances).toHaveLength(sim.EYE_SENSOR_RAY_COUNT);
  expect(sensors.eye.distances.every(Number.isFinite)).toBe(true);
  expect(Number.isFinite(sensors.direction.angle)).toBe(true);
  expect(Number.isFinite(sensors.distanceToStart)).toBe(true);
  expect(Number.isFinite(sensors.velocity.vx)).toBe(true);
  expect(Number.isFinite(sensors.velocity.vy)).toBe(true);
  expect(Number.isFinite(sensors.velocity.speed)).toBe(true);
  expect(Number.isFinite(sensors.velocity.angle)).toBe(true);
}

describe("tunnel-aware autonomy observation API", () => {
  it("returns exactly the new finite fields and no gate, fuel, altitude, or pad fields", () => {
    const simulation = createSimulationWithField(createControlledField({ seed: 41 }));
    const observation = simulation.getObservation();

    expect(Object.keys(observation).sort()).toEqual(observationKeys);
    expect(observation).toEqual({
      x: 0,
      y: 60,
      vx: 0,
      vy: 0,
      angle: 0,
      angularVelocity: 0,
      hull: 100,
      progress: 0,
      score: 0,
      nearestWallDistance: 23,
      tunnelCenterOffset: 0,
      tunnelHalfWidth: 34,
      tunnelHeading: 0,
      forwardSpeed: 0,
      lateralSpeed: 0,
      eyeSensorRadius: sim.EYE_SENSOR_VIEW_DEFAULT,
      sensors: simulation.getState().sensors,
    });
    expectFiniteObservation(observation);
    for (const removedField of [
      "fuel",
      "gatesPassed",
      "nearestGateDistance",
      "nearestGateAngle",
      "altitude",
      "padOffsetX",
      "pad",
      "sensor",
      "sensorRadius",
    ]) {
      expect(removedField in observation).toBe(false);
    }
  });

  it("reports signed center offset and world velocity components in a straight tunnel", () => {
    const simulation = createSimulationWithField(createControlledField(), {
      start: {
        position: { x: 0, y: 66 },
        velocity: { x: 3, y: 4 },
      },
    });
    const observation = simulation.getObservation();

    expect(observation.tunnelCenterOffset).toBe(6);
    expect(observation.tunnelHalfWidth).toBe(34);
    expect(observation.tunnelHeading).toBe(0);
    expect(observation.forwardSpeed).toBe(3);
    expect(observation.lateralSpeed).toBe(4);
    expectFiniteObservation(observation);
  });

  it("projects velocity onto the tangent and normal of a sloped tunnel", () => {
    const slope = 0.2;
    const heading = Math.atan(slope);
    const expectedForwardSpeed = 5;
    const expectedLateralSpeed = 2;
    const velocity = {
      x: expectedForwardSpeed * Math.cos(heading) - expectedLateralSpeed * Math.sin(heading),
      y: expectedForwardSpeed * Math.sin(heading) + expectedLateralSpeed * Math.cos(heading),
    };
    const simulation = createSimulationWithField(
      createControlledField({ centerY: 60, slope }),
      { start: { position: { x: 10, y: 65 }, velocity } },
    );
    const observation = simulation.getObservation();

    expect(observation.tunnelCenterOffset).toBeCloseTo(3, 12);
    expect(observation.tunnelHeading).toBeCloseTo(heading, 12);
    expect(observation.forwardSpeed).toBeCloseTo(expectedForwardSpeed, 12);
    expect(observation.lateralSpeed).toBeCloseTo(expectedLateralSpeed, 12);
    expectFiniteObservation(observation);
  });

  it("measures nearest wall distance from the hull surface and uses WALL_SENSOR_RANGE without walls", () => {
    const straight = createSimulationWithField(createControlledField()).getObservation();
    const wide = createSimulationWithField(createWideTunnelField()).getObservation();

    expect(straight.nearestWallDistance).toBeCloseTo(
      sim.TUNNEL_HALF_WIDTH - sim.SHIP_RADIUS - sim.WALL_RADIUS,
      12,
    );
    expect(wide.nearestWallDistance).toBe(sim.WALL_SENSOR_RANGE);
  });

  it("keeps observations finite and synchronized with state across steps", () => {
    const simulation = createSimulationWithField(createWideTunnelField());
    const before = simulation.getObservation();

    for (const action of [
      bothThrusters,
      noThrusters,
      { left: true, right: false, rear: false },
    ]) {
      const state = simulation.step(action);
      const observation = simulation.getObservation();
      expectFiniteObservation(observation);
      expect(Object.keys(observation).sort()).toEqual(observationKeys);
      expect(observation.x).toBe(state.ship.position.x);
      expect(observation.y).toBe(state.ship.position.y);
      expect(observation.hull).toBe(state.hull);
      expect(observation.progress).toBe(state.progress);
      expect(observation.score).toBe(state.score);
    }

    expect(simulation.getObservation().y).not.toBe(before.y);
  });

  it("types tunnel-aware controllers and deterministically replays their actions", () => {
    const first = sim.createSimulation({ seed: 41 });
    const second = sim.createSimulation({ seed: 41 });
    const controller: Controller = {
      act(observation: Observation): Action {
        return {
          left: observation.tunnelCenterOffset < -2 || observation.lateralSpeed < -0.5,
          right: observation.tunnelCenterOffset > 2 || observation.nearestWallDistance < 8,
          rear: observation.forwardSpeed < 8 && observation.nearestWallDistance > 12,
        };
      },
    };

    for (let tick = 0; tick < 240; tick += 1) {
      const action = controller.act(first.getObservation());
      expect(first.step(action)).toEqual(second.step(action));
    }

    expect(controller.reset).toBeUndefined();
    expectFiniteObservation(first.getObservation());
    expect("nearestGateDistance" in first.getObservation()).toBe(false);
  });

  it("permits a controller to implement its optional reset hook", () => {
    let resets = 0;
    const controller: Controller = {
      act(_observation: Observation): Action {
        return noThrusters;
      },
      reset() {
        resets += 1;
      },
    };

    controller.reset?.();
    expect(resets).toBe(1);
  });
});
