import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CurvedWall,
  Field,
  FieldChunk,
  Tunnel,
} from "@moonlander/sim";
import {
  CAMERA_LOOK_AHEAD_X,
  CAMERA_LOOK_AHEAD_Y,
  createCamera,
} from "../src/camera";
import {
  computeSpeedZoom,
  computeViewScale,
  computeViewport,
  createRenderer,
} from "../src/render";
import { installFakeDom, type FakeDom } from "./fake-dom";
import { deepFreeze, makeState } from "./fixtures";

interface FieldFixture {
  field: Field;
  calls: {
    chunksInView: number;
    centerAt: number;
    headingAt: number;
    halfWidthAt: number;
    getChunk: number;
  };
}

function createTestField(): FieldFixture {
  const walls: readonly CurvedWall[] = [
    { id: "ceiling:test", points: [{ x: -100, y: 94 }, { x: 100, y: 94 }] },
    { id: "floor:test", points: [{ x: -100, y: 26 }, { x: 100, y: 26 }] },
  ];
  const chunk: FieldChunk = { coord: { x: 0, y: 0 }, walls };
  const calls = {
    chunksInView: 0,
    centerAt: 0,
    headingAt: 0,
    halfWidthAt: 0,
    getChunk: 0,
  };

  const tunnel: Tunnel = {
    halfWidth: 34,
    halfWidthAt: () => {
      calls.halfWidthAt += 1;
      return 34;
    },
    centerAt: (x) => {
      calls.centerAt += 1;
      return { x, y: 60 };
    },
    headingAt: () => {
      calls.headingAt += 1;
      return 0;
    },
  };

  const field: Field = {
    seed: 1,
    chunkSize: 80,
    tunnel,
    getChunk: (cx, cy) => {
      calls.getChunk += 1;
      return { coord: { x: cx, y: cy }, walls: [] };
    },
    chunksInView: () => {
      calls.chunksInView += 1;
      return [chunk];
    },
  };

  return { field, calls };
}

let dom: FakeDom;

beforeEach(() => {
  dom = installFakeDom({ dpr: 1, width: 800, height: 600 });
});

afterEach(() => {
  dom.restore();
});

describe("render view math", () => {
  it.each([
    { name: "empty viewport", width: 0, height: 0, expected: 1.35 },
    { name: "narrow viewport", width: 320, height: 240, expected: 1.35 },
    { name: "minimum target size", width: 300, height: 170, expected: 1.35 },
    { name: "desktop viewport", width: 800, height: 600, expected: 800 / 300 },
    {
      name: "large desktop viewport",
      width: 1920,
      height: 1080,
      expected: 1080 / 170,
    },
    { name: "oversized viewport", width: 4000, height: 4000, expected: 7 },
  ])("clamps the view scale for a $name", ({ width, height, expected }) => {
    expect(computeViewScale(width, height)).toBeCloseTo(expected, 12);
  });

  it.each([
    {
      name: "DPR 1",
      width: 800,
      height: 600,
      dpr: 1,
      expectedWidth: 800,
      expectedHeight: 600,
      expectedDpr: 1,
      expectedScale: 800 / 300,
    },
    {
      name: "DPR 2",
      width: 800,
      height: 600,
      dpr: 2,
      expectedWidth: 800,
      expectedHeight: 600,
      expectedDpr: 2,
      expectedScale: 800 / 300,
    },
    {
      name: "DPR above the cap",
      width: 800,
      height: 600,
      dpr: 3,
      expectedWidth: 800,
      expectedHeight: 600,
      expectedDpr: 2,
      expectedScale: 800 / 300,
    },
    {
      name: "DPR below the floor",
      width: 800,
      height: 600,
      dpr: 0.5,
      expectedWidth: 800,
      expectedHeight: 600,
      expectedDpr: 1,
      expectedScale: 800 / 300,
    },
    {
      name: "zero DPR",
      width: 800,
      height: 600,
      dpr: 0,
      expectedWidth: 800,
      expectedHeight: 600,
      expectedDpr: 1,
      expectedScale: 800 / 300,
    },
    {
      name: "non-finite DPR",
      width: 800,
      height: 600,
      dpr: Number.NaN,
      expectedWidth: 800,
      expectedHeight: 600,
      expectedDpr: 1,
      expectedScale: 800 / 300,
    },
    {
      name: "zero size",
      width: 0,
      height: 0,
      dpr: 1,
      expectedWidth: 1,
      expectedHeight: 1,
      expectedDpr: 1,
      expectedScale: 1.35,
    },
  ])(
    "builds the viewport for $name",
    ({
      width,
      height,
      dpr,
      expectedWidth,
      expectedHeight,
      expectedDpr,
      expectedScale,
    }) => {
      const viewport = computeViewport(width, height, dpr);

      expect(viewport.width).toBe(expectedWidth);
      expect(viewport.height).toBe(expectedHeight);
      expect(viewport.dpr).toBe(expectedDpr);
      expect(viewport.scale).toBeCloseTo(expectedScale, 12);
    },
  );

  it.each([
    { name: "zero speed", speed: 0, expected: 1 },
    { name: "negative speed", speed: -10, expected: 1 },
    { name: "non-finite speed", speed: Number.NaN, expected: 1 },
    { name: "10 m/s", speed: 10, expected: 0.95 },
    { name: "20 m/s", speed: 20, expected: 0.9 },
    { name: "100 m/s", speed: 100, expected: 0.88 },
    { name: "minimum zoom", speed: 1000, expected: 0.88 },
    { name: "very fast", speed: 1_000_000, expected: 0.88 },
  ])("computes the speed zoom for $name", ({ speed, expected }) => {
    expect(computeSpeedZoom(speed)).toBeCloseTo(expected, 12);
  });
});

