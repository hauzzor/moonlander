import { expect, test, type Locator } from "@playwright/test";

async function readNumericDataValue(locator: Locator): Promise<number> {
  const rawValue = await locator.getAttribute("data-value");
  expect(rawValue).not.toBeNull();
  expect(rawValue?.trim()).not.toBe("");

  const value = Number(rawValue);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

async function hasNonBackgroundPixels(canvas: Locator): Promise<boolean> {
  return canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      return false;
    }

    const context = element.getContext("2d");
    if (context === null || element.width === 0 || element.height === 0) {
      return false;
    }

    const background = getComputedStyle(element).backgroundColor.match(
      /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/,
    );
    if (background === null) {
      return false;
    }

    const [red, green, blue] = background.slice(1).map(Number);
    const pixels = context.getImageData(0, 0, element.width, element.height).data;

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

  await page.keyboard.down("q");
  try {
    await expect
      .poll(() => readNumericDataValue(progress), { timeout: 8_000 })
      .toBeGreaterThan(0);
  } finally {
    await page.keyboard.up("q");
  }

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

test("on-screen instructions mention Q, W, R, and the tunnel but not gates", async ({ page }) => {
  await page.goto("./");

  const instructions = page.getByTestId("instructions");
  await expect(instructions).toBeVisible();
  await expect(instructions).toContainText(/\bQ\b/i);
  await expect(instructions).toContainText(/\bW\b/i);
  await expect(instructions).toContainText(/\bSpace\b/i);
  await expect(instructions).toContainText(/\bE\b/i);
  await expect(instructions).toContainText(/\bR\b/i);
  await expect(instructions).toContainText(/tunnel/i);
  await expect(instructions).not.toContainText(/gates/i);
});

test("eye sensor panel and chart canvas are visible with rendered data", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByTestId("eye-sensor-panel")).toBeVisible();

  const chart = page.getByTestId("eye-sensor-chart");
  await expect(chart).toBeVisible();
  expect(await hasNonBackgroundPixels(chart)).toBe(true);
});

test("eye sensor radius slider has the configured range and updates its readout", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByTestId("eye-sensor-panel")).toBeVisible();

  const slider = page.getByTestId("eye-sensor-radius");
  const radiusValue = page.getByTestId("eye-sensor-radius-value");
  await expect(slider).toHaveAttribute("min", "20");
  await expect(slider).toHaveAttribute("max", "200");
  await expect(slider).toHaveAttribute("step", "5");
  await expect(slider).toHaveValue("120");
  await expect(radiusValue).toBeVisible();
  await expect(radiusValue).toContainText("120");

  await slider.focus();
  for (let step = 0; step < 8; step++) {
    await slider.press("ArrowLeft");
  }

  await expect(slider).toHaveValue("80");
  await expect(radiusValue).toContainText("80");
});

test("eye sensor chart reflects the updated radius at the next scan", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByTestId("eye-sensor-panel")).toBeVisible();

  const chart = page.getByTestId("eye-sensor-chart");
  const scanTickDisplay = page.getByTestId("eye-sensor-scan-tick");
  await expect(scanTickDisplay).toBeVisible();
  const initialScanTickValue = await chart.getAttribute("data-scan-tick");
  expect(initialScanTickValue).not.toBeNull();
  const initialScanTick = Number(initialScanTickValue);
  expect(Number.isFinite(initialScanTick)).toBe(true);
  const initialScanTickText = await scanTickDisplay.innerText();
  await expect(chart).toHaveAttribute("data-scan-radius", "120");

  const slider = page.getByTestId("eye-sensor-radius");
  await slider.focus();
  for (let step = 0; step < 8; step++) {
    await slider.press("ArrowLeft");
  }
  await expect(page.getByTestId("eye-sensor-radius-value")).toContainText("80");

  await expect
    .poll(
      async () => {
        const scanTick = Number(await chart.getAttribute("data-scan-tick"));
        const scanRadius = await chart.getAttribute("data-scan-radius");
        const scanTickText = await scanTickDisplay.innerText();
        return (
          scanTick > initialScanTick &&
          scanRadius === "80" &&
          scanTickText !== initialScanTickText
        );
      },
      { timeout: 4_000 },
    )
    .toBe(true);
});

