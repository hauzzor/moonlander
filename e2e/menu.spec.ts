import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  LEVEL_NAMES,
  LEVELS,
  readSimulationTick,
  startLevel,
  startLevelFromMenu,
  type LevelId,
} from "./helpers";

const UINT32_MAX = 4_294_967_295;

async function readSeed(page: Page): Promise<number> {
  const text = (await page.getByTestId("seed-display").innerText()).trim();
  const seed = Number(text);
  expect(Number.isFinite(seed)).toBe(true);
  expect(Number.isInteger(seed)).toBe(true);
  expect(seed).toBeGreaterThanOrEqual(0);
  expect(seed).toBeLessThanOrEqual(UINT32_MAX);
  return seed;
}

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });

  return errors;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
}

async function expectInsideViewport(
  page: Page,
  locator: Locator,
): Promise<void> {
  await expect(locator).toBeVisible();

  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (box === null || viewport === null) {
    return;
  }

  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectCardFree(page: Page, level: LevelId): Promise<void> {
  const card = page.getByTestId(`level-card-${level}`);

  await expect(card).toBeVisible();
  await expect(card).toBeEnabled();
  await expect(card).toContainText(LEVEL_NAMES[level]);
  await expect(card).not.toHaveAttribute("data-locked", "true");
  await expect(card).not.toHaveAttribute("aria-disabled", "true");
}

async function openPauseMenu(page: Page): Promise<void> {
  await page.getByTestId("game-menu-button").click();
  await expect(page.getByTestId("game-menu")).toBeVisible();
}

function urlParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

test("boots to the start menu with three free level cards and no ticks", async ({
  page,
}) => {
  const errors = collectRuntimeErrors(page);

  await page.goto("./");

  const startMenu = page.getByTestId("start-menu");
  await expect(startMenu).toBeVisible();
  await expect(page.getByTestId("game-menu")).toBeHidden();

  for (const level of LEVELS) {
    await expectCardFree(page, level);
  }

  await expect(page.getByTestId("level-card-sandworm")).toContainText(
    "Inside the Sandworm's Gut",
  );
  await expect(page.getByTestId("level-card-gravity")).toContainText("Gravity");
  await expect(page.getByTestId("level-card-anti-gravity")).toContainText(
    "Anti Gravity",
  );

  const before = await readSimulationTick(page);
  expect(before).toBe(0);
  await page.waitForTimeout(400);
  expect(await readSimulationTick(page)).toBe(before);

  expect(errors).toEqual([]);
});

test("an invalid ?level= value shows the start menu instead of starting", async ({
  page,
}) => {
  for (const invalid of ["wormhole", "", "Gravity", "anti_gravity"]) {
    await page.goto(`./?level=${encodeURIComponent(invalid)}&seed=42`);

    await expect(page.getByTestId("start-menu")).toBeVisible();
    await expect(page.getByTestId("game-menu")).toBeHidden();

    const tick = await readSimulationTick(page);
    await page.waitForTimeout(200);
    expect(await readSimulationTick(page)).toBe(tick);
    expect(tick).toBe(0);
  }
});

test("valid ?level= deep links auto-start each level with the requested seed", async ({
  page,
}) => {
  for (const level of LEVELS) {
    await startLevel(page, level, { seed: 42 });

    await expect(page.getByTestId("start-menu")).toBeHidden();
    await expect(page.getByTestId("game-menu")).toBeHidden();
    await expect(page.getByTestId("hud-level")).toHaveAttribute(
      "data-level",
      level,
    );
    await expect(page.getByTestId("hud-level")).toContainText(LEVEL_NAMES[level]);
    await expect(page.getByTestId("level-name")).toContainText(
      LEVEL_NAMES[level],
    );
    await expect(page.getByTestId("seed-display")).toHaveText("42");

    expect(urlParams(page).get("level")).toBe(level);
    expect(urlParams(page).get("seed")).toBe("42");
  }
});

test("?seed= is honoured when a level is selected from the menu", async ({
  page,
}) => {
  await startLevelFromMenu(page, "sandworm", { search: "seed=305419896" });

  await expect(page.getByTestId("seed-display")).toHaveText("305419896");
  expect(await readSeed(page)).toBe(305419896);
  expect(urlParams(page).get("level")).toBe("sandworm");
  expect(urlParams(page).get("seed")).toBe("305419896");
});

test("starting a level creates a seed and writes level and seed to the URL", async ({
  page,
}) => {
  await startLevelFromMenu(page, "gravity");

  const params = urlParams(page);
  const seed = await readSeed(page);

  expect(params.get("level")).toBe("gravity");
  expect(params.get("seed")).toBe(String(seed));
});

test("pause freezes ticks and resume continues without a catch-up burst", async ({
  page,
}) => {
  await startLevel(page);

  await expect
    .poll(() => readSimulationTick(page), { timeout: 10_000 })
    .toBeGreaterThan(10);

  await openPauseMenu(page);

  const paused = await readSimulationTick(page);
  await page.waitForTimeout(600);
  expect(await readSimulationTick(page)).toBe(paused);

  await page.getByTestId("menu-resume").click();
  await expect(page.getByTestId("game-menu")).toBeHidden();

  const resumed = await readSimulationTick(page);
  expect(resumed - paused).toBeLessThan(40);

  await expect
    .poll(() => readSimulationTick(page), { timeout: 10_000 })
    .toBeGreaterThan(paused);
});

test("Restart reseeds the current level and starts a fresh run", async ({
  page,
}) => {
  await startLevel(page, "gravity");

  await expect
    .poll(() => readSimulationTick(page), { timeout: 10_000 })
    .toBeGreaterThan(10);

  const seedBefore = await readSeed(page);
  await openPauseMenu(page);
  await page.getByTestId("menu-restart").click();

  await expect(page.getByTestId("game-menu")).toBeHidden();
  await expect(page.getByTestId("hud-level")).toHaveAttribute(
    "data-level",
    "gravity",
  );

  const seedAfter = await readSeed(page);
  expect(seedAfter).not.toBe(seedBefore);
  expect(urlParams(page).get("level")).toBe("gravity");
  expect(urlParams(page).get("seed")).toBe(String(seedAfter));
  await expect(page.getByTestId("hud-progress")).toHaveAttribute(
    "data-value",
    "0",
  );

  await expect
    .poll(() => readSimulationTick(page), { timeout: 10_000 })
    .toBeGreaterThan(0);
});

test("Return to Start abandons the run and shows the start menu", async ({
  page,
}) => {
  await startLevel(page, "anti-gravity");

  await expect
    .poll(() => readSimulationTick(page), { timeout: 10_000 })
    .toBeGreaterThan(10);

  await openPauseMenu(page);
  await page.getByTestId("menu-return").click();

  await expect(page.getByTestId("start-menu")).toBeVisible();
  await expect(page.getByTestId("game-menu")).toBeHidden();
  expect(urlParams(page).get("level")).toBeNull();
  expect(urlParams(page).get("seed")).toBeNull();

  const tick = await readSimulationTick(page);
  await page.waitForTimeout(500);
  expect(await readSimulationTick(page)).toBe(tick);

  await startLevelFromMenu(page, "sandworm");
});

test("Escape toggles the pause menu and returns focus to the menu button", async ({
  page,
}) => {
  await startLevel(page);

  await expect
    .poll(() => readSimulationTick(page), { timeout: 10_000 })
    .toBeGreaterThan(0);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("game-menu")).toBeVisible();

  const paused = await readSimulationTick(page);
  await page.waitForTimeout(300);
  expect(await readSimulationTick(page)).toBe(paused);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("game-menu")).toBeHidden();
  await expect(page.getByTestId("game-menu-button")).toBeFocused();

  await expect
    .poll(() => readSimulationTick(page), { timeout: 10_000 })
    .toBeGreaterThan(paused);
});

