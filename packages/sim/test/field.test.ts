import { describe, expect, it } from "vitest";
import type { Field, FieldChunk, Vec2 } from "../src/index";
import { sim } from "./helpers";

interface WallSegment {
  chunk: FieldChunk;
  wallId: string;
  start: Vec2;
  end: Vec2;
}

function collectWallSegments(
  field: Field,
  cxRange: readonly [number, number],
  cyRange: readonly [number, number],
): WallSegment[] {
  const result: WallSegment[] = [];
  for (let cy = cyRange[0]; cy <= cyRange[1]; cy += 1) {
    for (let cx = cxRange[0]; cx <= cxRange[1]; cx += 1) {
      const chunk = field.getChunk(cx, cy);
      for (const wall of chunk.walls) {
        for (let index = 0; index + 1 < wall.points.length; index += 1) {
          result.push({
            chunk,
            wallId: wall.id,
            start: wall.points[index]!,
            end: wall.points[index + 1]!,
          });
        }
      }
    }
  }
  return result;
}

function chunkOrder(a: FieldChunk, b: FieldChunk): number {
  return a.coord.y - b.coord.y || a.coord.x - b.coord.x;
}

describe("seeded endless tunnel field", () => {
  it("exposes the frozen tunnel contract and default field constants", () => {
    const field = sim.createField(41);

    expect(sim.FIELD_CHUNK_SIZE).toBe(80);
    expect(sim.TUNNEL_HALF_WIDTH).toBe(34);
    expect(sim.TUNNEL_CENTER_Y).toBe(60);
    expect(sim.TUNNEL_START_STRAIGHT).toBe(120);
    expect(sim.TUNNEL_BEND_AMPLITUDE).toBe(24);
    expect(sim.TUNNEL_MAX_SLOPE).toBe(0.35);
    expect(sim.TUNNEL_SAMPLE_STEP).toBe(8);
    expect(field.seed).toBe(41);
    expect(field.chunkSize).toBe(sim.FIELD_CHUNK_SIZE);
    expect(field.tunnel.halfWidth).toBe(sim.TUNNEL_HALF_WIDTH);
    expect(typeof field.tunnel.centerAt).toBe("function");
    expect(typeof field.tunnel.headingAt).toBe("function");
    expect(typeof field.getChunk).toBe("function");
    expect(typeof field.chunksInView).toBe("function");
  });

  it("keeps the centerline straight at y=60 through x=120, including negative x", () => {
    const field = sim.createField(314159);

    for (const x of [-10000, -120, -8, 0, 80, 119.999, 120]) {
      expect(field.tunnel.centerAt(x)).toEqual({ x, y: 60 });
      expect(field.tunnel.headingAt(x)).toBe(0);
    }
  });

  it("bounds the seeded bends by 24 m and atan(0.35) heading", () => {
    const field = sim.createField(2026);
    const maximumHeading = Math.atan(sim.TUNNEL_MAX_SLOPE);

    for (let x = sim.TUNNEL_START_STRAIGHT; x <= 20_000; x += 4) {
      const center = field.tunnel.centerAt(x);
      const heading = field.tunnel.headingAt(x);
      expect(Math.abs(center.y - sim.TUNNEL_CENTER_Y)).toBeLessThanOrEqual(
        sim.TUNNEL_BEND_AMPLITUDE,
      );
      expect(Math.abs(heading)).toBeLessThanOrEqual(maximumHeading);
      expect(Number.isFinite(center.x) && Number.isFinite(center.y)).toBe(true);
      expect(Number.isFinite(heading)).toBe(true);
    }
  });

  it("repeats exactly for the same seed and changes bends for a different seed", () => {
    const first = sim.createField(1234);
    const sameSeed = sim.createField(1234);
    const differentSeed = sim.createField(5678);
    const xCoordinates = [120, 128, 256, 512, 1024, 2048, 4096];

    expect(
      xCoordinates.map((x) => [first.tunnel.centerAt(x), first.tunnel.headingAt(x)]),
    ).toEqual(
      xCoordinates.map((x) => [sameSeed.tunnel.centerAt(x), sameSeed.tunnel.headingAt(x)]),
    );
    expect(
      xCoordinates.slice(1).map((x) => first.tunnel.centerAt(x).y),
    ).not.toEqual(xCoordinates.slice(1).map((x) => differentSeed.tunnel.centerAt(x).y));

    for (const [cx, cy] of [[-5, 0], [-2, 1], [0, 0], [3, 1], [8, 0]]) {
      expect(first.getChunk(cx!, cy!)).toEqual(sameSeed.getChunk(cx!, cy!));
    }
  });

  it("samples top and bottom walls every 8 m and keeps every segment in its owning chunk", () => {
    const field = sim.createField(91);
    const segments = collectWallSegments(field, [-4, 4], [-2, 3]);
    const segmentKeys = new Set<string>();

    expect(segments.length).toBeGreaterThan(0);
    for (const { chunk, start, end } of segments) {
      expect(Math.abs(end.x - start.x)).toBe(sim.TUNNEL_SAMPLE_STEP);
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      expect(Math.floor(midpoint.x / field.chunkSize)).toBe(chunk.coord.x);
      expect(Math.floor(midpoint.y / field.chunkSize)).toBe(chunk.coord.y);

      const startCenter = field.tunnel.centerAt(start.x);
      const endCenter = field.tunnel.centerAt(end.x);
      const startOffset = start.y - startCenter.y;
      const endOffset = end.y - endCenter.y;
      const expectedSide = startOffset < 0 ? -sim.TUNNEL_HALF_WIDTH : sim.TUNNEL_HALF_WIDTH;
      expect(startOffset).toBe(expectedSide);
      expect(endOffset).toBe(expectedSide);

      const key = `${start.x}:${start.y}:${end.x}:${end.y}`;
      expect(segmentKeys.has(key)).toBe(false);
      segmentKeys.add(key);
    }
  });

  it("joins sampled wall endpoints across positive and negative chunk seams", () => {
    const field = sim.createField(7001);
    const segments = collectWallSegments(field, [-3, 3], [-2, 3]);

    for (const seamX of [-160, -80, 0, 80, 160]) {
      for (const side of [-1, 1]) {
        const incoming = segments.find(
          ({ start, end }) => start.x === seamX - sim.TUNNEL_SAMPLE_STEP && end.x === seamX &&
            Math.sign((start.y + end.y) / 2 - sim.TUNNEL_CENTER_Y) === side,
        );
        const outgoing = segments.find(
          ({ start, end }) => start.x === seamX && end.x === seamX + sim.TUNNEL_SAMPLE_STEP &&
            Math.sign((start.y + end.y) / 2 - sim.TUNNEL_CENTER_Y) === side,
        );
        expect(incoming).toBeDefined();
        expect(outgoing).toBeDefined();
        expect(incoming!.end).toEqual(outgoing!.start);
      }
    }
  });

  it("supports negative chunks and deterministically assigns each wall segment once", () => {
    const first = sim.createField(314159);
    const second = sim.createField(314159);
    const chunks = collectWallSegments(first, [-5, 2], [-2, 3]);
    const keys = chunks.map(({ start, end }) => `${start.x}:${start.y}:${end.x}:${end.y}`);

    expect(first.getChunk(-3, 0).coord).toEqual({ x: -3, y: 0 });
    expect(chunks.some(({ start, end }) => start.x < 0 && end.x <= 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { chunk } of chunks) {
      expect(first.getChunk(chunk.coord.x, chunk.coord.y)).toEqual(
        second.getChunk(chunk.coord.x, chunk.coord.y),
      );
    }
  });

  it("contains only tunnel walls, with no gates or ground metadata", () => {
    const field = sim.createField(77);

    for (const [cx, cy] of [[-4, -2], [-1, 0], [0, 1], [2, 0], [5, 2]]) {
      const chunk = field.getChunk(cx!, cy!);
      expect(Object.keys(chunk).sort()).toEqual(["coord", "walls"]);
      expect("gates" in chunk).toBe(false);
      expect("groundY" in field).toBe(false);
    }
  });

  it("returns chunks in deterministic cy-then-cx order without duplicates", () => {
    const field = sim.createField(2026);
    const center = { x: -20, y: 95 };
    const chunks = field.chunksInView(center, 120);
    const coordinates = chunks.map(({ coord }) => `${coord.x},${coord.y}`);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks).toEqual([...chunks].sort(chunkOrder));
    expect(new Set(coordinates).size).toBe(coordinates.length);
    expect(field.chunksInView(center, 120)).toEqual(chunks);
  });
});
