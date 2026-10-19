import { describe, expect, it } from "vitest";
import type { Action, CurvedWall, Field, SimulationOptions } from "../src/index";
import {
  bothThrusters,
  createControlledField,
  createSimulationWithField,
  noThrusters,
  sim,
} from "./helpers";

function findGeneratedWallApproach(field: Field): {
  start: NonNullable<SimulationOptions["start"]>;
  wall: CurvedWall;
} {
  for (let cy = 1; cy <= 12; cy += 1) {
    for (let cx = -12; cx <= 12; cx += 1) {
      const chunk = field.getChunk(cx, cy);
      for (const wall of chunk.walls) {
        for (let index = 0; index + 1 < wall.points.length; index += 1) {
          const first = wall.points[index]!;
          const second = wall.points[index + 1]!;
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const length = Math.hypot(dx, dy);
          if (length === 0) {
            continue;
          }
          const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
          if (
            Math.hypot(
              midpoint.x - sim.START_POSITION.x,
              midpoint.y - sim.START_POSITION.y,
            ) <= sim.SAFE_SPAWN_RADIUS ||
            midpoint.y <= sim.SHIP_RADIUS + sim.WALL_RADIUS + 1
          ) {
            continue;
          }
          const hasClearanceFromGates = chunk.gates.every(
            (gate) =>
              Math.hypot(gate.center.x - midpoint.x, gate.center.y - midpoint.y) >
              gate.radius + sim.SHIP_RADIUS + sim.WALL_RADIUS + 2,
          );
          if (!hasClearanceFromGates) {
            continue;
          }
          const normal = { x: -dy / length, y: dx / length };
          return {
            wall,
            start: {
              position: {
                x: midpoint.x + normal.x * (sim.SHIP_RADIUS + sim.WALL_RADIUS - 0.1),
                y: midpoint.y + normal.y * (sim.SHIP_RADIUS + sim.WALL_RADIUS - 0.1),
              },
              velocity: { x: -normal.x * 5, y: -normal.y * 5 },
              angle: Math.atan2(dy, dx),
              angularVelocity: 0,
            },
          };
        }
      }
    }
  }
  throw new Error("Expected seeded chunks outside the safe spawn to contain a wall segment");
}

