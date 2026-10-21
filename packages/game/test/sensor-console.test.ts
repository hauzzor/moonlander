import { afterEach, describe, expect, it } from "vitest";
import {
  EYE_SENSOR_RAY_COUNT,
  EYE_SENSOR_VIEW_DEFAULT,
  EYE_SENSOR_VIEW_MAX,
  EYE_SENSOR_VIEW_MIN,
  type SimState,
  type Vec2,
} from "@moonlander/sim";
import type { Camera, Viewport } from "../src/camera";
import { drawRadar } from "../src/render/radar";
import {
  createSensorConsole,
  type SensorConsoleController,
} from "../src/sensor-console";
import {
  FakeCanvasContext,
  FakeCanvasElement,
  FakeElement,
  FakeHTMLInputElement,
  installFakeDom,
  type FakeDom,
} from "./fake-dom";
import { deepFreeze, makeState } from "./fixtures";

interface EyeOverride {
  radius?: number;
  tick?: number;
  distances?: readonly number[];
  heading?: number;
  origin?: Vec2;
}

function withEye(state: SimState, override: EyeOverride = {}): SimState {
  const radius = override.radius ?? state.eyeSensorRadius;
  state.sensors.eye = {
    radius,
    tick: override.tick ?? state.tick,
    origin: override.origin ?? state.ship.position,
    heading: override.heading ?? state.ship.angle,
    distances:
      override.distances ??
      Array.from({ length: EYE_SENSOR_RAY_COUNT }, () => radius),
  };
  return state;
}

function uniformDistances(length: number, radius: number): number[] {
  return Array.from({ length }, () => radius);
}

interface ConsoleFixture {
  dom: FakeDom;
  console: SensorConsoleController;
  panel: FakeElement;
  autopilotStatus: FakeElement;
  chart: FakeCanvasElement;
  slider: FakeHTMLInputElement;
  radiusValue: FakeElement;
  scanTick: FakeElement;
  needle: FakeElement;
  directionValue: FakeElement;
  distanceToStart: FakeElement;
  speed: FakeElement;
  vx: FakeElement;
  vy: FakeElement;
  velocityAngle: FakeElement;
  radius: { value: number; requests: number[] };
}

let activeDom: FakeDom | null = null;

function createConsole(
  configuredRadius: number = EYE_SENSOR_VIEW_DEFAULT,
): ConsoleFixture {
  const dom = installFakeDom({ dpr: 1 });
  activeDom = dom;

  const panel = dom.addElement("eye-sensor-panel", "aside");
  const autopilotStatus = dom.addElement("autopilot-status", "div");
  const chart = dom.addCanvas("eye-sensor-chart");
  chart.clientWidth = 374;
  chart.clientHeight = 138;
  panel.appendChild(chart);
  const slider = dom.addInput("eye-sensor-radius");
  panel.appendChild(slider);
  const radiusValue = dom.addElement("eye-sensor-radius-value");
  const scanTick = dom.addElement("eye-sensor-scan-tick");
  const needle = dom.addElement("direction-needle");
  const directionValue = dom.addElement("direction-value");
  const distanceToStart = dom.addElement("distance-to-start");
  const speed = dom.addElement("velocity-speed");
  const vx = dom.addElement("velocity-vx");
  const vy = dom.addElement("velocity-vy");
  const velocityAngle = dom.addElement("velocity-angle");

  const radius = { value: configuredRadius, requests: [] as number[] };
  const controller = createSensorConsole({
    getEyeSensorRadius: () => radius.value,
    setEyeSensorRadius: (requested) => {
      radius.requests.push(requested);
      radius.value = requested;
    },
  });

  return {
    dom,
    console: controller,
    panel,
    autopilotStatus,
    chart,
    slider,
    radiusValue,
    scanTick,
    needle,
    directionValue,
    distanceToStart,
    speed,
    vx,
    vy,
    velocityAngle,
    radius,
  };
}

afterEach(() => {
  activeDom?.restore();
  activeDom = null;
});

