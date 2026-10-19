import { FIXED_DT, INITIAL_FUEL } from "./constants";
import { evaluateOutcome } from "./collision";
import { consumeFuel, integrate, thrusterEffect } from "./physics";
import { createTerrain } from "./terrain";
import type {
  Action,
  LanderState,
  LandingOutcome,
  Observation,
  SimState,
  Simulation,
  SimulationOptions,
  Terrain,
  Vec2,
} from "./types";

const DEFAULT_POSITION: Vec2 = { x: 300, y: 90 };

interface Snapshot {
  body: LanderState;
  fuel: number;
}

interface Current {
  tick: number;
  body: LanderState;
  fuel: number;
  thrusters: Action;
  outcome: LandingOutcome;
}

function initialBody(options: SimulationOptions): LanderState {
  const position = options.start?.position;
  const velocity = options.start?.velocity;
  return {
    position: position ? { x: position.x, y: position.y } : { ...DEFAULT_POSITION },
    velocity: velocity ? { x: velocity.x, y: velocity.y } : { x: 0, y: 0 },
    angle: options.start?.angle ?? 0,
    angularVelocity: options.start?.angularVelocity ?? 0,
  };
}

function initialCurrent(initial: Snapshot): Current {
  return {
    tick: 0,
    body: initial.body,
    fuel: initial.fuel,
    thrusters: { left: false, right: false },
    outcome: "flying",
  };
}

function toSimState(current: Current): SimState {
  return {
    tick: current.tick,
    time: current.tick * FIXED_DT,
    lander: {
      position: {
        x: current.body.position.x,
        y: current.body.position.y,
      },
      velocity: {
        x: current.body.velocity.x,
        y: current.body.velocity.y,
      },
      angle: current.body.angle,
      angularVelocity: current.body.angularVelocity,
    },
    fuel: current.fuel,
    thrusters: { left: current.thrusters.left, right: current.thrusters.right },
    outcome: current.outcome,
  };
}

export function createSimulation(options: SimulationOptions = {}): Simulation {
  const initial: Snapshot = {
    body: initialBody(options),
    fuel: options.fuel ?? INITIAL_FUEL,
  };
  let seed = options.seed ?? 0;
  let terrain = createTerrain(seed);
  let current = initialCurrent(initial);

  const getState = (): SimState => toSimState(current);

  const getObservation = (): Observation => {
    const x = current.body.position.x;
    return {
      x,
      altitude: current.body.position.y - terrain.heightAt(x),
      vx: current.body.velocity.x,
      vy: current.body.velocity.y,
      angle: current.body.angle,
      angularVelocity: current.body.angularVelocity,
      fuel: current.fuel,
      padOffsetX: (terrain.pad.left + terrain.pad.right) / 2 - x,
    };
  };

  return {
    getState,
    getObservation,
    get terrain(): Terrain {
      return terrain;
    },
    step: (action: Action): SimState => {
      if (current.outcome !== "flying") {
        return getState();
      }
      const usage = consumeFuel(current.fuel, action);
      const effect = thrusterEffect(
        current.body.angle,
        usage.leftScale,
        usage.rightScale,
      );
      const body = integrate(current.body, effect, FIXED_DT);
      current = {
        tick: current.tick + 1,
        body,
        fuel: usage.fuel,
        // Report only thrusters that actually produced thrust this step,
        // so commands issued at zero fuel read back as inactive.
        thrusters: {
          left: usage.leftScale > 0,
          right: usage.rightScale > 0,
        },
        outcome: evaluateOutcome(body, terrain),
      };
      return getState();
    },
    reset: (newSeed?: number): SimState => {
      if (newSeed !== undefined) {
        seed = newSeed;
      }
      terrain = createTerrain(seed);
      current = initialCurrent(initial);
      return getState();
    },
  };
}
