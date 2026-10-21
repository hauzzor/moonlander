import { afterEach, describe, expect, it } from "vitest";
import { FIXED_DT, type LevelId } from "@moonlander/sim";
import { createGame, type Game } from "../src/game";
import {
  LEVELS as MENU_LEVELS,
  createMenu,
  isLevelId,
  levelName,
  parseLevel,
} from "../src/menu";
import { MAX_SEED, nextSeed } from "../src/seed";
import { FakeElement } from "./fake-dom";
import {
  installGameFixture,
  type GameFixture,
} from "./fixtures";

const LEVEL_NAMES: Record<LevelId, string> = {
  sandworm: "Inside the Sandworm's Gut",
  gravity: "Gravity",
  "anti-gravity": "Anti Gravity",
};

const LEVELS = Object.keys(LEVEL_NAMES) as LevelId[];

let fixture: GameFixture;

function setup(search = ""): Game {
  fixture = installGameFixture({ search });
  return createGame();
}

function elementIsHidden(element: FakeElement): boolean {
  return (
    element.hidden ||
    element.hasAttribute("hidden") ||
    element.classList.contains("hidden") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.style.getPropertyValue("display").trim().toLowerCase() === "none"
  );
}

function expectShown(element: FakeElement): void {
  expect(elementIsHidden(element)).toBe(false);
}

function expectHidden(element: FakeElement): void {
  expect(elementIsHidden(element)).toBe(true);
}

function click(element: FakeElement): void {
  element.dispatch("click", { target: element });
}

function press(key: string, code = ""): void {
  fixture.dom.window.dispatch("keydown", {
    key,
    code,
    target: fixture.dom.window,
  });
}

function pressEscape(): void {
  press("Escape", "Escape");
}

function startFromMenu(level: LevelId = "sandworm"): void {
  click(fixture.levelCards[level]);
  click(fixture.levelStart);
}

function urlParams(): URLSearchParams {
  return new URLSearchParams(fixture.dom.window.location.search);
}

function advanceTicks(game: Game, count = 1): number {
  let steps = 0;

  for (let index = 0; index < count; index += 1) {
    steps += game.advance(FIXED_DT + 1e-9);
  }

  return steps;
}

afterEach(() => {
  fixture?.dom.restore();
});