function numericValue(element: FakeElement): number {
  const raw = element.getAttribute("data-value");
  expect(raw).not.toBeNull();
  const value = Number(raw);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

interface RangeSliderState {
  min: string;
  max: string;
  step: string;
  value: string;
}

function rangeSlider(input: FakeHTMLInputElement): RangeSliderState {
  return input as unknown as RangeSliderState;
}

interface Point {
  x: number;
  y: number;
}

function chartTrace(chart: FakeCanvasElement): Point[] {
  const calls = chart.context.calls;
  const names = calls.map((call) => call.name);
  const startIndex = names.lastIndexOf("moveTo");
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = calls.findIndex(
    (call, index) => index > startIndex && call.name === "stroke",
  );
  expect(endIndex).toBeGreaterThan(startIndex);

  const first = calls[startIndex]!;
  const points: Point[] = [
    { x: Number(first.args[0]), y: Number(first.args[1]) },
  ];
  for (const call of calls.slice(startIndex + 1, endIndex)) {
    if (call.name === "lineTo") {
      points.push({
        x: Number(call.args[0]),
        y: Number(call.args[1]),
      });
    }
  }
  return points;
}

describe("sensor console radius control", () => {
  it.each([
    { name: "the minimum radius", configured: EYE_SENSOR_VIEW_MIN },
    { name: "the default radius", configured: EYE_SENSOR_VIEW_DEFAULT },
    { name: "the maximum radius", configured: EYE_SENSOR_VIEW_MAX },
  ])(
    "configures the slider for $name",
    ({ configured }) => {
      const fixture = createConsole(configured);
      const slider = rangeSlider(fixture.slider);

      expect(slider.min).toBe(String(EYE_SENSOR_VIEW_MIN));
      expect(slider.max).toBe(String(EYE_SENSOR_VIEW_MAX));
      expect(slider.step).toBe("5");
      expect(slider.value).toBe(String(configured));
      expect(fixture.radiusValue.textContent).toBe(`${configured} m`);
    },
  );

  it.each([
    { name: "below the minimum", configured: 5, expected: EYE_SENSOR_VIEW_MIN },
    {
      name: "above the maximum",
      configured: 250,
      expected: EYE_SENSOR_VIEW_MAX,
    },
    {
      name: "non-finite",
      configured: Number.NaN,
      expected: EYE_SENSOR_VIEW_DEFAULT,
    },
  ])(
    "clamps a configured radius $name",
    ({ configured, expected }) => {
      const fixture = createConsole(configured);

      expect(fixture.slider.value).toBe(String(expected));
      expect(fixture.radiusValue.textContent).toBe(`${expected} m`);
    },
  );

  it.each([
    { name: "minimum", value: EYE_SENSOR_VIEW_MIN },
    { name: "midpoint", value: 125 },
    { name: "maximum", value: EYE_SENSOR_VIEW_MAX },
  ])("applies the $name slider value immediately", ({ value }) => {
    const fixture = createConsole();
    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: EYE_SENSOR_VIEW_DEFAULT })),
    );

    fixture.slider.value = String(value);
    fixture.slider.dispatch("input");

    expect(fixture.radius.requests).toEqual([value]);
    expect(fixture.radius.value).toBe(value);
    expect(fixture.slider.value).toBe(String(value));
    expect(fixture.radiusValue.textContent).toBe(`${value} m`);
  });

  it("syncs the readout from the simulation state", () => {
    const fixture = createConsole(EYE_SENSOR_VIEW_DEFAULT);

    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: EYE_SENSOR_VIEW_MAX }), {
        radius: EYE_SENSOR_VIEW_MAX,
        tick: 120,
      }),
    );

    expect(fixture.radiusValue.textContent).toBe(`${EYE_SENSOR_VIEW_MAX} m`);
    expect(fixture.slider.value).toBe(String(EYE_SENSOR_VIEW_MAX));
  });

  it("keeps the last scan radius until the next scan", () => {
    const fixture = createConsole(EYE_SENSOR_VIEW_DEFAULT);

    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: EYE_SENSOR_VIEW_DEFAULT }), {
        radius: EYE_SENSOR_VIEW_DEFAULT,
        tick: 0,
      }),
    );
    expect(fixture.chart.getAttribute("data-scan-radius")).toBe(
      String(EYE_SENSOR_VIEW_DEFAULT),
    );
    expect(fixture.scanTick.textContent).toBe("0");

    fixture.slider.value = String(EYE_SENSOR_VIEW_MAX);
    fixture.slider.dispatch("input");

    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: EYE_SENSOR_VIEW_MAX }), {
        radius: EYE_SENSOR_VIEW_DEFAULT,
        tick: 0,
      }),
    );

    expect(fixture.radiusValue.textContent).toBe(`${EYE_SENSOR_VIEW_MAX} m`);
    expect(fixture.chart.getAttribute("data-scan-radius")).toBe(
      String(EYE_SENSOR_VIEW_DEFAULT),
    );
    expect(fixture.scanTick.textContent).toBe("0");

    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: EYE_SENSOR_VIEW_MAX }), {
        radius: EYE_SENSOR_VIEW_MAX,
        tick: 120,
      }),
    );

    expect(fixture.chart.getAttribute("data-scan-radius")).toBe(
      String(EYE_SENSOR_VIEW_MAX),
    );
    expect(fixture.chart.getAttribute("data-scan-tick")).toBe("120");
    expect(fixture.scanTick.textContent).toBe("120");
  });
});

