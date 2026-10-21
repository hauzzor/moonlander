import { describe, expect, it } from "vitest";
import type { Action } from "../src/index";
import {
  createControlledField,
  createSimulationWithField,
  createWideTunnelField,
  firstTickFallVelocity,
  noThrusters,
  sim,
  terminalFallVelocity,
  tunnelContactY,
} from "./helpers";

const CLAMP_CASES: ReadonlyArray<{ input: number; expected: number }> = [
  { input: -1000, expected: sim.GRAVITY_SCALE_MIN },
  { input: -1, expected: sim.GRAVITY_SCALE_MIN },
  { input: 0, expected: sim.GRAVITY_SCALE_MIN },
  { input: 0.05, expected: sim.GRAVITY_SCALE_MIN },
  { input: 0.1, expected: 0.1 },
  { input: 0.5, expected: 0.5 },
  { input: 1, expected: 1 },
  { input: 2.5, expected: 2.5 },
  { input: 9.999, expected: 9.999 },
  { input: 10, expected: 10 },
  { input: 10.001, expected: sim.GRAVITY_SCALE_MAX },
  { input: 1e9, expected: sim.GRAVITY_SCALE_MAX },
];

const NON_FINITE_CASES: readonly number[] = [NaN, Infinity, -Infinity];

const SCALE_CASES: readonly number[] = [0.1, 0.5, 1, 2, 10];

const ACTION_SCHEDULE: readonly Action[] = [
  noThrusters,
  { left: true, right: false, rear: false },
  { left: false, right: true, rear: false },
  { left: true, right: true, rear: false },
  { left: false, right: false, rear: true },
  { left: true, right: true, rear: true },
];

function gravitySimulation(gravityScale?: number) {
  return createSimulationWithField(
    createWideTunnelField(),
    gravityScale === undefined ? {} : { gravityScale },
  );
}

function runSchedule(gravityScale: number): unknown[] {
  const simulation = createSimulationWithField(createWideTunnelField(), {
    seed: 8675309,
    gravityScale,
  });
  const states: unknown[] = [];
  for (let tick = 0; tick < 240; tick += 1) {
    states.push(simulation.step(ACTION_SCHEDULE[tick % ACTION_SCHEDULE.length]!));
  }
  return states;
}

describe("configurable gravity constants", () => {
  it("freezes the documented minimum, maximum, and default", () => {
    expect(sim.GRAVITY).toBe(1.62);
    expect(sim.GRAVITY_SCALE_MIN).toBe(0.1);
    expect(sim.GRAVITY_SCALE_MAX).toBe(10);
    expect(sim.GRAVITY_SCALE_DEFAULT).toBe(1);
    expect(sim.GRAVITY_SCALE_MIN).toBeLessThan(sim.GRAVITY_SCALE_DEFAULT);
    expect(sim.GRAVITY_SCALE_DEFAULT).toBeLessThan(sim.GRAVITY_SCALE_MAX);
  });
});

describe("gravity scale defaults", () => {
  it("defaults state and observation to scale 1 and effective gravity GRAVITY", () => {
    const simulation = gravitySimulation();
    const state = simulation.getState();
    const observation = simulation.getObservation();

    expect(state.gravityScale).toBe(sim.GRAVITY_SCALE_DEFAULT);
    expect(state.gravity).toBe(sim.GRAVITY);
    expect(observation.gravityScale).toBe(sim.GRAVITY_SCALE_DEFAULT);
    expect(observation.gravity).toBe(sim.GRAVITY);
  });

  it("treats an explicit default option as identical to the omitted option", () => {
    const omitted = gravitySimulation().getState();
    const explicit = gravitySimulation(sim.GRAVITY_SCALE_DEFAULT).getState();

    expect(explicit).toEqual(omitted);
  });
});

describe("gravity scale effective value", () => {
  it.each(SCALE_CASES)(
    "exposes gravityScale %f and effective gravity GRAVITY * scale",
    (scale) => {
      const simulation = gravitySimulation(scale);
      const state = simulation.getState();
      const observation = simulation.getObservation();

      expect(state.gravityScale).toBe(scale);
      expect(state.gravity).toBeCloseTo(sim.GRAVITY * scale, 14);
      expect(observation.gravityScale).toBe(scale);
      expect(observation.gravity).toBeCloseTo(sim.GRAVITY * scale, 14);
      expect(observation.gravity).toBe(state.gravity);
    },
  );

  it("exposes 0.162, 1.62, and 16.2 m/s2 at the documented extremes", () => {
    expect(gravitySimulation(0.1).getObservation().gravity).toBeCloseTo(0.162, 14);
    expect(gravitySimulation(1).getObservation().gravity).toBeCloseTo(1.62, 14);
    expect(gravitySimulation(10).getObservation().gravity).toBeCloseTo(16.2, 14);
  });
});

