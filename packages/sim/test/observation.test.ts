import { describe, expect, it } from "vitest";
import type { Controller, Observation } from "../src/index";
import { createSimulation } from "../src/index";

const noThrusters = { left: false, right: false };

function expectFiniteObservation(observation: Observation) {
  expect(
    [
      observation.x,
      observation.altitude,
      observation.vx,
      observation.vy,
      observation.angle,
      observation.angularVelocity,
      observation.fuel,
      observation.padOffsetX,
    ].every(Number.isFinite),
  ).toBe(true);
}

describe("autonomy-facing simulation API", () => {
  it("returns every documented observation field for the default start", () => {
    const simulation = createSimulation();
    const observation = simulation.getObservation();

    expect(simulation.terrain.heightAt(300)).toBe(0);
    expect(observation).toEqual({
      x: 300,
      altitude: 90,
      vx: 0,
      vy: 0,
      angle: 0,
      angularVelocity: 0,
      fuel: 100,
      padOffsetX: 0,
    });
    expectFiniteObservation(observation);
  });

  it("measures altitude above terrain at the lander's non-pad x", () => {
    const simulation = createSimulation({
      start: { position: { x: 80, y: 120 } },
    });
    const terrainHeight = simulation.terrain.heightAt(80);
    const observation = simulation.getObservation();

    expect(terrainHeight).toBeGreaterThan(0);
    expect(observation.altitude).toBeCloseTo(120 - terrainHeight, 12);
  });

  it("reports the pad center minus the lander's custom x position", () => {
    const observation = createSimulation({
      start: { position: { x: 275, y: 90 } },
    }).getObservation();

    expect(observation.padOffsetX).toBe(25);
  });

  it("updates velocity and terrain-relative altitude after a simulation step", () => {
    const simulation = createSimulation();
    const before = simulation.getObservation();
    const state = simulation.step(noThrusters);
    const after = simulation.getObservation();

    expect(after.vy).toBe(state.lander.velocity.y);
    expect(after.vy).toBeLessThan(before.vy);
    expect(after.altitude).toBeCloseTo(
      state.lander.position.y - simulation.terrain.heightAt(state.lander.position.x),
      12,
    );
    expect(after.altitude).toBeLessThan(before.altitude);
  });

  it("lets a typed Controller act on an observation and step the simulation", () => {
    const options = {
      seed: 41,
      start: {
        position: { x: 275, y: 120 },
        velocity: { x: 0, y: -1.5 },
      },
    };
    const controlledSimulation = createSimulation(options);
    const directlySteppedSimulation = createSimulation(options);
    const controller: Controller = {
      act(observation: Observation) {
        return {
          left: observation.padOffsetX > 0,
          right: observation.vy < -1,
        };
      },
    };
    const action = controller.act(controlledSimulation.getObservation());

    expect(action).toEqual({ left: true, right: true });
    expect(controlledSimulation.step(action)).toEqual(
      directlySteppedSimulation.step(action),
    );
  });

  it("allows a Controller to omit reset or provide it", () => {
    const withoutReset: Controller = {
      act(_observation: Observation) {
        return noThrusters;
      },
    };
    const withReset: Controller = {
      act(_observation: Observation) {
        return noThrusters;
      },
      reset() {},
    };

    expect(withoutReset.reset).toBeUndefined();
    expect(withReset.reset).toBeTypeOf("function");
  });

  it("keeps every observation field finite through steps and thrust bursts", () => {
    const simulation = createSimulation();
    const actions = [
      { left: true, right: true },
      { left: true, right: true },
      noThrusters,
      { left: true, right: false },
      { left: false, right: true },
      noThrusters,
      { left: true, right: true },
      noThrusters,
    ];

    for (const action of actions) {
      simulation.step(action);
      expectFiniteObservation(simulation.getObservation());
    }
  });
});