describe("sensor console scan tick and chart", () => {
  it.each([
    {
      name: "the initial scan",
      stateTick: 0,
      readingTick: 0,
      expected: "0",
    },
    {
      name: "the first second before the next scan",
      stateTick: 119,
      readingTick: 0,
      expected: "0",
    },
    {
      name: "the second scan",
      stateTick: 120,
      readingTick: 120,
      expected: "120",
    },
    {
      name: "a later scan",
      stateTick: 600,
      readingTick: 600,
      expected: "600",
    },
  ])(
    "reports the last scan tick for $name",
    ({ stateTick, readingTick, expected }) => {
      const fixture = createConsole();
      const state = withEye(
        makeState({ tick: stateTick, eyeSensorRadius: 120 }),
        { radius: 120, tick: readingTick },
      );

      fixture.console.update(state);

      expect(fixture.scanTick.textContent).toBe(expected);
      expect(fixture.chart.getAttribute("data-scan-tick")).toBe(expected);
      expect(fixture.chart.getAttribute("data-scan-radius")).toBe("120");
    },
  );

  it("plots all 360 rim distances against world angle", () => {
    const fixture = createConsole();
    const radius = 120;
    const distances = uniformDistances(EYE_SENSOR_RAY_COUNT, radius);
    distances[0] = 0;
    distances[180] = radius;

    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: radius }), {
        radius,
        tick: 0,
        distances,
      }),
    );

    const points = chartTrace(fixture.chart);

    expect(points).toHaveLength(EYE_SENSOR_RAY_COUNT);
    expect(fixture.chart.context.callsNamed("fill").length).toBeGreaterThan(0);
    expect(fixture.chart.context.callsNamed("stroke").length).toBeGreaterThan(
      0,
    );

    const span = points[359]!.x - points[0]!.x;
    expect(span).toBeGreaterThan(0);
    for (const index of [90, 180, 270, 359]) {
      expect(points[index]!.x).toBeCloseTo(
        points[0]!.x + (index / 359) * span,
        9,
      );
    }

    const bottom = points[0]!.y;
    const top = points[180]!.y;
    expect(bottom).toBeGreaterThan(top);
    expect(points[90]!.y).toBeCloseTo(top, 9);
    expect(points[359]!.y).toBeCloseTo(top, 9);
  });

  it.each([
    { name: "the minimum radius", radius: 20, expectedFraction: 0.5 },
    { name: "the maximum radius", radius: 200, expectedFraction: 0.05 },
  ])(
    "scales chart distances by the scan radius at $name",
    ({ radius, expectedFraction }) => {
      const fixture = createConsole(radius);
      const distances = uniformDistances(EYE_SENSOR_RAY_COUNT, radius);
      distances[0] = 0;
      distances[180] = 10;
      distances[359] = radius;

      fixture.console.update(
        withEye(makeState({ eyeSensorRadius: radius }), {
          radius,
          tick: 0,
          distances,
        }),
      );

      const points = chartTrace(fixture.chart);
      const bottom = points[0]!.y;
      const top = points[359]!.y;

      expect(points).toHaveLength(EYE_SENSOR_RAY_COUNT);
      expect(points[180]!.y).toBeCloseTo(
        bottom - expectedFraction * (bottom - top),
        9,
      );
    },
  );

  it("keeps plotting the last scan radius while a change is pending", () => {
    const fixture = createConsole(200);
    const distances = uniformDistances(EYE_SENSOR_RAY_COUNT, 60);
    distances[0] = 0;
    distances[359] = 120;

    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: 200 }), {
        radius: 120,
        tick: 0,
        distances,
      }),
    );

    const points = chartTrace(fixture.chart);
    const bottom = points[0]!.y;
    const top = points[359]!.y;

    expect(fixture.chart.getAttribute("data-scan-radius")).toBe("120");
    expect(points[180]!.y).toBeCloseTo(bottom - 0.5 * (bottom - top), 9);
  });

  it("redraws the last reading on resize", () => {
    const fixture = createConsole();
    fixture.console.resize();
    expect(fixture.chart.context.calls).toHaveLength(0);

    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: 120 }), { radius: 120, tick: 0 }),
    );
    const afterUpdate = fixture.chart.context.calls.length;
    expect(afterUpdate).toBeGreaterThan(0);

    fixture.chart.clientWidth = 300;
    fixture.chart.clientHeight = 100;
    fixture.console.resize();

    expect(fixture.chart.width).toBe(300);
    expect(fixture.chart.height).toBe(100);
    expect(fixture.chart.context.calls.length).toBeGreaterThan(afterUpdate);
    expect(chartTrace(fixture.chart)).toHaveLength(EYE_SENSOR_RAY_COUNT);
  });
});

