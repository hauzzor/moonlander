import {
  GRAVITY,
  GRAVITY_SCALE_DEFAULT,
  GRAVITY_SCALE_MAX,
  GRAVITY_SCALE_MIN,
  THRUSTER_SCALE_DEFAULT,
  THRUSTER_SCALE_MAX,
  THRUSTER_SCALE_MIN,
  type SimState,
  type Simulation,
} from "@moonlander/sim";

export const SIM_TIME_SCALE_MIN = 0.1;
export const SIM_TIME_SCALE_MAX = 10;
export const SIM_TIME_SCALE_DEFAULT = 1;
export const SIM_LOG_POSITION_MIN = -1;
export const SIM_LOG_POSITION_MAX = 1;
export const SIM_LOG_POSITION_STEP = 0.05;

export const SIM_STORAGE_KEYS = {
  speed: "moonlander.speed",
  gravity: "moonlander.gravity",
  bottomPower: "moonlander.bottomPower",
  rearPower: "moonlander.rearPower",
} as const;

export const SIM_URL_PARAMS = {
  speed: "speed",
  gravity: "gravity",
  bottomPower: "bottomPower",
  rearPower: "rearPower",
} as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HistoryLike {
  replaceState(data: unknown, unused: string, url?: string | null): void;
}

export interface LocationLike {
  search?: string;
  pathname?: string;
  hash?: string;
}

export interface TimeScaleAccessor {
  getTimeScale(): number;
  setTimeScale(scale: number): void;
}

export interface SimPanelOptions {
  simulation?: Simulation;
  getSimulation?: () => Simulation | null | undefined;
  game?: TimeScaleAccessor;
  getTimeScale?: () => number;
  setTimeScale?: (scale: number) => void;
  getGravityScale?: () => number;
  setGravityScale?: (scale: number) => void;
  getBottomThrusterScale?: () => number;
  setBottomThrusterScale?: (scale: number) => void;
  getRearThrusterScale?: () => number;
  setRearThrusterScale?: (scale: number) => void;
  storage?: StorageLike | null;
  location?: LocationLike | null;
  history?: HistoryLike | null;
  [key: string]: unknown;
}

export interface SimPanelValues {
  timeScale: number;
  gravityScale: number;
  gravity: number;
  bottomThrusterScale: number;
  rearThrusterScale: number;
}

