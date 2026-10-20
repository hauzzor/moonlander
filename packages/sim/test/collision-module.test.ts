import { describe, expect, it } from "vitest";
import {
  BOUNCE_RESTITUTION,
  FIXED_DT,
  SHIP_CAPSULE_HALF_LENGTH,
  SHIP_RADIUS,
  TUNNEL_CENTER_Y,
  TUNNEL_HALF_WIDTH,
  WALL_RADIUS,
  WALL_SENSOR_RANGE,
  createField,
} from "../src/index";
import type { CurvedWall, Field, FieldChunk, Vec2 } from "../src/types";
import {
  advanceWithCollisions,
  capsuleEndpoints,
  nearestWallDistance,
} from "../src/collision";

const FLOOR_CENTERLINE_Y = TUNNEL_CENTER_Y - TUNNEL_HALF_WIDTH;
const CEILING_CENTERLINE_Y = TUNNEL_CENTER_Y + TUNNEL_HALF_WIDTH;
const SURFACE_DISTANCE = SHIP_RADIUS + WALL_RADIUS;
const FLOOR_SURFACE_Y = FLOOR_CENTERLINE_Y + SURFACE_DISTANCE;
const CEILING_SURFACE_Y = CEILING_CENTERLINE_Y - SURFACE_DISTANCE;

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function horizontalWall(id: string, y: number): CurvedWall {
  return {
    id,
    points: [
      { x: -1000, y },
      { x: 1000, y },
    ],
  };
}

function makeField(walls: readonly CurvedWall[]): Field {
  const chunk: FieldChunk = { coord: { x: 0, y: 0 }, walls };
  return {
    seed: 1,
    chunkSize: 80,
    tunnel: {
      halfWidth: TUNNEL_HALF_WIDTH,
      halfWidthAt: (): number => TUNNEL_HALF_WIDTH,
      centerAt: (x: number): Vec2 => ({ x, y: TUNNEL_CENTER_Y }),
      headingAt: (): number => 0,
    },
    getChunk: (): FieldChunk => chunk,
    chunksInView: (): readonly FieldChunk[] => [chunk],
  };
}

const realField = createField(1);
const flatField = makeField([
  horizontalWall("floor", FLOOR_CENTERLINE_Y),
  horizontalWall("ceiling", CEILING_CENTERLINE_Y),
]);

interface AngledSetup {
  label: string;
  angle: number;
  normalSpeed: number;
  tangentSpeed: number;
}

interface AngledCase {
  field: Field;
  through: Vec2;
  normal: Vec2;
  tangent: Vec2;
  position: Vec2;
  velocity: Vec2;
}

function createAngledCase({
  angle,
  normalSpeed,
  tangentSpeed,
}: AngledSetup): AngledCase {
  const tangent: Vec2 = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal: Vec2 = { x: -Math.sin(angle), y: Math.cos(angle) };
  const through: Vec2 = { x: 0, y: TUNNEL_CENTER_Y };
  const startDistance = SURFACE_DISTANCE + 0.005;
  const end = {
    x: through.x + startDistance * normal.x,
    y: through.y + startDistance * normal.y,
  };
  const position = {
    x: end.x - SHIP_CAPSULE_HALF_LENGTH,
    y: end.y,
  };
  const velocity = {
    x: -normalSpeed * normal.x + tangentSpeed * tangent.x,
    y: -normalSpeed * normal.y + tangentSpeed * tangent.y,
  };
  const wall: CurvedWall = {
    id: `angled-${angle}`,
    points: [
      {
        x: through.x - tangent.x * 1000,
        y: through.y - tangent.y * 1000,
      },
      {
        x: through.x + tangent.x * 1000,
        y: through.y + tangent.y * 1000,
      },
    ],
  };

  return {
    field: makeField([wall]),
    through,
    normal,
    tangent,
    position,
    velocity,
  };
}

