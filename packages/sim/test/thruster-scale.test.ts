import { describe, expect, it } from "vitest";
import type { Action, Vec2 } from "../src/index";
import {
  ANGULAR_DRAG,
  FIXED_DT,
  GRAVITY,
  LEFT_MOUNT,
  LINEAR_DRAG,
  REAR_MOUNT,
  REAR_THRUSTER_FORCE,
  RIGHT_MOUNT,
  SHIP_INERTIA,
  SHIP_MASS,
  THRUSTER_CANT,
  THRUSTER_FORCE,
} from "../src/index";
import { rotate, thrusterEffect } from "../src/physics";
import {
  allThrusters,
  createControlledField,
  createSimulationWithField,
  createWideTunnelField,
  noThrusters,
  sim,
  tunnelContactY,
} from "./helpers";

const LEFT_ONLY: Action = { left: true, right: false, rear: false };
const RIGHT_ONLY: Action = { left: false, right: true, rear: false };
const REAR_ONLY: Action = { left: false, right: false, rear: true };
const BOTH_BOTTOM: Action = { left: true, right: true, rear: false };

const ALL_ACTIONS: readonly Action[] = [
  noThrusters,
  LEFT_ONLY,
  RIGHT_ONLY,
  REAR_ONLY,
  BOTH_BOTTOM,
  { left: true, right: false, rear: true },
  { left: false, right: true, rear: true },
  allThrusters,
];

const ANGLES = [0, 0.37, -0.9, Math.PI / 2, -Math.PI / 2] as const;
const SCALE_CASES = [0.1, 0.5, 1, 2, 10] as const;
const CLAMP_CASES: ReadonlyArray<{ input: number; expected: number }> = [
  { input: -1000, expected: sim.THRUSTER_SCALE_MIN },
  { input: -1, expected: sim.THRUSTER_SCALE_MIN },
  { input: 0, expected: sim.THRUSTER_SCALE_MIN },
  { input: 0.05, expected: sim.THRUSTER_SCALE_MIN },
  { input: 0.1, expected: 0.1 },
  { input: 0.5, expected: 0.5 },
  { input: 1, expected: 1 },
  { input: 2.5, expected: 2.5 },
  { input: 9.999, expected: 9.999 },
  { input: 10, expected: 10 },
  { input: 10.001, expected: sim.THRUSTER_SCALE_MAX },
  { input: 1e9, expected: sim.THRUSTER_SCALE_MAX },
];
const NON_FINITE_CASES: readonly number[] = [NaN, Infinity, -Infinity];

const LEFT_LOCAL_FORCE: Vec2 = {
  x: THRUSTER_FORCE * Math.sin(THRUSTER_CANT),
  y: THRUSTER_FORCE * Math.cos(THRUSTER_CANT),
};
const RIGHT_LOCAL_FORCE: Vec2 = {
  x: -THRUSTER_FORCE * Math.sin(THRUSTER_CANT),
  y: THRUSTER_FORCE * Math.cos(THRUSTER_CANT),
};
const REAR_LOCAL_FORCE: Vec2 = { x: REAR_THRUSTER_FORCE, y: 0 };

