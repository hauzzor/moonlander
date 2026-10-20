import type { Action, Vec2 } from "./types";
import {
  ANGULAR_DRAG,
  LEFT_MOUNT,
  LINEAR_DRAG,
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

const REAR_FORCE: Vec2 = { x: REAR_THRUSTER_FORCE, y: 0 };

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
    torque += crossZ(LEFT_MOUNT, LEFT_FORCE);
  }
  if (action.right) {
    const force = rotate(RIGHT_FORCE, angle);
    forceX += force.x;
    forceY += force.y;
    torque += crossZ(RIGHT_MOUNT, RIGHT_FORCE);
  }
  if (action.rear) {
    const force = rotate(REAR_FORCE, angle);
    forceX += force.x;
    forceY += force.y;
    torque += crossZ(REAR_MOUNT, REAR_FORCE);
  }

  return { force: { x: forceX, y: forceY }, torque };
}

export function linearDragFactor(dt: number): number {
  return 1 / (1 + LINEAR_DRAG * dt);
}

export function angularDragFactor(dt: number): number {
  return 1 / (1 + ANGULAR_DRAG * dt);
}

export function applyLinearDrag(velocity: Vec2, dt: number): Vec2 {
  const factor = linearDragFactor(dt);
  return { x: velocity.x * factor, y: velocity.y * factor };
}

export function applyAngularDrag(
  angularVelocity: number,
  dt: number,
): number {
  return angularVelocity * angularDragFactor(dt);
}
