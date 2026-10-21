import { expect, test, type Locator, type Page } from "@playwright/test";

const SLIDERS = [
  { name: "simulation speed", testId: "sim-speed", valueId: "sim-speed-value" },
  { name: "gravity", testId: "gravity-scale", valueId: "gravity-scale-value" },
  { name: "bottom power", testId: "bottom-power", valueId: "bottom-power-value" },
  { name: "rear power", testId: "rear-power", valueId: "rear-power-value" },
] as const;

const STORAGE_KEYS = {
  speed: "moonlander.speed",
  gravity: "moonlander.gravity",
  bottomPower: "moonlander.bottomPower",
  rearPower: "moonlander.rearPower",
} as const;

async function readNumber(locator: Locator, attribute: string): Promise<number> {
  const raw = await locator.getAttribute(attribute);
  expect(raw).not.toBeNull();
  const value = Number(raw);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

interface StatusSnapshot {
  tick: number;
  time: number;
  timeScale: number;
  gravityScale: number;
  gravity: number;
  bottomPower: number;
  rearPower: number;
}

async function readStatus(page: Page): Promise<StatusSnapshot> {
  const status = page.getByTestId("simulation-status");

  return {
    tick: await readNumber(status, "data-tick"),
    time: await readNumber(status, "data-time"),
    timeScale: await readNumber(status, "data-time-scale"),
    gravityScale: await readNumber(status, "data-gravity-scale"),
    gravity: await readNumber(status, "data-gravity"),
    bottomPower: await readNumber(status, "data-bottom-power"),
    rearPower: await readNumber(status, "data-rear-power"),
  };
}

async function setSliderPosition(
  page: Page,
  testId: string,
  position: string,
): Promise<void> {
  await page.getByTestId(testId).evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, position);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
}

async function expectHorizontalBounds(
  page: Page,
  locator: Locator,
): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (box === null || viewport === null) {
    return;
  }

  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.width).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
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

test("SIM panel exposes four log sliders with documented bounds and defaults", async ({
  page,
}) => {
  await page.goto("./");

  const panel = page.getByTestId("sim-panel");
  const toggle = page.getByTestId("sim-panel-toggle");
  await expect(panel).toBeVisible();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const collapsed =
    (await toggle.getAttribute("data-collapsed")) ??
    (await panel.getAttribute("data-collapsed"));
  expect(collapsed).toBe("false");

  for (const sliderInfo of SLIDERS) {
    const slider = page.getByTestId(sliderInfo.testId);
    const value = page.getByTestId(sliderInfo.valueId);

    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("min", "-1");
    await expect(slider).toHaveAttribute("max", "1");
    await expect(slider).toHaveAttribute("step", "0.05");
    await expect(slider).toHaveValue("0");
    await expect(value).toBeVisible();
    await expect(value).toHaveAttribute("data-value", "1");
    await expect(value).toContainText(/x/i);
  }

  const gravityValue = page.getByTestId("gravity-scale-value");
  expect(await readNumber(gravityValue, "data-gravity")).toBeCloseTo(1.62, 6);
  await expect(gravityValue).toContainText("1.62");

  const status = await readStatus(page);
  expect(status.timeScale).toBe(1);
  expect(status.gravityScale).toBe(1);
  expect(status.gravity).toBeCloseTo(1.62, 6);
  expect(status.bottomPower).toBe(1);
  expect(status.rearPower).toBe(1);
});

test("SIM sliders map log positions to scales and update readouts live", async ({
  page,
}) => {
  await page.goto("./");

  await setSliderPosition(page, "sim-speed", "-1");
  expect((await readStatus(page)).timeScale).toBeCloseTo(0.1, 6);
  expect(
    await readNumber(page.getByTestId("sim-speed-value"), "data-value"),
  ).toBeCloseTo(0.1, 6);
  await expect(page.getByTestId("sim-speed-value")).toContainText(/0\.1\s*x/i);

  await setSliderPosition(page, "sim-speed", "0.5");
  expect((await readStatus(page)).timeScale).toBeCloseTo(Math.sqrt(10), 6);

  await setSliderPosition(page, "sim-speed", "1");
  expect((await readStatus(page)).timeScale).toBeCloseTo(10, 6);
  await expect(page.getByTestId("sim-speed-value")).toContainText(
    /10(?:\.0+)?\s*x/i,
  );

  await setSliderPosition(page, "gravity-scale", "1");
  const gravityStatus = await readStatus(page);
  expect(gravityStatus.gravityScale).toBeCloseTo(10, 6);
  expect(gravityStatus.gravity).toBeCloseTo(16.2, 6);
  expect(
    await readNumber(page.getByTestId("gravity-scale-value"), "data-gravity"),
  ).toBeCloseTo(16.2, 6);
  await expect(page.getByTestId("gravity-scale-value")).toContainText("16.2");

  await setSliderPosition(page, "bottom-power", "-1");
  await setSliderPosition(page, "rear-power", "1");
  const powerStatus = await readStatus(page);
  expect(powerStatus.bottomPower).toBeCloseTo(0.1, 6);
  expect(powerStatus.rearPower).toBeCloseTo(10, 6);

  await expect(page.getByTestId("bottom-power-value")).toHaveAttribute(
    "data-value",
    /^0\.1/,
  );
  await expect(page.getByTestId("rear-power-value")).toHaveAttribute(
    "data-value",
    /^10/,
  );
});

