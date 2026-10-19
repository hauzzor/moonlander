import {
  SENSOR_INTERVAL_SECONDS,
  SENSOR_RAY_COUNT,
  type SimState,
  type Vec2,
} from "@moonlander/sim";
import {
  worldToScreen,
  type Camera,
  type Viewport,
} from "../camera";

const RADAR_MIN_RADIUS = 72;
const RADAR_MAX_RADIUS = 160;
const RADAR_VIEWPORT_FRACTION = 0.2;
const RADAR_RINGS = [0.25, 0.5, 0.75, 1] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function drawRadar(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  state: SimState,
): void {
  const reading = state.sensor;
  if (reading.radius <= 0 || reading.distances.length === 0) {
    return;
  }

  const center = worldToScreen(
    viewport,
    camera,
    state.ship.position.x,
    state.ship.position.y,
  );
  const radarRadius = clamp(
    Math.min(viewport.width, viewport.height) * RADAR_VIEWPORT_FRACTION,
    RADAR_MIN_RADIUS,
    RADAR_MAX_RADIUS,
  );
  const distanceScale = radarRadius / reading.radius;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, viewport.width, viewport.height);
  ctx.clip();

  ctx.strokeStyle = "rgba(92, 231, 227, 0.16)";
  ctx.lineWidth = 1;
  for (const fraction of RADAR_RINGS) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radarRadius * fraction, 0, Math.PI * 2);
    ctx.stroke();
  }

  const points: Vec2[] = [];
  for (let index = 0; index < SENSOR_RAY_COUNT; index += 1) {
    const distance = reading.distances[index] ?? reading.radius;
    const length = clamp(distance, 0, reading.radius) * distanceScale;
    const relativeAngle = (index / SENSOR_RAY_COUNT) * Math.PI * 2;
    const angle = state.ship.angle + relativeAngle;
    points.push({
      x: center.x + Math.cos(angle) * length,
      y: center.y - Math.sin(angle) * length,
    });
  }

  const first = points[0]!;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(80, 231, 223, 0.055)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 245, 238, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const sweepPhase =
    ((state.time % SENSOR_INTERVAL_SECONDS) / SENSOR_INTERVAL_SECONDS) *
    Math.PI *
    2;
  const sweepAngle = state.ship.angle + sweepPhase;
  ctx.save();
  ctx.strokeStyle = "rgba(131, 255, 244, 0.52)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(93, 240, 231, 0.8)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(
    center.x + Math.cos(sweepAngle) * radarRadius,
    center.y - Math.sin(sweepAngle) * radarRadius,
  );
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(150, 255, 246, 0.8)";
  ctx.beginPath();
  ctx.arc(center.x, center.y, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