function crossZ(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function expectVecClose(actual: Vec2, expected: Vec2, digits = 10): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

function thrusterSimulation(options: {
  bottomThrusterScale?: number;
  rearThrusterScale?: number;
} = {}) {
  return createSimulationWithField(createWideTunnelField(), options);
}

function runSchedule(
  bottomThrusterScale: number,
  rearThrusterScale: number,
): unknown[] {
  const simulation = createSimulationWithField(createWideTunnelField(), {
    seed: 424242,
    bottomThrusterScale,
    rearThrusterScale,
  });
  const actions = [noThrusters, LEFT_ONLY, RIGHT_ONLY, BOTH_BOTTOM, REAR_ONLY, allThrusters];
  const states: unknown[] = [];
  for (let tick = 0; tick < 240; tick += 1) {
    states.push(simulation.step(actions[tick % actions.length]!));
  }
  return states;
}

describe("configurable thruster power constants", () => {
  it("freezes the documented min, max, and default", () => {
    expect(sim.THRUSTER_SCALE_MIN).toBe(0.1);
    expect(sim.THRUSTER_SCALE_MAX).toBe(10);
    expect(sim.THRUSTER_SCALE_DEFAULT).toBe(1);
    expect(sim.THRUSTER_SCALE_MIN).toBeLessThan(sim.THRUSTER_SCALE_DEFAULT);
    expect(sim.THRUSTER_SCALE_DEFAULT).toBeLessThan(sim.THRUSTER_SCALE_MAX);
  });
});

describe("thrusterEffect scale arguments", () => {
  it("defaults optional bottom and rear scales to 1 bit-identically", () => {
    for (const action of ALL_ACTIONS) {
      for (const angle of ANGLES) {
        const omitted = thrusterEffect(angle, action);
        expect(thrusterEffect(angle, action, 1, 1)).toEqual(omitted);
        expect(thrusterEffect(angle, action, undefined, undefined)).toEqual(omitted);
      }
    }
  });

  it("scales bottom force and torque linearly without touching the rear booster", () => {
    for (const scale of SCALE_CASES) {
      for (const action of [LEFT_ONLY, RIGHT_ONLY, BOTH_BOTTOM]) {
        const base = thrusterEffect(0.37, action);
        const scaled = thrusterEffect(0.37, action, scale, 1);

        expect(scaled.force.x).toBeCloseTo(base.force.x * scale, 10);
        expect(scaled.force.y).toBeCloseTo(base.force.y * scale, 10);
        expect(scaled.torque).toBeCloseTo(base.torque * scale, 10);
      }

      const rearBase = thrusterEffect(0.37, REAR_ONLY);
      const rearBottomScaled = thrusterEffect(0.37, REAR_ONLY, scale, 1);
      expectVecClose(rearBottomScaled.force, rearBase.force, 12);
      expect(rearBottomScaled.torque).toBeCloseTo(rearBase.torque, 12);
    }
  });

  it("scales rear force linearly without touching the bottom thrusters", () => {
    for (const scale of SCALE_CASES) {
      for (const angle of ANGLES) {
        const scaled = thrusterEffect(angle, REAR_ONLY, 1, scale);
        expectVecClose(
          scaled.force,
          {
            x: rotate(REAR_LOCAL_FORCE, angle).x * scale,
            y: rotate(REAR_LOCAL_FORCE, angle).y * scale,
          },
          9,
        );
        expect(scaled.torque).toBe(0);
      }

      const bottomBase = thrusterEffect(0.37, BOTH_BOTTOM);
      const bottomRearScaled = thrusterEffect(0.37, BOTH_BOTTOM, 1, scale);
      expectVecClose(bottomRearScaled.force, bottomBase.force, 12);
      expect(bottomRearScaled.torque).toBeCloseTo(bottomBase.torque, 12);
    }
  });

  it("scales bottom and rear independently in one combined effect", () => {
    const angle = 0.37;
    const bottomScale = 3;
    const rearScale = 0.5;
    const left = thrusterEffect(angle, LEFT_ONLY);
    const right = thrusterEffect(angle, RIGHT_ONLY);
    const rear = thrusterEffect(angle, REAR_ONLY);
    const combined = thrusterEffect(angle, allThrusters, bottomScale, rearScale);

    expect(combined.force.x).toBeCloseTo(
      (left.force.x + right.force.x) * bottomScale +
        rear.force.x * rearScale,
      10,
    );
    expect(combined.force.y).toBeCloseTo(
      (left.force.y + right.force.y) * bottomScale +
        rear.force.y * rearScale,
      10,
    );
    expect(combined.torque).toBeCloseTo(
      (left.torque + right.torque) * bottomScale +
        rear.torque * rearScale,
      10,
    );
  });

  it.each(SCALE_CASES)(
    "produces combined lift 2 * THRUSTER_FORCE * cos(cant) * scale at %f",
    (scale) => {
      const effect = thrusterEffect(0, BOTH_BOTTOM, scale, 1);

      expect(effect.force.x).toBeCloseTo(0, 12);
      expect(effect.torque).toBeCloseTo(0, 12);
      expect(effect.force.y).toBeCloseTo(
        2 * THRUSTER_FORCE * Math.cos(THRUSTER_CANT) * scale,
        10,
      );
      expect(effect.force.y).toBeGreaterThan(0);
    },
  );

  it("scales rotation-invariant torque while the net force still rotates with the ship", () => {
    const scaleCases = [
      { bottom: 0.1, rear: 10 },
      { bottom: 10, rear: 0.1 },
      { bottom: 2, rear: 3 },
    ] as const;

    for (const { bottom, rear } of scaleCases) {
      const level = thrusterEffect(0, allThrusters, bottom, rear);

      for (const angle of ANGLES) {
        const rotated = thrusterEffect(angle, allThrusters, bottom, rear);
        expectVecClose(rotated.force, rotate(level.force, angle), 9);
        expect(rotated.torque).toBeCloseTo(level.torque, 9);
      }
    }
  });

  it("returns finite effects at extreme scales", () => {
    for (const bottom of [0.1, 10]) {
      for (const rear of [0.1, 10]) {
        for (const angle of ANGLES) {
          const effect = thrusterEffect(angle, allThrusters, bottom, rear);
          expect(Number.isFinite(effect.force.x)).toBe(true);
          expect(Number.isFinite(effect.force.y)).toBe(true);
          expect(Number.isFinite(effect.torque)).toBe(true);
        }
      }
    }
  });
});

describe("thruster power defaults", () => {
  it("defaults state and observation to 1 and treats explicit 1 as identical", () => {
    const omitted = thrusterSimulation();
    const explicit = thrusterSimulation({
      bottomThrusterScale: 1,
      rearThrusterScale: 1,
    });
    const state = omitted.getState();
    const observation = omitted.getObservation();

    expect(state.bottomThrusterScale).toBe(sim.THRUSTER_SCALE_DEFAULT);
    expect(state.rearThrusterScale).toBe(sim.THRUSTER_SCALE_DEFAULT);
    expect(observation.bottomThrusterScale).toBe(sim.THRUSTER_SCALE_DEFAULT);
    expect(observation.rearThrusterScale).toBe(sim.THRUSTER_SCALE_DEFAULT);
    expect(explicit.getState()).toEqual(state);

    const defaultStates = runSchedule(1, 1);
    const explicitStates: unknown[] = [];
    for (let tick = 0; tick < 240; tick += 1) {
      const action = [
        noThrusters,
        LEFT_ONLY,
        RIGHT_ONLY,
        BOTH_BOTTOM,
        REAR_ONLY,
        allThrusters,
      ][tick % 6]!;
      explicitStates.push(explicit.step(action));
    }
    expect(explicitStates).toEqual(defaultStates);
  });
});

describe("thruster power integration", () => {
  it.each(SCALE_CASES)(
    "scales Q force, torque, and gravity imbalance at bottom power %f",
    (scale) => {
      const state = thrusterSimulation({ bottomThrusterScale: scale }).step(LEFT_ONLY);
      const linearDamping = 1 + LINEAR_DRAG * FIXED_DT;
      const angularDamping = 1 + ANGULAR_DRAG * FIXED_DT;
      const forceX = LEFT_LOCAL_FORCE.x * scale;
      const forceY = LEFT_LOCAL_FORCE.y * scale;
      const torque = crossZ(LEFT_MOUNT, {
        x: LEFT_LOCAL_FORCE.x * scale,
        y: LEFT_LOCAL_FORCE.y * scale,
      });

      expect(state.ship.velocity.x).toBeCloseTo(
        (forceX / SHIP_MASS) * FIXED_DT / linearDamping,
        13,
      );
      expect(state.ship.velocity.y).toBeCloseTo(
        ((forceY / SHIP_MASS) - GRAVITY) * FIXED_DT / linearDamping,
        13,
      );
      expect(state.ship.angularVelocity).toBeCloseTo(
        (torque / SHIP_INERTIA) * FIXED_DT / angularDamping,
        13,
      );
      expect(state.bottomThrusterScale).toBe(scale);
    },
  );

  it.each(SCALE_CASES)(
    "scales rear force without changing lateral/angular behavior at rear power %f",
    (scale) => {
      const state = thrusterSimulation({ rearThrusterScale: scale }).step(REAR_ONLY);
      const linearDamping = 1 + LINEAR_DRAG * FIXED_DT;

      expect(state.ship.velocity.x).toBeCloseTo(
        (REAR_THRUSTER_FORCE * scale / SHIP_MASS) * FIXED_DT / linearDamping,
        13,
      );
      expect(state.ship.velocity.y).toBeCloseTo(
        (-GRAVITY * FIXED_DT) / linearDamping,
        13,
      );
      expect(state.ship.angularVelocity).toBe(0);
      expect(state.rearThrusterScale).toBe(scale);
    },
  );

  it("applies bottom and rear scales independently on the same tick", () => {
    const bottomScale = 2;
    const rearScale = 0.5;
    const state = thrusterSimulation({
      bottomThrusterScale: bottomScale,
      rearThrusterScale: rearScale,
    }).step(allThrusters);
    const linearDamping = 1 + LINEAR_DRAG * FIXED_DT;
    const netBottomAcceleration =
      (2 * THRUSTER_FORCE * Math.cos(THRUSTER_CANT) * bottomScale) / SHIP_MASS;

    expect(state.ship.velocity.x).toBeCloseTo(
      (REAR_THRUSTER_FORCE * rearScale / SHIP_MASS) * FIXED_DT / linearDamping,
      13,
    );
    expect(state.ship.velocity.y).toBeCloseTo(
      (netBottomAcceleration - GRAVITY) * FIXED_DT / linearDamping,
      13,
    );
    expect(state.ship.angularVelocity).toBeCloseTo(0, 14);
  });

  it.each(SCALE_CASES)(
    "scales combined bottom lift at %f while keeping lateral balance",
    (scale) => {
      const state = thrusterSimulation({ bottomThrusterScale: scale }).step(BOTH_BOTTOM);
      const linearDamping = 1 + LINEAR_DRAG * FIXED_DT;
      const liftAcceleration =
        (2 * THRUSTER_FORCE * Math.cos(THRUSTER_CANT) * scale) / SHIP_MASS;

      expect(state.ship.velocity.x).toBeCloseTo(0, 14);
      expect(state.ship.angularVelocity).toBeCloseTo(0, 14);
      expect(state.ship.velocity.y).toBeCloseTo(
        (liftAcceleration - GRAVITY) * FIXED_DT / linearDamping,
        13,
      );
    },
  );
});

describe("thruster power clamping and live setters", () => {
  it.each(CLAMP_CASES)(
    "clamps construction bottom/rear power $input to $expected",
    ({ input, expected }) => {
      const state = thrusterSimulation({
        bottomThrusterScale: input,
        rearThrusterScale: input,
      }).getState();

      expect(state.bottomThrusterScale).toBe(expected);
      expect(state.rearThrusterScale).toBe(expected);
    },
  );

  it.each(NON_FINITE_CASES)(
    "falls back to 1 for non-finite construction power %s",
    (input) => {
      const state = thrusterSimulation({
        bottomThrusterScale: input,
        rearThrusterScale: input,
      }).getState();

      expect(state.bottomThrusterScale).toBe(sim.THRUSTER_SCALE_DEFAULT);
      expect(state.rearThrusterScale).toBe(sim.THRUSTER_SCALE_DEFAULT);
    },
  );

  it.each(CLAMP_CASES)(
    "clamps both setters for input $input to $expected",
    ({ input, expected }) => {
      const simulation = thrusterSimulation();
      simulation.setBottomThrusterScale(input);
      simulation.setRearThrusterScale(input);
      const state = simulation.getState();

      expect(state.bottomThrusterScale).toBe(expected);
      expect(state.rearThrusterScale).toBe(expected);
      expect(simulation.getObservation().bottomThrusterScale).toBe(expected);
      expect(simulation.getObservation().rearThrusterScale).toBe(expected);
    },
  );

  it.each(NON_FINITE_CASES)(
    "falls back to 1 for non-finite setter input %s",
    (input) => {
      const simulation = thrusterSimulation({
        bottomThrusterScale: 3,
        rearThrusterScale: 4,
      });
      simulation.setBottomThrusterScale(input);
      simulation.setRearThrusterScale(input);

      expect(simulation.getState().bottomThrusterScale).toBe(1);
      expect(simulation.getState().rearThrusterScale).toBe(1);
    },
  );

  it("applies setter changes from the next tick", () => {
    const simulation = thrusterSimulation();
    const before = simulation.step(noThrusters);
    simulation.setBottomThrusterScale(2);
    simulation.setRearThrusterScale(0.5);

    expect(simulation.getObservation().bottomThrusterScale).toBe(2);
    expect(simulation.getObservation().rearThrusterScale).toBe(0.5);
    expect(before.bottomThrusterScale).toBe(1);
    expect(before.rearThrusterScale).toBe(1);

    const after = simulation.step(allThrusters);
    const linearDamping = 1 + LINEAR_DRAG * FIXED_DT;
    const expectedVx = (before.ship.velocity.x +
      (REAR_THRUSTER_FORCE * 0.5 / SHIP_MASS) * FIXED_DT) / linearDamping;
    const expectedVy = (before.ship.velocity.y +
      ((2 * THRUSTER_FORCE * Math.cos(THRUSTER_CANT) * 2) / SHIP_MASS -
        GRAVITY) * FIXED_DT) / linearDamping;

    expect(after.ship.velocity.x).toBeCloseTo(expectedVx, 13);
    expect(after.ship.velocity.y).toBeCloseTo(expectedVy, 13);
    expect(after.ship.angularVelocity).toBeCloseTo(0, 14);
  });

  it("applies setters before the first tick to that first tick", () => {
    const simulation = thrusterSimulation();
    simulation.setBottomThrusterScale(10);
    simulation.setRearThrusterScale(10);
    const state = simulation.step(allThrusters);
    const linearDamping = 1 + LINEAR_DRAG * FIXED_DT;
    const expectedVx =
      (REAR_THRUSTER_FORCE * 10 / SHIP_MASS) * FIXED_DT / linearDamping;
    const expectedVy =
      ((2 * THRUSTER_FORCE * Math.cos(THRUSTER_CANT) * 10) / SHIP_MASS -
        GRAVITY) * FIXED_DT / linearDamping;

    expect(state.ship.velocity.x).toBeCloseTo(expectedVx, 13);
    expect(state.ship.velocity.y).toBeCloseTo(expectedVy, 13);
  });
});

describe("thruster power reset persistence and determinism", () => {
  it("preserves configured thruster scales across reset during flight", () => {
    const simulation = thrusterSimulation({
      bottomThrusterScale: 3,
      rearThrusterScale: 0.25,
    });
    simulation.step(allThrusters);
    simulation.step(LEFT_ONLY);

    const reset = simulation.reset();

    expect(reset.tick).toBe(0);
    expect(reset.ship.velocity).toEqual({ x: 0, y: 0 });
    expect(reset.bottomThrusterScale).toBe(3);
    expect(reset.rearThrusterScale).toBe(0.25);
    expect(simulation.getObservation().bottomThrusterScale).toBe(3);
    expect(simulation.getObservation().rearThrusterScale).toBe(0.25);
  });

  it("preserves configured thruster scales across reset after destruction", () => {
    const { floor } = tunnelContactY();
    const simulation = createSimulationWithField(createControlledField(), {
      hull: 1,
      start: {
        position: { x: 40, y: floor + 0.005 },
        velocity: { x: 0, y: -100 },
      },
    });
    simulation.setBottomThrusterScale(7);
    simulation.setRearThrusterScale(0.2);

    const destroyed = simulation.step(noThrusters);
    expect(destroyed.outcome).toBe("destroyed");

    const reset = simulation.reset();
    expect(reset.outcome).toBe("flying");
    expect(reset.bottomThrusterScale).toBe(7);
    expect(reset.rearThrusterScale).toBe(0.2);
  });

  it("replays identical states for the same seed, scales, and actions", () => {
    expect(runSchedule(2.5, 0.5)).toEqual(runSchedule(2.5, 0.5));
  });

  it("changes the trajectory when only a thruster scale changes", () => {
    expect(runSchedule(10, 1)).not.toEqual(runSchedule(0.1, 1));
    expect(runSchedule(1, 10)).not.toEqual(runSchedule(1, 0.1));
  });
});
