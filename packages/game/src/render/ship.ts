import {
  LEFT_MOUNT,
  REAR_MOUNT,
  RIGHT_MOUNT,
  SHIP_HEIGHT,
  SHIP_LENGTH,
  THRUSTER_CANT,
  type SimState,
  type Vec2,
} from "@moonlander/sim";
import {
  worldToScreen,
  type Camera,
  type Viewport,
} from "../camera";

const HALF_LENGTH = SHIP_LENGTH / 2;
const HALF_HEIGHT = SHIP_HEIGHT / 2;
const NOSE_X = HALF_LENGTH;
const TAIL_X = -HALF_LENGTH;
const HULL_TOP = -HALF_HEIGHT;
const HULL_BOTTOM = HALF_HEIGHT;

function flameFlicker(time: number, phase: number): number {
  return (
    0.84 +
    0.11 * Math.sin(time * 55 + phase) +
    0.05 * Math.sin(time * 97 + phase * 2.7)
  );
}

function drawBottomFlame(
  ctx: CanvasRenderingContext2D,
  side: -1 | 1,
  state: SimState,
): void {
  const mount = side < 0 ? LEFT_MOUNT : RIGHT_MOUNT;
  const baseX = mount.x;
  const baseY = -mount.y + 0.4;
  const flicker = flameFlicker(state.time, side < 0 ? 0.2 : 1.7);
  const length = 12 + flicker * 6;
  const halfWidth = 3.5;
  const directionX = side * Math.sin(THRUSTER_CANT);
  const directionY = Math.cos(THRUSTER_CANT);
  const tipX = baseX + directionX * length;
  const tipY = baseY + directionY * length;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;

  ctx.save();

  const glow = ctx.createRadialGradient(
    baseX,
    baseY,
    0,
    baseX,
    baseY,
    8,
  );
  glow.addColorStop(0, "rgba(255, 230, 150, 0.6)");
  glow.addColorStop(0.45, "rgba(255, 145, 42, 0.22)");
  glow.addColorStop(1, "rgba(255, 100, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(baseX, baseY, 8, 0, Math.PI * 2);
  ctx.fill();

  const outer = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
  outer.addColorStop(0, "rgba(255, 247, 197, 0.96)");
  outer.addColorStop(0.35, "rgba(255, 178, 62, 0.9)");
  outer.addColorStop(1, "rgba(255, 79, 16, 0)");
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.moveTo(
    baseX + perpendicularX * halfWidth,
    baseY + perpendicularY * halfWidth,
  );
  ctx.quadraticCurveTo(
    tipX - perpendicularX * halfWidth * 0.2,
    tipY - perpendicularY * halfWidth * 0.2,
    tipX,
    tipY,
  );
  ctx.quadraticCurveTo(
    tipX + perpendicularX * halfWidth * 0.2,
    tipY + perpendicularY * halfWidth * 0.2,
    baseX - perpendicularX * halfWidth,
    baseY - perpendicularY * halfWidth,
  );
  ctx.closePath();
  ctx.fill();

  const innerLength = length * 0.5;
  ctx.fillStyle = "rgba(236, 253, 255, 0.94)";
  ctx.beginPath();
  ctx.moveTo(
    baseX + perpendicularX * halfWidth * 0.34,
    baseY + perpendicularY * halfWidth * 0.34,
  );
  ctx.lineTo(
    baseX + directionX * innerLength,
    baseY + directionY * innerLength,
  );
  ctx.lineTo(
    baseX - perpendicularX * halfWidth * 0.34,
    baseY - perpendicularY * halfWidth * 0.34,
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRearFlame(
  ctx: CanvasRenderingContext2D,
  state: SimState,
): void {
  const flicker = flameFlicker(state.time, 1.3);
  const length = 10 + flicker * 6;
  const halfWidth = 2.6;
  const baseX = REAR_MOUNT.x - 2.4;
  const baseY = REAR_MOUNT.y;
  const tipX = baseX - length;

  ctx.save();

  const glow = ctx.createRadialGradient(
    baseX,
    baseY,
    0,
    baseX,
    baseY,
    6,
  );
  glow.addColorStop(0, "rgba(255, 230, 150, 0.58)");
  glow.addColorStop(0.45, "rgba(255, 145, 42, 0.2)");
  glow.addColorStop(1, "rgba(255, 100, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(baseX, baseY, 6, 0, Math.PI * 2);
  ctx.fill();

  const outer = ctx.createLinearGradient(baseX, baseY, tipX, baseY);
  outer.addColorStop(0, "rgba(255, 247, 197, 0.96)");
  outer.addColorStop(0.4, "rgba(255, 171, 54, 0.86)");
  outer.addColorStop(1, "rgba(255, 67, 12, 0)");
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY - halfWidth);
  ctx.quadraticCurveTo(
    baseX - length * 0.55,
    baseY - halfWidth * 0.45,
    tipX,
    baseY,
  );
  ctx.quadraticCurveTo(
    baseX - length * 0.55,
    baseY + halfWidth * 0.45,
    baseX,
    baseY + halfWidth,
  );
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(236, 253, 255, 0.94)";
  ctx.beginPath();
  ctx.moveTo(baseX, baseY - halfWidth * 0.38);
  ctx.lineTo(baseX - length * 0.52, baseY);
  ctx.lineTo(baseX, baseY + halfWidth * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHull(
  ctx: CanvasRenderingContext2D,
  destroyed: boolean,
): void {
  const hullGradient = ctx.createLinearGradient(0, HULL_TOP, 0, HULL_BOTTOM);
  hullGradient.addColorStop(0, destroyed ? "#9aa4b4" : "#eef4ff");
  hullGradient.addColorStop(0.42, destroyed ? "#606b7c" : "#b7c7e4");
  hullGradient.addColorStop(1, destroyed ? "#303746" : "#687b9e");

  ctx.fillStyle = hullGradient;
  ctx.strokeStyle = destroyed ? "#6d7687" : "#dbe9ff";
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(NOSE_X, 0);
  ctx.lineTo(NOSE_X - 13, -6.8);
  ctx.lineTo(NOSE_X - 31, HULL_TOP);
  ctx.lineTo(NOSE_X - 44, -7.3);
  ctx.lineTo(TAIL_X, -3.2);
  ctx.lineTo(TAIL_X, 2.6);
  ctx.lineTo(TAIL_X + 6, 6.6);
  ctx.lineTo(TAIL_X + 18, 8.4);
  ctx.lineTo(NOSE_X - 16, 6.6);
  ctx.lineTo(NOSE_X - 6, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = destroyed ? "#343944" : "#303b50";
  ctx.strokeStyle = destroyed ? "#596170" : "#9bb3d1";
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(REAR_MOUNT.x + 1.4, -2.6);
  ctx.lineTo(REAR_MOUNT.x - 2.5, -3.1);
  ctx.lineTo(REAR_MOUNT.x - 2.5, 3.1);
  ctx.lineTo(REAR_MOUNT.x + 1.4, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = destroyed ? "#242830" : "#121926";
  ctx.beginPath();
  ctx.ellipse(
    REAR_MOUNT.x - 2.4,
    REAR_MOUNT.y,
    1.1,
    2.2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.strokeStyle = destroyed
    ? "#4c515c"
    : "rgba(255, 188, 92, 0.75)";
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

function drawCockpit(
  ctx: CanvasRenderingContext2D,
  destroyed: boolean,
): void {
  ctx.fillStyle = destroyed
    ? "rgba(67, 45, 45, 0.4)"
    : "rgba(33, 61, 87, 0.58)";
  ctx.strokeStyle = destroyed ? "#7e5a5a" : "#6fd7ff";
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(15, -1.4);
  ctx.quadraticCurveTo(12.5, -5.1, 6.2, -5.4);
  ctx.lineTo(3.2, -3.6);
  ctx.quadraticCurveTo(7.5, -0.2, 15, -1.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawHullAccents(
  ctx: CanvasRenderingContext2D,
  destroyed: boolean,
): void {
  const accent = ctx.createLinearGradient(-20, 0, 22, 0);
  accent.addColorStop(0, "rgba(91, 205, 255, 0.2)");
  accent.addColorStop(0.5, "rgba(115, 226, 255, 0.95)");
  accent.addColorStop(1, "rgba(79, 195, 247, 0.35)");
  ctx.strokeStyle = destroyed ? "rgba(115, 128, 148, 0.35)" : accent;
  ctx.lineWidth = 0.38;
  ctx.beginPath();
  ctx.moveTo(21.5, 0.8);
  ctx.lineTo(9, 5.9);
  ctx.lineTo(-5, 7.6);
  ctx.lineTo(-19, 6);
  ctx.stroke();

  ctx.strokeStyle = "rgba(225, 239, 255, 0.28)";
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  ctx.moveTo(-12, -8.2);
  ctx.lineTo(-12, 7.1);
  ctx.moveTo(-2, -8.85);
  ctx.lineTo(-2, 8);
  ctx.moveTo(8, -7.2);
  ctx.lineTo(8, 6.4);
  ctx.stroke();
}

function drawNozzles(
  ctx: CanvasRenderingContext2D,
  destroyed: boolean,
): void {
  for (const mount of [LEFT_MOUNT, RIGHT_MOUNT]) {
    const mountX = mount.x;

    ctx.fillStyle = destroyed ? "#343944" : "#303b50";
    ctx.strokeStyle = destroyed ? "#596170" : "#9bb3d1";
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(mountX - 3.5, 3.4);
    ctx.lineTo(mountX + 3.5, 3.4);
    ctx.lineTo(mountX + 2.7, 9);
    ctx.lineTo(mountX - 2.7, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = destroyed ? "#242830" : "#121926";
    ctx.beginPath();
    ctx.ellipse(mountX, 9.1, 2.5, 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = destroyed
      ? "#4c515c"
      : "rgba(255, 188, 92, 0.75)";
    ctx.lineWidth = 0.35;
    ctx.stroke();
  }
}

function drawInvulnerabilityRing(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  scale: number,
  time: number,
): void {
  const pulse = 0.35 + 0.22 * Math.sin(time * 28);
  const alpha = Math.min(0.8, Math.max(0, pulse));

  ctx.save();
  ctx.strokeStyle = `rgba(104, 223, 255, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 27 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawStarship(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  state: SimState,
): void {
  const center = worldToScreen(
    viewport,
    camera,
    state.ship.position.x,
    state.ship.position.y,
  );
  const destroyed = state.outcome === "destroyed";

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(-state.ship.angle);
  ctx.scale(viewport.scale, viewport.scale);

  if (!destroyed && state.thrusters.left) {
    drawBottomFlame(ctx, -1, state);
  }

  if (!destroyed && state.thrusters.right) {
    drawBottomFlame(ctx, 1, state);
  }

  if (!destroyed && state.thrusters.rear) {
    drawRearFlame(ctx, state);
  }

  ctx.fillStyle = "#39445c";
  ctx.strokeStyle = "rgba(168, 190, 224, 0.45)";
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(-17, -7);
  ctx.lineTo(TAIL_X, -13);
  ctx.lineTo(-22, -5.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  drawHull(ctx, destroyed);
  drawCockpit(ctx, destroyed);
  drawHullAccents(ctx, destroyed);
  drawNozzles(ctx, destroyed);

  ctx.restore();

  if (state.invulnerable && !destroyed) {
    drawInvulnerabilityRing(
      ctx,
      center,
      viewport.scale,
      state.time,
    );
  }
}
