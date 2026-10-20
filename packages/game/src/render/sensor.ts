import type { SimState } from "@moonlander/sim";
import type { Camera, Viewport } from "../camera";
import { drawRadar } from "./radar";

export type SensorRenderer = (
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  state: SimState,
) => void;

export function drawSensorOverlay(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  state: SimState,
): void {
  drawRadar(ctx, viewport, camera, state);
}

export {
  RADAR_MAX_RADIUS,
  RADAR_MIN_RADIUS,
  RADAR_VIEWPORT_FRACTION,
  clampRadarRadius,
  drawRadar,
  eyeRadarPoints,
  radarRadiusForViewport,
  radarSweepAngle,
  worldAlignedRadarPoint,
} from "./radar";
