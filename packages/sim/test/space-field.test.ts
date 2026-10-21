import { describe, expect, it, vi } from "vitest";
import type { Action, Observation, Planet, SimState, Vec2 } from "../src/index";
import { capsuleEndpoints } from "../src/collision";
import {
  allThrusters,
  bothThrusters,
  createPlanetApproach,
  distance,
  dot,
  noThrusters,
  segmentDistanceToPoint,
  sim,
  unit,
} from "./helpers";

// Linear drag limits unpowered coast distance to v0 / LINEAR_DRAG, so a 380 m
// approach needs a launch speed above 133 m/s to reach the planet.
const APPROACH_SPEED = 125;

function copyPlanet(planet: Planet): Planet {
  return {
    id: planet.id,
    position: { x: planet.position.x, y: planet.position.y },
    velocity: { x: planet.velocity.x, y: planet.velocity.y },
    radius: planet.radius,
    surfaceGravity: planet.surfaceGravity,
    polarity: planet.polarity,
  };
}

function rayCircleSurfaceDistance(
  origin: Vec2,
  direction: Vec2,
  center: Vec2,
  radius: number,
): number | undefined {
  const offsetX = origin.x - center.x;
  const offsetY = origin.y - center.y;
  const b = 2 * (offsetX * direction.x + offsetY * direction.y);
  const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
  const discriminant = b * b - 4 * c;
  if (discriminant < 0) {
    return undefined;
  }
  const distance = (-b - Math.sqrt(discriminant)) / 2;
  return distance >= 0 ? distance : undefined;
}

function eyeRayOrigin(
  position: Vec2,
  heading: number,
  direction: Vec2,
): Vec2 {
  const capsule = capsuleEndpoints(position, heading);
  const startProjection = dot(capsule.start, direction);
  const endProjection = dot(capsule.end, direction);
  const support =
    endProjection >= startProjection ? capsule.end : capsule.start;
  return {
    x: support.x + direction.x * sim.SHIP_RADIUS,
    y: support.y + direction.y * sim.SHIP_RADIUS,
  };
}

function waitForInRangeScan(
  approach: ReturnType<typeof createPlanetApproach>,
): SimState {
  approach.simulation.setEyeSensorRadius(sim.EYE_SENSOR_VIEW_MAX);
  let state = approach.simulation.getState();

  for (let tick = 0; tick < 6_000; tick += 1) {
    state = approach.simulation.step(noThrusters);
    if (state.outcome !== "flying") {
      throw new Error("ship was destroyed before the planet eye scan");
    }
    if (
      state.tick > 0 &&
      state.tick % Math.round(sim.EYE_SENSOR_INTERVAL_SECONDS / sim.FIXED_DT) ===
        0 &&
      distance(state.ship.position, approach.target.position) <=
        sim.EYE_SENSOR_VIEW_MAX
    ) {
      return state;
    }
  }

  throw new Error("ship did not reach planet eye-sensor range");
}

function expectFiniteObservation(observation: Observation): void {
  const { sensors, level, planets, gravityAcceleration, ...numericFields } =
    observation;

  expect(typeof level).toBe("string");
  expect(Array.isArray(planets)).toBe(true);
  expect(Object.values(numericFields).every(Number.isFinite)).toBe(true);
  expect(Number.isFinite(gravityAcceleration.x)).toBe(true);
  expect(Number.isFinite(gravityAcceleration.y)).toBe(true);

  for (const planet of planets) {
    expect(Number.isFinite(planet.position.x)).toBe(true);
    expect(Number.isFinite(planet.position.y)).toBe(true);
    expect(Number.isFinite(planet.velocity.x)).toBe(true);
    expect(Number.isFinite(planet.velocity.y)).toBe(true);
    expect(Number.isFinite(planet.radius)).toBe(true);
    expect(Number.isFinite(planet.surfaceGravity)).toBe(true);
  }

  expect(sensors.eye.distances).toHaveLength(sim.EYE_SENSOR_RAY_COUNT);
  expect(sensors.eye.distances.every(Number.isFinite)).toBe(true);
  expect(sensors.eye.distances.every((distance) => distance >= 0)).toBe(true);
  expect(Number.isFinite(sensors.eye.radius)).toBe(true);
  expect(Number.isFinite(sensors.eye.tick)).toBe(true);
  expect(Number.isFinite(sensors.eye.heading)).toBe(true);
  expect(Number.isFinite(sensors.eye.origin.x)).toBe(true);
  expect(Number.isFinite(sensors.eye.origin.y)).toBe(true);
  expect(Number.isFinite(sensors.direction.angle)).toBe(true);
  expect(Number.isFinite(sensors.distanceToStart)).toBe(true);
  expect(Number.isFinite(sensors.velocity.vx)).toBe(true);
  expect(Number.isFinite(sensors.velocity.vy)).toBe(true);
  expect(Number.isFinite(sensors.velocity.speed)).toBe(true);
  expect(Number.isFinite(sensors.velocity.angle)).toBe(true);
}

