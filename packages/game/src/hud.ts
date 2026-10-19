import type { SimState } from "@moonlander/sim";
import { getHudElement } from "./dom";

export interface HudController {
  update(state: SimState): void;
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
    update(state: SimState): void {
      const speed = Math.hypot(state.ship.velocity.x, state.ship.velocity.y);
      const progress = Math.max(0, Math.floor(state.progress));
      const leftActive = state.outcome === "flying" && state.thrusters.left;
      const rightActive = state.outcome === "flying" && state.thrusters.right;

      setHudValue(hudHull, String(state.hull), String(Math.round(state.hull)));
      setHudValue(hudSpeed, String(speed), speed.toFixed(1));
      setHudValue(hudProgress, String(progress), String(progress));
      setHudValue(hudScore, String(state.score), String(state.score));

      thrusterLeft.setAttribute("data-active", String(leftActive));
      thrusterRight.setAttribute("data-active", String(rightActive));
      hudHull.classList.toggle("hud-critical", state.hull <= 30);

      seedDisplay.textContent = String(state.seed);
      updateOutcome(state);
    },
  };
}