describe("Starship fixed-step simulation", () => {
  it("exports the documented Starship physics, field, damage, and scoring constants", () => {
    expect(sim.FIXED_DT).toBe(1 / 120);
    expect(sim.GRAVITY).toBe(1.62);
    expect(sim.GROUND_Y).toBe(0);
    expect(sim.FIELD_CHUNK_SIZE).toBe(80);
    expect(sim.INITIAL_HULL).toBe(100);
    expect(sim.SHIP_MASS).toBe(200);
    expect(sim.SHIP_LENGTH).toBe(48);
    expect(sim.SHIP_HEIGHT).toBe(18);
    expect(sim.SHIP_RADIUS).toBe(9);
    expect(sim.SHIP_CAPSULE_HALF_LENGTH).toBe(15);
    expect(sim.SHIP_INERTIA).toBe(43800);
    expect(sim.THRUSTER_FORCE).toBe(700);
    expect(sim.THRUSTER_CANT).toBe((15 * Math.PI) / 180);
    expect(sim.LEFT_MOUNT).toEqual({ x: -16, y: -9 });
    expect(sim.RIGHT_MOUNT).toEqual({ x: 16, y: -9 });
    expect(sim.WALL_RADIUS).toBe(2);
    expect(sim.GATE_FRAME_RADIUS).toBe(2);
    expect(sim.GATE_MIN_RADIUS).toBe(12);
    expect(sim.GATE_MAX_RADIUS).toBe(18);
    expect(sim.DAMAGE_SPEED_THRESHOLD).toBe(2);
    expect(sim.DAMAGE_SCALE).toBe(4);
    expect(sim.INVULNERABILITY_SECONDS).toBe(0.75);
    expect(sim.BOUNCE_RESTITUTION).toBe(0.35);
    expect(sim.GATE_BONUS).toBe(50);
    expect(sim.SAFE_SPAWN_RADIUS).toBe(100);
    expect(sim.START_POSITION).toEqual({ x: 0, y: 60 });
    expect(sim.SENSOR_RANGE).toBe(200);
  });

  it("starts at the exact documented default state without a fuel property", () => {
    const state = sim.createSimulation().getState();

    expect(state).toEqual({
      tick: 0,
      time: 0,
      seed: 1,
      ship: {
        position: { x: 0, y: 60 },
        velocity: { x: 0, y: 0 },
        angle: 0,
        angularVelocity: 0,
      },
      hull: 100,
      invulnerable: false,
      thrusters: noThrusters,
      outcome: "flying",
      score: 0,
      progress: 0,
      gatesPassed: 0,
    });
    expect("fuel" in state).toBe(false);
  });

  it("advances exactly one 1/120-second tick and derives time from the tick", () => {
    expect(sim.FIXED_DT).toBe(1 / 120);

    const simulation = sim.createSimulation();
    const first = simulation.step(noThrusters);
    const second = simulation.step(noThrusters);

    expect(first.tick).toBe(1);
    expect(first.time).toBe(sim.FIXED_DT);
    expect(second.tick).toBe(2);
    expect(second.time).toBe(2 * sim.FIXED_DT);
  });

  it("accelerates downward at 1.62 m/s² under gravity with both thrusters off", () => {
    expect(sim.GRAVITY).toBe(1.62);

    const state = sim.createSimulation().step(noThrusters);

    expect(state.ship.velocity.x).toBe(0);
    expect(state.ship.velocity.y).toBeCloseTo(-sim.GRAVITY * sim.FIXED_DT, 12);
    expect(state.ship.angularVelocity).toBe(0);
    expect(state.thrusters).toEqual(noThrusters);
  });

  it("fires Q and W with the documented lateral-force and torque signs", () => {
    const left = sim.createSimulation().step({ left: true, right: false });
    const right = sim.createSimulation().step({ left: false, right: true });
    const leftForceX = sim.THRUSTER_FORCE * Math.sin(sim.THRUSTER_CANT);
    const horizontalDelta = (leftForceX / sim.SHIP_MASS) * sim.FIXED_DT;

    expect(left.ship.velocity.x).toBeCloseTo(horizontalDelta, 12);
    expect(left.ship.angularVelocity).toBeLessThan(0);
    expect(left.thrusters).toEqual({ left: true, right: false });
    expect(right.ship.velocity.x).toBeCloseTo(-horizontalDelta, 12);
    expect(right.ship.angularVelocity).toBeGreaterThan(0);
    expect(right.thrusters).toEqual({ left: false, right: true });
  });

  it("balances lateral force and torque while both thrusters provide lift", () => {
    const state = sim.createSimulation().step(bothThrusters);
    const verticalAcceleration =
      (2 * sim.THRUSTER_FORCE * Math.cos(sim.THRUSTER_CANT)) / sim.SHIP_MASS -
      sim.GRAVITY;

    expect(state.ship.velocity.x).toBeCloseTo(0, 12);
    expect(state.ship.angularVelocity).toBeCloseTo(0, 12);
    expect(state.ship.velocity.y).toBeCloseTo(verticalAcceleration * sim.FIXED_DT, 12);
    expect(state.thrusters).toEqual(bothThrusters);
  });

  it("has approximately 1.5x the old lander's linear and angular response", () => {
    const left = sim.createSimulation().step({ left: true, right: false });
    const oldMass = 200;
    const oldForce = 500;
    const oldCant = (15 * Math.PI) / 180;
    const oldLeftMount = { x: -12, y: -12 };
    const oldInertia = (oldMass * (36 ** 2 + 24 ** 2)) / 12;
    const oldForceVector = {
      x: oldForce * Math.sin(oldCant),
      y: oldForce * Math.cos(oldCant),
    };
    const oldTorque =
      oldLeftMount.x * oldForceVector.y - oldLeftMount.y * oldForceVector.x;
    const newForceVector = {
      x: sim.THRUSTER_FORCE * Math.sin(sim.THRUSTER_CANT),
      y: sim.THRUSTER_FORCE * Math.cos(sim.THRUSTER_CANT),
    };
    const newTorque =
      sim.LEFT_MOUNT.x * newForceVector.y - sim.LEFT_MOUNT.y * newForceVector.x;

    // The previous landing constants were 500 N, 200 kg, a 36x24 m box
    // (26,400 kg·m² inertia), and a (-12,-12) m left mount. Compare force/mass
    // and |torque|/inertia directly against the documented Starship constants.
    const linearRatio = (sim.THRUSTER_FORCE / sim.SHIP_MASS) / (oldForce / oldMass);
    const angularRatio =
      (Math.abs(newTorque) / sim.SHIP_INERTIA) / (Math.abs(oldTorque) / oldInertia);
    const measuredAngularAcceleration = Math.abs(left.ship.angularVelocity) / sim.FIXED_DT;

    expect(linearRatio).toBeGreaterThanOrEqual(1.2);
    expect(linearRatio).toBeLessThanOrEqual(1.6);
    expect(angularRatio).toBeGreaterThanOrEqual(1.2);
    expect(angularRatio).toBeLessThanOrEqual(1.6);
    expect(measuredAngularAcceleration).toBeCloseTo(Math.abs(newTorque) / sim.SHIP_INERTIA, 10);
  });

  it("keeps both thrusters available indefinitely and has no fuel state", () => {
    const field = createControlledField({ seed: 19 });
    const simulation = createSimulationWithField(field);
    let state = simulation.getState();

    for (let tick = 0; tick < 2400; tick += 1) {
      state = simulation.step(bothThrusters);
    }

    expect(state.tick).toBe(2400);
    expect(state.thrusters).toEqual(bothThrusters);
    expect(state.outcome).toBe("flying");
    expect(state.ship.position.y).toBeGreaterThan(60);
    expect("fuel" in state).toBe(false);
    expect("fuel" in simulation.getObservation()).toBe(false);
  });

  it("replays identical seeded state and generated-field collision effects", () => {
    const seed = 314159;
    const field = sim.createField(seed);
    const { start } = findGeneratedWallApproach(field);
    const options = { seed, start };
    const first = sim.createSimulation(options);
    const second = sim.createSimulation(options);
    const relevantChunk = field.getChunk(
      Math.floor(start.position!.x / sim.FIELD_CHUNK_SIZE),
      Math.floor(start.position!.y / sim.FIELD_CHUNK_SIZE),
    );
    const sameSeedChunk = sim.createField(seed).getChunk(
      relevantChunk.coord.x,
      relevantChunk.coord.y,
    );
    const actions: Action[] = [
      noThrusters,
      { left: true, right: false },
      bothThrusters,
      { left: false, right: true },
      noThrusters,
    ];

    expect(first.field.getChunk(relevantChunk.coord.x, relevantChunk.coord.y)).toEqual(
      sameSeedChunk,
    );
    for (const action of actions) {
      expect(first.step(action)).toEqual(second.step(action));
    }
    expect(first.getState().hull).toBeLessThan(sim.INITIAL_HULL);
  });

  it("reset(seed) changes the generated field and restores the configured initial state", () => {
    const options = {
      seed: 17,
      hull: 76,
      start: {
        position: { x: 220, y: 140 },
        velocity: { x: 1.25, y: -0.5 },
        angle: 0.08,
        angularVelocity: -0.02,
      },
    };
    const simulation = sim.createSimulation(options);
    const oldField = simulation.field;
    const sampleCoordinates = [
      { x: -5, y: 4 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      { x: 7, y: 9 },
    ];
    const oldGeometry = sampleCoordinates.map(({ x, y }) => oldField.getChunk(x, y));
    const expected = sim.createSimulation({ ...options, seed: 29 }).getState();

    simulation.step(noThrusters);
    simulation.step({ left: true, right: false });
    expect(simulation.reset(29)).toEqual(expected);
    expect(simulation.field.seed).toBe(29);
    expect(simulation.field).not.toBe(oldField);
    expect(
      sampleCoordinates.map(({ x, y }) => simulation.field.getChunk(x, y)),
    ).not.toEqual(oldGeometry);
  });

  it("reset() reuses the current seed and clears run progress and state", () => {
    const simulation = sim.createSimulation({ seed: 27, hull: 64 });
    simulation.step(bothThrusters);
    simulation.reset(38);
    simulation.step({ left: true, right: false });

    const resetState = simulation.reset();
    const freshState = sim.createSimulation({ seed: 38, hull: 64 }).getState();

    expect(resetState).toEqual(freshState);
    expect(simulation.field.seed).toBe(38);
  });

  it("keeps an injected field pinned and ignores reset seeds", () => {
    const pinnedField = createControlledField({ seed: 52 });
    const simulation = sim.createSimulation({ seed: 99, field: pinnedField, hull: 68 });
    simulation.step(bothThrusters);

    const resetState = simulation.reset(700);

    expect(simulation.field).toBe(pinnedField);
    expect(resetState.seed).toBe(52);
    expect(resetState.hull).toBe(68);
    expect(resetState.tick).toBe(0);
    expect(resetState.time).toBe(0);
    expect(resetState.ship).toEqual({
      position: { x: 0, y: 60 },
      velocity: { x: 0, y: 0 },
      angle: 0,
      angularVelocity: 0,
    });
  });

  it("honors the hull option and all ship start overrides", () => {
    const state = sim.createSimulation({
      hull: 73,
      start: {
        position: { x: 222, y: 111 },
        velocity: { x: 4, y: -3 },
        angle: -0.2,
        angularVelocity: 0.15,
      },
    }).getState();

    expect(state.hull).toBe(73);
    expect(state.ship).toEqual({
      position: { x: 222, y: 111 },
      velocity: { x: 4, y: -3 },
      angle: -0.2,
      angularVelocity: 0.15,
    });
  });
});
