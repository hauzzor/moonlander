import type { Field, SimState } from "@moonlander/sim";
import {
  snapCamera,
  type Camera,
  type Viewport,
} from "../camera";
import {
  getCanvas,
  readDevicePixelRatio,
  resizeCanvasToDisplay,
} from "../dom";
import { drawBackdrop } from "./backdrop";
import { drawField } from "./field";
import { drawRadar } from "./radar";
import { drawStarship } from "./ship";

export const VIEW_TARGET_WIDTH = 300;
export const VIEW_TARGET_HEIGHT = 170;
export const MIN_VIEW_SCALE = 1.35;
export const MAX_VIEW_SCALE = 7;
export const SPEED_ZOOM_SCALE = 0.005;
export const MIN_SPEED_ZOOM = 0.88;

export type SensorRenderer = (
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  state: SimState,
) => void;

export interface RendererOptions {
  canvas?: HTMLCanvasElement;
  context?: CanvasRenderingContext2D;
  sensorRenderer?: SensorRenderer;
}

export interface Renderer {
  resize(): void;
  render(state: SimState, field: Field, camera: Camera): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeViewScale(
  cssWidth: number,
  cssHeight: number,
): number {
  if (!(cssWidth > 0) || !(cssHeight > 0)) {
    return MIN_VIEW_SCALE;
  }

  return clamp(
    Math.min(
      cssWidth / VIEW_TARGET_WIDTH,
      cssHeight / VIEW_TARGET_HEIGHT,
    ),
    MIN_VIEW_SCALE,
    MAX_VIEW_SCALE,
  );
}

export function computeSpeedZoom(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) {
    return 1;
  }

  return clamp(1 - speed * SPEED_ZOOM_SCALE, MIN_SPEED_ZOOM, 1);
}

export function computeViewport(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): Viewport {
  const width = Number.isFinite(cssWidth) ? Math.max(1, cssWidth) : 1;
  const height = Number.isFinite(cssHeight) ? Math.max(1, cssHeight) : 1;

  return {
    width,
    height,
    dpr: clamp(Number.isFinite(dpr) ? dpr : 1, 1, 2),
    scale: computeViewScale(width, height),
  };
}

function resolveContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");

  if (ctx === null) {
    throw new Error("Could not acquire 2D canvas context");
  }

  return ctx;
}

export function createRenderer(
  options: RendererOptions = {},
): Renderer {
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  if (options.canvas !== undefined) {
    canvas = options.canvas;
    ctx = options.context ?? resolveContext(canvas);
  } else {
    const acquired = getCanvas();
    canvas = acquired.canvas;
    ctx = options.context ?? acquired.ctx;
  }

  const sensorRenderer = options.sensorRenderer ?? drawRadar;
  const viewport: Viewport = computeViewport(
    1,
    1,
    readDevicePixelRatio(),
  );
  let baseScale = computeViewScale(viewport.width, viewport.height);

  return {
    resize(): void {
      const metrics = resizeCanvasToDisplay(canvas);

      viewport.width = metrics.cssWidth;
      viewport.height = metrics.cssHeight;
      viewport.dpr = metrics.dpr;
      baseScale = computeViewScale(metrics.cssWidth, metrics.cssHeight);
      viewport.scale = baseScale;
    },

    render(state: SimState, field: Field, camera: Camera): void {
      const speed = Math.hypot(
        state.ship.velocity.x,
        state.ship.velocity.y,
      );
      viewport.scale = baseScale * computeSpeedZoom(speed);

      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.width, viewport.height);

      if (!camera.ready) {
        snapCamera(camera, state);
      }

      drawBackdrop(ctx, viewport);
      drawField(ctx, viewport, camera, field, state);
      sensorRenderer(ctx, viewport, camera, state);
      drawStarship(ctx, viewport, camera, state);
    },
  };
}
