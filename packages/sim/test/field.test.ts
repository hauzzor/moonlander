import { describe, expect, it } from "vitest";
import type { Field, FieldChunk, Vec2 } from "../src/index";
import { sim } from "./helpers";

const BENCHMARK_SEEDS = [1, 7, 42, 1234, 2026, 5678, 99991, 314159] as const;
const COVERAGE_HORIZON = 20_000;
const CENTER_SAMPLE_STEP = 1;
const EIGHTY_DEGREES = (80 * Math.PI) / 180;
const NORMAL_OFFSET_TOLERANCE = 0.5;
const MAX_REPORTED_FAILURES = 25;
const SELF_INTERSECTION_HORIZON = 2_000;
const SELF_INTERSECTION_CELL_SIZE = 32;
const SEGMENT_EPSILON = 1e-9;
const CURVATURE_SAMPLE_STEP = 1;
const CURVATURE_FINITE_DIFFERENCE = 0.5;
// A normal offset of half-width w stays simple while w * |curvature| < 1.
const CURVATURE_WIDTH_LIMIT = 1;
const QUERY_ORDER_CHUNK_X = { min: -2, max: 26 } as const;
const QUERY_ORDER_CHUNK_Y = { min: -4, max: 6 } as const;
const STRAIGHT_SAMPLE_X = [
  -1_000_000, -100_000, -10_000, -1_000, -200, -120, -80, -1, 0, 60,
  119.999_999, 120,
] as const;

interface WallSegment {
  chunk: FieldChunk;
  wallId: string;
  start: Vec2;
  end: Vec2;
}

interface IndexedWallSegment {
  segment: WallSegment;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface CenterSample {
  x: number;
  centerX: number;
  y: number;
  heading: number;
  halfWidth: number;
}

interface WallWindow {
  label: string;
  xMin: number;
  xMax: number;
  steepX: number;
}

function report(failures: string[], message: string): void {
  if (failures.length < MAX_REPORTED_FAILURES) {
    failures.push(message);
  }
}

function sampleCenterline(
  field: Field,
  start: number,
  end: number,
  step: number,
): CenterSample[] {
  const samples: CenterSample[] = [];
  for (let x = start; x <= end + step * 1e-9; x += step) {
    const center = field.tunnel.centerAt(x);
    samples.push({
      x,
      centerX: center.x,
      y: center.y,
      heading: field.tunnel.headingAt(x),
      halfWidth: field.tunnel.halfWidthAt(x),
    });
  }
  return samples;
}

function steepestSampleX(field: Field): number {
  const start = sim.TUNNEL_START_STRAIGHT;
  const end = start + COVERAGE_HORIZON;
  let bestX = start;
  let bestHeading = -1;
  for (let x = start; x <= end; x += CENTER_SAMPLE_STEP) {
    const heading = Math.abs(field.tunnel.headingAt(x));
    if (heading > bestHeading) {
      bestHeading = heading;
      bestX = x;
    }
  }
  return bestX;
}

function collectWallSegments(
  field: Field,
  xMin: number,
  xMax: number,
): WallSegment[] {
  let minCenterY = Infinity;
  let maxCenterY = -Infinity;
  for (let x = xMin; x <= xMax; x += 1) {
    const center = field.tunnel.centerAt(x);
    minCenterY = Math.min(minCenterY, center.y);
    maxCenterY = Math.max(maxCenterY, center.y);
  }

  const margin = sim.TUNNEL_MAX_HALF_WIDTH + sim.TUNNEL_SAMPLE_STEP;
  const cxMin = Math.floor(xMin / field.chunkSize) - 1;
  const cxMax = Math.floor(xMax / field.chunkSize) + 1;
  const cyMin = Math.floor((minCenterY - margin) / field.chunkSize) - 1;
  const cyMax = Math.floor((maxCenterY + margin) / field.chunkSize) + 1;
  const result: WallSegment[] = [];

  for (let cy = cyMin; cy <= cyMax; cy += 1) {
    for (let cx = cxMin; cx <= cxMax; cx += 1) {
      const chunk = field.getChunk(cx, cy);
      for (const wall of chunk.walls) {
        for (let index = 0; index + 1 < wall.points.length; index += 1) {
          const start = wall.points[index]!;
          const end = wall.points[index + 1]!;
          const midpointX = (start.x + end.x) / 2;
          if (midpointX < xMin || midpointX > xMax) {
            continue;
          }
          result.push({ chunk, wallId: wall.id, start, end });
        }
      }
    }
  }

  return result;
}

function wallWindows(field: Field): WallWindow[] {
  const steepX = steepestSampleX(field);
  return [
    {
      label: "straight",
      xMin: -200,
      xMax: sim.TUNNEL_START_STRAIGHT,
      steepX,
    },
    {
      label: `steep@${steepX}`,
      xMin: Math.max(sim.TUNNEL_START_STRAIGHT + 1, steepX - 300),
      xMax: steepX + 300,
      steepX,
    },
  ];
}

function segmentKey(segment: WallSegment): string {
  const start = `${segment.start.x}:${segment.start.y}`;
  const end = `${segment.end.x}:${segment.end.y}`;
  return start < end ? `${start}|${end}` : `${end}|${start}`;
}

function pointKey(point: Vec2): string {
  return `${Math.round(point.x * 1e6) / 1e6}:${Math.round(point.y * 1e6) / 1e6}`;
}

function segmentLabel(segment: WallSegment): string {
  return `${segment.wallId} (${segment.start.x},${segment.start.y})->(${segment.end.x},${segment.end.y})`;
}

function orientation(start: Vec2, end: Vec2, point: Vec2): number {
  return (
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x)
  );
}

