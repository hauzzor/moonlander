import type { Vec2 } from "./types";

export const FIXED_DT = 1 / 120;
export const MOON_GRAVITY = 1.62;

export const WORLD_WIDTH = 600;
export const PAD_WIDTH = 100;

export const INITIAL_FUEL = 100;

export const SAFE_LANDING = {
  verticalSpeed: 2.5,
  horizontalSpeed: 1.5,
  tilt: (12 * Math.PI) / 180,
} as const;

export const LANDER_MASS = 200;
export const LANDER_WIDTH = 36;
export const LANDER_HEIGHT = 24;
export const THRUSTER_FORCE = 500;
export const THRUSTER_CANT = (15 * Math.PI) / 180;
export const FUEL_BURN_RATE = 5;

export const LEFT_MOUNT: Vec2 = { x: -12, y: -12 };
export const RIGHT_MOUNT: Vec2 = { x: 12, y: -12 };

// Rectangular box inertia about the center of mass: m * (w^2 + h^2) / 12.
export const LANDER_INERTIA =
  (LANDER_MASS * (LANDER_WIDTH ** 2 + LANDER_HEIGHT ** 2)) / 12;
