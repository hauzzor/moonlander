import type { Viewport } from "../camera";

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
): void {
  const { width, height } = viewport;
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#02030a");
  background.addColorStop(0.5, "#050815");
  background.addColorStop(1, "#02040b");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const ambient = ctx.createRadialGradient(
    width * 0.58,
    height * 0.48,
    0,
    width * 0.58,
    height * 0.48,
    Math.max(width, height) * 0.62,
  );
  ambient.addColorStop(0, "rgba(23, 46, 70, 0.18)");
  ambient.addColorStop(0.55, "rgba(12, 25, 45, 0.08)");
  ambient.addColorStop(1, "rgba(2, 3, 10, 0)");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    Math.min(width, height) * 0.2,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(2, 4, 10, 0)");
  vignette.addColorStop(1, "rgba(1, 2, 6, 0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
