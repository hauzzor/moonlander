import {
  GRAVITY,
  createSimulation,
  type EyeSensorReading,
  type Field,
  type LevelId,
  type SimState,
  type Vec2,
  type World,
} from "@moonlander/sim";
import {
  FakeElement,
  FakeHTMLInputElement,
  installFakeDom,
  type FakeCanvasElement,
  type FakeDialogElement,
  type FakeDom,
} from "./fake-dom";

export interface StateOverrides {
  position?: Vec2;
  velocity?: Vec2;
  angle?: number;
  angularVelocity?: number;
  hull?: number;
  invulnerable?: boolean;
  thrusters?: Partial<SimState["thrusters"]>;
  outcome?: SimState["outcome"];
  score?: number;
  progress?: number;
  seed?: number;
  time?: number;
  tick?: number;
  level?: SimState["level"];
  planets?: SimState["planets"];
  eyeSensorRadius?: number;
  gravityScale?: number;
  gravity?: number;
  gravityAcceleration?: Vec2;
  bottomThrusterScale?: number;
  rearThrusterScale?: number;
  topThrusterScale?: number;
}

export const START_POSITION: Vec2 = { x: 0, y: 60 };

export function makeState(overrides: StateOverrides = {}): SimState {
  const position = overrides.position ?? START_POSITION;
  const velocity = overrides.velocity ?? { x: 0, y: 0 };
  const radius = overrides.eyeSensorRadius ?? 120;
  const gravityScale = overrides.gravityScale ?? 1;
  const gravity = overrides.gravity ?? GRAVITY * gravityScale;
  const eye: EyeSensorReading = {
    radius,
    tick: overrides.tick ?? 0,
    origin: position,
    heading: overrides.angle ?? 0,
    distances: Array.from({ length: 360 }, () => radius),
  };

  return {
    tick: overrides.tick ?? 0,
    time: overrides.time ?? 0,
    seed: overrides.seed ?? 1,
    level: overrides.level ?? "sandworm",
    ship: {
      position,
      velocity,
      angle: overrides.angle ?? 0,
      angularVelocity: overrides.angularVelocity ?? 0,
    },
    hull: overrides.hull ?? 100,
    invulnerable: overrides.invulnerable ?? false,
    thrusters: {
      left: overrides.thrusters?.left ?? false,
      right: overrides.thrusters?.right ?? false,
      rear: overrides.thrusters?.rear ?? false,
      top: overrides.thrusters?.top ?? false,
    },
    outcome: overrides.outcome ?? "flying",
    score: overrides.score ?? 0,
    progress: overrides.progress ?? 0,
    planets: overrides.planets ?? [],
    eyeSensorRadius: radius,
    gravityScale,
    gravity,
    gravityAcceleration: overrides.gravityAcceleration ?? {
      x: 0,
      y: -gravity,
    },
    bottomThrusterScale: overrides.bottomThrusterScale ?? 1,
    rearThrusterScale: overrides.rearThrusterScale ?? 1,
    topThrusterScale: overrides.topThrusterScale ?? 1,
    sensors: {
      eye,
      direction: { angle: overrides.angle ?? 0 },
      distanceToStart: Math.hypot(
        position.x - START_POSITION.x,
        position.y - START_POSITION.y,
      ),
      velocity: {
        vx: velocity.x,
        vy: velocity.y,
        speed: Math.hypot(velocity.x, velocity.y),
        angle: Math.atan2(velocity.y, velocity.x),
      },
    },
  };
}

export interface GameFixtureOptions {
  search?: string;
  storage?: Record<string, string>;
  href?: string;
}