describe("sensor console navigation blocks", () => {
  it.each([
    {
      name: "level",
      angle: 0,
      expectedDegrees: 0,
      expectedText: /^[+-]?0\.0\u00b0$/,
    },
    {
      name: "nose up",
      angle: Math.PI / 4,
      expectedDegrees: 45,
      expectedText: "+45.0\u00b0",
    },
    {
      name: "nose down",
      angle: -Math.PI / 6,
      expectedDegrees: -30,
      expectedText: "-30.0\u00b0",
    },
    {
      name: "inverted nose up",
      angle: Math.PI,
      expectedDegrees: 180,
      expectedText: "+180.0\u00b0",
    },
    {
      name: "inverted nose down",
      angle: -Math.PI,
      expectedDegrees: -180,
      expectedText: "-180.0\u00b0",
    },
  ])(
    "reports a $name direction",
    ({ angle, expectedDegrees, expectedText }) => {
      const fixture = createConsole();
      fixture.console.update(
        withEye(makeState({ angle }), { radius: 120, tick: 0, heading: angle }),
      );

      const text = fixture.directionValue.textContent ?? "";
      if (typeof expectedText === "string") {
        expect(text).toBe(expectedText);
      } else {
        expect(text).toMatch(expectedText);
      }
      expect(numericValue(fixture.directionValue)).toBeCloseTo(
        expectedDegrees,
        9,
      );
      const needle = fixture.needle.style.getPropertyValue("--needle-angle");
      expect(needle.endsWith("deg")).toBe(true);
      expect(Number.parseFloat(needle)).toBeCloseTo(-expectedDegrees, 9);
    },
  );

  it.each([
    { name: "zero distance", position: { x: 0, y: 60 }, expected: 0 },
    { name: "forward travel", position: { x: 30, y: 100 }, expected: 50 },
    { name: "backward travel", position: { x: -4, y: 60 }, expected: 4 },
    { name: "diagonal travel", position: { x: 3, y: 64 }, expected: 5 },
  ])(
    "reports distance to start for $name",
    ({ position, expected }) => {
      const fixture = createConsole();
      fixture.console.update(
        withEye(makeState({ position }), { radius: 120, tick: 0 }),
      );

      expect(fixture.distanceToStart.textContent).toBe(
        `${expected.toFixed(1)} m`,
      );
      expect(numericValue(fixture.distanceToStart)).toBeCloseTo(expected, 9);
    },
  );

  it.each([
    {
      name: "at rest",
      velocity: { x: 0, y: 0 },
      expected: {
        speed: 0,
        vx: 0,
        vy: 0,
        degrees: 0,
        speedText: "0.0 m/s",
        vxText: "0.0 m/s",
        vyText: "0.0 m/s",
        angleText: /^[+-]?0\.0\u00b0$/,
      },
    },
    {
      name: "moving forward and up",
      velocity: { x: 3, y: 4 },
      expected: {
        speed: 5,
        vx: 3,
        vy: 4,
        degrees: 53.13010235415598,
        speedText: "5.0 m/s",
        vxText: "+3.0 m/s",
        vyText: "+4.0 m/s",
        angleText: "+53.1\u00b0",
      },
    },
    {
      name: "moving backward and down",
      velocity: { x: -3, y: -4 },
      expected: {
        speed: 5,
        vx: -3,
        vy: -4,
        degrees: -126.86989764584402,
        speedText: "5.0 m/s",
        vxText: "-3.0 m/s",
        vyText: "-4.0 m/s",
        angleText: "-126.9\u00b0",
      },
    },
    {
      name: "falling",
      velocity: { x: 0, y: -2 },
      expected: {
        speed: 2,
        vx: 0,
        vy: -2,
        degrees: -90,
        speedText: "2.0 m/s",
        vxText: "0.0 m/s",
        vyText: "-2.0 m/s",
        angleText: "-90.0\u00b0",
      },
    },
    {
      name: "moving backward",
      velocity: { x: -5, y: 0 },
      expected: {
        speed: 5,
        vx: -5,
        vy: 0,
        degrees: 180,
        speedText: "5.0 m/s",
        vxText: "-5.0 m/s",
        vyText: "0.0 m/s",
        angleText: "+180.0\u00b0",
      },
    },
  ])("reports velocity for $name", ({ velocity, expected }) => {
    const fixture = createConsole();
    fixture.console.update(
      withEye(makeState({ velocity }), { radius: 120, tick: 0 }),
    );

    expect(fixture.speed.textContent).toBe(expected.speedText);
    expect(fixture.vx.textContent).toBe(expected.vxText);
    expect(fixture.vy.textContent).toBe(expected.vyText);
    const angleText = fixture.velocityAngle.textContent ?? "";
    if (typeof expected.angleText === "string") {
      expect(angleText).toBe(expected.angleText);
    } else {
      expect(angleText).toMatch(expected.angleText);
    }

    expect(numericValue(fixture.speed)).toBeCloseTo(expected.speed, 9);
    expect(numericValue(fixture.vx)).toBeCloseTo(expected.vx, 9);
    expect(numericValue(fixture.vy)).toBeCloseTo(expected.vy, 9);
    expect(numericValue(fixture.velocityAngle)).toBeCloseTo(
      expected.degrees,
      9,
    );
  });
});

