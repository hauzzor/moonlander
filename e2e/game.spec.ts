import { expect, test, type Locator } from "@playwright/test";

async function readNumericDataValue(locator: Locator): Promise<number> {
  const rawValue = await locator.getAttribute("data-value");
  expect(rawValue).not.toBeNull();
  expect(rawValue?.trim()).not.toBe("");

  const value = Number(rawValue);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

test("HUD telemetry exposes numeric values for altitude, speeds, tilt, and fuel", async ({ page }) => {
  await page.goto("./");

  for (const testId of [
    "hud-altitude",
    "hud-vspeed",
    "hud-hspeed",
    "hud-tilt",
    "hud-fuel",
  ]) {
    const telemetry = page.getByTestId(testId);
    await expect(telemetry).toBeVisible();
    await readNumericDataValue(telemetry);
  }
});

test("altitude decreases over time without input", async ({ page }) => {
  await page.goto("./");

  const altitude = page.getByTestId("hud-altitude");
  const initialAltitude = await readNumericDataValue(altitude);

  await expect
    .poll(() => readNumericDataValue(altitude), { timeout: 5_000 })
    .toBeLessThan(initialAltitude);
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
});

test("holding W activates only the right thruster", async ({ page }) => {
  await page.goto("./");

  const leftThruster = page.getByTestId("thruster-left");
  const rightThruster = page.getByTestId("thruster-right");

  await page.keyboard.down("w");
  await expect(rightThruster).toHaveAttribute("data-active", "true");
  await expect(leftThruster).toHaveAttribute("data-active", "false");
});

test("R restores the initial altitude and leaves the outcome hidden", async ({ page }) => {
  await page.goto("./");

  const altitude = page.getByTestId("hud-altitude");
  const initialAltitude = await readNumericDataValue(altitude);

  await expect
    .poll(() => readNumericDataValue(altitude), { timeout: 5_000 })
    .toBeLessThan(initialAltitude - 2);

  await page.keyboard.press("r");

  await expect
    .poll(
      async () => Math.abs((await readNumericDataValue(altitude)) - initialAltitude),
      { timeout: 5_000 },
    )
    .toBeLessThan(1);

  const outcome = page.getByTestId("outcome");
  await expect(outcome).toBeAttached();
  await expect(outcome).toBeHidden();
});

test("on-screen instructions mention Q, W, and R", async ({ page }) => {
  await page.goto("./");

  const instructions = page.getByTestId("instructions");
  await expect(instructions).toBeVisible();
  await expect(instructions).toContainText(/\bQ\b/i);
  await expect(instructions).toContainText(/\bW\b/i);
  await expect(instructions).toContainText(/\bR\b/i);
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
        pixels[index + 3] > 0 &&
        (pixels[index] !== red || pixels[index + 1] !== green || pixels[index + 2] !== blue)
      ) {
        return true;
      }
    }

    return false;
  });

  expect(hasNonBackgroundPixels).toBe(true);
});
