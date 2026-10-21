import {
  createAutopilot,
  createSimulation,
  FIXED_DT,
  type Action,
  type Controller,
  type LevelId,
  type SimState,
  type Simulation,
  type SimulationOptions,
} from "@moonlander/sim";
import { createCamera, snapCamera, updateCamera } from "./camera";
import {
  createChangelog,
  type ChangelogController,
} from "./changelog";
import { createHud } from "./hud";
import { createInput } from "./input";
import {
  createMenu,
  isLevelId,
  levelName,
  parseLevel,
  type MenuController,
} from "./menu";
import { createRenderer } from "./render";
import { drawSensorOverlay } from "./render/sensor";
import { DEFAULT_SEED, MAX_SEED, nextSeed, parseSeed } from "./seed";
import { createSeedControls } from "./seed-controls";
import { createSensorConsole } from "./sensor-console";
import {
  clampTimeScale,
  createSimPanel,
  SIM_TIME_SCALE_DEFAULT,
  SIM_TIME_SCALE_MAX,
  SIM_TIME_SCALE_MIN,
  type SimPanelController,
} from "./sim-panel";

export {
  clampTimeScale,
  SIM_TIME_SCALE_DEFAULT,
  SIM_TIME_SCALE_MAX,
  SIM_TIME_SCALE_MIN,
};

export const MAX_FRAME_SECONDS = 0.25;
export const MAX_STEPS_PER_FRAME = 120;
export const MAX_STEPS_HARD_CAP = 1200;

export interface GameOptions {
  seed?: number;
  level?: LevelId;
  autoStart?: boolean;
  simulation?: Simulation;
  autopilotFactory?: () => Controller;
  timeScale?: number;
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
  getLevel(): LevelId;
  isStartMenuOpen(): boolean;
  isPaused(): boolean;
  isAutopilotActive(): boolean;
  getTimeScale(): number;
  setTimeScale(scale: number): void;
  advance(elapsedSeconds: number): number;
  render(): void;
  resize(): void;
  restart(): void;
  loadSeed(seed: number): void;
  startLevel(level: LevelId): void;
  returnToStart(): void;
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

function readUrlLevel(): LevelId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const location = window.location;
  if (location === undefined || typeof location.search !== "string") {
    return null;
  }

  return parseLevel(new URLSearchParams(location.search).get("level"));
}

function replaceUrl(params: URLSearchParams): void {
  if (typeof window === "undefined") {
    return;
  }

  const location = window.location;
  const history = window.history;

  if (
    location === undefined ||
    history === undefined ||
    typeof history.replaceState !== "function"
  ) {
    return;
  }

  try {
    const query = params.toString();
    const pathname =
      typeof location.pathname === "string" ? location.pathname : "";
    const hash = typeof location.hash === "string" ? location.hash : "";
    history.replaceState(
      null,
      "",
      `${pathname}${query.length > 0 ? `?${query}` : ""}${hash}`,
    );
  } catch {
    // History may be unavailable in restricted or test environments.
  }
}

function currentUrlParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const search = window.location?.search;
  return new URLSearchParams(typeof search === "string" ? search : "");
}

function writeLevelUrl(level: LevelId, seed: number): void {
  const params = currentUrlParams();
  params.set("level", level);
  params.set("seed", String(seed >>> 0));
  replaceUrl(params);
}

function clearLevelUrl(): void {
  const params = currentUrlParams();
  params.delete("level");
  params.delete("seed");
  replaceUrl(params);
}

function defaultNow(): number {
  if (typeof performance !== "undefined") {
    return performance.now();
  }
  return Date.now();
}

function queryElement<T extends Element>(testId: string): T | null {
  if (
    typeof document === "undefined" ||
    typeof document.querySelector !== "function"
  ) {
    return null;
  }

  const element = document.querySelector(`[data-testid="${testId}"]`);
  return element === null ? null : (element as T);
}