function minHullClearance(
  through: Vec2,
  normal: Vec2,
  position: Vec2,
  angle: number,
): number {
  const capsule = capsuleEndpoints(position, angle);
  return (
    Math.min(
      dot(
        { x: capsule.start.x - through.x, y: capsule.start.y - through.y },
        normal,
      ),
      dot(
        { x: capsule.end.x - through.x, y: capsule.end.y - through.y },
        normal,
      ),
    ) - SURFACE_DISTANCE
  );
}

describe("collision constants", () => {
  it("uses the frozen restitution, capsule, and sensor constants", () => {
    expect(BOUNCE_RESTITUTION).toBe(0.35);
    expect(SHIP_CAPSULE_HALF_LENGTH).toBe(15);
    expect(SHIP_RADIUS).toBe(9);
    expect(WALL_RADIUS).toBe(2);
    expect(WALL_SENSOR_RANGE).toBe(200);
  });
});

describe("capsuleEndpoints", () => {
  const cases = [
    { label: "level", angle: 0 },
    { label: "vertical", angle: Math.PI / 2 },
    { label: "tilted", angle: Math.PI / 7 },
  ];

  it.each(cases)(
    "places the capsule ends around $label ship position",
    ({ angle }) => {
      const position: Vec2 = { x: 7, y: -3 };
      const capsule = capsuleEndpoints(position, angle);
      const offset: Vec2 = {
        x: SHIP_CAPSULE_HALF_LENGTH * Math.cos(angle),
        y: SHIP_CAPSULE_HALF_LENGTH * Math.sin(angle),
      };

      expect(capsule.start.x).toBeCloseTo(position.x - offset.x, 12);
      expect(capsule.start.y).toBeCloseTo(position.y - offset.y, 12);
      expect(capsule.end.x).toBeCloseTo(position.x + offset.x, 12);
      expect(capsule.end.y).toBeCloseTo(position.y + offset.y, 12);
      expect((capsule.start.x + capsule.end.x) / 2).toBeCloseTo(
        position.x,
        12,
      );
      expect((capsule.start.y + capsule.end.y) / 2).toBeCloseTo(
        position.y,
        12,
      );
      expect(
        Math.hypot(
          capsule.end.x - capsule.start.x,
          capsule.end.y - capsule.start.y,
        ),
      ).toBeCloseTo(2 * SHIP_CAPSULE_HALF_LENGTH, 12);
      expect(position).toEqual({ x: 7, y: -3 });
    },
  );
});

describe("advanceWithCollisions movement", () => {
  const cases = [
    {
      label: "level flight",
      position: { x: 100, y: 60 },
      velocity: { x: 3, y: -2 },
      angle: 0.4,
      angularVelocity: 0,
    },
    {
      label: "rotating flight",
      position: { x: -20, y: 75 },
      velocity: { x: -1, y: 4 },
      angle: -0.7,
      angularVelocity: 2.5,
    },
  ];

  it.each(cases)(
    "integrates $label without a wall contact",
    ({ position, velocity, angle, angularVelocity }) => {
      const field = makeField([]);
      const originalPosition = { ...position };
      const originalVelocity = { ...velocity };
      const result = advanceWithCollisions(
        field,
        position,
        velocity,
        angle,
        angularVelocity,
        FIXED_DT,
      );

      expect(result.position.x).toBeCloseTo(
        position.x + velocity.x * FIXED_DT,
        9,
      );
      expect(result.position.y).toBeCloseTo(
        position.y + velocity.y * FIXED_DT,
        9,
      );
      expect(result.angle).toBeCloseTo(angle + angularVelocity * FIXED_DT, 9);
      expect(result.velocity.x).toBeCloseTo(velocity.x, 9);
      expect(result.velocity.y).toBeCloseTo(velocity.y, 9);
      expect(result.maxImpactSpeed).toBe(0);
      expect(position).toEqual(originalPosition);
      expect(velocity).toEqual(originalVelocity);
    },
  );
});

