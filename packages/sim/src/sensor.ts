import {
  EYE_SENSOR_RAY_COUNT,
  EYE_SENSOR_VIEW_DEFAULT,
  EYE_SENSOR_VIEW_MAX,
  EYE_SENSOR_VIEW_MIN,
  PLANET_RADIUS,
  SHIP_CAPSULE_HALF_LENGTH,
  SHIP_RADIUS,
  TUNNEL_SAMPLE_STEP,
  WALL_RADIUS,
} from "./constants";
import type {
  EyeSensorReading,
  Field,
  Planet,
  SpaceWorld,
  TunnelWorld,
  Vec2,
  World,
} from "./types";

const DEGREE_IN_RADIANS = Math.PI / 180;
const PARALLEL_EPSILON = 1e-12;
const SEGMENT_PARAMETER_EPSILON = 1e-9;
const CAPSULE_EXTENT = SHIP_CAPSULE_HALF_LENGTH + SHIP_RADIUS;

export function clampEyeSensorRadius(radius: number): number {
  if (!Number.isFinite(radius)) {
    return EYE_SENSOR_VIEW_DEFAULT;
  }
  return Math.min(EYE_SENSOR_VIEW_MAX, Math.max(EYE_SENSOR_VIEW_MIN, radius));
}

function isSpaceWorld(target: Field | World): target is SpaceWorld {
  return "kind" in target && target.kind === "space";
}

function isTunnelWorld(target: Field | World): target is TunnelWorld {
  return "kind" in target && target.kind === "tunnel";
}

function rayCircleDistance(
  origin: Vec2,
  directionX: number,
  directionY: number,
  center: Vec2,
  circleRadius: number,
  maximumDistance: number,
): number | undefined {
  const offsetX = origin.x - center.x;
  const offsetY = origin.y - center.y;
  const projection = offsetX * directionX + offsetY * directionY;
  const constant =
    offsetX * offsetX + offsetY * offsetY - circleRadius * circleRadius;

  if (constant <= 0) {
    return 0;
  }

  const discriminant = projection * projection - constant;
  if (discriminant < 0) {
    return undefined;
  }

  const distance = -projection - Math.sqrt(discriminant);
  if (!(distance >= 0 && distance <= maximumDistance)) {
    return undefined;
  }

  return distance;
}

function raySegmentDistance(
  origin: Vec2,
  directionX: number,
  directionY: number,
  segmentStart: Vec2,
  segmentEnd: Vec2,
  maximumCenterlineDistance: number,
): number | undefined {
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentY = segmentEnd.y - segmentStart.y;
  const denominator = directionX * segmentY - directionY * segmentX;
  if (Math.abs(denominator) < PARALLEL_EPSILON) {
    return undefined;
  }

  const offsetX = segmentStart.x - origin.x;
  const offsetY = segmentStart.y - origin.y;
  const distance = (offsetX * segmentY - offsetY * segmentX) / denominator;
  const segmentParameter =
    (offsetX * directionY - offsetY * directionX) / denominator;

  if (
    !(distance >= 0 && distance <= maximumCenterlineDistance) ||
    segmentParameter < -SEGMENT_PARAMETER_EPSILON ||
    segmentParameter > 1 + SEGMENT_PARAMETER_EPSILON
  ) {
    return undefined;
  }

  return distance;
}

export function scanEyeSensor(
  target: Field | World,
  origin: Vec2,
  heading: number,
  radius: number,
  tick: number,
): EyeSensorReading {
  const maximumCenterlineDistance = radius + WALL_RADIUS;
  let field: Field | undefined;
  let planets: readonly Planet[] | undefined;
  if (isSpaceWorld(target)) {
    planets = target.planetsInView(
      origin,
      radius + CAPSULE_EXTENT + PLANET_RADIUS + 1,
    );
  } else {
    field = isTunnelWorld(target) ? target.field : target;
  }
  const chunks = field
    ? field.chunksInView(
        origin,
        maximumCenterlineDistance + CAPSULE_EXTENT + TUNNEL_SAMPLE_STEP,
      )
    : [];
  const cosHeading = Math.cos(heading) * SHIP_CAPSULE_HALF_LENGTH;
  const sinHeading = Math.sin(heading) * SHIP_CAPSULE_HALF_LENGTH;
  const capsuleStart = {
    x: origin.x - cosHeading,
    y: origin.y - sinHeading,
  };
  const capsuleEnd = {
    x: origin.x + cosHeading,
    y: origin.y + sinHeading,
  };
  const distances: number[] = [];

  for (let rayIndex = 0; rayIndex < EYE_SENSOR_RAY_COUNT; rayIndex += 1) {
    const worldAngle = rayIndex * DEGREE_IN_RADIANS;
    const directionX = Math.cos(worldAngle);
    const directionY = Math.sin(worldAngle);

    // The hull rim along a world direction is the capsule axis support point
    // advanced by the collision radius.
    const startProjection =
      capsuleStart.x * directionX + capsuleStart.y * directionY;
    const endProjection = capsuleEnd.x * directionX + capsuleEnd.y * directionY;
    const support =
      endProjection >= startProjection ? capsuleEnd : capsuleStart;
    const rayOrigin = {
      x: support.x + directionX * SHIP_RADIUS,
      y: support.y + directionY * SHIP_RADIUS,
    };

    let nearestSurfaceDistance = radius;
    if (planets) {
      for (const planet of planets) {
        const surfaceDistance = rayCircleDistance(
          rayOrigin,
          directionX,
          directionY,
          planet.position,
          planet.radius,
          radius,
        );
        if (
          surfaceDistance !== undefined &&
          surfaceDistance < nearestSurfaceDistance
        ) {
          nearestSurfaceDistance = surfaceDistance;
        }
      }
    } else {
      for (const chunk of chunks) {
        for (const wall of chunk.walls) {
          for (let index = 0; index + 1 < wall.points.length; index += 1) {
            const centerlineDistance = raySegmentDistance(
              rayOrigin,
              directionX,
              directionY,
              wall.points[index]!,
              wall.points[index + 1]!,
              maximumCenterlineDistance,
            );
            if (centerlineDistance === undefined) {
              continue;
            }

            // Walls are stored as centerlines; the surface lies WALL_RADIUS
            // closer along the ray, which is exact only for perpendicular hits.
            const surfaceDistance = Math.max(
              0,
              Math.min(radius, centerlineDistance - WALL_RADIUS),
            );
            if (surfaceDistance < nearestSurfaceDistance) {
              nearestSurfaceDistance = surfaceDistance;
            }
          }
        }
      }
    }

    distances.push(nearestSurfaceDistance);
  }

  const frozenOrigin = { x: origin.x, y: origin.y };
  Object.freeze(frozenOrigin);
  Object.freeze(distances);

  return {
    radius,
    tick,
    origin: frozenOrigin,
    heading,
    distances,
  };
}
