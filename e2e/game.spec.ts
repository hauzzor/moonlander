import { expect, test, type Locator } from "@playwright/test";

async function readNumericDataValue(locator: Locator): Promise<number> {
  const rawValue = await locator.getAttribute("data-value");
  expect(rawValue).not.toBeNull();
  expect(rawValue?.trim()).not.toBe("");

  const value = Number(rawValue);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

test("Starship HUD exposes finite telemetry and removes landing HUD hooks", async ({ page }) => {
  await page.goto("./");

  for (const testId of ["hud-hull", "hud-speed", "hud-progress", "hud-score"]) {
    const telemetry = page.getByTestId(testId);
    await expect(telemetry).toBeVisible();
    await readNumericDataValue(telemetry);
  }

  for (const testId of [
    "hud-altitude",
    "hud-vspeed",
    "hud-hspeed",
    "hud-tilt",
    "hud-fuel",
  ]) {
    await expect(page.getByTestId(testId)).toHaveCount(0);
  }
});

test("holding Q activates only the left thruster and releasing it deactivates it", async ({ page }) => {
  await page.goto("./");

  const leftThruster = page.getByTestId("thruster-left");
  const rightThruster = page.getByTestId("thruster-right");

  await page.keyboard.down("q");
  await expect(leftThruster).toHaveAttribute("data-active", "true");
  await expect(rightThruster).toHaveAttribute("data-active", "false");

  await page.keyboard.up("q");
  await expect(leftThruster).toHaveAttribute("data-active", "false");
  await expect(rightThruster).toHaveAttribute("data-active", "false");
});

test("holding W activates only the right thruster", async ({ page }) => {
  await page.goto("./");

  const leftThruster = page.getByTestId("thruster-left");
  const rightThruster = page.getByTestId("thruster-right");

  await page.keyboard.down("w");
  await expect(rightThruster).toHaveAttribute("data-active", "true");
  await expect(leftThruster).toHaveAttribute("data-active", "false");
});

test("R starts a new seeded run and restores hull, score, and progress", async ({ page }) => {
  await page.goto("./");

  const seedDisplay = page.getByTestId("seed-display");
  const initialSeed = (await seedDisplay.innerText()).trim();
  const hull = page.getByTestId("hud-hull");
  const score = page.getByTestId("hud-score");
  const progress = page.getByTestId("hud-progress");

  await expect
    .poll(() => readNumericDataValue(hull), { timeout: 12_000 })
    .toBeLessThan(100);
  await expect.poll(() => readNumericDataValue(progress)).toBeGreaterThan(0);
  await expect.poll(() => readNumericDataValue(score)).toBeGreaterThan(0);

  const resetValues = await page.evaluate(() => {
    const readDataValue = (testId: string): string | null =>
      document
        .querySelector<HTMLElement>(`[data-testid="${testId}"]`)
        ?.getAttribute("data-value") ?? null;

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));

    return {
      seed:
        document
          .querySelector<HTMLElement>('[data-testid="seed-display"]')
          ?.textContent?.trim() ?? null,
      hull: readDataValue("hud-hull"),
      score: readDataValue("hud-score"),
      progress: readDataValue("hud-progress"),
    };
  });

  expect(resetValues.seed).not.toBeNull();
  expect(resetValues.seed).not.toBe(initialSeed);
  expect(resetValues.hull).not.toBeNull();
  expect(Number(resetValues.hull)).toBe(100);
  expect(resetValues.score).not.toBeNull();
  expect(Number(resetValues.score)).toBe(0);
  expect(resetValues.progress).not.toBeNull();
  expect(Number(resetValues.progress)).toBe(0);

  const outcome = page.getByTestId("outcome");
  await expect(outcome).toBeAttached();
  await expect(outcome).toBeHidden();
});

test("loading an unsigned seed updates the current seed display", async ({ page }) => {
  await page.goto("./");

  const seed = 305419896;
  await page.getByTestId("seed-input").fill(String(seed));
  await page.getByTestId("seed-load").click();

  await expect(page.getByTestId("seed-display")).toContainText(String(seed));
});

test("on-screen instructions mention Q, W, and R", async ({ page }) => {
  await page.goto("./");

  const instructions = page.getByTestId("instructions");
  await expect(instructions).toBeVisible();
  await expect(instructions).toContainText(/\bQ\b/i);
  await expect(instructions).toContainText(/\bW\b/i);
  await expect(instructions).toContainText(/\bR\b/i);
});

test("progress increases over time without input", async ({ page }) => {
  await page.goto("./");

  const progress = page.getByTestId("hud-progress");
  const initialProgress = await readNumericDataValue(progress);

  await expect
    .poll(() => readNumericDataValue(progress), { timeout: 5_000 })
    .toBeGreaterThan(initialProgress);
});

test("game canvas contains rendered pixels that differ from its background", async ({ page }) => {
  await page.goto("./");

  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toBeVisible();

  const hasNonBackgroundPixels = await canvas.evaluate((element) => {
    const gameCanvas = element as HTMLCanvasElement;
    const context = gameCanvas.getContext("2d");
    if (context === null || gameCanvas.width === 0 || gameCanvas.height === 0) {
      return false;
    }

    const background = getComputedStyle(gameCanvas).backgroundColor.match(
      /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/,
    );
    if (background === null) {
      return false;
    }

    const [red, green, blue] = background.slice(1).map(Number);
    const pixels = context.getImageData(0, 0, gameCanvas.width, gameCanvas.height).data;

    for (let index = 0; index < pixels.length; index += 4) {
      if (
        pixels[index + 3]! > 0 &&
        (pixels[index]! !== red || pixels[index + 1]! !== green || pixels[index + 2]! !== blue)
      ) {
        return true;
      }
    }

    return false;
  });

  expect(hasNonBackgroundPixels).toBe(true);
});

test("outcome overlay is attached but hidden while the Starship is flying", async ({ page }) => {
  await page.goto("./");

  const outcome = page.getByTestId("outcome");
  await expect(outcome).toBeAttached();
  await expect(outcome).toBeHidden();
});
