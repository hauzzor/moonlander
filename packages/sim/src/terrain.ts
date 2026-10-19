import { PAD_WIDTH, WORLD_WIDTH } from "./constants";
import type { Terrain, Vec2 } from "./types";

const PLATEAU_LEFT = 200;
const PLATEAU_RIGHT = 400;
const TERRAIN_STEP = 20;
const MIN_HILL_HEIGHT = 5;
const MAX_HILL_HEIGHT = 45;

// mulberry32: a small deterministic integer PRNG so terrain is seeded
// without Math.random.
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createTerrain(seed: number): Terrain {
  const random = createSeededRandom(seed);
  const points: Vec2[] = [];
  for (let x = 0; x <= WORLD_WIDTH; x += TERRAIN_STEP) {
    const onPlateau = x >= PLATEAU_LEFT && x <= PLATEAU_RIGHT;
    const y = onPlateau
      ? 0
      : MIN_HILL_HEIGHT + random() * (MAX_HILL_HEIGHT - MIN_HILL_HEIGHT);
    points.push({ x, y });
  }

  return {
    seed,
    points,
    pad: {
      left: (WORLD_WIDTH - PAD_WIDTH) / 2,
      right: (WORLD_WIDTH + PAD_WIDTH) / 2,
      y: 0,
    },
    // The grid is uniform, so every in-range x maps to a real segment.
    heightAt(x: number): number {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      if (x <= first.x) {
        return first.y;
      }
      if (x >= last.x) {
        return last.y;
      }
      const left = points[Math.floor(x / TERRAIN_STEP)]!;
      const right = points[Math.floor(x / TERRAIN_STEP) + 1]!;
      const fraction = (x - left.x) / (right.x - left.x);
      return left.y + fraction * (right.y - left.y);
    },
  };
}
