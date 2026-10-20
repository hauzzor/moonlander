import { describe, expect, it } from "vitest";
import type { Action, ShipStart, SimState } from "../src/index";
import {
  applyAngularDrag,
  applyLinearDrag,
  thrusterEffect,
} from "../src/physics";
import {
  bothThrusters,
  createControlledField,
  createSimulationWithField,
  createWideTunnelField,
  noThrusters,
  rearOnly,
  sim,
  tunnelContactY,
} from "./helpers";

const leftThruster: Action = { left: true, right: false, rear: false };
const rightThruster: Action = { left: false, right: true, rear: false };

function damageFreeSimulation(start?: ShipStart) {
  return createSimulationWithField(
    createWideTunnelField(),
    start === undefined ? {} : { start },
  );
}

describe("fixed-step tunnel simulation", () => {
  it("exports the new physics and tunnel constants without gate or ground constants", () => {
    expect(sim.FIXED_DT).toBe(1 / 120);
    expect(sim.GRAVITY).toBe(1.62);
    expect(sim.FIELD_CHUNK_SIZE).toBe(80);
    expect(sim.INITIAL_HULL).toBe(100);
    expect(sim.SHIP_MASS).toBe(200);
    expect(sim.SHIP_LENGTH).toBe(48);
    expect(sim.SHIP_HEIGHT).toBe(18);
    expect(sim.SHIP_RADIUS).toBe(9);
    expect(sim.SHIP_CAPSULE_HALF_LENGTH).toBe(15);
    expect(sim.SHIP_INERTIA).toBe(43800);
    expect(sim.THRUSTER_FORCE).toBe(1800);
    expect(sim.THRUSTER_CANT).toBe((15 * Math.PI) / 180);
    expect(sim.LEFT_MOUNT).toEqual({ x: -16, y: -9 });
    expect(sim.RIGHT_MOUNT).toEqual({ x: 16, y: -9 });
    expect(sim.REAR_MOUNT).toEqual({ x: -24, y: 0 });
    expect(sim.REAR_THRUSTER_FORCE).toBe(900);
    expect(sim.LINEAR_DRAG).toBe(0.35);
    expect(sim.ANGULAR_DRAG).toBe(0.25);
    expect(sim.TUNNEL_HALF_WIDTH).toBe(34);
    expect(sim.TUNNEL_CENTER_Y).toBe(60);
    expect(sim.TUNNEL_START_STRAIGHT).toBe(120);
    expect.soft(sim.TUNNEL_MIN_HALF_WIDTH).toBe(25);
    expect.soft(sim.TUNNEL_MAX_HALF_WIDTH).toBe(55);
    expect.soft(sim.TUNNEL_BEND_AMPLITUDE).toBe(150);
    expect.soft(sim.TUNNEL_MAX_CLIMB_ANGLE).toBe((85 * Math.PI) / 180);
    expect.soft(sim.TUNNEL_MAX_SLOPE).toBe(Math.tan(sim.TUNNEL_MAX_CLIMB_ANGLE));
    expect(sim.TUNNEL_SAMPLE_STEP).toBe(8);
    expect(sim.WALL_RADIUS).toBe(2);
    expect(sim.DAMAGE_SPEED_THRESHOLD).toBe(2);
    expect(sim.DAMAGE_SCALE).toBe(4);
    expect(sim.INVULNERABILITY_SECONDS).toBe(0.75);
    expect(sim.BOUNCE_RESTITUTION).toBe(0.35);
    expect(sim.WALL_SENSOR_RANGE).toBe(200);
    expect(sim.EYE_SENSOR_RAY_COUNT).toBe(360);
    expect(sim.EYE_SENSOR_INTERVAL_SECONDS).toBe(1);
    expect(sim.EYE_SENSOR_VIEW_MIN).toBe(20);
    expect(sim.EYE_SENSOR_VIEW_MAX).toBe(200);
    expect(sim.EYE_SENSOR_VIEW_DEFAULT).toBe(120);
    expect(sim.START_POSITION).toEqual({ x: 0, y: 60 });
    expect(sim.DEFAULT_SEED).toBe(1);
    expect("GROUND_Y" in sim).toBe(false);
    expect("GATE_BONUS" in sim).toBe(false);
    expect("SENSOR_RANGE" in sim).toBe(false);
    expect("SENSOR_RAY_COUNT" in sim).toBe(false);
  });

  it("starts at the exact default state without gatesPassed or fuel", () => {
    const state = sim.createSimulation().getState();

    expect(Object.keys(state).sort()).toEqual([
      "eyeSensorRadius",
      "hull",
      "invulnerable",
      "outcome",
      "progress",
      "score",
      "seed",
      "sensors",
      "ship",
      "thrusters",
      "tick",
      "time",
    ]);
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
      eyeSensorRadius: sim.EYE_SENSOR_VIEW_DEFAULT,
      sensors: expect.objectContaining({
        eye: expect.objectContaining({
          radius: sim.EYE_SENSOR_VIEW_DEFAULT,
          tick: 0,
          origin: { x: 0, y: 60 },
          heading: 0,
          distances: expect.any(Array),
        }),
        direction: { angle: 0 },
        distanceToStart: 0,
        velocity: { vx: 0, vy: 0, speed: 0, angle: 0 },
      }),
    });
    expect(state.sensors.eye.distances).toHaveLength(sim.EYE_SENSOR_RAY_COUNT);
    expect("gatesPassed" in state).toBe(false);
    expect("fuel" in state).toBe(false);
    expect("sensor" in state).toBe(false);
    expect("sensorRadius" in state).toBe(false);
  });

  it("advances exactly one 1/120-second tick and derives time from tick", () => {
    const simulation = damageFreeSimulation();
    const first = simulation.step(noThrusters);
    const second = simulation.step(noThrusters);

    expect(first.tick).toBe(1);
    expect(first.time).toBe(sim.FIXED_DT);
    expect(second.tick).toBe(2);
    expect(second.time).toBe(2 * sim.FIXED_DT);
  });

  it("advances exactly 120 fixed steps per simulated second", () => {
    const simulation = damageFreeSimulation();
    let state = simulation.getState();

    for (let tick = 1; tick <= 120; tick += 1) {
      state = simulation.step(noThrusters);
      expect(state.tick).toBe(tick);
      expect(state.time).toBe(tick * sim.FIXED_DT);
    }

    expect(state.time).toBeCloseTo(1, 12);
  });

  it("applies thrust, gravity, and torque before drag and integrates the dragged velocity", () => {
    const action = leftThruster;
    const simulation = damageFreeSimulation();
    const before = simulation.getState();
    const dt = sim.FIXED_DT;
    const effect = thrusterEffect(before.ship.angle, action);
    const expectedVelocity = applyLinearDrag(
      {
        x: before.ship.velocity.x + (effect.force.x / sim.SHIP_MASS) * dt,
        y:
          before.ship.velocity.y +
          (effect.force.y / sim.SHIP_MASS - sim.GRAVITY) * dt,
      },
      dt,
    );
    const expectedAngularVelocity = applyAngularDrag(
      before.ship.angularVelocity + (effect.torque / sim.SHIP_INERTIA) * dt,
      dt,
    );

    const state = simulation.step(action);

    expect(state.ship.velocity.x).toBeCloseTo(expectedVelocity.x, 13);
    expect(state.ship.velocity.y).toBeCloseTo(expectedVelocity.y, 13);
    expect(state.ship.angularVelocity).toBeCloseTo(
      expectedAngularVelocity,
      13,
    );
    expect(state.ship.position.x).toBeCloseTo(
      before.ship.position.x + expectedVelocity.x * dt,
      13,
    );
    expect(state.ship.position.y).toBeCloseTo(
      before.ship.position.y + expectedVelocity.y * dt,
      13,
    );
    expect(state.ship.angle).toBeCloseTo(
      before.ship.angle + expectedAngularVelocity * dt,
      13,
    );
    expect(state.thrusters).toEqual(action);
  });

  it.each([
    {
      action: leftThruster,
      check: (state: SimState) => {
        expect(state.ship.velocity.x).toBeGreaterThan(0);
        expect(state.ship.angularVelocity).toBeLessThan(0);
      },
    },
    {
      action: rightThruster,
      check: (state: SimState) => {
        expect(state.ship.velocity.x).toBeLessThan(0);
        expect(state.ship.angularVelocity).toBeGreaterThan(0);
      },
    },
    {
      action: rearOnly,
      check: (state: SimState) => {
        expect(state.ship.velocity.x).toBeGreaterThan(0);
        expect(state.ship.angularVelocity).toBe(0);
      },
    },
  ])(
    "applies $action on the first tick with no extra control latency",
    ({ action, check }) => {
      const simulation = damageFreeSimulation();
      expect(simulation.getState().thrusters).toEqual(noThrusters);

      const state = simulation.step(action);

      expect(state.tick).toBe(1);
      expect(state.thrusters).toEqual(action);
      check(state);
    },
  );

  it("applies gravity and discrete linear drag on the first no-thrust tick", () => {
    const state = damageFreeSimulation().step(noThrusters);
    const expectedVy = (-sim.GRAVITY * sim.FIXED_DT) /
      (1 + sim.LINEAR_DRAG * sim.FIXED_DT);

    expect(state.ship.velocity.x).toBe(0);
    expect(state.ship.velocity.y).toBeCloseTo(expectedVy, 14);
    expect(state.ship.angularVelocity).toBe(0);
    expect(state.thrusters).toEqual(noThrusters);
  });

  it("uses the exact 1800 N, 15-degree, gravity, and discrete-drag velocities for Q and W", () => {
    const left = damageFreeSimulation().step(leftThruster);
    const right = damageFreeSimulation().step(rightThruster);
    const dt = sim.FIXED_DT;
    const linearDamping = 1 + sim.LINEAR_DRAG * dt;
    const angularDamping = 1 + sim.ANGULAR_DRAG * dt;
    const forceX = sim.THRUSTER_FORCE * Math.sin(sim.THRUSTER_CANT);
    const forceY = sim.THRUSTER_FORCE * Math.cos(sim.THRUSTER_CANT);
    const leftTorque = sim.LEFT_MOUNT.x * forceY - sim.LEFT_MOUNT.y * forceX;
    const rightTorque = sim.RIGHT_MOUNT.x * forceY - sim.RIGHT_MOUNT.y * -forceX;

    expect(left.ship.velocity.x).toBeCloseTo((forceX / sim.SHIP_MASS * dt) / linearDamping, 13);
    expect(left.ship.velocity.y).toBeCloseTo(
      ((forceY / sim.SHIP_MASS - sim.GRAVITY) * dt) / linearDamping,
      13,
    );
    expect(left.ship.angularVelocity).toBeCloseTo(
      (leftTorque / sim.SHIP_INERTIA * dt) / angularDamping,
      13,
    );
    expect(right.ship.velocity.x).toBeCloseTo((-forceX / sim.SHIP_MASS * dt) / linearDamping, 13);
    expect(right.ship.velocity.y).toBeCloseTo(
      ((forceY / sim.SHIP_MASS - sim.GRAVITY) * dt) / linearDamping,
      13,
    );
    expect(right.ship.angularVelocity).toBeCloseTo(
      (rightTorque / sim.SHIP_INERTIA * dt) / angularDamping,
      13,
    );
    expect(left.ship.angularVelocity).toBeLessThan(0);
    expect(right.ship.angularVelocity).toBeGreaterThan(0);
    expect(left.thrusters).toEqual(leftThruster);
    expect(right.thrusters).toEqual(rightThruster);
  });

  it("balances both thrusters laterally and rotationally while producing net lift", () => {
    const state = damageFreeSimulation().step(bothThrusters);
    const netVerticalAcceleration =
      (2 * sim.THRUSTER_FORCE * Math.cos(sim.THRUSTER_CANT)) / sim.SHIP_MASS - sim.GRAVITY;
    const expectedVy = (netVerticalAcceleration * sim.FIXED_DT) /
      (1 + sim.LINEAR_DRAG * sim.FIXED_DT);

    expect(state.ship.velocity.x).toBeCloseTo(0, 14);
    expect(state.ship.angularVelocity).toBeCloseTo(0, 14);
    expect(state.ship.velocity.y).toBeCloseTo(expectedVy, 13);
    expect(state.ship.velocity.y).toBeGreaterThan(0);
    expect(state.thrusters).toEqual(bothThrusters);
  });

  it("applies the rear thruster's 900 N local-forward force with zero torque", () => {
    const state = damageFreeSimulation().step(rearOnly);
    const dt = sim.FIXED_DT;
    const linearDamping = 1 + sim.LINEAR_DRAG * dt;

    expect(state.ship.velocity.x).toBeCloseTo(
      (sim.REAR_THRUSTER_FORCE / sim.SHIP_MASS * dt) / linearDamping,
      13,
    );
    expect(state.ship.velocity.y).toBeCloseTo(
      (-sim.GRAVITY * dt) / linearDamping,
      13,
    );
    expect(state.ship.angularVelocity).toBe(0);
    expect(state.thrusters).toEqual(rearOnly);
  });

  it("rotates rear-thruster force with the ship's local +x axis", () => {
    const state = damageFreeSimulation({ angle: Math.PI / 2 }).step(rearOnly);
    const dt = sim.FIXED_DT;
    const linearDamping = 1 + sim.LINEAR_DRAG * dt;

    expect(state.ship.velocity.x).toBeCloseTo(0, 13);
    expect(state.ship.velocity.y).toBeCloseTo(
      ((sim.REAR_THRUSTER_FORCE / sim.SHIP_MASS) - sim.GRAVITY) * dt / linearDamping,
      13,
    );
    expect(state.ship.angularVelocity).toBe(0);
  });

  it("combines Q, W, and rear thrust with balanced torque and drag-adjusted velocities", () => {
    const action: Action = { left: true, right: true, rear: true };
    const state = damageFreeSimulation().step(action);
    const dt = sim.FIXED_DT;
    const linearDamping = 1 + sim.LINEAR_DRAG * dt;
    const netClimbAcceleration =
      (2 * sim.THRUSTER_FORCE * Math.cos(sim.THRUSTER_CANT)) / sim.SHIP_MASS - sim.GRAVITY;

    expect(state.ship.velocity.x).toBeCloseTo(
      (sim.REAR_THRUSTER_FORCE / sim.SHIP_MASS * dt) / linearDamping,
      13,
    );
    expect(state.ship.velocity.y).toBeCloseTo(
      (netClimbAcceleration * dt) / linearDamping,
      13,
    );
    expect(state.ship.angularVelocity).toBeCloseTo(0, 14);
    expect(state.thrusters).toEqual(action);
  });

  it("meets the one-tick lateral, net-climb, and angular acceleration targets", () => {
    const left = damageFreeSimulation().step(leftThruster);
    const both = damageFreeSimulation().step(bothThrusters);

    expect(Math.abs(left.ship.velocity.x) / sim.FIXED_DT).toBeGreaterThanOrEqual(2.0);
    expect(both.ship.velocity.y / sim.FIXED_DT).toBeGreaterThanOrEqual(12);
    expect(Math.abs(left.ship.angularVelocity) / sim.FIXED_DT).toBeGreaterThanOrEqual(0.5);
  });

  it("turns 90 degrees from rest within 2.7 seconds of continuous W input", () => {
    const simulation = damageFreeSimulation();
    let state = simulation.getState();
    const maximumTicks = Math.floor(2.7 / sim.FIXED_DT);

    for (let tick = 0; tick < maximumTicks && state.ship.angle < Math.PI / 2; tick += 1) {
      state = simulation.step(rightThruster);
    }

    expect(state.ship.angle).toBeGreaterThanOrEqual(Math.PI / 2);
    expect(state.tick * sim.FIXED_DT).toBeLessThanOrEqual(2.7);
  });

  it("decays unpowered linear and angular velocities by their exact per-tick factors", () => {
    const start = {
      position: { x: 0, y: 60 },
      velocity: { x: 20, y: 0 },
      angle: 0.3,
      angularVelocity: 2,
    };
    const simulation = damageFreeSimulation(start);
    const afterOne = simulation.step(noThrusters);
    const expectedVxAfterOne = 20 / (1 + sim.LINEAR_DRAG * sim.FIXED_DT);
    const expectedOmegaAfterOne = 2 / (1 + sim.ANGULAR_DRAG * sim.FIXED_DT);

    expect(afterOne.ship.velocity.x).toBeCloseTo(expectedVxAfterOne, 13);
    expect(afterOne.ship.angularVelocity).toBeCloseTo(expectedOmegaAfterOne, 13);

    let state = afterOne;
    for (let tick = 1; tick < 120; tick += 1) {
      state = simulation.step(noThrusters);
    }
    expect(state.ship.velocity.x).toBeCloseTo(
      20 / (1 + sim.LINEAR_DRAG * sim.FIXED_DT) ** 120,
      12,
    );
    expect(state.ship.angularVelocity).toBeCloseTo(
      2 / (1 + sim.ANGULAR_DRAG * sim.FIXED_DT) ** 120,
      12,
    );
  });

  it("loses at least 25 percent of 20 m/s after one second without thrust", () => {
    const simulation = damageFreeSimulation({
      position: { x: 0, y: 60 },
      velocity: { x: 20, y: 0 },
    });
    for (let tick = 0; tick < 120; tick += 1) {
      simulation.step(noThrusters);
    }

    const speedAfterOneSecond = Math.abs(simulation.getState().ship.velocity.x);
    expect(speedAfterOneSecond).toBeLessThanOrEqual(20 * 0.75);
    expect(speedAfterOneSecond).toBeCloseTo(
      20 / (1 + sim.LINEAR_DRAG * sim.FIXED_DT) ** 120,
      12,
    );
  });

  it("approaches the drag-limited free-fall and both-thruster climb speeds", () => {
    const freeFall = damageFreeSimulation();
    for (let tick = 0; tick < 4800; tick += 1) {
      freeFall.step(noThrusters);
    }
    const terminalFall = freeFall.getState().ship.velocity.y;
    expect(Math.abs(terminalFall)).toBeLessThanOrEqual(5);
    expect(terminalFall).toBeCloseTo(-sim.GRAVITY / sim.LINEAR_DRAG, 2);
    expect(freeFall.getObservation().lateralSpeed).toBeCloseTo(
      -sim.GRAVITY / sim.LINEAR_DRAG,
      2,
    );

    const climb = damageFreeSimulation();
    for (let tick = 0; tick < 4800; tick += 1) {
      climb.step(bothThrusters);
    }
    const climbAcceleration =
      (2 * sim.THRUSTER_FORCE * Math.cos(sim.THRUSTER_CANT)) / sim.SHIP_MASS - sim.GRAVITY;
    const terminalClimb = climb.getState().ship.velocity.y;
    expect(terminalClimb).toBeGreaterThan(0);
    expect(terminalClimb).toBeCloseTo(climbAcceleration / sim.LINEAR_DRAG, 2);
    expect(climb.getObservation().lateralSpeed).toBeCloseTo(
      climbAcceleration / sim.LINEAR_DRAG,
      2,
    );
  });

  it("keeps progress monotonic through backward movement and scores only whole forward meters", () => {
    const simulation = createSimulationWithField(createWideTunnelField(), {
      start: { position: { x: 0, y: 60 }, velocity: { x: 0, y: 0 } },
    });
    let maxX = 0;
    let previousProgress = 0;
    let sawForwardProgress = false;
    let movedBackAfterProgress = false;
    let previousX = 0;

    for (let tick = 0; tick < 1200; tick += 1) {
      const state = simulation.step(leftThruster);
      const x = state.ship.position.x;
      maxX = Math.max(maxX, x);
      sawForwardProgress ||= state.progress > 0;
      movedBackAfterProgress ||= sawForwardProgress && x < previousX;
      expect(state.progress).toBeCloseTo(Math.max(0, maxX), 10);
      expect(state.progress).toBeGreaterThanOrEqual(previousProgress);
      expect(state.score).toBe(Math.floor(state.progress));
      expect("gatesPassed" in state).toBe(false);
      previousProgress = state.progress;
      previousX = x;
    }

    expect(sawForwardProgress).toBe(true);
    expect(movedBackAfterProgress).toBe(true);
  });

  it("keeps progress at zero while moving backward from the spawn point", () => {
    const simulation = createSimulationWithField(createWideTunnelField(), {
      start: { position: { x: 0, y: 60 }, velocity: { x: -12, y: 0 } },
    });

    for (let tick = 0; tick < 120; tick += 1) {
      const state = simulation.step(noThrusters);
      expect(state.ship.position.x).toBeLessThan(0);
      expect(state.progress).toBe(0);
      expect(state.score).toBe(0);
    }
  });

  it("replays identical state for the same seed, start, and action sequence", () => {
    const options = {
      seed: 314159,
      start: {
        position: { x: 25, y: 61 },
        velocity: { x: 1.25, y: -0.5 },
        angle: 0.08,
        angularVelocity: -0.02,
      },
    };
    const first = sim.createSimulation(options);
    const second = sim.createSimulation(options);
    const actions = [noThrusters, leftThruster, bothThrusters, rightThruster, noThrusters];

    for (let repeat = 0; repeat < 12; repeat += 1) {
      for (const action of actions) {
        expect(first.step(action)).toEqual(second.step(action));
      }
    }
  });

  it("reset(seed) regenerates the tunnel and restores the configured initial state", () => {
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
    const oldGeometry = [128, 256, 512, 1024].map((x) => oldField.tunnel.centerAt(x));
    const expected = sim.createSimulation({ ...options, seed: 29 }).getState();

    simulation.step(noThrusters);
    simulation.step(leftThruster);
    expect(simulation.reset(29)).toEqual(expected);
    expect(simulation.field.seed).toBe(29);
    expect(simulation.field).not.toBe(oldField);
    expect([128, 256, 512, 1024].map((x) => simulation.field.tunnel.centerAt(x)))
      .not.toEqual(oldGeometry);
  });

  it("reset() reuses the current seed and restores the full initial run", () => {
    const simulation = sim.createSimulation({ seed: 27, hull: 64 });
    simulation.step(bothThrusters);
    simulation.reset(38);
    simulation.step(leftThruster);

    const resetState = simulation.reset();
    const freshState = sim.createSimulation({ seed: 38, hull: 64 }).getState();
    expect(resetState).toEqual(freshState);
    expect(simulation.field.seed).toBe(38);
  });

  it("pins an injected Field and ignores both initial and reset seed overrides", () => {
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

  it("honors the hull option and every ship start override", () => {
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

  it.each([
    { hull: 150, expectedHull: 100, expectedOutcome: "flying" as const },
    { hull: 100, expectedHull: 100, expectedOutcome: "flying" as const },
    { hull: 0, expectedHull: 0, expectedOutcome: "destroyed" as const },
    { hull: -10, expectedHull: 0, expectedOutcome: "destroyed" as const },
  ])(
    "clamps the hull option $hull to $expectedHull and outcome $expectedOutcome",
    ({ hull, expectedHull, expectedOutcome }) => {
      const state = sim.createSimulation({ hull }).getState();

      expect(state.hull).toBe(expectedHull);
      expect(state.outcome).toBe(expectedOutcome);
      expect(state.hull).toBeGreaterThanOrEqual(0);
      expect(state.hull).toBeLessThanOrEqual(sim.INITIAL_HULL);
    },
  );

  it.each([1, 7, 42, 1234])(
    "replays an identical 240-tick state sequence for seed %i",
    (seed) => {
      const first = sim.createSimulation({ seed });
      const second = sim.createSimulation({ seed });
      const actions = [
        noThrusters,
        leftThruster,
        rightThruster,
        bothThrusters,
        rearOnly,
      ];

      for (let tick = 0; tick < 240; tick += 1) {
        const action = actions[tick % actions.length]!;
        expect(first.step(action)).toEqual(second.step(action));
      }
    },
  );

  it("reset during flight and after destruction restores the run and keeps the eye radius", () => {
    const { floor } = tunnelContactY();
    const simulation = createSimulationWithField(createControlledField(), {
      start: {
        position: { x: 40, y: floor + 0.005 },
        velocity: { x: 0, y: -100 },
      },
    });
    simulation.setEyeSensorRadius(77);

    const destroyed = simulation.step(noThrusters);
    expect(destroyed.outcome).toBe("destroyed");
    expect(destroyed.hull).toBe(0);

    const afterDestruction = simulation.reset();
    expect(afterDestruction).toMatchObject({
      tick: 0,
      time: 0,
      hull: 100,
      outcome: "flying",
      score: 0,
      progress: 0,
      thrusters: noThrusters,
      eyeSensorRadius: 77,
    });
    expect(afterDestruction.sensors.eye).toMatchObject({ tick: 0, radius: 77 });

    simulation.step(leftThruster);
    simulation.step(bothThrusters);
    const duringFlight = simulation.reset();
    expect(duringFlight).toMatchObject({
      tick: 0,
      time: 0,
      hull: 100,
      outcome: "flying",
      score: 0,
      progress: 0,
      thrusters: noThrusters,
      eyeSensorRadius: 77,
    });
    expect(duringFlight.sensors.eye).toMatchObject({ tick: 0, radius: 77 });
  });
});
