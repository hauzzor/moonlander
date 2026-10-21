import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIXED_DT,
  GRAVITY,
  createField,
  type Action,
  type SimState,
  type Simulation,
} from "@moonlander/sim";
import { createGame, type Game, type GameOptions } from "../src/game";
import {
  clampGravityScale,
  clampScale,
  clampThrusterScale,
  clampTimeScale,
  formatGravity,
  formatScale,
  logPositionToScale,
  parseScale,
  quantizeLogPosition,
  scaleToLogPosition,
} from "../src/sim-panel";
import { FakeElement, FakeHTMLInputElement } from "./fake-dom";
import {
  installGameFixture,
  makeState,
  worldFor,
  type GameFixture,
  type GameFixtureOptions,
} from "./fixtures";

let fixture: GameFixture;

function withLevel(fixtureOptions: GameFixtureOptions = {}): GameFixtureOptions {
  const params = new URLSearchParams(
    (fixtureOptions.search ?? "").replace(/^\?/, ""),
  );

  if (!params.has("level")) {
    params.set("level", "sandworm");
  }

  return {
    ...fixtureOptions,
    search: `?${params.toString()}`,
  };
}

function setupGame(
  options: GameOptions = {},
  fixtureOptions: GameFixtureOptions = {},
): Game {
  fixture = installGameFixture(withLevel(fixtureOptions));
  return createGame(options);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fixture?.dom.restore();
});