describe("renderer device pixel ratio", () => {
  it.each([
    { name: "1", dpr: 1, transformScale: 1, width: 800, height: 600 },
    { name: "2", dpr: 2, transformScale: 2, width: 1600, height: 1200 },
    { name: "above the cap", dpr: 3, transformScale: 2, width: 1600, height: 1200 },
    { name: "below the floor", dpr: 0.5, transformScale: 1, width: 800, height: 600 },
  ])(
    "scales the canvas backing store for DPR $name",
    ({ dpr, transformScale, width, height }) => {
      dom.window.devicePixelRatio = dpr;
      const renderer = createRenderer();

      renderer.resize();

      expect(dom.canvas.width).toBe(width);
      expect(dom.canvas.height).toBe(height);
      expect(dom.ctx.callsNamed("setTransform")).toHaveLength(0);

      renderer.render(makeState(), createTestField().field, createCamera());

      expect(dom.ctx.callsNamed("setTransform")).toEqual([
        {
          name: "setTransform",
          args: [transformScale, 0, 0, transformScale, 0, 0],
        },
      ]);
    },
  );

  it("clamps a zero-size canvas to one CSS pixel before the first render", () => {
    dom.canvas.clientWidth = 0;
    dom.canvas.clientHeight = 0;
    const renderer = createRenderer();

    renderer.resize();

    expect(dom.canvas.width).toBe(1);
    expect(dom.canvas.height).toBe(1);
  });

  it("recomputes the backing store when the canvas is resized", () => {
    const renderer = createRenderer();
    renderer.resize();
    expect(dom.canvas.width).toBe(800);

    dom.canvas.clientWidth = 320;
    dom.canvas.clientHeight = 240;
    dom.window.devicePixelRatio = 2;
    renderer.resize();

    expect(dom.canvas.width).toBe(640);
    expect(dom.canvas.height).toBe(480);
  });
});

