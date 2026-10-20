import {
  EYE_SENSOR_RAY_COUNT,
  EYE_SENSOR_VIEW_DEFAULT,
  EYE_SENSOR_VIEW_MAX,
  EYE_SENSOR_VIEW_MIN,
  type EyeSensorReading,
  type SimState,
  type Vec2,
} from "@moonlander/sim";
import { getElement, getHudElement, readDevicePixelRatio } from "./dom";

export const EYE_SENSOR_RADIUS_STEP = 5;

const CHART_BACKGROUND = "#071018";
const CHART_LEFT = 34;
const CHART_RIGHT = 14;
const CHART_TOP = 10;
const CHART_BOTTOM = 18;
const ANGLE_TICKS = [0, 90, 180, 270, 360] as const;
const RADIUS_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;
const ZERO_TOLERANCE = 0.05;

export interface SensorConsoleOptions {
  getEyeSensorRadius(): number;
  setEyeSensorRadius(radius: number): void;
}

export interface SensorConsoleController {
  update(state: SimState): void;
  resize(): void;
}

export interface SensorConsoleValues {
  configuredRadius: number;
  scanTick: number;
  scanRadius: number;
  scanDistances: readonly number[];
  directionDegrees: number;
  directionNeedleDegrees: number;
  distanceToStart: number;
  speed: number;
  vx: number;
  vy: number;
  velocityAngleDegrees: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampEyeSensorView(radius: number): number {
  return clamp(
    Number.isFinite(radius) ? radius : EYE_SENSOR_VIEW_DEFAULT,
    EYE_SENSOR_VIEW_MIN,
    EYE_SENSOR_VIEW_MAX,
  );
}

export function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    return 0;
  }

  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  if (wrapped === -180 && degrees > 0) {
    return 180;
  }
  return Math.abs(wrapped) < ZERO_TOLERANCE ? 0 : wrapped;
}

export function radiansToSignedDegrees(radians: number): number {
  return normalizeDegrees((radians * 180) / Math.PI);
}

export function directionNeedleDegrees(angleRadians: number): number {
  return -radiansToSignedDegrees(angleRadians);
}

export function formatSigned(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) {
    return (0).toFixed(decimals);
  }

  const threshold = 0.5 / 10 ** decimals;
  const rounded = Math.abs(value) < threshold ? 0 : value;
  const fixed = rounded.toFixed(decimals);
  return rounded > 0 ? `+${fixed}` : fixed;
}

export function formatSignedDegrees(
  degrees: number,
  decimals = 1,
): string {
  return `${formatSigned(normalizeDegrees(degrees), decimals)}\u00b0`;
}

export function formatRadius(radius: number): string {
  const clamped = clampEyeSensorView(radius);
  return `${clamped.toFixed(1).replace(/\.0$/, "")} m`;
}

export function computeSensorConsoleValues(
  state: SimState,
): SensorConsoleValues {
  const configuredRadius = clampEyeSensorView(state.eyeSensorRadius);
  const eye = state.sensors.eye;
  const scanRadius =
    Number.isFinite(eye.radius) && eye.radius > 0
      ? eye.radius
      : configuredRadius;
  const directionDegrees = radiansToSignedDegrees(
    state.sensors.direction.angle,
  );
  const velocity = state.sensors.velocity;
  const speed = Number.isFinite(velocity.speed)
    ? velocity.speed
    : Math.hypot(velocity.vx, velocity.vy);

  return {
    configuredRadius,
    scanTick: eye.tick,
    scanRadius,
    scanDistances: eye.distances,
    directionDegrees,
    directionNeedleDegrees: -directionDegrees,
    distanceToStart: Number.isFinite(state.sensors.distanceToStart)
      ? state.sensors.distanceToStart
      : 0,
    speed: Number.isFinite(speed) ? speed : 0,
    vx: Number.isFinite(velocity.vx) ? velocity.vx : 0,
    vy: Number.isFinite(velocity.vy) ? velocity.vy : 0,
    velocityAngleDegrees: radiansToSignedDegrees(velocity.angle),
  };
}

