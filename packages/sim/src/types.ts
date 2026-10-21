export interface Vec2 {
  x: number;
  y: number;
}

export type LevelId = "sandworm" | "gravity" | "anti-gravity";
export type SpaceLevelId = Exclude<LevelId, "sandworm">;

export type PlanetPolarity = "attract" | "repel";

export interface Planet {
  id: string;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  surfaceGravity: number;
  polarity: PlanetPolarity;
}

export interface Action {
  left: boolean;
  right: boolean;
  rear: boolean;
  top?: boolean;
}

export interface ThrusterState {
  left: boolean;
  right: boolean;
  rear: boolean;
  top: boolean;
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
  level: LevelId;
  ship: ShipState;
  hull: number;
  invulnerable: boolean;
  thrusters: ThrusterState;
  outcome: RunOutcome;
  score: number;
  progress: number;
  eyeSensorRadius: number;
  gravityScale: number;
  gravity: number;
  gravityAcceleration: Vec2;
  bottomThrusterScale: number;
  topThrusterScale: number;
  rearThrusterScale: number;
  planets: readonly Planet[];
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

export interface WorldBase {
  seed: number;
  spawn: Vec2;
  gravityAt(position: Vec2): Vec2;
  progressAt(position: Vec2): number;
  planetsInView(center: Vec2, radius: number): readonly Planet[];
  wallsInView(center: Vec2, radius: number): readonly CurvedWall[];
  stepBodies(dt: number): void;
}

export interface TunnelWorld extends WorldBase {
  kind: "tunnel";
  field: Field;
}

export interface SpaceWorld extends WorldBase {
  kind: "space";
  level: LevelId;
  planets: readonly Planet[];
}

export type World = TunnelWorld | SpaceWorld;

export interface SimulationOptions {
  seed?: number;
  level?: LevelId;
  hull?: number;
  start?: ShipStart;
  field?: Field;
  eyeSensorRadius?: number;
  gravityScale?: number;
  bottomThrusterScale?: number;
  topThrusterScale?: number;
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
  level: LevelId;
  nearestWallDistance: number;
  tunnelCenterOffset: number;
  tunnelHalfWidth: number;
  tunnelHeading: number;
  forwardSpeed: number;
  lateralSpeed: number;
  eyeSensorRadius: number;
  gravityScale: number;
  gravity: number;
  gravityAcceleration: Vec2;
  bottomThrusterScale: number;
  topThrusterScale: number;
  rearThrusterScale: number;
  planets: readonly Planet[];
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
  setTopThrusterScale(scale: number): void;
  setRearThrusterScale(scale: number): void;
  readonly level: LevelId;
  readonly world: World;
  readonly field: Field;
}
