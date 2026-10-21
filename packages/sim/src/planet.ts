import {
  PLANET_CELL_SIZE,
  PLANET_DENSITY,
  PLANET_MIN_SURFACE_GAP,
  PLANET_RADIUS,
  PLANET_SPAWN_CLEARANCE,
  PLANET_SURFACE_GRAVITY,
} from "./constants";
import type { LevelId, Planet, Vec2 } from "./types";

const JITTER =
  (PLANET_CELL_SIZE - (2 * PLANET_RADIUS + PLANET_MIN_SURFACE_GAP)) / 2 - 1;

function hashCell(
  seed: number,
  cx: number,
  cy: number,
  salt: number,
): number {
  let hash = (seed ^ salt) >>> 0;
  hash = Math.imul(hash ^ (cx | 0), 0x9e3779b1);
  hash = Math.imul(hash ^ (cy | 0), 0x85ebca6b);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function unit(hash: number): number {
  return hash / 4_294_967_296;
}

export function planetId(cx: number, cy: number): string {
  return `planet:${cx}:${cy}`;
}

export function planetAtCell(
  seed: number,
  level: LevelId,
  cx: number,
  cy: number,
  spawn: Vec2,
): Planet | undefined {
  if (unit(hashCell(seed, cx, cy, 0x1b873593)) >= PLANET_DENSITY) {
    return undefined;
  }

  const jitterX = (unit(hashCell(seed, cx, cy, 0x9e3779b1)) * 2 - 1) * JITTER;
  const jitterY = (unit(hashCell(seed, cx, cy, 0x85ebca6b)) * 2 - 1) * JITTER;
  const position = {
    x: (cx + 0.5) * PLANET_CELL_SIZE + jitterX,
    y: (cy + 0.5) * PLANET_CELL_SIZE + jitterY,
  };
  const clearance = PLANET_RADIUS + PLANET_SPAWN_CLEARANCE;
  if (Math.hypot(position.x - spawn.x, position.y - spawn.y) < clearance) {
    return undefined;
  }

  return {
    id: planetId(cx, cy),
    position,
    velocity: { x: 0, y: 0 },
    radius: PLANET_RADIUS,
    surfaceGravity: PLANET_SURFACE_GRAVITY,
    polarity: level === "anti-gravity" ? "repel" : "attract",
  };
}
