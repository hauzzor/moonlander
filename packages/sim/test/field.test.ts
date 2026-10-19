import { describe, expect, it } from "vitest";
import type { FieldChunk, Vec2 } from "../src/index";
import { sim } from "./helpers";

function pointToSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
        );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function circleIntersectsChunk(center: Vec2, radius: number, cx: number, cy: number): boolean {
  const size = sim.FIELD_CHUNK_SIZE;
  const left = cx * size;
  const bottom = cy * size;
  const closestX = Math.max(left, Math.min(center.x, left + size));
  const closestY = Math.max(bottom, Math.min(center.y, bottom + size));
  return (center.x - closestX) ** 2 + (center.y - closestY) ** 2 <= radius ** 2;
}

function expectedViewCoords(center: Vec2, radius: number): Vec2[] {
  const size = sim.FIELD_CHUNK_SIZE;
  const minCx = Math.floor((center.x - radius) / size) - 1;
  const maxCx = Math.floor((center.x + radius) / size) + 1;
  const minCy = Math.floor((center.y - radius) / size) - 1;
  const maxCy = Math.floor((center.y + radius) / size) + 1;
  const coords: Vec2[] = [];
  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      if (circleIntersectsChunk(center, radius, cx, cy)) {
        coords.push({ x: cx, y: cy });
      }
    }
  }
  return coords.sort((a, b) => a.y - b.y || a.x - b.x);
}

function expectGeneratedChunkShape(chunk: FieldChunk) {
  const { x: cx, y: cy } = chunk.coord;
  const left = cx * sim.FIELD_CHUNK_SIZE;
  const right = (cx + 1) * sim.FIELD_CHUNK_SIZE;
  const bottom = cy * sim.FIELD_CHUNK_SIZE;
  const top = (cy + 1) * sim.FIELD_CHUNK_SIZE;

  expect(chunk.walls.length).toBeGreaterThanOrEqual(1);
  expect(chunk.walls.length).toBeLessThanOrEqual(2);
  for (const wall of chunk.walls) {
    expect(wall.points.length).toBeGreaterThanOrEqual(5);
    expect(wall.points.length).toBeLessThanOrEqual(9);
    for (const point of wall.points) {
      expect(point.x).toBeGreaterThanOrEqual(left);
      expect(point.x).toBeLessThanOrEqual(right);
      expect(point.y).toBeGreaterThanOrEqual(bottom);
      expect(point.y).toBeLessThanOrEqual(top);
      expect(point.y).toBeGreaterThan(sim.GROUND_Y);
    }
  }

  expect(chunk.gates.length).toBeLessThanOrEqual(1);
  for (const gate of chunk.gates) {
    expect(gate.radius).toBeGreaterThanOrEqual(sim.GATE_MIN_RADIUS);
    expect(gate.radius).toBeLessThanOrEqual(sim.GATE_MAX_RADIUS);
    expect(Math.hypot(gate.normal.x, gate.normal.y)).toBeCloseTo(1, 12);
    expect(gate.center.x).toBeGreaterThanOrEqual(left);
    expect(gate.center.x).toBeLessThanOrEqual(right);
    expect(gate.center.y).toBeGreaterThanOrEqual(bottom);
    expect(gate.center.y).toBeLessThanOrEqual(top);

    for (const wall of chunk.walls) {
      for (let index = 0; index + 1 < wall.points.length; index += 1) {
        const centerToSegment = pointToSegmentDistance(
          gate.center,
          wall.points[index]!,
          wall.points[index + 1]!,
        );
        expect(centerToSegment - gate.radius).toBeGreaterThanOrEqual(10);
      }
    }
  }
}

describe("deterministic endless field", () => {
  it("exports the documented field constants and creates a seeded Field", () => {
    expect(sim.GROUND_Y).toBe(0);
    expect(sim.FIELD_CHUNK_SIZE).toBe(80);

    const field = sim.createField(41);
    expect(field.seed).toBe(41);
    expect(field.chunkSize).toBe(80);
    expect(field.groundY).toBe(0);
    expect(typeof field.getChunk).toBe("function");
    expect(typeof field.chunksInView).toBe("function");
  });

  it("generates identical chunks independent of generation and call order", () => {
    const coordinates = [
      { x: -5, y: 4 },
      { x: 3, y: 3 },
      { x: 5, y: 7 },
      { x: 2, y: 9 },
    ];
    const first = sim.createField(1234);
    const second = sim.createField(1234);
    const firstResults = coordinates.map(({ x, y }) => first.getChunk(x, y));
    const reverseResults = [...coordinates]
      .reverse()
      .map(({ x, y }) => second.getChunk(x, y))
      .reverse();

    expect(firstResults).toEqual(reverseResults);
  });

  it("changes generated geometry for a different seed", () => {
    const coordinates = [
      { x: -5, y: 4 },
      { x: 3, y: 3 },
      { x: 5, y: 7 },
      { x: 2, y: 9 },
    ];
    const first = sim.createField(1234);
    const second = sim.createField(5678);

    expect(
      coordinates.map(({ x, y }) => first.getChunk(x, y)),
    ).not.toEqual(coordinates.map(({ x, y }) => second.getChunk(x, y)));
  });

  it("supports negative chunk coordinates and keeps geometry inside each chunk", () => {
    const field = sim.createField(314159);
    const chunk = field.getChunk(-4, 5);

    expect(chunk.coord).toEqual({ x: -4, y: 5 });
    expectGeneratedChunkShape(chunk);
    expect(chunk.walls.some((wall) => wall.points.some((point) => point.x < 0))).toBe(true);
  });

  it("leaves chunks entirely below ground and intersecting safe spawn empty", () => {
    const field = sim.createField(91);

    for (const [cx, cy] of [
      [3, -1],
      [-4, -2],
      [0, 0],
      [1, 1],
      [-2, 1],
    ]) {
      expect(field.getChunk(cx!, cy!)).toEqual({
        coord: { x: cx, y: cy },
        walls: [],
        gates: [],
      });
    }
  });

  it("generates 1-2 valid walls and at most one clear gate in ordinary chunks", () => {
    const field = sim.createField(2026);

    for (const [cx, cy] of [
      [3, 3],
      [5, 4],
      [-4, 5],
    ]) {
      const chunk = field.getChunk(cx!, cy!);
      expect(chunk.coord).toEqual({ x: cx, y: cy });
      expectGeneratedChunkShape(chunk);
    }
  });

  it("returns every intersecting view chunk once in deterministic cy/cx order", () => {
    const field = sim.createField(2026);
    const center = { x: -20, y: 95 };
    const radius = 120;
    const chunks = field.chunksInView(center, radius);
    const coords = chunks.map((chunk) => chunk.coord);
    const expected = expectedViewCoords(center, radius);

    expect(coords).toEqual(expected);
    expect(new Set(coords.map(({ x, y }) => `${x},${y}`)).size).toBe(coords.length);
    expect(field.chunksInView(center, radius)).toEqual(chunks);
  });
});
