import {
  SENSOR_RAY_COUNT,
  SENSOR_VIEW_DEFAULT,
  SENSOR_VIEW_MAX,
  SENSOR_VIEW_MIN,
  TUNNEL_SAMPLE_STEP,
  WALL_RADIUS,
} from "./constants";
import type { Field, SensorReading, Vec2 } from "./types";

const RAY_STEP_RADIANS = Math.PI / 180;
const INTERSECTION_EPSILON = 1e-12;

export function clampSensorRadius(radius: number): number {
  if (!Number.isFinite(radius)) {
    return SENSOR_VIEW_DEFAULT;
  }
  return Math.min(SENSOR_VIEW_MAX, Math.max(SENSOR_VIEW_MIN, radius));
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

export function scanSensor(
  field: Field,
  origin: Vec2,
  heading: number,
  radius: number,
  tick: number,
): SensorReading {
  const maximumCenterlineDistance = radius + WALL_RADIUS;
  const chunks = field.chunksInView(
    origin,
    maximumCenterlineDistance + TUNNEL_SAMPLE_STEP,
  );
  const distances: number[] = [];

  for (let rayIndex = 0; rayIndex < SENSOR_RAY_COUNT; rayIndex += 1) {
    const angle = heading + rayIndex * RAY_STEP_RADIANS;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    let nearestSurfaceDistance = radius;

    for (const chunk of chunks) {
      for (const wall of chunk.walls) {
        for (let index = 0; index + 1 < wall.points.length; index += 1) {
          const centerlineDistance = raySegmentDistance(
            origin,
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
