import type { Vec2 } from "./types";

export const GEOMETRY_EPSILON = 1e-9;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function normalize(vector: Vec2, fallback: Vec2 = { x: 0, y: 1 }): Vec2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length < GEOMETRY_EPSILON) {
    return { x: fallback.x, y: fallback.y };
  }
  return { x: vector.x / length, y: vector.y / length };
}

export function closestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < GEOMETRY_EPSILON) {
    return { x: start.x, y: start.y };
  }
  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1,
  );
  return { x: start.x + dx * t, y: start.y + dy * t };
}

export function pointToSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const closest = closestPointOnSegment(point, start, end);
  return Math.hypot(point.x - closest.x, point.y - closest.y);
}

export interface ClosestSegmentPoints {
  distance: number;
  pointA: Vec2;
  pointB: Vec2;
}

export function closestPointsBetweenSegments(
  aStart: Vec2,
  aEnd: Vec2,
  bStart: Vec2,
  bEnd: Vec2,
): ClosestSegmentPoints {
  const d1 = subtract(aEnd, aStart);
  const d2 = subtract(bEnd, bStart);
  const r = subtract(aStart, bStart);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);

  let s = 0;
  let t = 0;

  if (a <= GEOMETRY_EPSILON && e <= GEOMETRY_EPSILON) {
    s = 0;
    t = 0;
  } else if (a <= GEOMETRY_EPSILON) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= GEOMETRY_EPSILON) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denominator = a * e - b * b;
      if (Math.abs(denominator) > GEOMETRY_EPSILON) {
        s = clamp((b * f - c * e) / denominator, 0, 1);
      } else {
        s = 0;
      }
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }

  const pointA = { x: aStart.x + d1.x * s, y: aStart.y + d1.y * s };
  const pointB = { x: bStart.x + d2.x * t, y: bStart.y + d2.y * t };
  return {
    distance: Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y),
    pointA,
    pointB,
  };
}
