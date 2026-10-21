import {
  PLANET_CELL_SIZE,
  PLANET_GRAVITY_RANGE,
  PLANET_RADIUS,
  START_POSITION,
} from "./constants";
import { gravityAccelerationAt } from "./gravity";
import { planetAtCell } from "./planet";
import type { LevelId, Planet, SpaceWorld, Vec2 } from "./types";

const ACTIVE_PLANET_RADIUS = 10_000;
const CELL_MARGIN = 1;

function copyVec(vector: Vec2): Vec2 {
  return { x: vector.x, y: vector.y };
}

export function createSpaceField(
  level: LevelId,
  seed: number,
  spawn: Vec2 = START_POSITION,
  gravityScale: () => number = () => 1,
): SpaceWorld {
  const normalizedSeed = seed >>> 0;
  const origin = copyVec(spawn);
  const cellCache = new Map<string, Planet | undefined>();

  const planetForCell = (cx: number, cy: number): Planet | undefined => {
    const key = `${cx},${cy}`;
    if (cellCache.has(key)) {
      return cellCache.get(key);
    }
    const planet = planetAtCell(
      normalizedSeed,
      level,
      cx,
      cy,
      origin,
    );
    cellCache.set(key, planet);
    return planet;
  };

  const planetsInView = (
    center: Vec2,
    radius: number,
  ): readonly Planet[] => {
    const queryRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    const extent = queryRadius + PLANET_RADIUS;
    const minCx =
      Math.floor((center.x - extent) / PLANET_CELL_SIZE) - CELL_MARGIN;
    const maxCx =
      Math.floor((center.x + extent) / PLANET_CELL_SIZE) + CELL_MARGIN;
    const minCy =
      Math.floor((center.y - extent) / PLANET_CELL_SIZE) - CELL_MARGIN;
    const maxCy =
      Math.floor((center.y + extent) / PLANET_CELL_SIZE) + CELL_MARGIN;
    const planets: Planet[] = [];

    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const planet = planetForCell(cx, cy);
        if (planet === undefined) {
          continue;
        }
        const distance = Math.hypot(
          planet.position.x - center.x,
          planet.position.y - center.y,
        );
        if (distance <= queryRadius + planet.radius) {
          planets.push(planet);
        }
      }
    }

    planets.sort((first, second) =>
      first.id < second.id ? -1 : first.id > second.id ? 1 : 0,
    );
    return planets;
  };

  const planets = planetsInView(origin, ACTIVE_PLANET_RADIUS);

  return {
    kind: "space",
    level,
    seed: normalizedSeed,
    spawn: origin,
    planets,
    gravityAt: (position: Vec2): Vec2 =>
      gravityAccelerationAt(
        position,
        planetsInView(position, PLANET_GRAVITY_RANGE),
        gravityScale(),
      ),
    progressAt: (position: Vec2): number =>
      Math.hypot(position.x - origin.x, position.y - origin.y),
    planetsInView,
    wallsInView: () => [],
    stepBodies: () => {},
  };
}
