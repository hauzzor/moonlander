import type { EyeSensorReading, SimState, Vec2 } from "@moonlander/sim";

export interface StateOverrides {
  position?: Vec2;
  velocity?: Vec2;
  angle?: number;
  angularVelocity?: number;
  hull?: number;
  invulnerable?: boolean;
  thrusters?: Partial<SimState["thrusters"]>;
  outcome?: SimState["outcome"];
  score?: number;
  progress?: number;
  seed?: number;
  time?: number;
  tick?: number;
  eyeSensorRadius?: number;
}

export const START_POSITION: Vec2 = { x: 0, y: 60 };

export function makeState(overrides: StateOverrides = {}): SimState {
  const position = overrides.position ?? START_POSITION;
  const velocity = overrides.velocity ?? { x: 0, y: 0 };
  const radius = overrides.eyeSensorRadius ?? 120;
  const eye: EyeSensorReading = {
    radius,
    tick: overrides.tick ?? 0,
    origin: position,
    heading: overrides.angle ?? 0,
    distances: Array.from({ length: 360 }, () => radius),
  };

  return {
    tick: overrides.tick ?? 0,
    time: overrides.time ?? 0,
    seed: overrides.seed ?? 1,
    ship: {
      position,
      velocity,
      angle: overrides.angle ?? 0,
      angularVelocity: overrides.angularVelocity ?? 0,
    },
    hull: overrides.hull ?? 100,
    invulnerable: overrides.invulnerable ?? false,
    thrusters: {
      left: overrides.thrusters?.left ?? false,
      right: overrides.thrusters?.right ?? false,
      rear: overrides.thrusters?.rear ?? false,
    },
    outcome: overrides.outcome ?? "flying",
    score: overrides.score ?? 0,
    progress: overrides.progress ?? 0,
    eyeSensorRadius: radius,
    sensors: {
      eye,
      direction: { angle: overrides.angle ?? 0 },
      distanceToStart: Math.hypot(
        position.x - START_POSITION.x,
        position.y - START_POSITION.y,
      ),
      velocity: {
        vx: velocity.x,
        vy: velocity.y,
        speed: Math.hypot(velocity.x, velocity.y),
        angle: Math.atan2(velocity.y, velocity.x),
      },
    },
  };
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