describe("sensor console edge cases", () => {
  it("shows the last scan for a destroyed run without mutating state", () => {
    const fixture = createConsole(200);
    const state = deepFreeze(
      withEye(
        makeState({
          hull: 0,
          outcome: "destroyed",
          tick: 600,
          eyeSensorRadius: 200,
          position: { x: 30, y: 100 },
          velocity: { x: 3, y: 4 },
          angle: Math.PI / 4,
        }),
        { radius: 200, tick: 600 },
      ),
    );
    const snapshot = structuredClone(state);

    fixture.console.update(state);

    expect(fixture.scanTick.textContent).toBe("600");
    expect(fixture.chart.getAttribute("data-scan-tick")).toBe("600");
    expect(fixture.chart.getAttribute("data-scan-radius")).toBe("200");
    expect(fixture.radiusValue.textContent).toBe("200 m");
    expect(fixture.slider.value).toBe("200");
    expect(fixture.distanceToStart.textContent).toBe("50.0 m");
    expect(numericValue(fixture.speed)).toBeCloseTo(5, 9);
    expect(numericValue(fixture.directionValue)).toBeCloseTo(45, 9);
    expect(fixture.chart.context.callsNamed("fill").length).toBeGreaterThan(0);
    expect(state).toEqual(snapshot);
  });

  it("does not mutate simulation state on update", () => {
    const fixture = createConsole(120);
    const state = deepFreeze(
      withEye(makeState({ velocity: { x: 12, y: -3 }, tick: 240 }), {
        radius: 120,
        tick: 240,
      }),
    );
    const snapshot = structuredClone(state);

    fixture.console.update(state);

    expect(state).toEqual(snapshot);
  });
});