function boundingBoxesOverlap(
  first: IndexedWallSegment,
  second: IndexedWallSegment,
): boolean {
  return (
    first.minX <= second.maxX + SEGMENT_EPSILON &&
    second.minX <= first.maxX + SEGMENT_EPSILON &&
    first.minY <= second.maxY + SEGMENT_EPSILON &&
    second.minY <= first.maxY + SEGMENT_EPSILON
  );
}

function sharesEndpoint(first: WallSegment, second: WallSegment): boolean {
  const firstStart = pointKey(first.start);
  const firstEnd = pointKey(first.end);
  const secondStart = pointKey(second.start);
  const secondEnd = pointKey(second.end);
  return (
    firstStart === secondStart ||
    firstStart === secondEnd ||
    firstEnd === secondStart ||
    firstEnd === secondEnd
  );
}

function segmentsProperlyIntersect(first: WallSegment, second: WallSegment): boolean {
  const firstStart = orientation(first.start, first.end, second.start);
  const firstEnd = orientation(first.start, first.end, second.end);
  const secondStart = orientation(second.start, second.end, first.start);
  const secondEnd = orientation(second.start, second.end, first.end);
  return (
    ((firstStart > SEGMENT_EPSILON && firstEnd < -SEGMENT_EPSILON) ||
      (firstStart < -SEGMENT_EPSILON && firstEnd > SEGMENT_EPSILON)) &&
    ((secondStart > SEGMENT_EPSILON && secondEnd < -SEGMENT_EPSILON) ||
      (secondStart < -SEGMENT_EPSILON && secondEnd > SEGMENT_EPSILON))
  );
}

function segmentsOverlapCollinearly(first: WallSegment, second: WallSegment): boolean {
  const firstStart = orientation(first.start, first.end, second.start);
  const firstEnd = orientation(first.start, first.end, second.end);
  const secondStart = orientation(second.start, second.end, first.start);
  const secondEnd = orientation(second.start, second.end, first.end);
  if (
    Math.abs(firstStart) > SEGMENT_EPSILON ||
    Math.abs(firstEnd) > SEGMENT_EPSILON ||
    Math.abs(secondStart) > SEGMENT_EPSILON ||
    Math.abs(secondEnd) > SEGMENT_EPSILON
  ) {
    return false;
  }

  const useX =
    Math.abs(first.end.x - first.start.x) >=
    Math.abs(first.end.y - first.start.y);
  const firstLow = useX
    ? Math.min(first.start.x, first.end.x)
    : Math.min(first.start.y, first.end.y);
  const firstHigh = useX
    ? Math.max(first.start.x, first.end.x)
    : Math.max(first.start.y, first.end.y);
  const secondLow = useX
    ? Math.min(second.start.x, second.end.x)
    : Math.min(second.start.y, second.end.y);
  const secondHigh = useX
    ? Math.max(second.start.x, second.end.x)
    : Math.max(second.start.y, second.end.y);
  return Math.min(firstHigh, secondHigh) - Math.max(firstLow, secondLow) > SEGMENT_EPSILON;
}

function findSelfIntersections(
  segments: readonly WallSegment[],
  limit: number,
): ReadonlyArray<readonly [WallSegment, WallSegment]> {
  const records: IndexedWallSegment[] = segments.map((segment) => ({
    segment,
    minX: Math.min(segment.start.x, segment.end.x),
    maxX: Math.max(segment.start.x, segment.end.x),
    minY: Math.min(segment.start.y, segment.end.y),
    maxY: Math.max(segment.start.y, segment.end.y),
  }));
  const buckets = new Map<string, number[]>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const firstX = Math.floor(record.minX / SELF_INTERSECTION_CELL_SIZE);
    const lastX = Math.floor(record.maxX / SELF_INTERSECTION_CELL_SIZE);
    const firstY = Math.floor(record.minY / SELF_INTERSECTION_CELL_SIZE);
    const lastY = Math.floor(record.maxY / SELF_INTERSECTION_CELL_SIZE);
    for (let cellX = firstX; cellX <= lastX; cellX += 1) {
      for (let cellY = firstY; cellY <= lastY; cellY += 1) {
        const key = `${cellX},${cellY}`;
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.push(index);
        } else {
          buckets.set(key, [index]);
        }
      }
    }
  }

  const intersections: Array<readonly [WallSegment, WallSegment]> = [];
  const compared = new Set<string>();
  for (const bucket of buckets.values()) {
    for (let first = 0; first < bucket.length; first += 1) {
      const firstIndex = bucket[first]!;
      for (let second = first + 1; second < bucket.length; second += 1) {
        const secondIndex = bucket[second]!;
        const low = Math.min(firstIndex, secondIndex);
        const high = Math.max(firstIndex, secondIndex);
        const pairKey = `${low}:${high}`;
        if (compared.has(pairKey)) {
          continue;
        }
        compared.add(pairKey);

        const firstRecord = records[low]!;
        const secondRecord = records[high]!;
        if (sharesEndpoint(firstRecord.segment, secondRecord.segment)) {
          continue;
        }
        if (!boundingBoxesOverlap(firstRecord, secondRecord)) {
          continue;
        }
        if (
          segmentsProperlyIntersect(firstRecord.segment, secondRecord.segment) ||
          segmentsOverlapCollinearly(firstRecord.segment, secondRecord.segment)
        ) {
          intersections.push([firstRecord.segment, secondRecord.segment]);
          if (intersections.length >= limit) {
            return intersections;
          }
        }
      }
    }
  }

  return intersections;
}

