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
  SHIP_CAPSULE_HALF_LENGTH,
  SHIP_HEIGHT,
  SHIP_INERTIA,
  SHIP_LENGTH,
  SHIP_MASS,
  SHIP_RADIUS,
  THRUSTER_CANT,
  THRUSTER_FORCE,
} from "../src/index";
import {
  angularDragFactor,
  applyAngularDrag,
  applyLinearDrag,
  linearDragFactor,
  rotate,
  thrusterEffect,
} from "../src/physics";

const LEFT_ONLY: Action = { left: true, right: false, rear: false };
const RIGHT_ONLY: Action = { left: false, right: true, rear: false };
const REAR_ONLY: Action = { left: false, right: false, rear: true };
const BOTH_BOTTOM: Action = { left: true, right: true, rear: false };
const BOTH_BOTTOM_AND_REAR: Action = { left: true, right: true, rear: true };
const NO_THRUST: Action = { left: false, right: false, rear: false };

const ALL_ACTIONS: readonly Action[] = [
  NO_THRUST,
  LEFT_ONLY,
  RIGHT_ONLY,
  REAR_ONLY,
  BOTH_BOTTOM,
  { left: true, right: false, rear: true },
  { left: false, right: true, rear: true },
  BOTH_BOTTOM_AND_REAR,
];

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

