import type { Field, SimState } from "@moonlander/sim";
import {
  snapCamera,
  type Camera,
  type Viewport,
} from "../camera";
import { getCanvas } from "../dom";
import { drawBackdrop } from "./backdrop";
import { drawField } from "./field";
import { drawRadar } from "./radar";
import { drawStarship } from "./ship";

const VIEW_TARGET_WIDTH = 300;
const VIEW_TARGET_HEIGHT = 170;
const MIN_VIEW_SCALE = 1.35;
const MAX_VIEW_SCALE = 7;
const SPEED_ZOOM_SCALE = 0.005;
const MIN_SPEED_ZOOM = 0.88;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface Renderer {
  resize(): void;
  render(state: SimState, field: Field, camera: Camera): void;
}

export function createRenderer(): Renderer {
  const { canvas, ctx } = getCanvas();
  const viewport: Viewport = { width: 1, height: 1, scale: 1, dpr: 1 };
  let baseScale = 1;

  return {
    resize(): void {
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      const cssWidth = Math.max(1, canvas.clientWidth);
      const cssHeight = Math.max(1, canvas.clientHeight);

      canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      canvas.height = Math.max(1, Math.round(cssHeight * dpr));

      viewport.width = cssWidth;
      viewport.height = cssHeight;
      viewport.dpr = dpr;
      baseScale = clamp(
        Math.min(cssWidth / VIEW_TARGET_WIDTH, cssHeight / VIEW_TARGET_HEIGHT),
        MIN_VIEW_SCALE,
        MAX_VIEW_SCALE,
      );
      viewport.scale = baseScale;
    },

    render(state: SimState, field: Field, camera: Camera): void {
      const speed = Math.hypot(
        state.ship.velocity.x,
        state.ship.velocity.y,
      );
      const zoom = clamp(
        1 - speed * SPEED_ZOOM_SCALE,
        MIN_SPEED_ZOOM,
        1,
      );
      viewport.scale = baseScale * zoom;

      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.width, viewport.height);

      if (!camera.ready) {
        snapCamera(camera, state);
      }

      drawBackdrop(ctx, viewport);
      drawField(ctx, viewport, camera, field, state);
      drawRadar(ctx, viewport, camera, state);
      drawStarship(ctx, viewport, camera, state);
    },
  };
}
