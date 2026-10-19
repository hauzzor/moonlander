import { FIXED_DT, INITIAL_FUEL } from "./constants";
import { consumeFuel, integrate, thrusterEffect } from "./physics";
import type {
  Action,
  LanderState,
  LandingOutcome,
  SimState,
  Simulation,
  SimulationOptions,
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
  // The seed has no observable effect on the flight model itself; it is kept
  // so reset(seed) rebinds the simulation for the seeded terrain milestone.
  let seed = options.seed ?? 0;
  let current = initialCurrent(initial);

  const getState = (): SimState => toSimState(current);

  return {
    getState,
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
      current = {
        tick: current.tick + 1,
        body: integrate(current.body, effect, FIXED_DT),
        fuel: usage.fuel,
        thrusters: { left: action.left, right: action.right },
        outcome: current.outcome,
      };
      return getState();
    },
    reset: (newSeed?: number): SimState => {
      if (newSeed !== undefined) {
        seed = newSeed;
      }
      current = initialCurrent(initial);
      return getState();
    },
  };
}
