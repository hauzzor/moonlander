import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIXED_DT,
  GRAVITY,
  createField,
  type Action,
  type Controller,
  type Field,
  type Observation,
  type SimState,
  type Simulation,
} from "@moonlander/sim";
import {
  MAX_FRAME_SECONDS,
  MAX_STEPS_PER_FRAME,
  advanceAccumulator,
  createGame,
  startGame,
  type Game,
  type GameOptions,
} from "../src/game";
import { nextSeed } from "../src/seed";
import { FakeElement, FakeHTMLInputElement } from "./fake-dom";
import {
  deepFreeze,
  installGameFixture,
  makeState,
  type GameFixture,
} from "./fixtures";

interface ScriptedSimulation {
  simulation: Simulation;
  reset: ReturnType<typeof vi.fn>;
  step: ReturnType<typeof vi.fn>;
  setResetState(reset: (seed?: number) => SimState): void;
}

function observationFor(state: SimState): Observation {
  return {
    x: state.ship.position.x,
    y: state.ship.position.y,
    vx: state.ship.velocity.x,
    vy: state.ship.velocity.y,
    angle: state.ship.angle,
    angularVelocity: state.ship.angularVelocity,
    hull: state.hull,
    progress: state.progress,
    score: state.score,
    nearestWallDistance: 100,
    tunnelCenterOffset: 0,
    tunnelHalfWidth: 34,
    tunnelHeading: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    eyeSensorRadius: state.eyeSensorRadius,
    gravityScale: state.gravityScale,
    gravity: state.gravity,
    bottomThrusterScale: state.bottomThrusterScale,
    rearThrusterScale: state.rearThrusterScale,
    sensors: state.sensors,
  };
}

function createScriptedSimulation(
  initial: SimState,
  field: Field,
): ScriptedSimulation {
  let state = initial;
  let resetState: ((seed?: number) => SimState) | null = null;

  const reset = vi.fn((seed?: number): SimState => {
    if (resetState !== null) {
      state = resetState(seed);
    }
    return state;
  });
  const step = vi.fn((_action: Action): SimState => state);

  return {
    simulation: {
      get field(): Field {
        return field;
      },
      getState: () => state,
      getObservation: () => observationFor(state),
      step,
      reset,
      setEyeSensorRadius: (radius: number): void => {
        state = { ...state, eyeSensorRadius: radius };
      },
      setGravityScale: (scale: number): void => {
        state = {
          ...state,
          gravityScale: scale,
          gravity: GRAVITY * scale,
        };
      },
      setBottomThrusterScale: (scale: number): void => {
        state = { ...state, bottomThrusterScale: scale };
      },
      setRearThrusterScale: (scale: number): void => {
        state = { ...state, rearThrusterScale: scale };
      },
    },
    reset,
    step,
    setResetState(resetImplementation: (seed?: number) => SimState): void {
      resetState = resetImplementation;
    },
  };
}

let fixture: GameFixture;

function setupGame(options: GameOptions = {}, search = ""): Game {
  fixture = installGameFixture({ search });
  return createGame(options);
}

function testId(id: string): FakeElement {
  const element = fixture.dom.document.element(id);

  if (element === undefined) {
    throw new Error(`Missing test fixture element ${id}`);
  }

  return element;
}

function press(key: string): void {
  fixture.dom.window.dispatch("keydown", {
    key,
    target: fixture.dom.window,
  });
}

function pressSpace(repeat = false): void {
  fixture.dom.window.dispatch("keydown", {
    code: "Space",
    key: " ",
    repeat,
    target: fixture.dom.window,
  });
}

function advanceTicks(game: Game, count = 1): number {
  let steps = 0;

  for (let index = 0; index < count; index += 1) {
    steps += game.advance(FIXED_DT + 1e-9);
  }

  return steps;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fixture?.dom.restore();
});

