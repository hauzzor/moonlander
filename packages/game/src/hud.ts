import type { Action, SimState } from "@moonlander/sim";
import { getHudElement } from "./dom";

export interface HudController {
  update(state: SimState, autopilotActive: boolean): void;
}

export interface HudValues {
  hull: number;
  speed: number;
  progress: number;
  score: number;
  thrusters: Action;
  autopilotActive: boolean;
}

export function computeHudValues(
  state: SimState,
  autopilotActive: boolean,
): HudValues {
  const flying = state.outcome === "flying";

  return {
    hull: state.hull,
    speed: Math.hypot(state.ship.velocity.x, state.ship.velocity.y),
    progress: Math.max(0, Math.floor(state.progress)),
    score: state.score,
    thrusters: {
      left: flying && state.thrusters.left,
      right: flying && state.thrusters.right,
      rear: flying && state.thrusters.rear,
    },
    autopilotActive,
  };
}

function findChild(
  element: HTMLElement,
  selector: string,
): HTMLElement | null {
  if (typeof element.querySelector !== "function") {
    return null;
  }

  const child = element.querySelector(selector);
  return child === null ? null : (child as HTMLElement);
}

function queryHudElement(testId: string): HTMLElement | null {
  if (
    typeof document === "undefined" ||
    typeof document.querySelector !== "function"
  ) {
    return null;
  }

  const element = document.querySelector(`[data-testid="${testId}"]`);
  return element === null ? null : (element as HTMLElement);
}

function toggleClass(
  element: HTMLElement,
  name: string,
  force: boolean,
): void {
  const classList = element.classList as DOMTokenList | undefined;

  if (classList !== undefined && typeof classList.toggle === "function") {
    classList.toggle(name, force);
  }
}

function setHudValue(
  element: HTMLElement,
  dataValue: number,
  displayValue: string,
): void {
  element.setAttribute("data-value", String(dataValue));
  const value = findChild(element, ".hud-value");

  if (value !== null) {
    value.textContent = displayValue;
  }
}

export function createHud(): HudController {
  const hudHull = getHudElement("hud-hull");
  const hudSpeed = getHudElement("hud-speed");
  const hudProgress = getHudElement("hud-progress");
  const hudScore = getHudElement("hud-score");
  const thrusterLeft = getHudElement("thruster-left");
  const thrusterRight = getHudElement("thruster-right");
  const thrusterRear = getHudElement("thruster-rear");
  const autopilotStatus = getHudElement("autopilot-status");
  const autopilotValue = findChild(autopilotStatus, ".autopilot-value");
  const radarStatus = queryHudElement("radar-status");
  const seedDisplay = getHudElement("seed-display");
  const outcome = getHudElement("outcome");
  const outcomeText = findChild(outcome, ".outcome-text");
  const outcomeScore = findChild(outcome, ".outcome-score-value");

  const updateOutcome = (state: SimState): void => {
    const destroyed = state.outcome === "destroyed";
    toggleClass(outcome, "hidden", !destroyed);
    outcome.setAttribute("aria-hidden", String(!destroyed));

    if (!destroyed) {
      return;
    }

    if (outcomeText !== null) {
      outcomeText.textContent = "Starship Destroyed";
    }

    if (outcomeScore !== null) {
      outcomeScore.textContent = String(state.score);
    }
  };

  return {
    update(state: SimState, autopilotActive: boolean): void {
      const values = computeHudValues(state, autopilotActive);

      setHudValue(hudHull, values.hull, String(Math.round(values.hull)));
      setHudValue(hudSpeed, values.speed, values.speed.toFixed(1));
      setHudValue(hudProgress, values.progress, String(values.progress));
      setHudValue(hudScore, values.score, String(values.score));

      thrusterLeft.setAttribute(
        "data-active",
        String(values.thrusters.left),
      );
      thrusterRight.setAttribute(
        "data-active",
        String(values.thrusters.right),
      );
      thrusterRear.setAttribute(
        "data-active",
        String(values.thrusters.rear),
      );

      toggleClass(hudHull, "hud-critical", values.hull <= 30);

      autopilotStatus.setAttribute(
        "data-active",
        String(values.autopilotActive),
      );
      toggleClass(
        autopilotStatus,
        "autopilot-on",
        values.autopilotActive,
      );

      if (autopilotValue !== null) {
        autopilotValue.textContent = values.autopilotActive
          ? "AUTOPILOT"
          : "MANUAL";
      }

      radarStatus?.setAttribute(
        "data-active",
        String(values.autopilotActive),
      );

      seedDisplay.textContent = String(state.seed);
      updateOutcome(state);
    },
  };
}