describe("sensor console visibility", () => {
  it("hides the whole panel, disables the slider, and marks the document", () => {
    const fixture = createConsole();

    fixture.console.setVisible(false);

    expect(fixture.console.isVisible()).toBe(false);
    expect(fixture.panel.getAttribute("data-visible")).toBe("false");
    expect(fixture.panel.getAttribute("aria-hidden")).toBe("true");
    expect(fixture.panel.hasAttribute("hidden")).toBe(true);
    expect(fixture.panel.hasAttribute("inert")).toBe(true);
    expect(fixture.slider.disabled).toBe(true);
    expect(fixture.dom.document.body.classList.contains("sensors-hidden")).toBe(
      true,
    );
  });

  it("reveals the panel, removes the hidden state, and enables the slider", () => {
    const fixture = createConsole();
    fixture.console.setVisible(false);

    fixture.console.setVisible(true);

    expect(fixture.console.isVisible()).toBe(true);
    expect(fixture.panel.getAttribute("data-visible")).toBe("true");
    expect(fixture.panel.getAttribute("aria-hidden")).toBe("false");
    expect(fixture.panel.hasAttribute("hidden")).toBe(false);
    expect(fixture.panel.hasAttribute("inert")).toBe(false);
    expect(fixture.slider.disabled).toBe(false);
    expect(fixture.dom.document.body.classList.contains("sensors-hidden")).toBe(
      false,
    );
  });

  it.each([false, true])(
    "keeps updating hidden and visible console values (visible=%s)",
    (visible) => {
      const fixture = createConsole();
      fixture.console.setVisible(visible);

      fixture.console.update(
        withEye(
          makeState({
            tick: 120,
            position: { x: 30, y: 100 },
            velocity: { x: 3, y: 4 },
            angle: Math.PI / 4,
            eyeSensorRadius: 180,
          }),
          { radius: 180, tick: 120 },
        ),
      );

      expect(fixture.chart.getAttribute("data-scan-tick")).toBe("120");
      expect(fixture.chart.getAttribute("data-scan-radius")).toBe("180");
      expect(fixture.scanTick.textContent).toBe("120");
      expect(fixture.radiusValue.textContent).toBe("180 m");
      expect(fixture.slider.value).toBe("180");
      expect(fixture.distanceToStart.textContent).toBe("50.0 m");
      expect(numericValue(fixture.speed)).toBeCloseTo(5, 9);
      expect(numericValue(fixture.directionValue)).toBeCloseTo(45, 9);
    },
  );

  it("does not mutate a frozen state while hidden", () => {
    const fixture = createConsole();
    fixture.console.setVisible(false);
    const state = deepFreeze(
      withEye(makeState({ tick: 240, velocity: { x: 2, y: -1 } }), {
        radius: 120,
        tick: 240,
      }),
    );
    const snapshot = structuredClone(state);

    fixture.console.update(state);

    expect(state).toEqual(snapshot);
    expect(fixture.chart.getAttribute("data-scan-tick")).toBe("240");
  });

  it("redraws the last reading at its real size when revealed", () => {
    const fixture = createConsole();
    fixture.console.setVisible(false);
    fixture.chart.clientWidth = 0;
    fixture.chart.clientHeight = 0;
    fixture.console.update(
      withEye(makeState({ eyeSensorRadius: 120 }), { radius: 120, tick: 0 }),
    );

    fixture.chart.clientWidth = 374;
    fixture.chart.clientHeight = 138;
    const beforeReveal = fixture.chart.context.calls.length;

    fixture.console.setVisible(true);

    expect(fixture.chart.context.calls.length).toBeGreaterThan(beforeReveal);
    expect(fixture.chart.width).toBe(374);
    expect(fixture.chart.height).toBe(138);
    expect(chartTrace(fixture.chart)).toHaveLength(EYE_SENSOR_RAY_COUNT);
  });

  it("moves focus out of the panel when it is hidden", () => {
    const fixture = createConsole();
    fixture.console.setVisible(true);
    fixture.slider.focus();
    expect(fixture.dom.document.activeElement).toBe(fixture.slider);

    fixture.console.setVisible(false);

    const active = fixture.dom.document.activeElement;
    expect(active).not.toBe(fixture.slider);
    expect(fixture.panel.contains(active)).toBe(false);
    expect(
      active === fixture.autopilotStatus || active === fixture.dom.canvas,
    ).toBe(true);
  });

  it("leaves focus untouched when the panel was already hidden", () => {
    const fixture = createConsole();
    const outside = new FakeElement("button");
    outside.focus();

    fixture.console.setVisible(false);

    expect(fixture.dom.document.activeElement).toBe(outside);
  });
});

const RADAR_VIEWPORT: Viewport = {
  width: 800,
  height: 600,
  scale: 2,
  dpr: 1,
};

function radarContext(
  state: SimState,
  viewport: Viewport = RADAR_VIEWPORT,
): FakeCanvasContext {
  const context = new FakeCanvasContext();
  const camera: Camera = {
    x: state.ship.position.x,
    y: state.ship.position.y,
    ready: true,
  };
  drawRadar(
    context as unknown as CanvasRenderingContext2D,
    viewport,
    camera,
    state,
  );
  return context;
}

function radarScanPoints(context: FakeCanvasContext): Point[] {
  const calls = context.calls;
  const closeIndex = calls.findIndex((call) => call.name === "closePath");
  expect(closeIndex).toBeGreaterThan(0);

  const beforeClose = calls.slice(0, closeIndex);
  const startIndex = beforeClose
    .map((call) => call.name)
    .lastIndexOf("moveTo");
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const first = beforeClose[startIndex]!;
  const points: Point[] = [
    { x: Number(first.args[0]), y: Number(first.args[1]) },
  ];
  for (const call of beforeClose.slice(startIndex + 1)) {
    if (call.name === "lineTo") {
      points.push({
        x: Number(call.args[0]),
        y: Number(call.args[1]),
      });
    }
  }
  return points;
}