function readDataValue(element: FakeElement): number {
  const raw = element.getAttribute("data-value");
  expect(raw).not.toBeNull();
  const value = Number(raw);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

function setSlider(slider: FakeHTMLInputElement, value: string | number): void {
  slider.value = String(value);
  slider.dispatch("input", { target: slider });
  slider.dispatch("change", { target: slider });
}

function collapsed(fixtureValue: GameFixture): string | null {
  return (
    fixtureValue.simToggle.getAttribute("data-collapsed") ??
    fixtureValue.simPanel.getAttribute("data-collapsed")
  );
}

function press(target: unknown, key: string, code = ""): void {
  fixture.dom.window.dispatch("keydown", { key, code, target });
}

function scriptedSimulation(state: SimState): Simulation {
  let current = state;
  const world = worldFor(createField(state.seed));

  return {
    get level() {
      return current.level;
    },
    world,
    get field() {
      return createField(state.seed);
    },
    getState: () => current,
    getObservation: () => {
      throw new Error("not used");
    },
    step: (_action: Action): SimState => current,
    reset: (seed?: number): SimState => {
      current = seed === undefined ? current : { ...current, seed };
      return current;
    },
    setEyeSensorRadius: (radius: number): void => {
      current = { ...current, eyeSensorRadius: radius };
    },
    setGravityScale: (scale: number): void => {
      current = {
        ...current,
        gravityScale: scale,
        gravity: GRAVITY * scale,
      };
    },
    setBottomThrusterScale: (scale: number): void => {
      current = { ...current, bottomThrusterScale: scale };
    },
    setRearThrusterScale: (scale: number): void => {
      current = { ...current, rearThrusterScale: scale };
    },
    setTopThrusterScale: (scale: number): void => {
      current = { ...current, topThrusterScale: scale };
    },
  };
}

describe("SIM panel log mapping and formatting", () => {
  it.each([
    { position: -1, expected: 0.1 },
    { position: -0.5, expected: Math.sqrt(0.1) },
    { position: 0, expected: 1 },
    { position: 0.05, expected: 10 ** 0.05 },
    { position: 0.5, expected: Math.sqrt(10) },
    { position: 1, expected: 10 },
    { position: -2, expected: 0.1 },
    { position: 2, expected: 10 },
    { position: Number.NaN, expected: 1 },
  ])("maps log position $position to $expected", ({ position, expected }) => {
    expect(logPositionToScale(position)).toBeCloseTo(expected, 12);
  });

  it.each([
    { scale: 0.1, expected: -1 },
    { scale: 1, expected: 0 },
    { scale: Math.sqrt(10), expected: 0.5 },
    { scale: 10, expected: 1 },
    { scale: 0.01, expected: -1 },
    { scale: 100, expected: 1 },
    { scale: 0, expected: 0 },
    { scale: Number.NaN, expected: 0 },
  ])("maps scale $scale to log position $expected", ({ scale, expected }) => {
    expect(scaleToLogPosition(scale)).toBeCloseTo(expected, 12);
  });

  it.each([
    { position: -0.026, expected: -0.05 },
    { position: 0.026, expected: 0.05 },
    { position: 0.024, expected: 0 },
    { position: 0.074, expected: 0.05 },
    { position: 0.076, expected: 0.1 },
    { position: -0.076, expected: -0.1 },
    { position: 4, expected: 1 },
    { position: Number.NaN, expected: 0 },
  ])(
    "quantizes log position $position to the 0.05 step as $expected",
    ({ position, expected }) => {
      expect(quantizeLogPosition(position)).toBeCloseTo(expected, 12);
    },
  );

  it.each([
    { raw: 2, expected: 2 },
    { raw: 0.5, expected: 0.5 },
    { raw: " 2.5 ", expected: 2.5 },
    { raw: "0.01", expected: 0.1 },
    { raw: "100", expected: 10 },
    { raw: "abc", expected: null },
    { raw: "", expected: null },
    { raw: "   ", expected: null },
    { raw: null, expected: null },
    { raw: undefined, expected: null },
    { raw: Number.NaN, expected: null },
    { raw: Number.POSITIVE_INFINITY, expected: null },
  ])("parses $raw as $expected", ({ raw, expected }) => {
    expect(parseScale(raw)).toBe(expected);
  });

  it.each([
    { value: 0.1, expected: "0.1x" },
    { value: 1, expected: "1x" },
    { value: 10, expected: "10x" },
    { value: Math.sqrt(10), expected: "3.16x" },
    { value: Math.sqrt(0.1), expected: "0.32x" },
  ])("formats scale $value as $expected", ({ value, expected }) => {
    expect(formatScale(value)).toBe(expected);
  });

  it.each([
    { value: 1.62, expected: "1.62 m/s\u00b2" },
    { value: 16.2, expected: "16.2 m/s\u00b2" },
    { value: 0.162, expected: "0.16 m/s\u00b2" },
    { value: Number.NaN, expected: "1.62 m/s\u00b2" },
  ])("formats gravity $value as $expected", ({ value, expected }) => {
    expect(formatGravity(value)).toBe(expected);
  });

  it.each([
    { name: "time", clamp: clampTimeScale, min: 0.1, max: 10 },
    { name: "gravity", clamp: clampGravityScale, min: 0.1, max: 10 },
    { name: "thruster", clamp: clampThrusterScale, min: 0.1, max: 10 },
  ])(
    "clamps $name scales to $min..$max with a 1 fallback",
    ({ clamp, min, max }) => {
      expect(clamp(0)).toBe(min);
      expect(clamp(-100)).toBe(min);
      expect(clamp(1)).toBe(1);
      expect(clamp(100)).toBe(max);
      expect(clamp(Number.NaN)).toBe(1);
      expect(clamp(Number.POSITIVE_INFINITY)).toBe(1);
    },
  );

  it("uses a caller-supplied fallback for non-finite scales", () => {
    expect(clampScale(Number.NaN, 2, 4, 3)).toBe(3);
    expect(clampScale(5, 2, 4, 3)).toBe(4);
    expect(clampScale(1, 2, 4, 3)).toBe(2);
  });
});

describe("SIM panel sliders", () => {
  const sliders = [
    { name: "simulation speed", testId: "sim-speed", valueId: "sim-speed-value" },
    { name: "gravity", testId: "gravity-scale", valueId: "gravity-scale-value" },
    { name: "bottom power", testId: "bottom-power", valueId: "bottom-power-value" },
    { name: "rear power", testId: "rear-power", valueId: "rear-power-value" },
  ] as const;

  it.each(sliders)(
    "renders the $name slider with log bounds and a 1x default",
    ({ testId, valueId }) => {
      setupGame();
      const slider = fixture.dom.document.element(testId) as
        | FakeHTMLInputElement
        | undefined;
      const value = fixture.dom.document.element(valueId);

      expect(slider).toBeInstanceOf(FakeHTMLInputElement);
      expect(slider?.min).toBe("-1");
      expect(slider?.max).toBe("1");
      expect(slider?.step).toBe("0.05");
      expect(slider?.value).toBe("0");
      expect(value).toBeDefined();
      expect(readDataValue(value!)).toBe(1);
    },
  );

  it("shows gravity as both a multiplier and effective m/s²", () => {
    setupGame();
    const value = fixture.gravityScaleValue;

    expect(readDataValue(value)).toBe(1);
    expect(Number(value.getAttribute("data-gravity"))).toBeCloseTo(GRAVITY, 10);
    expect(value.textContent).toContain("1.62");
  });

  it.each([
    { position: -1, expected: 0.1 },
    { position: -0.5, expected: Math.sqrt(0.1) },
    { position: 0, expected: 1 },
    { position: 0.5, expected: Math.sqrt(10) },
    { position: 1, expected: 10 },
  ])(
    "maps log10 slider position $position to scale $expected",
    ({ position, expected }) => {
      const game = setupGame();

      setSlider(fixture.simSpeed, position);

      expect(game.getTimeScale()).toBeCloseTo(expected, 6);

      const raw = fixture.simSpeedValue.getAttribute("data-value");
      expect(raw).not.toBeNull();
      expect(Number(raw)).toBeCloseTo(expected, 2);
    },
  );

  it("formats the speed readout with the scale and an x suffix", () => {
    setupGame();

    setSlider(fixture.simSpeed, -1);
    expect(fixture.simSpeedValue.textContent).toMatch(/0\.1\s*x/i);

    setSlider(fixture.simSpeed, 0);
    expect(fixture.simSpeedValue.textContent).toMatch(/1(?:\.0+)?\s*x/i);

    setSlider(fixture.simSpeed, 1);
    expect(fixture.simSpeedValue.textContent).toMatch(/10(?:\.0+)?\s*x/i);
  });

  it("updates gravity and power readouts from their log sliders", () => {
    const game = setupGame();

    setSlider(fixture.gravityScale, 1);
    setSlider(fixture.bottomPower, -1);
    setSlider(fixture.rearPower, 1);

    expect(game.getState().gravityScale).toBeCloseTo(10, 10);
    expect(game.getState().gravity).toBeCloseTo(16.2, 10);
    expect(game.getState().bottomThrusterScale).toBeCloseTo(0.1, 10);
    expect(game.getState().rearThrusterScale).toBeCloseTo(10, 10);

    expect(readDataValue(fixture.gravityScaleValue)).toBeCloseTo(10, 6);
    expect(
      Number(fixture.gravityScaleValue.getAttribute("data-gravity")),
    ).toBeCloseTo(16.2, 10);
    expect(fixture.gravityScaleValue.textContent).toContain("16.2");
    expect(readDataValue(fixture.bottomPowerValue)).toBeCloseTo(0.1, 6);
    expect(readDataValue(fixture.rearPowerValue)).toBeCloseTo(10, 6);
  });

  it("applies settings live through the simulation setters", () => {
    const game = setupGame();

    setSlider(fixture.gravityScale, 0.5);
    setSlider(fixture.bottomPower, 0.5);
    setSlider(fixture.rearPower, -0.5);

    expect(game.getState().gravityScale).toBeCloseTo(Math.sqrt(10), 6);
    expect(game.getState().bottomThrusterScale).toBeCloseTo(
      Math.sqrt(10),
      6,
    );
    expect(game.getState().rearThrusterScale).toBeCloseTo(
      Math.sqrt(0.1),
      6,
    );
  });

  it("clamps slider positions outside the documented range", () => {
    const game = setupGame();

    setSlider(fixture.simSpeed, 2);
    expect(game.getTimeScale()).toBe(10);

    setSlider(fixture.simSpeed, -2);
    expect(game.getTimeScale()).toBe(0.1);

    setSlider(fixture.gravityScale, -4);
    expect(game.getState().gravityScale).toBe(0.1);

    setSlider(fixture.bottomPower, 4);
    expect(game.getState().bottomThrusterScale).toBe(10);
  });
});

describe("SIM panel collapse", () => {
  it("starts expanded and toggles aria-expanded and data-collapsed", () => {
    setupGame();

    expect(fixture.simToggle.getAttribute("aria-expanded")).toBe("true");
    expect(collapsed(fixture)).toBe("false");

    fixture.simToggle.dispatch("click");

    expect(fixture.simToggle.getAttribute("aria-expanded")).toBe("false");
    expect(collapsed(fixture)).toBe("true");

    fixture.simToggle.dispatch("click");

    expect(fixture.simToggle.getAttribute("aria-expanded")).toBe("true");
    expect(collapsed(fixture)).toBe("false");
  });

  it("stays visible in manual and autopilot", () => {
    setupGame();

    expect(fixture.simPanel.classList.contains("hidden")).toBe(false);

    press(fixture.dom.window, "e");
    expect(fixture.simPanel.classList.contains("hidden")).toBe(false);
  });
});

describe("SIM panel persistence", () => {
  function expectScales(
    game: Game,
    expected: {
      speed: number;
      gravity: number;
      bottom: number;
      rear: number;
    },
  ): void {
    const state = game.getState();

    expect(game.getTimeScale()).toBeCloseTo(expected.speed, 6);
    expect(state.gravityScale).toBeCloseTo(expected.gravity, 6);
    expect(state.gravity).toBeCloseTo(GRAVITY * expected.gravity, 6);
    expect(state.bottomThrusterScale).toBeCloseTo(expected.bottom, 6);
    expect(state.rearThrusterScale).toBeCloseTo(expected.rear, 6);
  }

  it("loads defaults when URL and storage are empty", () => {
    const game = setupGame();

    expectScales(game, { speed: 1, gravity: 1, bottom: 1, rear: 1 });
  });

  it("loads all four settings from the URL", () => {
    const game = setupGame(
      {},
      { search: "?speed=2&gravity=3&bottomPower=4&rearPower=5" },
    );

    expectScales(game, { speed: 2, gravity: 3, bottom: 4, rear: 5 });
  });

  it("loads all four settings from localStorage", () => {
    const game = setupGame(
      {},
      {
        storage: {
          "moonlander.speed": "3",
          "moonlander.gravity": "4",
          "moonlander.bottomPower": "5",
          "moonlander.rearPower": "6",
        },
      },
    );

    expectScales(game, { speed: 3, gravity: 4, bottom: 5, rear: 6 });
  });

  it("prefers URL values over localStorage values for the same key", () => {
    const game = setupGame(
      {},
      {
        search: "?speed=2&gravity=0.5",
        storage: {
          "moonlander.speed": "3",
          "moonlander.gravity": "4",
          "moonlander.bottomPower": "5",
          "moonlander.rearPower": "6",
        },
      },
    );

    expectScales(game, { speed: 2, gravity: 0.5, bottom: 5, rear: 6 });
  });

  it("positions each slider from the loaded scale", () => {
    setupGame(
      {},
      { search: "?speed=2&gravity=0.1&bottomPower=10&rearPower=1" },
    );

    expect(Number(fixture.simSpeed.value)).toBeCloseTo(Math.log10(2), 2);
    expect(Number(fixture.gravityScale.value)).toBeCloseTo(-1, 2);
    expect(Number(fixture.bottomPower.value)).toBeCloseTo(1, 2);
    expect(Number(fixture.rearPower.value)).toBeCloseTo(0, 2);
  });

  it.each([
    {
      name: "text values",
      search: "?speed=abc&gravity=nope&bottomPower=x&rearPower=",
      expected: { speed: 1, gravity: 1, bottom: 1, rear: 1 },
    },
    {
      name: "out-of-range values",
      search: "?speed=100&gravity=0&bottomPower=-3&rearPower=1000",
      expected: { speed: 10, gravity: 0.1, bottom: 0.1, rear: 10 },
    },
    {
      name: "mixed valid and invalid values",
      search: "?speed=4&gravity=-1",
      expected: { speed: 4, gravity: 0.1, bottom: 1, rear: 1 },
    },
  ])("handles $name in the URL", ({ search, expected }) => {
    const game = setupGame({}, { search });

    expectScales(game, expected);
  });

  it.each([
    {
      name: "malformed values",
      storage: {
        "moonlander.speed": "fast",
        "moonlander.gravity": "",
        "moonlander.bottomPower": "NaN",
        "moonlander.rearPower": "boom",
      },
      expected: { speed: 1, gravity: 1, bottom: 1, rear: 1 },
    },
    {
      name: "out-of-range values",
      storage: {
        "moonlander.speed": "0",
        "moonlander.gravity": "100",
        "moonlander.bottomPower": "-4",
        "moonlander.rearPower": "0.001",
      },
      expected: { speed: 0.1, gravity: 10, bottom: 0.1, rear: 0.1 },
    },
  ])("handles $name in localStorage", ({ storage, expected }) => {
    const game = setupGame({}, { storage });

    expectScales(game, expected);
  });

  it("falls back to defaults when localStorage access throws", () => {
    fixture = installGameFixture({ search: "?level=sandworm&seed=1" });
    vi.spyOn(fixture.dom.window.localStorage, "getItem").mockImplementation(
      () => {
        throw new Error("storage blocked");
      },
    );

    const game = createGame();

    expectScales(game, { speed: 1, gravity: 1, bottom: 1, rear: 1 });
  });

  it("keeps working when localStorage writes throw", () => {
    const game = setupGame();
    vi.spyOn(fixture.dom.window.localStorage, "setItem").mockImplementation(
      () => {
        throw new Error("quota exceeded");
      },
    );

    expect(() => {
      setSlider(fixture.simSpeed, 1);
    }).not.toThrow();

    expect(game.getTimeScale()).toBe(10);
  });

  it("persists every setting across R, seed loads, and autopilot toggles", () => {
    const game = setupGame();

    setSlider(fixture.simSpeed, 1);
    setSlider(fixture.gravityScale, 0.5);
    setSlider(fixture.bottomPower, -0.5);
    setSlider(fixture.rearPower, 0.5);

    const expected = {
      speed: 10,
      gravity: Math.sqrt(10),
      bottom: Math.sqrt(0.1),
      rear: Math.sqrt(10),
    };

    const seedBefore = game.getSeed();
    press(fixture.dom.window, "r");
    expect(game.getSeed()).not.toBe(seedBefore);
    expectScales(game, expected);

    game.loadSeed(1234);
    expectScales(game, expected);

    press(fixture.dom.window, "e");
    expect(game.isAutopilotActive()).toBe(true);
    expectScales(game, expected);

    expect(Number(fixture.simSpeed.value)).toBeCloseTo(1, 6);
    expect(readDataValue(fixture.simSpeedValue)).toBeCloseTo(10, 6);
  });

  it("writes changes to localStorage and the URL", () => {
    setupGame();

    setSlider(fixture.simSpeed, 1);
    setSlider(fixture.gravityScale, 0.5);
    setSlider(fixture.bottomPower, -1);
    setSlider(fixture.rearPower, 0.5);

    expect(
      Number(fixture.dom.window.localStorage.getItem("moonlander.speed")),
    ).toBeCloseTo(10, 6);
    expect(
      Number(fixture.dom.window.localStorage.getItem("moonlander.gravity")),
    ).toBeCloseTo(Math.sqrt(10), 6);
    expect(
      Number(
        fixture.dom.window.localStorage.getItem("moonlander.bottomPower"),
      ),
    ).toBeCloseTo(0.1, 6);
    expect(
      Number(fixture.dom.window.localStorage.getItem("moonlander.rearPower")),
    ).toBeCloseTo(Math.sqrt(10), 6);

    const calls = fixture.dom.window.history.replaceStateCalls;
    expect(calls.length).toBeGreaterThan(0);
    const lastUrl = calls.at(-1)?.url;
    expect(lastUrl).not.toBeNull();
    expect(lastUrl).toContain("speed=");
    expect(lastUrl).toContain("gravity=");
    expect(lastUrl).toContain("bottomPower=");
    expect(lastUrl).toContain("rearPower=");
    expect(fixture.dom.window.location.search).toContain("speed=");
  });
});

describe("simulation status hook", () => {
  it("reports the initial tick, time, and scales", () => {
    setupGame();
    const status = fixture.simulationStatus;

    expect(status.getAttribute("data-tick")).toBe("0");
    expect(status.getAttribute("data-time")).toBe("0");
    expect(status.getAttribute("data-time-scale")).toBe("1");
    expect(status.getAttribute("data-gravity-scale")).toBe("1");
    expect(Number(status.getAttribute("data-gravity"))).toBeCloseTo(
      GRAVITY,
      10,
    );
    expect(status.getAttribute("data-bottom-power")).toBe("1");
    expect(status.getAttribute("data-rear-power")).toBe("1");
  });

  it("reports live changes after advancing and rendering", () => {
    const game = setupGame();

    setSlider(fixture.simSpeed, 1);
    setSlider(fixture.gravityScale, 1);
    setSlider(fixture.bottomPower, -1);
    setSlider(fixture.rearPower, 0.5);

    expect(game.advance(0.001)).toBe(1);
    game.render();

    const status = fixture.simulationStatus;
    expect(status.getAttribute("data-tick")).toBe("1");
    expect(Number(status.getAttribute("data-time"))).toBeCloseTo(
      FIXED_DT,
      10,
    );
    expect(status.getAttribute("data-time-scale")).toBe("10");
    expect(status.getAttribute("data-gravity-scale")).toBe("10");
    expect(Number(status.getAttribute("data-gravity"))).toBeCloseTo(
      GRAVITY * 10,
      10,
    );
    expect(Number(status.getAttribute("data-bottom-power"))).toBeCloseTo(
      0.1,
      10,
    );
    expect(Number(status.getAttribute("data-rear-power"))).toBeCloseTo(
      Math.sqrt(10),
      6,
    );
  });

  it("reports scales for a destroyed run", () => {
    const state = makeState({
      hull: 0,
      outcome: "destroyed",
      tick: 240,
      time: 2,
      gravityScale: 2,
      bottomThrusterScale: 3,
      rearThrusterScale: 4,
    });
    fixture = installGameFixture({ search: "?level=sandworm&seed=1" });
    createGame({ simulation: scriptedSimulation(state) });

    const status = fixture.simulationStatus;
    expect(status.getAttribute("data-tick")).toBe("240");
    expect(status.getAttribute("data-time")).toBe("2");
    expect(status.getAttribute("data-gravity-scale")).toBe("2");
    expect(Number(status.getAttribute("data-gravity"))).toBeCloseTo(
      GRAVITY * 2,
      10,
    );
    expect(status.getAttribute("data-bottom-power")).toBe("3");
    expect(status.getAttribute("data-rear-power")).toBe("4");
  });
});

describe("SIM panel input guard", () => {
  it.each([
    { name: "sim speed", testId: "sim-speed" },
    { name: "gravity", testId: "gravity-scale" },
    { name: "bottom power", testId: "bottom-power" },
    { name: "rear power", testId: "rear-power" },
  ])("ignores Q, W, Space, E, and R while the $name slider is focused", ({ testId }) => {
    const game = setupGame();
    const slider = fixture.dom.document.element(testId) as
      | FakeHTMLInputElement
      | undefined;
    if (slider === undefined) {
      throw new Error(`Missing ${testId}`);
    }

    slider.focus();
    const seedBefore = game.getSeed();

    press(slider, "q");
    press(slider, "w", "KeyW");
    press(slider, " ", "Space");
    press(slider, "e", "KeyE");
    press(slider, "r", "KeyR");

    expect(game.input.keys).toEqual({
      left: false,
      right: false,
      rear: false,
    });
    expect(game.isAutopilotActive()).toBe(false);
    expect(game.getSeed()).toBe(seedBefore);
  });

  it("keeps the sensor radius slider pass-through behavior", () => {
    const game = setupGame();
    const slider = fixture.slider;
    slider.focus();

    press(slider, "q", "KeyQ");
    expect(game.input.keys.left).toBe(true);

    fixture.dom.window.dispatch("keyup", {
      key: "q",
      code: "KeyQ",
      target: slider,
    });
    expect(game.input.keys.left).toBe(false);

    press(slider, " ", "Space");
    expect(game.input.keys.rear).toBe(true);

    press(slider, "e", "KeyE");
    expect(game.isAutopilotActive()).toBe(true);
    expect(game.input.keys.rear).toBe(false);

    const seedBefore = game.getSeed();
    press(slider, "r", "KeyR");
    expect(game.getSeed()).not.toBe(seedBefore);
  });
});