export interface GameFixture {
  dom: FakeDom;
  seedInput: FakeHTMLInputElement;
  seedLoad: FakeElement;
  seedCopy: FakeElement;
  chart: FakeCanvasElement;
  slider: FakeHTMLInputElement;
  panel: FakeElement;
  radarStatus: FakeElement;
  changelogButton: FakeElement;
  changelogDialog: FakeDialogElement;
  changelogClose: FakeElement;
  changelogList: FakeElement;
  simPanel: FakeElement;
  simToggle: FakeElement;
  simSpeed: FakeHTMLInputElement;
  gravityScale: FakeHTMLInputElement;
  bottomPower: FakeHTMLInputElement;
  rearPower: FakeHTMLInputElement;
  simSpeedValue: FakeElement;
  gravityScaleValue: FakeElement;
  bottomPowerValue: FakeElement;
  rearPowerValue: FakeElement;
  simulationStatus: FakeElement;
  startMenu: FakeElement;
  levelCards: Record<LevelId, FakeElement>;
  levelStart: FakeElement;
  levelName: FakeElement;
  hudLevel: FakeElement;
  gameMenuButton: FakeElement;
  gameMenu: FakeElement;
  menuResume: FakeElement;
  menuRestart: FakeElement;
  menuReturn: FakeElement;
}

function addClassedChild(
  parent: FakeElement,
  className: string,
): FakeElement {
  const child = new FakeElement("span");
  child.classList.add(className);
  return parent.appendChild(child);
}

function addRange(
  fakeDom: FakeDom,
  testId: string,
  parent: FakeElement,
): FakeHTMLInputElement {
  const input = fakeDom.addInput(testId);
  input.type = "range";
  input.setAttribute("type", "range");
  input.min = "-1";
  input.max = "1";
  input.step = "0.05";
  input.value = "0";
  parent.appendChild(input);
  return input;
}

