import {
  BOUNCE_RESTITUTION,
  GATE_FRAME_RADIUS,
  GATE_MAX_RADIUS,
  GROUND_Y,
  SENSOR_RANGE,
  SHIP_CAPSULE_HALF_LENGTH,
  SHIP_RADIUS,
  WALL_RADIUS,
} from "./constants";
import {
  closestPointOnSegment,
  closestPointsBetweenSegments,
  dot,
  normalize,
} from "./geometry";
import { rotate } from "./physics";
import type { Field, Gate, Vec2 } from "./types";

const MAX_SUBSTEP_MOVEMENT = 0.5;
const MAX_SUBSTEPS = 10000;
const CONTACT_ITERATIONS = 3;
const PENETRATION_SLOP = 0.001;
const COLLISION_QUERY_RADIUS =
  SHIP_CAPSULE_HALF_LENGTH +
  SHIP_RADIUS +
  GATE_MAX_RADIUS +
  GATE_FRAME_RADIUS +
  2;
const CAPSULE_EXTENT = SHIP_CAPSULE_HALF_LENGTH + SHIP_RADIUS;

interface Contact {
  normal: Vec2;
  penetration: number;
  gateId?: string;
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
  if (dot(normal, { x: position.x - midpoint.x, y: position.y - midpoint.y }) < 0) {
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

  const lowestY = Math.min(capsule.start.y, capsule.end.y);
  if (lowestY - SHIP_RADIUS < GROUND_Y) {
    contacts.push({
      normal: { x: 0, y: 1 },
      penetration: GROUND_Y - (lowestY - SHIP_RADIUS),
    });
  }

  const chunks = field.chunksInView(position, COLLISION_QUERY_RADIUS);
  const wallSeparation = SHIP_RADIUS + WALL_RADIUS;
  const gateSeparation = SHIP_RADIUS + GATE_FRAME_RADIUS;

  for (const chunk of chunks) {
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

    for (const gate of chunk.gates) {
      const closest = closestPointOnSegment(gate.center, capsule.start, capsule.end);
      const dx = closest.x - gate.center.x;
      const dy = closest.y - gate.center.y;
      const distance = Math.hypot(dx, dy);
      const delta = distance - gate.radius;
      if (Math.abs(delta) < gateSeparation) {
        const normal =
          delta < 0
            ? normalize({ x: -dx, y: -dy }, { x: 0, y: 1 })
            : normalize({ x: dx, y: dy }, { x: 0, y: 1 });
        contacts.push({
          normal,
          penetration: gateSeparation - Math.abs(delta),
          gateId: gate.id,
        });
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
  collidedGateIds: ReadonlySet<string>;
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
  const collidedGateIds = new Set<string>();

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
        if (contact.gateId !== undefined) {
          collidedGateIds.add(contact.gateId);
        }
      }
    }
  }

  return { position, velocity, angle, maxImpactSpeed, collidedGateIds };
}

export function nearestWallDistance(
  field: Field,
  position: Vec2,
  angle: number,
): number {
  const capsule = capsuleEndpoints(position, angle);
  const searchRadius = SENSOR_RANGE + CAPSULE_EXTENT + WALL_RADIUS + 1;
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

  return nearest <= SENSOR_RANGE ? nearest : SENSOR_RANGE;
}

export interface GateObservation {
  distance: number;
  angle: number;
}

export function nearestGateObservation(
  field: Field,
  position: Vec2,
  passedGateIds: ReadonlySet<string>,
): GateObservation {
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestGate: Gate | undefined;

  for (const chunk of field.chunksInView(position, SENSOR_RANGE)) {
    for (const gate of chunk.gates) {
      if (passedGateIds.has(gate.id)) {
        continue;
      }
      const distance = Math.hypot(
        gate.center.x - position.x,
        gate.center.y - position.y,
      );
      if (distance <= SENSOR_RANGE && distance < nearestDistance) {
        nearestDistance = distance;
        nearestGate = gate;
      }
    }
  }

  if (!nearestGate) {
    return { distance: -1, angle: 0 };
  }

  return {
    distance: nearestDistance,
    angle: Math.atan2(nearestGate.center.y - position.y, nearestGate.center.x - position.x),
  };
}

function gateCrossed(
  gate: Gate,
  start: Vec2,
  end: Vec2,
): boolean {
  const startOffset = {
    x: start.x - gate.center.x,
    y: start.y - gate.center.y,
  };
  const endOffset = {
    x: end.x - gate.center.x,
    y: end.y - gate.center.y,
  };
  const startDistance = dot(startOffset, gate.normal);
  const endDistance = dot(endOffset, gate.normal);
  const crossed =
    (startDistance < 0 && endDistance >= 0) ||
    (startDistance > 0 && endDistance <= 0);
  if (!crossed) {
    return false;
  }

  const denominator = startDistance - endDistance;
  const t = Math.abs(denominator) < 1e-12 ? 0 : startDistance / denominator;
  const crossing = {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
  const offset = {
    x: crossing.x - gate.center.x,
    y: crossing.y - gate.center.y,
  };
  const alongNormal = dot(offset, gate.normal);
  const lateral = Math.hypot(
    offset.x - gate.normal.x * alongNormal,
    offset.y - gate.normal.y * alongNormal,
  );
  return lateral <= gate.radius + 1e-9;
}

export function findGateCrossings(
  field: Field,
  start: Vec2,
  end: Vec2,
  passedGateIds: ReadonlySet<string>,
  collidedGateIds: ReadonlySet<string>,
): Gate[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const pathLength = Math.hypot(dx, dy);
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const searchRadius = pathLength / 2 + COLLISION_QUERY_RADIUS;
  const gates: Gate[] = [];
  const seen = new Set<string>();

  for (const chunk of field.chunksInView(midpoint, searchRadius)) {
    for (const gate of chunk.gates) {
      if (passedGateIds.has(gate.id) || collidedGateIds.has(gate.id) || seen.has(gate.id)) {
        continue;
      }
      if (gateCrossed(gate, start, end)) {
        gates.push(gate);
        seen.add(gate.id);
      }
    }
  }

  return gates;
}