describe("T-0024 start menu boot and level selection", () => {
  it("boots to the start menu without ticking the simulation", () => {
    const game = setup();

    expectShown(fixture.startMenu);
    expectHidden(fixture.gameMenu);

    const tick = game.getState().tick;
    expect(game.advance(1)).toBe(0);
    expect(game.getState().tick).toBe(tick);
    expect(tick).toBe(0);
  });

  it("ignores game keys while the start menu is open", () => {
    const game = setup();
    const seedBefore = game.getSeed();

    press("q", "KeyQ");
    press("w", "KeyW");
    press(" ", "Space");
    press("e", "KeyE");
    press("r", "KeyR");

    expect(game.input.keys).toEqual({
      left: false,
      right: false,
      rear: false,
    });
    expect(game.isAutopilotActive()).toBe(false);
    expect(game.getSeed()).toBe(seedBefore);
    expect(game.advance(1)).toBe(0);
  });

  it("lists the three free level cards with their display names", () => {
    setup();

    for (const level of LEVELS) {
      const card = fixture.levelCards[level];

      expect(card.getAttribute("data-level")).toBe(level);
      expect(card.textContent).toContain(LEVEL_NAMES[level]);
      expect(card.disabled).toBe(false);
      expect(card.getAttribute("data-locked")).not.toBe("true");
    }

    expect(fixture.levelCards.sandworm.textContent).toBe(
      "Inside the Sandworm's Gut",
    );
    expect(fixture.levelCards.gravity.textContent).toBe("Gravity");
    expect(fixture.levelCards["anti-gravity"].textContent).toBe("Anti Gravity");
  });

  it.each(LEVELS)(
    "starts %s freely from the menu and closes the start menu",
    (level) => {
      const game = setup();

      startFromMenu(level);

      expectHidden(fixture.startMenu);
      expectHidden(fixture.gameMenu);
      expect(game.getState().level).toBe(level);
      expect(game.getState().tick).toBe(0);
      expect(fixture.hudLevel.getAttribute("data-level")).toBe(level);
      expect(fixture.hudLevel.textContent).toContain(LEVEL_NAMES[level]);

      expect(advanceTicks(game)).toBe(1);
      expect(game.getState().tick).toBe(1);
    },
  );

  it.each([
    { level: "sandworm" as const },
    { level: "gravity" as const },
    { level: "anti-gravity" as const },
  ])("auto-starts a valid ?level=$level deep link", ({ level }) => {
    const game = setup(`?level=${level}&seed=42`);

    expectHidden(fixture.startMenu);
    expect(game.getState().level).toBe(level);
    expect(game.getState().seed).toBe(42);
    expect(game.getSeed()).toBe(42);
    expect(fixture.hudLevel.getAttribute("data-level")).toBe(level);
    expect(advanceTicks(game)).toBe(1);
  });

  it.each(["wormhole", "", "Sandworm", "anti_gravity"])(
    "shows the start menu for the invalid level %j",
    (raw) => {
      const game = setup(`?level=${encodeURIComponent(raw)}`);

      expectShown(fixture.startMenu);
      expectHidden(fixture.gameMenu);
      expect(game.advance(1)).toBe(0);
      expect(game.getState().tick).toBe(0);
    },
  );

  it("honours ?seed= with a level deep link and preserves it in the URL", () => {
    const game = setup("?level=gravity&seed=305419896");

    expectHidden(fixture.startMenu);
    expect(game.getSeed()).toBe(305419896);
    expect(game.getState().seed).toBe(305419896);
    expect(urlParams().get("level")).toBe("gravity");
    expect(urlParams().get("seed")).toBe("305419896");
  });

  it("uses ?seed= when a level is selected from the menu", () => {
    const game = setup("?seed=42");

    expectShown(fixture.startMenu);
    startFromMenu("sandworm");

    expectHidden(fixture.startMenu);
    expect(game.getSeed()).toBe(42);
    expect(game.getState().seed).toBe(42);
    expect(urlParams().get("level")).toBe("sandworm");
    expect(urlParams().get("seed")).toBe("42");
  });

  it("creates a URL seed when the menu starts a level without ?seed=", () => {
    const game = setup();

    startFromMenu("gravity");

    const seed = urlParams().get("seed");
    expect(seed).not.toBeNull();

    const parsed = Number(seed);
    expect(Number.isSafeInteger(parsed)).toBe(true);
    expect(parsed).toBeGreaterThanOrEqual(0);
    expect(parsed).toBeLessThanOrEqual(MAX_SEED);
    expect(game.getSeed()).toBe(parsed);
    expect(game.getState().seed).toBe(parsed);
    expect(urlParams().get("level")).toBe("gravity");
  });

  it("writes level and seed while preserving every SIM parameter", () => {
    const game = setup(
      "?speed=2&gravity=0.5&bottomPower=0.25&rearPower=4",
    );

    expectShown(fixture.startMenu);
    startFromMenu("anti-gravity");

    const params = urlParams();
    expect(params.get("level")).toBe("anti-gravity");
    expect(params.get("seed")).toBe(String(game.getSeed()));
    expect(params.get("speed")).toBe("2");
    expect(params.get("gravity")).toBe("0.5");
    expect(params.get("bottomPower")).toBe("0.25");
    expect(params.get("rearPower")).toBe("4");
  });

  it("disables simulation ticks until a level starts even with SIM parameters", () => {
    const game = setup("?speed=10&gravity=1&bottomPower=1&rearPower=1");

    expectShown(fixture.startMenu);
    expect(game.advance(2)).toBe(0);
    expect(game.getState().tick).toBe(0);

    startFromMenu("sandworm");
    expect(advanceTicks(game)).toBeGreaterThan(0);
    expect(game.getState().tick).toBeGreaterThan(0);
  });
});