export interface SimPanelController {
  update(state?: SimState): void;
  setCollapsed(collapsed: boolean): void;
  isCollapsed(): boolean;
  getValues(): SimPanelValues;
  dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampScale(
  value: number,
  min = SIM_TIME_SCALE_MIN,
  max = SIM_TIME_SCALE_MAX,
  fallback = SIM_TIME_SCALE_DEFAULT,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clamp(value, min, max);
}

export function clampTimeScale(scale: number): number {
  return clampScale(
    scale,
    SIM_TIME_SCALE_MIN,
    SIM_TIME_SCALE_MAX,
    SIM_TIME_SCALE_DEFAULT,
  );
}

export function clampGravityScale(scale: number): number {
  return clampScale(
    scale,
    GRAVITY_SCALE_MIN,
    GRAVITY_SCALE_MAX,
    GRAVITY_SCALE_DEFAULT,
  );
}

export function clampThrusterScale(scale: number): number {
  return clampScale(
    scale,
    THRUSTER_SCALE_MIN,
    THRUSTER_SCALE_MAX,
    THRUSTER_SCALE_DEFAULT,
  );
}

export function parseScale(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? clampScale(value) : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? clampScale(parsed) : null;
}

export function scaleToLogPosition(scale: number): number {
  const safe =
    Number.isFinite(scale) && scale > 0 ? clampScale(scale) : SIM_TIME_SCALE_DEFAULT;
  return clamp(
    Math.log10(safe),
    SIM_LOG_POSITION_MIN,
    SIM_LOG_POSITION_MAX,
  );
}

export function logPositionToScale(position: number): number {
  const safe = Number.isFinite(position)
    ? clamp(position, SIM_LOG_POSITION_MIN, SIM_LOG_POSITION_MAX)
    : 0;
  return 10 ** safe;
}

export function quantizeLogPosition(position: number): number {
  const safe = Number.isFinite(position)
    ? clamp(position, SIM_LOG_POSITION_MIN, SIM_LOG_POSITION_MAX)
    : 0;
  return Math.round(safe / SIM_LOG_POSITION_STEP) * SIM_LOG_POSITION_STEP;
}

export function formatScale(scale: number): string {
  const safe = clampScale(scale);
  const rounded = Math.round(safe * 100) / 100;
  return `${rounded}x`;
}

export function formatGravity(gravity: number): string {
  const safe = Number.isFinite(gravity) ? gravity : GRAVITY;
  const rounded = Math.round(safe * 100) / 100;
  return `${rounded} m/s\u00b2`;
}

function formatLogPosition(position: number): string {
  const rounded = Math.round(quantizeLogPosition(position) * 100) / 100;
  return String(rounded);
}

function formatUrlValue(value: number): string {
  return String(value);
}

function queryOptionalElement<T extends Element>(
  selector: string,
): T | null {
  if (
    typeof document === "undefined" ||
    typeof document.querySelector !== "function"
  ) {
    return null;
  }

  const element = document.querySelector(selector);
  return element === null ? null : (element as T);
}

function setOutput(
  element: HTMLElement | null,
  text: string,
  value: number,
): void {
  if (element === null) {
    return;
  }

  element.textContent = text;
  element.setAttribute("data-value", String(value));
}

export function createSimPanel(
  options: SimPanelOptions = {},
): SimPanelController {
  const panel = queryOptionalElement<HTMLElement>(
    '[data-testid="sim-panel"]',
  );
  const toggle = queryOptionalElement<HTMLButtonElement>(
    '[data-testid="sim-panel-toggle"]',
  );
  const body = queryOptionalElement<HTMLElement>("#sim-panel-body");
  const status = queryOptionalElement<HTMLElement>(
    '[data-testid="simulation-status"]',
  );

  const speedSlider = queryOptionalElement<HTMLInputElement>(
    '[data-testid="sim-speed"]',
  );
  const speedValue = queryOptionalElement<HTMLElement>(
    '[data-testid="sim-speed-value"]',
  );
  const gravitySlider = queryOptionalElement<HTMLInputElement>(
    '[data-testid="gravity-scale"]',
  );
  const gravityValue = queryOptionalElement<HTMLElement>(
    '[data-testid="gravity-scale-value"]',
  );
  const bottomSlider = queryOptionalElement<HTMLInputElement>(
    '[data-testid="bottom-power"]',
  );
  const bottomValue = queryOptionalElement<HTMLElement>(
    '[data-testid="bottom-power-value"]',
  );
  const rearSlider = queryOptionalElement<HTMLInputElement>(
    '[data-testid="rear-power"]',
  );
  const rearValue = queryOptionalElement<HTMLElement>(
    '[data-testid="rear-power-value"]',
  );

  const resolveSimulation = (): Simulation | null =>
    options.simulation ?? options.getSimulation?.() ?? null;

  const currentSimState = (): SimState | null =>
    resolveSimulation()?.getState() ?? null;

  const resolveLocation = (): LocationLike | null => {
    if (options.location !== undefined) {
      return options.location;
    }
    return typeof window === "undefined" ? null : window.location;
  };

  const resolveHistory = (): HistoryLike | null => {
    if (options.history !== undefined) {
      return options.history;
    }
    return typeof window === "undefined" ? null : window.history;
  };

  const resolveStorage = (): StorageLike | null => {
    if (options.storage !== undefined) {
      return options.storage;
    }

    if (typeof window === "undefined") {
      return null;
    }

    try {
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  };

  const readStorage = (key: string): string | null => {
    const storage = resolveStorage();
    if (storage === null) {
      return null;
    }

    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  const writeStorage = (key: string, value: number): void => {
    const storage = resolveStorage();
    if (storage === null) {
      return;
    }

    try {
      storage.setItem(key, formatUrlValue(value));
    } catch {
      // Storage can be unavailable or full; settings still apply live.
    }
  };

  const readTimeScale = (): number | null =>
    options.getTimeScale?.() ??
    options.game?.getTimeScale() ??
    null;

  const writeTimeScale = (scale: number): void => {
    if (options.setTimeScale !== undefined) {
      options.setTimeScale(scale);
      return;
    }
    options.game?.setTimeScale(scale);
  };

  const initialSimState = currentSimState();
  let values: SimPanelValues = {
    timeScale: clampTimeScale(
      readTimeScale() ?? SIM_TIME_SCALE_DEFAULT,
    ),
    gravityScale: clampGravityScale(
      options.getGravityScale?.() ??
        initialSimState?.gravityScale ??
        GRAVITY_SCALE_DEFAULT,
    ),
    gravity: 0,
    bottomThrusterScale: clampThrusterScale(
      options.getBottomThrusterScale?.() ??
        initialSimState?.bottomThrusterScale ??
        THRUSTER_SCALE_DEFAULT,
    ),
    rearThrusterScale: clampThrusterScale(
      options.getRearThrusterScale?.() ??
        initialSimState?.rearThrusterScale ??
        THRUSTER_SCALE_DEFAULT,
    ),
  };
  values.gravity =
    initialSimState?.gravity ?? GRAVITY * values.gravityScale;

  const setTimeScale = (scale: number): void => {
    values.timeScale = clampTimeScale(scale);
    writeTimeScale(values.timeScale);
  };

  const setGravityScale = (scale: number): void => {
    values.gravityScale = clampGravityScale(scale);
    values.gravity = GRAVITY * values.gravityScale;

    if (options.setGravityScale !== undefined) {
      options.setGravityScale(values.gravityScale);
      return;
    }

    const simulation = resolveSimulation();
    if (simulation === null) {
      return;
    }

    if (typeof simulation.setGravityScale === "function") {
      simulation.setGravityScale(values.gravityScale);
    }
  };

  const setBottomThrusterScale = (scale: number): void => {
    values.bottomThrusterScale = clampThrusterScale(scale);

    if (options.setBottomThrusterScale !== undefined) {
      options.setBottomThrusterScale(values.bottomThrusterScale);
      return;
    }

    const simulation = resolveSimulation();
    if (simulation === null) {
      return;
    }

    if (typeof simulation.setBottomThrusterScale === "function") {
      simulation.setBottomThrusterScale(values.bottomThrusterScale);
    }
  };

  const setRearThrusterScale = (scale: number): void => {
    values.rearThrusterScale = clampThrusterScale(scale);

    if (options.setRearThrusterScale !== undefined) {
      options.setRearThrusterScale(values.rearThrusterScale);
      return;
    }

    const simulation = resolveSimulation();
    if (simulation === null) {
      return;
    }

    if (typeof simulation.setRearThrusterScale === "function") {
      simulation.setRearThrusterScale(values.rearThrusterScale);
    }
  };

  const persistedValue = (
    urlName: string,
    storageKey: string,
  ): number | null => {
    const location = resolveLocation();
    const search =
      location !== null && typeof location.search === "string"
        ? location.search
        : "";
    const fromUrl = parseScale(
      new URLSearchParams(search).get(urlName),
    );

    if (fromUrl !== null) {
      return fromUrl;
    }

    return parseScale(readStorage(storageKey));
  };

  const updateUrl = (): void => {
    const location = resolveLocation();
    const history = resolveHistory();

    if (
      location === null ||
      history === null ||
      typeof history.replaceState !== "function"
    ) {
      return;
    }

    try {
      const params = new URLSearchParams(
        typeof location.search === "string" ? location.search : "",
      );
      params.set(SIM_URL_PARAMS.speed, formatUrlValue(values.timeScale));
      params.set(
        SIM_URL_PARAMS.gravity,
        formatUrlValue(values.gravityScale),
      );
      params.set(
        SIM_URL_PARAMS.bottomPower,
        formatUrlValue(values.bottomThrusterScale),
      );
      params.set(
        SIM_URL_PARAMS.rearPower,
        formatUrlValue(values.rearThrusterScale),
      );

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
  };

  const applyPersistedSettings = (): void => {
    const persistedSpeed = persistedValue(
      SIM_URL_PARAMS.speed,
      SIM_STORAGE_KEYS.speed,
    );
    if (persistedSpeed !== null) {
      setTimeScale(persistedSpeed);
    }

    const persistedGravity = persistedValue(
      SIM_URL_PARAMS.gravity,
      SIM_STORAGE_KEYS.gravity,
    );
    if (persistedGravity !== null) {
      setGravityScale(persistedGravity);
    }

    const persistedBottom = persistedValue(
      SIM_URL_PARAMS.bottomPower,
      SIM_STORAGE_KEYS.bottomPower,
    );
    if (persistedBottom !== null) {
      setBottomThrusterScale(persistedBottom);
    }

    const persistedRear = persistedValue(
      SIM_URL_PARAMS.rearPower,
      SIM_STORAGE_KEYS.rearPower,
    );
    if (persistedRear !== null) {
      setRearThrusterScale(persistedRear);
    }
  };

  const syncControls = (): void => {
    if (speedSlider !== null) {
      speedSlider.min = String(SIM_LOG_POSITION_MIN);
      speedSlider.max = String(SIM_LOG_POSITION_MAX);
      speedSlider.step = String(SIM_LOG_POSITION_STEP);
      speedSlider.value = formatLogPosition(
        scaleToLogPosition(values.timeScale),
      );
      speedSlider.setAttribute("data-value", String(values.timeScale));
      speedSlider.setAttribute("data-game-keys", "block");
    }

    if (gravitySlider !== null) {
      gravitySlider.min = String(SIM_LOG_POSITION_MIN);
      gravitySlider.max = String(SIM_LOG_POSITION_MAX);
      gravitySlider.step = String(SIM_LOG_POSITION_STEP);
      gravitySlider.value = formatLogPosition(
        scaleToLogPosition(values.gravityScale),
      );
      gravitySlider.setAttribute(
        "data-value",
        String(values.gravityScale),
      );
      gravitySlider.setAttribute("data-gravity", String(values.gravity));
      gravitySlider.setAttribute("data-game-keys", "block");
    }

    if (bottomSlider !== null) {
      bottomSlider.min = String(SIM_LOG_POSITION_MIN);
      bottomSlider.max = String(SIM_LOG_POSITION_MAX);
      bottomSlider.step = String(SIM_LOG_POSITION_STEP);
      bottomSlider.value = formatLogPosition(
        scaleToLogPosition(values.bottomThrusterScale),
      );
      bottomSlider.setAttribute(
        "data-value",
        String(values.bottomThrusterScale),
      );
      bottomSlider.setAttribute("data-game-keys", "block");
    }

    if (rearSlider !== null) {
      rearSlider.min = String(SIM_LOG_POSITION_MIN);
      rearSlider.max = String(SIM_LOG_POSITION_MAX);
      rearSlider.step = String(SIM_LOG_POSITION_STEP);
      rearSlider.value = formatLogPosition(
        scaleToLogPosition(values.rearThrusterScale),
      );
      rearSlider.setAttribute(
        "data-value",
        String(values.rearThrusterScale),
      );
      rearSlider.setAttribute("data-game-keys", "block");
    }

    setOutput(speedValue, formatScale(values.timeScale), values.timeScale);
    setOutput(
      gravityValue,
      `${formatScale(values.gravityScale)} \u00b7 ${formatGravity(values.gravity)}`,
      values.gravityScale,
    );
    gravityValue?.setAttribute("data-gravity", String(values.gravity));
    setOutput(
      bottomValue,
      formatScale(values.bottomThrusterScale),
      values.bottomThrusterScale,
    );
    setOutput(
      rearValue,
      formatScale(values.rearThrusterScale),
      values.rearThrusterScale,
    );
  };

  const writeStatus = (state: SimState): void => {
    if (status === null) {
      return;
    }

    status.setAttribute("data-value", String(state.score));
    status.setAttribute("data-tick", String(state.tick));
    status.setAttribute("data-time", String(state.time));
    status.setAttribute("data-time-scale", String(values.timeScale));
    status.setAttribute("data-gravity-scale", String(values.gravityScale));
    status.setAttribute(
      "data-gravity",
      String(Number.isFinite(state.gravity) ? state.gravity : values.gravity),
    );
    status.setAttribute(
      "data-bottom-power",
      String(values.bottomThrusterScale),
    );
    status.setAttribute("data-rear-power", String(values.rearThrusterScale));
  };

  let collapsed = false;

  const applyCollapsed = (next: boolean): void => {
    collapsed = next;
    panel?.setAttribute("data-collapsed", String(next));
    panel?.setAttribute("aria-expanded", String(!next));
    toggle?.setAttribute("data-collapsed", String(next));
    toggle?.setAttribute("aria-expanded", String(!next));
    panel?.classList.toggle("sim-panel-collapsed", next);

    if (body !== null) {
      body.hidden = next;
      if (next) {
        body.setAttribute("hidden", "");
      } else {
        body.removeAttribute("hidden");
      }
    }
  };

  const handleToggle = (): void => {
    applyCollapsed(!collapsed);
  };

  const refreshStatusFromSimulation = (): void => {
    const state = currentSimState();
    if (state !== null) {
      writeStatus(state);
    }
  };

  const handleSpeedInput = (): void => {
    if (speedSlider === null) {
      return;
    }

    setTimeScale(logPositionToScale(Number(speedSlider.value)));
    writeStorage(SIM_STORAGE_KEYS.speed, values.timeScale);
    updateUrl();
    syncControls();
    refreshStatusFromSimulation();
  };

  const handleGravityInput = (): void => {
    if (gravitySlider === null) {
      return;
    }

    setGravityScale(logPositionToScale(Number(gravitySlider.value)));
    writeStorage(SIM_STORAGE_KEYS.gravity, values.gravityScale);
    updateUrl();
    syncControls();
    refreshStatusFromSimulation();
  };

  const handleBottomInput = (): void => {
    if (bottomSlider === null) {
      return;
    }

    setBottomThrusterScale(
      logPositionToScale(Number(bottomSlider.value)),
    );
    writeStorage(
      SIM_STORAGE_KEYS.bottomPower,
      values.bottomThrusterScale,
    );
    updateUrl();
    syncControls();
    refreshStatusFromSimulation();
  };

  const handleRearInput = (): void => {
    if (rearSlider === null) {
      return;
    }

    setRearThrusterScale(logPositionToScale(Number(rearSlider.value)));
    writeStorage(SIM_STORAGE_KEYS.rearPower, values.rearThrusterScale);
    updateUrl();
    syncControls();
    refreshStatusFromSimulation();
  };

  applyPersistedSettings();
  applyCollapsed(false);
  syncControls();

  toggle?.addEventListener("click", handleToggle);
  speedSlider?.addEventListener("input", handleSpeedInput);
  gravitySlider?.addEventListener("input", handleGravityInput);
  bottomSlider?.addEventListener("input", handleBottomInput);
  rearSlider?.addEventListener("input", handleRearInput);

  return {
    update(state?: SimState): void {
      const simulationState = currentSimState() ?? state ?? null;
      const timeScale = clampTimeScale(
        readTimeScale() ?? values.timeScale,
      );
      const gravityScale = clampGravityScale(
        options.getGravityScale?.() ??
          simulationState?.gravityScale ??
          values.gravityScale,
      );
      const bottomThrusterScale = clampThrusterScale(
        options.getBottomThrusterScale?.() ??
          simulationState?.bottomThrusterScale ??
          values.bottomThrusterScale,
      );
      const rearThrusterScale = clampThrusterScale(
        options.getRearThrusterScale?.() ??
          simulationState?.rearThrusterScale ??
          values.rearThrusterScale,
      );

      values = {
        timeScale,
        gravityScale,
        gravity:
          simulationState !== null &&
          Number.isFinite(simulationState.gravity)
            ? simulationState.gravity
            : GRAVITY * gravityScale,
        bottomThrusterScale,
        rearThrusterScale,
      };

      syncControls();

      if (simulationState !== null) {
        writeStatus(simulationState);
      }
    },

    setCollapsed: applyCollapsed,

    isCollapsed(): boolean {
      return collapsed;
    },

    getValues(): SimPanelValues {
      return { ...values };
    },

    dispose(): void {
      toggle?.removeEventListener("click", handleToggle);
      speedSlider?.removeEventListener("input", handleSpeedInput);
      gravitySlider?.removeEventListener("input", handleGravityInput);
      bottomSlider?.removeEventListener("input", handleBottomInput);
      rearSlider?.removeEventListener("input", handleRearInput);
    },
  };
}