function setOutput(
  element: HTMLElement,
  text: string,
  value: number,
): void {
  element.textContent = text;
  element.setAttribute("data-value", String(value));
}

function eyeChartPoints(
  reading: EyeSensorReading,
  plotLeft: number,
  plotRight: number,
  plotTop: number,
  plotBottom: number,
): Vec2[] {
  const radius =
    Number.isFinite(reading.radius) && reading.radius > 0
      ? reading.radius
      : 1;
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, plotBottom - plotTop);
  const points: Vec2[] = [];

  for (let index = 0; index < EYE_SENSOR_RAY_COUNT; index += 1) {
    const rawDistance = reading.distances[index];
    const distance =
      typeof rawDistance === "number" && Number.isFinite(rawDistance)
        ? rawDistance
        : radius;
    const fraction = clamp(distance / radius, 0, 1);

    points.push({
      x: plotLeft + (index / EYE_SENSOR_RAY_COUNT) * plotWidth,
      y: plotBottom - fraction * plotHeight,
    });
  }

  return points;
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  chart: HTMLCanvasElement,
  reading: EyeSensorReading,
): void {
  const cssWidth = Math.max(1, chart.clientWidth);
  const cssHeight = Math.max(1, chart.clientHeight);
  const dpr = readDevicePixelRatio();
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

  if (chart.width !== pixelWidth || chart.height !== pixelHeight) {
    chart.width = pixelWidth;
    chart.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = CHART_BACKGROUND;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const plotLeft = CHART_LEFT;
  const plotRight = Math.max(plotLeft + 1, cssWidth - CHART_RIGHT);
  const plotTop = CHART_TOP;
  const plotBottom = Math.max(plotTop + 1, cssHeight - CHART_BOTTOM);
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const radius =
    Number.isFinite(reading.radius) && reading.radius > 0
      ? reading.radius
      : 1;

  const xForAngle = (angle: number): number =>
    plotLeft + (angle / 360) * plotWidth;
  const yForFraction = (fraction: number): number =>
    plotBottom - fraction * plotHeight;

  ctx.font = '9px ui-monospace, "Cascadia Mono", Consolas, monospace';
  ctx.lineWidth = 1;

  for (const fraction of RADIUS_TICKS) {
    const y = yForFraction(fraction);
    ctx.strokeStyle =
      fraction === 0
        ? "rgba(126, 208, 214, 0.28)"
        : "rgba(108, 190, 199, 0.12)";
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();

    ctx.fillStyle = "rgba(136, 198, 205, 0.62)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.round(radius * fraction)), plotLeft - 4, y);
  }

  for (const angle of ANGLE_TICKS) {
    const x = xForAngle(angle);
    ctx.strokeStyle =
      angle === 0 || angle === 360
        ? "rgba(126, 208, 214, 0.28)"
        : "rgba(108, 190, 199, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();

    ctx.fillStyle = "rgba(136, 198, 205, 0.62)";
    ctx.textAlign =
      angle === 0 ? "left" : angle === 360 ? "right" : "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${angle}\u00b0`, x, plotBottom + 4);
  }

  const points = eyeChartPoints(
    reading,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
  );
  const first = points[0]!;
  const fill = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  fill.addColorStop(0, "rgba(94, 244, 236, 0.28)");
  fill.addColorStop(1, "rgba(94, 244, 236, 0.03)");

  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    ctx.lineTo(point.x, point.y);
  }
  ctx.lineTo(plotRight, plotBottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    ctx.lineTo(point.x, point.y);
  }
  ctx.strokeStyle = "rgba(116, 249, 240, 0.92)";
  ctx.lineWidth = 1.25;
  ctx.stroke();
}

