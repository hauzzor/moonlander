import type { SimState } from "@moonlander/sim";
import { getHudElement } from "./dom";

export interface HudController {
  update(state: SimState, autopilotActive: boolean): void;
}

function setHudValue(
  element: HTMLElement,
  dataValue: string,
  displayValue: string,
): void {
  element.setAttribute("data-value", dataValue);
  const value = element.querySelector(".hud-value");
  if (value instanceof HTMLElement) {
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
  const autopilotValue = autopilotStatus.querySelector(".autopilot-value");
  const seedDisplay = getHudElement("seed-display");
  const outcome = getHudElement("outcome");
  const outcomeText = outcome.querySelector(".outcome-text");
  const outcomeScore = outcome.querySelector(".outcome-score-value");

  const updateOutcome = (state: SimState): void => {
    const destroyed = state.outcome === "destroyed";
    outcome.classList.toggle("hidden", !destroyed);
    outcome.setAttribute("aria-hidden", String(!destroyed));

    if (!destroyed) {
      return;
    }

    if (outcomeText instanceof HTMLElement) {
      outcomeText.textContent = "Starship Destroyed";
    }
    if (outcomeScore instanceof HTMLElement) {
      outcomeScore.textContent = String(state.score);
    }
  };

  return {
    update(state: SimState, autopilotActive: boolean): void {
      const speed = Math.hypot(state.ship.velocity.x, state.ship.velocity.y);
      const progress = Math.max(0, Math.floor(state.progress));
      const flying = state.outcome === "flying";
      const leftActive = flying && state.thrusters.left;
      const rightActive = flying && state.thrusters.right;
      const rearActive = flying && state.thrusters.rear;

      setHudValue(hudHull, String(state.hull), String(Math.round(state.hull)));
      setHudValue(hudSpeed, String(speed), speed.toFixed(1));
      setHudValue(hudProgress, String(progress), String(progress));
      setHudValue(hudScore, String(state.score), String(state.score));

      thrusterLeft.setAttribute("data-active", String(leftActive));
      thrusterRight.setAttribute("data-active", String(rightActive));
      thrusterRear.setAttribute("data-active", String(rearActive));
      hudHull.classList.toggle("hud-critical", state.hull <= 30);

      autopilotStatus.setAttribute("data-active", String(autopilotActive));
      autopilotStatus.classList.toggle("autopilot-on", autopilotActive);
      if (autopilotValue instanceof HTMLElement) {
        autopilotValue.textContent = autopilotActive
          ? "AUTOPILOT"
          : "MANUAL";
      }

      seedDisplay.textContent = String(state.seed);
      updateOutcome(state);
    },
  };
}
