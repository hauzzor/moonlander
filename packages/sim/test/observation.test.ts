import { describe, expect, it } from "vitest";
import type { Controller, Observation } from "../src/index";
import {
  bothThrusters,
  createControlledField,
  createSimulationWithField,
  gateAt,
  noThrusters,
  sim,
  verticalWall,
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
  "nearestGateDistance",
  "nearestGateAngle",
].sort();

function expectFiniteObservation(observation: Observation) {
  expect(Object.values(observation).every(Number.isFinite)).toBe(true);
}

describe("Starship autonomy observation API", () => {
  it("returns exactly the documented finite fields without landing or fuel data", () => {
    const field = createControlledField({ seed: 41 });
    const simulation = createSimulationWithField(field);
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
      nearestWallDistance: sim.SENSOR_RANGE,
      nearestGateDistance: -1,
      nearestGateAngle: 0,
    });
    expectFiniteObservation(observation);
    for (const removedField of ["fuel", "altitude", "padOffsetX", "pad"]) {
      expect(removedField in observation).toBe(false);
    }
  });

  it("measures nearest wall clearance from the capsule hull surface", () => {
    const field = createControlledField({ walls: [verticalWall("sensor-wall", 40)] });
    const observation = createSimulationWithField(field).getObservation();

    expect(observation.nearestWallDistance).toBeCloseTo(
      40 - sim.SHIP_CAPSULE_HALF_LENGTH - sim.SHIP_RADIUS - sim.WALL_RADIUS,
      12,
    );
  });

  it("reports the nearest unpassed gate center distance and world angle", () => {
    const field = createControlledField({ gates: [gateAt("sensor-gate", { x: 30, y: 60 })] });
    const observation = createSimulationWithField(field).getObservation();

    expect(observation.nearestGateDistance).toBe(30);
    expect(observation.nearestGateAngle).toBe(0);
  });

  it("uses the documented no-nearby-wall and no-gate sentinels", () => {
    const field = createControlledField();
    const observation = createSimulationWithField(field).getObservation();

    expect(observation.nearestWallDistance).toBe(sim.SENSOR_RANGE);
    expect(observation.nearestGateDistance).toBe(-1);
    expect(observation.nearestGateAngle).toBe(0);
  });

  it("updates finite state and course observations after thrust and gravity steps", () => {
    const field = createControlledField();
    const simulation = createSimulationWithField(field);
    const before = simulation.getObservation();

    for (const action of [bothThrusters, noThrusters, { left: true, right: false }]) {
      simulation.step(action);
      const observation = simulation.getObservation();
      expectFiniteObservation(observation);
      expect(Object.keys(observation).sort()).toEqual(observationKeys);
    }

    const after = simulation.getObservation();
    expect(after.y).not.toBe(before.y);
    expect(after.hull).toBe(100);
  });

  it("supports typed controllers and deterministic controller-driven replay", () => {
    const fieldA = sim.createField(41);
    const fieldB = sim.createField(41);
    const first = sim.createSimulation({ seed: 41, field: fieldA });
    const second = sim.createSimulation({ seed: 41, field: fieldB });
    const controller: Controller = {
      act(observation: Observation) {
        return {
          left: observation.nearestGateAngle > 0 || observation.vy < -0.2,
          right: observation.nearestGateAngle < 0 || observation.hull < 50,
        };
      },
    };
    const actions = [];

    for (let tick = 0; tick < 120; tick += 1) {
      const action = controller.act(first.getObservation());
      actions.push(action);
      expect(first.step(action)).toEqual(second.step(action));
    }

    expect(actions.length).toBe(120);
    expect(controller.reset).toBeUndefined();
    expectFiniteObservation(first.getObservation());
  });

  it("permits a controller to implement its optional reset hook", () => {
    let resets = 0;
    const controller: Controller = {
      act(_observation: Observation) {
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