describe("floor and ceiling bounce", () => {
  const cases = [
    {
      label: "floor at low normal speed",
      surface: "floor" as const,
      y: FLOOR_SURFACE_Y + 0.005,
      vx: 0,
      vy: -1,
      expectedVx: 0,
      expectedVy: 0.35,
      expectedImpact: 1,
    },
    {
      label: "floor with tangential velocity",
      surface: "floor" as const,
      y: FLOOR_SURFACE_Y + 0.005,
      vx: 7,
      vy: -4,
      expectedVx: 7,
      expectedVy: 1.4,
      expectedImpact: 4,
    },
    {
      label: "floor at high speed",
      surface: "floor" as const,
      y: FLOOR_SURFACE_Y + 0.005,
      vx: 0,
      vy: -10,
      expectedVx: 0,
      expectedVy: 3.5,
      expectedImpact: 10,
    },
    {
      label: "ceiling with tangential velocity",
      surface: "ceiling" as const,
      y: CEILING_SURFACE_Y - 0.005,
      vx: -3,
      vy: 5,
      expectedVx: -3,
      expectedVy: -1.75,
      expectedImpact: 5,
    },
  ];

  it.each(cases)(
    "reflects $label with restitution and preserves tangential velocity",
    ({ surface, y, vx, vy, expectedVx, expectedVy, expectedImpact }) => {
      const result = advanceWithCollisions(
        realField,
        { x: 40, y },
        { x: vx, y: vy },
        0,
        0,
        FIXED_DT,
      );

      expect(result.velocity.x).toBeCloseTo(expectedVx, 9);
      expect(result.velocity.y).toBeCloseTo(expectedVy, 9);
      expect(result.maxImpactSpeed).toBeCloseTo(expectedImpact, 9);
      expect(nearestWallDistance(realField, result.position, result.angle))
        .toBeGreaterThanOrEqual(-1e-9);

      if (surface === "floor") {
        expect(result.position.y).toBeGreaterThanOrEqual(FLOOR_SURFACE_Y);
      } else {
        expect(result.position.y).toBeLessThanOrEqual(CEILING_SURFACE_Y);
      }
    },
  );
});

describe("shallow and steep walls", () => {
  const cases: AngledSetup[] = [
    {
      label: "shallow 10 degree wall",
      angle: (10 * Math.PI) / 180,
      normalSpeed: 8,
      tangentSpeed: 3,
    },
    {
      label: "steep 80 degree wall",
      angle: (80 * Math.PI) / 180,
      normalSpeed: 5,
      tangentSpeed: -2,
    },
  ];

  it.each(cases)(
    "reflects the normal component and preserves the tangent on a $label",
    (setup) => {
      const { field, through, normal, tangent, position, velocity } =
        createAngledCase(setup);
      const result = advanceWithCollisions(
        field,
        position,
        velocity,
        0,
        0,
        FIXED_DT,
      );

      expect(dot(result.velocity, normal)).toBeCloseTo(
        BOUNCE_RESTITUTION * setup.normalSpeed,
        9,
      );
      expect(dot(result.velocity, tangent)).toBeCloseTo(
        setup.tangentSpeed,
        9,
      );
      expect(result.maxImpactSpeed).toBeCloseTo(setup.normalSpeed, 9);

      const clearance = minHullClearance(
        through,
        normal,
        result.position,
        result.angle,
      );
      expect(clearance).toBeGreaterThan(0);
      expect(clearance).toBeLessThan(0.01);
    },
  );
});

