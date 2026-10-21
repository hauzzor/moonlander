export interface Vec2 {
  x: number;
  y: number;
}

export interface Action {
  left: boolean;
  right: boolean;
  rear: boolean;
}

export type RunOutcome = "flying" | "destroyed";

export interface ShipState {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
}

export interface EyeSensorReading {
  radius: number;
  tick: number;
  origin: Vec2;
  heading: number;
  distances: readonly number[];
}

export interface DirectionSensorReading {
  angle: number;
}

export interface VelocitySensorReading {
  vx: number;
  vy: number;
  speed: number;
  angle: number;
}

export interface SensorSuite {
  eye: EyeSensorReading;
  direction: DirectionSensorReading;
  distanceToStart: number;
  velocity: VelocitySensorReading;
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
  eyeSensorRadius: number;
  gravityScale: number;
  gravity: number;
  bottomThrusterScale: number;
  rearThrusterScale: number;
  sensors: SensorSuite;
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
  halfWidthAt(x: number): number;
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
  eyeSensorRadius?: number;
  gravityScale?: number;
  bottomThrusterScale?: number;
  rearThrusterScale?: number;
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
  eyeSensorRadius: number;
  gravityScale: number;
  gravity: number;
  bottomThrusterScale: number;
  rearThrusterScale: number;
  sensors: SensorSuite;
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
  setEyeSensorRadius(radius: number): void;
  setGravityScale(scale: number): void;
  setBottomThrusterScale(scale: number): void;
  setRearThrusterScale(scale: number): void;
  readonly field: Field;
}
