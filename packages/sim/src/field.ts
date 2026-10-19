import {
  FIELD_CHUNK_SIZE,
  TUNNEL_BEND_AMPLITUDE,
  TUNNEL_CENTER_Y,
  TUNNEL_HALF_WIDTH,
  TUNNEL_MAX_SLOPE,
  TUNNEL_SAMPLE_STEP,
  TUNNEL_START_STRAIGHT,
} from "./constants";
import { clamp } from "./geometry";
import type { CurvedWall, Field, FieldChunk, Tunnel, Vec2 } from "./types";

const WALL_Y_QUANTUM = 1_048_576;
const TRANSITION_LENGTH = 240;
const TAU = Math.PI * 2;
const AMPLITUDES = [10, 6, 2] as const;
const WAVELENGTHS = [400, 620, 900] as const;

function hashSeed(seed: number, index: number): number {
  let hash = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function phases(seed: number): number[] {
  return AMPLITUDES.map((_, index) => (hashSeed(seed, index) / 4294967296) * TAU);
}

function waveValue(x: number, phaseValues: readonly number[]): number {
  let value = 0;
  for (let index = 0; index < AMPLITUDES.length; index += 1) {
    value +=
      AMPLITUDES[index]! *
      Math.sin((TAU * x) / WAVELENGTHS[index]! + phaseValues[index]!);
  }
  return value;
}

function waveSlope(x: number, phaseValues: readonly number[]): number {
  let value = 0;
  for (let index = 0; index < AMPLITUDES.length; index += 1) {
    value +=
      ((AMPLITUDES[index]! * TAU) / WAVELENGTHS[index]!) *
      Math.cos((TAU * x) / WAVELENGTHS[index]! + phaseValues[index]!);
  }
  return value;
}

function bendAt(
  x: number,
  phaseValues: readonly number[],
): { offset: number; slope: number } {
  if (x <= TUNNEL_START_STRAIGHT) {
    return { offset: 0, slope: 0 };
  }

  const t = Math.min(1, (x - TUNNEL_START_STRAIGHT) / TRANSITION_LENGTH);
  const blend = t * t * (3 - 2 * t);
  const blendSlope = t >= 1 ? 0 : (6 * t * (1 - t)) / TRANSITION_LENGTH;
  const value = waveValue(x, phaseValues);
  const slope = blendSlope * value + blend * waveSlope(x, phaseValues);

  return {
    offset: clamp(blend * value, -TUNNEL_BEND_AMPLITUDE, TUNNEL_BEND_AMPLITUDE),
    slope: clamp(slope, -TUNNEL_MAX_SLOPE, TUNNEL_MAX_SLOPE),
  };
}

function quantizeCenterY(y: number): number {
  return Math.round(y * WALL_Y_QUANTUM) / WALL_Y_QUANTUM;
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
  const phaseValues = phases(seed);
  return {
    halfWidth: TUNNEL_HALF_WIDTH,
    centerAt(x: number): Vec2 {
      if (x <= TUNNEL_START_STRAIGHT) {
        return { x, y: TUNNEL_CENTER_Y };
      }
      return {
        x,
        y: quantizeCenterY(TUNNEL_CENTER_Y + bendAt(x, phaseValues).offset),
      };
    },
    headingAt(x: number): number {
      return Math.atan(bendAt(x, phaseValues).slope);
    },
  };
}

function createWalls(
  tunnel: Tunnel,
  cx: number,
  cy: number,
): CurvedWall[] {
  const walls: CurvedWall[] = [];
  const chunkLeft = cx * FIELD_CHUNK_SIZE;

  for (let index = 0; index < FIELD_CHUNK_SIZE / TUNNEL_SAMPLE_STEP; index += 1) {
    const startX = chunkLeft + index * TUNNEL_SAMPLE_STEP;
    const endX = startX + TUNNEL_SAMPLE_STEP;
    const startCenter = tunnel.centerAt(startX);
    const endCenter = tunnel.centerAt(endX);

    for (const side of [-1, 1] as const) {
      const start = {
        x: startX,
        y: startCenter.y + side * TUNNEL_HALF_WIDTH,
      };
      const end = {
        x: endX,
        y: endCenter.y + side * TUNNEL_HALF_WIDTH,
      };
      const midpointY = (start.y + end.y) / 2;
      if (Math.floor(midpointY / FIELD_CHUNK_SIZE) !== cy) {
        continue;
      }

      walls.push({
        id: `tunnel:${side < 0 ? "floor" : "ceiling"}:${startX}`,
        points: [start, end],
      });
    }
  }

  return walls;
}

export function createField(seed: number): Field {
  const normalizedSeed = seed >>> 0;
  const tunnel = createTunnel(normalizedSeed);
  const cache = new Map<string, FieldChunk>();

  function getChunk(cx: number, cy: number): FieldChunk {
    const chunkX = Math.trunc(cx);
    const chunkY = Math.trunc(cy);
    const key = `${chunkX},${chunkY}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const chunk: FieldChunk = {
      coord: { x: chunkX, y: chunkY },
      walls: createWalls(tunnel, chunkX, chunkY),
    };
    cache.set(key, chunk);
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