test("direction sensor needle and degree readout are visible", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByTestId("direction-needle")).toBeVisible();

  const directionValue = page.getByTestId("direction-value");
  await expect(directionValue).toBeVisible();
  await expect(directionValue).toContainText(/[-+]?\d+(?:\.\d+)?\s*(?:°|deg(?:rees)?)/i);
});

test("distance and velocity sensor blocks show numeric values", async ({ page }) => {
  await page.goto("./");

  const numericValue = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)/;
  for (const testId of [
    "distance-to-start",
    "velocity-speed",
    "velocity-vx",
    "velocity-vy",
    "velocity-angle",
  ]) {
    const sensorValue = page.getByTestId(testId);
    await expect(sensorValue).toBeVisible();
    await expect(sensorValue).toContainText(numericValue);
  }
});

test("Space toggles the rear thruster and R resets it off", async ({ page }) => {
  await page.goto("./");

  const rearThruster = page.getByTestId("thruster-rear");
  await expect(rearThruster).toHaveAttribute("data-active", "false");

  await page.keyboard.press("Space");
  await expect(rearThruster).toHaveAttribute("data-active", "true");

  await page.keyboard.press("Space");
  await expect(rearThruster).toHaveAttribute("data-active", "false");

  await page.keyboard.press("Space");
  await expect(rearThruster).toHaveAttribute("data-active", "true");

  await page.keyboard.press("r");
  await expect(rearThruster).toHaveAttribute("data-active", "false");
});

test("E toggles autopilot status between MANUAL and AUTOPILOT", async ({ page }) => {
  await page.goto("./");

  const autopilotStatus = page.getByTestId("autopilot-status");
  await expect(autopilotStatus).toBeVisible();
  await expect(autopilotStatus).toHaveAttribute("data-active", "false");
  await expect(autopilotStatus).toContainText("MANUAL");

  await page.keyboard.press("e");
  await expect(autopilotStatus).toHaveAttribute("data-active", "true");
  await expect(autopilotStatus).toContainText("AUTOPILOT");

  await page.keyboard.press("e");
  await expect(autopilotStatus).toHaveAttribute("data-active", "false");
  await expect(autopilotStatus).toContainText("MANUAL");
});

test("autopilot increases progress while active", async ({ page }) => {
  await page.goto("./");

  const progress = page.getByTestId("hud-progress");
  const initialProgress = await readNumericDataValue(progress);
  const autopilotStatus = page.getByTestId("autopilot-status");

  await page.keyboard.press("e");
  await expect(autopilotStatus).toHaveAttribute("data-active", "true");
  await expect(autopilotStatus).toContainText("AUTOPILOT");

  await expect
    .poll(() => readNumericDataValue(progress), { timeout: 10_000 })
    .toBeGreaterThan(initialProgress);
});

test("progress increases while holding Q", async ({ page }) => {
  await page.goto("./");

  const progress = page.getByTestId("hud-progress");
  const initialProgress = await readNumericDataValue(progress);

  await page.keyboard.down("q");
  try {
    await expect
      .poll(() => readNumericDataValue(progress), { timeout: 8_000 })
      .toBeGreaterThan(initialProgress);
  } finally {
    await page.keyboard.up("q");
  }
});

test("game canvas contains rendered pixels that differ from its background", async ({ page }) => {
  await page.goto("./");

  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toBeVisible();
  expect(await hasNonBackgroundPixels(canvas)).toBe(true);
});

test("outcome overlay is attached but hidden while the Starship is flying", async ({ page }) => {
  await page.goto("./");

  const outcome = page.getByTestId("outcome");
  await expect(outcome).toBeAttached();
  await expect(outcome).toBeHidden();
});
