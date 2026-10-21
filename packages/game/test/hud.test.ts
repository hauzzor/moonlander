import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SimState } from "@moonlander/sim";
import {
  computeHudValues,
  createHud,
  type HudController,
} from "../src/hud";
import {
  FakeElement,
  installFakeDom,
  type FakeDom,
} from "./fake-dom";
import { makeState } from "./fixtures";

interface HudFixture {
  dom: FakeDom;
  hull: FakeElement;
  hullValue: FakeElement;
  speed: FakeElement;
  speedValue: FakeElement;
  progress: FakeElement;
  progressValue: FakeElement;
  score: FakeElement;
  scoreValue: FakeElement;
  thrusterLeft: FakeElement;
  thrusterRight: FakeElement;
  thrusterRear: FakeElement;
  autopilot: FakeElement;
  autopilotValue: FakeElement;
  radarStatus: FakeElement;
  seedDisplay: FakeElement;
  outcome: FakeElement;
  outcomeText: FakeElement;
  outcomeScore: FakeElement;
}

function addClassedChild(
  parent: FakeElement,
  className: string,
): FakeElement {
  const child = new FakeElement("span");
  child.classList.add(className);
  return parent.appendChild(child);
}

function installHudFixture(): HudFixture {
  const dom = installFakeDom();

  const hull = dom.addElement("hud-hull");
  const hullValue = addClassedChild(hull, "hud-value");
  const speed = dom.addElement("hud-speed");
  const speedValue = addClassedChild(speed, "hud-value");
  const progress = dom.addElement("hud-progress");
  const progressValue = addClassedChild(progress, "hud-value");
  const score = dom.addElement("hud-score");
  const scoreValue = addClassedChild(score, "hud-value");

  const thrusterLeft = dom.addElement("thruster-left");
  const thrusterRight = dom.addElement("thruster-right");
  const thrusterRear = dom.addElement("thruster-rear");

  const autopilot = dom.addElement("autopilot-status");
  const autopilotValue = addClassedChild(autopilot, "autopilot-value");
  const radarStatus = dom.addElement("radar-status");

  const seedDisplay = dom.addElement("seed-display");

  const outcome = dom.addElement("outcome");
  outcome.classList.add("hidden");
  outcome.setAttribute("aria-hidden", "true");
  const outcomeText = addClassedChild(outcome, "outcome-text");
  const outcomeScore = addClassedChild(outcome, "outcome-score-value");

  return {
    dom,
    hull,
    hullValue,
    speed,
    speedValue,
    progress,
    progressValue,
    score,
    scoreValue,
    thrusterLeft,
    thrusterRight,
    thrusterRear,
    autopilot,
    autopilotValue,
    radarStatus,
    seedDisplay,
    outcome,
    outcomeText,
    outcomeScore,
  };
}