describe("renderer state access", () => {
  it("reads simulation and field state without mutating either", () => {
    const state = deepFreeze(
      makeState({ velocity: { x: 12, y: -3 }, time: 0.4 }),
    );
    const fixture = createTestField();
    const field = deepFreeze(fixture.field);
    const snapshot = structuredClone(state);
    const renderer = createRenderer();
    renderer.resize();

    renderer.render(state, field, createCamera());

    expect(state).toEqual(snapshot);
    expect(field.seed).toBe(1);
    expect(field.chunkSize).toBe(80);
    expect(fixture.calls.chunksInView).toBeGreaterThan(0);
    expect(fixture.calls.centerAt).toBeGreaterThan(0);
    expect(fixture.calls.headingAt).toBeGreaterThan(0);
    expect(fixture.calls.halfWidthAt).toBeGreaterThan(0);
    expect(fixture.calls.getChunk).toBe(0);
    expect(dom.ctx.callsNamed("clearRect").length).toBeGreaterThan(0);
    expect(dom.ctx.callsNamed("fill").length).toBeGreaterThan(0);
    expect(dom.ctx.callsNamed("stroke").length).toBeGreaterThan(0);
  });

  it("snaps an unready camera on the first render", () => {
    const state = makeState({
      position: { x: 10, y: 20 },
      velocity: { x: 20, y: 10 },
    });
    const camera = createCamera();
    const renderer = createRenderer();
    renderer.resize();

    renderer.render(state, createTestField().field, camera);

    expect(camera.ready).toBe(true);
    expect(camera.x).toBeCloseTo(10 + 20 * CAMERA_LOOK_AHEAD_X, 12);
    expect(camera.y).toBeCloseTo(20 + 10 * CAMERA_LOOK_AHEAD_Y + 8, 12);
  });

  it("leaves an already-ready camera untouched", () => {
    const camera = { x: -123, y: 456, ready: true };
    const renderer = createRenderer();
    renderer.resize();

    renderer.render(makeState(), createTestField().field, camera);

    expect(camera).toEqual({ x: -123, y: 456, ready: true });
  });

  it("uses an optional sensor renderer hook instead of the default radar", () => {
    const received: { ctx: unknown; camera: unknown; state: unknown }[] = [];
    const renderer = createRenderer({
      sensorRenderer: (ctx, _viewport, camera, state) => {
        received.push({ ctx, camera, state });
      },
    });
    renderer.resize();
    const state = makeState();
    const camera = createCamera();

    renderer.render(state, createTestField().field, camera);

    expect(received).toHaveLength(1);
    expect(received[0]!.ctx).toBe(dom.ctx);
    expect(received[0]!.state).toBe(state);
    expect(received[0]!.camera).toBe(camera);
  });
});

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const EXPECTED_HOOKS = [
  "game-canvas",
  "hud-hull",
  "hud-speed",
  "hud-progress",
  "hud-score",
  "thruster-left",
  "thruster-right",
  "thruster-rear",
  "autopilot-status",
  "instructions",
  "outcome",
  "seed-display",
  "seed-input",
  "seed-load",
  "eye-sensor-panel",
  "eye-sensor-chart",
  "eye-sensor-radius",
  "eye-sensor-radius-value",
  "eye-sensor-scan-tick",
  "direction-needle",
  "direction-value",
  "distance-to-start",
  "velocity-speed",
  "velocity-vx",
  "velocity-vy",
  "velocity-angle",
] as const;

function extractInstructions(source: string): string {
  const match = /<div[^>]*data-testid="instructions"[^>]*>([\s\S]*?)<\/div>/.exec(
    source,
  );
  if (match === null) {
    return "";
  }
  return match[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("static page hooks", () => {
  it.each(EXPECTED_HOOKS)(
    "exposes data-testid=%s exactly once",
    (testId) => {
      const pattern = new RegExp(`data-testid="${testId}"`, "g");
      expect(html.match(pattern) ?? []).toHaveLength(1);
    },
  );

  it.each([
    "hud-altitude",
    "hud-vspeed",
    "hud-hspeed",
    "hud-tilt",
    "hud-fuel",
  ])("does not keep the stale landing hook %s", (testId) => {
    expect(html).not.toContain(`data-testid="${testId}"`);
  });
});

describe("static instructions", () => {
  const instructions = extractInstructions(html);

  it("exists on the page", () => {
    expect(instructions).not.toBe("");
  });

  it.each(["Q", "W", "Space", "E", "R"])(
    "mentions the %s control",
    (control) => {
      expect(instructions).toMatch(new RegExp(`\\b${control}\\b`, "i"));
    },
  );

  it("describes staying inside the tunnel", () => {
    expect(instructions).toMatch(/inside the tunnel/i);
  });

  it("does not describe removed gates", () => {
    expect(instructions).not.toMatch(/gates/i);
  });
});