function radarCenter(viewport: Viewport): Point {
  return { x: viewport.width / 2, y: viewport.height / 2 };
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centerRays(
  context: FakeCanvasContext,
  center: Point,
): [Point, Point][] {
  const calls = context.calls;
  const rays: [Point, Point][] = [];

  for (let index = 0; index < calls.length - 1; index += 1) {
    const start = calls[index]!;
    const end = calls[index + 1]!;
    if (start.name !== "moveTo" || end.name !== "lineTo") {
      continue;
    }

    const from = {
      x: Number(start.args[0]),
      y: Number(start.args[1]),
    };
    if (distanceBetween(from, center) > 1e-9) {
      continue;
    }

    rays.push([
      from,
      { x: Number(end.args[0]), y: Number(end.args[1]) },
    ]);
  }

  return rays;
}

function longestRay(rays: readonly [Point, Point][]): [Point, Point] {
  expect(rays.length).toBeGreaterThan(0);
  return rays.reduce((longest, ray) =>
    distanceBetween(ray[0], ray[1]) >
    distanceBetween(longest[0], longest[1])
      ? ray
      : longest,
  );
}

function expectPointsClose(actual: Point[], expected: Point[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    const target = expected[index]!;
    expect(point.x).toBeCloseTo(target.x, 9);
    expect(point.y).toBeCloseTo(target.y, 9);
  });
}

const RADAR_RADIUS = 120;

const RADAR_DISTANCES: readonly number[] = (() => {
  const distances = uniformDistances(EYE_SENSOR_RAY_COUNT, RADAR_RADIUS);
  distances[0] = 96;
  distances[90] = 48;
  distances[180] = 0;
  distances[270] = 72;
  return distances;
})();

function radarState(heading = 0, time = 0): SimState {
  return withEye(makeState({ angle: heading, time }), {
    radius: RADAR_RADIUS,
    tick: 0,
    heading,
    distances: RADAR_DISTANCES,
  });
}

