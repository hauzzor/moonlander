import type { Action, LanderState, Vec2 } from "./types";
import {
  FIXED_DT,
  FUEL_BURN_RATE,
  LANDER_INERTIA,
  LANDER_MASS,
  LEFT_MOUNT,
  MOON_GRAVITY,
  RIGHT_MOUNT,
  THRUSTER_CANT,
  THRUSTER_FORCE,
} from "./constants";

export function rotate(vec: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vec.x * cos - vec.y * sin, y: vec.x * sin + vec.y * cos };
}

function crossZ(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

// Reaction forces in the body frame: the left thruster pushes up and to the
// right, the right thruster mirrors it. The nozzle cant is 15 degrees from
// vertical, measured outward.
const LEFT_FORCE: Vec2 = {
  x: THRUSTER_FORCE * Math.sin(THRUSTER_CANT),
  y: THRUSTER_FORCE * Math.cos(THRUSTER_CANT),
};

const RIGHT_FORCE: Vec2 = {
  x: -THRUSTER_FORCE * Math.sin(THRUSTER_CANT),
  y: THRUSTER_FORCE * Math.cos(THRUSTER_CANT),
};

export interface ThrusterEffect {
  force: Vec2;
  torque: number;
}

export function thrusterEffect(
  angle: number,
  leftScale: number,
  rightScale: number,
): ThrusterEffect {
  let forceX = 0;
  let forceY = 0;
  let torque = 0;
  if (leftScale > 0) {
    const force = rotate(LEFT_FORCE, angle);
    forceX += leftScale * force.x;
    forceY += leftScale * force.y;
    // Rotating both the lever arm and the force together preserves their
    // cross product, so the body-frame torque is already the world torque.
    torque += leftScale * crossZ(LEFT_MOUNT, LEFT_FORCE);
  }
  if (rightScale > 0) {
    const force = rotate(RIGHT_FORCE, angle);
    forceX += rightScale * force.x;
    forceY += rightScale * force.y;
    torque += rightScale * crossZ(RIGHT_MOUNT, RIGHT_FORCE);
  }
  return { force: { x: forceX, y: forceY }, torque };
}

export interface FuelUsage {
  fuel: number;
  leftScale: number;
  rightScale: number;
}

// Fuel is shared between the thrusters. A thruster burns at FUEL_BURN_RATE
// per second while commanded; when less fuel remains than a full tick would
// burn, thrust scales down to the remaining fraction and fuel reaches zero.
export function consumeFuel(fuel: number, action: Action): FuelUsage {
  const maxBurn = FUEL_BURN_RATE * FIXED_DT;
  let remaining = fuel;
  let leftScale = 0;
  let rightScale = 0;
  if (action.left) {
    leftScale = Math.min(1, remaining / maxBurn);
    remaining -= leftScale * maxBurn;
  }
  if (action.right) {
    rightScale = Math.min(1, remaining / maxBurn);
    remaining -= rightScale * maxBurn;
  }
  return { fuel: remaining, leftScale, rightScale };
}

// Semi-implicit Euler: velocities are updated first and drive the position
// and angle updates, keeping every step deterministic in the fixed timestep.
export function integrate(
  body: LanderState,
  effect: ThrusterEffect,
  dt: number,
): LanderState {
  const ax = effect.force.x / LANDER_MASS;
  const ay = effect.force.y / LANDER_MASS - MOON_GRAVITY;
  const angularAcceleration = effect.torque / LANDER_INERTIA;
  const velocity = {
    x: body.velocity.x + ax * dt,
    y: body.velocity.y + ay * dt,
  };
  const angularVelocity = body.angularVelocity + angularAcceleration * dt;
  return {
    velocity,
    position: {
      x: body.position.x + velocity.x * dt,
      y: body.position.y + velocity.y * dt,
    },
    angle: body.angle + angularVelocity * dt,
    angularVelocity,
  };
}
