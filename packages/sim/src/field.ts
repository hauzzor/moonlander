import {
  FIELD_CHUNK_SIZE,
  TUNNEL_BEND_AMPLITUDE,
  TUNNEL_CENTER_Y,
  TUNNEL_HALF_WIDTH,
  TUNNEL_MAX_HALF_WIDTH,
  TUNNEL_MIN_HALF_WIDTH,
  TUNNEL_SAMPLE_STEP,
  TUNNEL_START_STRAIGHT,
} from "./constants";
import { clamp } from "./geometry";
import type { CurvedWall, Field, FieldChunk, Tunnel, Vec2 } from "./types";

const TAU = Math.PI * 2;
const TRANSITION_SCALE = 150;
const BEND_SHARPNESS = 6;
const BEND_PERIOD_MIN = 550;
const BEND_PERIOD_MAX = 610;
const BEND_SCALE = (TUNNEL_BEND_AMPLITUDE * 2) / Math.PI;
const WIDTH_BASE = 39;
const WIDTH_SLOW_AMPLITUDE = 12;
const WIDTH_SLOW_WAVELENGTH = 800;
const WIDTH_FAST_AMPLITUDE = 3;
const WIDTH_FAST_WAVELENGTH = 190;
const WIDTH_TRANSITION_LENGTH = 240;
const WIDTH_SAFETY = 0.85;
const CURVATURE_FLOOR = 1e-9;
const BOUNDARY_EPSILON = 1e-9;

if (TUNNEL_MAX_HALF_WIDTH >= FIELD_CHUNK_SIZE) {
  throw new Error("TUNNEL_MAX_HALF_WIDTH must be smaller than FIELD_CHUNK_SIZE");
}

interface FieldPhases {
  waveNumber: number;
  widthSlow: number;
  widthFast: number;
}

interface BendState {
  offset: number;
  slope: number;
  secondDerivative: number;
}

interface OffsetPoint {
  low: Vec2;
  high: Vec2;
}

interface ColumnSegment {
  side: -1 | 1;
  start: Vec2;
  end: Vec2;
  midX: number;
  midY: number;
  column: number;
  index: number;
}

