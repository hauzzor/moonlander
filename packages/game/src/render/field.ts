import {
  GATE_FRAME_RADIUS,
  WALL_RADIUS,
  type CurvedWall,
  type Field,
  type Gate,
  type SimState,
  type Vec2,
} from "@moonlander/sim";
import {
  worldToScreen,
  type Camera,
  type Viewport,
} from "../camera";

function traceSmoothPath(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  points: readonly Vec2[],
): void {
  if (points.length === 0) {
    return;
  }

  const screenPoints = points.map((point) =>
    worldToScreen(viewport, camera, point.x, point.y),
  );
  const first = screenPoints[0]!;
  ctx.moveTo(first.x, first.y);

  if (screenPoints.length === 2) {
    const last = screenPoints[1]!;
    ctx.lineTo(last.x, last.y);
    return;
  }

  for (let index = 1; index < screenPoints.length - 1; index += 1) {
    const point = screenPoints[index]!;
    const next = screenPoints[index + 1]!;
    ctx.quadraticCurveTo(
      point.x,
      point.y,
      (point.x + next.x) / 2,
      (point.y + next.y) / 2,
    );
  }

  const last = screenPoints[screenPoints.length - 1]!;
  ctx.lineTo(last.x, last.y);
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
  traceSmoothPath(ctx, viewport, camera, wall.points);
  ctx.lineWidth = thickness * 2.8;
  ctx.strokeStyle = "rgba(65, 119, 224, 0.14)";
  ctx.stroke();

  ctx.beginPath();
  traceExactPath(ctx, viewport, camera, wall.points);
  ctx.lineWidth = thickness;
  ctx.strokeStyle = "#7e93b8";
  ctx.stroke();

  ctx.beginPath();
  traceExactPath(ctx, viewport, camera, wall.points);
  ctx.lineWidth = Math.max(1, thickness * 0.22);
  ctx.strokeStyle = "#d8e8ff";
  ctx.stroke();

  ctx.restore();
}

function drawGate(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  gate: Gate,
  state: SimState,
): void {
  const center = worldToScreen(viewport, camera, gate.center.x, gate.center.y);
  const openingRadius = gate.radius * viewport.scale;
  const pulse = 0.5 + 0.5 * Math.sin(state.time * 2.4 + gate.center.y * 0.03);
  const glowRadius = openingRadius + 34 + pulse * 8;

  if (
    center.x + glowRadius < 0 ||
    center.x - glowRadius > viewport.width ||
    center.y + glowRadius < 0 ||
    center.y - glowRadius > viewport.height
  ) {
    return;
  }

  ctx.save();
  const glow = ctx.createRadialGradient(
    center.x,
    center.y,
    Math.max(1, openingRadius * 0.45),
    center.x,
    center.y,
    glowRadius,
  );
  glow.addColorStop(0, "rgba(70, 232, 255, 0)");
  glow.addColorStop(0.7, `rgba(70, 232, 255, ${0.05 + pulse * 0.08})`);
  glow.addColorStop(0.9, "rgba(70, 232, 255, 0.12)");
  glow.addColorStop(1, "rgba(70, 232, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(center.x, center.y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(4, 10, 22, ${0.28 + pulse * 0.12})`;
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(1, openingRadius - 2), 0, Math.PI * 2);
  ctx.fill();

  const ringRadius = openingRadius + GATE_FRAME_RADIUS * viewport.scale;
  const ringWidth = Math.max(2.8, GATE_FRAME_RADIUS * 2 * viewport.scale);
  ctx.shadowColor = "rgba(81, 232, 255, 0.9)";
  ctx.shadowBlur = 14 + pulse * 12;
  ctx.strokeStyle = `rgba(98, 239, 255, ${0.78 + pulse * 0.22})`;
  ctx.lineWidth = ringWidth;
  ctx.beginPath();
  ctx.arc(center.x, center.y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(200, 252, 255, 0.9)";
  ctx.lineWidth = Math.max(1, ringWidth * 0.2);
  ctx.beginPath();
  ctx.arc(center.x, center.y, ringRadius + ringWidth * 0.22, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(91, 219, 255, ${0.28 + pulse * 0.18})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 9]);
  ctx.lineDashOffset = -state.time * 12;
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(1, openingRadius - 5), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const planeDirection = { x: -gate.normal.y, y: gate.normal.x };
  const planeStart = worldToScreen(
    viewport,
    camera,
    gate.center.x - planeDirection.x * gate.radius,
    gate.center.y - planeDirection.y * gate.radius,
  );
  const planeEnd = worldToScreen(
    viewport,
    camera,
    gate.center.x + planeDirection.x * gate.radius,
    gate.center.y + planeDirection.y * gate.radius,
  );
  const planeAngle = Math.atan2(
    planeEnd.y - center.y,
    planeEnd.x - center.x,
  );

  ctx.strokeStyle = `rgba(198, 252, 255, ${0.3 + pulse * 0.2})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 7]);
  ctx.lineDashOffset = state.time * 10;
  ctx.beginPath();
  ctx.moveTo(planeStart.x, planeStart.y);
  ctx.lineTo(planeEnd.x, planeEnd.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const markerRadius = Math.max(1.4, 1.8 * viewport.scale * 0.45);
  for (let index = 0; index < 4; index += 1) {
    const alignedWithPlane = index % 2 === 0;
    const angle = planeAngle + (index * Math.PI) / 2;
    const markerX = center.x + Math.cos(angle) * ringRadius;
    const markerY = center.y + Math.sin(angle) * ringRadius;
    ctx.fillStyle = alignedWithPlane
      ? `rgba(220, 254, 255, ${0.86 + pulse * 0.14})`
      : `rgba(121, 232, 255, ${0.34 + pulse * 0.2})`;
    ctx.beginPath();
    ctx.arc(
      markerX,
      markerY,
      alignedWithPlane ? markerRadius * 1.15 : markerRadius * 0.8,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.restore();
}

export function drawField(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  camera: Camera,
  field: Field,
  state: SimState,
): void {
  const viewRadius =
    Math.hypot(viewport.width, viewport.height) / (2 * viewport.scale) +
    field.chunkSize;
  const chunks = field.chunksInView({ x: camera.x, y: camera.y }, viewRadius);

  for (const chunk of chunks) {
    for (const wall of chunk.walls) {
      drawWall(ctx, viewport, camera, wall);
    }
  }

  for (const chunk of chunks) {
    for (const gate of chunk.gates) {
      drawGate(ctx, viewport, camera, gate, state);
    }
  }
}
