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

export interface TerrainPad {
  left: number;
  right: number;
  y: number;
}

export interface Terrain {
  seed: number;
  points: readonly Vec2[];
  pad: TerrainPad;
  heightAt(x: number): number;
}

export interface Observation {
  x: number;
  altitude: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  fuel: number;
  padOffsetX: number;
}

export interface Controller {
  act(observation: Observation): Action;
  reset?(): void;
}

export interface Simulation {
  getState(): SimState;
  getObservation(): Observation;
  step(action: Action): SimState;
  reset(seed?: number): SimState;
  readonly terrain: Terrain;
}
