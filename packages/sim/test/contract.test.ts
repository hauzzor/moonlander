import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  Action,
  LevelId,
  Observation,
  Planet,
  SimState,
  Simulation,
  SimulationOptions,
  Vec2,
  World,
} from "../src/index";
import { sim } from "./helpers";

const SPACE_LEVELS: readonly LevelId[] = ["gravity", "anti-gravity"];

describe("T-0022 frozen public contract", () => {
  it("freezes the level, planet, world, state, observation, and simulation types", () => {
    expectTypeOf<LevelId>().toEqualTypeOf<
      "sandworm" | "gravity" | "anti-gravity"
    >();
    expectTypeOf<Action["top"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<SimState["level"]>().toEqualTypeOf<LevelId>();
    expectTypeOf<SimState["thrusters"]["top"]>().toEqualTypeOf<boolean>();
    expectTypeOf<SimState["gravityAcceleration"]>().toEqualTypeOf<Vec2>();
    expectTypeOf<SimState["topThrusterScale"]>().toEqualTypeOf<number>();
    expectTypeOf<SimState["planets"]>().toMatchTypeOf<readonly Planet[]>();
    expectTypeOf<Observation["level"]>().toEqualTypeOf<LevelId>();
    expectTypeOf<Observation["gravityAcceleration"]>().toEqualTypeOf<Vec2>();
    expectTypeOf<Observation["topThrusterScale"]>().toEqualTypeOf<number>();
    expectTypeOf<Observation["planets"]>().toMatchTypeOf<readonly Planet[]>();
    expectTypeOf<Simulation["level"]>().toEqualTypeOf<LevelId>();
    expectTypeOf<Simulation["world"]>().toMatchTypeOf<World>();
    expectTypeOf<Simulation["setTopThrusterScale"]>().toEqualTypeOf<
      (scale: number) => void
    >();
    expectTypeOf<SimulationOptions["level"]>().toEqualTypeOf<
      LevelId | undefined
    >();
    expectTypeOf<SimulationOptions["topThrusterScale"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<Planet["polarity"]>().toEqualTypeOf<"attract" | "repel">();
    expectTypeOf<Planet["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Planet["position"]>().toEqualTypeOf<Vec2>();
    expectTypeOf<Planet["velocity"]>().toEqualTypeOf<Vec2>();
    expectTypeOf<Planet["radius"]>().toEqualTypeOf<number>();
    expectTypeOf<Planet["surfaceGravity"]>().toEqualTypeOf<number>();
    expectTypeOf<World["kind"]>().toEqualTypeOf<"tunnel" | "space">();
  });

  it("accepts a complete Planet literal with both polarities", () => {
    const attract: Planet = {
      id: "planet-1",
      position: { x: 10, y: 20 },
      velocity: { x: 0.5, y: -0.5 },
      radius: sim.PLANET_RADIUS,
      surfaceGravity: sim.PLANET_SURFACE_GRAVITY,
      polarity: "attract",
    };
    const repel: Planet = { ...attract, id: "planet-2", polarity: "repel" };

    expect(attract.polarity).toBe("attract");
    expect(repel.polarity).toBe("repel");
    expect(attract.radius).toBe(24);
    expect(attract.surfaceGravity).toBe(8);
  });

  it("freezes the planet, drift, collision, and top-thruster constants", () => {
    expect(sim.PLANET_RADIUS).toBe(24);
    expect(sim.PLANET_SURFACE_GRAVITY).toBe(8);
    expect(sim.PLANET_GRAVITY_RANGE).toBe(480);
    expect(sim.PLANET_CELL_SIZE).toBe(500);
    expect(sim.PLANET_DENSITY).toBe(0.6);
    expect(sim.PLANET_MIN_SURFACE_GAP).toBe(192);
    expect(sim.PLANET_SPAWN_CLEARANCE).toBe(300);
    expect(sim.PLANET_DRIFT_MIN).toBe(0.2);
    expect(sim.PLANET_DRIFT_MAX).toBe(1);
    expect(sim.PLANET_DRIFT_SPEED_CAP).toBe(2);
    expect(sim.PLANET_DRIFT_DRAG).toBe(0.02);
    expect(sim.PLANET_PLANET_RESTITUTION).toBe(0.8);
    expect(sim.TOP_THRUSTER_FORCE).toBe(1800);
    expect(sim.TOP_MOUNT).toEqual({ x: 0, y: 9 });
    expect("THRUSTER_SCALE_MIN" in sim).toBe(true);
    expect("THRUSTER_SCALE_MAX" in sim).toBe(true);
    expect("THRUSTER_SCALE_DEFAULT" in sim).toBe(true);
  });

  it("defaults createSimulation to the sandworm level and exposes the tunnel world", () => {
    const defaulted = sim.createSimulation({ seed: 11 });
    const explicit = sim.createSimulation({ seed: 11, level: "sandworm" });

    expect(defaulted.level).toBe("sandworm");
    expect(defaulted.world.kind).toBe("tunnel");
    expect(defaulted.world.seed).toBe(11);
    expect(defaulted.getState().level).toBe("sandworm");
    expect(defaulted.getObservation().level).toBe("sandworm");
    expect(defaulted.getState().planets).toEqual([]);
    expect(defaulted.getObservation().planets).toEqual([]);
    expect(defaulted.getState().topThrusterScale).toBe(
      sim.THRUSTER_SCALE_DEFAULT,
    );
    expect(defaulted.getObservation().topThrusterScale).toBe(
      sim.THRUSTER_SCALE_DEFAULT,
    );
    expect(defaulted.getState().gravityAcceleration.x).toBe(0);
    expect(defaulted.getState().gravityAcceleration.y).toBeCloseTo(
      -sim.GRAVITY * sim.GRAVITY_SCALE_DEFAULT,
      14,
    );
    expect(defaulted.getObservation().gravityAcceleration).toEqual(
      defaulted.getState().gravityAcceleration,
    );
    expect(explicit.getState()).toEqual(defaulted.getState());
    expect(typeof defaulted.setTopThrusterScale).toBe("function");
  });

  it("normalizes an omitted Action.top to false and keeps an explicit top", () => {
    const omitted = sim.createSimulation({ seed: 3 }).getState();
    expect(omitted.thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
      top: false,
    });

    const simulation = sim.createSimulation({ seed: 3 });
    const withoutTop: Action = { left: true, right: false, rear: false };
    const idle = simulation.step(withoutTop);
    expect(idle.thrusters).toEqual({
      left: true,
      right: false,
      rear: false,
      top: false,
    });

    const withTop: Action = {
      left: false,
      right: false,
      rear: false,
      top: true,
    };
    const top = simulation.step(withTop);
    expect(top.thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
      top: true,
    });

    const backOff: Action = {
      left: false,
      right: false,
      rear: false,
      top: false,
    };
    expect(simulation.step(backOff).thrusters.top).toBe(false);
  });

  it.each(SPACE_LEVELS)(
    "creates a deterministic populated %s space world with Euclidean progress",
    (level) => {
      const world = sim.createSpaceField(level, 17);
      const repeated = sim.createSpaceField(level, 17);

      expect(world.kind).toBe("space");
      expect(world.level).toBe(level);
      expect(world.seed).toBe(17);
      expect(world.spawn.x).toBeTypeOf("number");
      expect(world.spawn.y).toBeTypeOf("number");
      expect(Number.isFinite(world.spawn.x)).toBe(true);
      expect(Number.isFinite(world.spawn.y)).toBe(true);
      expect(world.planets.length).toBeGreaterThan(0);
      expect(world.planetsInView(world.spawn, 4_000)).toEqual(
        repeated.planetsInView(world.spawn, 4_000),
      );
      for (const planet of world.planets) {
        expect(planet.radius).toBe(sim.PLANET_RADIUS);
        expect(planet.surfaceGravity).toBe(sim.PLANET_SURFACE_GRAVITY);
        expect(Number.isFinite(planet.position.x)).toBe(true);
        expect(Number.isFinite(planet.position.y)).toBe(true);
      }
      expect(world.wallsInView(world.spawn, 1_000)).toEqual([]);
      expect(typeof world.stepBodies).toBe("function");
      expect(Number.isFinite(world.gravityAt(world.spawn).x)).toBe(true);
      expect(Number.isFinite(world.gravityAt(world.spawn).y)).toBe(true);
      expect(world.progressAt(world.spawn)).toBeCloseTo(0, 14);
      expect(
        world.progressAt({ x: world.spawn.x + 3, y: world.spawn.y + 4 }),
      ).toBeCloseTo(5, 14);
      expect(
        world.progressAt({ x: world.spawn.x - 3, y: world.spawn.y + 4 }),
      ).toBeCloseTo(5, 14);
    },
  );

  it.each(SPACE_LEVELS)(
    "wires the %s space world into state and observation without tunnel geometry",
    (level) => {
      const simulation = sim.createSimulation({
        level,
        seed: 5,
        start: { velocity: { x: 3, y: 4 } },
      });
      const state = simulation.getState();
      const observation = simulation.getObservation();

      expect(simulation.level).toBe(level);
      expect(simulation.world.kind).toBe("space");
      expect(state.level).toBe(level);
      expect(state.planets.length).toBeGreaterThan(0);
      expect(state.planets).toEqual(
        simulation.world.planetsInView(
          state.ship.position,
          sim.PLANET_GRAVITY_RANGE,
        ),
      );
      expect(Number.isFinite(state.gravityAcceleration.x)).toBe(true);
      expect(Number.isFinite(state.gravityAcceleration.y)).toBe(true);
      expect(observation.level).toBe(level);
      expect(observation.planets).toEqual(state.planets);
      expect(observation.gravityAcceleration).toEqual(
        state.gravityAcceleration,
      );
      expect(observation.tunnelCenterOffset).toBe(0);
      expect(observation.tunnelHalfWidth).toBe(0);
      expect(observation.tunnelHeading).toBe(0);
      expect(observation.forwardSpeed).toBe(3);
      expect(observation.lateralSpeed).toBe(4);
      expect(observation.progress).toBe(0);
      expect(observation.score).toBe(0);

      const reset = simulation.reset(9);
      expect(reset.level).toBe(level);
      expect(simulation.level).toBe(level);
      expect(simulation.world.kind).toBe("space");
    },
  );

  it("keeps the tunnel field accessor compatible with createField", () => {
    const simulation = sim.createSimulation({ seed: 23 });

    expect(simulation.field).toBe(simulation.field);
    expect(simulation.field.seed).toBe(23);
    expect(simulation.field.tunnel.centerAt(0)).toEqual({
      x: 0,
      y: sim.TUNNEL_CENTER_Y,
    });
    expect(simulation.world.seed).toBe(23);
  });
});
