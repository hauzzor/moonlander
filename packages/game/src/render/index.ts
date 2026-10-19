import type { Field, SimState } from "@moonlander/sim";
import {
  snapCamera,
  type Camera,
  type Viewport,
} from "../camera";
import { getCanvas } from "../dom";
import { drawBackdrop, drawGround } from "./backdrop";
import { drawField } from "./field";
import { drawStarship } from "./ship";

const VIEW_TARGET_WIDTH = 300;
const VIEW_TARGET_HEIGHT = 170;
const MIN_VIEW_SCALE = 1.35;
const MAX_VIEW_SCALE = 7;

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
      viewport.scale = clamp(
        Math.min(cssWidth / VIEW_TARGET_WIDTH, cssHeight / VIEW_TARGET_HEIGHT),
        MIN_VIEW_SCALE,
        MAX_VIEW_SCALE,
      );
    },

    render(state: SimState, field: Field, camera: Camera): void {
      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.width, viewport.height);

      if (!camera.ready) {
        snapCamera(camera, state);
      }

      drawBackdrop(ctx, viewport, camera, state);
      drawGround(ctx, viewport, camera, field);
      drawField(ctx, viewport, camera, field, state);
      drawStarship(ctx, viewport, camera, state);
    },
  };
}