describe("advanceAccumulator", () => {
  const cases: {
    name: string;
    accumulator: number;
    elapsed: number;
    steps: number;
    remaining: number;
  }[] = [
    {
      name: "no elapsed time",
      accumulator: 0,
      elapsed: 0,
      steps: 0,
      remaining: 0,
    },
    {
      name: "a partial step",
      accumulator: 0,
      elapsed: FIXED_DT / 2,
      steps: 0,
      remaining: FIXED_DT / 2,
    },
    {
      name: "a completed step from a remainder",
      accumulator: FIXED_DT / 2,
      elapsed: FIXED_DT / 2,
      steps: 1,
      remaining: 0,
    },
    {
      name: "exactly two steps",
      accumulator: 0,
      elapsed: FIXED_DT * 2,
      steps: 2,
      remaining: 0,
    },
    {
      name: "two steps and a remainder",
      accumulator: 0,
      elapsed: FIXED_DT * 2.5,
      steps: 2,
      remaining: FIXED_DT / 2,
    },
    {
      name: "an existing partial step",
      accumulator: FIXED_DT / 4,
      elapsed: FIXED_DT * 0.75,
      steps: 1,
      remaining: 0,
    },
    {
      name: "a negative elapsed time",
      accumulator: FIXED_DT / 2,
      elapsed: -FIXED_DT,
      steps: 0,
      remaining: FIXED_DT / 2,
    },
    {
      name: "a negative accumulator",
      accumulator: -FIXED_DT,
      elapsed: FIXED_DT,
      steps: 1,
      remaining: 0,
    },
    {
      name: "non-finite inputs",
      accumulator: Infinity,
      elapsed: Number.NaN,
      steps: 0,
      remaining: 0,
    },
  ];

  it.each(cases)(
    "advances $name",
    ({ accumulator, elapsed, steps, remaining }) => {
      const result = advanceAccumulator(accumulator, elapsed);

      expect(result.steps).toBe(steps);
      expect(result.accumulator).toBeCloseTo(remaining, 12);
    },
  );

  it("never exceeds the per-frame step cap and flushes the accumulator", () => {
    const result = advanceAccumulator(
      0,
      MAX_FRAME_SECONDS * 10,
      FIXED_DT,
      MAX_STEPS_PER_FRAME,
    );

    expect(result.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(result.accumulator).toBe(0);
  });

  it("caps the default run to MAX_STEPS_PER_FRAME", () => {
    const result = advanceAccumulator(0, 10);

    expect(result.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(result.accumulator).toBe(0);
  });

  it.each([
    { name: "a zero step", step: 0 },
    { name: "a negative step", step: -1 },
    { name: "a non-finite step", step: Number.NaN },
  ])("falls back to the fixed step for $name", ({ step }) => {
    const result = advanceAccumulator(0, FIXED_DT * 2 + 1e-9, step);

    expect(result.steps).toBe(2);
    expect(result.accumulator).toBeCloseTo(1e-9, 12);
  });

  it.each([
    { name: "zero", maxSteps: 0 },
    { name: "negative", maxSteps: -5 },
    { name: "non-finite", maxSteps: Number.POSITIVE_INFINITY },
  ])(
    "falls back to the default cap for a $name maxSteps",
    ({ maxSteps }) => {
      const result = advanceAccumulator(
        0,
        FIXED_DT * 3 + 1e-9,
        FIXED_DT,
        maxSteps,
      );

      expect(result.steps).toBe(3);
    },
  );
});

describe("fixed-step game loop", () => {
  it("advances the game simulation in fixed 1/120 second steps", () => {
    const game = setupGame();

    expect(game.getState().tick).toBe(0);

    expect(game.advance(FIXED_DT * 0.25)).toBe(0);
    expect(game.getState().tick).toBe(0);

    expect(game.advance(FIXED_DT * 0.75)).toBe(1);
    expect(game.getState().tick).toBe(1);

    expect(game.advance(FIXED_DT * 2 + 1e-9)).toBe(2);
    expect(game.getState().tick).toBe(3);

    expect(game.advance(FIXED_DT * 0.5)).toBe(0);
    expect(game.advance(FIXED_DT * 0.5)).toBe(1);
    expect(game.getState().tick).toBe(4);
  });

  it.each([
    {
      name: "restart",
      reset: (game: Game): void => {
        game.restart();
      },
    },
    {
      name: "seed load",
      reset: (game: Game): void => {
        game.loadSeed(42);
      },
    },
    {
      name: "R key",
      reset: (): void => {
        press("r");
      },
    },
    {
      name: "seed control",
      reset: (): void => {
        fixture.seedInput.value = "42";
        fixture.seedLoad.dispatch("click");
      },
    },
  ])("resets the accumulator on $name", (testCase) => {
    const game = setupGame();

    expect(game.advance(FIXED_DT * 0.5)).toBe(0);
    expect(game.getState().tick).toBe(0);

    testCase.reset(game);

    expect(game.advance(FIXED_DT * 0.5)).toBe(0);
    expect(game.getState().tick).toBe(0);

    expect(game.advance(FIXED_DT * 0.5)).toBe(1);
    expect(game.getState().tick).toBe(1);
  });

  it("clamps long frames and starts and stops the loop", () => {
    fixture = installGameFixture();
    const loop: { frame: ((time: number) => void) | null } = { frame: null };
    const cancelFrame = vi.fn();

    const game = startGame({
      now: () => 0,
      requestFrame: (frame) => {
        loop.frame = frame;
        return 7;
      },
      cancelFrame,
    });

    const frame = loop.frame;
    expect(frame).not.toBeNull();

    if (frame === null) {
      throw new Error("startGame did not request an animation frame");
    }

    frame(MAX_FRAME_SECONDS * 1000 * 4);

    expect(game.getState().tick).toBe(Math.round(MAX_FRAME_SECONDS / FIXED_DT));

    game.dispose();
    expect(cancelFrame).toHaveBeenCalledWith(7);
  });
});

describe("manual controls", () => {
  const cases: {
    name: string;
    keys: string[];
    expected: Action;
  }[] = [
    {
      name: "Q",
      keys: ["q"],
      expected: { left: true, right: false, rear: false },
    },
    {
      name: "W",
      keys: ["w"],
      expected: { left: false, right: true, rear: false },
    },
    {
      name: "Q and W together",
      keys: ["q", "w"],
      expected: { left: true, right: true, rear: false },
    },
  ];

  it.each(cases)(
    "maps $name onto the stepped simulation action",
    ({ keys, expected }) => {
      const game = setupGame();

      for (const key of keys) {
        press(key);
      }

      expect(advanceTicks(game)).toBe(1);
      expect(game.getState().thrusters).toEqual(expected);
    },
  );

  it("ignores control keys typed into the seed input", () => {
    const game = setupGame();

    const q = fixture.dom.window.dispatch("keydown", {
      key: "q",
      target: fixture.seedInput,
    });
    const space = fixture.dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: fixture.seedInput,
    });

    expect(q.defaultPrevented).toBe(false);
    expect(space.defaultPrevented).toBe(false);

    advanceTicks(game);

    expect(game.getState().thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
    });
  });

  it("keeps Q and W continuous while held and releases on keyup", () => {
    const game = setupGame();

    press("q");
    advanceTicks(game);
    expect(game.getState().thrusters).toEqual({
      left: true,
      right: false,
      rear: false,
    });

    advanceTicks(game);
    expect(game.getState().thrusters).toEqual({
      left: true,
      right: false,
      rear: false,
    });

    fixture.dom.window.dispatch("keyup", {
      key: "q",
      target: fixture.dom.window,
    });
    advanceTicks(game);
    expect(game.getState().thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
    });
  });

  it("latches Space on press and toggles it off on the next press", () => {
    const game = setupGame();

    pressSpace();
    advanceTicks(game);
    expect(game.getState().thrusters.rear).toBe(true);

    pressSpace();
    advanceTicks(game);
    expect(game.getState().thrusters.rear).toBe(false);
  });

  it("ignores auto-repeated Space while the rear latch is on", () => {
    const game = setupGame();

    pressSpace();
    advanceTicks(game);
    pressSpace(true);
    advanceTicks(game);

    expect(game.getState().thrusters.rear).toBe(true);
  });

  it.each([
    {
      name: "window blur",
      trigger: (): void => {
        fixture.dom.window.dispatch("blur");
      },
    },
    {
      name: "page hide",
      trigger: (): void => {
        fixture.dom.window.dispatch("pagehide");
      },
    },
    {
      name: "a hidden document",
      trigger: (): void => {
        fixture.dom.document.hidden = true;
        fixture.dom.document.dispatch("visibilitychange");
      },
    },
    {
      name: "R restart",
      trigger: (): void => {
        press("r");
      },
    },
  ])("resets the rear latch on $name", (testCase) => {
    const game = setupGame();

    pressSpace();
    advanceTicks(game);
    expect(game.getState().thrusters.rear).toBe(true);

    testCase.trigger();
    advanceTicks(game);

    expect(game.getState().thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
    });
  });
});