test("SIM panel collapses and expands and stays available in autopilot", async ({
  page,
}) => {
  await page.goto("./");

  const panel = page.getByTestId("sim-panel");
  const toggle = page.getByTestId("sim-panel-toggle");

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(
    (await toggle.getAttribute("data-collapsed")) ??
      (await panel.getAttribute("data-collapsed")),
  ).toBe("true");
  await expect(page.getByTestId("sim-speed")).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("sim-speed")).toBeVisible();

  await page.keyboard.press("e");
  await expect(page.getByTestId("autopilot-status")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(panel).toBeVisible();
  await expect(toggle).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("SIM settings persist across R, seed loads, and reloads", async ({
  page,
}) => {
  await page.goto("./");

  await setSliderPosition(page, "sim-speed", "1");
  await setSliderPosition(page, "gravity-scale", "-1");
  await setSliderPosition(page, "bottom-power", "0.5");
  await setSliderPosition(page, "rear-power", "-0.5");

  const expected = {
    speed: 10,
    gravity: 0.1,
    bottom: Math.sqrt(10),
    rear: Math.sqrt(0.1),
  };

  const readExpected = async (): Promise<void> => {
    const status = await readStatus(page);
    expect(status.timeScale).toBeCloseTo(expected.speed, 6);
    expect(status.gravityScale).toBeCloseTo(expected.gravity, 6);
    expect(status.gravity).toBeCloseTo(1.62 * expected.gravity, 6);
    expect(status.bottomPower).toBeCloseTo(expected.bottom, 6);
    expect(status.rearPower).toBeCloseTo(expected.rear, 6);
  };

  await readExpected();

  const seedBefore = await page.getByTestId("seed-display").innerText();
  await page.keyboard.press("r");
  await expect(page.getByTestId("seed-display")).not.toHaveText(seedBefore);
  await readExpected();

  const seedInput = page.getByTestId("seed-input");
  await seedInput.fill("1234");
  await page.getByTestId("seed-load").click();
  await expect(page.getByTestId("seed-display")).toHaveText("1234");
  await readExpected();

  await page.keyboard.press("e");
  await expect(page.getByTestId("autopilot-status")).toHaveAttribute(
    "data-active",
    "true",
  );
  await readExpected();

  await expect(page.getByTestId("sim-speed")).toHaveValue("1");
  await expect(page.getByTestId("gravity-scale")).toHaveValue("-1");

  const stored = await page.evaluate((keys) => {
    const values: Record<string, string | null> = {};
    for (const [name, key] of Object.entries(keys)) {
      values[name] = window.localStorage.getItem(key);
    }
    return values;
  }, STORAGE_KEYS);

  expect(Number(stored.speed)).toBeCloseTo(expected.speed, 6);
  expect(Number(stored.gravity)).toBeCloseTo(expected.gravity, 6);
  expect(Number(stored.bottomPower)).toBeCloseTo(expected.bottom, 6);
  expect(Number(stored.rearPower)).toBeCloseTo(expected.rear, 6);

  await page.goto("./");
  await readExpected();
});

test("URL settings override localStorage and invalid values fall back or clamp", async ({
  page,
}) => {
  await page.goto("./");

  await setSliderPosition(page, "sim-speed", "0.5");
  await setSliderPosition(page, "gravity-scale", "0.5");
  await setSliderPosition(page, "bottom-power", "1");
  await setSliderPosition(page, "rear-power", "1");

  await page.goto(
    "./?speed=2&gravity=0.5&bottomPower=0.25&rearPower=4",
  );

  const fromUrl = await readStatus(page);
  expect(fromUrl.timeScale).toBeCloseTo(2, 6);
  expect(fromUrl.gravityScale).toBeCloseTo(0.5, 6);
  expect(fromUrl.bottomPower).toBeCloseTo(0.25, 6);
  expect(fromUrl.rearPower).toBeCloseTo(4, 6);

  await page.evaluate(() => window.localStorage.clear());
  await page.goto("./?speed=abc&gravity=0&bottomPower=-5&rearPower=1000");

  const invalid = await readStatus(page);
  expect(invalid.timeScale).toBe(1);
  expect(invalid.gravityScale).toBe(0.1);
  expect(invalid.bottomPower).toBe(0.1);
  expect(invalid.rearPower).toBe(10);
});

test("fake clock scales simulated ticks at 0.1x, 1x, and 10x", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await page.clock.install({
    time: new Date("2026-01-01T00:00:00.000Z"),
  });

  const measured: Record<string, number> = {};
  const baseTime = Date.parse("2026-01-01T00:00:00.000Z");
  const scales = [
    ["0.1", 12],
    ["1", 120],
    ["10", 1200],
  ] as const;

  for (const [index, [scale, expected]] of scales.entries()) {
    await page.goto(`./?speed=${scale}`);
    await expect(page.getByTestId("simulation-status")).toHaveAttribute(
      "data-time-scale",
      scale,
    );

    // Pause the fake clock so wall-clock drift around the reads cannot add
    // ticks; only runFor advances the game from here.
    await page.clock.pauseAt(new Date(baseTime + (index + 1) * 20_000));

    const before = (await readStatus(page)).tick;
    await page.clock.runFor(1_000);
    const after = (await readStatus(page)).tick;
    const ticks = after - before;
    measured[scale] = ticks;

    const tolerance = Math.max(6, expected * 0.1);
    expect(
      Math.abs(ticks - expected),
      `expected about ${expected} ticks at ${scale}x, measured ${ticks}`,
    ).toBeLessThanOrEqual(tolerance);
  }

  expect(measured["1"]!).toBeGreaterThan(measured["0.1"]! * 5);
  expect(measured["10"]!).toBeGreaterThan(measured["1"]! * 5);
});

test("SIM slider keyboard control updates readouts without flying the ship", async ({
  page,
}) => {
  await page.goto("./");

  const slider = page.getByTestId("sim-speed");
  const readout = page.getByTestId("sim-speed-value");
  const status = page.getByTestId("simulation-status");
  const seedBefore = await page.getByTestId("seed-display").innerText();

  await slider.focus();
  await expect(slider).toBeFocused();

  await slider.press("Home");
  await expect(slider).toHaveValue("-1");
  await expect(readout).toHaveAttribute("data-value", /^0\.1/);
  await expect(status).toHaveAttribute("data-time-scale", "0.1");

  await slider.press("End");
  await expect(slider).toHaveValue("1");
  await expect(readout).toHaveAttribute("data-value", /^10/);
  await expect(status).toHaveAttribute("data-time-scale", "10");

  await slider.press("ArrowLeft");
  await expect(slider).toHaveValue("0.95");
  expect(Number(await status.getAttribute("data-time-scale"))).toBeCloseTo(
    10 ** 0.95,
    6,
  );

  await page.keyboard.press("q");
  await page.keyboard.press("e");
  await page.keyboard.press("r");
  await page.waitForTimeout(150);

  await expect(page.getByTestId("thruster-left")).toHaveAttribute(
    "data-active",
    "false",
  );
  await expect(page.getByTestId("autopilot-status")).toHaveAttribute(
    "data-active",
    "false",
  );
  await expect(page.getByTestId("seed-display")).toHaveText(seedBefore);
});

test("SIM controls produce no console errors", async ({ page }) => {
  const errors = collectRuntimeErrors(page);

  await page.goto("./");

  for (const slider of SLIDERS) {
    await setSliderPosition(page, slider.testId, "0.5");
    await setSliderPosition(page, slider.testId, "0");
  }

  await page.getByTestId("sim-panel-toggle").click();
  await page.getByTestId("sim-panel-toggle").click();

  await page.keyboard.press("r");
  await page.keyboard.press("e");
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
});

test.describe("SIM panel layout", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "narrow", width: 390, height: 844 },
  ] as const) {
    test(`${viewport.name} layout keeps the panel and sliders inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("./");

      const panel = page.getByTestId("sim-panel");
      const toggle = page.getByTestId("sim-panel-toggle");

      await expect(panel).toBeVisible();
      await expect(toggle).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectHorizontalBounds(page, panel);
      await expectHorizontalBounds(page, toggle);

      for (const slider of SLIDERS) {
        const control = page.getByTestId(slider.testId);
        await expect(control).toBeVisible();
        await expectHorizontalBounds(page, control);
      }

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expectNoHorizontalOverflow(page);

      await toggle.click();
      await page.keyboard.press("e");
      await expect(page.getByTestId("autopilot-status")).toHaveAttribute(
        "data-active",
        "true",
      );
      await expect(panel).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});
