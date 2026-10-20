import { describe, expect, it } from "vitest";
import type {
  CurvedWall,
  EyeSensorReading,
  Field,
  FieldChunk,
  Tunnel,
  Vec2,
} from "../src/index";
import {
  createField,
  DEFAULT_SEED,
  EYE_SENSOR_RAY_COUNT,
  EYE_SENSOR_VIEW_DEFAULT,
  EYE_SENSOR_VIEW_MAX,
  EYE_SENSOR_VIEW_MIN,
  FIELD_CHUNK_SIZE,
  SHIP_CAPSULE_HALF_LENGTH,
  SHIP_RADIUS,
  TUNNEL_CENTER_Y,
  TUNNEL_HALF_WIDTH,
  TUNNEL_START_STRAIGHT,
  WALL_RADIUS,
} from "../src/index";
import { clampEyeSensorRadius, scanEyeSensor } from "../src/sensor";

const RIM_EXTENT = SHIP_CAPSULE_HALF_LENGTH + SHIP_RADIUS;
const EIGHTY_DEGREES = (80 * Math.PI) / 180;
const FLOAT_EPSILON = 1e-9;

function wall(id: string, points: readonly Vec2[]): CurvedWall {
  return { id, points };
}

interface BoxBounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

function createBoxWalls(bounds: BoxBounds): CurvedWall[] {
  return [
    wall("left", [
      { x: bounds.left, y: bounds.bottom },
      { x: bounds.left, y: bounds.top },
    ]),
    wall("right", [
      { x: bounds.right, y: bounds.bottom },
      { x: bounds.right, y: bounds.top },
    ]),
    wall("floor", [
      { x: bounds.left, y: bounds.bottom },
      { x: bounds.right, y: bounds.bottom },
    ]),
    wall("ceiling", [
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.top },
    ]),
  ];
}

function createPinnedField(walls: readonly CurvedWall[]): Field {
  const chunk: FieldChunk = { coord: { x: 0, y: 0 }, walls };
  const tunnel: Tunnel = {
    halfWidth: TUNNEL_HALF_WIDTH,
    halfWidthAt: () => TUNNEL_HALF_WIDTH,
    centerAt: (x) => ({ x, y: TUNNEL_CENTER_Y }),
    headingAt: () => 0,
  };

  return {
    seed: DEFAULT_SEED,
    chunkSize: FIELD_CHUNK_SIZE,
    tunnel,
    getChunk: () => chunk,
    chunksInView: () => [chunk],
  };
}

function expectFiniteDistancesWithinRadius(reading: EyeSensorReading): void {
  expect(reading.distances).toHaveLength(EYE_SENSOR_RAY_COUNT);
  for (const distance of reading.distances) {
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThanOrEqual(reading.radius);
  }
}

describe("clampEyeSensorRadius", () => {
  it("uses the documented view limits and default", () => {
    expect(EYE_SENSOR_VIEW_MIN).toBe(20);
    expect(EYE_SENSOR_VIEW_MAX).toBe(200);
    expect(EYE_SENSOR_VIEW_DEFAULT).toBe(120);
  });

  it.each([
    { requested: 120, expected: 120 },
    { requested: EYE_SENSOR_VIEW_MIN, expected: EYE_SENSOR_VIEW_MIN },
    { requested: EYE_SENSOR_VIEW_MAX, expected: EYE_SENSOR_VIEW_MAX },
    { requested: 0, expected: EYE_SENSOR_VIEW_MIN },
    { requested: -1, expected: EYE_SENSOR_VIEW_MIN },
    { requested: 19.999, expected: EYE_SENSOR_VIEW_MIN },
    { requested: 200.001, expected: EYE_SENSOR_VIEW_MAX },
    { requested: 1_000_000, expected: EYE_SENSOR_VIEW_MAX },
    { requested: Number.NaN, expected: EYE_SENSOR_VIEW_DEFAULT },
    { requested: Number.POSITIVE_INFINITY, expected: EYE_SENSOR_VIEW_DEFAULT },
    { requested: Number.NEGATIVE_INFINITY, expected: EYE_SENSOR_VIEW_DEFAULT },
  ])("clamps $requested to $expected", ({ requested, expected }) => {
    expect(clampEyeSensorRadius(requested)).toBe(expected);
  });
});

describe("scanEyeSensor reading shape", () => {
  it("returns 360 finite no-hit distances equal to the radius", () => {
    const field = createPinnedField([]);

    const reading = scanEyeSensor(field, { x: 7.5, y: -12.25 }, -0.75, 80, 456);

    expect(reading.radius).toBe(80);
    expect(reading.tick).toBe(456);
    expect(reading.heading).toBe(-0.75);
    expect(reading.origin).toEqual({ x: 7.5, y: -12.25 });
    expectFiniteDistancesWithinRadius(reading);
    for (const distance of reading.distances) {
      expect(distance).toBe(80);
    }
  });
});