test("Escape closes the Change Log instead of opening the pause menu", async ({
  page,
}) => {
  await startLevel(page);

  await page.getByTestId("changelog-button").click();
  await expect(page.getByTestId("changelog-dialog")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("changelog-dialog")).toBeHidden();
  await expect(page.getByTestId("game-menu")).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("game-menu")).toBeVisible();
});

test("game keys are ignored while the pause menu is open", async ({ page }) => {
  await startLevel(page);

  const seedBefore = await readSeed(page);
  await openPauseMenu(page);

  await page.keyboard.down("q");
  await page.keyboard.down("w");
  await page.keyboard.press("Space");
  await page.keyboard.press("e");
  await page.keyboard.press("r");
  await page.keyboard.up("q");
  await page.keyboard.up("w");

  await expect(page.getByTestId("autopilot-status")).toHaveAttribute(
    "data-active",
    "false",
  );
  await expect(page.getByTestId("thruster-left")).toHaveAttribute(
    "data-active",
    "false",
  );
  await expect(page.getByTestId("thruster-right")).toHaveAttribute(
    "data-active",
    "false",
  );
  await expect(page.getByTestId("thruster-rear")).toHaveAttribute(
    "data-active",
    "false",
  );
  expect(await readSeed(page)).toBe(seedBefore);

  const paused = await readSimulationTick(page);
  await page.waitForTimeout(300);
  expect(await readSimulationTick(page)).toBe(paused);
});

test("starting and restarting preserves SIM URL parameters", async ({ page }) => {
  await page.goto(
    "./?speed=2&gravity=0.5&bottomPower=0.25&rearPower=4",
  );

  await expect(page.getByTestId("start-menu")).toBeVisible();
  await page.getByTestId("level-card-sandworm").click();
  const levelStart = page.getByTestId("level-start");
  if (await levelStart.isVisible()) {
    await levelStart.click();
  }

  await expect(page.getByTestId("start-menu")).toBeHidden();

  const started = urlParams(page);
  const seed = await readSeed(page);
  expect(started.get("level")).toBe("sandworm");
  expect(started.get("seed")).toBe(String(seed));
  expect(started.get("speed")).toBe("2");
  expect(started.get("gravity")).toBe("0.5");
  expect(started.get("bottomPower")).toBe("0.25");
  expect(started.get("rearPower")).toBe("4");

  const startedUrl = page.url();
  await page.goto(startedUrl);
  await expect(page.getByTestId("start-menu")).toBeHidden();
  await expect(page.getByTestId("hud-level")).toHaveAttribute(
    "data-level",
    "sandworm",
  );
  expect(await readSeed(page)).toBe(seed);
});

test.describe("menu layout", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "narrow", width: 390, height: 844 },
  ] as const) {
    test(`${viewport.name} start and pause menus stay inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("./");

      await expectNoHorizontalOverflow(page);
      await expectInsideViewport(page, page.getByTestId("start-menu"));

      for (const level of LEVELS) {
        await expectInsideViewport(
          page,
          page.getByTestId(`level-card-${level}`),
        );
      }

      await startLevelFromMenu(page, "sandworm");
      await openPauseMenu(page);

      await expectNoHorizontalOverflow(page);
      await expectInsideViewport(page, page.getByTestId("game-menu"));
      await expectInsideViewport(page, page.getByTestId("menu-resume"));
      await expectInsideViewport(page, page.getByTestId("menu-restart"));
      await expectInsideViewport(page, page.getByTestId("menu-return"));
    });
  }
});
