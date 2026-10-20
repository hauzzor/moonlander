import { describe, expect, it } from "vitest";
import {
  bothThrusters,
  createControlledField,
  createSimulationWithField,
  noThrusters,
  sim,
  tunnelContactY,
} from "./helpers";

const { floor: floorContactY, ceiling: ceilingContactY } = tunnelContactY();

function expectedDamage(impactSpeed: number): number {
  return Math.max(1, Math.round((impactSpeed - 2) * 4));
}

function gravityDragImpactSpeed(initialDownwardSpeed: number): number {
  return (initialDownwardSpeed + sim.GRAVITY * sim.FIXED_DT) /
    (1 + sim.LINEAR_DRAG * sim.FIXED_DT);
}

function initialDownwardSpeedForImpact(impactSpeed: number): number {
  return impactSpeed * (1 + sim.LINEAR_DRAG * sim.FIXED_DT) -
    sim.GRAVITY * sim.FIXED_DT;
}

describe("tunnel collision, hull damage, and destruction", () => {
  it.each([
    { surface: "floor", y: floorContactY + 0.005, vy: -1, direction: 1 },
    { surface: "ceiling", y: ceilingContactY - 0.005, vy: 1, direction: -1 },
  ])("bounces harmlessly from the $surface below 2 m/s", ({ y, vy, direction }) => {
    const simulation = createSimulationWithField(createControlledField(), {
      start: { position: { x: 40, y }, velocity: { x: 0, y: vy } },
    });

    const state = simulation.step(noThrusters);

    expect(state.hull).toBe(100);
    expect(state.invulnerable).toBe(false);
    expect(state.ship.velocity.y * direction).toBeGreaterThan(0);
    expect(state.outcome).toBe("flying");
  });

  it.each([
    { impactSpeed: 1.5, damage: 0 },
    { impactSpeed: 2, damage: 0 },
    { impactSpeed: 2.0001, damage: 1 },
    { impactSpeed: 2.5, damage: 2 },
    { impactSpeed: 3, damage: 4 },
    { impactSpeed: 5, damage: 12 },
  ])(
    "applies the damage threshold exactly at an impact speed of $impactSpeed m/s",
    ({ impactSpeed, damage }) => {
      const simulation = createSimulationWithField(createControlledField(), {
        start: {
          position: { x: 40, y: floorContactY + 0.005 },
          velocity: {
            x: 0,
            y: -initialDownwardSpeedForImpact(impactSpeed),
          },
        },
      });

      const state = simulation.step(noThrusters);

      expect(state.hull).toBe(100 - damage);
      expect(state.invulnerable).toBe(damage > 0);
      expect(state.outcome).toBe("flying");
    },
  );

  it.each([2.1, 3.2, 4.25])(
    "damages the floor impact above threshold by max(1, round((impact - 2) * 4)) at %s m/s",
    (initialDownwardSpeed) => {
      const simulation = createSimulationWithField(createControlledField(), {
        start: {
          position: { x: 40, y: floorContactY + 0.005 },
          velocity: { x: 0, y: -initialDownwardSpeed },
        },
      });

      const state = simulation.step(noThrusters);
      const impactSpeed = gravityDragImpactSpeed(initialDownwardSpeed);

      expect(state.hull).toBe(100 - expectedDamage(impactSpeed));
      expect(state.invulnerable).toBe(true);
      expect(state.ship.velocity.y).toBeGreaterThan(0);
      expect(state.ship.position.y).toBeGreaterThanOrEqual(floorContactY - 0.01);
    },
  );

  it("bounces from the ceiling and applies the same threshold and damage formula", () => {
    const initialUpwardSpeed = 4;
    const simulation = createSimulationWithField(createControlledField(), {
      start: {
        position: { x: 40, y: ceilingContactY - 0.005 },
        velocity: { x: 0, y: initialUpwardSpeed },
      },
    });

    const state = simulation.step(noThrusters);
    const impactSpeed =
      (initialUpwardSpeed - sim.GRAVITY * sim.FIXED_DT) /
      (1 + sim.LINEAR_DRAG * sim.FIXED_DT);

    expect(state.hull).toBe(100 - expectedDamage(impactSpeed));
    expect(state.invulnerable).toBe(true);
    expect(state.ship.velocity.y).toBeLessThan(0);
    expect(state.ship.position.y).toBeLessThanOrEqual(ceilingContactY + 0.01);
  });

  it("applies no more than one damage event for multiple same-tick floor contacts", () => {
    const initialDownwardSpeed = 8;
    const simulation = createSimulationWithField(createControlledField(), {
      start: {
        position: { x: 40, y: floorContactY + 0.005 },
        velocity: { x: 0, y: -initialDownwardSpeed },
        angle: Math.PI / 2,
      },
    });

    const state = simulation.step(noThrusters);
    const highestImpactSpeed = gravityDragImpactSpeed(initialDownwardSpeed);

    expect(state.hull).toBe(100 - expectedDamage(highestImpactSpeed));
    expect(state.invulnerable).toBe(true);
    expect(state.ship.velocity.y).toBeGreaterThan(0);
  });

  it("continues bouncing but blocks repeat damage during invulnerability", () => {
    const simulation = createSimulationWithField(createControlledField(), {
      start: {
        position: { x: 40, y: floorContactY + 0.005 },
        velocity: { x: 0, y: -2.5 },
        angle: Math.PI,
      },
    });
    const firstImpact = simulation.step(bothThrusters);
    const hullAfterFirstImpact = firstImpact.hull;
    let previous = firstImpact;
    let protectedBounceObserved = false;

    expect(firstImpact.invulnerable).toBe(true);
    expect(firstImpact.hull).toBeLessThan(100);
    expect(firstImpact.ship.velocity.y).toBeGreaterThan(0);

    for (let tick = 0; tick < 60; tick += 1) {
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

  it("protects for exactly 0.75 seconds after damage while collisions still bounce", () => {
    const halfWidth = 12;
    const { floor } = tunnelContactY(halfWidth);
    const simulation = createSimulationWithField(
      createControlledField({ halfWidth }),
      {
        start: {
          position: { x: 40, y: floor + 0.005 },
          velocity: { x: 0, y: -20 },
        },
      },
    );
    const damaged = simulation.step(noThrusters);
    const hullAfterDamage = damaged.hull;
    const damageTick = damaged.tick;
    const invulnerabilityTicks = Math.round(
      sim.INVULNERABILITY_SECONDS / sim.FIXED_DT,
    );

    expect(damaged.hull).toBeLessThan(100);
    expect(damaged.invulnerable).toBe(true);

    let state = damaged;
    let previousVelocityY = damaged.ship.velocity.y;
    let protectedBounces = 0;

    for (let offset = 1; offset < invulnerabilityTicks; offset += 1) {
      state = simulation.step(bothThrusters);
      if (
        previousVelocityY !== 0 &&
        Math.sign(previousVelocityY) !== Math.sign(state.ship.velocity.y)
      ) {
        protectedBounces += 1;
      }
      expect(state.invulnerable).toBe(true);
      expect(state.hull).toBe(hullAfterDamage);
      previousVelocityY = state.ship.velocity.y;
    }

    expect(protectedBounces).toBeGreaterThanOrEqual(2);
    expect(state.tick - damageTick).toBe(invulnerabilityTicks - 1);

    const expired = simulation.step(bothThrusters);
    expect(expired.tick - damageTick).toBe(invulnerabilityTicks);
    expect(expired.invulnerable).toBe(false);
    expect(expired.hull).toBe(hullAfterDamage);
  });

  it("applies damage again only after the invulnerability window", () => {
    const halfWidth = 16;
    const { floor } = tunnelContactY(halfWidth);
    const simulation = createSimulationWithField(
      createControlledField({ halfWidth }),
      {
        start: {
          position: { x: 40, y: floor + 0.005 },
          velocity: { x: 0, y: -20 },
        },
      },
    );
    const damaged = simulation.step(noThrusters);
    const damageTick = damaged.tick;
    const hullAfterDamage = damaged.hull;
    let secondDamageTick = -1;

    expect(damaged.invulnerable).toBe(true);

    for (let tick = 0; tick < 600; tick += 1) {
      const wasInvulnerable = simulation.getState().invulnerable;
      const state = simulation.step(bothThrusters);
      if (wasInvulnerable) {
        expect(state.hull).toBe(hullAfterDamage);
      }
      if (state.hull < hullAfterDamage) {
        secondDamageTick = state.tick;
        break;
      }
    }

    expect(secondDamageTick).toBeGreaterThan(damageTick);
    expect(
      (secondDamageTick - damageTick) * sim.FIXED_DT,
    ).toBeGreaterThanOrEqual(sim.INVULNERABILITY_SECONDS);
  });

  it("sets destroyed at zero hull and freezes the terminal state", () => {
    const simulation = createSimulationWithField(createControlledField(), {
      hull: 1,
      start: {
        position: { x: 40, y: floorContactY + 0.005 },
        velocity: { x: 0, y: -4 },
      },
    });

    const destroyed = simulation.step(noThrusters);

    expect(destroyed.hull).toBe(0);
    expect(destroyed.outcome).toBe("destroyed");
    expect(simulation.step(bothThrusters)).toEqual(destroyed);
    expect(simulation.getState()).toEqual(destroyed);
  });

  it("prevents high-speed vertical travel from tunneling through the floor", () => {
    const simulation = createSimulationWithField(createControlledField(), {
      start: {
        position: { x: 40, y: 60 },
        velocity: { x: 0, y: -10_000 },
      },
    });

    const state = simulation.step(noThrusters);

    expect(state.ship.position.y).toBeGreaterThanOrEqual(floorContactY - 0.01);
    expect(state.hull).toBe(0);
    expect(state.outcome).toBe("destroyed");
  });
});
