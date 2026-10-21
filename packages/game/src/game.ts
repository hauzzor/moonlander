import {
  createAutopilot,
  createSimulation,
  FIXED_DT,
  type Action,
  type Controller,
  type SimState,
  type Simulation,
} from "@moonlander/sim";
import { createCamera, snapCamera, updateCamera } from "./camera";
import {
  createChangelog,
  type ChangelogController,
} from "./changelog";
import { createHud } from "./hud";
import { createInput } from "./input";
import { createRenderer } from "./render";
import { drawSensorOverlay } from "./render/sensor";
import { DEFAULT_SEED, MAX_SEED, nextSeed, parseSeed } from "./seed";
import { createSeedControls } from "./seed-controls";
import { createSensorConsole } from "./sensor-console";

export const MAX_FRAME_SECONDS = 0.25;
export const MAX_STEPS_PER_FRAME = 120;

export interface GameOptions {
  seed?: number;
  simulation?: Simulation;
  autopilotFactory?: () => Controller;
  now?: () => number;
  requestFrame?: (callback: (now: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

export interface AccumulatorResult {
  steps: number;
  accumulator: number;
}

export interface Game {
  readonly simulation: Simulation;
  readonly input: ReturnType<typeof createInput>;
  getState(): SimState;
  getSeed(): number;
  isAutopilotActive(): boolean;
  advance(elapsedSeconds: number): number;
  render(): void;
  resize(): void;
  restart(): void;
  loadSeed(seed: number): void;
  toggleAutopilot(): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

function validSeed(seed: number): number | null {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED) {
    return null;
  }
  return seed >>> 0;
}

function seedOption(seed: number | undefined): number {
  if (seed === undefined) {
    return readUrlSeed() ?? DEFAULT_SEED;
  }
  return validSeed(seed) ?? DEFAULT_SEED;
}

function readUrlSeed(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const location = window.location;
  if (location === undefined || typeof location.search !== "string") {
    return null;
  }

  return parseSeed(new URLSearchParams(location.search).get("seed"));
}

function defaultNow(): number {
  if (typeof performance !== "undefined") {
    return performance.now();
  }
  return Date.now();
}

export function advanceAccumulator(
  accumulator: number,
  elapsedSeconds: number,
  step: number = FIXED_DT,
  maxSteps: number = MAX_STEPS_PER_FRAME,
): AccumulatorResult {
  const base =
    Number.isFinite(accumulator) && accumulator > 0 ? accumulator : 0;
  const elapsed =
    Number.isFinite(elapsedSeconds) && elapsedSeconds > 0
      ? elapsedSeconds
      : 0;
  const stepSize =
    Number.isFinite(step) && step > 0 ? step : FIXED_DT;
  const limit =
    Number.isFinite(maxSteps) && maxSteps > 0
      ? Math.floor(maxSteps)
      : MAX_STEPS_PER_FRAME;

  let remaining = base + elapsed;
  let steps = 0;
  while (remaining >= stepSize && steps < limit) {
    remaining -= stepSize;
    steps += 1;
  }

  if (steps >= limit) {
    remaining = 0;
  }

  return { steps, accumulator: remaining };
}

export function createGame(options: GameOptions = {}): Game {
  const simulation =
    options.simulation ??
    createSimulation({ seed: seedOption(options.seed) });
  const now = options.now ?? defaultNow;
  const requestFrame =
    options.requestFrame ??
    ((callback: (time: number) => void): number => {
      if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(callback);
      }
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        return window.requestAnimationFrame(callback);
      }
      return setTimeout(() => {
        callback(now());
      }, 16) as unknown as number;
    });
  const cancelFrame =
    options.cancelFrame ??
    ((handle: number): void => {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(handle);
        return;
      }
      if (
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(handle);
        return;
      }
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    });

  let currentSeed = simulation.getState().seed >>> 0;
  let autopilotController: Controller | null = null;
  let autopilotEnabled = false;
  let accumulator = 0;
  let lastTime = now();
  let animationHandle: number | null = null;
  let running = false;

  const camera = createCamera();
  const hud = createHud();
  const renderer = createRenderer({
    sensorRenderer: (ctx, viewport, cameraView, state) => {
      if (autopilotEnabled) {
        drawSensorOverlay(ctx, viewport, cameraView, state);
      }
    },
  });
  const sensorConsole = createSensorConsole({
    getEyeSensorRadius: () => simulation.getState().eyeSensorRadius,
    setEyeSensorRadius: (radius) => {
      simulation.setEyeSensorRadius(radius);
    },
  });

