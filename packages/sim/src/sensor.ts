import {
  EYE_SENSOR_RAY_COUNT,
  EYE_SENSOR_VIEW_DEFAULT,
  EYE_SENSOR_VIEW_MAX,
  EYE_SENSOR_VIEW_MIN,
  SHIP_CAPSULE_HALF_LENGTH,
  SHIP_RADIUS,
  TUNNEL_SAMPLE_STEP,
  WALL_RADIUS,
} from "./constants";
import type { EyeSensorReading, Field, Vec2 } from "./types";

const RAY_STEP_RADIANS = Math.PI / 180;
const INTERSECTION_EPSILON = 1e-12;
const CAPSULE_EXTENT = SHIP_CAPSULE_HALF_LENGTH + SHIP_RADIUS;

export function clampEyeSensorRadius(radius: number): number {
  if (!Number.isFinite(radius)) {
    return EYE_SENSOR_VIEW_DEFAULT;
  }
  return Math.min(EYE_SENSOR_VIEW_MAX, Math.max(EYE_SENSOR_VIEW_MIN, radius));
}

function rimPoint(
  origin: Vec2,
  angle: number,
  directionX: number,
  directionY: number,
): Vec2 {
  const capsuleX = Math.cos(angle) * SHIP_CAPSULE_HALF_LENGTH;
  const capsuleY = Math.sin(angle) * SHIP_CAPSULE_HALF_LENGTH;
  const start = { x: origin.x - capsuleX, y: origin.y - capsuleY };
  const end = { x: origin.x + capsuleX, y: origin.y + capsuleY };
  const startProjection = start.x * directionX + start.y * directionY;
  const endProjection = end.x * directionX + end.y * directionY;
  const support = endProjection >= startProjection ? end : start;

  return {
    x: support.x + directionX * SHIP_RADIUS,
    y: support.y + directionY * SHIP_RADIUS,
  };
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
  if (Math.abs(denominator) < INTERSECTION_EPSILON) {
    return undefined;
  }

  const offsetX = segmentStart.x - origin.x;
  const offsetY = segmentStart.y - origin.y;
  const distance = (offsetX * segmentY - offsetY * segmentX) / denominator;
  const segmentParameter =
    (offsetX * directionY - offsetY * directionX) / denominator;

  if (
    distance < 0 ||
    distance > maximumCenterlineDistance ||
    segmentParameter < -1e-9 ||
    segmentParameter > 1 + 1e-9
  ) {
    return undefined;
  }

  return distance;
}

export function scanEyeSensor(
  field: Field,
  origin: Vec2,
  heading: number,
  radius: number,
  tick: number,
): EyeSensorReading {
  const maximumCenterlineDistance = radius + WALL_RADIUS;
  const chunks = field.chunksInView(
    origin,
    maximumCenterlineDistance + CAPSULE_EXTENT + TUNNEL_SAMPLE_STEP,
  );
  const distances: number[] = [];

  for (let rayIndex = 0; rayIndex < EYE_SENSOR_RAY_COUNT; rayIndex += 1) {
    const angle = rayIndex * RAY_STEP_RADIANS;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const rayOrigin = rimPoint(origin, heading, directionX, directionY);
    let nearestSurfaceDistance = radius;

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

          // Wall end caps are approximated by the centerline offset.
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

    distances.push(nearestSurfaceDistance);
  }

  const originCopy = { x: origin.x, y: origin.y };
  Object.freeze(originCopy);
  Object.freeze(distances);

  return {
    radius,
    tick,
    origin: originCopy,
    heading,
    distances,
  };
}
