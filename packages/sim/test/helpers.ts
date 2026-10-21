import * as sim from "../src/index";
import type {
  Action,
  CurvedWall,
  Field,
  FieldChunk,
  LevelId,
  Planet,
  Simulation,
  SimulationOptions,
  Vec2,
  World,
} from "../src/index";
import { pointToSegmentDistance } from "../src/geometry";

export { sim };

const APPROACH_SEEDS = [1, 7, 42, 1234, 2026, 5678, 99991, 314159] as const;
const APPROACH_SPAWN_DISTANCE =
  sim.PLANET_SPAWN_CLEARANCE + sim.PLANET_RADIUS + 56;

export function distance(first: Vec2, second: Vec2): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function magnitude(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

export function dot(first: Vec2, second: Vec2): number {
  return first.x * second.x + first.y * second.y;
}

export function unit(vector: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const length = magnitude(vector);
  if (length < 1e-12) {
    return { x: fallback.x, y: fallback.y };
  }
  return { x: vector.x / length, y: vector.y / length };
}

export function planetDistance(point: Vec2, planet: Planet): number {
  return distance(point, planet.position);
}

export function planetsWithin(
  world: World,
  point: Vec2,
  radius: number,
): Planet[] {
  return world
    .planetsInView(point, radius)
    .filter((planet) => planetDistance(point, planet) <= radius);
}

export function segmentDistanceToPoint(
  start: Vec2,
  end: Vec2,
  point: Vec2,
): number {
  return pointToSegmentDistance(point, start, end);
}

export interface PlanetApproach {
  simulation: Simulation;
  target: Planet;
  direction: Vec2;
  start: Vec2;
  seed: number;
}

interface PlanetApproachOptions {
  seed?: number;
  level?: LevelId;
  gravityScale?: number;
  hull?: number;
  eyeSensorRadius?: number;
  spawnDistance?: number;
}

function planetApproach(
  start: Vec2,
  direction: Vec2,
  speed: number,
  seed: number,
  options: PlanetApproachOptions,
): Simulation {
  const simulationOptions: SimulationOptions = {
    level: options.level ?? "gravity",
    seed,
    start: {
      position: start,
      velocity: {
        x: direction.x * speed,
        y: direction.y * speed,
      },
    },
  };
  if (options.gravityScale !== undefined) {
    simulationOptions.gravityScale = options.gravityScale;
  }
  if (options.hull !== undefined) {
    simulationOptions.hull = options.hull;
  }
  if (options.eyeSensorRadius !== undefined) {
    simulationOptions.eyeSensorRadius = options.eyeSensorRadius;
  }
  return sim.createSimulation(simulationOptions);
}

function aimAt(
  spawn: Vec2,
  target: Planet,
  speed: number,
  seed: number,
  options: PlanetApproachOptions,
): PlanetApproach {
  const direction = unit({
    x: target.position.x - spawn.x,
    y: target.position.y - spawn.y,
  });
  return {
    simulation: planetApproach(
      spawn,
      direction,
      speed,
      seed,
      options,
    ),
    target,
    direction,
    start: spawn,
    seed,
  };
}

export function createPlanetApproach(
  speed: number,
  options: PlanetApproachOptions = {},
): PlanetApproach {
  const level = options.level ?? "gravity";
  const seeds =
    options.seed === undefined ? APPROACH_SEEDS : [options.seed];
  const spawnDistance = options.spawnDistance ?? APPROACH_SPAWN_DISTANCE;

  for (const seed of seeds) {
    const base = sim.createSpaceField(level, seed, sim.START_POSITION);
    const candidates = [...base.planetsInView(sim.START_POSITION, 4_000)]
      .filter((planet) => planet.radius > 0)
      .sort(
        (first, second) =>
          planetDistance(sim.START_POSITION, first) -
          planetDistance(sim.START_POSITION, second),
      );

    for (const target of candidates) {
      const direction = unit({
        x: target.position.x - sim.START_POSITION.x,
        y: target.position.y - sim.START_POSITION.y,
      });
      const start = {
        x: target.position.x - direction.x * spawnDistance,
        y: target.position.y - direction.y * spawnDistance,
      };
      const corridor = base.planetsInView(start, spawnDistance + 2_000);
      let clear = true;
      for (const planet of corridor) {
        if (planet.id === target.id) {
          continue;
        }
        if (
          planetDistance(start, planet) <=
          planet.radius + sim.SHIP_RADIUS + 4
        ) {
          clear = false;
          break;
        }
        if (
          segmentDistanceToPoint(start, target.position, planet.position) <=
          planet.radius + sim.SHIP_RADIUS + 250
        ) {
          clear = false;
          break;
        }
      }
      if (!clear) {
        continue;
      }

      const simulation = planetApproach(
        start,
        direction,
        speed,
        seed,
        options,
      );
      const targetStillExists = simulation.world
        .planetsInView(target.position, sim.PLANET_RADIUS + 1)
        .some((planet) => planet.id === target.id);
      if (!targetStillExists) {
        continue;
      }

      return {
        simulation,
        target,
        direction,
        start,
        seed,
      };
    }
  }

  for (const seed of seeds) {
    const base = sim.createSpaceField(level, seed, sim.START_POSITION);
    const candidates = [...base.planetsInView(sim.START_POSITION, 2_000)].sort(
      (first, second) =>
        planetDistance(sim.START_POSITION, first) -
        planetDistance(sim.START_POSITION, second),
    );
    const target = candidates[0];
    if (target === undefined) {
      continue;
    }
    return aimAt(sim.START_POSITION, target, speed, seed, options);
  }

  throw new Error("could not find a deterministic planet approach");
}

export const noThrusters: Action = {
  left: false,
  right: false,
  rear: false,
  top: false,
};
export const rearOnly: Action = {
  left: false,
  right: false,
  rear: true,
  top: false,
};
export const bothThrusters: Action = {
  left: true,
  right: true,
  rear: false,
  top: false,
};
export const allThrusters: Action = {
  left: true,
  right: true,
  rear: true,
  top: false,
};

export function firstTickFallVelocity(gravityScale: number): number {
  return (-sim.GRAVITY * gravityScale * sim.FIXED_DT) /
    (1 + sim.LINEAR_DRAG * sim.FIXED_DT);
}

export function terminalFallVelocity(gravityScale: number): number {
  return (-sim.GRAVITY * gravityScale) / sim.LINEAR_DRAG;
}

interface ControlledFieldOptions {
  seed?: number;
  halfWidth?: number;
  centerY?: number;
  slope?: number;
  walls?: boolean;
}

function circleIntersectsChunk(center: Vec2, radius: number, cx: number, cy: number) {
  const size = sim.FIELD_CHUNK_SIZE;
  const left = cx * size;
  const bottom = cy * size;
  const closestX = Math.max(left, Math.min(center.x, left + size));
  const closestY = Math.max(bottom, Math.min(center.y, bottom + size));
  return (center.x - closestX) ** 2 + (center.y - closestY) ** 2 <= radius ** 2;
}

export function createControlledField({
  seed = 71,
  halfWidth = sim.TUNNEL_HALF_WIDTH,
  centerY = sim.TUNNEL_CENTER_Y,
  slope = 0,
  walls = true,
}: ControlledFieldOptions = {}): Field {
  const chunkSize = sim.FIELD_CHUNK_SIZE;
  const centerAt = (x: number): Vec2 => ({ x, y: centerY + slope * x });
  const tunnel = {
    halfWidth,
    halfWidthAt: (_x: number) => halfWidth,
    centerAt,
    headingAt: (_x: number) => Math.atan(slope),
  };

  const makeChunk = (cx: number, cy: number): FieldChunk => {
    const chunkLeft = cx * chunkSize;
    const chunkRight = (cx + 1) * chunkSize;
    const firstSample = Math.floor(chunkLeft / sim.TUNNEL_SAMPLE_STEP) - 1;
    const lastSample = Math.ceil(chunkRight / sim.TUNNEL_SAMPLE_STEP) + 1;
    const chunkWalls: CurvedWall[] = [];

    if (walls) {
      for (let sample = firstSample; sample <= lastSample; sample += 1) {
        const x0 = sample * sim.TUNNEL_SAMPLE_STEP;
        const x1 = x0 + sim.TUNNEL_SAMPLE_STEP;
        const midpointX = (x0 + x1) / 2;
        if (Math.floor(midpointX / chunkSize) !== cx) {
          continue;
        }

        const firstCenter = centerAt(x0);
        const secondCenter = centerAt(x1);
        for (const side of ["bottom", "top"] as const) {
          const direction = side === "bottom" ? -1 : 1;
          const first = {
            x: x0,
            y: firstCenter.y + direction * halfWidth,
          };
          const second = {
            x: x1,
            y: secondCenter.y + direction * halfWidth,
          };
          const midpointY = (first.y + second.y) / 2;
          if (Math.floor(midpointY / chunkSize) !== cy) {
            continue;
          }
          chunkWalls.push({
            id: `controlled-${side}-${x0}`,
            points: [first, second],
          });
        }
      }
    }

    return { coord: { x: cx, y: cy }, walls: chunkWalls };
  };

  return {
    seed,
    chunkSize,
    tunnel,
    getChunk: makeChunk,
    chunksInView(center: Vec2, radius: number): readonly FieldChunk[] {
      const minCx = Math.floor((center.x - radius) / chunkSize);
      const maxCx = Math.floor((center.x + radius) / chunkSize);
      const minCy = Math.floor((center.y - radius) / chunkSize);
      const maxCy = Math.floor((center.y + radius) / chunkSize);
      const chunks: FieldChunk[] = [];
      for (let cy = minCy; cy <= maxCy; cy += 1) {
        for (let cx = minCx; cx <= maxCx; cx += 1) {
          if (circleIntersectsChunk(center, radius, cx, cy)) {
            chunks.push(makeChunk(cx, cy));
          }
        }
      }
      return chunks;
    },
  };
}

export function createWideTunnelField(seed = 71): Field {
  return createControlledField({ seed, halfWidth: 1_000_000, walls: false });
}

export function tunnelContactY(halfWidth = sim.TUNNEL_HALF_WIDTH): {
  floor: number;
  ceiling: number;
} {
  const clearance = halfWidth - sim.SHIP_RADIUS - sim.WALL_RADIUS;
  return {
    floor: sim.TUNNEL_CENTER_Y - clearance,
    ceiling: sim.TUNNEL_CENTER_Y + clearance,
  };
}

export function createSimulationWithField(
  field: Field,
  options: Omit<SimulationOptions, "field"> = {},
): Simulation {
  return sim.createSimulation({ ...options, field });
}
