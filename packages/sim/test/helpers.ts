import * as SimModule from "../src/index";
import type {
  Action,
  CurvedWall,
  Field,
  FieldChunk,
  Gate,
  Simulation,
  SimulationOptions,
  Vec2,
} from "../src/index";

type StarshipSimApi = {
  readonly FIXED_DT: number;
  readonly GRAVITY: number;
  readonly GROUND_Y: number;
  readonly FIELD_CHUNK_SIZE: number;
  readonly INITIAL_HULL: number;
  readonly SHIP_MASS: number;
  readonly SHIP_LENGTH: number;
  readonly SHIP_HEIGHT: number;
  readonly SHIP_RADIUS: number;
  readonly SHIP_CAPSULE_HALF_LENGTH: number;
  readonly SHIP_INERTIA: number;
  readonly THRUSTER_FORCE: number;
  readonly THRUSTER_CANT: number;
  readonly LEFT_MOUNT: Vec2;
  readonly RIGHT_MOUNT: Vec2;
  readonly WALL_RADIUS: number;
  readonly GATE_FRAME_RADIUS: number;
  readonly GATE_MIN_RADIUS: number;
  readonly GATE_MAX_RADIUS: number;
  readonly DAMAGE_SPEED_THRESHOLD: number;
  readonly DAMAGE_SCALE: number;
  readonly INVULNERABILITY_SECONDS: number;
  readonly BOUNCE_RESTITUTION: number;
  readonly GATE_BONUS: number;
  readonly SAFE_SPAWN_RADIUS: number;
  readonly START_POSITION: Vec2;
  readonly SENSOR_RANGE: number;
  createField(seed: number): Field;
  createSimulation(options?: SimulationOptions): Simulation;
};

export const sim = SimModule as unknown as StarshipSimApi;
export const noThrusters: Action = { left: false, right: false };
export const bothThrusters: Action = { left: true, right: true };

interface ControlledFieldOptions {
  seed?: number;
  walls?: readonly CurvedWall[];
  gates?: readonly Gate[];
}

function circleIntersectsChunk(center: Vec2, radius: number, cx: number, cy: number) {
  const size = sim.FIELD_CHUNK_SIZE;
  const left = cx * size;
  const right = left + size;
  const bottom = cy * size;
  const top = bottom + size;
  const closestX = Math.max(left, Math.min(center.x, right));
  const closestY = Math.max(bottom, Math.min(center.y, top));
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function createControlledField({
  seed = 71,
  walls = [],
  gates = [],
}: ControlledFieldOptions = {}): Field {
  const makeChunk = (cx: number, cy: number): FieldChunk => ({
    coord: { x: cx, y: cy },
    walls: cx === 0 && cy === 0 ? walls : [],
    gates: cx === 0 && cy === 0 ? gates : [],
  });

  return {
    seed,
    chunkSize: sim.FIELD_CHUNK_SIZE,
    groundY: sim.GROUND_Y,
    getChunk: makeChunk,
    chunksInView(center: Vec2, radius: number): readonly FieldChunk[] {
      const size = sim.FIELD_CHUNK_SIZE;
      const minCx = Math.floor((center.x - radius) / size);
      const maxCx = Math.floor((center.x + radius) / size);
      const minCy = Math.floor((center.y - radius) / size);
      const maxCy = Math.floor((center.y + radius) / size);
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

export function verticalWall(id: string, x: number): CurvedWall {
  return {
    id,
    points: [1, 20, 40, 60, 79].map((y) => ({ x, y })),
  };
}

export function createSimulationWithField(
  field: Field,
  options: Omit<SimulationOptions, "field"> = {},
): Simulation {
  return sim.createSimulation({ ...options, field });
}

export function gateAt(
  id: string,
  center: Vec2 = { x: 40, y: 60 },
  radius = 18,
  normal: Vec2 = { x: 1, y: 0 },
): Gate {
  return { id, center, radius, normal };
}