describe("absolute world-angle ray casting", () => {
  it("maps index i to world angle i degrees from the hull rim", () => {
    const field = createPinnedField(
      createBoxWalls({ left: -60, right: 100, bottom: -20, top: 100 }),
    );

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, 0, 200, 0);

    expect(reading.distances[0]).toBeCloseTo(
      100 - RIM_EXTENT - WALL_RADIUS,
      9,
    );
    expect(reading.distances[90]).toBeCloseTo(
      100 - SHIP_RADIUS - WALL_RADIUS,
      9,
    );
    expect(reading.distances[180]).toBeCloseTo(
      60 - RIM_EXTENT - WALL_RADIUS,
      9,
    );
    expect(reading.distances[270]).toBeCloseTo(
      20 - SHIP_RADIUS - WALL_RADIUS,
      9,
    );
    expectFiniteDistancesWithinRadius(reading);
  });

  it("keeps ray indices world-aligned when the ship heading rotates", () => {
    const field = createPinnedField(
      createBoxWalls({ left: -100, right: 100, bottom: -40, top: 40 }),
    );

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, Math.PI / 2, 200, 0);

    expect(reading.heading).toBe(Math.PI / 2);
    expect(reading.distances[0]).toBeCloseTo(100 - SHIP_RADIUS - WALL_RADIUS, 9);
    expect(reading.distances[90]).toBeCloseTo(40 - RIM_EXTENT - WALL_RADIUS, 9);
    expect(reading.distances[180]).toBeCloseTo(
      100 - SHIP_RADIUS - WALL_RADIUS,
      9,
    );
    expect(reading.distances[270]).toBeCloseTo(40 - RIM_EXTENT - WALL_RADIUS, 9);
    expectFiniteDistancesWithinRadius(reading);
  });
});

describe("hull-rim wall distances", () => {
  it("subtracts WALL_RADIUS from the centerline hit and uses the radius on a miss", () => {
    const field = createPinnedField([
      wall("right", [
        { x: 100, y: -100 },
        { x: 100, y: 100 },
      ]),
    ]);

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, 0, 120, 0);

    expect(reading.distances[0]).toBeCloseTo(
      100 - RIM_EXTENT - WALL_RADIUS,
      9,
    );
    expect(reading.distances[90]).toBe(120);
    expect(reading.distances[180]).toBe(120);
    expect(reading.distances[270]).toBe(120);
  });

  it.each([
    { label: "touching the wall surface", floorY: -11 },
    { label: "penetrating to the wall centerline", floorY: -9 },
  ])("clamps a $label hit to zero", ({ floorY }) => {
    const field = createPinnedField([
      wall("floor", [
        { x: -50, y: floorY },
        { x: 50, y: floorY },
      ]),
    ]);

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, 0, 120, 0);

    expect(reading.distances[270]).toBe(0);
    expectFiniteDistancesWithinRadius(reading);
  });

  it.each([
    {
      label: "segment start",
      points: [
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ] satisfies readonly Vec2[],
    },
    {
      label: "segment end",
      points: [
        { x: 100, y: -50 },
        { x: 100, y: 0 },
      ] satisfies readonly Vec2[],
    },
  ])("counts a hit exactly on a $label", ({ points }) => {
    const field = createPinnedField([wall("endpoint", points)]);

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, 0, 120, 0);

    expect(reading.distances[0]).toBeCloseTo(
      100 - RIM_EXTENT - WALL_RADIUS,
      9,
    );
  });

  it("returns the radius for a ray parallel to a wall", () => {
    const field = createPinnedField([
      wall("ceiling", [
        { x: -100, y: 10 },
        { x: 100, y: 10 },
      ]),
    ]);

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, 0, 120, 0);

    expect(reading.distances[0]).toBe(120);
    expect(reading.distances[180]).toBe(120);
    expect(reading.distances[90]).toBe(0);
  });

  it("detects a steep wall and ignores a ray parallel to it", () => {
    const steepDirection = {
      x: Math.cos(EIGHTY_DEGREES),
      y: Math.sin(EIGHTY_DEGREES),
    };
    const anchor = { x: -50, y: 0 };
    const halfLength = 100;
    const field = createPinnedField([
      wall("steep", [
        {
          x: anchor.x - steepDirection.x * halfLength,
          y: anchor.y - steepDirection.y * halfLength,
        },
        {
          x: anchor.x + steepDirection.x * halfLength,
          y: anchor.y + steepDirection.y * halfLength,
        },
      ]),
    ]);

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, 0, 120, 0);

    expect(reading.distances[80]).toBe(120);
    expect(reading.distances[180]).toBeCloseTo(
      50 - RIM_EXTENT - WALL_RADIUS,
      9,
    );
    expect(reading.distances[0]).toBe(120);
  });
});

