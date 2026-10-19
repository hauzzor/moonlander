export interface Vec2 {
  x: number;
  y: number;
}

export interface Action {
  left: boolean;
  right: boolean;
}

export type RunOutcome = "flying" | "destroyed";

export interface ShipState {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
}

export interface SimState {
  tick: number;
  time: number;
  seed: number;
  ship: ShipState;
  hull: number;
  invulnerable: boolean;
  thrusters: Action;
  outcome: RunOutcome;
  score: number;
  progress: number;
  gatesPassed: number;
}

export interface ShipStart {
  position?: Vec2;
  velocity?: Vec2;
  angle?: number;
  angularVelocity?: number;
}

export interface SimulationOptions {
  seed?: number;
  hull?: number;
  start?: ShipStart;
  field?: Field;
}

export interface CurvedWall {
  id: string;
  points: readonly Vec2[];
}

export interface Gate {
  id: string;
  center: Vec2;
  radius: number;
  normal: Vec2;
}

export interface FieldChunk {
  coord: Vec2;
  walls: readonly CurvedWall[];
  gates: readonly Gate[];
}

export interface Field {
  seed: number;
  chunkSize: number;
  groundY: number;
  getChunk(cx: number, cy: number): FieldChunk;
  chunksInView(center: Vec2, radius: number): readonly FieldChunk[];
}

export interface Observation {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  hull: number;
  progress: number;
  score: number;
  nearestWallDistance: number;
  nearestGateDistance: number;
  nearestGateAngle: number;
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
  readonly field: Field;
}