describe("penetration push-out", () => {
  const cases = [
    {
      label: "deep floor penetration",
      y: 30,
      vy: 0,
      expectedVy: 0,
      expectedImpact: 0,
      pushed: true,
    },
    {
      label: "floor penetration with inward velocity",
      y: FLOOR_SURFACE_Y - 0.1,
      vy: -2,
      expectedVy: 0.7,
      expectedImpact: 2,
      pushed: true,
    },
    {
      label: "capsule exactly touching the floor",
      y: FLOOR_SURFACE_Y,
      vy: 0,
      expectedVy: 0,
      expectedImpact: 0,
      pushed: false,
    },
  ];

  it.each(cases)(
    "resolves $label without leaving the hull inside the wall",
    ({ y, vy, expectedVy, expectedImpact, pushed }) => {
      const result = advanceWithCollisions(
        flatField,
        { x: 40, y },
        { x: 0, y: vy },
        0,
        0,
        FIXED_DT,
      );
      const clearance = nearestWallDistance(
        flatField,
        result.position,
        result.angle,
      );

      expect(result.velocity.x).toBeCloseTo(0, 9);
      expect(result.velocity.y).toBeCloseTo(expectedVy, 9);
      expect(result.maxImpactSpeed).toBeCloseTo(expectedImpact, 9);
      expect(clearance).toBeGreaterThanOrEqual(-1e-9);

      if (pushed) {
        expect(clearance).toBeGreaterThan(0);
        expect(clearance).toBeLessThanOrEqual(0.01);
        expect(result.position.y).toBeGreaterThanOrEqual(FLOOR_SURFACE_Y);
      } else {
        expect(result.position.y).toBeCloseTo(y, 12);
        expect(clearance).toBeCloseTo(0, 9);
      }
    },
  );
});

describe("no tunneling at high speed", () => {
  const cases = [
    { label: "floor", vy: -10_000 },
    { label: "ceiling", vy: 10_000 },
  ];

  it.each(cases)(
    "stays inside the tunnel after a $label impact at 10,000 m/s",
    ({ vy }) => {
      const result = advanceWithCollisions(
        realField,
        { x: 40, y: TUNNEL_CENTER_Y },
        { x: 0, y: vy },
        0,
        0,
        FIXED_DT,
      );

      expect(result.maxImpactSpeed).toBeCloseTo(10_000, 6);
      expect(result.position.y).toBeGreaterThan(FLOOR_CENTERLINE_Y);
      expect(result.position.y).toBeLessThan(CEILING_CENTERLINE_Y);
      expect(nearestWallDistance(realField, result.position, result.angle))
        .toBeGreaterThanOrEqual(-1e-9);
    },
  );

  it("does not tunnel through a steep wall at 10,000 m/s", () => {
    const setup: AngledSetup = {
      label: "steep",
      angle: (80 * Math.PI) / 180,
      normalSpeed: 10_000,
      tangentSpeed: 0,
    };
    const { field, through, normal, position, velocity } =
      createAngledCase(setup);
    const result = advanceWithCollisions(
      field,
      position,
      velocity,
      0,
      0,
      FIXED_DT,
    );

    expect(result.maxImpactSpeed).toBeCloseTo(10_000, 6);
    expect(dot(result.velocity, normal)).toBeCloseTo(
      BOUNCE_RESTITUTION * setup.normalSpeed,
      6,
    );
    expect(
      minHullClearance(through, normal, result.position, result.angle),
    ).toBeGreaterThan(0);
  });
});

describe("multiple contacts in one step", () => {
  const cornerField = makeField([
    horizontalWall("floor", FLOOR_CENTERLINE_Y),
    {
      id: "wall",
      points: [
        { x: 26.005, y: -1000 },
        { x: 26.005, y: 1000 },
      ],
    },
  ]);
  const seamField = makeField([
    {
      id: "floor-left",
      points: [
        { x: -1000, y: FLOOR_CENTERLINE_Y },
        { x: 0, y: FLOOR_CENTERLINE_Y },
      ],
    },
    {
      id: "floor-right",
      points: [
        { x: 0, y: FLOOR_CENTERLINE_Y },
        { x: 1000, y: FLOOR_CENTERLINE_Y },
      ],
    },
  ]);
  const cases = [
    {
      label: "corner",
      field: cornerField,
      vx: 3,
      expectedVx: -0.35 * 3,
      expectedVy: 0.35 * 5,
      expectedImpact: 5,
    },
    {
      label: "seam",
      field: seamField,
      vx: 0,
      expectedVx: 0,
      expectedVy: 0.35 * 5,
      expectedImpact: 5,
    },
  ];

  it.each(cases)(
    "returns the largest impact speed across $label contacts",
    ({ field, vx, expectedVx, expectedVy, expectedImpact }) => {
      const result = advanceWithCollisions(
        field,
        { x: 0, y: FLOOR_SURFACE_Y + 0.005 },
        { x: vx, y: -5 },
        0,
        0,
        FIXED_DT,
      );
      const clearance = nearestWallDistance(
        field,
        result.position,
        result.angle,
      );

      expect(result.velocity.x).toBeCloseTo(expectedVx, 9);
      expect(result.velocity.y).toBeCloseTo(expectedVy, 9);
      expect(result.maxImpactSpeed).toBeCloseTo(expectedImpact, 9);
      expect(clearance).toBeGreaterThan(0);
      expect(clearance).toBeLessThanOrEqual(0.01);
    },
  );
});