function setLevelLabel(element: HTMLElement | null, level: LevelId): void {
  if (element === null) {
    return;
  }

  element.setAttribute("data-level", level);
  const value =
    element.querySelector?.(".level-value") ??
    element.querySelector?.(".hud-value") ??
    null;

  if (value instanceof Object && "textContent" in value) {
    (value as HTMLElement).textContent = levelName(level);
  } else if (!element.classList?.contains("level-value")) {
    element.textContent = levelName(level);
  }
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

  const tolerance = stepSize * 1e-9;
  let remaining = base + elapsed;
  let steps = 0;
  while (remaining + tolerance >= stepSize && steps < limit) {
    remaining -= stepSize;
    steps += 1;
  }

  if (steps >= limit || Math.abs(remaining) < tolerance) {
    remaining = 0;
  }

  return { steps, accumulator: remaining };
}

export function maxStepsForTimeScale(timeScale: number): number {
  const scale = clampTimeScale(timeScale);
  return Math.min(
    MAX_STEPS_HARD_CAP,
    Math.ceil(MAX_STEPS_PER_FRAME * scale),
  );
}

export function createGame(options: GameOptions = {}): Game {
  const now = options.now ?? defaultNow;
  const urlLevel = readUrlLevel();
  const urlSeed = readUrlSeed();
  const optionLevel =
    options.level !== undefined && isLevelId(options.level)
      ? options.level
      : null;
  const optionSeed =
    options.seed !== undefined ? validSeed(options.seed) : null;
  const seedOverride = optionSeed ?? urlSeed;
  let pendingOptionSeed = optionSeed;

  const scriptedSimulation = options.simulation;
  const initialLevel =
    scriptedSimulation?.getState().level ??
    optionLevel ??
    urlLevel ??
    "sandworm";
  const initialSeed =
    scriptedSimulation?.getState().seed ?? seedOverride ?? DEFAULT_SEED;

  let simulation =
    scriptedSimulation ??
    createSimulation({ level: initialLevel, seed: initialSeed });
  let currentLevel: LevelId = simulation.getState().level;
  let currentSeed = simulation.getState().seed >>> 0;

  let autopilotController: Controller | null = null;
  let autopilotEnabled = false;
  let accumulator = 0;
  let lastTime = now();
  let animationHandle: number | null = null;
  let running = false;
  let timeScale = clampTimeScale(
    options.timeScale ?? SIM_TIME_SCALE_DEFAULT,
  );
  let simPanel: SimPanelController | null = null;
  let menu: MenuController | null = null;
  let changelog: ChangelogController | null = null;

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

  const setTimeScale = (scale: number): void => {
    timeScale = clampTimeScale(scale);
    simPanel?.update(simulation.getState());
  };

  const getTimeScale = (): number => timeScale;

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
  simPanel = createSimPanel({
    getSimulation: () => simulation,
    getTimeScale,
    setTimeScale,
  });

  const getAutopilot = (): Controller => {
    if (autopilotController === null) {
      autopilotController = options.autopilotFactory
        ? options.autopilotFactory()
        : createAutopilot();
    }
    return autopilotController;
  };

  const updateLevelDisplay = (level: LevelId): void => {
    const hudLevel = queryElement<HTMLElement>("hud-level");
    setLevelLabel(hudLevel, level);

    const levelNameElement = queryElement<HTMLElement>("level-name");
    if (levelNameElement !== null) {
      levelNameElement.setAttribute("data-level", level);
      const value = levelNameElement.querySelector?.(".level-name-value");
      if (value instanceof Object && "textContent" in value) {
        (value as HTMLElement).textContent = levelName(level);
      } else {
        levelNameElement.textContent = levelName(level);
      }
    }

    const currentLevelElement = queryElement<HTMLElement>("current-level");
    if (currentLevelElement !== null) {
      currentLevelElement.setAttribute("data-level", level);
      currentLevelElement.textContent = levelName(level);
    }

    const placeholder = queryElement<HTMLElement>("level-placeholder");
    if (placeholder !== null) {
      const isTunnel = level === "sandworm";
      placeholder.hidden = isTunnel;
      if (isTunnel) {
        placeholder.setAttribute("hidden", "");
      } else {
        placeholder.removeAttribute("hidden");
      }
      placeholder.setAttribute("data-level", level);
      const label = placeholder.querySelector?.(".level-placeholder-text");
      if (label instanceof Object && "textContent" in label) {
        (label as HTMLElement).textContent =
          `${levelName(level)} open-space preview`;
      }
    }

    if (menu?.isStartOpen() !== true) {
      menu?.setActiveLevel(level);
    }
  };

  const refresh = (deltaSeconds: number): void => {
    const state = simulation.getState();
    updateCamera(camera, state, deltaSeconds);
    hud.update(state, autopilotEnabled);
    updateLevelDisplay(state.level);
    sensorConsole.update(state);
    simPanel?.update(state);
    renderer.render(state, simulation.field, camera);
  };

  const simulationSettings = (): SimulationOptions => {
    const state = simulation.getState();
    return {
      eyeSensorRadius: state.eyeSensorRadius,
      gravityScale: state.gravityScale,
      bottomThrusterScale: state.bottomThrusterScale,
      topThrusterScale: state.topThrusterScale,
      rearThrusterScale: state.rearThrusterScale,
    };
  };

  const replaceSimulation = (level: LevelId, seed: number): void => {
    simulation = createSimulation({
      level,
      seed,
      ...simulationSettings(),
    });
    const state = simulation.getState();
    currentLevel = state.level;
    currentSeed = state.seed >>> 0;
    seedControls.applySeed(currentSeed);
  };

  const resetRun = (seed: number): void => {
    input.release();
    autopilotController?.reset?.();
    accumulator = 0;

    const state = simulation.reset(seed);
    currentLevel = state.level;
    currentSeed = state.seed >>> 0;
    seedControls.applySeed(currentSeed);
    writeLevelUrl(currentLevel, currentSeed);

    snapCamera(camera, state);
    sensorConsole.setVisible(autopilotEnabled);
    refresh(0);
    lastTime = now();
  };

  const restart = (): void => {
    if (menu?.isStartOpen() === true) {
      return;
    }

    menu?.closePause();
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
    simPanel?.update(state);
    renderer.render(state, simulation.field, camera);
  };

  const chooseStartSeed = (): number => {
    const fromUrl = readUrlSeed();
    if (fromUrl !== null) {
      return fromUrl;
    }

    if (pendingOptionSeed !== null) {
      const seed = pendingOptionSeed;
      pendingOptionSeed = null;
      return seed;
    }

    return nextSeed(currentSeed);
  };

  const startLevel = (level: LevelId, seed?: number): void => {
    const parsedSeed = seed === undefined ? null : validSeed(seed);
    const startSeed = parsedSeed ?? chooseStartSeed();

    input.release();
    autopilotEnabled = false;
    autopilotController?.reset?.();
    accumulator = 0;

    menu?.closeStart();
    menu?.closePause(false);

    replaceSimulation(level, startSeed);
    writeLevelUrl(currentLevel, currentSeed);

    const state = simulation.getState();
    snapCamera(camera, state);
    sensorConsole.setVisible(false);
    refresh(0);
    menu?.focusMenuButton();
    lastTime = now();
  };

  const returnToStart = (): void => {
    input.release();
    autopilotEnabled = false;
    autopilotController?.reset?.();
    accumulator = 0;

    clearLevelUrl();
    sensorConsole.setVisible(false);
    menu?.closePause(false);
    menu?.openStart();
    refresh(0);
    lastTime = now();
  };

  const resumeFromPause = (): void => {
    input.release();
    accumulator = 0;
    lastTime = now();
  };

  const seedControls = createSeedControls({
    getCurrentSeed: () => currentSeed,
    onLoadSeed: loadSeed,
  });

  const input = createInput({
    onRestart: restart,
    onToggleAutopilot: toggleAutopilot,
    isAutopilotActive: () => autopilotEnabled,
    isModalOpen: () =>
      changelog?.isOpen() === true ||
      menu?.blocksGameKeys() === true,
  });

  menu = createMenu({
    onStartLevel: (level) => {
      startLevel(level);
    },
    onResume: resumeFromPause,
    onRestart: restart,
    onReturn: returnToStart,
    onPauseChange: () => {
      input.release();
      accumulator = 0;
      lastTime = now();
    },
    onStartChange: () => {
      input.release();
      accumulator = 0;
      lastTime = now();
    },
    isOtherModalOpen: () => changelog?.isOpen() === true,
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
    if (menu?.blocksGameKeys() === true) {
      accumulator = 0;
      return 0;
    }

    const scale = clampTimeScale(timeScale);
    const result = advanceAccumulator(
      accumulator,
      elapsedSeconds * scale,
      FIXED_DT,
      maxStepsForTimeScale(scale),
    );
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

    const paused = menu?.blocksGameKeys() === true;
    advance(elapsed);
    refresh(paused ? 0 : elapsed * clampTimeScale(timeScale));

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
  currentLevel = initialState.level;
  currentSeed = initialState.seed >>> 0;
  seedControls.applySeed(currentSeed);
  snapCamera(camera, initialState);
  hud.update(initialState, autopilotEnabled);
  sensorConsole.setVisible(autopilotEnabled);
  sensorConsole.update(initialState);
  simPanel?.update(initialState);
  updateLevelDisplay(currentLevel);
  renderer.render(initialState, simulation.field, camera);

  const hasStartMenu = menu.hasStartMenu();
  const autoStart =
    options.autoStart === true ||
    scriptedSimulation !== undefined ||
    optionLevel !== null ||
    (hasStartMenu ? urlLevel !== null : true);

  if (autoStart) {
    menu.closeStart();

    if (scriptedSimulation === undefined) {
      const level = optionLevel ?? urlLevel ?? currentLevel;
      let startSeed = currentSeed;
      let shouldRefresh = false;

      if (seedOverride !== null) {
        startSeed = seedOverride;
      }

      if (level !== currentLevel || (startSeed >>> 0) !== currentSeed) {
        const settings = simulationSettings();
        simulation = createSimulation({
          level,
          seed: startSeed,
          ...settings,
        });
        currentLevel = level;
        currentSeed = startSeed >>> 0;
        seedControls.applySeed(currentSeed);
        snapCamera(camera, simulation.getState());
        shouldRefresh = true;
      }

      if (seedOverride !== null) {
        pendingOptionSeed = null;
      }

      if (hasStartMenu || urlLevel !== null) {
        writeLevelUrl(currentLevel, currentSeed);
      }

      if (shouldRefresh) {
        sensorConsole.setVisible(autopilotEnabled);
        refresh(0);
      }
    }
  } else {
    menu.openStart();
    accumulator = 0;
  }

  lastTime = now();

  const dispose = (): void => {
    stop();
    window.removeEventListener("resize", handleResize);
    simPanel?.dispose();
    changelog?.dispose();
    menu?.dispose();
  };

  return {
    get simulation(): Simulation {
      return simulation;
    },
    input,
    getState: () => simulation.getState(),
    getSeed: () => currentSeed,
    getLevel: () => currentLevel,
    isStartMenuOpen: () => menu?.isStartOpen() ?? false,
    isPaused: () => menu?.isPauseOpen() ?? false,
    isAutopilotActive: () => autopilotEnabled,
    getTimeScale,
    setTimeScale,
    advance,
    render: () => {
      refresh(0);
    },
    resize,
    restart,
    loadSeed,
    startLevel,
    returnToStart,
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