function centerlineCurvature(field: Field, x: number): number {
  const left = field.tunnel.centerAt(x - CURVATURE_FINITE_DIFFERENCE);
  const right = field.tunnel.centerAt(x + CURVATURE_FINITE_DIFFERENCE);
  const chord = Math.hypot(right.x - left.x, right.y - left.y);
  if (!(Number.isFinite(chord) && chord > 0)) {
    return Infinity;
  }
  const headingDelta =
    field.tunnel.headingAt(x + CURVATURE_FINITE_DIFFERENCE) -
    field.tunnel.headingAt(x - CURVATURE_FINITE_DIFFERENCE);
  return Math.abs(headingDelta) / chord;
}

function uniquePoints(segments: readonly WallSegment[]): Vec2[] {
  const points = new Map<string, Vec2>();
  for (const segment of segments) {
    for (const point of [segment.start, segment.end]) {
      const key = pointKey(point);
      if (!points.has(key)) {
        points.set(key, point);
      }
    }
  }
  return [...points.values()].sort((a, b) => a.x - b.x || a.y - b.y);
}

function selectEvenly<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) {
    return [...items];
  }
  const result: T[] = [];
  const stride = (items.length - 1) / (count - 1);
  for (let index = 0; index < count; index += 1) {
    result.push(items[Math.round(index * stride)]!);
  }
  return result;
}

function offsetResidualAt(field: Field, point: Vec2, baseX: number): number {
  const center = field.tunnel.centerAt(baseX);
  const heading = field.tunnel.headingAt(baseX);
  const halfWidth = field.tunnel.halfWidthAt(baseX);
  const normal = { x: -Math.sin(heading), y: Math.cos(heading) };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const positive = Math.hypot(
    dx - halfWidth * normal.x,
    dy - halfWidth * normal.y,
  );
  const negative = Math.hypot(
    dx + halfWidth * normal.x,
    dy + halfWidth * normal.y,
  );
  return Math.min(positive, negative);
}

function nearestOffsetBase(
  field: Field,
  point: Vec2,
): { residual: number; baseX: number } {
  const searchRadius =
    sim.TUNNEL_MAX_HALF_WIDTH + sim.TUNNEL_SAMPLE_STEP + 8;
  const minX = point.x - searchRadius;
  const maxX = point.x + searchRadius;
  const coarseStep = 0.5;

  let bestX = point.x;
  let bestResidual = Infinity;
  for (let x = minX; x <= maxX; x += coarseStep) {
    const residual = offsetResidualAt(field, point, x);
    if (residual < bestResidual) {
      bestResidual = residual;
      bestX = x;
    }
  }

  let low = Math.max(minX, bestX - coarseStep);
  let high = Math.min(maxX, bestX + coarseStep);
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const first = low + (high - low) / 3;
    const second = high - (high - low) / 3;
    if (offsetResidualAt(field, point, first) < offsetResidualAt(field, point, second)) {
      high = second;
    } else {
      low = first;
    }
  }

  const baseX = (low + high) / 2;
  return { residual: offsetResidualAt(field, point, baseX), baseX };
}

function countElevationExtrema(
  samples: readonly CenterSample[],
  start: number,
  end: number,
): { maxima: number; minima: number } {
  let maxima = 0;
  let minima = 0;
  for (let index = 1; index + 1 < samples.length; index += 1) {
    const sample = samples[index]!;
    if (sample.x < start || sample.x >= end) {
      continue;
    }
    const previous = samples[index - 1]!;
    const next = samples[index + 1]!;
    if (sample.y > previous.y && sample.y > next.y) {
      maxima += 1;
    }
    if (sample.y < previous.y && sample.y < next.y) {
      minima += 1;
    }
  }
  return { maxima, minima };
}