describe("T-0024 pause menu", () => {
  function startedGame(level: LevelId = "sandworm"): Game {
    const game = setup();
    startFromMenu(level);
    return game;
  }

  it("opens from the menu button and freezes ticks and held input", () => {
    const game = startedGame();
    advanceTicks(game, 4);
    press("q");
    press(" ", "Space");
    expect(game.input.keys.left).toBe(true);
    expect(game.input.keys.rear).toBe(true);

    click(fixture.gameMenuButton);

    expectShown(fixture.gameMenu);
    expect(game.input.keys).toEqual({
      left: false,
      right: false,
      rear: false,
    });

    const tick = game.getState().tick;
    expect(game.advance(2)).toBe(0);
    expect(game.getState().tick).toBe(tick);
  });

  it("resumes without a catch-up burst by resetting the accumulator", () => {
    const game = startedGame();
    advanceTicks(game, 2);

    click(fixture.gameMenuButton);
    expect(game.advance(5)).toBe(0);
    const pausedTick = game.getState().tick;

    click(fixture.menuResume);

    expectHidden(fixture.gameMenu);
    expect(game.advance(FIXED_DT * 0.5)).toBe(0);
    expect(game.getState().tick).toBe(pausedTick);
    expect(game.advance(FIXED_DT * 0.5 + 1e-9)).toBe(1);
    expect(game.getState().tick).toBe(pausedTick + 1);
  });

  it("restarts the current level with a new seed and a fresh run", () => {
    const game = startedGame("gravity");
    advanceTicks(game, 6);
    const seedBefore = game.getSeed();

    click(fixture.gameMenuButton);
    click(fixture.menuRestart);

    expectHidden(fixture.gameMenu);
    expect(game.getState().level).toBe("gravity");
    expect(game.getSeed()).not.toBe(seedBefore);
    expect(game.getSeed()).toBe(nextSeed(seedBefore));
    expect(game.getState().seed).toBe(game.getSeed());
    expect(game.getState().tick).toBe(0);
    expect(urlParams().get("level")).toBe("gravity");
    expect(urlParams().get("seed")).toBe(String(game.getSeed()));

    expect(advanceTicks(game)).toBe(1);
  });

  it("returns to the start menu and abandons the run", () => {
    const game = startedGame();
    advanceTicks(game, 5);

    click(fixture.gameMenuButton);
    click(fixture.menuReturn);

    expectShown(fixture.startMenu);
    expectHidden(fixture.gameMenu);
    expect(urlParams().get("level")).toBeNull();
    expect(urlParams().get("seed")).toBeNull();
    expect(game.advance(2)).toBe(0);
  });

  it("toggles with Escape and returns focus to the menu button", () => {
    const game = startedGame();
    advanceTicks(game);

    pressEscape();
    expectShown(fixture.gameMenu);
    expect(game.advance(1)).toBe(0);

    pressEscape();
    expectHidden(fixture.gameMenu);
    expect(fixture.dom.document.activeElement).toBe(fixture.gameMenuButton);
  });

  it("ignores Q, W, E, R, and Space while the pause menu is open", () => {
    const game = startedGame();
    const seedBefore = game.getSeed();

    click(fixture.gameMenuButton);
    press("q", "KeyQ");
    press("w", "KeyW");
    press(" ", "Space");
    press("e", "KeyE");
    press("r", "KeyR");

    expect(game.input.keys).toEqual({
      left: false,
      right: false,
      rear: false,
    });
    expect(game.isAutopilotActive()).toBe(false);
    expect(game.getSeed()).toBe(seedBefore);
    expect(game.advance(1)).toBe(0);
    expect(game.getState().tick).toBe(0);
  });

  it("exposes Resume, Restart, and Return from the pause menu", () => {
    const game = startedGame();
    advanceTicks(game, 3);

    click(fixture.gameMenuButton);
    expectShown(fixture.gameMenu);
    expectShown(fixture.menuResume);
    expectShown(fixture.menuRestart);
    expectShown(fixture.menuReturn);
    expectShown(fixture.gameMenuButton);

    click(fixture.menuResume);
    expectHidden(fixture.gameMenu);
  });

  it("does not open the pause menu while the changelog is open", () => {
    startedGame();

    click(fixture.changelogButton);
    expect(fixture.changelogDialog.hasAttribute("open")).toBe(true);

    pressEscape();

    expectHidden(fixture.gameMenu);
  });
});