describe("gravity scale clamping and fallback", () => {
  it.each(CLAMP_CASES)(
    "clamps the construction option $input to $expected",
    ({ input, expected }) => {
      const state = gravitySimulation(input).getState();

      expect(state.gravityScale).toBe(expected);
      expect(state.gravity).toBeCloseTo(sim.GRAVITY * expected, 14);
    },
  );

  it.each(NON_FINITE_CASES)(
    "falls back to 1 for the non-finite construction option %s",
    (input) => {
      const state = gravitySimulation(input).getState();

      expect(state.gravityScale).toBe(sim.GRAVITY_SCALE_DEFAULT);
      expect(state.gravity).toBe(sim.GRAVITY);
    },
  );

  it.each(CLAMP_CASES)(
    "clamps setGravityScale($input) to $expected",
    ({ input, expected }) => {
      const simulation = gravitySimulation();
      simulation.setGravityScale(input);
      const state = simulation.getState();

      expect(state.gravityScale).toBe(expected);
      expect(state.gravity).toBeCloseTo(sim.GRAVITY * expected, 14);
      expect(simulation.getObservation().gravityScale).toBe(expected);
      expect(simulation.getObservation().gravity).toBeCloseTo(
        sim.GRAVITY * expected,
        14,
      );
    },
  );

  it.each(NON_FINITE_CASES)(
    "falls back to 1 when setGravityScale receives %s",
    (input) => {
      const simulation = gravitySimulation(4);
      simulation.setGravityScale(input);
      const state = simulation.getState();

      expect(state.gravityScale).toBe(sim.GRAVITY_SCALE_DEFAULT);
      expect(state.gravity).toBe(sim.GRAVITY);
    },
  );

  it("clamps finite values back up after an earlier clamp", () => {
    const simulation = gravitySimulation();
    simulation.setGravityScale(0.01);
    expect(simulation.getState().gravityScale).toBe(sim.GRAVITY_SCALE_MIN);

    simulation.setGravityScale(100);
    expect(simulation.getState().gravityScale).toBe(sim.GRAVITY_SCALE_MAX);

    simulation.setGravityScale(2);
    expect(simulation.getState().gravityScale).toBe(2);
  });
});

describe("gravity integration", () => {
  it.each(SCALE_CASES)(
    "uses the documented first no-thrust tick velocity at scale %f",
    (scale) => {
      const state = gravitySimulation(scale).step(noThrusters);
      const expectedVy = firstTickFallVelocity(scale);
      const expectedDamping = 1 + sim.LINEAR_DRAG * sim.FIXED_DT;

      expect(expectedVy).toBe((-sim.GRAVITY * scale * sim.FIXED_DT) / expectedDamping);
      expect(state.ship.velocity.x).toBe(0);
      expect(state.ship.velocity.y).toBeCloseTo(expectedVy, 14);
      expect(state.ship.position.y).toBeCloseTo(
        sim.START_POSITION.y + expectedVy * sim.FIXED_DT,
        14,
      );
      expect(state.ship.angularVelocity).toBe(0);
      expect(state.thrusters).toEqual(noThrusters);
    },
  );

  it("applies a setter from the next tick without retroactively changing the last tick", () => {
    const simulation = gravitySimulation();
    const afterDefaultTick = simulation.step(noThrusters);
    const defaultTickVy = afterDefaultTick.ship.velocity.y;
    expect(defaultTickVy).toBeCloseTo(firstTickFallVelocity(1), 14);

    simulation.setGravityScale(3);
    const observation = simulation.getObservation();
    expect(observation.gravityScale).toBe(3);
    expect(observation.gravity).toBeCloseTo(sim.GRAVITY * 3, 14);
    expect(afterDefaultTick.ship.velocity.y).toBe(defaultTickVy);

    const afterScaledTick = simulation.step(noThrusters);
    const expectedVy = (defaultTickVy - sim.GRAVITY * 3 * sim.FIXED_DT) /
      (1 + sim.LINEAR_DRAG * sim.FIXED_DT);
    expect(afterScaledTick.ship.velocity.y).toBeCloseTo(expectedVy, 13);
  });

  it("applies a setter before the first tick to that first tick", () => {
    const simulation = gravitySimulation();
    simulation.setGravityScale(10);
    const state = simulation.step(noThrusters);

    expect(state.ship.velocity.y).toBeCloseTo(firstTickFallVelocity(10), 14);
  });

  it.each(SCALE_CASES)(
    "approaches terminal fall GRAVITY * scale / LINEAR_DRAG at scale %f",
    (scale) => {
      const simulation = gravitySimulation(scale);
      let state = simulation.getState();
      let previousVy = 0;

      for (let tick = 0; tick < 6000; tick += 1) {
        state = simulation.step(noThrusters);
        expect(state.ship.velocity.y).toBeLessThanOrEqual(previousVy + 1e-12);
        previousVy = state.ship.velocity.y;
      }

      const expectedTerminal = terminalFallVelocity(scale);
      expect(expectedTerminal).toBeCloseTo(
        (-sim.GRAVITY * scale) / sim.LINEAR_DRAG,
        14,
      );
      expect(state.ship.velocity.y).toBeCloseTo(expectedTerminal, 2);
      expect(state.ship.velocity.y).toBeLessThan(0);
      expect(simulation.getObservation().lateralSpeed).toBeCloseTo(
        expectedTerminal,
        2,
      );
    },
  );

  it("leaves the fixed 1/120 second step and tick cadence unchanged", () => {
    const simulation = gravitySimulation(10);
    let state = simulation.getState();

    for (let tick = 1; tick <= 240; tick += 1) {
      state = simulation.step(noThrusters);
      expect(state.tick).toBe(tick);
      expect(state.time).toBe(tick * sim.FIXED_DT);
    }

    expect(sim.FIXED_DT).toBe(1 / 120);
    expect(state.time).toBeCloseTo(2, 12);
  });
});

