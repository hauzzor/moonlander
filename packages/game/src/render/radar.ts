import {
  EYE_SENSOR_INTERVAL_SECONDS,
  EYE_SENSOR_RAY_COUNT,
  type EyeSensorReading,
  type SimState,
  type Vec2,
} from "@moonlander/sim";
import {
  worldToScreen,
  type Camera,
  type Viewport,
} from "../camera";

export const RADAR_MIN_RADIUS = 72;
export const RADAR_MAX_RADIUS = 160;
export const RADAR_VIEWPORT_FRACTION = 0.2;

const RADAR_RINGS = [0.25, 0.5, 0.75, 1] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function clampRadarRadius(radius: number): number {
  return clamp(
    Number.isFinite(radius) ? radius : RADAR_MIN_RADIUS,
    RADAR_MIN_RADIUS,
    RADAR_MAX_RADIUS,
  );
}

export function radarRadiusForViewport(viewport: Viewport): number {
  const width = Number.isFinite(viewport.width)
    ? Math.max(0, viewport.width)
    : 0;
  const height = Number.isFinite(viewport.height)
    ? Math.max(0, viewport.height)
    : 0;

  return clampRadarRadius(
    Math.min(width, height) * RADAR_VIEWPORT_FRACTION,
  );
}

export function radarSweepAngle(timeSeconds: number): number {
  const interval = positiveFinite(EYE_SENSOR_INTERVAL_SECONDS, 1);
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const phase = ((time % interval) + interval) % interval;

  return (phase / interval) * Math.PI * 2;
}

export function worldAlignedRadarPoint(
  center: Vec2,
  angleRadians: number,
  distance: number,
  distanceScale: number,
): Vec2 {
  const safeDistance = Number.isFinite(distance)
    ? Math.max(0, distance)
    : 0;
  const safeScale = Number.isFinite(distanceScale)
    ? Math.max(0, distanceScale)
    : 0;
  const angle = Number.isFinite(angleRadians) ? angleRadians : 0;
  const length = safeDistance * safeScale;

  return {
    x: center.x + Math.cos(angle) * length,
    y: center.y - Math.sin(angle) * length,
  };
}

export function eyeRadarPoints(
  reading: EyeSensorReading,
  center: Vec2,
  radarRadius: number,
): Vec2[] {
  const scanRadius = positiveFinite(reading.radius, 0);
  const radius = clampRadarRadius(radarRadius);

  if (scanRadius <= 0) {
    return [];
  }

  const distanceScale = radius / scanRadius;
  const points: Vec2[] = [];

  for (let index = 0; index < EYE_SENSOR_RAY_COUNT; index += 1) {
    const rawDistance = reading.distances[index];
    const distance =
      typeof rawDistance === "number" && Number.isFinite(rawDistance)
        ? clamp(rawDistance, 0, scanRadius)
        : scanRadius;
    const angle = (index / EYE_SENSOR_RAY_COUNT) * Math.PI * 2;

    points.push(
      worldAlignedRadarPoint(center, angle, distance, distanceScale),
    );
  }

  return points;
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly Vec2[],
): void {
  if (points.length === 0) {
    return;
  }

  const first = points[0]!;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

function drawRings(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  radarRadius: number,
): void {
  ctx.strokeStyle = "rgba(92, 231, 227, 0.16)";
  ctx.lineWidth = 1;

  for (const fraction of RADAR_RINGS) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radarRadius * fraction, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawHeading(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  angle: number,
  radarRadius: number,
): void {
  const heading = Number.isFinite(angle) ? angle : 0;
  const length = radarRadius * 0.26;
  const wing = radarRadius * 0.075;
  const direction = { x: Math.cos(heading), y: -Math.sin(heading) };
  const perpendicular = { x: -direction.y, y: direction.x };
  const tip = {
    x: center.x + direction.x * length,
    y: center.y + direction.y * length,
  };
  const base = {
    x: tip.x - direction.x * wing * 1.7,
    y: tip.y - direction.y * wing * 1.7,
  };

  ctx.strokeStyle = "rgba(160, 248, 255, 0.72)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  ctx.fillStyle = "rgba(160, 248, 255, 0.82)";
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(
    base.x + perpendicular.x * wing,
    base.y + perpendicular.y * wing,
  );
  ctx.lineTo(
    base.x - perpendicular.x * wing,
    base.y - perpendicular.y * wing,
  );
  ctx.closePath();
  ctx.fill();
}

function drawSweep(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  radarRadius: number,
  angle: number,
): void {
  const end = worldAlignedRadarPoint(center, angle, radarRadius, 1);

  ctx.save();
  ctx.strokeStyle = "rgba(131, 255, 244, 0.52)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(93, 240, 231, 0.8)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

export function drawRadar(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  state: SimState,
): void {
  const reading = state.sensors.eye;
  const scanRadius = positiveFinite(
    reading.radius,
    state.eyeSensorRadius,
  );

  if (scanRadius <= 0) {
    return;
  }

  const center = worldToScreen(
    viewport,
    camera,
    state.ship.position.x,
    state.ship.position.y,
  );
  const radarRadius = radarRadiusForViewport(viewport);
  const points = eyeRadarPoints(reading, center, radarRadius);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, viewport.width, viewport.height);
  ctx.clip();

  drawRings(ctx, center, radarRadius);

  if (points.length > 0) {
    tracePolygon(ctx, points);
    ctx.fillStyle = "rgba(80, 231, 223, 0.055)";
    ctx.fill();
    ctx.strokeStyle = "rgba(100, 245, 238, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawHeading(ctx, center, state.ship.angle, radarRadius);
  drawSweep(
    ctx,
    center,
    radarRadius,
    radarSweepAngle(state.time),
  );

  ctx.fillStyle = "rgba(150, 255, 246, 0.8)";
  ctx.beginPath();
  ctx.arc(center.x, center.y, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