export function createSensorConsole(
  options: SensorConsoleOptions,
): SensorConsoleController {
  const chart = getElement(
    '[data-testid="eye-sensor-chart"]',
    HTMLCanvasElement,
  );
  const context = chart.getContext("2d");

  if (context === null) {
    throw new Error("Could not acquire eye sensor chart context");
  }

  const slider = getElement(
    '[data-testid="eye-sensor-radius"]',
    HTMLInputElement,
  );
  const radiusValue = getHudElement("eye-sensor-radius-value");
  const scanTick = getHudElement("eye-sensor-scan-tick");
  const directionNeedle = getHudElement("direction-needle");
  const directionValue = getHudElement("direction-value");
  const distanceToStart = getHudElement("distance-to-start");
  const velocitySpeed = getHudElement("velocity-speed");
  const velocityVx = getHudElement("velocity-vx");
  const velocityVy = getHudElement("velocity-vy");
  const velocityAngle = getHudElement("velocity-angle");

  slider.min = String(EYE_SENSOR_VIEW_MIN);
  slider.max = String(EYE_SENSOR_VIEW_MAX);
  slider.step = String(EYE_SENSOR_RADIUS_STEP);

  let displayedRadius = clampEyeSensorView(
    options.getEyeSensorRadius(),
  );
  let lastReading: EyeSensorReading | null = null;
  let lastScanKey: string | null = null;
  let lastChartWidth = -1;
  let lastChartHeight = -1;
  let lastChartDpr = -1;

  const setRadiusReadout = (radius: number): void => {
    const clamped = clampEyeSensorView(radius);
    displayedRadius = clamped;
    slider.value = String(clamped);
    setOutput(radiusValue, formatRadius(clamped), clamped);
  };

  setRadiusReadout(displayedRadius);

  slider.addEventListener("input", () => {
    const value = clampEyeSensorView(Number(slider.value));
    options.setEyeSensorRadius(value);
    setRadiusReadout(value);
  });

  const drawCurrentReading = (): void => {
    if (lastReading === null) {
      return;
    }

    lastChartWidth = chart.clientWidth;
    lastChartHeight = chart.clientHeight;
    lastChartDpr = readDevicePixelRatio();
    drawChart(context, chart, lastReading);
  };

  const applyReading = (reading: EyeSensorReading): void => {
    lastReading = reading;
    chart.setAttribute("data-scan-tick", String(reading.tick));
    chart.setAttribute("data-scan-radius", String(reading.radius));
    setOutput(scanTick, String(reading.tick), reading.tick);
    drawCurrentReading();
  };

  const updateNavigation = (values: SensorConsoleValues): void => {
    directionNeedle.style.setProperty(
      "--needle-angle",
      `${values.directionNeedleDegrees}deg`,
    );
    setOutput(
      directionValue,
      formatSignedDegrees(values.directionDegrees),
      values.directionDegrees,
    );

    setOutput(
      distanceToStart,
      `${values.distanceToStart.toFixed(1)} m`,
      values.distanceToStart,
    );

    setOutput(
      velocitySpeed,
      `${values.speed.toFixed(1)} m/s`,
      values.speed,
    );
    setOutput(velocityVx, `${formatSigned(values.vx)} m/s`, values.vx);
    setOutput(velocityVy, `${formatSigned(values.vy)} m/s`, values.vy);
    setOutput(
      velocityAngle,
      formatSignedDegrees(values.velocityAngleDegrees),
      values.velocityAngleDegrees,
    );
  };

  return {
    update(state: SimState): void {
      const values = computeSensorConsoleValues(state);

      if (values.configuredRadius !== displayedRadius) {
        setRadiusReadout(values.configuredRadius);
      }

      const reading = state.sensors.eye;
      const scanKey = `${state.seed}:${reading.tick}:${reading.radius}`;
      const chartSizeChanged =
        lastReading !== null &&
        (chart.clientWidth !== lastChartWidth ||
          chart.clientHeight !== lastChartHeight ||
          readDevicePixelRatio() !== lastChartDpr);

      if (reading !== lastReading || scanKey !== lastScanKey) {
        lastScanKey = scanKey;
        applyReading(reading);
      } else if (chartSizeChanged) {
        drawCurrentReading();
      }

      updateNavigation(values);
    },

    resize(): void {
      drawCurrentReading();
    },
  };
}