function chunkOrder(a: FieldChunk, b: FieldChunk): number {
  return a.coord.y - b.coord.y || a.coord.x - b.coord.x;
}

describe("seeded endless tunnel field", () => {
  it("exposes the frozen tunnel contract and default field constants", () => {
    const field = sim.createField(41);

    expect(sim.FIELD_CHUNK_SIZE).toBe(80);
    expect(sim.TUNNEL_HALF_WIDTH).toBe(34);
    expect(sim.TUNNEL_CENTER_Y).toBe(60);
    expect(sim.TUNNEL_START_STRAIGHT).toBe(120);
    expect.soft(sim.TUNNEL_MIN_HALF_WIDTH).toBe(25);
    expect.soft(sim.TUNNEL_MAX_HALF_WIDTH).toBe(55);
    expect.soft(sim.TUNNEL_BEND_AMPLITUDE).toBe(150);
    expect.soft(sim.TUNNEL_MAX_CLIMB_ANGLE).toBe((85 * Math.PI) / 180);
    expect.soft(sim.TUNNEL_MAX_SLOPE).toBe(Math.tan(sim.TUNNEL_MAX_CLIMB_ANGLE));
    expect(sim.TUNNEL_SAMPLE_STEP).toBe(8);
    expect(field.seed).toBe(41);
    expect(field.chunkSize).toBe(sim.FIELD_CHUNK_SIZE);
    expect(field.tunnel.halfWidth).toBe(sim.TUNNEL_HALF_WIDTH);
    expect(typeof field.tunnel.halfWidthAt).toBe("function");
    for (const x of [-10000, -120, -8, 0, 80, 119.999, 120]) {
      expect(field.tunnel.halfWidthAt(x)).toBe(sim.TUNNEL_HALF_WIDTH);
    }
    for (const x of [128, 256, 1024, 4096, 10000, 20000]) {
      const halfWidth = field.tunnel.halfWidthAt(x);
      expect(Number.isFinite(halfWidth)).toBe(true);
      expect(halfWidth).toBeGreaterThanOrEqual(sim.TUNNEL_MIN_HALF_WIDTH);
      expect(halfWidth).toBeLessThanOrEqual(sim.TUNNEL_MAX_HALF_WIDTH);
    }
    expect(typeof field.tunnel.centerAt).toBe("function");
    expect(typeof field.tunnel.headingAt).toBe("function");
    expect(typeof field.getChunk).toBe("function");
    expect(typeof field.chunksInView).toBe("function");
  });

  it("keeps x <= 120 straight at y=60, heading 0, and 34 m half-width, including negative x", () => {
    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      for (const x of STRAIGHT_SAMPLE_X) {
        expect(field.tunnel.centerAt(x)).toEqual({ x, y: sim.TUNNEL_CENTER_Y });
        expect(field.tunnel.headingAt(x)).toBe(0);
        expect(field.tunnel.halfWidthAt(x)).toBe(sim.TUNNEL_HALF_WIDTH);
      }
    }
  });

  it("makes a smooth C1 transition at x=120 without a heading or center discontinuity", () => {
    const epsilon = 1e-4;
    const headingTolerance = 1e-3;
    const centerTolerance = 1e-3;
    const failures: string[] = [];

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      const boundary = sim.TUNNEL_START_STRAIGHT;
      const leftHeading = field.tunnel.headingAt(boundary - epsilon);
      const rightHeading = field.tunnel.headingAt(boundary + epsilon);
      const boundaryHeading = field.tunnel.headingAt(boundary);
      const boundaryCenter = field.tunnel.centerAt(boundary);
      const rightCenter = field.tunnel.centerAt(boundary + epsilon);

      if (Math.abs(leftHeading) > headingTolerance) {
        report(failures, `seed ${seed}: left heading at x=120 is ${leftHeading}`);
      }
      if (Math.abs(boundaryHeading) > headingTolerance) {
        report(failures, `seed ${seed}: heading at x=120 is ${boundaryHeading}`);
      }
      if (Math.abs(rightHeading) > headingTolerance) {
        report(failures, `seed ${seed}: heading at x=120+${epsilon} is ${rightHeading}`);
      }
      if (Math.abs(rightHeading - leftHeading) > headingTolerance) {
        report(
          failures,
          `seed ${seed}: heading jumps ${leftHeading} -> ${rightHeading} at x=120`,
        );
      }
      if (Math.abs(boundaryCenter.y - sim.TUNNEL_CENTER_Y) > 1e-12) {
        report(
          failures,
          `seed ${seed}: center y at x=120 is ${boundaryCenter.y}`,
        );
      }
      if (Math.abs(rightCenter.y - sim.TUNNEL_CENTER_Y) > centerTolerance) {
        report(
          failures,
          `seed ${seed}: center y at x=120+${epsilon} is ${rightCenter.y}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps every benchmark seed within 150 m of y=60 and at most 85 degrees", () => {
    const failures: string[] = [];
    const maximumHeading = sim.TUNNEL_MAX_CLIMB_ANGLE + 1e-9;
    const maximumOffset = sim.TUNNEL_BEND_AMPLITUDE + 1e-9;

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      const samples = sampleCenterline(
        field,
        sim.TUNNEL_START_STRAIGHT,
        sim.TUNNEL_START_STRAIGHT + COVERAGE_HORIZON,
        CENTER_SAMPLE_STEP,
      );

      if (samples.length === 0) {
        report(failures, `seed ${seed}: centerline sampling produced no samples`);
        continue;
      }

      for (const sample of samples) {
        if (
          !Number.isFinite(sample.centerX) ||
          !Number.isFinite(sample.y) ||
          !Number.isFinite(sample.heading)
        ) {
          report(
            failures,
            `seed ${seed}: non-finite centerline at x=${sample.x} centerX=${sample.centerX} y=${sample.y} heading=${sample.heading}`,
          );
          continue;
        }
        if (sample.centerX !== sample.x) {
          report(
            failures,
            `seed ${seed}: centerAt(${sample.x}).x=${sample.centerX} is not single-valued in x`,
          );
        }
        if (Math.abs(sample.y - sim.TUNNEL_CENTER_Y) > maximumOffset) {
          report(
            failures,
            `seed ${seed}: center y=${sample.y} at x=${sample.x} exceeds ${sim.TUNNEL_BEND_AMPLITUDE} m`,
          );
        }
        if (Math.abs(sample.heading) > maximumHeading) {
          report(
            failures,
            `seed ${seed}: heading=${sample.heading} at x=${sample.x} exceeds 85 degrees`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("contains a sampled heading of at least 80 degrees in every 1,000 m after the straight", () => {
    const failures: string[] = [];
    const start = sim.TUNNEL_START_STRAIGHT;

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      const samples = sampleCenterline(
        field,
        start,
        start + COVERAGE_HORIZON,
        CENTER_SAMPLE_STEP,
      );

      for (let offset = 0; offset < COVERAGE_HORIZON; offset += 1_000) {
        const windowStart = start + offset;
        const windowEnd = windowStart + 1_000;
        const maximumHeading = samples.reduce((maximum, sample) => {
          if (sample.x < windowStart || sample.x >= windowEnd) {
            return maximum;
          }
          return Math.max(maximum, Math.abs(sample.heading));
        }, 0);

        if (maximumHeading < EIGHTY_DEGREES - 1e-9) {
          report(
            failures,
            `seed ${seed}: window [${windowStart}, ${windowEnd}) max |heading|=${maximumHeading}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("reaches at least +100 m and -100 m within the first 2,000 m after the straight", () => {
    const failures: string[] = [];
    const start = sim.TUNNEL_START_STRAIGHT;
    const end = start + 2_000;

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      const samples = sampleCenterline(field, start, end, CENTER_SAMPLE_STEP);
      const maximumY = Math.max(...samples.map((sample) => sample.y));
      const minimumY = Math.min(...samples.map((sample) => sample.y));

      if (maximumY < sim.TUNNEL_CENTER_Y + 100 - 1e-9) {
        report(
          failures,
          `seed ${seed}: first 2,000 m max y=${maximumY}, expected >= ${sim.TUNNEL_CENTER_Y + 100}`,
        );
      }
      if (minimumY > sim.TUNNEL_CENTER_Y - 100 + 1e-9) {
        report(
          failures,
          `seed ${seed}: first 2,000 m min y=${minimumY}, expected <= ${sim.TUNNEL_CENTER_Y - 100}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("contains at least three elevation maxima and three minima in every 2,000 m window", () => {
    const failures: string[] = [];
    const start = sim.TUNNEL_START_STRAIGHT;

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      const samples = sampleCenterline(
        field,
        start,
        start + COVERAGE_HORIZON,
        CENTER_SAMPLE_STEP,
      );

      for (let offset = 0; offset < COVERAGE_HORIZON; offset += 2_000) {
        const windowStart = start + offset;
        const windowEnd = windowStart + 2_000;
        const { maxima, minima } = countElevationExtrema(
          samples,
          windowStart,
          windowEnd,
        );

        if (maxima < 3) {
          report(
            failures,
            `seed ${seed}: window [${windowStart}, ${windowEnd}) has ${maxima} local maxima`,
          );
        }
        if (minima < 3) {
          report(
            failures,
            `seed ${seed}: window [${windowStart}, ${windowEnd}) has ${minima} local minima`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps local half-width within [25,55], exactly 34 through the straight, and exercises narrow and wide sections every 2,000 m", () => {
    const failures: string[] = [];
    const start = sim.TUNNEL_START_STRAIGHT;

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);

      for (const x of STRAIGHT_SAMPLE_X) {
        if (field.tunnel.halfWidthAt(x) !== sim.TUNNEL_HALF_WIDTH) {
          report(
            failures,
            `seed ${seed}: straight half-width at x=${x} is ${field.tunnel.halfWidthAt(x)}, expected ${sim.TUNNEL_HALF_WIDTH}`,
          );
        }
      }

      const samples = sampleCenterline(
        field,
        start,
        start + COVERAGE_HORIZON,
        CENTER_SAMPLE_STEP,
      );

      for (const sample of samples) {
        if (!Number.isFinite(sample.halfWidth)) {
          report(
            failures,
            `seed ${seed}: non-finite half-width at x=${sample.x}`,
          );
          continue;
        }
        if (sample.halfWidth < sim.TUNNEL_MIN_HALF_WIDTH - 1e-9) {
          report(
            failures,
            `seed ${seed}: half-width ${sample.halfWidth} at x=${sample.x} is below ${sim.TUNNEL_MIN_HALF_WIDTH}`,
          );
        }
        if (sample.halfWidth > sim.TUNNEL_MAX_HALF_WIDTH + 1e-9) {
          report(
            failures,
            `seed ${seed}: half-width ${sample.halfWidth} at x=${sample.x} is above ${sim.TUNNEL_MAX_HALF_WIDTH}`,
          );
        }
      }

      for (let offset = 0; offset < COVERAGE_HORIZON; offset += 2_000) {
        const windowStart = start + offset;
        const windowEnd = windowStart + 2_000;
        const widths = samples
          .filter((sample) => sample.x >= windowStart && sample.x < windowEnd)
          .map((sample) => sample.halfWidth);
        const narrowest = Math.min(...widths);
        const widest = Math.max(...widths);

        if (!(narrowest <= 30 + 1e-9)) {
          report(
            failures,
            `seed ${seed}: window [${windowStart}, ${windowEnd}) never narrows to <=30 m (min ${narrowest})`,
          );
        }
        if (!(widest >= 45 - 1e-9)) {
          report(
            failures,
            `seed ${seed}: window [${windowStart}, ${windowEnd}) never widens to >=45 m (max ${widest})`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("samples wall segments at or below 8 m chords and assigns each to exactly one owning chunk", () => {
    const failures: string[] = [];

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      for (const window of wallWindows(field)) {
        const segments = collectWallSegments(field, window.xMin, window.xMax);
        if (segments.length === 0) {
          report(
            failures,
            `seed ${seed} ${window.label}: no wall segments collected`,
          );
          continue;
        }

        const keys = new Set<string>();
        for (const segment of segments) {
          const { chunk, start, end } = segment;
          if (
            !Number.isFinite(start.x) ||
            !Number.isFinite(start.y) ||
            !Number.isFinite(end.x) ||
            !Number.isFinite(end.y)
          ) {
            report(
              failures,
              `seed ${seed} ${window.label}: non-finite wall point ${JSON.stringify(start)} -> ${JSON.stringify(end)}`,
            );
            continue;
          }

          const chord = Math.hypot(end.x - start.x, end.y - start.y);
          if (chord > sim.TUNNEL_SAMPLE_STEP + 1e-6) {
            report(
              failures,
              `seed ${seed} ${window.label}: chord ${chord} at ${JSON.stringify(start)} -> ${JSON.stringify(end)} exceeds ${sim.TUNNEL_SAMPLE_STEP} m`,
            );
          }

          const midpoint = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
          };
          const ownerX = Math.floor(midpoint.x / field.chunkSize);
          const ownerY = Math.floor(midpoint.y / field.chunkSize);
          if (ownerX !== chunk.coord.x || ownerY !== chunk.coord.y) {
            report(
              failures,
              `seed ${seed} ${window.label}: midpoint (${midpoint.x}, ${midpoint.y}) belongs to chunk (${ownerX}, ${ownerY}) but was returned by (${chunk.coord.x}, ${chunk.coord.y})`,
            );
          }

          const key = segmentKey(segment);
          if (keys.has(key)) {
            report(
              failures,
              `seed ${seed} ${window.label}: duplicate wall segment ${key}`,
            );
          }
          keys.add(key);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("joins wall segments across chunk seams so every interior endpoint is shared", () => {
    const failures: string[] = [];

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      for (const window of wallWindows(field)) {
        const segments = collectWallSegments(field, window.xMin, window.xMax);
        const counts = new Map<string, { point: Vec2; count: number }>();

        for (const segment of segments) {
          for (const point of [segment.start, segment.end]) {
            const key = pointKey(point);
            const entry = counts.get(key);
            if (entry) {
              entry.count += 1;
            } else {
              counts.set(key, { point, count: 1 });
            }
          }
        }

        for (const { point, count } of counts.values()) {
          if (count === 2) {
            continue;
          }
          const nearBoundary =
            point.x <= window.xMin + 12 || point.x >= window.xMax - 12;
          if (count === 1 && nearBoundary) {
            continue;
          }
          report(
            failures,
            `seed ${seed} ${window.label}: endpoint ${JSON.stringify(point)} is shared by ${count} segments`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("offsets wall points normal to the local centerline by the local half-width", () => {
    const failures: string[] = [];

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      for (const window of wallWindows(field)) {
        const segments = collectWallSegments(field, window.xMin, window.xMax);
        const points = selectEvenly(
          uniquePoints(segments),
          window.label === "straight" ? 8 : 16,
        );

        if (points.length === 0) {
          report(
            failures,
            `seed ${seed} ${window.label}: no wall points collected`,
          );
          continue;
        }

        for (const point of points) {
          const { residual, baseX } = nearestOffsetBase(field, point);
          if (!(residual <= NORMAL_OFFSET_TOLERANCE)) {
            report(
              failures,
              `seed ${seed} ${window.label}: wall point (${point.x}, ${point.y}) is ${residual} m from the normal offset at base x=${baseX}`,
            );
          }
        }

        if (window.label !== "straight") {
          const steepBand = collectWallSegments(
            field,
            window.steepX - 70,
            window.steepX + 70,
          );
          let nearVerticalCovered = false;
          for (const point of uniquePoints(steepBand)) {
            const { residual, baseX } = nearestOffsetBase(field, point);
            if (!(residual <= NORMAL_OFFSET_TOLERANCE)) {
              report(
                failures,
                `seed ${seed} ${window.label}: near-vertical wall point (${point.x}, ${point.y}) is ${residual} m from the normal offset at base x=${baseX}`,
              );
            }
            if (
              Math.abs(field.tunnel.headingAt(baseX)) >=
              EIGHTY_DEGREES - 1e-9
            ) {
              nearVerticalCovered = true;
            }
          }
          if (!nearVerticalCovered) {
            report(
              failures,
              `seed ${seed} ${window.label}: no near-vertical wall point was exercised near x=${window.steepX}`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps the first 2,000 m of wall geometry free of self-intersections", () => {
    const failures: string[] = [];

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      const xMin = sim.TUNNEL_START_STRAIGHT;
      const xMax = xMin + SELF_INTERSECTION_HORIZON;
      const segments = collectWallSegments(field, xMin, xMax);

      if (segments.length === 0) {
        report(
          failures,
          `seed ${seed}: no wall segments collected for the self-intersection check`,
        );
        continue;
      }

      const intersections = findSelfIntersections(
        segments,
        MAX_REPORTED_FAILURES,
      );
      for (const [first, second] of intersections) {
        report(
          failures,
          `seed ${seed}: ${segmentLabel(first)} intersects ${segmentLabel(second)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps half-width times centerline curvature below the offset simplicity limit", () => {
    const failures: string[] = [];
    const start = sim.TUNNEL_START_STRAIGHT;
    const end = start + COVERAGE_HORIZON;

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      let worstProduct = 0;
      let worstX = start;
      let invalid = false;

      for (let x = start; x <= end; x += CURVATURE_SAMPLE_STEP) {
        const halfWidth = field.tunnel.halfWidthAt(x);
        const curvature = centerlineCurvature(field, x);
        const product = halfWidth * curvature;
        if (!Number.isFinite(product)) {
          report(
            failures,
            `seed ${seed}: half-width times curvature is not finite at x=${x} (halfWidth=${halfWidth}, curvature=${curvature})`,
          );
          invalid = true;
          break;
        }
        if (product > worstProduct) {
          worstProduct = product;
          worstX = x;
        }
      }

      if (!invalid && worstProduct >= CURVATURE_WIDTH_LIMIT) {
        report(
          failures,
          `seed ${seed}: half-width times curvature=${worstProduct} at x=${worstX} reaches the ${CURVATURE_WIDTH_LIMIT} offset simplicity limit`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("returns identical chunk geometry regardless of query order", () => {
    const coordinates: Array<readonly [number, number]> = [];
    for (let cy = QUERY_ORDER_CHUNK_Y.min; cy <= QUERY_ORDER_CHUNK_Y.max; cy += 1) {
      for (let cx = QUERY_ORDER_CHUNK_X.min; cx <= QUERY_ORDER_CHUNK_X.max; cx += 1) {
        coordinates.push([cx, cy]);
      }
    }

    for (const seed of BENCHMARK_SEEDS) {
      const forward = sim.createField(seed);
      const reverse = sim.createField(seed);
      const forwardChunks = new Map<string, FieldChunk>();
      for (const [cx, cy] of coordinates) {
        forwardChunks.set(`${cx},${cy}`, forward.getChunk(cx, cy));
      }

      let walledChunks = 0;
      for (const chunk of forwardChunks.values()) {
        if (chunk.walls.length > 0) {
          walledChunks += 1;
        }
      }
      expect(
        walledChunks,
        `seed ${seed}: query range did not include any walled chunks`,
      ).toBeGreaterThan(0);

      for (let index = coordinates.length - 1; index >= 0; index -= 1) {
        const [cx, cy] = coordinates[index]!;
        const expected = forwardChunks.get(`${cx},${cy}`)!;
        expect(
          reverse.getChunk(cx, cy),
          `seed ${seed}: chunk (${cx},${cy}) changed with query order`,
        ).toEqual(expected);
      }
    }
  });

  it("names the lower straight wall floor and the upper straight wall ceiling", () => {
    const failures: string[] = [];
    const xMin = -240;
    const xMax = sim.TUNNEL_START_STRAIGHT;

    for (const seed of BENCHMARK_SEEDS) {
      const field = sim.createField(seed);
      const segments = collectWallSegments(field, xMin, xMax);
      let floorPoints = 0;
      let ceilingPoints = 0;

      for (const segment of segments) {
        const isFloor = segment.wallId.includes("floor");
        const isCeiling = segment.wallId.includes("ceiling");
        if (isFloor === isCeiling) {
          report(
            failures,
            `seed ${seed}: wall ${segment.wallId} is not unambiguously floor or ceiling`,
          );
          continue;
        }

        for (const point of [segment.start, segment.end]) {
          if (point.x > xMax + SEGMENT_EPSILON) {
            continue;
          }
          if (isFloor) {
            floorPoints += 1;
            if (!(point.y < sim.TUNNEL_CENTER_Y)) {
              report(
                failures,
                `seed ${seed}: floor wall point (${point.x},${point.y}) is not below the straight centerline y=${sim.TUNNEL_CENTER_Y}`,
              );
            }
          } else {
            ceilingPoints += 1;
            if (!(point.y > sim.TUNNEL_CENTER_Y)) {
              report(
                failures,
                `seed ${seed}: ceiling wall point (${point.x},${point.y}) is not above the straight centerline y=${sim.TUNNEL_CENTER_Y}`,
              );
            }
          }
        }
      }

      if (floorPoints === 0) {
        report(failures, `seed ${seed}: no floor wall points found in the straight`);
      }
      if (ceilingPoints === 0) {
        report(
          failures,
          `seed ${seed}: no ceiling wall points found in the straight`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("repeats exactly for the same seed and differs for different seeds", () => {
    const xCoordinates = [
      -500, -80, 0, 60, 120, 120.001, 200, 600, 1_500, 4_000, 9_000,
    ];
    const first = sim.createField(1234);
    const sameSeed = sim.createField(1234);
    const differentSeed = sim.createField(5678);
    const chunkCoordinates: readonly (readonly [number, number])[] = [
      [-5, 0],
      [-2, 1],
      [0, 0],
      [2, 0],
      [3, 1],
      [8, 0],
      [20, 2],
      [50, 1],
    ];

    const describeAt = (field: Field, x: number) => ({
      center: field.tunnel.centerAt(x),
      heading: field.tunnel.headingAt(x),
      halfWidth: field.tunnel.halfWidthAt(x),
    });
    const sampleAt = (field: Field) => xCoordinates.map((x) => describeAt(field, x));

    expect(sampleAt(first)).toEqual(sampleAt(sameSeed));
    for (const [cx, cy] of chunkCoordinates) {
      expect(first.getChunk(cx!, cy!)).toEqual(sameSeed.getChunk(cx!, cy!));
    }

    expect(sampleAt(first)).not.toEqual(sampleAt(differentSeed));

    const secondDifferentSeed = sim.createField(99991);
    expect(sampleAt(first)).not.toEqual(sampleAt(secondDifferentSeed));
  });

  it("supports negative chunks and repeated getChunk calls deterministically", () => {
    const field = sim.createField(314159);
    const sameSeed = sim.createField(314159);
    const coordinates: readonly (readonly [number, number])[] = [
      [-100, 0],
      [-7, -2],
      [-3, 0],
      [-1, 0],
      [0, 0],
    ];

    for (const [cx, cy] of coordinates) {
      const first = field.getChunk(cx!, cy!);
      const repeated = field.getChunk(cx!, cy!);
      const other = sameSeed.getChunk(cx!, cy!);

      expect(first).toEqual(repeated);
      expect(first).toEqual(other);
      expect(first.coord).toEqual({ x: cx, y: cy });
    }

    const negativeChunk = field.getChunk(-3, 0);
    expect(
      negativeChunk.walls.some((wall) =>
        wall.points.some((point) => point.x < 0),
      ),
    ).toBe(true);
  });

  it("contains only tunnel walls, with no gates or ground metadata", () => {
    const field = sim.createField(77);

    for (const [cx, cy] of [
      [-4, -2],
      [-1, 0],
      [0, 1],
      [2, 0],
      [5, 2],
    ]) {
      const chunk = field.getChunk(cx!, cy!);
      expect(Object.keys(chunk).sort()).toEqual(["coord", "walls"]);
      expect("gates" in chunk).toBe(false);
      expect("groundY" in field).toBe(false);
    }
  });

  it("returns chunks in deterministic cy-then-cx order without duplicates", () => {
    const field = sim.createField(2026);
    const center = { x: -20, y: 95 };
    const chunks = field.chunksInView(center, 120);
    const coordinates = chunks.map(({ coord }) => `${coord.x},${coord.y}`);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks).toEqual([...chunks].sort(chunkOrder));
    expect(new Set(coordinates).size).toBe(coordinates.length);
    expect(field.chunksInView(center, 120)).toEqual(chunks);
  });
});
