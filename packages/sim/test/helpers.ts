import * as sim from "../src/index";
import type {
  Action,
  CurvedWall,
  Field,
  FieldChunk,
  Simulation,
  SimulationOptions,
  Vec2,
} from "../src/index";

export { sim };

export const noThrusters: Action = { left: false, right: false, rear: false };
export const rearOnly: Action = { left: false, right: false, rear: true };
export const bothThrusters: Action = { left: true, right: true, rear: false };

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
