import { describe, expect, it } from "vitest";
import { createSimulation, FIXED_DT, MOON_GRAVITY } from "../src/index";

const noThrusters = { left: false, right: false };

describe("deterministic flight model", () => {
  it("starts at the documented default state", () => {
    const state = createSimulation().getState();

    expect(state).toMatchObject({
      tick: 0,
      time: 0,
      lander: {
        position: { x: 300, y: 90 },
        velocity: { x: 0, y: 0 },
        angle: 0,
        angularVelocity: 0,
      },
      fuel: 100,
      thrusters: noThrusters,
      outcome: "flying",
    });
  });

  it("exports the 120 Hz fixed timestep and advances one tick per step", () => {
    expect(FIXED_DT).toBe(1 / 120);

    const simulation = createSimulation();
    const first = simulation.step(noThrusters);
    expect(first.tick).toBe(1);
    expect(first.time).toBe(FIXED_DT);

    const second = simulation.step(noThrusters);
    expect(second.tick).toBe(2);
    expect(second.time).toBe(2 * FIXED_DT);
  });

  it("accelerates downward under lunar gravity with no thrust", () => {
    expect(MOON_GRAVITY).toBe(1.62);

    const state = createSimulation().step(noThrusters);

    expect(state.lander.velocity.x).toBe(0);
    expect(state.lander.velocity.y).toBeCloseTo(-1.62 * FIXED_DT, 12);
    expect(state.lander.angularVelocity).toBe(0);
    expect(state.fuel).toBe(100);
  });

  it("lifts with both thrusters and burns fuel at five units per second per thruster", () => {
    const state = createSimulation().step({ left: true, right: true });
    const thrustAcceleration = (2 * 500 * Math.cos((15 * Math.PI) / 180)) / 200;

    expect(state.lander.velocity.y).toBeGreaterThan(0);
    expect(state.lander.velocity.y).toBeCloseTo(
      (thrustAcceleration - MOON_GRAVITY) * FIXED_DT,
      12,
    );
    expect(state.fuel).toBeCloseTo(100 - 2 * 5 * FIXED_DT, 12);
  });

  it("the left thruster accelerates right and rotates clockwise", () => {
    const state = createSimulation().step({ left: true, right: false });
    const expectedHorizontalVelocity =
      ((500 * Math.sin((15 * Math.PI) / 180)) / 200) * FIXED_DT;

    expect(state.lander.velocity.x).toBeGreaterThan(0);
    expect(state.lander.velocity.x).toBeCloseTo(expectedHorizontalVelocity, 12);
    expect(state.lander.angularVelocity).toBeLessThan(0);
  });

  it("the right thruster accelerates left and rotates counter-clockwise", () => {
    const state = createSimulation().step({ left: false, right: true });
    const expectedHorizontalVelocity =
      -((500 * Math.sin((15 * Math.PI) / 180)) / 200) * FIXED_DT;

    expect(state.lander.velocity.x).toBeLessThan(0);
    expect(state.lander.velocity.x).toBeCloseTo(expectedHorizontalVelocity, 12);
    expect(state.lander.angularVelocity).toBeGreaterThan(0);
  });

  it("both thrusters cancel lateral force and torque", () => {
    const state = createSimulation().step({ left: true, right: true });

    expect(state.lander.velocity.x).toBeCloseTo(0, 12);
    expect(state.lander.angularVelocity).toBeCloseTo(0, 12);
  });

  it("produces no thrust when fuel is exhausted", () => {
    const simulationWithInput = createSimulation({ fuel: 0 });
    const simulationWithoutInput = createSimulation({ fuel: 0 });

    const withThruster = simulationWithInput.step({ left: true, right: false });
    const withoutThruster = simulationWithoutInput.step(noThrusters);

    expect(withThruster.lander).toEqual(withoutThruster.lander);
    expect(withThruster.fuel).toBe(0);
  });

  it("produces identical state sequences for identical seeds, starts, and actions", () => {
    const options = {
      seed: 314159,
      start: {
        position: { x: 275, y: 120 },
        velocity: { x: 1.25, y: -0.5 },
        angle: 0.08,
        angularVelocity: -0.02,
      },
    };
    const first = createSimulation(options);
    const second = createSimulation(options);
    const actions = [
      noThrusters,
      { left: true, right: false },
      { left: true, right: true },
      { left: false, right: true },
      noThrusters,
    ];

    for (const action of actions) {
      expect(first.step(action)).toEqual(second.step(action));
    }
  });

  it("reset restores the initial state including configured start and fuel", () => {
    const options = {
      seed: 2718,
      fuel: 37,
      start: {
        position: { x: 250, y: 140 },
        velocity: { x: -2, y: 3 },
        angle: 0.12,
        angularVelocity: 0.04,
      },
    };
    const simulation = createSimulation(options);
    const expectedInitialState = createSimulation(options).getState();

    simulation.step({ left: true, right: false });
    simulation.step({ left: false, right: true });

    expect(simulation.reset()).toEqual(expectedInitialState);
  });

  it("honors SimulationOptions start and fuel overrides", () => {
    const state = createSimulation({
      fuel: 23,
      start: {
        position: { x: 222, y: 111 },
        velocity: { x: 4, y: -3 },
        angle: -0.2,
        angularVelocity: 0.15,
      },
    }).getState();

    expect(state).toMatchObject({
      fuel: 23,
      lander: {
        position: { x: 222, y: 111 },
        velocity: { x: 4, y: -3 },
        angle: -0.2,
        angularVelocity: 0.15,
      },
    });
  });
});