function hashSeed(seed: number, index: number): number {
  let hash = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function fieldPhases(seed: number): FieldPhases {
  const phase = (index: number) =>
    (hashSeed(seed, index) / 4_294_967_296) * TAU;
  const periodFraction = hashSeed(seed, 0) / 4_294_967_296;
  const period =
    BEND_PERIOD_MIN + periodFraction * (BEND_PERIOD_MAX - BEND_PERIOD_MIN);
  return {
    waveNumber: TAU / period,
    widthSlow: phase(2),
    widthFast: phase(3),
  };
}

function bendStateAt(u: number, phases: FieldPhases): BendState {
  const transition = Math.tanh(u / TRANSITION_SCALE);
  const phase = phases.waveNumber * (u - TRANSITION_SCALE * transition);
  const sine = Math.sin(phase);
  const cosine = Math.cos(phase);
  const denominator = 1 + BEND_SHARPNESS * BEND_SHARPNESS * sine * sine;
  const phaseSlope = phases.waveNumber * transition * transition;
  const phaseSecond =
    (2 * phases.waveNumber * transition * (1 - transition * transition)) /
    TRANSITION_SCALE;
  const slopePhase =
    (BEND_SCALE * BEND_SHARPNESS * cosine) / denominator;
  const secondPhase =
    (-BEND_SCALE *
      BEND_SHARPNESS *
      sine *
      (1 + BEND_SHARPNESS * BEND_SHARPNESS * (1 + cosine * cosine))) /
    (denominator * denominator);

  return {
    offset: BEND_SCALE * Math.atan(BEND_SHARPNESS * sine),
    slope: slopePhase * phaseSlope,
    secondDerivative:
      secondPhase * phaseSlope * phaseSlope + slopePhase * phaseSecond,
  };
}

function circleIntersectsChunk(
  center: Vec2,
  radius: number,
  cx: number,
  cy: number,
): boolean {
  const left = cx * FIELD_CHUNK_SIZE;
  const bottom = cy * FIELD_CHUNK_SIZE;
  const closestX = clamp(center.x, left, left + FIELD_CHUNK_SIZE);
  const closestY = clamp(center.y, bottom, bottom + FIELD_CHUNK_SIZE);
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function createTunnel(seed: number): Tunnel {
  const phases = fieldPhases(seed);
  const widthSlowWaveNumber = TAU / WIDTH_SLOW_WAVELENGTH;
  const widthFastWaveNumber = TAU / WIDTH_FAST_WAVELENGTH;

  function widthBlend(u: number): number {
    const t = Math.min(1, u / WIDTH_TRANSITION_LENGTH);
    return t * t * (3 - 2 * t);
  }

  return {
    halfWidth: TUNNEL_HALF_WIDTH,
    halfWidthAt(x: number): number {
      if (x <= TUNNEL_START_STRAIGHT) {
        return TUNNEL_HALF_WIDTH;
      }

      const u = x - TUNNEL_START_STRAIGHT;
      const state = bendStateAt(u, phases);
      const curvature =
        Math.abs(state.secondDerivative) /
        Math.pow(1 + state.slope * state.slope, 1.5);
      const safeWidth = clamp(
        WIDTH_SAFETY / Math.max(curvature, CURVATURE_FLOOR),
        TUNNEL_MIN_HALF_WIDTH,
        TUNNEL_MAX_HALF_WIDTH,
      );
      const desiredWidth = clamp(
        WIDTH_BASE +
          WIDTH_SLOW_AMPLITUDE *
            Math.sin(widthSlowWaveNumber * u + phases.widthSlow) +
          WIDTH_FAST_AMPLITUDE *
            Math.sin(widthFastWaveNumber * u + phases.widthFast),
        TUNNEL_MIN_HALF_WIDTH,
        TUNNEL_MAX_HALF_WIDTH,
      );
      const blended =
        TUNNEL_HALF_WIDTH +
        widthBlend(u) * (Math.min(desiredWidth, safeWidth) - TUNNEL_HALF_WIDTH);

      return clamp(
        Math.min(blended, safeWidth),
        TUNNEL_MIN_HALF_WIDTH,
        TUNNEL_MAX_HALF_WIDTH,
      );
    },
    centerAt(x: number): Vec2 {
      if (x <= TUNNEL_START_STRAIGHT) {
        return { x, y: TUNNEL_CENTER_Y };
      }
      const state = bendStateAt(x - TUNNEL_START_STRAIGHT, phases);
      return { x, y: TUNNEL_CENTER_Y + state.offset };
    },
    headingAt(x: number): number {
      if (x <= TUNNEL_START_STRAIGHT) {
        return 0;
      }
      const state = bendStateAt(x - TUNNEL_START_STRAIGHT, phases);
      return Math.atan(state.slope);
    },
  };
}

function offsetPair(tunnel: Tunnel, x: number): OffsetPoint {
  const center = tunnel.centerAt(x);
  const heading = tunnel.headingAt(x);
  const halfWidth = tunnel.halfWidthAt(x);
  const normalX = -Math.sin(heading);
  const normalY = Math.cos(heading);
  return {
    low: {
      x: center.x + halfWidth * normalX,
      y: center.y + halfWidth * normalY,
    },
    high: {
      x: center.x - halfWidth * normalX,
      y: center.y - halfWidth * normalY,
    },
  };
}

function chordLength(start: Vec2, end: Vec2): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function sampleColumn(tunnel: Tunnel, cx: number): ColumnSegment[] {
  const left = cx * FIELD_CHUNK_SIZE;
  const right = left + FIELD_CHUNK_SIZE;
  const segments: ColumnSegment[] = [];
  let x = left;
  let points = offsetPair(tunnel, left);
  let index = 0;

  while (x < right) {
    let dx = Math.min(TUNNEL_SAMPLE_STEP, right - x);
    let next = x + dx;
    let nextPoints = offsetPair(tunnel, next);

    while (
      dx > 0 &&
      (chordLength(points.low, nextPoints.low) > TUNNEL_SAMPLE_STEP ||
        chordLength(points.high, nextPoints.high) > TUNNEL_SAMPLE_STEP)
    ) {
      dx *= 0.5;
      next = x + dx;
      nextPoints = offsetPair(tunnel, next);
    }

    if (right - next <= BOUNDARY_EPSILON) {
      next = right;
      nextPoints = offsetPair(tunnel, right);
    }
    if (next <= x) {
      next = right;
      nextPoints = offsetPair(tunnel, right);
    }

    for (const side of [-1, 1] as const) {
      const start = side < 0 ? points.low : points.high;
      const end = side < 0 ? nextPoints.low : nextPoints.high;
      segments.push({
        side,
        start,
        end,
        midX: (start.x + end.x) / 2,
        midY: (start.y + end.y) / 2,
        column: cx,
        index,
      });
    }

    x = next;
    points = nextPoints;
    index += 1;
  }

  return segments;
}

function compareSegments(a: ColumnSegment, b: ColumnSegment): number {
  return a.column - b.column || a.side - b.side || a.index - b.index;
}

function createWalls(segments: readonly ColumnSegment[]): CurvedWall[] {
  const walls: CurvedWall[] = [];
  for (const segment of segments) {
    walls.push({
      id: `tunnel:${segment.side < 0 ? "ceiling" : "floor"}:${segment.column}:${segment.index}`,
      points: [segment.start, segment.end],
    });
  }
  return walls;
}

export function createField(seed: number): Field {
  const normalizedSeed = seed >>> 0;
  const tunnel = createTunnel(normalizedSeed);
  const columnCache = new Map<number, ColumnSegment[]>();
  const chunkSegments = new Map<string, ColumnSegment[]>();
  const chunkCache = new Map<string, FieldChunk>();

  function ensureColumn(cx: number): void {
    if (columnCache.has(cx)) {
      return;
    }
    const segments = sampleColumn(tunnel, cx);
    columnCache.set(cx, segments);
    for (const segment of segments) {
      const ownerX = Math.floor(segment.midX / FIELD_CHUNK_SIZE);
      const ownerY = Math.floor(segment.midY / FIELD_CHUNK_SIZE);
      const key = `${ownerX},${ownerY}`;
      const bucket = chunkSegments.get(key);
      if (bucket) {
        bucket.push(segment);
      } else {
        chunkSegments.set(key, [segment]);
      }
    }
  }

  function getChunk(cx: number, cy: number): FieldChunk {
    const chunkX = Math.trunc(cx);
    const chunkY = Math.trunc(cy);
    const key = `${chunkX},${chunkY}`;
    const cached = chunkCache.get(key);
    if (cached) {
      return cached;
    }

    // A normal offset shifts a segment midpoint by at most the local half-width,
    // so one neighboring column covers every possible owner while
    // TUNNEL_MAX_HALF_WIDTH is smaller than FIELD_CHUNK_SIZE.
    for (let column = chunkX - 1; column <= chunkX + 1; column += 1) {
      ensureColumn(column);
    }

    const bucket = chunkSegments.get(key) ?? [];
    const ordered = [...bucket].sort(compareSegments);
    const chunk: FieldChunk = {
      coord: { x: chunkX, y: chunkY },
      walls: createWalls(ordered),
    };
    chunkCache.set(key, chunk);
    return chunk;
  }

  return {
    seed: normalizedSeed,
    chunkSize: FIELD_CHUNK_SIZE,
    tunnel,
    getChunk,
    chunksInView(center: Vec2, radius: number): readonly FieldChunk[] {
      const size = FIELD_CHUNK_SIZE;
      const minCx = Math.floor((center.x - radius) / size);
      const maxCx = Math.floor((center.x + radius) / size);
      const minCy = Math.floor((center.y - radius) / size);
      const maxCy = Math.floor((center.y + radius) / size);
      const chunks: FieldChunk[] = [];

      for (let cy = minCy; cy <= maxCy; cy += 1) {
        for (let cx = minCx; cx <= maxCx; cx += 1) {
          if (circleIntersectsChunk(center, radius, cx, cy)) {
            chunks.push(getChunk(cx, cy));
          }
        }
      }

      chunks.sort((a, b) => a.coord.y - b.coord.y || a.coord.x - b.coord.x);
      return chunks;
    },
  };
}