describe("gravity scale reset persistence", () => {
  it("preserves the configured scale across reset during flight", () => {
    const simulation = gravitySimulation(2.5);
    simulation.step(noThrusters);
    simulation.step({ left: true, right: true, rear: true });

    const reset = simulation.reset();

    expect(reset.gravityScale).toBe(2.5);
    expect(reset.gravity).toBeCloseTo(sim.GRAVITY * 2.5, 14);
    expect(reset.tick).toBe(0);
    expect(reset.time).toBe(0);
    expect(reset.ship.velocity).toEqual({ x: 0, y: 0 });

    const observation = simulation.getObservation();
    expect(observation.gravityScale).toBe(2.5);
    expect(observation.gravity).toBeCloseTo(sim.GRAVITY * 2.5, 14);
  });

  it("preserves the configured scale across reset after destruction", () => {
    const { floor } = tunnelContactY();
    const simulation = createSimulationWithField(createControlledField(), {
      hull: 1,
      start: {
        position: { x: 40, y: floor + 0.005 },
        velocity: { x: 0, y: -100 },
      },
    });
    simulation.setGravityScale(4);

    const destroyed = simulation.step(noThrusters);
    expect(destroyed.outcome).toBe("destroyed");
    expect(destroyed.hull).toBe(0);

    const reset = simulation.reset();
    expect(reset.outcome).toBe("flying");
    expect(reset.hull).toBe(1);
    expect(reset.gravityScale).toBe(4);
    expect(reset.gravity).toBeCloseTo(sim.GRAVITY * 4, 14);
  });
});

describe("gravity scale determinism", () => {
  it("replays identical states for the same seed, scales, and actions", () => {
    const first = runSchedule(2.5);
    const second = runSchedule(2.5);

    expect(second).toEqual(first);
    expect(first).toHaveLength(240);
  });

  it("changes the trajectory when only the gravity scale changes", () => {
    const baseline = runSchedule(1);
    const heavier = runSchedule(10);

    expect(heavier).not.toEqual(baseline);
  });

  it("replays identical states across a mid-run setter schedule", () => {
    const run = () => {
      const simulation = gravitySimulation();
      const states: unknown[] = [];
      for (let tick = 0; tick < 240; tick += 1) {
        if (tick === 60) {
          simulation.setGravityScale(3);
        }
        if (tick === 120) {
          simulation.setGravityScale(0.25);
        }
        if (tick === 180) {
          simulation.setGravityScale(Number.NaN);
        }
        states.push(simulation.step(ACTION_SCHEDULE[tick % ACTION_SCHEDULE.length]!));
      }
      return { states, finalScale: simulation.getState().gravityScale };
    };

    const first = run();
    const second = run();

    expect(second).toEqual(first);
    expect(first.finalScale).toBe(sim.GRAVITY_SCALE_DEFAULT);
  });
});