describe("nearestWallDistance", () => {
  function verticalWallField(x: number): Field {
    return makeField([
      {
        id: `wall-${x}`,
        points: [
          { x, y: -1000 },
          { x, y: 1000 },
        ],
      },
    ]);
  }

  const cases = [
    {
      label: "touching the floor",
      field: realField,
      position: { x: 40, y: FLOOR_SURFACE_Y },
      angle: 0,
      expected: 0,
    },
    {
      label: "penetrating the floor",
      field: realField,
      position: { x: 40, y: FLOOR_SURFACE_Y - 1 },
      angle: 0,
      expected: -1,
    },
    {
      label: "inside the sensor range above the tunnel",
      field: flatField,
      position: { x: 40, y: 150 },
      angle: 0,
      expected: 150 - CEILING_CENTERLINE_Y - SURFACE_DISTANCE,
    },
    {
      label: "exactly at the sensor range",
      field: verticalWallField(226),
      position: { x: 0, y: TUNNEL_CENTER_Y },
      angle: 0,
      expected: WALL_SENSOR_RANGE,
    },
    {
      label: "beyond the sensor range",
      field: verticalWallField(227),
      position: { x: 0, y: TUNNEL_CENTER_Y },
      angle: 0,
      expected: WALL_SENSOR_RANGE,
    },
    {
      label: "far outside the sensor range",
      field: verticalWallField(1000),
      position: { x: 0, y: TUNNEL_CENTER_Y },
      angle: 0,
      expected: WALL_SENSOR_RANGE,
    },
    {
      label: "vertical capsule centered",
      field: realField,
      position: { x: 40, y: TUNNEL_CENTER_Y },
      angle: Math.PI / 2,
      expected:
        TUNNEL_HALF_WIDTH - SHIP_CAPSULE_HALF_LENGTH - SURFACE_DISTANCE,
    },
  ];

  it.each(cases)(
    "returns the hull clearance for a $label",
    ({ field, position, angle, expected }) => {
      const distance = nearestWallDistance(field, position, angle);

      expect(Number.isFinite(distance)).toBe(true);
      expect(distance).toBeCloseTo(expected, 9);
    },
  );
});

describe("determinism", () => {
  it("returns identical results and does not mutate inputs or field state", () => {
    const position: Vec2 = { x: 40, y: FLOOR_SURFACE_Y + 0.005 };
    const velocity: Vec2 = { x: 3, y: -5 };
    const wallsBefore = realField.chunksInView(position, 300)
      .flatMap((chunk) => chunk.walls)
      .map((wall) => wall.points.map((point) => ({ ...point })));

    const first = advanceWithCollisions(
      realField,
      position,
      velocity,
      0,
      0,
      FIXED_DT,
    );
    const second = advanceWithCollisions(
      realField,
      position,
      velocity,
      0,
      0,
      FIXED_DT,
    );
    const wallsAfter = realField.chunksInView(position, 300)
      .flatMap((chunk) => chunk.walls)
      .map((wall) => wall.points.map((point) => ({ ...point })));

    expect(second).toEqual(first);
    expect(position).toEqual({ x: 40, y: FLOOR_SURFACE_Y + 0.005 });
    expect(velocity).toEqual({ x: 3, y: -5 });
    expect(wallsAfter).toEqual(wallsBefore);
    expect(nearestWallDistance(realField, first.position, first.angle)).toBe(
      nearestWallDistance(realField, first.position, first.angle),
    );
  });
});
