import type { Vec2 } from "./types";

export const FIXED_DT = 1 / 120;
export const GRAVITY = 1.62;
export const GROUND_Y = 0;
export const FIELD_CHUNK_SIZE = 80;
export const INITIAL_HULL = 100;

export const SHIP_MASS = 200;
export const SHIP_LENGTH = 48;
export const SHIP_HEIGHT = 18;
export const SHIP_RADIUS = 9;
export const SHIP_CAPSULE_HALF_LENGTH = 15;
export const SHIP_INERTIA =
  (SHIP_MASS * (SHIP_LENGTH ** 2 + SHIP_HEIGHT ** 2)) / 12;

export const THRUSTER_FORCE = 700;
export const THRUSTER_CANT = (15 * Math.PI) / 180;
export const LEFT_MOUNT: Vec2 = { x: -16, y: -9 };
export const RIGHT_MOUNT: Vec2 = { x: 16, y: -9 };

export const WALL_RADIUS = 2;
export const GATE_FRAME_RADIUS = 2;
export const GATE_MIN_RADIUS = 12;
export const GATE_MAX_RADIUS = 18;

export const DAMAGE_SPEED_THRESHOLD = 2;
export const DAMAGE_SCALE = 4;
export const INVULNERABILITY_SECONDS = 0.75;
export const BOUNCE_RESTITUTION = 0.35;
export const GATE_BONUS = 50;

export const SAFE_SPAWN_RADIUS = 100;
export const START_POSITION: Vec2 = { x: 0, y: 60 };
export const SENSOR_RANGE = 200;