function magnitude(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

function expectVecClose(actual: Vec2, expected: Vec2, digits = 10): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

function expectFiniteVec(vector: Vec2): void {
  expect(Number.isFinite(vector.x)).toBe(true);
  expect(Number.isFinite(vector.y)).toBe(true);
}

describe("ship constants and thrust geometry", () => {
  it("freezes mass, hull dimensions, capsule, and derived inertia", () => {
    expect(SHIP_MASS).toBe(200);
    expect(SHIP_LENGTH).toBe(48);
    expect(SHIP_HEIGHT).toBe(18);
    expect(SHIP_RADIUS).toBe(9);
    expect(SHIP_CAPSULE_HALF_LENGTH).toBe(15);
    expect(SHIP_INERTIA).toBe(43800);
    expect(SHIP_INERTIA).toBe(
      (SHIP_MASS * (SHIP_LENGTH ** 2 + SHIP_HEIGHT ** 2)) / 12,
    );
    expect(2 * SHIP_CAPSULE_HALF_LENGTH + 2 * SHIP_RADIUS).toBe(SHIP_LENGTH);
    expect(2 * SHIP_RADIUS).toBe(SHIP_HEIGHT);
  });

  it("freezes the canted bottom thrusters and their mirror-symmetric mounts", () => {
    expect(THRUSTER_FORCE).toBe(1800);
    expect(THRUSTER_CANT).toBe((15 * Math.PI) / 180);
    expect(LEFT_MOUNT).toEqual({ x: -16, y: -9 });
    expect(RIGHT_MOUNT).toEqual({ x: 16, y: -9 });
    expect(RIGHT_MOUNT.x).toBe(-LEFT_MOUNT.x);
    expect(RIGHT_MOUNT.y).toBe(LEFT_MOUNT.y);
    expect(LEFT_MOUNT.y).toBe(-SHIP_HEIGHT / 2);
    expect(Math.abs(LEFT_MOUNT.x)).toBeLessThanOrEqual(SHIP_LENGTH / 2);
  });

  it("freezes the rear booster on the centerline behind the center of mass", () => {
    expect(REAR_THRUSTER_FORCE).toBe(900);
    expect(REAR_MOUNT).toEqual({ x: -24, y: 0 });
    expect(REAR_MOUNT.y).toBe(0);
    expect(REAR_MOUNT.x).toBe(-SHIP_LENGTH / 2);
    expect(REAR_MOUNT.x).toBeLessThan(0);
  });

  it("freezes positive linear and angular atmospheric drag coefficients", () => {
    expect(LINEAR_DRAG).toBe(0.35);
    expect(ANGULAR_DRAG).toBe(0.25);
    expect(LINEAR_DRAG).toBeGreaterThan(0);
    expect(ANGULAR_DRAG).toBeGreaterThan(0);
  });

  it("places the two bottom thruster reaction forces symmetrically about vertical", () => {
    expect(LEFT_LOCAL_FORCE.x).toBeGreaterThan(0);
    expect(RIGHT_LOCAL_FORCE.x).toBeLessThan(0);
    expect(LEFT_LOCAL_FORCE.y).toBeGreaterThan(0);
    expect(LEFT_LOCAL_FORCE.y).toBe(RIGHT_LOCAL_FORCE.y);
    expect(magnitude(LEFT_LOCAL_FORCE)).toBeCloseTo(THRUSTER_FORCE, 10);
    expect(magnitude(RIGHT_LOCAL_FORCE)).toBeCloseTo(THRUSTER_FORCE, 10);
    expect(
      Math.abs(LEFT_LOCAL_FORCE.x) / LEFT_LOCAL_FORCE.y,
    ).toBeCloseTo(Math.tan(THRUSTER_CANT), 12);
  });
});

describe("rotate", () => {
  it("returns the identity rotation at angle zero", () => {
    expectVecClose(rotate({ x: 3, y: -4 }, 0), { x: 3, y: -4 }, 14);
    expectVecClose(rotate({ x: -0.5, y: 7.25 }, 0), { x: -0.5, y: 7.25 }, 14);
  });

  it("maps zero to zero at every angle", () => {
    for (const angle of [0, 0.3, Math.PI / 2, Math.PI, -2.4]) {
      expectVecClose(rotate({ x: 0, y: 0 }, angle), { x: 0, y: 0 }, 14);
    }
  });

  it("rotates the world axes by plus and minus 90 degrees", () => {
    expectVecClose(rotate({ x: 1, y: 0 }, Math.PI / 2), { x: 0, y: 1 }, 14);
    expectVecClose(rotate({ x: 0, y: 1 }, Math.PI / 2), { x: -1, y: 0 }, 14);
    expectVecClose(rotate({ x: 1, y: 0 }, -Math.PI / 2), { x: 0, y: -1 }, 14);
    expectVecClose(rotate({ x: 0, y: 1 }, -Math.PI / 2), { x: 1, y: 0 }, 14);
    expectVecClose(rotate({ x: 4, y: -2 }, Math.PI), { x: -4, y: 2 }, 13);
  });

  it("matches the 2D rotation matrix for arbitrary vectors and angles", () => {
    const vectors: readonly Vec2[] = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 3, y: -4 },
      { x: -1.5, y: 2.25 },
    ];
    const angles = [
      -Math.PI,
      -Math.PI / 2,
      -0.3,
      0.3,
      Math.PI / 2,
      Math.PI,
      2.5,
    ];

    for (const vector of vectors) {
      for (const angle of angles) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        expectVecClose(rotate(vector, angle), {
          x: vector.x * cos - vector.y * sin,
          y: vector.x * sin + vector.y * cos,
        }, 12);
      }
    }
  });

  it("preserves length, dot products, and signed area", () => {
    const a: Vec2 = { x: 3, y: -4 };
    const b: Vec2 = { x: -2.5, y: 1.5 };
    const angle = 0.73;

    const rotatedA = rotate(a, angle);
    const rotatedB = rotate(b, angle);

    expect(magnitude(rotatedA)).toBeCloseTo(magnitude(a), 12);
    expect(magnitude(rotatedB)).toBeCloseTo(magnitude(b), 12);
    expect(rotatedA.x * rotatedB.x + rotatedA.y * rotatedB.y).toBeCloseTo(
      a.x * b.x + a.y * b.y,
      12,
    );
    expect(crossZ(rotatedA, rotatedB)).toBeCloseTo(crossZ(a, b), 12);
  });

  it("composes rotations additively", () => {
    const vector: Vec2 = { x: 2, y: 5 };
    const first = 0.41;
    const second = -1.17;

    expectVecClose(
      rotate(rotate(vector, first), second),
      rotate(vector, first + second),
      12,
    );
  });

  it("does not mutate its input and returns a fresh finite vector", () => {
    const vector: Vec2 = { x: 2, y: -7 };
    const original = { ...vector };
    const rotated = rotate(vector, 1.1);

    expect(vector).toEqual(original);
    expect(rotated).not.toBe(vector);
    expect(Object.keys(rotated).sort()).toEqual(["x", "y"]);
    expectFiniteVec(rotated);
  });

  it("is deterministic for repeated calls", () => {
    const vector: Vec2 = { x: -3.5, y: 8.25 };
    const angle = 1.234;

    const first = rotate(vector, angle);
    const second = rotate(vector, angle);
    const third = rotate(vector, angle);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });
});

