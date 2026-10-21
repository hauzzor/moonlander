import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIXED_DT,
  createField,
  type Action,
  type Field,
  type Observation,
  type SimState,
  type Simulation,
} from "@moonlander/sim";
import {
  CAMERA_RESPONSE,
} from "../src/camera";
import {
  MAX_FRAME_SECONDS,
  MAX_STEPS_PER_FRAME,
  SIM_TIME_SCALE_DEFAULT,
  SIM_TIME_SCALE_MAX,
  SIM_TIME_SCALE_MIN,
  createGame,
  maxStepsForTimeScale,
  startGame,
  type Game,
  type GameOptions,
} from "../src/game";
import { computeViewScale } from "../src/render";
import {
  installGameFixture,
  makeState,
  worldFor,
  type GameFixture,
} from "./fixtures";

let fixture: GameFixture;

function withLevel(
  fixtureOptions: Parameters<typeof installGameFixture>[0] = {},
): Parameters<typeof installGameFixture>[0] {
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
  fixtureOptions: Parameters<typeof installGameFixture>[0] = {},
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
    level: state.level,
    planets: state.planets,
    nearestWallDistance: 100,
    tunnelCenterOffset: 0,
    tunnelHalfWidth: 34,
    tunnelHeading: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    eyeSensorRadius: state.eyeSensorRadius,
    gravityScale: state.gravityScale,
    gravity: state.gravity,
    gravityAcceleration: state.gravityAcceleration,
    bottomThrusterScale: state.bottomThrusterScale,
    rearThrusterScale: state.rearThrusterScale,
    topThrusterScale: state.topThrusterScale,
    sensors: state.sensors,
  };
}

function scriptedSimulation(
  initial: SimState,
  next: SimState,
  field: Field,
): Simulation {
  let state = initial;
  const world = worldFor(field);

  return {
    get level() {
      return state.level;
    },
    world,
    get field(): Field {
      return field;
    },
    getState: () => state,
    getObservation: () => observationFor(state),
    step: (_action: Action): SimState => {
      state = next;
      return state;
    },
    reset: (seed?: number): SimState => {
      state = seed === undefined ? initial : { ...initial, seed };
      return state;
    },
    setEyeSensorRadius: (radius: number): void => {
      state = { ...state, eyeSensorRadius: radius };
    },
    setGravityScale: (scale: number): void => {
      state = {
        ...state,
        gravityScale: scale,
        gravity: 1.62 * scale,
      };
    },
    setBottomThrusterScale: (scale: number): void => {
      state = { ...state, bottomThrusterScale: scale };
    },
    setRearThrusterScale: (scale: number): void => {
      state = { ...state, rearThrusterScale: scale };
    },
    setTopThrusterScale: (scale: number): void => {
      state = { ...state, topThrusterScale: scale };
    },
  };
}

describe("time scale configuration", () => {
  it("defaults to 1x", () => {
    const game = setupGame();

    expect(game.getTimeScale()).toBe(SIM_TIME_SCALE_DEFAULT);
    expect(SIM_TIME_SCALE_DEFAULT).toBe(1);
  });

  it.each([
    { name: "the minimum", value: SIM_TIME_SCALE_MIN, expected: 0.1 },
    { name: "the maximum", value: SIM_TIME_SCALE_MAX, expected: 10 },
    { name: "below the minimum", value: 0.001, expected: 0.1 },
    { name: "above the maximum", value: 100, expected: 10 },
    { name: "zero", value: 0, expected: 0.1 },
    { name: "a negative value", value: -5, expected: 0.1 },
    { name: "NaN", value: Number.NaN, expected: 1 },
    { name: "Infinity", value: Number.POSITIVE_INFINITY, expected: 1 },
  ])("clamps a $name option to the documented range", ({ value, expected }) => {
    const game = setupGame({ timeScale: value });

    expect(game.getTimeScale()).toBe(expected);
  });

  it.each([
    { name: "a valid value", value: 4, expected: 4 },
    { name: "the minimum", value: 0.1, expected: 0.1 },
    { name: "the maximum", value: 10, expected: 10 },
    { name: "below the minimum", value: -1, expected: 0.1 },
    { name: "above the maximum", value: 20, expected: 10 },
    { name: "NaN", value: Number.NaN, expected: 1 },
  ])("setTimeScale clamps $name", ({ value, expected }) => {
    const game = setupGame();

    game.setTimeScale(value);

    expect(game.getTimeScale()).toBe(expected);
  });

  it("applies a changed time scale live on the next advance", () => {
    const game = setupGame();

    game.setTimeScale(10);

    expect(game.advance(0.1)).toBe(120);
    expect(game.getState().tick).toBe(120);
  });

  it.each([
    { scale: 0.1, expected: 12 },
    { scale: 0.5, expected: 60 },
    { scale: 1, expected: MAX_STEPS_PER_FRAME },
    { scale: 2, expected: 240 },
    { scale: 10, expected: 1200 },
    { scale: 100, expected: 1200 },
    { scale: Number.NaN, expected: MAX_STEPS_PER_FRAME },
  ])(
    "computes the dynamic per-frame cap for $scale x as $expected",
    ({ scale, expected }) => {
      expect(maxStepsForTimeScale(scale)).toBe(expected);
    },
  );
});