describe("eye radius bounds and clipping", () => {
  it("reports at radius 20 without exceeding the radius", () => {
    const field = createPinnedField(
      createBoxWalls({ left: -100, right: 40, bottom: -40, top: 40 }),
    );

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, 0, 20, 0);

    expect(reading.radius).toBe(20);
    expect(reading.distances[0]).toBeCloseTo(
      40 - RIM_EXTENT - WALL_RADIUS,
      9,
    );
    expect(reading.distances[90]).toBe(20);
    expect(reading.distances[180]).toBe(20);
    expect(reading.distances[270]).toBe(20);
    expectFiniteDistancesWithinRadius(reading);
  });

  it("reports at radius 200 without clipping nearer walls", () => {
    const field = createPinnedField(
      createBoxWalls({ left: -100, right: 40, bottom: -40, top: 40 }),
    );

    const reading = scanEyeSensor(field, { x: 0, y: 0 }, 0, 200, 0);

    expect(reading.radius).toBe(200);
    expect(reading.distances[0]).toBeCloseTo(
      40 - RIM_EXTENT - WALL_RADIUS,
      9,
    );
    expect(reading.distances[90]).toBeCloseTo(40 - SHIP_RADIUS - WALL_RADIUS, 9);
    expect(reading.distances[180]).toBeCloseTo(
      100 - RIM_EXTENT - WALL_RADIUS,
      9,
    );
    expect(reading.distances[270]).toBeCloseTo(
      40 - SHIP_RADIUS - WALL_RADIUS,
      9,
    );
    expectFiniteDistancesWithinRadius(reading);
  });
});

describe("real tunnel edge cases", () => {
  it("scans negative x with the straight tunnel walls", () => {
    const field = createField(DEFAULT_SEED);
    const origin = { x: -400, y: TUNNEL_CENTER_Y };

    const reading = scanEyeSensor(field, origin, 0, 120, 0);
    const clearance = TUNNEL_HALF_WIDTH - WALL_RADIUS - SHIP_RADIUS;

    expect(reading.origin).toEqual(origin);
    expect(reading.heading).toBe(0);
    expect(reading.distances[0]).toBe(120);
    expect(reading.distances[90]).toBeCloseTo(clearance, 9);
    expect(reading.distances[180]).toBe(120);
    expect(reading.distances[270]).toBeCloseTo(clearance, 9);
    expectFiniteDistancesWithinRadius(reading);
  });

  it("detects walls in a near-vertical section of the generated tunnel", () => {
    const field = createField(DEFAULT_SEED);
    let steepX = TUNNEL_START_STRAIGHT;
    let steepestHeading = 0;

    for (let x = TUNNEL_START_STRAIGHT; x <= 2_200; x += 1) {
      const heading = Math.abs(field.tunnel.headingAt(x));
      if (heading > steepestHeading) {
        steepestHeading = heading;
        steepX = x;
      }
    }

    expect(steepestHeading).toBeGreaterThanOrEqual(
      EIGHTY_DEGREES - FLOAT_EPSILON,
    );

    const center = field.tunnel.centerAt(steepX);
    const heading = field.tunnel.headingAt(steepX);
    const reading = scanEyeSensor(field, center, heading, 120, 0);

    expect(reading.heading).toBe(heading);
    expect(reading.origin).toEqual(center);
    expectFiniteDistancesWithinRadius(reading);
    expect(reading.distances.some((distance) => distance < 120)).toBe(true);
  });
});

describe("reading immutability and determinism", () => {
  it("copies and freezes the origin and distances", () => {
    const field = createPinnedField(
      createBoxWalls({ left: -100, right: 100, bottom: -40, top: 40 }),
    );
    const origin = { x: 5, y: 6 };

    const reading = scanEyeSensor(field, origin, 0, 120, 7);

    expect(reading.origin).toEqual(origin);
    expect(reading.origin).not.toBe(origin);
    expect(Object.isFrozen(reading.origin)).toBe(true);
    expect(Object.isFrozen(reading.distances)).toBe(true);

    origin.x = 999;
    expect(reading.origin.x).toBe(5);
    expect(() => {
      reading.origin.x = 1;
    }).toThrow(TypeError);
    expect(() => {
      (reading.distances as unknown as number[])[0] = 0;
    }).toThrow(TypeError);
  });

  it("repeats identically for the same field, pose, radius, and tick", () => {
    const field = createPinnedField(
      createBoxWalls({ left: -60, right: 100, bottom: -20, top: 100 }),
    );
    const origin = { x: 5, y: 6 };

    const first = scanEyeSensor(field, origin, 0.3, 120, 240);
    const second = scanEyeSensor(field, origin, 0.3, 120, 240);

    expect(first).toEqual(second);
    expect(first.origin).not.toBe(second.origin);
    expect(first.distances).not.toBe(second.distances);
  });
});
