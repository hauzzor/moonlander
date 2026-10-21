import { describe, expect, it } from "vitest";
import type { Action, Controller, Observation } from "../src/index";
import {
  bothThrusters,
  createControlledField,
  createSimulationWithField,
  createWideTunnelField,
  noThrusters,
  sim,
  tunnelContactY,
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
  "gravityScale",
  "gravity",
  "bottomThrusterScale",
  "rearThrusterScale",
  "sensors",
].sort();

function expectFiniteObservation(observation: Observation): void {
  const { sensors, ...numericFields } = observation;
  expect(observation.eyeSensorRadius).toBeDefined();
  expect(Number.isFinite(observation.gravityScale)).toBe(true);
  expect(Number.isFinite(observation.gravity)).toBe(true);
  expect(Number.isFinite(observation.bottomThrusterScale)).toBe(true);
  expect(Number.isFinite(observation.rearThrusterScale)).toBe(true);
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
      gravityScale: sim.GRAVITY_SCALE_DEFAULT,
      gravity: sim.GRAVITY,
      bottomThrusterScale: sim.THRUSTER_SCALE_DEFAULT,
      rearThrusterScale: sim.THRUSTER_SCALE_DEFAULT,
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

  it("exposes the configured scales, effective gravity, and live setter values", () => {
    const simulation = createSimulationWithField(createControlledField(), {
      gravityScale: 2.5,
      bottomThrusterScale: 3,
      rearThrusterScale: 4,
    });
    const state = simulation.getState();
    const observation = simulation.getObservation();

    expect(observation.gravityScale).toBe(2.5);
    expect(observation.gravity).toBeCloseTo(2.5 * sim.GRAVITY, 14);
    expect(observation.bottomThrusterScale).toBe(3);
    expect(observation.rearThrusterScale).toBe(4);
    expect(observation.gravityScale).toBe(state.gravityScale);
    expect(observation.gravity).toBe(state.gravity);
    expect(observation.bottomThrusterScale).toBe(state.bottomThrusterScale);
    expect(observation.rearThrusterScale).toBe(state.rearThrusterScale);
    expectFiniteObservation(observation);

    simulation.setGravityScale(0.5);
    simulation.setBottomThrusterScale(0.25);
    simulation.setRearThrusterScale(10);
    const updated = simulation.getObservation();

    expect(updated.gravityScale).toBe(0.5);
    expect(updated.gravity).toBeCloseTo(0.5 * sim.GRAVITY, 14);
    expect(updated.bottomThrusterScale).toBe(0.25);
    expect(updated.rearThrusterScale).toBe(10);
    expectFiniteObservation(updated);
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

  it("projects velocity and center offset onto the tangent and normal of a sloped tunnel", () => {
    const slope = 0.2;
    const heading = Math.atan(slope);
    const expectedForwardSpeed = 5;
    const expectedLateralSpeed = 2;
    const verticalOffset = 65 - (60 + slope * 10);
    const expectedCenterOffset = verticalOffset * Math.cos(heading);
    const velocity = {
      x: expectedForwardSpeed * Math.cos(heading) - expectedLateralSpeed * Math.sin(heading),
      y: expectedForwardSpeed * Math.sin(heading) + expectedLateralSpeed * Math.cos(heading),
    };
    const simulation = createSimulationWithField(
      createControlledField({ centerY: 60, slope }),
      { start: { position: { x: 10, y: 65 }, velocity } },
    );
    const observation = simulation.getObservation();

    expect(observation.tunnelCenterOffset).toBeCloseTo(
      expectedCenterOffset,
      12,
    );
    expect(observation.tunnelCenterOffset).not.toBeCloseTo(verticalOffset, 6);
    expect(observation.tunnelHeading).toBeCloseTo(heading, 12);
    expect(observation.forwardSpeed).toBeCloseTo(expectedForwardSpeed, 12);
    expect(observation.lateralSpeed).toBeCloseTo(expectedLateralSpeed, 12);
    expectFiniteObservation(observation);
  });

  it("reports the perpendicular center offset, local half-width, heading, and clearance in a bent tunnel", () => {
    const field = sim.createField(7);
    const verticalOffset = 6;
    let x = 250;
    while (
      x < 5_000 &&
      (Math.abs(field.tunnel.halfWidthAt(x) - sim.TUNNEL_HALF_WIDTH) < 5 ||
        Math.abs(field.tunnel.headingAt(x)) < 0.2)
    ) {
      x += 10;
    }

    expect(x).toBeLessThan(5_000);
    const center = field.tunnel.centerAt(x);
    const heading = field.tunnel.headingAt(x);
    const expectedCenterOffset = verticalOffset * Math.cos(heading);
    const simulation = sim.createSimulation({
      field,
      start: { position: { x, y: center.y + verticalOffset } },
    });
    const observation = simulation.getObservation();

    expect(observation.tunnelHalfWidth).toBeCloseTo(
      field.tunnel.halfWidthAt(x),
      12,
    );
    expect(observation.tunnelHalfWidth).not.toBe(sim.TUNNEL_HALF_WIDTH);
    expect(observation.tunnelHeading).toBeCloseTo(heading, 12);
    expect(observation.tunnelCenterOffset).toBeCloseTo(
      expectedCenterOffset,
      12,
    );
    expect(observation.tunnelCenterOffset).not.toBeCloseTo(verticalOffset, 6);
    expect(observation.nearestWallDistance).toBeGreaterThan(0);
    expect(observation.nearestWallDistance).toBeLessThanOrEqual(
      sim.WALL_SENSOR_RANGE,
    );
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

  it("exposes the configured radius separately from the last scan radius", () => {
    const simulation = createSimulationWithField(createWideTunnelField());
    simulation.setEyeSensorRadius(80);

    const beforeScan = simulation.getObservation();
    expect(beforeScan.eyeSensorRadius).toBe(80);
    expect(beforeScan.sensors.eye.radius).toBe(sim.EYE_SENSOR_VIEW_DEFAULT);
    expectFiniteObservation(beforeScan);

    for (let tick = 0; tick < 120; tick += 1) {
      simulation.step(noThrusters);
    }
    const afterScan = simulation.getObservation();

    expect(afterScan.eyeSensorRadius).toBe(80);
    expect(afterScan.sensors.eye.radius).toBe(80);
    expect(afterScan.sensors.eye.tick).toBe(120);
    expectFiniteObservation(afterScan);
  });

  it("keeps every observation field finite after destruction", () => {
    const { floor } = tunnelContactY();
    const simulation = createSimulationWithField(createControlledField(), {
      hull: 1,
      start: {
        position: { x: 40, y: floor + 0.005 },
        velocity: { x: 0, y: -8 },
      },
    });
    let state = simulation.getState();
    for (let tick = 0; tick < 10 && state.outcome === "flying"; tick += 1) {
      state = simulation.step(noThrusters);
    }

    expect(state.outcome).toBe("destroyed");
    expect(state.hull).toBe(0);

    const frozen = simulation.getObservation();
    expectFiniteObservation(frozen);
    expect(frozen.hull).toBe(0);
    expect(frozen.progress).toBe(state.progress);
    expect(frozen.score).toBe(state.score);
    expect(frozen.sensors.eye).toEqual(state.sensors.eye);
    expect(simulation.getObservation()).toEqual(frozen);
  });

  it("returns spawn-based observations after reset in a pinned field", () => {
    const field = createControlledField({ seed: 41 });
    const simulation = createSimulationWithField(field, {
      eyeSensorRadius: 60,
    });
    for (let tick = 0; tick < 30; tick += 1) {
      simulation.step(tick % 2 === 0 ? bothThrusters : noThrusters);
    }
    simulation.setEyeSensorRadius(90);

    const reset = simulation.reset(999);
    const observation = simulation.getObservation();

    expect(reset.tick).toBe(0);
    expect(observation.x).toBe(0);
    expect(observation.y).toBe(60);
    expect(observation.progress).toBe(0);
    expect(observation.score).toBe(0);
    expect(observation.sensors.distanceToStart).toBe(0);
    expect(observation.eyeSensorRadius).toBe(90);
    expect(observation.sensors.eye.radius).toBe(90);
    expect(observation.sensors.eye.tick).toBe(0);
    expect(simulation.field).toBe(field);
    expectFiniteObservation(observation);
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
