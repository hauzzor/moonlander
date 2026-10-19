import "./style.css";
import {
  createSimulation,
  FIXED_DT,
  GATE_FRAME_RADIUS,
  THRUSTER_CANT,
  WALL_RADIUS,
  type CurvedWall,
  type Field,
  type Gate,
  type SimState,
  type Vec2,
} from "@moonlander/sim";

const DEFAULT_SEED = 1;
const MAX_SEED = 0xffffffff;
const SEED_MULTIPLIER = 1664525;
const SEED_INCREMENT = 1013904223;
const MAX_FRAME_SECONDS = 0.25;
const CAMERA_LOOK_AHEAD_X = 0.35;
const CAMERA_LOOK_AHEAD_Y = 0.16;
const CAMERA_MAX_LOOK_AHEAD_X = 55;
const CAMERA_MAX_LOOK_AHEAD_Y = 26;
const CAMERA_RESPONSE = 6.5;
const VIEW_TARGET_WIDTH = 300;
const VIEW_TARGET_HEIGHT = 170;
const MIN_VIEW_SCALE = 1.35;
const MAX_VIEW_SCALE = 7;

interface Camera {
  x: number;
  y: number;
}

interface Viewport {
  width: number;
  height: number;
  scale: number;
  dpr: number;
}

interface Keys {
  left: boolean;
  right: boolean;
}

function getHudElement(testId: string): HTMLElement {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing HUD element with data-testid="${testId}"`);
  }
  return element;
}

function getElement<T extends Element>(
  selector: string,
  constructor: { new (): T },
): T {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing or invalid element: ${selector}`);
  }
  return element;
}

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = getElement('[data-testid="game-canvas"]', HTMLCanvasElement);
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Could not acquire 2D canvas context");
  }
  return { canvas, ctx: context };
}

function parseSeed(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SEED) {
    return null;
  }

  return value >>> 0;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, SEED_MULTIPLIER) + SEED_INCREMENT) >>> 0;
}

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

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

const { canvas, ctx } = getCanvas();
const hudHull = getHudElement("hud-hull");
const hudSpeed = getHudElement("hud-speed");
const hudProgress = getHudElement("hud-progress");
const hudScore = getHudElement("hud-score");
const thrusterLeft = getHudElement("thruster-left");
const thrusterRight = getHudElement("thruster-right");
const seedDisplay = getHudElement("seed-display");
const outcome = getHudElement("outcome");
const seedInput = getElement('[data-testid="seed-input"]', HTMLInputElement);
const seedLoad = getElement('[data-testid="seed-load"]', HTMLButtonElement);
const seedCopy = getElement("#seed-copy", HTMLButtonElement);
const outcomeText = outcome.querySelector(".outcome-text");
const outcomeScore = outcome.querySelector(".outcome-score-value");

const urlSeed = parseSeed(new URLSearchParams(window.location.search).get("seed"));
let currentSeed = urlSeed ?? DEFAULT_SEED;
const sim = createSimulation({ seed: currentSeed });
const keys: Keys = { left: false, right: false };
const camera: Camera = { x: 0, y: 0 };
const viewport: Viewport = { width: 1, height: 1, scale: 1, dpr: 1 };
let cameraReady = false;
let accumulator = 0;
let lastTime = performance.now();
let animationId: number | null = null;

function resize(): void {
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
}

function worldToScreen(x: number, y: number): Vec2 {
  return {
    x: viewport.width / 2 + (x - camera.x) * viewport.scale,
    y: viewport.height / 2 - (y - camera.y) * viewport.scale,
  };
}

function cameraTarget(state: SimState): Camera {
  return {
    x:
      state.ship.position.x +
      clamp(
        state.ship.velocity.x * CAMERA_LOOK_AHEAD_X,
        -CAMERA_MAX_LOOK_AHEAD_X,
        CAMERA_MAX_LOOK_AHEAD_X,
      ),
    y:
      state.ship.position.y +
      clamp(
        state.ship.velocity.y * CAMERA_LOOK_AHEAD_Y,
        -CAMERA_MAX_LOOK_AHEAD_Y,
        CAMERA_MAX_LOOK_AHEAD_Y,
      ) +
      8,
  };
}

function snapCamera(state: SimState): void {
  const target = cameraTarget(state);
  camera.x = target.x;
  camera.y = target.y;
  cameraReady = true;
}

