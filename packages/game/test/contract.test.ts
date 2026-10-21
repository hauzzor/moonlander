import { describe, expect, it } from "vitest";
import {
  GRAVITY,
  THRUSTER_SCALE_DEFAULT,
  type Planet,
} from "@moonlander/sim";
import { makeState } from "./fixtures";

const simStateKeys = [
  "bottomThrusterScale",
  "eyeSensorRadius",
  "gravity",
  "gravityAcceleration",
  "gravityScale",
  "hull",
  "invulnerable",
  "level",
  "outcome",
  "planets",
  "progress",
  "rearThrusterScale",
  "score",
  "seed",
  "sensors",
  "ship",
  "thrusters",
  "tick",
  "time",
  "topThrusterScale",
].sort();

describe("T-0022 SimState fixture contract", () => {
  it("populates every multi-level field with Level 1 defaults", () => {
    const state = makeState();

    expect(Object.keys(state).sort()).toEqual(simStateKeys);
    expect(state.level).toBe("sandworm");
    expect(state.planets).toEqual([]);
    expect(state.gravityAcceleration).toEqual({ x: 0, y: -GRAVITY });
    expect(state.topThrusterScale).toBe(THRUSTER_SCALE_DEFAULT);
    expect(state.thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
      top: false,
    });
  });

  it("accepts overrides for the new level, planet, gravity, and top fields", () => {
    const planet: Planet = {
      id: "planet-1",
      position: { x: 300, y: -200 },
      velocity: { x: 0, y: 0 },
      radius: 24,
      surfaceGravity: 8,
      polarity: "attract",
    };
    const state = makeState({
      level: "gravity",
      planets: [planet],
      gravityAcceleration: { x: 1.5, y: -2.5 },
      topThrusterScale: 4,
      thrusters: { left: true, top: true },
    });

    expect(state.level).toBe("gravity");
    expect(state.planets).toEqual([planet]);
    expect(state.gravityAcceleration).toEqual({ x: 1.5, y: -2.5 });
    expect(state.topThrusterScale).toBe(4);
    expect(state.thrusters).toEqual({
      left: true,
      right: false,
      rear: false,
      top: true,
    });
  });
});