describe("autopilot wiring", () => {
  function setupAutopilot(): {
    game: Game;
    act: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    action: Action;
  } {
    const action: Action = { left: false, right: true, rear: false };
    const act = vi.fn((_observation: Observation) => action);
    const reset = vi.fn();
    const controller: Controller = { act, reset };

    return {
      game: setupGame({ autopilotFactory: () => controller }),
      act,
      reset,
      action,
    };
  }

  it("lets the autopilot own every thruster and ignores manual input", () => {
    const { game, act, reset, action } = setupAutopilot();

    press("e");

    expect(game.isAutopilotActive()).toBe(true);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(testId("autopilot-status").getAttribute("data-active")).toBe(
      "true",
    );
    expect(
      testId("autopilot-status").querySelector(".autopilot-value")
        ?.textContent,
    ).toBe("AUTOPILOT");

    expect(advanceTicks(game)).toBe(1);
    expect(act).toHaveBeenCalledTimes(1);
    expect(game.getState().thrusters).toEqual(action);

    const observation = act.mock.calls[0]?.[0] as Observation;
    expect(observation.x).toBe(0);
    expect(observation.y).toBe(60);
    expect(observation.sensors.eye.distances).toHaveLength(360);
    expect(Number.isFinite(observation.nearestWallDistance)).toBe(true);

    press("q");
    pressSpace();
    advanceTicks(game);

    expect(act).toHaveBeenCalledTimes(2);
    expect(game.getState().thrusters).toEqual(action);

    press("e");

    expect(game.isAutopilotActive()).toBe(false);
    expect(testId("autopilot-status").getAttribute("data-active")).toBe(
      "false",
    );
    expect(
      testId("autopilot-status").querySelector(".autopilot-value")
        ?.textContent,
    ).toBe("MANUAL");

    advanceTicks(game);
    expect(act).toHaveBeenCalledTimes(2);
    expect(game.getState().thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
    });

    press("w");
    advanceTicks(game);
    expect(game.getState().thrusters).toEqual({
      left: false,
      right: true,
      rear: false,
    });
  });

  it("resets the autopilot controller and keeps the mode on R", () => {
    const { game, act, reset } = setupAutopilot();

    press("e");
    expect(reset).toHaveBeenCalledTimes(1);
    advanceTicks(game);
    expect(act).toHaveBeenCalledTimes(1);

    const seedBefore = game.getSeed();
    press("r");

    expect(reset).toHaveBeenCalledTimes(2);
    expect(game.getSeed()).toBe(nextSeed(seedBefore));
    expect(game.isAutopilotActive()).toBe(true);
    expect(testId("autopilot-status").getAttribute("data-active")).toBe(
      "true",
    );

    advanceTicks(game);
    expect(act).toHaveBeenCalledTimes(2);
  });

  it("does not step or call the autopilot after destruction", () => {
    const field = createField(11);
    const scripted = createScriptedSimulation(
      makeState({ seed: 11, hull: 0, outcome: "destroyed" }),
      field,
    );
    const act = vi.fn((): Action => ({
      left: true,
      right: true,
      rear: true,
    }));
    const game = setupGame({
      simulation: scripted.simulation,
      autopilotFactory: () => ({ act }),
    });

    press("e");
    expect(game.isAutopilotActive()).toBe(true);

    game.advance(FIXED_DT + 1e-9);

    expect(scripted.step).not.toHaveBeenCalled();
    expect(act).not.toHaveBeenCalled();
    expect(game.getState().tick).toBe(0);
  });
});

