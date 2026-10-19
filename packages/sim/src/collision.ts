import {
  LEFT_FOOT,
  NOSE,
  RIGHT_FOOT,
  SAFE_LANDING,
} from "./constants";
import { rotate } from "./physics";
import type { LandingOutcome, LanderState, Terrain, Vec2 } from "./types";

function worldPoint(body: LanderState, offset: Vec2): Vec2 {
  const rotated = rotate(offset, body.angle);
  return {
    x: body.position.x + rotated.x,
    y: body.position.y + rotated.y,
  };
}

function isContact(point: Vec2, terrain: Terrain): boolean {
  return point.y <= terrain.heightAt(point.x);
}

// A touchdown begins as soon as either foot contacts the ground; the nose
// crashing takes precedence. Pad membership uses both feet's x coordinates.
export function evaluateOutcome(
  body: LanderState,
  terrain: Terrain,
): LandingOutcome {
  const leftFoot = worldPoint(body, LEFT_FOOT);
  const rightFoot = worldPoint(body, RIGHT_FOOT);
  if (isContact(worldPoint(body, NOSE), terrain)) {
    return "crashed";
  }
  if (
    !isContact(leftFoot, terrain) &&
    !isContact(rightFoot, terrain)
  ) {
    return "flying";
  }
  const safe =
    Math.abs(body.velocity.y) <= SAFE_LANDING.verticalSpeed &&
    Math.abs(body.velocity.x) <= SAFE_LANDING.horizontalSpeed &&
    Math.abs(body.angle) <= SAFE_LANDING.tilt;
  if (!safe) {
    return "crashed";
  }
  const onPad =
    leftFoot.x >= terrain.pad.left &&
    leftFoot.x <= terrain.pad.right &&
    rightFoot.x >= terrain.pad.left &&
    rightFoot.x <= terrain.pad.right;
  return onPad ? "landed" : "missed-pad";
}
