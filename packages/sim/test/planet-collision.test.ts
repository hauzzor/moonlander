import { describe, expect, it } from "vitest";
import type { SimState } from "../src/index";
import { capsuleEndpoints } from "../src/collision";
import { closestPointOnSegment } from "../src/geometry";
import {
  createPlanetApproach,
  distance,
  dot,
  magnitude,
  noThrusters,
  sim,
  unit,
} from "./helpers";

const INVULNERABILITY_TICKS = Math.round(
  sim.INVULNERABILITY_SECONDS / sim.FIXED_DT,
);

interface ImpactRun {
  state: SimState;
  before: SimState;
  ticks: number;
}

function runUntilDamage(
  simulation: ReturnType<typeof createPlanetApproach>["simulation"],
  maximumTicks: number,
): ImpactRun {
  let before = simulation.getState();
  for (let tick = 1; tick <= maximumTicks; tick += 1) {
    const state = simulation.step(noThrusters);
    if (state.hull < before.hull) {
      return { state, before, ticks: tick };
    }
    if (state.outcome !== "flying") {
      break;
    }
    before = state;
  }
  throw new Error(`ship did not collide within ${maximumTicks} ticks`);
}

describe("solid ship-planet collision", () => {
  it("damages, bounces, and starts invulnerability on a relative planet impact", () => {
    const approach = createPlanetApproach(125, { gravityScale: 0.1 });
    const impact = runUntilDamage(approach.simulation, 15_000);
    const capsule = capsuleEndpoints(
      impact.before.ship.position,
      impact.before.ship.angle,
    );
    const closest = closestPointOnSegment(
      approach.target.position,
      capsule.start,
      capsule.end,
    );
    const normal = unit({
      x: closest.x - approach.target.position.x,
      y: closest.y - approach.target.position.y,
    });
    const incomingNormalSpeed = dot(impact.before.ship.velocity, normal);
    const outgoingNormalSpeed = dot(impact.state.ship.velocity, normal);
    const tangent = { x: -normal.y, y: normal.x };
    const incomingTangentSpeed = dot(impact.before.ship.velocity, tangent);
    const outgoingTangentSpeed = dot(impact.state.ship.velocity, tangent);

    expect(approach.target.velocity).toEqual({ x: 0, y: 0 });
    expect(impact.ticks).toBeGreaterThan(0);
    expect(impact.state.hull).toBeLessThan(sim.INITIAL_HULL);
    expect(impact.state.hull).toBeGreaterThan(0);
    expect(impact.state.invulnerable).toBe(true);
    expect(impact.state.outcome).toBe("flying");
    expect(
      impact.state.planets.some((planet) => planet.id === approach.target.id),
    ).toBe(true);
    expect(incomingNormalSpeed).toBeLessThan(0);
    expect(-incomingNormalSpeed).toBeGreaterThan(
      sim.DAMAGE_SPEED_THRESHOLD,
    );
    expect(outgoingNormalSpeed).toBeGreaterThan(0);
    expect(outgoingNormalSpeed / -incomingNormalSpeed).toBeCloseTo(
      sim.BOUNCE_RESTITUTION,
      1,
    );
    expect(outgoingTangentSpeed).toBeCloseTo(incomingTangentSpeed, 0);
    expect(
      distance(impact.state.ship.position, approach.target.position),
    ).toBeGreaterThanOrEqual(
      approach.target.radius + sim.SHIP_RADIUS - 1e-6,
    );
  });

  it("holds damage for the invulnerability window after an impact", () => {
    const approach = createPlanetApproach(125, { gravityScale: 0.1 });
    const impact = runUntilDamage(approach.simulation, 15_000);
    const hullAfterImpact = impact.state.hull;

    for (let tick = 1; tick < INVULNERABILITY_TICKS; tick += 1) {
      const state = approach.simulation.step(noThrusters);
      expect(state.invulnerable).toBe(true);
      expect(state.hull).toBe(hullAfterImpact);
    }

    const afterWindow = approach.simulation.step(noThrusters);
    expect(afterWindow.invulnerable).toBe(false);
    expect(afterWindow.hull).toBe(hullAfterImpact);
  });

  it("does not tunnel through a planet at 10,000 m/s", () => {
    const approach = createPlanetApproach(10_000);
    const impact = runUntilDamage(approach.simulation, 50);

    expect(impact.state.hull).toBe(0);
    expect(impact.state.outcome).toBe("destroyed");
    expect(
      distance(impact.state.ship.position, approach.target.position),
    ).toBeGreaterThanOrEqual(
      approach.target.radius + sim.SHIP_RADIUS - 1e-6,
    );
    expect(magnitude(impact.before.ship.velocity)).toBeGreaterThan(9_000);
  });

  it("does not damage the ship from planet gravity alone", () => {
    const approach = createPlanetApproach(0);
    const initial = approach.simulation.getState();
    let state = initial;

    expect(magnitude(initial.gravityAcceleration)).toBeGreaterThan(0);
    for (let tick = 0; tick < 600; tick += 1) {
      state = approach.simulation.step(noThrusters);
    }

    expect(state.hull).toBe(sim.INITIAL_HULL);
    expect(state.outcome).toBe("flying");
    expect(state.invulnerable).toBe(false);
  });

  it("keeps the collision response deterministic for the same approach", () => {
    const first = createPlanetApproach(125, { gravityScale: 0.1 });
    const second = createPlanetApproach(125, {
      seed: first.seed,
      gravityScale: 0.1,
    });
    const firstImpact = runUntilDamage(first.simulation, 15_000);
    const secondImpact = runUntilDamage(second.simulation, 15_000);

    expect(secondImpact.state).toEqual(firstImpact.state);
    expect(secondImpact.before).toEqual(firstImpact.before);
  });
});