  const getAutopilot = (): Controller => {
    if (autopilotController === null) {
      autopilotController = options.autopilotFactory
        ? options.autopilotFactory()
        : createAutopilot();
    }
    return autopilotController;
  };

  const refresh = (deltaSeconds: number): void => {
    const state = simulation.getState();
    updateCamera(camera, state, deltaSeconds);
    hud.update(state, autopilotEnabled);
    sensorConsole.update(state);
    renderer.render(state, simulation.field, camera);
  };

  const resetRun = (seed: number): void => {
    input.release();
    autopilotController?.reset?.();
    accumulator = 0;

    const state = simulation.reset(seed);
    currentSeed = state.seed >>> 0;
    seedControls.applySeed(currentSeed);

    snapCamera(camera, state);
    hud.update(state, autopilotEnabled);
    sensorConsole.update(state);
    sensorConsole.setVisible(autopilotEnabled);
    renderer.render(state, simulation.field, camera);
    lastTime = now();
  };

  const restart = (): void => {
    resetRun(nextSeed(currentSeed));
  };

  const loadSeed = (seed: number): void => {
    const parsed = validSeed(seed);
    if (parsed !== null) {
      resetRun(parsed);
    }
  };

  const toggleAutopilot = (): void => {
    autopilotEnabled = !autopilotEnabled;
    input.release();

    if (autopilotEnabled) {
      getAutopilot().reset?.();
    }

    const state = simulation.getState();
    hud.update(state, autopilotEnabled);
    sensorConsole.setVisible(autopilotEnabled);
    renderer.render(state, simulation.field, camera);
  };

  const seedControls = createSeedControls({
    getCurrentSeed: () => currentSeed,
    onLoadSeed: loadSeed,
  });

  let changelog: ChangelogController | null = null;

  const input = createInput({
    onRestart: restart,
    onToggleAutopilot: toggleAutopilot,
    isAutopilotActive: () => autopilotEnabled,
    isModalOpen: () => changelog?.isOpen() ?? false,
  });

  changelog = createChangelog({
    onOpenChange: (open) => {
      if (open) {
        input.release();
      }
    },
  });

  const stepOnce = (): void => {
    if (simulation.getState().outcome !== "flying") {
      return;
    }

    let action: Action;

    if (autopilotEnabled) {
      action = getAutopilot().act(simulation.getObservation());
    } else {
      action = {
        left: input.keys.left,
        right: input.keys.right,
        rear: input.keys.rear,
      };
    }

    simulation.step(action);
  };

  const advance = (elapsedSeconds: number): number => {
    const result = advanceAccumulator(accumulator, elapsedSeconds);
    accumulator = result.accumulator;

    for (let step = 0; step < result.steps; step += 1) {
      stepOnce();
    }

    return result.steps;
  };

  const resize = (): void => {
    renderer.resize();
    sensorConsole.resize();
    refresh(0);
  };

  const frame = (time: number): void => {
    if (!running) {
      return;
    }

    const rawElapsed = Math.max(0, (time - lastTime) / 1000);
    const elapsed = Math.min(rawElapsed, MAX_FRAME_SECONDS);
    lastTime = time;

    advance(elapsed);
    refresh(elapsed);

    animationHandle = requestFrame(frame);
  };

  const start = (): void => {
    if (running) {
      return;
    }

    running = true;
    lastTime = now();
    animationHandle = requestFrame(frame);
  };

  const stop = (): void => {
    running = false;

    if (animationHandle !== null) {
      cancelFrame(animationHandle);
      animationHandle = null;
    }
  };

  const handleResize = (): void => {
    resize();
  };

  window.addEventListener("resize", handleResize);

  renderer.resize();

  const initialState = simulation.getState();
  currentSeed = initialState.seed >>> 0;
  seedControls.applySeed(currentSeed);
  snapCamera(camera, initialState);
  hud.update(initialState, autopilotEnabled);
  sensorConsole.setVisible(autopilotEnabled);
  sensorConsole.update(initialState);
  renderer.render(initialState, simulation.field, camera);
  lastTime = now();

  const dispose = (): void => {
    stop();
    window.removeEventListener("resize", handleResize);
    changelog?.dispose();
  };

  return {
    simulation,
    input,
    getState: () => simulation.getState(),
    getSeed: () => currentSeed,
    isAutopilotActive: () => autopilotEnabled,
    advance,
    render: () => {
      refresh(0);
    },
    resize,
    restart,
    loadSeed,
    toggleAutopilot,
    start,
    stop,
    dispose,
  };
}

export function startGame(options: GameOptions = {}): Game {
  const game = createGame(options);
  game.start();
  return game;
}