describe("seed controls", () => {
  it.each([
    { name: "a valid seed", search: "?seed=42", expected: 42 },
    { name: "zero", search: "?seed=0", expected: 0 },
    {
      name: "the maximum unsigned seed",
      search: "?seed=4294967295",
      expected: 4294967295,
    },
    { name: "an invalid seed", search: "?seed=nope", expected: 1 },
    {
      name: "an out-of-range seed",
      search: "?seed=4294967296",
      expected: 1,
    },
    { name: "no seed query", search: "", expected: 1 },
  ])("reads $name from the URL", ({ search, expected }) => {
    const game = setupGame({}, search);

    expect(game.getSeed()).toBe(expected);
    expect(game.getState().seed).toBe(expected);
    expect(testId("seed-display").textContent).toBe(String(expected));
    expect(fixture.seedInput.value).toBe(String(expected));
  });

  it("ignores an invalid seed passed in options", () => {
    const game = setupGame({ seed: 4294967296 });

    expect(game.getSeed()).toBe(1);
  });

  it("starts a new deterministic run on R", () => {
    const game = setupGame({}, "?seed=42");

    press("r");

    const expectedSeed = nextSeed(42);
    expect(game.getSeed()).toBe(expectedSeed);
    expect(game.getState().seed).toBe(expectedSeed);
    expect(game.getState().tick).toBe(0);
    expect(testId("seed-display").textContent).toBe(String(expectedSeed));
    expect(fixture.seedInput.value).toBe(String(expectedSeed));

    press("r");
    expect(game.getSeed()).toBe(nextSeed(expectedSeed));
  });

  it.each([
    { raw: "0", expected: 0 },
    { raw: "42", expected: 42 },
    { raw: "4294967295", expected: 4294967295 },
  ])("loads seed $raw through the seed control", ({ raw, expected }) => {
    const game = setupGame();
    const reset = vi.spyOn(game.simulation, "reset");

    fixture.seedInput.value = raw;
    fixture.seedLoad.dispatch("click");

    expect(reset).toHaveBeenCalledWith(expected);
    expect(game.getSeed()).toBe(expected);
    expect(game.getState().seed).toBe(expected);
    expect(game.getState().tick).toBe(0);
    expect(testId("seed-display").textContent).toBe(String(expected));
    expect(fixture.seedInput.value).toBe(String(expected));
    expect(fixture.chart.getAttribute("data-scan-tick")).toBe("0");
  });

  it("loads the seed from the input on Enter", () => {
    const game = setupGame();
    const reset = vi.spyOn(game.simulation, "reset");

    fixture.seedInput.value = "1234";
    const event = fixture.seedInput.dispatch("keydown", {
      key: "Enter",
      target: fixture.seedInput,
    });

    expect(event.defaultPrevented).toBe(true);
    expect(reset).toHaveBeenCalledWith(1234);
    expect(game.getSeed()).toBe(1234);
  });

  it.each([
    { raw: "" },
    { raw: "nope" },
    { raw: "-1" },
    { raw: "1.5" },
    { raw: "4294967296" },
  ])("rejects invalid seed input $raw without resetting", ({ raw }) => {
    const game = setupGame({}, "?seed=7");
    const reset = vi.spyOn(game.simulation, "reset");

    fixture.seedInput.value = raw;
    fixture.seedLoad.dispatch("click");

    expect(reset).not.toHaveBeenCalled();
    expect(game.getSeed()).toBe(7);
    expect(fixture.seedInput.getAttribute("aria-invalid")).toBe("true");
    expect(fixture.seedInput.classList.contains("invalid")).toBe(true);
    expect(testId("seed-display").textContent).toBe("7");

    fixture.seedInput.dispatch("input", { target: fixture.seedInput });

    expect(fixture.seedInput.hasAttribute("aria-invalid")).toBe(false);
    expect(fixture.seedInput.classList.contains("invalid")).toBe(false);
  });

  it("copies the current seed to the clipboard", async () => {
    setupGame({}, "?seed=42");
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.useFakeTimers();

    fixture.seedCopy.dispatch("click");
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("42");
    expect(fixture.seedCopy.textContent).toBe("COPIED");

    vi.advanceTimersByTime(1200);
    expect(fixture.seedCopy.textContent).toBe("COPY");
  });

  it("keeps the COPY label when the clipboard write fails", async () => {
    setupGame();
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(() => Promise.reject(new Error("denied"))),
      },
    });

    fixture.seedCopy.dispatch("click");
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.seedCopy.textContent).toBe("COPY");
  });
});

