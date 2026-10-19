import type { Vec2 } from "./types";

export const FIXED_DT = 1 / 120;
export const GRAVITY = 1.62;
export const FIELD_CHUNK_SIZE = 80;
export const INITIAL_HULL = 100;
export const DEFAULT_SEED = 1;

export const SHIP_MASS = 200;
export const SHIP_LENGTH = 48;
export const SHIP_HEIGHT = 18;
export const SHIP_RADIUS = 9;
export const SHIP_CAPSULE_HALF_LENGTH = 15;
export const SHIP_INERTIA =
  (SHIP_MASS * (SHIP_LENGTH ** 2 + SHIP_HEIGHT ** 2)) / 12;

export const THRUSTER_FORCE = 1800;
export const THRUSTER_CANT = (15 * Math.PI) / 180;
export const LEFT_MOUNT: Vec2 = { x: -16, y: -9 };
export const RIGHT_MOUNT: Vec2 = { x: 16, y: -9 };

export const LINEAR_DRAG = 0.35;
export const ANGULAR_DRAG = 0.25;

export const TUNNEL_HALF_WIDTH = 34;
export const TUNNEL_CENTER_Y = 60;
export const TUNNEL_START_STRAIGHT = 120;
export const TUNNEL_BEND_AMPLITUDE = 24;
export const TUNNEL_MAX_SLOPE = 0.35;
export const TUNNEL_SAMPLE_STEP = 8;

export const WALL_RADIUS = 2;
export const DAMAGE_SPEED_THRESHOLD = 2;
export const DAMAGE_SCALE = 4;
export const INVULNERABILITY_SECONDS = 0.75;
export const BOUNCE_RESTITUTION = 0.35;
export const SENSOR_RANGE = 200;
export const SENSOR_RAY_COUNT = 360;
export const SENSOR_INTERVAL_SECONDS = 1;
export const SENSOR_VIEW_MIN = 20;
export const SENSOR_VIEW_MAX = 200;
export const SENSOR_VIEW_DEFAULT = 120;

export const START_POSITION: Vec2 = { x: 0, y: 60 };
