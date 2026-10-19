import "./style.css";
import {
  createSimulation,
  FIXED_DT,
  WORLD_WIDTH,
  type SimState,
  type Terrain,
} from "@moonlander/sim";

// World view bounds in simulation meters. The visible area is padded around the
// 0..600 m world so the terrain edges and the lander remain in view.
const WORLD_MIN_X = -20;
const WORLD_MAX_X = WORLD_WIDTH + 20;
const WORLD_MIN_Y = -10;
const WORLD_MAX_Y = 140;
const WORLD_WIDTH_VIEW = WORLD_MAX_X - WORLD_MIN_X;
const WORLD_HEIGHT_VIEW = WORLD_MAX_Y - WORLD_MIN_Y;

interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
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

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const element = document.getElementById("game-canvas");
  if (!(element instanceof HTMLCanvasElement)) {
    throw new Error("game-canvas element is missing or not a canvas");
  }
  const context = element.getContext("2d");
  if (context === null) {
    throw new Error("Could not acquire 2D canvas context");
  }
  return { canvas: element, ctx: context };
}

const { canvas, ctx } = getCanvas();

const hudAltitude = getHudElement("hud-altitude");
const hudVspeed = getHudElement("hud-vspeed");
const hudHspeed = getHudElement("hud-hspeed");
const hudTilt = getHudElement("hud-tilt");
const hudFuel = getHudElement("hud-fuel");
const thrusterLeft = getHudElement("thruster-left");
const thrusterRight = getHudElement("thruster-right");
const outcome = getHudElement("outcome");
const outcomeText = outcome.querySelector(".outcome-text");

const sim = createSimulation();
const keys: Keys = { left: false, right: false };
let viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
let accumulator = 0;
let lastTime = performance.now();
let animationId: number | null = null;

function resize(): void {
  const dpr = window.devicePixelRatio ?? 1;
  const cssWidth = Math.max(1, canvas.clientWidth);
  const cssHeight = Math.max(1, canvas.clientHeight);

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const scaleX = cssWidth / WORLD_WIDTH_VIEW;
  const scaleY = cssHeight / WORLD_HEIGHT_VIEW;
  const scale = Math.min(scaleX, scaleY);
  const renderWidth = scale * WORLD_WIDTH_VIEW;
  const renderHeight = scale * WORLD_HEIGHT_VIEW;

  viewport = {
    scale,
    offsetX: (cssWidth - renderWidth) / 2 - WORLD_MIN_X * scale,
    offsetY: (cssHeight - renderHeight) / 2 + WORLD_MAX_Y * scale,
  };

  render(sim.getState());
}