export function installGameFixture(
  options: GameFixtureOptions = {},
): GameFixture {
  const fakeDom = installFakeDom({ dpr: 1, width: 800, height: 600 });

  const seedInput = fakeDom.addInput("seed-input");
  const seedLoad = fakeDom.addElement("seed-load", "button");
  const seedCopy = new FakeElement("button");
  seedCopy.setAttribute("id", "seed-copy");

  const querySelector = fakeDom.document.querySelector.bind(fakeDom.document);
  fakeDom.document.querySelector = (selector: string) =>
    selector === "#seed-copy" ? seedCopy : querySelector(selector);

  for (const testId of [
    "hud-hull",
    "hud-speed",
    "hud-progress",
    "hud-score",
  ]) {
    addClassedChild(fakeDom.addElement(testId), "hud-value");
  }

  for (const testId of [
    "thruster-left",
    "thruster-right",
    "thruster-rear",
  ]) {
    fakeDom.addElement(testId);
  }

  addClassedChild(
    fakeDom.addElement("autopilot-status"),
    "autopilot-value",
  );
  fakeDom.addElement("seed-display");

  const outcome = fakeDom.addElement("outcome");
  outcome.classList.add("hidden");
  outcome.setAttribute("aria-hidden", "true");
  addClassedChild(outcome, "outcome-text");
  addClassedChild(outcome, "outcome-score-value");

  const panel = fakeDom.addElement("eye-sensor-panel", "aside");
  const chart = fakeDom.addCanvas("eye-sensor-chart");
  chart.clientWidth = 374;
  chart.clientHeight = 138;
  const slider = fakeDom.addInput("eye-sensor-radius");
  slider.type = "range";
  slider.setAttribute("type", "range");
  slider.min = "20";
  slider.max = "200";
  slider.step = "5";
  slider.value = "120";
  panel.appendChild(chart);
  panel.appendChild(slider);
  fakeDom.addElement("radar-status");

  for (const testId of [
    "eye-sensor-radius-value",
    "eye-sensor-scan-tick",
    "direction-needle",
    "direction-value",
    "distance-to-start",
    "velocity-speed",
    "velocity-vx",
    "velocity-vy",
    "velocity-angle",
  ]) {
    fakeDom.addElement(testId);
  }

  const simPanel = fakeDom.addElement("sim-panel", "aside");
  simPanel.classList.add("sim-panel");
  const simToggle = fakeDom.addElement("sim-panel-toggle", "button");
  simPanel.appendChild(simToggle);
  const simSpeed = addRange(fakeDom, "sim-speed", simPanel);
  const gravityScale = addRange(fakeDom, "gravity-scale", simPanel);
  const bottomPower = addRange(fakeDom, "bottom-power", simPanel);
  const rearPower = addRange(fakeDom, "rear-power", simPanel);
  const simSpeedValue = fakeDom.addElement("sim-speed-value", "output");
  const gravityScaleValue = fakeDom.addElement(
    "gravity-scale-value",
    "output",
  );
  const bottomPowerValue = fakeDom.addElement(
    "bottom-power-value",
    "output",
  );
  const rearPowerValue = fakeDom.addElement("rear-power-value", "output");
  simPanel.appendChild(simSpeedValue);
  simPanel.appendChild(gravityScaleValue);
  simPanel.appendChild(bottomPowerValue);
  simPanel.appendChild(rearPowerValue);
  const simulationStatus = fakeDom.addElement("simulation-status", "span");
  simPanel.appendChild(simulationStatus);

  const levelNames: Record<LevelId, string> = {
    sandworm: "Inside the Sandworm's Gut",
    gravity: "Gravity",
    "anti-gravity": "Anti Gravity",
  };

  const startMenu = fakeDom.addElement("start-menu", "section");
  startMenu.classList.add("start-menu");
  const levelCards = {} as Record<LevelId, FakeElement>;
  for (const level of Object.keys(levelNames) as LevelId[]) {
    const card = fakeDom.addElement(`level-card-${level}`, "button");
    card.classList.add("level-card");
    card.setAttribute("data-level", level);
    card.setAttribute("data-selected", "false");
    card.textContent = levelNames[level];
    startMenu.appendChild(card);
    levelCards[level] = card;
  }
  const levelStart = fakeDom.addElement("level-start", "button");
  levelStart.classList.add("level-start");
  startMenu.appendChild(levelStart);
  const levelName = fakeDom.addElement("level-name");
  addClassedChild(levelName, "level-name-value");
  startMenu.appendChild(levelName);

  const hudLevel = fakeDom.addElement("hud-level");
  hudLevel.setAttribute("data-level", "sandworm");
  const hudLevelValue = addClassedChild(hudLevel, "hud-value");
  hudLevelValue.textContent = levelNames.sandworm;

  const gameMenuButton = fakeDom.addElement("game-menu-button", "button");
  const gameMenu = fakeDom.addElement("game-menu", "div");
  gameMenu.classList.add("game-menu", "hidden");
  gameMenu.setAttribute("data-open", "false");
  gameMenu.setAttribute("aria-hidden", "true");
  gameMenu.hidden = true;
  const menuResume = fakeDom.addElement("menu-resume", "button");
  const menuRestart = fakeDom.addElement("menu-restart", "button");
  const menuReturn = fakeDom.addElement("menu-return", "button");
  gameMenu.appendChild(menuResume);
  gameMenu.appendChild(menuRestart);
  gameMenu.appendChild(menuReturn);

  const changelogButton = fakeDom.addElement("changelog-button", "button");
  const changelogDialog = fakeDom.addDialog("changelog-dialog");
  const changelogClose = fakeDom.addElement("changelog-close", "button");
  const changelogList = fakeDom.addElement("changelog-list", "div");

  fakeDom.window.location.href =
    options.href ?? `http://localhost/${options.search ?? ""}`;

  for (const [key, value] of Object.entries(options.storage ?? {})) {
    fakeDom.window.localStorage.setItem(key, value);
  }

  return {
    dom: fakeDom,
    seedInput,
    seedLoad,
    seedCopy,
    chart,
    slider,
    panel,
    radarStatus: fakeDom.document.element("radar-status")!,
    changelogButton,
    changelogDialog,
    changelogClose,
    changelogList,
    simPanel,
    simToggle,
    simSpeed,
    gravityScale,
    bottomPower,
    rearPower,
    simSpeedValue,
    gravityScaleValue,
    bottomPowerValue,
    rearPowerValue,
    simulationStatus,
    startMenu,
    levelCards,
    levelStart,
    levelName,
    hudLevel,
    gameMenuButton,
    gameMenu,
    menuResume,
    menuRestart,
    menuReturn,
  };
}

export function worldFor(field: Field): World {
  return createSimulation({ seed: field.seed, field }).world;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
