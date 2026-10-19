import {
  SENSOR_RAY_COUNT,
  SENSOR_VIEW_DEFAULT,
  SENSOR_VIEW_MAX,
  SENSOR_VIEW_MIN,
  type SensorReading,
  type SimState,
} from "@moonlander/sim";
import { getElement, getHudElement } from "./dom";

const SENSOR_VIEW_STEP = 5;
const CHART_BACKGROUND = "#071018";
const CHART_LEFT = 34;
const CHART_RIGHT = 14;
const CHART_TOP = 10;
const CHART_BOTTOM = 18;
const ANGLE_TICKS = [0, 90, 180, 270, 360] as const;
const RADIUS_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

export interface SensorPanelOptions {
  getSensorRadius(): number;
  setSensorRadius(radius: number): void;
}

export interface SensorPanelController {
  update(state: SimState): void;
  resize(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  chart: HTMLCanvasElement,
  reading: SensorReading,
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

  for (let index = 0; index < SENSOR_RAY_COUNT; index += 1) {
    const distance = reading.distances[index] ?? radius;
    const fraction = clamp(distance / radius, 0, 1);
    points.push({
      x: xForAngle((index / SENSOR_RAY_COUNT) * 360),
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

export function createSensorPanel(
  options: SensorPanelOptions,
): SensorPanelController {
  const chart = getElement(
    '[data-testid="sensor-chart"]',
    HTMLCanvasElement,
  );
  const context = chart.getContext("2d");
  if (context === null) {
    throw new Error("Could not acquire sensor chart context");
  }

  const slider = getElement(
    '[data-testid="sensor-radius"]',
    HTMLInputElement,
  );
  const radiusValue = getHudElement("sensor-radius-value");
  const scanTick = getHudElement("sensor-scan-tick");

  slider.min = String(SENSOR_VIEW_MIN);
  slider.max = String(SENSOR_VIEW_MAX);
  slider.step = String(SENSOR_VIEW_STEP);

  const configuredRadius = options.getSensorRadius();
  let displayedRadius = clamp(
    Number.isFinite(configuredRadius)
      ? configuredRadius
      : SENSOR_VIEW_DEFAULT,
    SENSOR_VIEW_MIN,
    SENSOR_VIEW_MAX,
  );
  let lastReading: SensorReading | null = null;
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
    options.setSensorRadius(value);
    setRadiusReadout(
      clamp(value, SENSOR_VIEW_MIN, SENSOR_VIEW_MAX),
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

  const applyReading = (reading: SensorReading): void => {
    lastReading = reading;
    chart.setAttribute("data-scan-tick", String(reading.tick));
    chart.setAttribute("data-scan-radius", String(reading.radius));
    scanTick.textContent = String(reading.tick);
    drawCurrentReading();
  };

  return {
    update(state: SimState): void {
      if (state.sensorRadius !== displayedRadius) {
        setRadiusReadout(state.sensorRadius);
      }

      const scanKey = `${state.seed}:${state.sensor.tick}:${state.sensor.radius}`;
      if (scanKey !== lastScanKey) {
        lastScanKey = scanKey;
        applyReading(state.sensor);
        return;
      }

      if (
        lastReading !== null &&
        (chart.clientWidth !== lastChartWidth ||
          chart.clientHeight !== lastChartHeight ||
          clamp(window.devicePixelRatio || 1, 1, 2) !== lastChartDpr)
      ) {
        drawCurrentReading();
      }
    },

    resize(): void {
      drawCurrentReading();
    },
  };
}
