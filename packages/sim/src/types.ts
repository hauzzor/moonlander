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

export interface SensorReading {
  radius: number;
  tick: number;
  origin: Vec2;
  heading: number;
  distances: readonly number[];
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
  sensorRadius: number;
  sensor: SensorReading;
}

export interface ShipStart {
  position?: Vec2;
  velocity?: Vec2;
  angle?: number;
  angularVelocity?: number;
}

export interface CurvedWall {
  id: string;
  points: readonly Vec2[];
}

export interface Tunnel {
  halfWidth: number;
  centerAt(x: number): Vec2;
  headingAt(x: number): number;
}

export interface FieldChunk {
  coord: Vec2;
  walls: readonly CurvedWall[];
}

export interface Field {
  seed: number;
  chunkSize: number;
  tunnel: Tunnel;
  getChunk(cx: number, cy: number): FieldChunk;
  chunksInView(center: Vec2, radius: number): readonly FieldChunk[];
}

export interface SimulationOptions {
  seed?: number;
  hull?: number;
  start?: ShipStart;
  field?: Field;
  sensorRadius?: number;
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
  tunnelCenterOffset: number;
  tunnelHalfWidth: number;
  tunnelHeading: number;
  forwardSpeed: number;
  lateralSpeed: number;
  sensorRadius: number;
  sensor: SensorReading;
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
  setSensorRadius(radius: number): void;
  readonly field: Field;
}