describe("T-0024 menu helpers", () => {
  it("parses only the documented level ids", () => {
    expect(parseLevel("sandworm")).toBe("sandworm");
    expect(parseLevel("gravity")).toBe("gravity");
    expect(parseLevel("anti-gravity")).toBe("anti-gravity");
    expect(parseLevel("  gravity  ")).toBe("gravity");

    for (const invalid of [
      null,
      undefined,
      "",
      " ",
      "Sandworm",
      "ANTI-GRAVITY",
      "anti_gravity",
      "wormhole",
    ]) {
      expect(parseLevel(invalid)).toBeNull();
    }
  });

  it("recognises levels and exposes stable display names", () => {
    for (const level of MENU_LEVELS) {
      expect(isLevelId(level.id)).toBe(true);
      expect(levelName(level.id)).toBe(level.name);
    }

    expect(MENU_LEVELS.map((level) => level.id)).toEqual([
      "sandworm",
      "gravity",
      "anti-gravity",
    ]);
    expect(levelName("sandworm")).toBe("Inside the Sandworm's Gut");
    expect(levelName("gravity")).toBe("Gravity");
    expect(levelName("anti-gravity")).toBe("Anti Gravity");

    expect(isLevelId("sandworm")).toBe(true);
    expect(isLevelId("gravity")).toBe(true);
    expect(isLevelId("anti-gravity")).toBe(true);
    expect(isLevelId("wormhole")).toBe(false);
    expect(isLevelId(null)).toBe(false);
  });

  it("tracks start and pause state and blocks game keys", () => {
    fixture = installGameFixture({ search: "" });
    const menu = createMenu({ onStartLevel: () => undefined });

    expect(menu.hasStartMenu()).toBe(true);
    expect(menu.isStartOpen()).toBe(false);
    expect(menu.isPauseOpen()).toBe(false);
    expect(menu.blocksGameKeys()).toBe(false);

    menu.openStart();
    expect(menu.isStartOpen()).toBe(true);
    expect(menu.blocksGameKeys()).toBe(true);
    menu.closeStart();
    expect(menu.isStartOpen()).toBe(false);
    expect(menu.blocksGameKeys()).toBe(false);

    menu.openPause();
    expect(menu.isPauseOpen()).toBe(true);
    expect(menu.blocksGameKeys()).toBe(true);
    menu.closePause();
    expect(menu.isPauseOpen()).toBe(false);
    expect(menu.blocksGameKeys()).toBe(false);

    menu.dispose();
  });

  it("selects a card and starts exactly the selected level", () => {
    fixture = installGameFixture({ search: "" });
    const started: LevelId[] = [];
    const menu = createMenu({
      onStartLevel: (level) => {
        started.push(level);
      },
    });

    menu.openStart();
    click(fixture.levelCards.gravity);
    expect(started).toEqual([]);
    expect(fixture.levelCards.gravity.getAttribute("data-selected")).toBe(
      "true",
    );
    expect(fixture.levelStart.getAttribute("data-level")).toBe("gravity");

    click(fixture.levelStart);

    expect(started).toEqual(["gravity"]);
    expect(menu.isStartOpen()).toBe(false);

    menu.dispose();
  });

  it("wires resume, restart, and return and restores menu focus", () => {
    fixture = installGameFixture({ search: "" });
    let resumed = 0;
    let restarted = 0;
    let returned = 0;
    const menu = createMenu({
      onStartLevel: () => undefined,
      onResume: () => {
        resumed += 1;
      },
      onRestart: () => {
        restarted += 1;
      },
      onReturn: () => {
        returned += 1;
      },
    });

    menu.openPause();
    click(fixture.menuResume);
    expect(resumed).toBe(1);
    expect(menu.isPauseOpen()).toBe(false);
    expect(fixture.dom.document.activeElement).toBe(fixture.gameMenuButton);

    menu.openPause();
    click(fixture.menuRestart);
    expect(restarted).toBe(1);

    menu.openPause();
    click(fixture.menuReturn);
    expect(returned).toBe(1);

    menu.dispose();
  });

  it("toggles the pause menu with Escape but never opens it over the start menu", () => {
    fixture = installGameFixture({ search: "" });
    const menu = createMenu({ onStartLevel: () => undefined });

    pressEscape();
    expect(menu.isPauseOpen()).toBe(true);
    pressEscape();
    expect(menu.isPauseOpen()).toBe(false);
    expect(fixture.dom.document.activeElement).toBe(fixture.gameMenuButton);

    menu.openStart();
    pressEscape();
    expect(menu.isStartOpen()).toBe(true);
    expect(menu.isPauseOpen()).toBe(false);

    menu.dispose();
  });
});