describe("HUD, sensor console, and destroyed overlay wiring", () => {
  it("drives the documented hooks from the initial simulation state", () => {
    setupGame();

    expect(testId("hud-hull").getAttribute("data-value")).toBe("100");
    expect(testId("hud-speed").getAttribute("data-value")).toBe("0");
    expect(testId("hud-progress").getAttribute("data-value")).toBe("0");
    expect(testId("hud-score").getAttribute("data-value")).toBe("0");
    expect(testId("seed-display").textContent).toBe("1");
    expect(fixture.seedInput.value).toBe("1");

    expect(testId("autopilot-status").getAttribute("data-active")).toBe(
      "false",
    );
    expect(
      testId("autopilot-status").querySelector(".autopilot-value")
        ?.textContent,
    ).toBe("MANUAL");

    expect(testId("eye-sensor-panel").getAttribute("data-visible")).toBe(
      "false",
    );
    expect(testId("eye-sensor-panel").hasAttribute("hidden")).toBe(true);
    expect(testId("radar-status").getAttribute("data-active")).toBe("false");

    expect(fixture.chart.getAttribute("data-scan-tick")).toBe("0");
    expect(fixture.chart.getAttribute("data-scan-radius")).toBe("120");

    const slider = fixture.slider as FakeHTMLInputElement & {
      min: string;
      max: string;
      step: string;
    };
    expect(slider.min).toBe("20");
    expect(slider.max).toBe("200");
    expect(slider.step).toBe("5");
    expect(slider.value).toBe("120");

    const outcome = testId("outcome");
    expect(outcome.classList.contains("hidden")).toBe(true);
    expect(outcome.getAttribute("aria-hidden")).toBe("true");
  });

  it("updates HUD and sensor hooks from the stepped state", () => {
    const game = setupGame();

    press("w");
    advanceTicks(game);
    game.render();

    expect(testId("thruster-right").getAttribute("data-active")).toBe("true");
    expect(testId("thruster-left").getAttribute("data-active")).toBe("false");
    expect(testId("thruster-rear").getAttribute("data-active")).toBe("false");

    const speed = Number(testId("hud-speed").getAttribute("data-value"));
    expect(speed).toBeGreaterThan(0);
    expect(
      Number(testId("velocity-speed").getAttribute("data-value")),
    ).toBeCloseTo(speed, 10);

    expect(testId("eye-sensor-scan-tick").textContent).toBe("0");
    expect(fixture.chart.getAttribute("data-scan-tick")).toBe("0");
  });

  it("wires the eye-sensor radius slider to the simulation", () => {
    const game = setupGame();
    press("e");

    fixture.slider.value = "200";
    fixture.slider.dispatch("input", { target: fixture.slider });

    expect(game.getState().eyeSensorRadius).toBe(200);
    expect(fixture.chart.getAttribute("data-scan-radius")).toBe("120");

    press("r");

    expect(game.getState().eyeSensorRadius).toBe(200);
    expect(fixture.chart.getAttribute("data-scan-radius")).toBe("200");
    expect(testId("eye-sensor-radius-value").getAttribute("data-value")).toBe(
      "200",
    );
  });

  it("shows the destroyed overlay with the final score and hides thrusters", () => {
    const field = createField(7);
    const destroyed = deepFreeze(
      makeState({
        seed: 7,
        hull: 0,
        outcome: "destroyed",
        score: 321,
        progress: 321.4,
        thrusters: { left: true, right: true, rear: true },
      }),
    );
    const scripted = createScriptedSimulation(destroyed, field);
    setupGame({ simulation: scripted.simulation });

    const outcome = testId("outcome");
    expect(outcome.classList.contains("hidden")).toBe(false);
    expect(outcome.getAttribute("aria-hidden")).toBe("false");
    expect(outcome.querySelector(".outcome-text")?.textContent).toMatch(
      /destroyed/i,
    );
    expect(
      outcome.querySelector(".outcome-score-value")?.textContent,
    ).toBe("321");
    expect(testId("hud-score").getAttribute("data-value")).toBe("321");
    expect(testId("hud-hull").getAttribute("data-value")).toBe("0");

    for (const testIdName of [
      "thruster-left",
      "thruster-right",
      "thruster-rear",
    ]) {
      expect(testId(testIdName).getAttribute("data-active")).toBe("false");
    }
  });

  it("hides the destroyed overlay and starts a new run on R", () => {
    const field = createField(7);
    const destroyed = makeState({
      seed: 7,
      hull: 0,
      outcome: "destroyed",
      score: 321,
      progress: 321.4,
    });
    const scripted = createScriptedSimulation(destroyed, field);
    const game = setupGame({ simulation: scripted.simulation });
    scripted.setResetState((seed) =>
      makeState(seed === undefined ? {} : { seed }),
    );

    expect(testId("outcome").classList.contains("hidden")).toBe(false);

    press("r");

    const expectedSeed = nextSeed(7);
    expect(scripted.reset).toHaveBeenLastCalledWith(expectedSeed);
    expect(game.getSeed()).toBe(expectedSeed);
    expect(game.getState().outcome).toBe("flying");
    expect(testId("outcome").classList.contains("hidden")).toBe(true);
    expect(testId("outcome").getAttribute("aria-hidden")).toBe("true");
    expect(testId("seed-display").textContent).toBe(String(expectedSeed));
    expect(testId("hud-hull").getAttribute("data-value")).toBe("100");
    expect(testId("hud-score").getAttribute("data-value")).toBe("0");
  });
});

