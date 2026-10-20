import {
  TUNNEL_MAX_HALF_WIDTH,
  TUNNEL_SAMPLE_STEP,
  WALL_RADIUS,
  type CurvedWall,
  type Field,
  type SimState,
  type Vec2,
} from "@moonlander/sim";
import {
  worldToScreen,
  type Camera,
  type Viewport,
} from "../camera";

interface TunnelSample {
  top: Vec2;
  bottom: Vec2;
  center: Vec2;
}

const MIN_SAMPLE_STEP = 0.5;
const MAX_SAMPLES = 700;
const HAZE_HALF_WIDTH_FRACTION = 0.575;
const RIB_SPACING = TUNNEL_SAMPLE_STEP * 3;
const MIN_RIB_STEP = 1;
const MAX_RIBS = 512;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hash32(value: number): number {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  result ^= result >>> 16;
  return result >>> 0;
}

function makeSample(
  field: Field,
  viewport: Viewport,
  camera: Camera,
  x: number,
): TunnelSample {
  const center = field.tunnel.centerAt(x);
  const heading = field.tunnel.headingAt(x);
  const halfWidth = field.tunnel.halfWidthAt(x);
  const normalX = -Math.sin(heading);
  const normalY = Math.cos(heading);

  return {
    top: worldToScreen(
      viewport,
      camera,
      center.x + normalX * halfWidth,
      center.y + normalY * halfWidth,
    ),
    bottom: worldToScreen(
      viewport,
      camera,
      center.x - normalX * halfWidth,
      center.y - normalY * halfWidth,
    ),
    center: worldToScreen(viewport, camera, center.x, center.y),
  };
}

function buildSamples(
  field: Field,
  viewport: Viewport,
  camera: Camera,
): TunnelSample[] {
  const halfSpan = viewport.width / (2 * viewport.scale);
  const margin = TUNNEL_MAX_HALF_WIDTH + TUNNEL_SAMPLE_STEP;
  const left = camera.x - halfSpan - margin;
  const right = camera.x + halfSpan + margin;
  const minimumStep = Math.max(MIN_SAMPLE_STEP, (right - left) / MAX_SAMPLES);
  const samples: TunnelSample[] = [];
  let x = left;

  while (x < right) {
    samples.push(makeSample(field, viewport, camera, x));
    const heading = field.tunnel.headingAt(x);
    // TUNNEL_SAMPLE_STEP is a world-space chord, so the x step shrinks with cos(heading).
    const chordStep = TUNNEL_SAMPLE_STEP * Math.abs(Math.cos(heading));
    x += Math.max(minimumStep, chordStep);
  }

  samples.push(makeSample(field, viewport, camera, right));
  return samples;
}

function traceBand(
  ctx: CanvasRenderingContext2D,
  samples: readonly TunnelSample[],
  fraction: number,
): void {
  const first = samples[0]!;
  ctx.moveTo(
    first.center.x + (first.top.x - first.center.x) * fraction,
    first.center.y + (first.top.y - first.center.y) * fraction,
  );

  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index]!;
    ctx.lineTo(
      sample.center.x + (sample.top.x - sample.center.x) * fraction,
      sample.center.y + (sample.top.y - sample.center.y) * fraction,
    );
  }

  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index]!;
    ctx.lineTo(
      sample.center.x + (sample.bottom.x - sample.center.x) * fraction,
      sample.center.y + (sample.bottom.y - sample.center.y) * fraction,
    );
  }

  ctx.closePath();
}

function traceInterior(
  ctx: CanvasRenderingContext2D,
  samples: readonly TunnelSample[],
): void {
  traceBand(ctx, samples, 1);
}