describe("thrusterEffect", () => {
  it("returns the frozen ThrusterEffect shape", () => {
    const effect = thrusterEffect(0.2, BOTH_BOTTOM_AND_REAR);

    expect(Object.keys(effect).sort()).toEqual(["force", "torque"]);
    expect(Object.keys(effect.force).sort()).toEqual(["x", "y"]);
    expect(typeof effect.torque).toBe("number");
    expect(typeof effect.force.x).toBe("number");
    expect(typeof effect.force.y).toBe("number");
  });

  it("produces no force and no torque when no thruster fires", () => {
    const effect = thrusterEffect(0, NO_THRUST);

    expect(effect.force.x).toBeCloseTo(0, 14);
    expect(effect.force.y).toBeCloseTo(0, 14);
    expect(effect.torque).toBeCloseTo(0, 14);
  });

  it("fires the left thruster up and to the right with clockwise torque", () => {
    const effect = thrusterEffect(0, LEFT_ONLY);
    const expectedTorque = crossZ(LEFT_MOUNT, LEFT_LOCAL_FORCE);

    expectVecClose(effect.force, LEFT_LOCAL_FORCE, 12);
    expect(effect.force.y).toBeGreaterThan(0);
    expect(effect.force.x).toBeGreaterThan(0);
    expect(magnitude(effect.force)).toBeCloseTo(THRUSTER_FORCE, 10);
    expect(effect.torque).toBeCloseTo(expectedTorque, 12);
    expect(effect.torque).toBeLessThan(0);
  });

  it("mirrors the right thruster with up-left force and counter-clockwise torque", () => {
    const left = thrusterEffect(0, LEFT_ONLY);
    const right = thrusterEffect(0, RIGHT_ONLY);
    const expectedTorque = crossZ(RIGHT_MOUNT, RIGHT_LOCAL_FORCE);

    expectVecClose(right.force, RIGHT_LOCAL_FORCE, 12);
    expect(right.force.y).toBeGreaterThan(0);
    expect(right.force.x).toBeLessThan(0);
    expect(magnitude(right.force)).toBeCloseTo(THRUSTER_FORCE, 10);
    expect(right.torque).toBeCloseTo(expectedTorque, 12);
    expect(right.torque).toBeGreaterThan(0);
    expect(right.force.x).toBeCloseTo(-left.force.x, 12);
    expect(right.force.y).toBeCloseTo(left.force.y, 12);
    expect(right.torque).toBeCloseTo(-left.torque, 12);
  });

  it("meets the single-thruster lateral and angular acceleration targets", () => {
    const left = thrusterEffect(0, LEFT_ONLY);
    const right = thrusterEffect(0, RIGHT_ONLY);

    for (const effect of [left, right]) {
      expect(Math.abs(effect.force.x) / SHIP_MASS).toBeGreaterThanOrEqual(2.0);
      expect(Math.abs(effect.torque) / SHIP_INERTIA).toBeGreaterThanOrEqual(
        0.5,
      );
    }
  });

  it("produces balanced lift and zero net torque when both bottom thrusters fire", () => {
    const effect = thrusterEffect(0, BOTH_BOTTOM);

    expect(effect.force.x).toBeCloseTo(0, 12);
    expect(effect.torque).toBeCloseTo(0, 12);
    expect(effect.force.y).toBeCloseTo(
      2 * THRUSTER_FORCE * Math.cos(THRUSTER_CANT),
      10,
    );
    expect(effect.force.y).toBeGreaterThan(0);
    expect(
      effect.force.y / SHIP_MASS - GRAVITY,
    ).toBeGreaterThanOrEqual(12);
  });

  it("fires the rear booster along local +x with no lateral force or torque", () => {
    const effect = thrusterEffect(0, REAR_ONLY);

    expectVecClose(effect.force, { x: REAR_THRUSTER_FORCE, y: 0 }, 14);
    expect(effect.force.y).toBeCloseTo(0, 14);
    expect(effect.torque).toBe(0);
  });

  it("rotates the rear booster force with the ship and keeps zero torque", () => {
    for (const angle of [-Math.PI / 2, 0.7, Math.PI / 2, Math.PI]) {
      const effect = thrusterEffect(angle, REAR_ONLY);

      expectVecClose(effect.force, rotate(REAR_LOCAL_FORCE, angle), 11);
      expect(magnitude(effect.force)).toBeCloseTo(REAR_THRUSTER_FORCE, 10);
      expect(effect.torque).toBe(0);
    }
  });

  it("combines rear and bottom thrusters without disturbing their torque balance", () => {
    const bottom = thrusterEffect(0, BOTH_BOTTOM);
    const all = thrusterEffect(0, BOTH_BOTTOM_AND_REAR);

    expect(all.force.x).toBeCloseTo(REAR_THRUSTER_FORCE, 12);
    expect(all.force.y).toBeCloseTo(bottom.force.y, 12);
    expect(all.torque).toBeCloseTo(bottom.torque, 12);
    expect(all.torque).toBeCloseTo(0, 12);
    expect(all.force.y).toBeGreaterThan(0);
    expect(all.force.x).toBeGreaterThan(0);
  });

  it("adds every thruster combination without cross-coupling", () => {
    for (const action of ALL_ACTIONS) {
      const effect = thrusterEffect(0, action);
      const expectedForce: Vec2 = {
        x:
          (action.left ? LEFT_LOCAL_FORCE.x : 0) +
          (action.right ? RIGHT_LOCAL_FORCE.x : 0) +
          (action.rear ? REAR_LOCAL_FORCE.x : 0),
        y:
          (action.left ? LEFT_LOCAL_FORCE.y : 0) +
          (action.right ? RIGHT_LOCAL_FORCE.y : 0) +
          (action.rear ? REAR_LOCAL_FORCE.y : 0),
      };
      const expectedTorque =
        (action.left ? crossZ(LEFT_MOUNT, LEFT_LOCAL_FORCE) : 0) +
        (action.right ? crossZ(RIGHT_MOUNT, RIGHT_LOCAL_FORCE) : 0) +
        (action.rear ? crossZ(REAR_MOUNT, REAR_LOCAL_FORCE) : 0);

      expectVecClose(effect.force, expectedForce, 11);
      expect(effect.torque).toBeCloseTo(expectedTorque, 11);
    }
  });

  it("rotates the net force with the ship while torque stays rotation-invariant", () => {
    const angles = [-Math.PI, -1.2, -Math.PI / 2, 0, 0.6, Math.PI / 2, 2.7];

    for (const action of ALL_ACTIONS) {
      const level = thrusterEffect(0, action);

      for (const angle of angles) {
        const rotated = thrusterEffect(angle, action);

        expectVecClose(rotated.force, rotate(level.force, angle), 9);
        expect(rotated.torque).toBeCloseTo(level.torque, 8);
        expect(magnitude(rotated.force)).toBeCloseTo(
          magnitude(level.force),
          9,
        );
      }
    }
  });

  it("reacts immediately to action changes without latching or hidden state", () => {
    const left = thrusterEffect(0, LEFT_ONLY);

    const released = thrusterEffect(0, NO_THRUST);
    expect(released.force.x).toBeCloseTo(0, 14);
    expect(released.force.y).toBeCloseTo(0, 14);
    expect(released.torque).toBeCloseTo(0, 14);

    const rear = thrusterEffect(0, REAR_ONLY);
    const rearReleased = thrusterEffect(0, NO_THRUST);
    expect(rear.force.x).toBeCloseTo(REAR_THRUSTER_FORCE, 14);
    expect(rearReleased.force.x).toBeCloseTo(0, 14);

    const stillHeld = thrusterEffect(0, LEFT_ONLY);
    expect(stillHeld).toEqual(left);
  });

  it("does not mutate the action or the frozen mount constants", () => {
    const action: Action = { left: true, right: true, rear: true };
    const originalAction = { ...action };
    const originalLeftMount = { ...LEFT_MOUNT };
    const originalRightMount = { ...RIGHT_MOUNT };
    const originalRearMount = { ...REAR_MOUNT };

    thrusterEffect(0.9, action);

    expect(action).toEqual(originalAction);
    expect(LEFT_MOUNT).toEqual(originalLeftMount);
    expect(RIGHT_MOUNT).toEqual(originalRightMount);
    expect(REAR_MOUNT).toEqual(originalRearMount);
  });

  it("is deterministic across repeated and interleaved calls", () => {
    const angles = [0, 0.25, -0.8, Math.PI / 2];

    for (const action of ALL_ACTIONS) {
      for (const angle of angles) {
        const first = thrusterEffect(angle, action);
        thrusterEffect(angle, NO_THRUST);
        thrusterEffect(-angle, BOTH_BOTTOM_AND_REAR);
        const second = thrusterEffect(angle, action);
        const third = thrusterEffect(angle, action);

        expect(second).toEqual(first);
        expect(third).toEqual(first);
        expectFiniteVec(first.force);
        expect(Number.isFinite(first.torque)).toBe(true);
      }
    }
  });

  it("returns finite output for very large and negative ship angles", () => {
    for (const angle of [-1e6, -Math.PI * 1000, 1e6, Math.PI * 1000]) {
      const effect = thrusterEffect(angle, BOTH_BOTTOM_AND_REAR);
      expectFiniteVec(effect.force);
      expect(Number.isFinite(effect.torque)).toBe(true);
      expect(magnitude(effect.force)).toBeCloseTo(
        magnitude(thrusterEffect(0, BOTH_BOTTOM_AND_REAR).force),
        4,
      );
    }
  });
});

