import {
  EYE_SENSOR_RAY_COUNT,
  EYE_SENSOR_VIEW_DEFAULT,
  EYE_SENSOR_VIEW_MAX,
  EYE_SENSOR_VIEW_MIN,
  type EyeSensorReading,
  type SensorSuite,
  type SimState,
} from "@moonlander/sim";
import { getElement, getHudElement } from "./dom";

const EYE_SENSOR_VIEW_STEP = 5;
const CHART_BACKGROUND = "#071018";
const CHART_LEFT = 34;
const CHART_RIGHT = 14;
const CHART_TOP = 10;
const CHART_BOTTOM = 18;
const ANGLE_TICKS = [0, 90, 180, 270, 360] as const;
const RADIUS_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

export interface SensorConsoleOptions {
  getEyeSensorRadius(): number;
  setEyeSensorRadius(radius: number): void;
}

export interface SensorConsoleController {
  update(state: SimState): void;
  resize(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSigned(value: number, decimals: number): string {
  const rounded = Math.abs(value) < 0.5 / 10 ** decimals ? 0 : value;
  const fixed = rounded.toFixed(decimals);
  return rounded > 0 ? `+${fixed}` : fixed;
}

function setOutput(
  element: HTMLElement,
  text: string,
  value: number,
): void {
  element.textContent = text;
  element.setAttribute("data-value", String(value));
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  chart: HTMLCanvasElement,
  reading: EyeSensorReading,
): void {
  const cssWidth = Math.max(1, chart.clientWidth);
  const cssHeight = Math.max(1, chart.clientHeight);
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
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
  const radius = Math.max(1, reading.radius);

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

  const points: { x: number; y: number }[] = [];

  for (let index = 0; index < EYE_SENSOR_RAY_COUNT; index += 1) {
    const distance = reading.distances[index] ?? radius;
    const fraction = clamp(distance / radius, 0, 1);
    points.push({
      x: xForAngle((index / EYE_SENSOR_RAY_COUNT) * 360),
      y: yForFraction(fraction),
    });
  }

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
  slider.step = String(EYE_SENSOR_VIEW_STEP);

  const configuredRadius = options.getEyeSensorRadius();
  let displayedRadius = clamp(
    Number.isFinite(configuredRadius)
      ? configuredRadius
      : EYE_SENSOR_VIEW_DEFAULT,
    EYE_SENSOR_VIEW_MIN,
    EYE_SENSOR_VIEW_MAX,
  );
  let lastReading: EyeSensorReading | null = null;
  let lastScanKey: string | null = null;
  let lastChartWidth = -1;
  let lastChartHeight = -1;
  let lastChartDpr = -1;

  const setRadiusReadout = (radius: number): void => {
    displayedRadius = radius;
    slider.value = String(radius);
    radiusValue.textContent = `${radius} m`;
  };

  setRadiusReadout(displayedRadius);

  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    options.setEyeSensorRadius(value);
    setRadiusReadout(
      clamp(value, EYE_SENSOR_VIEW_MIN, EYE_SENSOR_VIEW_MAX),
    );
  });

  const drawCurrentReading = (): void => {
    if (lastReading === null) {
      return;
    }

    lastChartWidth = chart.clientWidth;
    lastChartHeight = chart.clientHeight;
    lastChartDpr = clamp(window.devicePixelRatio || 1, 1, 2);
    drawChart(context, chart, lastReading);
  };

  const applyReading = (reading: EyeSensorReading): void => {
    lastReading = reading;
    chart.setAttribute("data-scan-tick", String(reading.tick));
    chart.setAttribute("data-scan-radius", String(reading.radius));
    scanTick.textContent = String(reading.tick);
    drawCurrentReading();
  };

  const updateNavigation = (sensors: SensorSuite): void => {
    const directionDegrees =
      (sensors.direction.angle * 180) / Math.PI;
    directionNeedle.style.setProperty(
      "--needle-angle",
      `${-directionDegrees}deg`,
    );
    setOutput(
      directionValue,
      `${formatSigned(directionDegrees, 1)}\u00b0`,
      directionDegrees,
    );

    setOutput(
      distanceToStart,
      `${sensors.distanceToStart.toFixed(1)} m`,
      sensors.distanceToStart,
    );

    const velocity = sensors.velocity;
    setOutput(
      velocitySpeed,
      `${velocity.speed.toFixed(1)} m/s`,
      velocity.speed,
    );
    setOutput(
      velocityVx,
      `${formatSigned(velocity.vx, 1)} m/s`,
      velocity.vx,
    );
    setOutput(
      velocityVy,
      `${formatSigned(velocity.vy, 1)} m/s`,
      velocity.vy,
    );

    const velocityDegrees = (velocity.angle * 180) / Math.PI;
    setOutput(
      velocityAngle,
      `${formatSigned(velocityDegrees, 1)}\u00b0`,
      velocityDegrees,
    );
  };

  return {
    update(state: SimState): void {
      if (state.eyeSensorRadius !== displayedRadius) {
        setRadiusReadout(state.eyeSensorRadius);
      }

      const reading = state.sensors.eye;
      const scanKey = `${state.seed}:${reading.tick}:${reading.radius}`;
      if (scanKey !== lastScanKey) {
        lastScanKey = scanKey;
        applyReading(reading);
      } else if (
        lastReading !== null &&
        (chart.clientWidth !== lastChartWidth ||
          chart.clientHeight !== lastChartHeight ||
          clamp(window.devicePixelRatio || 1, 1, 2) !== lastChartDpr)
      ) {
        drawCurrentReading();
      }

      updateNavigation(state.sensors);
    },

    resize(): void {
      drawCurrentReading();
    },
  };
}