function drawInterior(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  samples: readonly TunnelSample[],
): void {
  const { height } = viewport;
  const interior = ctx.createLinearGradient(0, 0, 0, height);
  interior.addColorStop(0, "#040d18");
  interior.addColorStop(0.32, "#071c2a");
  interior.addColorStop(0.55, "#0a2835");
  interior.addColorStop(0.78, "#071a27");
  interior.addColorStop(1, "#030a13");

  ctx.beginPath();
  traceInterior(ctx, samples);
  ctx.fillStyle = interior;
  ctx.fill();
}

function drawHaze(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  state: SimState,
  samples: readonly TunnelSample[],
): void {
  const { width, height } = viewport;
  const ship = worldToScreen(
    viewport,
    camera,
    state.ship.position.x,
    state.ship.position.y,
  );
  const hazeRadius = Math.max(width, height) * 0.42;

  ctx.save();
  ctx.beginPath();
  traceInterior(ctx, samples);
  ctx.clip();

  const haze = ctx.createRadialGradient(
    ship.x,
    ship.y,
    0,
    ship.x,
    ship.y,
    hazeRadius,
  );
  haze.addColorStop(0, "rgba(91, 193, 217, 0.12)");
  haze.addColorStop(0.45, "rgba(72, 157, 185, 0.06)");
  haze.addColorStop(1, "rgba(48, 105, 141, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  traceBand(ctx, samples, HAZE_HALF_WIDTH_FRACTION);
  ctx.fillStyle = "rgba(102, 197, 214, 0.05)";
  ctx.fill();
  ctx.restore();
}

function drawDust(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  field: Field,
  state: SimState,
  samples: readonly TunnelSample[],
): void {
  const spacing = 18;
  const left = camera.x - viewport.width / (2 * viewport.scale);
  const right = camera.x + viewport.width / (2 * viewport.scale);
  const start = Math.floor(left / spacing) - 1;
  const end = Math.ceil(right / spacing) + 1;
  const speed = Math.hypot(
    state.ship.velocity.x,
    state.ship.velocity.y,
  );
  const streakLength =
    clamp(speed * 0.55, 0, 14) * viewport.scale;

  ctx.save();
  ctx.beginPath();
  traceInterior(ctx, samples);
  ctx.clip();
  ctx.lineCap = "round";

  for (let cell = start; cell <= end; cell += 1) {
    const hash = hash32(
      (field.seed ^ Math.imul(cell, 0x9e3779b1)) >>> 0,
    );
    const jitterX = (hash & 0xffff) / 0xffff;
    const lane = ((hash >>> 16) & 0xffff) / 0xffff;
    const x = cell * spacing + jitterX * spacing;
    if (x < left || x > right) {
      continue;
    }

    const center = field.tunnel.centerAt(x);
    const heading = field.tunnel.headingAt(x);
    const halfWidth = field.tunnel.halfWidthAt(x);
    const normalX = -Math.sin(heading);
    const normalY = Math.cos(heading);
    const laneOffset = (lane * 2 - 1) * halfWidth * 0.82;
    const screen = worldToScreen(
      viewport,
      camera,
      center.x + normalX * laneOffset,
      center.y + normalY * laneOffset,
    );
    const twinkle =
      0.7 + 0.3 * Math.sin(state.time * 1.8 + (hash >>> 8) * 0.0001);
    const alpha =
      (0.1 + (((hash >>> 24) & 0xff) / 255) * 0.16) * twinkle;

    if (streakLength > 3) {
      const tangentX = Math.cos(heading);
      const tangentY = -Math.sin(heading);
      ctx.strokeStyle = `rgba(174, 228, 255, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(
        screen.x - tangentX * streakLength,
        screen.y - tangentY * streakLength,
      );
      ctx.stroke();
    } else {
      const radius = 0.55 + (((hash >>> 12) & 0xff) / 255) * 1.05;
      ctx.fillStyle = `rgba(174, 228, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawRibs(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  field: Field,
): void {
  const left = camera.x - viewport.width / (2 * viewport.scale);
  const right = camera.x + viewport.width / (2 * viewport.scale);
  const start = Math.floor(left / RIB_SPACING) * RIB_SPACING - RIB_SPACING;

  ctx.save();

  let ribs = 0;
  let x = start;
  while (x <= right + RIB_SPACING && ribs < MAX_RIBS) {
    const center = field.tunnel.centerAt(x);
    const heading = field.tunnel.headingAt(x);
    const halfWidth = field.tunnel.halfWidthAt(x);
    const normalX = -Math.sin(heading);
    const normalY = Math.cos(heading);
    const top = worldToScreen(
      viewport,
      camera,
      center.x + normalX * halfWidth,
      center.y + normalY * halfWidth,
    );
    const bottom = worldToScreen(
      viewport,
      camera,
      center.x - normalX * halfWidth,
      center.y - normalY * halfWidth,
    );
    const middle = worldToScreen(viewport, camera, center.x, center.y);
    const shimmer = 0.5 + 0.5 * Math.sin(x * 0.04 + heading * 2.4);

    ctx.strokeStyle = `rgba(91, 161, 190, ${0.1 + shimmer * 0.07})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    ctx.fillStyle = `rgba(148, 219, 237, ${0.04 + shimmer * 0.04})`;
    ctx.beginPath();
    ctx.arc(middle.x, middle.y, 1.6, 0, Math.PI * 2);
    ctx.fill();

    const ribStep = Math.max(
      MIN_RIB_STEP,
      RIB_SPACING * Math.abs(Math.cos(heading)),
    );
    x += ribStep;
    ribs += 1;
  }

  ctx.restore();
}

function traceExactPath(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  points: readonly Vec2[],
): void {
  if (points.length === 0) {
    return;
  }

  const first = worldToScreen(viewport, camera, points[0]!.x, points[0]!.y);
  ctx.moveTo(first.x, first.y);

  for (let index = 1; index < points.length; index += 1) {
    const point = worldToScreen(
      viewport,
      camera,
      points[index]!.x,
      points[index]!.y,
    );
    ctx.lineTo(point.x, point.y);
  }
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  wall: CurvedWall,
): void {
  if (wall.points.length < 2) {
    return;
  }

  const thickness = Math.max(2.4, WALL_RADIUS * 2 * viewport.scale);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  traceExactPath(ctx, viewport, camera, wall.points);
  ctx.lineWidth = thickness * 2.6;
  ctx.strokeStyle = "rgba(48, 139, 189, 0.18)";
  ctx.stroke();

  ctx.beginPath();
  traceExactPath(ctx, viewport, camera, wall.points);
  ctx.lineWidth = thickness;
  ctx.strokeStyle = "#7797b6";
  ctx.stroke();

  ctx.beginPath();
  traceExactPath(ctx, viewport, camera, wall.points);
  ctx.lineWidth = Math.max(1, thickness * 0.22);
  ctx.strokeStyle = "#d9edff";
  ctx.stroke();

  ctx.restore();
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  field: Field,
): void {
  const viewRadius =
    Math.hypot(viewport.width, viewport.height) / (2 * viewport.scale) +
    field.chunkSize;
  const chunks = field.chunksInView(
    { x: camera.x, y: camera.y },
    viewRadius,
  );
  const drawnWalls = new Set<string>();

  for (const chunk of chunks) {
    for (const wall of chunk.walls) {
      if (drawnWalls.has(wall.id)) {
        continue;
      }
      drawnWalls.add(wall.id);
      drawWall(ctx, viewport, camera, wall);
    }
  }
}

export function drawField(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  field: Field,
  state: SimState,
): void {
  const samples = buildSamples(field, viewport, camera);
  if (samples.length === 0) {
    return;
  }

  drawInterior(ctx, viewport, samples);
  drawHaze(ctx, viewport, camera, state, samples);
  drawDust(ctx, viewport, camera, field, state, samples);
  drawRibs(ctx, viewport, camera, field);
  drawWalls(ctx, viewport, camera, field);
}