function numericValue(element: FakeElement): number {
  const raw = element.getAttribute("data-value");
  expect(raw).not.toBeNull();
  const value = Number(raw);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

let fixture: HudFixture;
let hud: HudController;

beforeEach(() => {
  fixture = installHudFixture();
  hud = createHud();
});

afterEach(() => {
  fixture.dom.restore();
});

describe("computeHudValues", () => {
  it.each([
    {
      name: "starting state",
      state: makeState(),
      autopilotActive: false,
      expected: {
        hull: 100,
        speed: 0,
        progress: 0,
        score: 0,
        thrusters: { left: false, right: false, rear: false },
        autopilotActive: false,
      },
    },
    {
      name: "fractional flight state",
      state: makeState({
        hull: 73.6,
        velocity: { x: 3, y: 4 },
        progress: 87.9,
        score: 87,
        thrusters: { left: true, right: false, rear: true },
      }),
      autopilotActive: true,
      expected: {
        hull: 73.6,
        speed: 5,
        progress: 87,
        score: 87,
        thrusters: { left: true, right: false, rear: true },
        autopilotActive: true,
      },
    },
    {
      name: "negative progress",
      state: makeState({ progress: -42.6 }),
      autopilotActive: false,
      expected: {
        hull: 100,
        speed: 0,
        progress: 0,
        score: 0,
        thrusters: { left: false, right: false, rear: false },
        autopilotActive: false,
      },
    },
    {
      name: "destroyed state",
      state: makeState({
        hull: 0,
        outcome: "destroyed",
        thrusters: { left: true, right: true, rear: true },
      }),
      autopilotActive: false,
      expected: {
        hull: 0,
        speed: 0,
        progress: 0,
        score: 0,
        thrusters: { left: false, right: false, rear: false },
        autopilotActive: false,
      },
    },
  ])("derives the displayed values for $name", ({ state, autopilotActive, expected }) => {
    expect(computeHudValues(state, autopilotActive)).toEqual(expected);
  });
});

describe("HUD formatting", () => {
  it.each([
    {
      name: "starting state",
      state: makeState(),
      expected: { hull: 100, speed: 0, progress: 0, score: 0 },
    },
    {
      name: "fractional flight state",
      state: makeState({
        hull: 73.6,
        velocity: { x: 3, y: 4 },
        progress: 87.9,
        score: 87,
        seed: 42,
      }),
      expected: { hull: 73.6, speed: 5, progress: 87, score: 87 },
    },
    {
      name: "negative progress clamps to zero",
      state: makeState({ progress: -12.7 }),
      expected: { hull: 100, speed: 0, progress: 0, score: 0 },
    },
    {
      name: "destroyed run",
      state: makeState({
        hull: 0,
        progress: 345.6,
        score: 345,
        outcome: "destroyed",
      }),
      expected: { hull: 0, speed: 0, progress: 345, score: 345 },
    },
  ])("reports $name through numeric data-value attributes", ({ state, expected }) => {
    hud.update(state, false);

    expect(numericValue(fixture.hull)).toBe(expected.hull);
    expect(numericValue(fixture.speed)).toBe(expected.speed);
    expect(numericValue(fixture.progress)).toBe(expected.progress);
    expect(numericValue(fixture.score)).toBe(expected.score);
  });

  it("formats the visible hull, speed, progress, and score text", () => {
    hud.update(
      makeState({
        hull: 73.6,
        velocity: { x: 3, y: 4 },
        progress: 87.9,
        score: 87,
      }),
      false,
    );

    expect(fixture.hullValue.textContent).toBe("74");
    expect(fixture.speedValue.textContent).toBe("5.0");
    expect(fixture.progressValue.textContent).toBe("87");
    expect(fixture.scoreValue.textContent).toBe("87");
  });

  it("reports progress in whole meters", () => {
    hud.update(makeState({ progress: 0.99 }), false);
    expect(numericValue(fixture.progress)).toBe(0);

    hud.update(makeState({ progress: 1.01 }), false);
    expect(numericValue(fixture.progress)).toBe(1);
  });

  it.each([
    {
      name: "flying left",
      state: makeState({ thrusters: { left: true } }),
      expected: { left: "true", right: "false", rear: "false" },
    },
    {
      name: "flying right",
      state: makeState({ thrusters: { right: true } }),
      expected: { left: "false", right: "true", rear: "false" },
    },
    {
      name: "flying with the rear latch on",
      state: makeState({ thrusters: { rear: true } }),
      expected: { left: "false", right: "false", rear: "true" },
    },
    {
      name: "destroyed with the last action visible",
      state: makeState({
        outcome: "destroyed",
        thrusters: { left: true, right: true, rear: true },
      }),
      expected: { left: "false", right: "false", rear: "false" },
    },
  ])("marks thruster activity for $name", ({ state, expected }) => {
    hud.update(state, false);

    expect(fixture.thrusterLeft.getAttribute("data-active")).toBe(expected.left);
    expect(fixture.thrusterRight.getAttribute("data-active")).toBe(
      expected.right,
    );
    expect(fixture.thrusterRear.getAttribute("data-active")).toBe(expected.rear);
  });

  it.each([
    {
      name: "manual",
      active: false,
      expectedActive: "false",
      expectedText: "MANUAL",
      expectedClass: false,
    },
    {
      name: "autopilot",
      active: true,
      expectedActive: "true",
      expectedText: "AUTOPILOT",
      expectedClass: true,
    },
  ])(
    "reports $name pilot status",
    ({ active, expectedActive, expectedText, expectedClass }) => {
      hud.update(makeState(), active);

      expect(fixture.autopilot.getAttribute("data-active")).toBe(
        expectedActive,
      );
      expect(fixture.autopilot.classList.contains("autopilot-on")).toBe(
        expectedClass,
      );
      expect(fixture.autopilotValue.textContent).toBe(expectedText);
    },
  );

  it.each([
    { name: "manual", active: false, expected: "false" },
    { name: "autopilot", active: true, expected: "true" },
  ])(
    "reports the radar status as $expected while $name",
    ({ active, expected }) => {
      hud.update(makeState(), active);

      expect(fixture.radarStatus.getAttribute("data-active")).toBe(expected);
    },
  );

  it("keeps the radar status off while destroyed in manual mode", () => {
    hud.update(makeState({ hull: 0, outcome: "destroyed" }), false);

    expect(fixture.radarStatus.getAttribute("data-active")).toBe("false");
  });

  it("adds the critical hull class at or below 30 hull points", () => {
    hud.update(makeState({ hull: 30.1 }), false);
    expect(fixture.hull.classList.contains("hud-critical")).toBe(false);

    hud.update(makeState({ hull: 30 }), false);
    expect(fixture.hull.classList.contains("hud-critical")).toBe(true);

    hud.update(makeState({ hull: 100 }), false);
    expect(fixture.hull.classList.contains("hud-critical")).toBe(false);
  });

  it("displays the current seed", () => {
    hud.update(makeState({ seed: 4294967295 }), false);
    expect(fixture.seedDisplay.textContent).toBe("4294967295");

    hud.update(makeState({ seed: 0 }), false);
    expect(fixture.seedDisplay.textContent).toBe("0");
  });
});

describe("HUD outcome overlay", () => {
  const flying = makeState();
  const destroyed: SimState = makeState({
    outcome: "destroyed",
    hull: 0,
    score: 321,
  });

  it("stays hidden while flying", () => {
    hud.update(flying, false);

    expect(fixture.outcome.classList.contains("hidden")).toBe(true);
    expect(fixture.outcome.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the destroyed outcome with the final score", () => {
    hud.update(destroyed, false);

    expect(fixture.outcome.classList.contains("hidden")).toBe(false);
    expect(fixture.outcome.getAttribute("aria-hidden")).toBe("false");
    expect(fixture.outcomeText.textContent).toMatch(/destroyed/i);
    expect(fixture.outcomeScore.textContent).toBe("321");
  });

  it("hides and resets the outcome after a new run", () => {
    hud.update(destroyed, false);
    expect(fixture.outcome.classList.contains("hidden")).toBe(false);

    hud.update(makeState(), false);

    expect(fixture.outcome.classList.contains("hidden")).toBe(true);
    expect(fixture.outcome.getAttribute("aria-hidden")).toBe("true");
    expect(numericValue(fixture.hull)).toBe(100);
    expect(numericValue(fixture.score)).toBe(0);
    expect(numericValue(fixture.progress)).toBe(0);
  });
});
