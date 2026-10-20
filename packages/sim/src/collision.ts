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
const CONTACT_ITERATIONS = 8;
const PENETRATION_SLOP = 0.001;
const DISTANCE_EPSILON = 1e-9;
const CAPSULE_EXTENT = SHIP_CAPSULE_HALF_LENGTH + SHIP_RADIUS;
const COLLISION_QUERY_RADIUS =
  CAPSULE_EXTENT + WALL_RADIUS + TUNNEL_SAMPLE_STEP + 2;

interface Contact {
  normal: Vec2;
  penetration: number;
  impactSpeed: number;
}

interface Candidate {
  normal: Vec2;
  distance: number;
  impactSpeed: number;
}

function pointKey(point: Vec2): string {
  return `${point.x},${point.y}`;
}

function findRoot(parent: number[], index: number): number {
  let root = index;
  while (parent[root] !== root) {
    root = parent[root]!;
  }
  while (parent[index] !== index) {
    const next = parent[index]!;
    parent[index] = root;
    index = next;
  }
  return root;
}

function union(parent: number[], first: number, second: number): void {
  const firstRoot = findRoot(parent, first);
  const secondRoot = findRoot(parent, second);
  if (firstRoot !== secondRoot) {
    parent[secondRoot] = firstRoot;
  }
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

function wallNormal(
  distance: number,
  capsulePoint: Vec2,
  wallPoint: Vec2,
  wallStart: Vec2,
  wallEnd: Vec2,
  position: Vec2,
  velocity: Vec2,
): Vec2 {
  if (distance > DISTANCE_EPSILON) {
    return {
      x: (capsulePoint.x - wallPoint.x) / distance,
      y: (capsulePoint.y - wallPoint.y) / distance,
    };
  }

  let normal = normalize({
    x: -(wallEnd.y - wallStart.y),
    y: wallEnd.x - wallStart.x,
  });
  const midpoint = {
    x: (wallStart.x + wallEnd.x) / 2,
    y: (wallStart.y + wallEnd.y) / 2,
  };
  const side = dot(normal, {
    x: position.x - midpoint.x,
    y: position.y - midpoint.y,
  });
  if (side < 0 || (side === 0 && dot(normal, velocity) > 0)) {
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
  const wallSeparation = SHIP_RADIUS + WALL_RADIUS;
  const candidates: Candidate[] = [];
  const parent: number[] = [];
  const endpointOwner = new Map<string, number>();

  const registerEndpoint = (key: string, index: number): void => {
    const owner = endpointOwner.get(key);
    if (owner === undefined) {
      endpointOwner.set(key, index);
    } else {
      union(parent, owner, index);
    }
  };

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
        if (closest.distance >= wallSeparation) {
          continue;
        }

        const normal = wallNormal(
          closest.distance,
          closest.pointA,
          closest.pointB,
          first,
          second,
          position,
          velocity,
        );
        const normalSpeed = dot(velocity, normal);
        const candidateIndex = candidates.length;
        candidates.push({
          normal,
          distance: closest.distance,
          impactSpeed: normalSpeed < 0 ? -normalSpeed : 0,
        });
        parent.push(candidateIndex);
        registerEndpoint(pointKey(first), candidateIndex);
        registerEndpoint(pointKey(second), candidateIndex);
      }
    }
  }

  // Wall samples are separate segments sharing exact endpoints. Grouping them
  // by endpoint keeps a smooth seam from acting like a sharp corner contact.
  const nearestByComponent = new Map<number, Candidate>();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const root = findRoot(parent, index);
    const current = nearestByComponent.get(root);
    if (current === undefined || candidate.distance < current.distance) {
      nearestByComponent.set(root, candidate);
    }
  }

  return [...nearestByComponent.values()].map((candidate) => ({
    normal: candidate.normal,
    penetration: wallSeparation - candidate.distance,
    impactSpeed: candidate.impactSpeed,
  }));
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
  const linearTravel =
    Math.hypot(initialVelocity.x, initialVelocity.y) * dt;
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

      let deepest = contacts[0]!;
      for (const contact of contacts) {
        if (contact.impactSpeed > maxImpactSpeed) {
          maxImpactSpeed = contact.impactSpeed;
        }
        if (contact.penetration > deepest.penetration) {
          deepest = contact;
        }
      }

      const normalVelocity = dot(velocity, deepest.normal);
      if (normalVelocity < 0) {
        const impulse = (1 + BOUNCE_RESTITUTION) * normalVelocity;
        velocity = {
          x: velocity.x - impulse * deepest.normal.x,
          y: velocity.y - impulse * deepest.normal.y,
        };
      }
      position.x +=
        deepest.normal.x * (deepest.penetration + PENETRATION_SLOP);
      position.y +=
        deepest.normal.y * (deepest.penetration + PENETRATION_SLOP);
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
