export interface Vec2 {
  x: number;
  y: number;
}

export interface Action {
  left: boolean;
  right: boolean;
}

export type LandingOutcome = "flying" | "landed" | "missed-pad" | "crashed";

export interface LanderState {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
}

export interface SimState {
  tick: number;
  time: number;
  lander: LanderState;
  fuel: number;
  thrusters: Action;
  outcome: LandingOutcome;
}

export interface LanderStart {
  position?: Vec2;
  velocity?: Vec2;
  angle?: number;
  angularVelocity?: number;
}

export interface SimulationOptions {
  seed?: number;
  fuel?: number;
  start?: LanderStart;
}

export interface Simulation {
  getState(): SimState;
  step(action: Action): SimState;
  reset(seed?: number): SimState;
}
