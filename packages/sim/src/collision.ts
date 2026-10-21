import {
  BOUNCE_RESTITUTION,
  PLANET_RADIUS,
  SHIP_CAPSULE_HALF_LENGTH,
  SHIP_RADIUS,
  TUNNEL_SAMPLE_STEP,
  WALL_RADIUS,
  WALL_SENSOR_RANGE,
} from "./constants";
import {
  closestPointOnSegment,
  closestPointsBetweenSegments,
  dot,
  normalize,
} from "./geometry";
import { rotate } from "./physics";
import type {
  Field,
  Planet,
  SpaceWorld,
  TunnelWorld,
  Vec2,
  World,
} from "./types";

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

interface PlanetContact {
  normal: Vec2;
  penetration: number;
  impactSpeed: number;
  planetVelocity: Vec2;
}

function isSpaceWorld(target: Field | World): target is SpaceWorld {
  return "kind" in target && target.kind === "space";
}

function isTunnelWorld(target: Field | World): target is TunnelWorld {
  return "kind" in target && target.kind === "tunnel";
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

function detectPlanetContacts(
  planets: readonly Planet[],
  position: Vec2,
  angle: number,
  velocity: Vec2,
): PlanetContact[] {
  const capsule = capsuleEndpoints(position, angle);
  const contacts: PlanetContact[] = [];

  for (const planet of planets) {
    const closest = closestPointOnSegment(
      planet.position,
      capsule.start,
      capsule.end,
    );
    const dx = closest.x - planet.position.x;
    const dy = closest.y - planet.position.y;
    const distance = Math.hypot(dx, dy);
    const separation = SHIP_RADIUS + planet.radius;
    if (distance >= separation) {
      continue;
    }

    const normal =
      distance > DISTANCE_EPSILON
        ? { x: dx / distance, y: dy / distance }
        : normalize(
            {
              x: position.x - planet.position.x,
              y: position.y - planet.position.y,
            },
            { x: 1, y: 0 },
          );
    const relativeVelocity = {
      x: velocity.x - planet.velocity.x,
      y: velocity.y - planet.velocity.y,
    };
    const normalSpeed = dot(relativeVelocity, normal);

    contacts.push({
      normal,
      penetration: separation - distance,
      impactSpeed: normalSpeed < 0 ? -normalSpeed : 0,
      planetVelocity: planet.velocity,
    });
  }

  return contacts;
}

export interface AdvanceResult {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  maxImpactSpeed: number;
}

function advanceWithWallCollisions(
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

export function advanceWithPlanetCollisions(
  planets: readonly Planet[],
  initialPosition: Vec2,
  initialVelocity: Vec2,
  initialAngle: number,
  angularVelocity: number,
  dt: number,
): AdvanceResult {
  let maximumRelativeSpeed = Math.hypot(
    initialVelocity.x,
    initialVelocity.y,
  );
  for (const planet of planets) {
    const relativeSpeed = Math.hypot(
      initialVelocity.x - planet.velocity.x,
      initialVelocity.y - planet.velocity.y,
    );
    if (relativeSpeed > maximumRelativeSpeed) {
      maximumRelativeSpeed = relativeSpeed;
    }
  }

  const linearTravel = maximumRelativeSpeed * dt;
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
      const contacts = detectPlanetContacts(planets, position, angle, velocity);
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

      const relativeVelocity = {
        x: velocity.x - deepest.planetVelocity.x,
        y: velocity.y - deepest.planetVelocity.y,
      };
      const normalVelocity = dot(relativeVelocity, deepest.normal);
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

export function advanceWithCollisions(
  target: Field | World,
  initialPosition: Vec2,
  initialVelocity: Vec2,
  initialAngle: number,
  angularVelocity: number,
  dt: number,
): AdvanceResult {
  if (isSpaceWorld(target)) {
    const travel =
      Math.hypot(initialVelocity.x, initialVelocity.y) * dt +
      Math.abs(angularVelocity) * CAPSULE_EXTENT * dt;
    const planets = target.planetsInView(
      initialPosition,
      travel + CAPSULE_EXTENT + PLANET_RADIUS + 1,
    );
    return advanceWithPlanetCollisions(
      planets,
      initialPosition,
      initialVelocity,
      initialAngle,
      angularVelocity,
      dt,
    );
  }

  return advanceWithWallCollisions(
    isTunnelWorld(target) ? target.field : target,
    initialPosition,
    initialVelocity,
    initialAngle,
    angularVelocity,
    dt,
  );
}

export function nearestPlanetDistance(
  planets: readonly Planet[],
  position: Vec2,
  angle: number,
): number {
  const capsule = capsuleEndpoints(position, angle);
  let nearest = Number.POSITIVE_INFINITY;

  for (const planet of planets) {
    const closest = closestPointOnSegment(
      planet.position,
      capsule.start,
      capsule.end,
    );
    const distance =
      Math.hypot(
        closest.x - planet.position.x,
        closest.y - planet.position.y,
      ) -
      SHIP_RADIUS -
      planet.radius;
    if (distance < nearest) {
      nearest = distance;
    }
  }

  return nearest <= WALL_SENSOR_RANGE ? nearest : WALL_SENSOR_RANGE;
}

export function nearestWallDistance(
  target: Field | World,
  position: Vec2,
  angle: number,
): number {
  if (isSpaceWorld(target)) {
    return nearestPlanetDistance(
      target.planetsInView(
        position,
        WALL_SENSOR_RANGE + CAPSULE_EXTENT + PLANET_RADIUS + 1,
      ),
      position,
      angle,
    );
  }

  const field = isTunnelWorld(target) ? target.field : target;
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
