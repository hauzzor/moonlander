import {
  BOUNCE_RESTITUTION,
  SHIP_CAPSULE_HALF_LENGTH,
  SHIP_RADIUS,
  TUNNEL_SAMPLE_STEP,
  WALL_RADIUS,
  WALL_SENSOR_RANGE,
} from "./constants";
import {
  closestPointsBetweenSegments,
  dot,
  normalize,
} from "./geometry";
import { rotate } from "./physics";
import type { Field, Vec2 } from "./types";

const MAX_SUBSTEP_MOVEMENT = 0.5;
const MAX_SUBSTEPS = 10000;
const CONTACT_ITERATIONS = 3;
const PENETRATION_SLOP = 0.001;
const CAPSULE_EXTENT = SHIP_CAPSULE_HALF_LENGTH + SHIP_RADIUS;
const COLLISION_QUERY_RADIUS =
  CAPSULE_EXTENT + WALL_RADIUS + TUNNEL_SAMPLE_STEP + 2;

interface Contact {
  normal: Vec2;
  penetration: number;
}

export interface Capsule {
  start: Vec2;
  end: Vec2;
}

export function capsuleEndpoints(position: Vec2, angle: number): Capsule {
  const offset = rotate({ x: SHIP_CAPSULE_HALF_LENGTH, y: 0 }, angle);
  return {
    start: { x: position.x - offset.x, y: position.y - offset.y },
    end: { x: position.x + offset.x, y: position.y + offset.y },
  };
}

function wallContactNormal(
  distance: number,
  capsulePoint: Vec2,
  wallPoint: Vec2,
  wallStart: Vec2,
  wallEnd: Vec2,
  position: Vec2,
  velocity: Vec2,
): Vec2 {
  if (distance > 1e-9) {
    return {
      x: (capsulePoint.x - wallPoint.x) / distance,
      y: (capsulePoint.y - wallPoint.y) / distance,
    };
  }

  const dx = wallEnd.x - wallStart.x;
  const dy = wallEnd.y - wallStart.y;
  let normal = normalize({ x: -dy, y: dx });
  const midpoint = {
    x: (wallStart.x + wallEnd.x) / 2,
    y: (wallStart.y + wallEnd.y) / 2,
  };
  if (
    dot(normal, { x: position.x - midpoint.x, y: position.y - midpoint.y }) < 0
  ) {
    normal = { x: -normal.x, y: -normal.y };
  }
  if (dot(normal, velocity) > 0) {
    normal = { x: -normal.x, y: -normal.y };
  }
  return normal;
}

function detectContacts(
  field: Field,
  position: Vec2,
  angle: number,
  velocity: Vec2,
): Contact[] {
  const capsule = capsuleEndpoints(position, angle);
  const contacts: Contact[] = [];
  const wallSeparation = SHIP_RADIUS + WALL_RADIUS;

  for (const chunk of field.chunksInView(position, COLLISION_QUERY_RADIUS)) {
    for (const wall of chunk.walls) {
      for (let index = 0; index + 1 < wall.points.length; index += 1) {
        const first = wall.points[index]!;
        const second = wall.points[index + 1]!;
        const closest = closestPointsBetweenSegments(
          capsule.start,
          capsule.end,
          first,
          second,
        );
        if (closest.distance < wallSeparation) {
          contacts.push({
            normal: wallContactNormal(
              closest.distance,
              closest.pointA,
              closest.pointB,
              first,
              second,
              position,
              velocity,
            ),
            penetration: wallSeparation - closest.distance,
          });
        }
      }
    }
  }

  return contacts;
}

export interface AdvanceResult {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  maxImpactSpeed: number;
}

export function advanceWithCollisions(
  field: Field,
  initialPosition: Vec2,
  initialVelocity: Vec2,
  initialAngle: number,
  angularVelocity: number,
  dt: number,
): AdvanceResult {
  const linearTravel = Math.hypot(initialVelocity.x, initialVelocity.y) * dt;
  const angularTravel = Math.abs(angularVelocity) * CAPSULE_EXTENT * dt;
  const substepCount = Math.max(
    1,
    Math.min(
      MAX_SUBSTEPS,
      Math.ceil((linearTravel + angularTravel) / MAX_SUBSTEP_MOVEMENT),
    ),
  );
  const subDt = dt / substepCount;

  const position = { x: initialPosition.x, y: initialPosition.y };
  let velocity = { x: initialVelocity.x, y: initialVelocity.y };
  let angle = initialAngle;
  let maxImpactSpeed = 0;

  for (let substep = 0; substep < substepCount; substep += 1) {
    position.x += velocity.x * subDt;
    position.y += velocity.y * subDt;
    angle += angularVelocity * subDt;

    for (let iteration = 0; iteration < CONTACT_ITERATIONS; iteration += 1) {
      const contacts = detectContacts(field, position, angle, velocity);
      if (contacts.length === 0) {
        break;
      }

      for (const contact of contacts) {
        const normalVelocity = dot(velocity, contact.normal);
        if (normalVelocity < 0) {
          const impactSpeed = -normalVelocity;
          if (impactSpeed > maxImpactSpeed) {
            maxImpactSpeed = impactSpeed;
          }
          const impulse = (1 + BOUNCE_RESTITUTION) * normalVelocity;
          velocity = {
            x: velocity.x - impulse * contact.normal.x,
            y: velocity.y - impulse * contact.normal.y,
          };
        }
        position.x += contact.normal.x * (contact.penetration + PENETRATION_SLOP);
        position.y += contact.normal.y * (contact.penetration + PENETRATION_SLOP);
      }
    }
  }

  return { position, velocity, angle, maxImpactSpeed };
}

export function nearestWallDistance(
  field: Field,
  position: Vec2,
  angle: number,
): number {
  const capsule = capsuleEndpoints(position, angle);
  const searchRadius =
    WALL_SENSOR_RANGE + CAPSULE_EXTENT + WALL_RADIUS + TUNNEL_SAMPLE_STEP + 1;
  let nearest = Number.POSITIVE_INFINITY;

  for (const chunk of field.chunksInView(position, searchRadius)) {
    for (const wall of chunk.walls) {
      for (let index = 0; index + 1 < wall.points.length; index += 1) {
        const first = wall.points[index]!;
        const second = wall.points[index + 1]!;
        const distance =
          closestPointsBetweenSegments(capsule.start, capsule.end, first, second)
            .distance -
          SHIP_RADIUS -
          WALL_RADIUS;
        if (distance < nearest) {
          nearest = distance;
        }
      }
    }
  }

  return nearest <= WALL_SENSOR_RANGE ? nearest : WALL_SENSOR_RANGE;
}