describe("drag model coefficients and factors", () => {
  const linearFactor = 1 / (1 + LINEAR_DRAG * FIXED_DT);
  const angularFactor = 1 / (1 + ANGULAR_DRAG * FIXED_DT);
  const ticksPerSecond = Math.round(1 / FIXED_DT);

  it("derives sub-unit linear and angular per-tick damping factors", () => {
    expect(linearFactor).toBeGreaterThan(0);
    expect(linearFactor).toBeLessThan(1);
    expect(angularFactor).toBeGreaterThan(0);
    expect(angularFactor).toBeLessThan(1);
    expect(linearFactor).toBeCloseTo(
      1 / (1 + 0.35 * (1 / 120)),
      14,
    );
    expect(angularFactor).toBeCloseTo(
      1 / (1 + 0.25 * (1 / 120)),
      14,
    );
  });

  it("returns the exact discrete linear and angular factors from the helpers", () => {
    expect(linearDragFactor(FIXED_DT)).toBeCloseTo(linearFactor, 14);
    expect(angularDragFactor(FIXED_DT)).toBeCloseTo(angularFactor, 14);
    expect(linearDragFactor(FIXED_DT)).toBeLessThan(1);
    expect(angularDragFactor(FIXED_DT)).toBeLessThan(1);
    expect(linearDragFactor(0)).toBe(1);
    expect(angularDragFactor(0)).toBe(1);
  });

  it("applies the linear drag factor to both axes without mutating the input", () => {
    const velocity: Vec2 = { x: 12, y: -7 };
    const original = { ...velocity };
    const damped = applyLinearDrag(velocity, FIXED_DT);

    expect(velocity).toEqual(original);
    expect(damped.x).toBeCloseTo(velocity.x * linearFactor, 14);
    expect(damped.y).toBeCloseTo(velocity.y * linearFactor, 14);
    expect(damped.x / velocity.x).toBeCloseTo(linearFactor, 14);
    expect(damped.y / velocity.y).toBeCloseTo(linearFactor, 14);
    expect(damped.x / velocity.x).toBe(damped.y / velocity.y);
    expect(applyLinearDrag(velocity, 0)).toEqual(velocity);
  });

  it("applies the angular drag factor to angular velocity", () => {
    const damped = applyAngularDrag(2, FIXED_DT);

    expect(damped).toBeCloseTo(2 * angularFactor, 14);
    expect(damped).toBeLessThan(2);
    expect(damped).toBeGreaterThan(0);
    expect(applyAngularDrag(-1.5, FIXED_DT)).toBeCloseTo(
      -1.5 * angularFactor,
      14,
    );
    expect(applyAngularDrag(2, 0)).toBe(2);
  });

  it("loses at least 25 percent of 20 m/s after one second of pure linear drag", () => {
    let velocity: Vec2 = { x: 20, y: 0 };

    for (let tick = 0; tick < ticksPerSecond; tick += 1) {
      velocity = applyLinearDrag(velocity, FIXED_DT);
    }

    const speedAfterOneSecond = magnitude(velocity);
    expect(ticksPerSecond).toBe(120);
    expect(speedAfterOneSecond).toBeLessThanOrEqual(20 * 0.75);
    expect(speedAfterOneSecond).toBeCloseTo(
      20 / (1 + LINEAR_DRAG * FIXED_DT) ** 120,
      12,
    );
    expect(speedAfterOneSecond).toBeGreaterThan(0);
  });

  it("damps angular velocity with the exact discrete angular factor", () => {
    let angularVelocity = 2;

    for (let tick = 0; tick < ticksPerSecond; tick += 1) {
      angularVelocity = applyAngularDrag(angularVelocity, FIXED_DT);
    }

    expect(angularVelocity).toBeGreaterThan(0);
    expect(angularVelocity).toBeLessThan(2);
    expect(angularVelocity).toBeCloseTo(
      2 / (1 + ANGULAR_DRAG * FIXED_DT) ** 120,
      12,
    );
    expect(angularVelocity).toBeCloseTo(1.558, 3);
  });

  it("keeps the linear drag fixed point (free-fall terminal speed) at or below 5 m/s", () => {
    const terminalFallSpeed = -GRAVITY / LINEAR_DRAG;
    const fixedPoint = (-GRAVITY * FIXED_DT) * linearFactor /
      (1 - linearFactor);

    expect(Math.abs(terminalFallSpeed)).toBeLessThanOrEqual(5);
    expect(fixedPoint).toBeCloseTo(terminalFallSpeed, 10);
    expect(terminalFallSpeed).toBeLessThan(0);

    let velocityY = 0;
    let previousVelocityY = 0;
    for (let tick = 0; tick < 4800; tick += 1) {
      velocityY = applyLinearDrag(
        { x: 0, y: velocityY - GRAVITY * FIXED_DT },
        FIXED_DT,
      ).y;
      expect(velocityY).toBeLessThanOrEqual(previousVelocityY);
      previousVelocityY = velocityY;
    }

    expect(Math.abs(velocityY)).toBeLessThanOrEqual(5);
    expect(velocityY).toBeCloseTo(terminalFallSpeed, 2);
  });

  it("decays any magnitude of linear and angular velocity strictly toward zero", () => {
    for (const speed of [0.001, 1, 20, 500]) {
      const damped = applyLinearDrag({ x: speed, y: -speed }, FIXED_DT);
      expect(magnitude(damped)).toBeLessThan(magnitude({ x: speed, y: -speed }));

      for (const omega of [-50, -0.1, 0.1, 50]) {
        expect(Math.abs(applyAngularDrag(omega, FIXED_DT))).toBeLessThan(
          Math.abs(omega),
        );
      }
    }
  });

  it("is deterministic for the drag helpers", () => {
    const velocity: Vec2 = { x: 5.5, y: -3.25 };

    expect(linearDragFactor(FIXED_DT)).toBe(linearDragFactor(FIXED_DT));
    expect(angularDragFactor(FIXED_DT)).toBe(angularDragFactor(FIXED_DT));
    expect(applyLinearDrag(velocity, FIXED_DT)).toEqual(
      applyLinearDrag(velocity, FIXED_DT),
    );
    expect(applyAngularDrag(0.75, FIXED_DT)).toBe(
      applyAngularDrag(0.75, FIXED_DT),
    );
  });
});