describe("scaled fixed-step accumulator", () => {
  it("advances 120 fixed ticks for 0.1 s of wall time at 10x", () => {
    const game = setupGame({ timeScale: 10 });

    expect(game.advance(0.1)).toBe(120);
    expect(game.getState().tick).toBe(120);
    expect(game.getState().time).toBeCloseTo(1, 10);
  });

  it("advances 12 fixed ticks for 1 s of wall time at 0.1x", () => {
    const game = setupGame({ timeScale: 0.1 });

    expect(game.advance(1)).toBe(12);
    expect(game.getState().tick).toBe(12);
    expect(game.getState().time).toBeCloseTo(0.1, 10);
  });

  it("keeps fixed-step math independent of the time scale", () => {
    const game = setupGame({ timeScale: 10 });

    expect(game.advance(FIXED_DT / 10)).toBe(1);
    expect(game.advance(FIXED_DT / 20)).toBe(0);
    expect(game.advance(FIXED_DT / 20)).toBe(1);
    expect(game.getState().tick).toBe(2);
  });

  it("scales the per-frame step cap so a 10x long frame does not drop time", () => {
    const game = setupGame({ timeScale: 10 });

    const steps = game.advance(MAX_FRAME_SECONDS);

    expect(steps).toBe(300);
    expect(steps).toBeGreaterThan(MAX_STEPS_PER_FRAME);
    expect(game.getState().tick).toBe(300);
  });

  it("honours the dynamic cap instead of the default cap at 10x", () => {
    const game = setupGame({ timeScale: 10 });

    expect(game.advance(0.5)).toBe(600);
    expect(game.getState().tick).toBe(600);
  });

  it("caps a single 10x advance at the hard 1200-step ceiling", () => {
    const game = setupGame({ timeScale: 10 });

    expect(game.advance(2)).toBe(1200);
    expect(game.getState().tick).toBe(1200);
  });

  it("is invariant to how wall time is chunked at 10x", () => {
    const single = setupGame({ timeScale: 10 });
    single.advance(0.1);
    const singleState = single.getState();

    const chunked = setupGame({ timeScale: 10 });
    for (let index = 0; index < 5; index += 1) {
      chunked.advance(0.02);
    }
    const chunkedState = chunked.getState();

    expect(chunkedState.tick).toBe(singleState.tick);
    expect(chunkedState).toEqual(singleState);
  });

  it("is invariant to how wall time is chunked at 1x", () => {
    const single = setupGame();
    single.advance(0.1);
    const singleState = single.getState();

    const chunked = setupGame();
    for (let index = 0; index < 10; index += 1) {
      chunked.advance(0.01);
    }
    const chunkedState = chunked.getState();

    expect(chunkedState.tick).toBe(singleState.tick);
    expect(chunkedState).toEqual(singleState);
  });

  it("produces the same per-tick trajectory at 1x and 10x for matched ticks", () => {
    const game = setupGame({ timeScale: 1 });
    const seed = game.getSeed();

    game.input.keys.left = true;
    expect(game.advance(1)).toBe(120);
    const at1x = game.getState();

    game.loadSeed(seed);
    game.setTimeScale(10);
    game.input.keys.left = true;
    expect(game.advance(0.1)).toBe(120);
    const at10x = game.getState();

    expect(at10x.tick).toBe(at1x.tick);
    expect(at10x).toEqual(at1x);
  });

  it("keeps the time scale across R and seed loads", () => {
    const game = setupGame({ timeScale: 2.5 });

    expect(game.getTimeScale()).toBe(2.5);

    game.restart();
    expect(game.getTimeScale()).toBe(2.5);

    game.loadSeed(42);
    expect(game.getTimeScale()).toBe(2.5);
    expect(game.getSeed()).toBe(42);

    game.setTimeScale(4);
    game.restart();
    expect(game.getTimeScale()).toBe(4);
  });
});

describe("camera time scale", () => {
  function shipScreenXAfterFrame(timeScale: number): number {
    const field = createField(1);
    const initial = makeState({ position: { x: 0, y: 60 } });
    const next = makeState({ position: { x: 100, y: 60 } });
    const simulation = scriptedSimulation(initial, next, field);
    const loop: { frame: ((time: number) => void) | null } = { frame: null };

    fixture = installGameFixture({ search: "?level=sandworm&seed=1" });
    const game = startGame({
      simulation,
      timeScale,
      now: () => 0,
      requestFrame: (frame) => {
        loop.frame = frame;
        return 1;
      },
      cancelFrame: vi.fn(),
    });

    const frame = loop.frame;
    if (frame === null) {
      throw new Error("startGame did not request an animation frame");
    }

    frame(50);

    const translate = fixture.dom.canvas.context
      .callsNamed("translate")
      .at(-1);
    game.dispose();

    if (translate === undefined) {
      throw new Error("renderer did not translate the ship");
    }

    const x = Number(translate.args[0]);
    expect(Number.isFinite(x)).toBe(true);
    return x;
  }

  it("eases the camera with the scaled simulation delta", () => {
    const x1 = shipScreenXAfterFrame(1);
    const x10 = shipScreenXAfterFrame(10);
    const scale = computeViewScale(800, 600);
    const blend1 = 1 - Math.exp(-CAMERA_RESPONSE * 0.05);
    const blend10 = 1 - Math.exp(-CAMERA_RESPONSE * 0.1);
    const expected1 = 400 + 100 * (1 - blend1) * scale;
    const expected10 = 400 + 100 * (1 - blend10) * scale;

    expect(x1).toBeCloseTo(expected1, 4);
    expect(x10).toBeCloseTo(expected10, 4);
    expect(x10).toBeLessThan(x1);
  });
});
