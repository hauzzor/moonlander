import { describe, expect, it } from "vitest";
import type { Vec2 } from "../src/index";
import {
  bothThrusters,
  createControlledField,
  createSimulationWithField,
  gateAt,
  noThrusters,
  sim,
  verticalWall,
} from "./helpers";

function wallStart(x: number, y: number, velocity: Vec2) {
  return {
    position: { x, y },
    velocity,
    angle: Math.PI / 2,
    angularVelocity: 0,
  };
}

function expectedDamage(impactSpeed: number): number {
  return Math.max(
    1,
    Math.round((impactSpeed - sim.DAMAGE_SPEED_THRESHOLD) * sim.DAMAGE_SCALE),
  );
}

describe("Starship collision, damage, and scoring", () => {
  it("bounces harmlessly from the ground below the 2 m/s impact threshold", () => {
    const field = createControlledField();
    const simulation = createSimulationWithField(field, {
      start: {
        position: { x: 40, y: sim.SHIP_RADIUS + 0.005 },
        velocity: { x: 0, y: -1 },
      },
    });

    const state = simulation.step(noThrusters);

    expect(state.hull).toBe(100);
    expect(state.invulnerable).toBe(false);
    expect(state.ship.velocity.y).toBeGreaterThan(0);
    expect(state.ship.position.y).toBeGreaterThanOrEqual(sim.SHIP_RADIUS);
    expect(state.outcome).toBe("flying");
  });

  it("bounces from a wall and applies the exact above-threshold damage formula", () => {
    const field = createControlledField({ walls: [verticalWall("impact-wall", 40)] });
    const impactSpeed = 4;
    const simulation = createSimulationWithField(field, {
      start: wallStart(
        40 - sim.SHIP_RADIUS - sim.WALL_RADIUS + 0.005,
        40,
        { x: impactSpeed, y: 0 },
      ),
    });

    const state = simulation.step(noThrusters);

    expect(state.hull).toBe(100 - expectedDamage(impactSpeed));
    expect(state.invulnerable).toBe(true);
    expect(state.ship.velocity.x).toBeLessThan(0);
    expect(state.ship.position.x).toBeLessThan(40 - sim.SHIP_RADIUS - sim.WALL_RADIUS);
  });

  it("uses the ground impact speed after gravity in the exact damage formula", () => {
    const field = createControlledField();
    const initialDownwardSpeed = 4;
    const simulation = createSimulationWithField(field, {
      start: {
        position: { x: 40, y: sim.SHIP_RADIUS + 0.005 },
        velocity: { x: 0, y: -initialDownwardSpeed },
      },
    });

    const state = simulation.step(noThrusters);
    const impactSpeed = initialDownwardSpeed + sim.GRAVITY * sim.FIXED_DT;

    expect(state.hull).toBe(100 - expectedDamage(impactSpeed));
    expect(state.invulnerable).toBe(true);
    expect(state.ship.velocity.y).toBeGreaterThan(0);
  });

  it("applies at most one damage event for simultaneous ground and wall contacts", () => {
    const field = createControlledField({ walls: [verticalWall("corner-wall", 40)] });
    const simulation = createSimulationWithField(field, {
      start: {
        position: {
          x: 40 - sim.SHIP_RADIUS - sim.WALL_RADIUS + 0.005,
          y: sim.SHIP_CAPSULE_HALF_LENGTH + sim.SHIP_RADIUS + 0.005,
        },
        velocity: { x: 6, y: -8 },
        angle: Math.PI / 2,
      },
    });

    const state = simulation.step(noThrusters);
    const highestImpactSpeed = 8 + sim.GRAVITY * sim.FIXED_DT;

    expect(state.hull).toBe(100 - expectedDamage(highestImpactSpeed));
    expect(state.invulnerable).toBe(true);
    expect(state.ship.velocity.x).toBeLessThan(0);
    expect(state.ship.velocity.y).toBeGreaterThan(0);
  });

  it("blocks repeat damage during invulnerability while continuing to bounce", () => {
    const field = createControlledField();
    const simulation = createSimulationWithField(field, {
      start: {
        position: { x: 40, y: sim.SHIP_RADIUS + 0.005 },
        velocity: { x: 0, y: -2.1 },
        angle: Math.PI,
      },
    });
    const firstImpact = simulation.step(bothThrusters);
    const hullAfterFirstImpact = firstImpact.hull;
    let previous = firstImpact;
    let protectedBounceObserved = false;

    expect(firstImpact.invulnerable).toBe(true);
    expect(firstImpact.hull).toBe(99);
    expect(firstImpact.ship.velocity.y).toBeGreaterThan(0);

    for (let tick = 0; tick < 40; tick += 1) {
      const state = simulation.step(bothThrusters);
      if (previous.ship.velocity.y < 0 && state.ship.velocity.y > 0) {
        protectedBounceObserved = true;
        expect(state.invulnerable).toBe(true);
        expect(state.hull).toBe(hullAfterFirstImpact);
      }
      previous = state;
    }

    expect(protectedBounceObserved).toBe(true);
    expect(sim.INVULNERABILITY_SECONDS).toBe(0.75);
  });

  it("sets destroyed at zero hull and freezes the terminal state", () => {
    const field = createControlledField();
    const simulation = createSimulationWithField(field, {
      hull: 1,
      start: {
        position: { x: 40, y: sim.SHIP_RADIUS + 0.005 },
        velocity: { x: 0, y: -4 },
      },
    });

    const destroyed = simulation.step(noThrusters);

    expect(destroyed.hull).toBe(0);
    expect(destroyed.outcome).toBe("destroyed");
    expect(simulation.step(bothThrusters)).toEqual(destroyed);
    expect(simulation.getState()).toEqual(destroyed);
  });

  it.each([
    { direction: "forward", x: 39.9, velocity: 20 },
    { direction: "reverse", x: 40.1, velocity: -20 },
  ])("counts a clear gate-plane pass once in the $direction direction", ({ x, velocity }) => {
    const field = createControlledField({ gates: [gateAt("scoring-gate")] });
    const simulation = createSimulationWithField(field, {
      start: {
        position: { x, y: 60 },
        velocity: { x: velocity, y: 0 },
      },
    });

    const firstPass = simulation.step(noThrusters);
    const later = simulation.step(noThrusters);

    expect(firstPass.gatesPassed).toBe(1);
    expect(firstPass.score).toBe(Math.floor(firstPass.progress) + sim.GATE_BONUS);
    expect(later.gatesPassed).toBe(1);
    expect(later.score).toBe(Math.floor(later.progress) + sim.GATE_BONUS);
    expect(simulation.getObservation().nearestGateDistance).toBe(-1);
  });

  it("does not award a gate pass when the ship hits its frame", () => {
    const field = createControlledField({ gates: [gateAt("frame-hit", { x: 40, y: 60 }, 18)] });
    const simulation = createSimulationWithField(field, {
      start: {
        position: { x: 39.9, y: 77 },
        velocity: { x: 20, y: 0 },
      },
    });

    const state = simulation.step(noThrusters);

    expect(state.gatesPassed).toBe(0);
    expect(state.score).toBe(Math.floor(state.progress));
  });

  it("keeps progress monotonic and score equal to distance plus one-time gate bonuses", () => {
    const field = createControlledField({
      walls: [verticalWall("return-wall", 75)],
      gates: [gateAt("return-gate")],
    });
    const simulation = createSimulationWithField(field, {
      start: {
        position: { x: 30, y: 60 },
        velocity: { x: 10, y: 0 },
      },
    });
    let previousX = simulation.getState().ship.position.x;
    let previousProgress = simulation.getState().progress;
    let crossedForward = false;
    let crossedBackward = false;
    let state = simulation.getState();

    for (let tick = 0; tick < 1200 && !crossedBackward; tick += 1) {
      const action = tick % 25 < 6 ? bothThrusters : noThrusters;
      state = simulation.step(action);
      const currentX = state.ship.position.x;
      if (previousX < 40 && currentX >= 40) {
        crossedForward = true;
      }
      if (previousX > 40 && currentX <= 40) {
        crossedBackward = true;
      }
      expect(state.progress).toBeGreaterThanOrEqual(previousProgress);
      expect(state.score).toBe(
        Math.floor(state.progress) + sim.GATE_BONUS * state.gatesPassed,
      );
      previousX = currentX;
      previousProgress = state.progress;
    }

    expect(crossedForward).toBe(true);
    expect(crossedBackward).toBe(true);
    expect(state.gatesPassed).toBe(1);
  });

  it("sweeps a very fast ship against a thin wall instead of tunneling through", () => {
    const field = createControlledField({ walls: [verticalWall("thin-wall", 40)] });
    const simulation = createSimulationWithField(field, {
      start: {
        position: { x: 0, y: 60 },
        velocity: { x: 10000, y: 0 },
        angle: Math.PI / 2,
      },
    });

    const state = simulation.step(noThrusters);

    expect(state.ship.position.x).toBeLessThan(40);
    expect(state.hull).toBe(0);
    expect(state.outcome).toBe("destroyed");
  });
});