function updateCamera(state: SimState, deltaSeconds: number): void {
  if (!cameraReady) {
    snapCamera(state);
    return;
  }

  const target = cameraTarget(state);
  const blend = 1 - Math.exp(-CAMERA_RESPONSE * Math.min(deltaSeconds, 0.1));
  camera.x += (target.x - camera.x) * blend;
  camera.y += (target.y - camera.y) * blend;
}

function drawBackdrop(state: SimState): void {
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

function drawGround(field: Field): void {
  const { width, height } = viewport;
  const surface = worldToScreen(0, field.groundY);
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
  const firstGridX =
    Math.floor(worldLeft / gridSpacing) * gridSpacing;
  ctx.strokeStyle = "rgba(79, 195, 247, 0.12)";
  for (let x = firstGridX; x <= worldLeft + viewport.width / viewport.scale + gridSpacing; x += gridSpacing) {
    const screenX = worldToScreen(x, 0).x;
    ctx.beginPath();
    ctx.moveTo(screenX, surface.y);
    ctx.lineTo(screenX, surface.y + Math.min(14, height - surface.y));
    ctx.stroke();
  }
  ctx.restore();
}

function traceSmoothPath(points: readonly Vec2[]): void {
  if (points.length === 0) {
    return;
  }

  const screenPoints = points.map((point) => worldToScreen(point.x, point.y));
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

function traceExactPath(points: readonly Vec2[]): void {
  if (points.length === 0) {
    return;
  }

  const first = worldToScreen(points[0]!.x, points[0]!.y);
  ctx.moveTo(first.x, first.y);

  for (let index = 1; index < points.length; index += 1) {
    const point = worldToScreen(points[index]!.x, points[index]!.y);
    ctx.lineTo(point.x, point.y);
  }
}

function drawWall(wall: CurvedWall): void {
  if (wall.points.length < 2) {
    return;
  }

  const thickness = Math.max(2.4, WALL_RADIUS * 2 * viewport.scale);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  traceSmoothPath(wall.points);
  ctx.lineWidth = thickness * 2.8;
  ctx.strokeStyle = "rgba(65, 119, 224, 0.14)";
  ctx.stroke();

  ctx.beginPath();
  traceExactPath(wall.points);
  ctx.lineWidth = thickness;
  ctx.strokeStyle = "#7e93b8";
  ctx.stroke();

  ctx.beginPath();
  traceExactPath(wall.points);
  ctx.lineWidth = Math.max(1, thickness * 0.22);
  ctx.strokeStyle = "#d8e8ff";
  ctx.stroke();

  ctx.restore();
}

function drawGate(gate: Gate, state: SimState): void {
  const center = worldToScreen(gate.center.x, gate.center.y);
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
    gate.center.x - planeDirection.x * gate.radius,
    gate.center.y - planeDirection.y * gate.radius,
  );
  const planeEnd = worldToScreen(
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

function drawChunks(field: Field, state: SimState): void {
  const viewRadius =
    Math.hypot(viewport.width, viewport.height) / (2 * viewport.scale) +
    field.chunkSize;
  const chunks = field.chunksInView({ x: camera.x, y: camera.y }, viewRadius);

  for (const chunk of chunks) {
    for (const wall of chunk.walls) {
      drawWall(wall);
    }
  }

  for (const chunk of chunks) {
    for (const gate of chunk.gates) {
      drawGate(gate, state);
    }
  }
}

function drawFlame(
  mountX: number,
  side: number,
  state: SimState,
): void {
  const flicker =
    0.86 +
    0.1 * Math.sin(state.time * 53 + (side > 0 ? 1.7 : 0.2)) +
    0.04 * Math.sin(state.time * 91 + side);
  const length = 12 + flicker * 6;
  const halfWidth = 3.5;
  const baseY = 9.4;
  const directionX = side * Math.sin(THRUSTER_CANT);
  const directionY = Math.cos(THRUSTER_CANT);
  const tipX = mountX + directionX * length;
  const tipY = baseY + directionY * length;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;

  ctx.save();
  const glow = ctx.createRadialGradient(mountX, baseY, 0, mountX, baseY, 8);
  glow.addColorStop(0, "rgba(255, 230, 150, 0.6)");
  glow.addColorStop(0.45, "rgba(255, 145, 42, 0.22)");
  glow.addColorStop(1, "rgba(255, 100, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(mountX, baseY, 8, 0, Math.PI * 2);
  ctx.fill();

  const outer = ctx.createLinearGradient(mountX, baseY, tipX, tipY);
  outer.addColorStop(0, "rgba(255, 247, 197, 0.96)");
  outer.addColorStop(0.35, "rgba(255, 178, 62, 0.9)");
  outer.addColorStop(1, "rgba(255, 79, 16, 0)");
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.moveTo(
    mountX + perpendicularX * halfWidth,
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
    mountX - perpendicularX * halfWidth,
    baseY - perpendicularY * halfWidth,
  );
  ctx.closePath();
  ctx.fill();

  const innerLength = length * 0.5;
  const innerTipX = mountX + directionX * innerLength;
  const innerTipY = baseY + directionY * innerLength;
  ctx.fillStyle = "rgba(236, 253, 255, 0.94)";
  ctx.beginPath();
  ctx.moveTo(
    mountX + perpendicularX * halfWidth * 0.34,
    baseY + perpendicularY * halfWidth * 0.34,
  );
  ctx.lineTo(innerTipX, innerTipY);
  ctx.lineTo(
    mountX - perpendicularX * halfWidth * 0.34,
    baseY - perpendicularY * halfWidth * 0.34,
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStarship(state: SimState): void {
  const center = worldToScreen(state.ship.position.x, state.ship.position.y);
  const destroyed = state.outcome === "destroyed";

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(-state.ship.angle);
  ctx.scale(viewport.scale, viewport.scale);

  if (!destroyed && state.thrusters.left) {
    drawFlame(-16, -1, state);
  }
  if (!destroyed && state.thrusters.right) {
    drawFlame(16, 1, state);
  }

  ctx.fillStyle = "#39445c";
  ctx.strokeStyle = "rgba(168, 190, 224, 0.45)";
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(-17, -7);
  ctx.lineTo(-24, -13);
  ctx.lineTo(-22, -5.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const hullGradient = ctx.createLinearGradient(0, -9.5, 0, 8.5);
  hullGradient.addColorStop(0, destroyed ? "#9aa4b4" : "#eef4ff");
  hullGradient.addColorStop(0.42, destroyed ? "#606b7c" : "#b7c7e4");
  hullGradient.addColorStop(1, destroyed ? "#303746" : "#687b9e");
  ctx.fillStyle = hullGradient;
  ctx.strokeStyle = destroyed ? "#6d7687" : "#dbe9ff";
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(11, -6.8);
  ctx.lineTo(-7, -9);
  ctx.lineTo(-20, -7.3);
  ctx.lineTo(-24, -3.2);
  ctx.lineTo(-24, 2.6);
  ctx.lineTo(-18, 6.6);
  ctx.lineTo(-6, 8.4);
  ctx.lineTo(8, 6.6);
  ctx.lineTo(18, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = destroyed ? "rgba(67, 45, 45, 0.4)" : "rgba(33, 61, 87, 0.58)";
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

  const accent = ctx.createLinearGradient(-20, 0, 22, 0);
  accent.addColorStop(0, "rgba(91, 205, 255, 0.2)");
  accent.addColorStop(0.5, "rgba(115, 226, 255, 0.95)");
  accent.addColorStop(1, "rgba(79, 195, 247, 0.35)");
  ctx.strokeStyle = accent;
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

  for (const side of [-1, 1]) {
    const mountX = side * 16;
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
    ctx.strokeStyle = destroyed ? "#4c515c" : "rgba(255, 188, 92, 0.75)";
    ctx.lineWidth = 0.35;
    ctx.stroke();
  }

  ctx.restore();

  if (state.invulnerable && !destroyed) {
    const pulse = 0.35 + 0.22 * Math.sin(state.time * 28);
    ctx.save();
    ctx.strokeStyle = `rgba(104, 223, 255, ${clamp(pulse, 0, 0.8)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 27 * viewport.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function render(state: SimState): void {
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  if (!cameraReady) {
    snapCamera(state);
  }

  drawBackdrop(state);
  drawGround(sim.field);
  drawChunks(sim.field, state);
  drawStarship(state);
}

function setHudValue(
  element: HTMLElement,
  dataValue: string,
  displayValue: string,
): void {
  element.setAttribute("data-value", dataValue);
  const value = element.querySelector(".hud-value");
  if (value instanceof HTMLElement) {
    value.textContent = displayValue;
  }
}

function updateOutcome(state: SimState): void {
  const destroyed = state.outcome === "destroyed";
  outcome.classList.toggle("hidden", !destroyed);
  outcome.setAttribute("aria-hidden", String(!destroyed));

  if (!destroyed) {
    return;
  }

  if (outcomeText instanceof HTMLElement) {
    outcomeText.textContent = "Starship Destroyed";
  }
  if (outcomeScore instanceof HTMLElement) {
    outcomeScore.textContent = String(state.score);
  }
}

function updateHud(state: SimState): void {
  const speed = Math.hypot(state.ship.velocity.x, state.ship.velocity.y);
  const progress = Math.max(0, Math.floor(state.progress));
  const leftActive = state.outcome === "flying" && state.thrusters.left;
  const rightActive = state.outcome === "flying" && state.thrusters.right;

  setHudValue(hudHull, String(state.hull), String(Math.round(state.hull)));
  setHudValue(hudSpeed, String(speed), speed.toFixed(1));
  setHudValue(hudProgress, String(progress), String(progress));
  setHudValue(hudScore, String(state.score), String(state.score));

  thrusterLeft.setAttribute("data-active", String(leftActive));
  thrusterRight.setAttribute("data-active", String(rightActive));
  hudHull.classList.toggle("hud-critical", state.hull <= 30);

  seedDisplay.textContent = String(state.seed);
  updateOutcome(state);
}

function releaseKeys(): void {
  keys.left = false;
  keys.right = false;
}

function resetRun(seed: number): void {
  releaseKeys();
  accumulator = 0;
  currentSeed = seed >>> 0;

  const state = sim.reset(currentSeed);
  currentSeed = state.seed >>> 0;
  seedInput.value = String(currentSeed);
  seedInput.removeAttribute("aria-invalid");
  seedInput.classList.remove("invalid");

  cameraReady = false;
  snapCamera(state);
  updateHud(state);
  render(state);
  lastTime = performance.now();
}

function restart(): void {
  resetRun(nextSeed(currentSeed));
}

function loadSeedFromInput(): void {
  const parsed = parseSeed(seedInput.value);
  if (parsed === null) {
    seedInput.setAttribute("aria-invalid", "true");
    seedInput.classList.add("invalid");
    return;
  }

  resetRun(parsed);
}

async function copySeed(): Promise<void> {
  const seed = String(currentSeed);
  try {
    await navigator.clipboard.writeText(seed);
    seedCopy.textContent = "COPIED";
  } catch {
    seedCopy.textContent = "COPY";
    return;
  }

  window.setTimeout(() => {
    seedCopy.textContent = "COPY";
  }, 1200);
}

function stepSimulation(): void {
  sim.step({ left: keys.left, right: keys.right });
}

function frame(now: number): void {
  const elapsed = Math.max(0, (now - lastTime) / 1000);
  lastTime = now;
  const frameTime = Math.min(elapsed, MAX_FRAME_SECONDS);
  accumulator += frameTime;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 120) {
    stepSimulation();
    accumulator -= FIXED_DT;
    steps += 1;
  }

  if (steps === 120) {
    accumulator = 0;
  }

  const state = sim.getState();
  updateCamera(state, frameTime);
  updateHud(state);
  render(state);

  animationId = requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "q") {
    keys.left = true;
    event.preventDefault();
  } else if (key === "w") {
    keys.right = true;
    event.preventDefault();
  } else if (key === "r") {
    if (!event.repeat) {
      restart();
    }
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();

  if (key === "q") {
    keys.left = false;
    if (!isEditableTarget(event.target)) {
      event.preventDefault();
    }
  } else if (key === "w") {
    keys.right = false;
    if (!isEditableTarget(event.target)) {
      event.preventDefault();
    }
  }
});

window.addEventListener("blur", releaseKeys);
window.addEventListener("pagehide", releaseKeys);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseKeys();
  }
});
window.addEventListener("resize", () => {
  resize();
  render(sim.getState());
});

seedLoad.addEventListener("click", loadSeedFromInput);
seedCopy.addEventListener("click", () => {
  void copySeed();
});
seedInput.addEventListener("input", () => {
  seedInput.removeAttribute("aria-invalid");
  seedInput.classList.remove("invalid");
});
seedInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loadSeedFromInput();
  }
});

resize();
const initialState = sim.getState();
currentSeed = initialState.seed >>> 0;
seedInput.value = String(currentSeed);
snapCamera(initialState);
updateHud(initialState);
render(initialState);
lastTime = performance.now();
animationId = requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }
});