describe("sensor visibility, radar gating, and modal input isolation", () => {
  function expectConsoleHidden(): void {
    const panel = testId("eye-sensor-panel");
    expect(panel.getAttribute("data-visible")).toBe("false");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(panel.hasAttribute("hidden")).toBe(true);
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(fixture.slider.disabled).toBe(true);
    expect(testId("radar-status").getAttribute("data-active")).toBe("false");
  }

  function expectConsoleVisible(): void {
    const panel = testId("eye-sensor-panel");
    expect(panel.getAttribute("data-visible")).toBe("true");
    expect(panel.getAttribute("aria-hidden")).toBe("false");
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(fixture.slider.disabled).toBe(false);
    expect(testId("radar-status").getAttribute("data-active")).toBe("true");
  }

  it("boots in manual mode with the console and radar hidden", () => {
    setupGame();

    expectConsoleHidden();
    expect(fixture.panel.classList.contains("hidden")).toBe(false);
    expect(fixture.dom.document.body.classList.contains("sensors-hidden")).toBe(
      true,
    );
  });

  it("shows the console and radar on E and hides them again on the next E", () => {
    setupGame();

    press("e");
    expectConsoleVisible();
    expect(fixture.dom.document.body.classList.contains("sensors-hidden")).toBe(
      false,
    );

    press("e");
    expectConsoleHidden();
  });

  it.each([
    { name: "R", reset: (): void => press("r") },
    {
      name: "loadSeed",
      reset: (game: Game): void => {
        game.loadSeed(42);
      },
    },
    {
      name: "the seed control",
      reset: (): void => {
        fixture.seedInput.value = "42";
        fixture.seedLoad.dispatch("click");
      },
    },
  ])(
    "preserves manual visibility across $name",
    ({ reset }) => {
      const game = setupGame();
      expectConsoleHidden();

      reset(game);

      expect(game.isAutopilotActive()).toBe(false);
      expectConsoleHidden();
    },
  );

  it.each([
    { name: "R", reset: (): void => press("r") },
    {
      name: "loadSeed",
      reset: (game: Game): void => {
        game.loadSeed(42);
      },
    },
    {
      name: "the seed control",
      reset: (): void => {
        fixture.seedInput.value = "42";
        fixture.seedLoad.dispatch("click");
      },
    },
  ])(
    "preserves autopilot visibility across $name",
    ({ reset }) => {
      const game = setupGame();
      press("e");
      expectConsoleVisible();

      reset(game);

      expect(game.isAutopilotActive()).toBe(true);
      expectConsoleVisible();
      expect(testId("autopilot-status").getAttribute("data-active")).toBe(
        "true",
      );
    },
  );

  it("keeps scanning and updating hidden console values, then redraws on reveal", () => {
    const game = setupGame();

    expect(advanceTicks(game, 120)).toBe(120);
    game.render();
    expect(game.getState().tick).toBe(120);
    expect(game.getState().sensors.eye.tick).toBe(120);
    expect(fixture.chart.getAttribute("data-scan-tick")).toBe("120");
    expect(fixture.chart.getAttribute("data-scan-radius")).toBe("120");
    expect(testId("eye-sensor-scan-tick").textContent).toBe("120");
    expectConsoleHidden();

    const beforeReveal = fixture.chart.context.calls.length;
    press("e");

    expectConsoleVisible();
    expect(fixture.chart.getAttribute("data-scan-tick")).toBe("120");
    expect(fixture.chart.width).toBe(374);
    expect(fixture.chart.height).toBe(138);
    expect(fixture.chart.context.calls.length).toBeGreaterThan(beforeReveal);
  });

  it("keeps autopilot visibility while the run is already destroyed", () => {
    const field = createField(7);
    const scripted = createScriptedSimulation(
      makeState({ seed: 7, hull: 0, outcome: "destroyed" }),
      field,
    );
    setupGame({ simulation: scripted.simulation });

    expectConsoleHidden();
    press("e");

    expectConsoleVisible();
    expect(testId("outcome").classList.contains("hidden")).toBe(false);
  });

  it("moves focus out of the console when E hides it", () => {
    setupGame();
    press("e");
    fixture.slider.focus();
    expect(fixture.dom.document.activeElement).toBe(fixture.slider);

    press("e");

    const active = fixture.dom.document.activeElement;
    expect(active).not.toBe(fixture.slider);
    expect(fixture.panel.contains(active)).toBe(false);
  });

  it("releases held thrusters when the changelog modal opens", () => {
    const game = setupGame();
    press("q");
    expect(game.input.keys.left).toBe(true);

    fixture.changelogButton.dispatch("click");

    expect(fixture.changelogDialog.hasAttribute("open")).toBe(true);
    expect(game.input.keys).toEqual({
      left: false,
      right: false,
      rear: false,
    });

    advanceTicks(game);
    expect(game.getState().thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
    });
  });

  it("blocks Q, W, Space, E, and R while the changelog modal is open", () => {
    const game = setupGame();
    const seedBefore = game.getSeed();

    fixture.changelogButton.dispatch("click");
    expect(fixture.changelogDialog.hasAttribute("open")).toBe(true);

    press("q");
    press("w");
    pressSpace();
    press("e");
    press("r");

    expect(game.input.keys).toEqual({
      left: false,
      right: false,
      rear: false,
    });
    expect(game.isAutopilotActive()).toBe(false);
    expect(game.getSeed()).toBe(seedBefore);

    advanceTicks(game);
    expect(game.getState().thrusters).toEqual({
      left: false,
      right: false,
      rear: false,
    });
    expect(game.getSeed()).toBe(seedBefore);
  });

  it("resumes game keys after the changelog modal closes", () => {
    const game = setupGame();
    const seedBefore = game.getSeed();

    fixture.changelogButton.dispatch("click");
    press("r");
    expect(game.getSeed()).toBe(seedBefore);

    fixture.changelogClose.dispatch("click");
    expect(fixture.changelogDialog.hasAttribute("open")).toBe(false);

    press("r");
    expect(game.getSeed()).not.toBe(seedBefore);
    expect(game.isAutopilotActive()).toBe(false);
  });
});

