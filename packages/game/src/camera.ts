import type { SimState, Vec2 } from "@moonlander/sim";

export interface Camera {
  x: number;
  y: number;
  ready: boolean;
}

export interface Viewport {
  width: number;
  height: number;
  scale: number;
  dpr: number;
}

export const CAMERA_LOOK_AHEAD_X = 0.35;
export const CAMERA_LOOK_AHEAD_Y = 0.16;
export const CAMERA_MAX_LOOK_AHEAD_X = 55;
export const CAMERA_MAX_LOOK_AHEAD_Y = 26;
export const CAMERA_RESPONSE = 6.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createCamera(): Camera {
  return { x: 0, y: 0, ready: false };
}

export function cameraTarget(state: SimState): Vec2 {
  return {
    x:
      state.ship.position.x +
      clamp(
        state.ship.velocity.x * CAMERA_LOOK_AHEAD_X,
        -CAMERA_MAX_LOOK_AHEAD_X,
        CAMERA_MAX_LOOK_AHEAD_X,
      ),
    y:
      state.ship.position.y +
      clamp(
        state.ship.velocity.y * CAMERA_LOOK_AHEAD_Y,
        -CAMERA_MAX_LOOK_AHEAD_Y,
        CAMERA_MAX_LOOK_AHEAD_Y,
      ) +
      8,
  };
}

export function snapCamera(camera: Camera, state: SimState): void {
  const target = cameraTarget(state);
  camera.x = target.x;
  camera.y = target.y;
  camera.ready = true;
}

export function updateCamera(
  camera: Camera,
  state: SimState,
  deltaSeconds: number,
): void {
  if (!camera.ready) {
    snapCamera(camera, state);
    return;
  }

  const target = cameraTarget(state);
  const blend = 1 - Math.exp(-CAMERA_RESPONSE * Math.min(deltaSeconds, 0.1));
  camera.x += (target.x - camera.x) * blend;
  camera.y += (target.y - camera.y) * blend;
}

export function worldToScreen(
  viewport: Viewport,
  camera: Camera,
  x: number,
  y: number,
): Vec2 {
  return {
    x: viewport.width / 2 + (x - camera.x) * viewport.scale,
    y: viewport.height / 2 - (y - camera.y) * viewport.scale,
  };
}
