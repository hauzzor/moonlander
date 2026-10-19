import type { Field, SimState } from "@moonlander/sim";
import {
  worldToScreen,
  type Camera,
  type Viewport,
} from "../camera";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
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

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  state: SimState,
): void {
  const { width, height } = viewport;
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#05060d");
  background.addColorStop(0.55, "#080b17");
  background.addColorStop(1, "#0d1322");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const nebula = ctx.createRadialGradient(
    width * 0.76,
    height * 0.2,
    0,
    width * 0.76,
    height * 0.2,
    Math.max(width, height) * 0.62,
  );
  nebula.addColorStop(0, "rgba(47, 93, 171, 0.18)");
  nebula.addColorStop(0.5, "rgba(33, 49, 103, 0.08)");
  nebula.addColorStop(1, "rgba(5, 6, 13, 0)");
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, width, height);

  const starCount = clamp(
    Math.floor((width * height) / 5200),
    110,
    360,
  );
  const seed = state.seed >>> 0;

  for (let index = 0; index < starCount; index += 1) {
    const hash = hash32((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
    const depth = 0.06 + (((hash >>> 8) & 0xff) / 255) * 0.42;
    const baseX = (hash & 0xffff) / 0xffff;
    const baseY = ((hash >>> 16) & 0xffff) / 0xffff;
    const x = wrap(baseX * width - camera.x * viewport.scale * depth, width);
    const y = wrap(baseY * height + camera.y * viewport.scale * depth, height);
    const radius = 0.35 + (((hash >>> 12) & 0xff) / 255) * 1.25;
    const twinkle =
      0.55 + 0.45 * Math.sin(state.time * (0.45 + (index % 7) * 0.09) + index);
    const alpha = 0.18 + (((hash >>> 20) & 0xff) / 255) * 0.6 * twinkle;

    ctx.globalAlpha = clamp(alpha, 0.08, 0.9);
    ctx.fillStyle =
      index % 13 === 0
        ? "#9edbff"
        : index % 7 === 0
          ? "#ffd9a8"
          : "#eef4ff";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

export function drawGround(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  field: Field,
): void {
  const { width, height } = viewport;
  const surface = worldToScreen(viewport, camera, 0, field.groundY);
  if (surface.y >= height) {
    return;
  }

  const top = Math.max(0, surface.y);
  const ground = ctx.createLinearGradient(0, top, 0, height);
  ground.addColorStop(0, "#11182a");
  ground.addColorStop(0.16, "#0b0f1c");
  ground.addColorStop(1, "#05060b");
  ctx.fillStyle = ground;
  ctx.fillRect(0, top, width, height - top);

  ctx.save();
  ctx.strokeStyle = "rgba(91, 132, 200, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, surface.y);
  ctx.lineTo(width, surface.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(126, 176, 255, 0.16)";
  ctx.lineWidth = 1;
  for (let depth = 1; depth <= 4; depth += 1) {
    const lineY = surface.y + depth * 22;
    if (lineY > height) {
      break;
    }
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(width, lineY);
    ctx.stroke();
  }

  const gridSpacing = 32;
  const worldLeft = camera.x - viewport.width / (2 * viewport.scale);
  const firstGridX = Math.floor(worldLeft / gridSpacing) * gridSpacing;
  ctx.strokeStyle = "rgba(79, 195, 247, 0.12)";
  for (
    let x = firstGridX;
    x <= worldLeft + viewport.width / viewport.scale + gridSpacing;
    x += gridSpacing
  ) {
    const screenX = worldToScreen(viewport, camera, x, 0).x;
    ctx.beginPath();
    ctx.moveTo(screenX, surface.y);
    ctx.lineTo(screenX, surface.y + Math.min(14, height - surface.y));
    ctx.stroke();
  }
  ctx.restore();
}
