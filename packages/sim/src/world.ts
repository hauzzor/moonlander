import { GRAVITY, START_POSITION } from "./constants";
import type {
  CurvedWall,
  Field,
  LevelId,
  Planet,
  SpaceWorld,
  TunnelWorld,
  Vec2,
} from "./types";

function copyVec(vector: Vec2): Vec2 {
  return { x: vector.x, y: vector.y };
}

function flattenWalls(
  field: Field,
  center: Vec2,
  radius: number,
): readonly CurvedWall[] {
  const walls: CurvedWall[] = [];
  for (const chunk of field.chunksInView(center, radius)) {
    walls.push(...chunk.walls);
  }
  return walls;
}

export function createTunnelWorld(
  field: Field,
  spawn: Vec2,
  gravityScale: () => number,
): TunnelWorld {
  const origin = copyVec(spawn);

  return {
    kind: "tunnel",
    seed: field.seed,
    spawn: origin,
    field,
    gravityAt: () => ({ x: 0, y: -GRAVITY * gravityScale() }),
    progressAt: (position: Vec2) =>
      Math.max(0, position.x - origin.x),
    planetsInView: () => [],
    wallsInView: (center: Vec2, radius: number): readonly CurvedWall[] =>
      flattenWalls(field, center, radius),
    stepBodies: () => {},
  };
}

export function createSpaceField(
  level: LevelId,
  seed: number,
  spawn: Vec2 = START_POSITION,
): SpaceWorld {
  const normalizedSeed = seed >>> 0;
  const origin = copyVec(spawn);
  const planets: readonly Planet[] = [];

  return {
    kind: "space",
    level,
    seed: normalizedSeed,
    spawn: origin,
    planets,
    gravityAt: () => ({ x: 0, y: 0 }),
    progressAt: (position: Vec2) =>
      Math.hypot(position.x - origin.x, position.y - origin.y),
    planetsInView: () => planets,
    wallsInView: () => [],
    stepBodies: () => {},
  };
}
