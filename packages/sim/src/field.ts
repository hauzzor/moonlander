import {
  FIELD_CHUNK_SIZE,
  GATE_MAX_RADIUS,
  GATE_MIN_RADIUS,
  GROUND_Y,
  SAFE_SPAWN_RADIUS,
  START_POSITION,
} from "./constants";
import { clamp, pointToSegmentDistance } from "./geometry";
import type { CurvedWall, Field, FieldChunk, Gate, Vec2 } from "./types";

const WALL_MARGIN = 6;
const GATE_EDGE_MARGIN = GATE_MAX_RADIUS + 10;
const GATE_WALL_CLEARANCE = 10.5;
const GATE_CHANCE = 0.7;
const GATE_ATTEMPTS = 24;

function hashChunk(seed: number, cx: number, cy: number): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  hash = Math.imul(hash ^ (cx | 0), 0x85ebca6b);
  hash = Math.imul(hash ^ (cy | 0), 0xc2b2ae35);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function createChunkRandom(seed: number, cx: number, cy: number): () => number {
  let state = hashChunk(seed, cx, cy);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkBounds(cx: number, cy: number) {
  const left = cx * FIELD_CHUNK_SIZE;
  const bottom = cy * FIELD_CHUNK_SIZE;
  return {
    left,
    right: left + FIELD_CHUNK_SIZE,
    bottom,
    top: bottom + FIELD_CHUNK_SIZE,
  };
}

function circleIntersectsChunk(center: Vec2, radius: number, cx: number, cy: number): boolean {
  const { left, right, bottom, top } = chunkBounds(cx, cy);
  const closestX = clamp(center.x, left, right);
  const closestY = clamp(center.y, bottom, top);
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function intersectsSafeSpawn(cx: number, cy: number): boolean {
  return circleIntersectsChunk(START_POSITION, SAFE_SPAWN_RADIUS, cx, cy);
}

function generateWalls(cx: number, cy: number, random: () => number): CurvedWall[] {
  const { left, right, bottom, top } = chunkBounds(cx, cy);
  const minY = Math.max(bottom, GROUND_Y) + WALL_MARGIN;
  const maxY = top - WALL_MARGIN;
  const wallCount = random() < 0.45 ? 2 : 1;
  const walls: CurvedWall[] = [];

  for (let wallIndex = 0; wallIndex < wallCount; wallIndex += 1) {
    const pointCount = 5 + Math.floor(random() * 5);
    const spanMax = FIELD_CHUNK_SIZE - WALL_MARGIN * 2 - 1;
    let xStart = left + WALL_MARGIN + random() * spanMax;
    let xEnd = left + WALL_MARGIN + random() * spanMax;
    if (xStart > xEnd) {
      const swap = xStart;
      xStart = xEnd;
      xEnd = swap;
    }
    if (xEnd - xStart < 1) {
      xEnd = Math.min(right - WALL_MARGIN, xStart + 1);
    }

    const yStart = minY + random() * Math.max(0, maxY - minY);
    const yEnd = minY + random() * Math.max(0, maxY - minY);
    const amplitude = (random() * 2 - 1) * Math.min(16, (maxY - minY) / 2);

    const points: Vec2[] = [];
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const t = pointCount === 1 ? 0 : pointIndex / (pointCount - 1);
      const x = clamp(xStart + (xEnd - xStart) * t, left, right);
      const curvedY = yStart + (yEnd - yStart) * t + Math.sin(Math.PI * t) * amplitude;
      const y = clamp(curvedY, minY, maxY);
      points.push({ x, y });
    }

    walls.push({ id: `wall:${cx}:${cy}:${wallIndex}`, points });
  }

  return walls;
}

function generateGate(
  cx: number,
  cy: number,
  walls: readonly CurvedWall[],
  random: () => number,
): Gate | undefined {
  if (random() >= GATE_CHANCE) {
    return undefined;
  }

  const { left, right, bottom, top } = chunkBounds(cx, cy);
  const minX = left + GATE_EDGE_MARGIN;
  const maxX = right - GATE_EDGE_MARGIN;
  const minY = Math.max(bottom, GROUND_Y) + GATE_EDGE_MARGIN;
  const maxY = top - GATE_EDGE_MARGIN;
  if (minX > maxX || minY > maxY) {
    return undefined;
  }

  for (let attempt = 0; attempt < GATE_ATTEMPTS; attempt += 1) {
    const radius = GATE_MIN_RADIUS + random() * (GATE_MAX_RADIUS - GATE_MIN_RADIUS);
    const center: Vec2 = {
      x: minX + random() * (maxX - minX),
      y: minY + random() * (maxY - minY),
    };

    let clear = true;
    for (const wall of walls) {
      for (let index = 0; index + 1 < wall.points.length; index += 1) {
        const first = wall.points[index]!;
        const second = wall.points[index + 1]!;
        const clearance = pointToSegmentDistance(center, first, second) - radius;
        if (clearance < GATE_WALL_CLEARANCE) {
          clear = false;
          break;
        }
      }
      if (!clear) {
        break;
      }
    }

    if (clear) {
      const normalAngle = random() * Math.PI * 2;
      return {
        id: `gate:${cx}:${cy}`,
        center,
        radius,
        normal: { x: Math.cos(normalAngle), y: Math.sin(normalAngle) },
      };
    }
  }

  return undefined;
}

function createEmptyChunk(cx: number, cy: number): FieldChunk {
  return { coord: { x: cx, y: cy }, walls: [], gates: [] };
}

export function createField(seed: number): Field {
  const normalizedSeed = seed >>> 0;
  const cache = new Map<string, FieldChunk>();

  function getChunk(cx: number, cy: number): FieldChunk {
    const chunkX = Math.trunc(cx);
    const chunkY = Math.trunc(cy);
    const key = `${chunkX},${chunkY}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const { top } = chunkBounds(chunkX, chunkY);
    let chunk: FieldChunk;
    if (top <= GROUND_Y || intersectsSafeSpawn(chunkX, chunkY)) {
      chunk = createEmptyChunk(chunkX, chunkY);
    } else {
      const random = createChunkRandom(normalizedSeed, chunkX, chunkY);
      const walls = generateWalls(chunkX, chunkY, random);
      const gate = generateGate(chunkX, chunkY, walls, random);
      chunk = {
        coord: { x: chunkX, y: chunkY },
        walls,
        gates: gate ? [gate] : [],
      };
    }

    cache.set(key, chunk);
    return chunk;
  }

  return {
    seed: normalizedSeed,
    chunkSize: FIELD_CHUNK_SIZE,
    groundY: GROUND_Y,
    getChunk,
    chunksInView(center: Vec2, radius: number): readonly FieldChunk[] {
      const size = FIELD_CHUNK_SIZE;
      const minCx = Math.floor((center.x - radius) / size) - 1;
      const maxCx = Math.floor((center.x + radius) / size) + 1;
      const minCy = Math.floor((center.y - radius) / size) - 1;
      const maxCy = Math.floor((center.y + radius) / size) + 1;
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