describe("render-only state access", () => {
  it("renders a deeply frozen simulation state without mutating it", () => {
    const field = createField(3);
    const frozen = deepFreeze(
      makeState({
        seed: 3,
        velocity: { x: 4, y: 2 },
        angle: 0.2,
        angularVelocity: 0.1,
        hull: 80,
        progress: 12.4,
        score: 12,
        eyeSensorRadius: 120,
      }),
    );
    const scripted = createScriptedSimulation(frozen, field);
    const game = setupGame({ simulation: scripted.simulation });

    advanceTicks(game);
    game.render();

    expect(game.getState()).toBe(frozen);
    expect(frozen.ship.velocity).toEqual({ x: 4, y: 2 });
    expect(frozen.ship.angle).toBe(0.2);
    expect(frozen.hull).toBe(80);
    expect(frozen.progress).toBe(12.4);
    expect(frozen.sensors.eye.distances).toHaveLength(360);
    expect(Object.isFrozen(frozen.sensors.eye.distances)).toBe(true);
    expect(scripted.step).toHaveBeenCalledTimes(1);
  });
});

describe("bootstrap module", () => {
  it("keeps the fixed-step loop out of main.ts", () => {
    const source = readFileSync(
      new URL("../src/main.ts", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(/startGame\s*\(\)/);
    expect(source).not.toMatch(/requestAnimationFrame/);
    expect(source).not.toMatch(/createSimulation/);
  });
});
