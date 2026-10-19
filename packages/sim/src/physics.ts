import type { Action, Vec2 } from "./types";
import {
  LEFT_MOUNT,
  REAR_MOUNT,
  REAR_THRUSTER_FORCE,
  RIGHT_MOUNT,
  THRUSTER_CANT,
  THRUSTER_FORCE,
} from "./constants";

export function rotate(vector: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function crossZ(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

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
  action: Action,
): ThrusterEffect {
  let forceX = 0;
  let forceY = 0;
  let torque = 0;
  if (action.left) {
    const force = rotate(LEFT_FORCE, angle);
    forceX += force.x;
    forceY += force.y;
    // Rotating the lever arm and force together preserves their cross product.
    torque += crossZ(LEFT_MOUNT, LEFT_FORCE);
  }
  if (action.right) {
    const force = rotate(RIGHT_FORCE, angle);
    forceX += force.x;
    forceY += force.y;
    torque += crossZ(RIGHT_MOUNT, RIGHT_FORCE);
  }
  if (action.rear) {
    const force = rotate({ x: REAR_THRUSTER_FORCE, y: 0 }, angle);
    forceX += force.x;
    forceY += force.y;
    torque += crossZ(REAR_MOUNT, { x: REAR_THRUSTER_FORCE, y: 0 });
  }
  return { force: { x: forceX, y: forceY }, torque };
}