describe("Gravity space field wiring", () => {
  it("creates a deterministic open world with planets and no tunnel walls", () => {
    const world = sim.createSpaceField("gravity", 17, sim.START_POSITION);
    const repeated = sim.createSpaceField(
      "gravity",
      17,
      sim.START_POSITION,
    );

    expect(world.kind).toBe("space");
    expect(world.level).toBe("gravity");
    expect(world.seed).toBe(17);
    expect(world.spawn).toEqual(sim.START_POSITION);
    expect(world.planets.length).toBeGreaterThan(0);
    expect(world.planetsInView(sim.START_POSITION, 4_000)).toEqual(
      repeated.planetsInView(sim.START_POSITION, 4_000),
    );
    expect(world.wallsInView(sim.START_POSITION, 10_000)).toEqual([]);
    expect(world.planets.every((planet) => planet.radius === 24)).toBe(true);
  });

  it("wires Gravity state and observation with neutral tunnel fields", () => {
    const simulation = sim.createSimulation({
      level: "gravity",
      seed: 17,
      start: { velocity: { x: 3, y: 4 } },
    });
    const state = simulation.getState();
    const observation = simulation.getObservation();
    const expectedPlanets = simulation.world.planetsInView(
      state.ship.position,
      sim.PLANET_GRAVITY_RANGE,
    );

    expect(simulation.level).toBe("gravity");
    expect(simulation.world.kind).toBe("space");
    expect(state.level).toBe("gravity");
    expect(state.gravity).toBe(0);
    expect(observation.gravity).toBe(0);
    expect(state.gravityScale).toBe(sim.GRAVITY_SCALE_DEFAULT);
    expect(observation.gravityScale).toBe(sim.GRAVITY_SCALE_DEFAULT);
    expect(state.planets).toEqual(expectedPlanets);
    expect(observation.planets).toEqual(expectedPlanets);
    expect(Number.isFinite(state.gravityAcceleration.x)).toBe(true);
    expect(Number.isFinite(state.gravityAcceleration.y)).toBe(true);
    expect(observation.gravityAcceleration).toEqual(
      state.gravityAcceleration,
    );
    expect(observation.tunnelCenterOffset).toBe(0);
    expect(observation.tunnelHalfWidth).toBe(0);
    expect(observation.tunnelHeading).toBe(0);
    expect(observation.forwardSpeed).toBe(3);
    expect(observation.lateralSpeed).toBe(4);
  });

  it("keeps every Gravity observation finite across a mixed action run", () => {
    const simulation = sim.createSimulation({
      level: "gravity",
      seed: 17,
      start: { velocity: { x: 3, y: 4 } },
    });

    expectFiniteObservation(simulation.getObservation());
    for (let tick = 0; tick < 360; tick += 1) {
      simulation.step(
        tick % 3 === 0
          ? bothThrusters
          : tick % 3 === 1
            ? allThrusters
            : noThrusters,
      );
      expectFiniteObservation(simulation.getObservation());
    }
  });

  it("leaves Level 2 planets fixed through state queries and stepBodies", () => {
    const world = sim.createSpaceField("gravity", 17, sim.START_POSITION);
    const before = world.planets.map(copyPlanet);

    world.stepBodies(sim.FIXED_DT);
    world.stepBodies(sim.FIXED_DT);

    expect(world.planets.map(copyPlanet)).toEqual(before);

    const simulation = sim.createSimulation({ level: "gravity", seed: 17 });
    for (let tick = 0; tick < 240; tick += 1) {
      const state = simulation.step(tick % 2 === 0 ? bothThrusters : noThrusters);
      expect(Number.isFinite(state.gravityAcceleration.x)).toBe(true);
      expect(Number.isFinite(state.gravityAcceleration.y)).toBe(true);
    }
    if (simulation.world.kind !== "space") {
      throw new Error("expected a space world");
    }
    expect(simulation.world.planets.map(copyPlanet)).toEqual(before);
  });

  it("uses planet surface clearance for nearestWallDistance and caps it at the sensor range", () => {
    const simulation = sim.createSimulation({ level: "gravity", seed: 17 });
    const observation = simulation.getObservation();
    const world = simulation.world;
    const planets = world.planetsInView(
      observation.x === 0 && observation.y === 60
        ? sim.START_POSITION
        : { x: observation.x, y: observation.y },
      sim.PLANET_SPAWN_CLEARANCE + sim.PLANET_GRAVITY_RANGE,
    );

    expect(planets.length).toBeGreaterThan(0);
    expect(observation.nearestWallDistance).toBe(sim.WALL_SENSOR_RANGE);
  });

  it("hits planet surfaces with eye rays and reports hull clearance to the nearest planet", () => {
    const approach = createPlanetApproach(APPROACH_SPEED);
    const state = waitForInRangeScan(approach);
    const reading = state.sensors.eye;
    const origin = { x: reading.origin.x, y: reading.origin.y };
    const toPlanet = unit({
      x: approach.target.position.x - origin.x,
      y: approach.target.position.y - origin.y,
    });
    const angle = Math.atan2(toPlanet.y, toPlanet.x);
    const degrees = ((angle * 180) / Math.PI + 360) % 360;
    const rayIndex = Math.round(degrees) % sim.EYE_SENSOR_RAY_COUNT;
    const rayAngle = (rayIndex * Math.PI) / 180;
    const rayDirection = {
      x: Math.cos(rayAngle),
      y: Math.sin(rayAngle),
    };
    const expectedRayDistance = rayCircleSurfaceDistance(
      eyeRayOrigin(origin, state.ship.angle, rayDirection),
      rayDirection,
      approach.target.position,
      approach.target.radius,
    );

    expect(state.sensors.eye.distances).toHaveLength(
      sim.EYE_SENSOR_RAY_COUNT,
    );
    expect(state.sensors.eye.distances.every(Number.isFinite)).toBe(true);
    expect(state.sensors.eye.distances.every((value) => value >= 0)).toBe(true);
    expect(expectedRayDistance).toBeDefined();
    expect(reading.distances[rayIndex]).toBeLessThan(reading.radius);
    expect(reading.distances[rayIndex]).toBeCloseTo(
      expectedRayDistance ?? Number.NaN,
      6,
    );

    const capsule = capsuleEndpoints(
      { x: state.ship.position.x, y: state.ship.position.y },
      state.ship.angle,
    );
    const expectedClearance =
      segmentDistanceToPoint(
        capsule.start,
        capsule.end,
        approach.target.position,
      ) -
      sim.SHIP_RADIUS -
      approach.target.radius;
    expect(expectedClearance).toBeLessThan(sim.WALL_SENSOR_RANGE);
    expect(
      approach.simulation.getObservation().nearestWallDistance,
    ).toBeCloseTo(expectedClearance, 5);
  });

  it("does not call Math.random while generating or stepping Gravity", () => {
    const random = vi.spyOn(Math, "random");
    const world = sim.createSpaceField("gravity", 42, sim.START_POSITION);

    world.planetsInView(sim.START_POSITION, 5_000);
    world.gravityAt(sim.START_POSITION);
    world.progressAt(sim.START_POSITION);

    const simulation = sim.createSimulation({ level: "gravity", seed: 42 });
    for (let tick = 0; tick < 240; tick += 1) {
      simulation.step(tick % 2 === 0 ? bothThrusters : allThrusters);
    }

    expect(random).not.toHaveBeenCalled();
  });

  it("keeps Level 1 tunnel behavior, sensors, gravity, and progress regressed", () => {
    const first = sim.createSimulation({ seed: 1234 });
    const second = sim.createSimulation({ seed: 1234 });
    const firstObservation = first.getObservation();

    expect(first.level).toBe("sandworm");
    expect(first.world.kind).toBe("tunnel");
    expect(first.getState().planets).toEqual([]);
    expect(firstObservation.planets).toEqual([]);
    expect(firstObservation.gravityAcceleration).toEqual({
      x: 0,
      y: -sim.GRAVITY,
    });
    expect(firstObservation.tunnelHalfWidth).toBe(sim.TUNNEL_HALF_WIDTH);
    expect(firstObservation.tunnelHeading).toBe(0);
    expect(firstObservation.tunnelCenterOffset).toBe(0);
    expect(firstObservation.nearestWallDistance).toBeCloseTo(
      sim.TUNNEL_HALF_WIDTH - sim.SHIP_RADIUS - sim.WALL_RADIUS,
      12,
    );

    const actions: readonly Action[] = [
      noThrusters,
      bothThrusters,
      allThrusters,
      { left: true, right: false, rear: false },
      { left: false, right: true, rear: false },
      { left: false, right: false, rear: true },
    ];
    for (let tick = 0; tick < 240; tick += 1) {
      const action = actions[tick % actions.length]!;
      expect(first.step(action)).toEqual(second.step(action));
    }

    const state = first.getState();
    const forwardOnly = sim.createSimulation({
      seed: 1234,
      start: { velocity: { x: 5, y: 0 } },
    });
    const progressed = forwardOnly.step(noThrusters);
    expect(progressed.progress).toBeCloseTo(
      progressed.ship.position.x - sim.START_POSITION.x,
      12,
    );

    const backward = sim.createSimulation({
      seed: 1234,
      start: { velocity: { x: -5, y: 0 } },
    });
    const backwards = backward.step(noThrusters);
    expect(backwards.ship.position.x).toBeLessThan(sim.START_POSITION.x);
    expect(backwards.progress).toBe(0);
    expect(state.progress).toBeGreaterThanOrEqual(0);
  });
});