describe("world-aligned eye sensor radar", () => {
  it("places rim distances at absolute world angles", () => {
    const context = radarContext(radarState());
    const points = radarScanPoints(context);
    const center = radarCenter(RADAR_VIEWPORT);
    const range = distanceBetween(points[1]!, center);

    expect(points).toHaveLength(EYE_SENSOR_RAY_COUNT);
    expect(range).toBeGreaterThan(0);

    for (const index of [0, 1, 90, 180, 270, 359]) {
      const expectedDistance =
        range * (RADAR_DISTANCES[index]! / RADAR_RADIUS);
      const angle = (index / EYE_SENSOR_RAY_COUNT) * Math.PI * 2;

      expect(distanceBetween(points[index]!, center)).toBeCloseTo(
        expectedDistance,
        9,
      );
      expect(points[index]!.x).toBeCloseTo(
        center.x + Math.cos(angle) * expectedDistance,
        9,
      );
      expect(points[index]!.y).toBeCloseTo(
        center.y - Math.sin(angle) * expectedDistance,
        9,
      );
    }
  });

  it.each([0, Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI])(
    "does not rotate the scan by the ship heading (%s rad)",
    (heading) => {
      const baseline = radarScanPoints(radarContext(radarState(0)));
      const points = radarScanPoints(radarContext(radarState(heading)));

      expectPointsClose(points, baseline);
    },
  );

  it.each([
    { name: "minimum", configured: EYE_SENSOR_VIEW_MIN },
    { name: "default", configured: EYE_SENSOR_VIEW_DEFAULT },
    { name: "maximum", configured: EYE_SENSOR_VIEW_MAX },
  ])(
    "uses the last scan radius, not a pending $name configured radius",
    ({ configured }) => {
      const radius = 60;
      const distances = uniformDistances(EYE_SENSOR_RAY_COUNT, radius);
      distances[0] = 30;
      const stateFor = (configuredRadius: number): SimState =>
        withEye(makeState({ eyeSensorRadius: configuredRadius }), {
          radius,
          tick: 0,
          distances,
        });

      const baseline = radarScanPoints(
        radarContext(stateFor(EYE_SENSOR_VIEW_MIN)),
      );
      const points = radarScanPoints(radarContext(stateFor(configured)));
      const center = radarCenter(RADAR_VIEWPORT);
      const range = distanceBetween(points[1]!, center);

      expectPointsClose(points, baseline);
      expect(points).toHaveLength(EYE_SENSOR_RAY_COUNT);
      expect(distanceBetween(points[0]!, center)).toBeCloseTo(range * 0.5, 9);
    },
  );

  it("centers the scan on the current ship, not the scan origin", () => {
    const state = withEye(
      makeState({ position: { x: 10, y: 20 }, eyeSensorRadius: 120 }),
      {
        radius: 120,
        tick: 120,
        origin: { x: -1000, y: -1000 },
        distances: uniformDistances(EYE_SENSOR_RAY_COUNT, 120),
      },
    );

    const points = radarScanPoints(radarContext(state));
    const center = radarCenter(RADAR_VIEWPORT);
    const range = distanceBetween(points[1]!, center);

    expect(points[0]!.x).toBeCloseTo(center.x + range, 9);
    expect(points[0]!.y).toBeCloseTo(center.y, 9);
    expect(points[180]!.x).toBeCloseTo(center.x - range, 9);
    expect(points[180]!.y).toBeCloseTo(center.y, 9);
  });

  it("draws concentric range rings around the ship", () => {
    const context = radarContext(radarState());
    const center = radarCenter(RADAR_VIEWPORT);
    const rings = context
      .callsNamed("arc")
      .filter((call) => Number(call.args[2]) > 2);

    expect(rings.length).toBeGreaterThanOrEqual(2);
    const radii = rings.map((ring) => {
      expect(ring.args[0]).toBeCloseTo(center.x, 9);
      expect(ring.args[1]).toBeCloseTo(center.y, 9);
      expect(ring.args[3]).toBe(0);
      expect(ring.args[4]).toBeCloseTo(Math.PI * 2, 9);
      return Number(ring.args[2]);
    });
    for (let index = 1; index < radii.length; index += 1) {
      expect(radii[index]!).toBeGreaterThan(radii[index - 1]!);
    }
  });

  it.each([
    { name: "start", time: 0, expectedIndex: 0 },
    { name: "quarter phase", time: 0.25, expectedIndex: 90 },
    { name: "half phase", time: 0.5, expectedIndex: 180 },
    { name: "three-quarter phase", time: 0.75, expectedIndex: 270 },
    { name: "full phase", time: 1, expectedIndex: 0 },
    { name: "next cycle", time: 1.25, expectedIndex: 90 },
  ])(
    "sweeps the radar once per second at $name",
    ({ time, expectedIndex }) => {
      const distances = uniformDistances(EYE_SENSOR_RAY_COUNT, RADAR_RADIUS);
      const state = withEye(makeState({ eyeSensorRadius: 120, time }), {
        radius: RADAR_RADIUS,
        tick: 0,
        distances,
      });

      const context = radarContext(state);
      const center = radarCenter(RADAR_VIEWPORT);
      const points = radarScanPoints(context);
      const sweep = longestRay(centerRays(context, center))[1];

      expect(sweep.x).toBeCloseTo(points[expectedIndex]!.x, 9);
      expect(sweep.y).toBeCloseTo(points[expectedIndex]!.y, 9);
    },
  );

  it.each([0, Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI])(
    "points the radar heading marker at the ship heading (%s rad)",
    (heading) => {
      const state = withEye(makeState({ angle: heading }), {
        radius: RADAR_RADIUS,
        tick: 0,
        heading,
        distances: uniformDistances(EYE_SENSOR_RAY_COUNT, RADAR_RADIUS),
      });

      const context = radarContext(state);
      const center = radarCenter(RADAR_VIEWPORT);
      const range = distanceBetween(
        radarScanPoints(context)[1]!,
        center,
      );
      const headingRay = centerRays(context, center).find((ray) => {
        const length = distanceBetween(ray[0], ray[1]);
        return length > 0 && length < range * 0.75;
      });

      expect(headingRay).toBeDefined();
      const tip = headingRay![1];
      const actual = Math.atan2(-(tip.y - center.y), tip.x - center.x);
      const delta = Math.atan2(
        Math.sin(actual - heading),
        Math.cos(actual - heading),
      );

      expect(delta).toBeCloseTo(0, 9);
      expect(distanceBetween(center, tip)).toBeGreaterThan(0);
    },
  );

  it("draws the last scan for a destroyed run without mutating state", () => {
    const state = deepFreeze(
      withEye(
        makeState({
          hull: 0,
          outcome: "destroyed",
          tick: 600,
          eyeSensorRadius: 120,
          position: { x: 30, y: 100 },
        }),
        { radius: 120, tick: 600 },
      ),
    );
    const snapshot = structuredClone(state);

    const context = radarContext(state);

    expect(radarScanPoints(context)).toHaveLength(EYE_SENSOR_RAY_COUNT);
    expect(state).toEqual(snapshot);
  });
});