function worldToScreen(x: number, y: number): { x: number; y: number } {
  return {
    x: viewport.offsetX + x * viewport.scale,
    y: viewport.offsetY - y * viewport.scale,
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawStars(): void {
  const rng = mulberry32(12345);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const count = Math.max(80, Math.floor((width * height) / 6000));

  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < count; i++) {
    const sx = rng() * width;
    const sy = rng() * height;
    const r = rng() * 1.2 + 0.4;
    const a = rng() * 0.5 + 0.4;

    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTerrain(terrain: Terrain): void {
  const segments = 120;
  const step = (WORLD_MAX_X - WORLD_MIN_X) / segments;

  ctx.beginPath();
  const start = worldToScreen(WORLD_MIN_X, terrain.heightAt(WORLD_MIN_X));
  ctx.moveTo(start.x, start.y);

  for (let i = 1; i <= segments; i++) {
    const x = WORLD_MIN_X + i * step;
    const y = terrain.heightAt(x);
    const point = worldToScreen(x, y);
    ctx.lineTo(point.x, point.y);
  }

  const canvasWidth = canvas.clientWidth;
  const canvasHeight = canvas.clientHeight;
  ctx.lineTo(canvasWidth, canvasHeight);
  ctx.lineTo(0, canvasHeight);
  ctx.closePath();

  ctx.fillStyle = "#262a36";
  ctx.fill();

  ctx.strokeStyle = "#3a3f4d";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawPad(terrain: Terrain): void {
  const pad = terrain.pad;
  const padTop = pad.y;
  const padThickness = 3;
  const topLeft = worldToScreen(pad.left, padTop);
  const bottomRight = worldToScreen(pad.right, padTop - padThickness);
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;

  ctx.fillStyle = "#4a4f61";
  ctx.fillRect(topLeft.x, topLeft.y, width, height);

  ctx.strokeStyle = "#8c93a8";
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, width, height);

  ctx.fillStyle = "#69f0ae";
  ctx.font = `bold ${Math.max(10, 14 * viewport.scale)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "PAD",
    topLeft.x + width / 2,
    topLeft.y + height / 2 + height * 0.15,
  );
}

function drawLander(state: SimState): void {
  const { x, y } = state.lander.position;
  const angle = state.lander.angle;
  const center = worldToScreen(x, y);
  const scale = viewport.scale;

  const bodyWidth = 36 * scale;
  const bodyHeight = 24 * scale;
  const halfBodyW = bodyWidth / 2;
  const halfBodyH = bodyHeight / 2;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(1, -1);
  ctx.rotate(angle);

  ctx.fillStyle = "#cfd8dc";
  ctx.strokeStyle = "#b0bec5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-halfBodyW, -halfBodyH, bodyWidth, bodyHeight, 4 * scale);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#263238";
  ctx.beginPath();
  ctx.arc(0, 4 * scale, 5 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#78909c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10 * scale, -12 * scale);
  ctx.lineTo(-14 * scale, -16 * scale);
  ctx.moveTo(10 * scale, -12 * scale);
  ctx.lineTo(14 * scale, -16 * scale);
  ctx.stroke();

  ctx.fillStyle = "#ffab40";
  ctx.beginPath();
  ctx.arc(-14 * scale, -16 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.arc(14 * scale, -16 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.fill();

  if (state.thrusters.left) {
    drawFlame(-12 * scale, -12 * scale, 1, state.tick);
  }
  if (state.thrusters.right) {
    drawFlame(12 * scale, -12 * scale, -1, state.tick);
  }

  ctx.restore();
}

function drawFlame(
  bodyX: number,
  bodyY: number,
  side: number,
  tick: number,
): void {
  const scale = viewport.scale;
  const cant = (15 * Math.PI) / 180;
  const length = (12 + Math.sin(tick * 0.7) * 2) * scale;
  const halfWidth = 3 * scale;

  const dirX = -side * Math.sin(cant) * length;
  const dirY = -Math.cos(cant) * length;

  const baseX = bodyX;
  const baseY = bodyY;
  const tipX = baseX + dirX;
  const tipY = baseY + dirY;

  const perpX = -dirY * (halfWidth / length);
  const perpY = dirX * (halfWidth / length);

  ctx.save();
  ctx.fillStyle = "#ff6d00";
  ctx.beginPath();
  ctx.moveTo(baseX + perpX, baseY + perpY);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(baseX - perpX, baseY - perpY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTelemetryMarker(state: SimState, terrain: Terrain): void {
  const { x, y } = state.lander.position;
  const center = worldToScreen(x, y);
  const ground = worldToScreen(x, terrain.heightAt(x));

  ctx.save();
  ctx.strokeStyle = "rgba(79, 195, 247, 0.35)";
  ctx.setLineDash([4 * viewport.scale, 4 * viewport.scale]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(ground.x, ground.y);
  ctx.stroke();
  ctx.restore();
}

function render(state: SimState): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const terrain = sim.terrain;

  ctx.clearRect(0, 0, width, height);

  drawStars();
  drawTerrain(terrain);
  drawPad(terrain);
  drawTelemetryMarker(state, terrain);
  drawLander(state);
}

function updateHud(state: SimState): void {
  const terrain = sim.terrain;
  const landerX = state.lander.position.x;
  const groundHeight = terrain.heightAt(landerX);

  // Altitude is the vertical distance from the lander center of mass to the
  // terrain surface directly beneath it. It is clamped to zero because the
  // meaningful pilot reading is height above ground, not penetration depth.
  const altitude = Math.max(0, state.lander.position.y - groundHeight);
  const vspeed = state.lander.velocity.y;
  const hspeed = state.lander.velocity.x;
  const tilt = (state.lander.angle * 180) / Math.PI;
  const fuel = state.fuel;

  setNumericHud(hudAltitude, altitude, 1);
  setNumericHud(hudVspeed, vspeed, 2);
  setNumericHud(hudHspeed, hspeed, 2);
  setNumericHud(hudTilt, tilt, 1);
  setNumericHud(hudFuel, fuel, 1);

  thrusterLeft.setAttribute("data-active", String(state.thrusters.left));
  thrusterRight.setAttribute("data-active", String(state.thrusters.right));

  updateOutcome(state.outcome);
}

function setNumericHud(
  element: HTMLElement,
  value: number,
  decimals: number,
): void {
  element.setAttribute("data-value", value.toFixed(decimals));
  const valueSpan = element.querySelector(".hud-value");
  if (valueSpan instanceof HTMLElement) {
    valueSpan.textContent = value.toFixed(decimals);
  }
}

const OUTCOME_TEXT: Record<string, string> = {
  landed: "Landed!",
  "missed-pad": "Missed Pad",
  crashed: "Crashed",
};

function updateOutcome(outcomeValue: string): void {
  if (outcomeValue === "flying") {
    outcome.classList.add("hidden");
    outcome.classList.remove("landed", "missed-pad", "crashed");
    return;
  }

  outcome.classList.remove("hidden");
  outcome.classList.remove("landed", "missed-pad", "crashed");
  outcome.classList.add(outcomeValue);

  if (outcomeText instanceof HTMLElement) {
    outcomeText.textContent = OUTCOME_TEXT[outcomeValue] ?? outcomeValue;
  }
}

function step(): void {
  sim.step({ left: keys.left, right: keys.right });
}

function loop(now: number): void {
  let frameTime = (now - lastTime) / 1000;
  lastTime = now;

  if (frameTime > 0.25) {
    frameTime = 0.25;
  }

  accumulator += frameTime;

  while (accumulator >= FIXED_DT) {
    step();
    accumulator -= FIXED_DT;
  }

  const state = sim.getState();
  updateHud(state);
  render(state);

  animationId = requestAnimationFrame(loop);
}

function restart(): void {
  sim.reset();
  accumulator = 0;
  const state = sim.getState();
  updateHud(state);
  render(state);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "q") {
    keys.left = true;
    event.preventDefault();
  } else if (key === "w") {
    keys.right = true;
    event.preventDefault();
  } else if (key === "r") {
    restart();
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();

  if (key === "q") {
    keys.left = false;
    event.preventDefault();
  } else if (key === "w") {
    keys.right = false;
    event.preventDefault();
  }
});

window.addEventListener("resize", resize);

resize();
updateHud(sim.getState());
animationId = requestAnimationFrame(loop);

window.addEventListener("beforeunload", () => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }
});
