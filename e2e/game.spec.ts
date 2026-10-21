import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const UINT32_MAX = 4_294_967_295;
const DEFAULT_SEED = 1;

async function readNumericDataValue(locator: Locator): Promise<number> {
  const rawValue = await locator.getAttribute("data-value");
  expect(rawValue).not.toBeNull();
  expect(rawValue?.trim()).not.toBe("");

  const value = Number(rawValue);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

interface TestIdNumbers {
  [testId: string]: number;
}

async function readTestIdNumbers(
  page: Page,
  testIds: readonly string[],
): Promise<TestIdNumbers> {
  return page.evaluate((ids) => {
    const values: Record<string, number> = {};

    for (const id of ids) {
      const raw = document
        .querySelector(`[data-testid="${id}"]`)
        ?.getAttribute("data-value");
      values[id] = raw === null || raw === undefined ? Number.NaN : Number(raw);
    }

    return values;
  }, testIds);
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

async function canvasHash(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      return 0;
    }

    const context = element.getContext("2d");
    if (context === null || element.width === 0 || element.height === 0) {
      return 0;
    }

    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let hash = 2_166_136_261;

    for (let index = 0; index < pixels.length; index += 4 * 37) {
      hash ^= pixels[index]!;
      hash = Math.imul(hash, 16_777_619);
      hash ^= pixels[index + 1]!;
      hash = Math.imul(hash, 16_777_619);
      hash ^= pixels[index + 2]!;
      hash = Math.imul(hash, 16_777_619);
      hash ^= pixels[index + 3]!;
      hash = Math.imul(hash, 16_777_619);
    }

    return hash >>> 0;
  });
}

interface DirectionSnapshot {
  direction: number;
  needle: string;
}

async function readDirectionSnapshot(page: Page): Promise<DirectionSnapshot> {
  return page.evaluate(() => {
    const directionElement = document.querySelector<HTMLElement>(
      '[data-testid="direction-value"]',
    );
    const needleElement = document.querySelector<HTMLElement>(
      '[data-testid="direction-needle"]',
    );

    return {
      direction: Number(directionElement?.getAttribute("data-value")),
      needle:
        needleElement?.style.getPropertyValue("--needle-angle").trim() ?? "",
    };
  });
}

interface SensorSnapshot {
  distance: number;
  speed: number;
  vx: number;
  vy: number;
  angle: number;
}

async function readSensorSnapshot(page: Page): Promise<SensorSnapshot> {
  const values = await readTestIdNumbers(page, [
    "distance-to-start",
    "velocity-speed",
    "velocity-vx",
    "velocity-vy",
    "velocity-angle",
  ]);

  return {
    distance: values["distance-to-start"]!,
    speed: values["velocity-speed"]!,
    vx: values["velocity-vx"]!,
    vy: values["velocity-vy"]!,
    angle: values["velocity-angle"]!,
  };
}

async function expectInsideViewport(
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

  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

function rectsOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

async function readSeed(page: Page): Promise<number> {
  const text = (await page.getByTestId("seed-display").innerText()).trim();
  const seed = Number(text);
  expect(Number.isFinite(seed)).toBe(true);
  expect(Number.isInteger(seed)).toBe(true);
  expect(seed).toBeGreaterThanOrEqual(0);
  expect(seed).toBeLessThanOrEqual(UINT32_MAX);
  return seed;
}

async function blurActiveElement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
}

async function setAutopilot(page: Page, active: boolean): Promise<void> {
  await blurActiveElement(page);
  const status = page.getByTestId("autopilot-status");

  if ((await status.getAttribute("data-active")) !== String(active)) {
    await page.keyboard.press("e");
  }

  await expect(status).toHaveAttribute("data-active", String(active));
}

async function enableAutopilot(page: Page): Promise<void> {
  await setAutopilot(page, true);
  await expectSensorConsoleVisible(page);
}

async function expectSensorConsoleHidden(page: Page): Promise<void> {
  const panel = page.getByTestId("eye-sensor-panel");

  await expect(panel).toBeHidden();
  await expect(panel).toHaveAttribute("data-visible", "false");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  expect(
    await panel.evaluate((element) => element.hasAttribute("hidden")),
  ).toBe(true);
  expect(
    await panel.evaluate((element) => element.hasAttribute("inert")),
  ).toBe(true);
  await expect(page.getByTestId("radar-status")).toHaveAttribute(
    "data-active",
    "false",
  );
}

async function expectSensorConsoleVisible(page: Page): Promise<void> {
  const panel = page.getByTestId("eye-sensor-panel");

  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-visible", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");
  expect(
    await panel.evaluate((element) => element.hasAttribute("hidden")),
  ).toBe(false);
  expect(
    await panel.evaluate((element) => element.hasAttribute("inert")),
  ).toBe(false);
  await expect(page.getByTestId("radar-status")).toHaveAttribute(
    "data-active",
    "true",
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
}

interface BuildInfoSnapshot {
  text: string;
  number: string | null;
  sha: string | null;
  time: string | null;
  source: string | null;
}

async function readBuildInfo(page: Page): Promise<BuildInfoSnapshot> {
  return page.getByTestId("build-info").evaluate((element) => ({
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
    number: element.getAttribute("data-build-number"),
    sha: element.getAttribute("data-build-sha"),
    time: element.getAttribute("data-build-time"),
    source: element.getAttribute("data-build-source"),
  }));
}

interface CuratedChangelogEntry {
  date: string;
  title: string;
}

function readCuratedChangelog(): CuratedChangelogEntry[] {
  const markdown = readFileSync(
    new URL("../docs/CHANGELOG.md", import.meta.url),
    "utf8",
  );
  const entries: CuratedChangelogEntry[] = [];

  for (const match of markdown.matchAll(
    /^## (\d{4}-\d{2}-\d{2}) \u2014 (.+)$/gm,
  )) {
    entries.push({ date: match[1]!, title: match[2]!.trim() });
  }

  return entries;
}

test("Starship HUD exposes finite telemetry and removes landing HUD hooks", async ({ page }) => {
  await page.goto("./");

  for (const testId of ["hud-hull", "hud-speed", "hud-progress", "hud-score"]) {
    const telemetry = page.getByTestId(testId);
    await expect(telemetry).toBeVisible();
    await readNumericDataValue(telemetry);
  }

  await expect(page.getByTestId("hud-hull")).toHaveAttribute("data-value", "100");
  await expect(page.getByTestId("hud-progress")).toHaveAttribute("data-value", "0");
  await expect(page.getByTestId("hud-score")).toHaveAttribute("data-value", "0");

  const initial = await readTestIdNumbers(page, [
    "hud-speed",
    "hud-progress",
    "hud-score",
  ]);

  expect(initial["hud-speed"]!).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(initial["hud-progress"]!)).toBe(true);
  expect(Number.isInteger(initial["hud-score"]!)).toBe(true);
  expect(initial["hud-score"]!).toBe(initial["hud-progress"]!);

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

test("holding W activates only the right thruster and releasing it deactivates it", async ({ page }) => {
  await page.goto("./");

  const leftThruster = page.getByTestId("thruster-left");
  const rightThruster = page.getByTestId("thruster-right");

  await page.keyboard.down("w");
  await expect(rightThruster).toHaveAttribute("data-active", "true");
  await expect(leftThruster).toHaveAttribute("data-active", "false");

  await page.keyboard.up("w");
  await expect(rightThruster).toHaveAttribute("data-active", "false");
  await expect(leftThruster).toHaveAttribute("data-active", "false");
});

test("R starts a new seeded run and restores hull, score, and progress", async ({ page }) => {
  await page.goto("./");

  const seedDisplay = page.getByTestId("seed-display");
  const initialSeed = await readSeed(page);
  expect(initialSeed).toBe(DEFAULT_SEED);

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

  const flight = await readTestIdNumbers(page, ["hud-progress", "hud-score"]);
  expect(flight["hud-score"]!).toBe(flight["hud-progress"]!);

  await page.keyboard.press("r");

  const reset = await readTestIdNumbers(page, [
    "hud-hull",
    "hud-progress",
    "hud-score",
  ]);
  const resetSeed = await readSeed(page);

  expect(resetSeed).not.toBe(initialSeed);
  expect(reset["hud-hull"]!).toBe(100);
  expect(reset["hud-progress"]!).toBe(0);
  expect(reset["hud-score"]!).toBe(0);

  await expect(hull).toHaveAttribute("data-value", "100");
  await expect(score).toHaveAttribute("data-value", "0");
  await expect(progress).toHaveAttribute("data-value", "0");

  const outcome = page.getByTestId("outcome");
  await expect(outcome).toBeAttached();
  await expect(outcome).toBeHidden();
});

test("loading unsigned seed 0, a normal seed, and the maximum seed updates the run", async ({ page }) => {
  await page.goto("./");

  const seedDisplay = page.getByTestId("seed-display");
  const seedInput = page.getByTestId("seed-input");
  const seedLoad = page.getByTestId("seed-load");

  for (const seed of [0, 305_419_896, UINT32_MAX]) {
    await seedInput.fill(String(seed));
    await seedLoad.click();

    await expect(seedDisplay).toHaveText(String(seed));
    expect(await readSeed(page)).toBe(seed);

    const reset = await readTestIdNumbers(page, [
      "hud-hull",
      "hud-progress",
      "hud-score",
    ]);
    expect(reset["hud-hull"]!).toBe(100);
    expect(reset["hud-progress"]!).toBe(0);
    expect(reset["hud-score"]!).toBe(0);
    await expect(seedInput).toHaveValue(String(seed));
  }
});

test("invalid seeds are rejected without resetting the current run", async ({ page }) => {
  await page.goto("./");

  const seedDisplay = page.getByTestId("seed-display");
  const seedInput = page.getByTestId("seed-input");
  const seedLoad = page.getByTestId("seed-load");
  const progress = page.getByTestId("hud-progress");

  const loadedSeed = 305_419_896;
  await seedInput.fill(String(loadedSeed));
  await seedLoad.click();
  await expect(seedDisplay).toHaveText(String(loadedSeed));

  await page.keyboard.press("Space");
  try {
    await expect
      .poll(() => readNumericDataValue(progress), { timeout: 8_000 })
      .toBeGreaterThan(0);
  } finally {
    await page.keyboard.press("Space");
  }

  const progressBefore = await readNumericDataValue(progress);

  for (const invalid of [
    "",
    "not-a-number",
    "-1",
    "4294967296",
    "1.5",
    "0x10",
  ]) {
    await seedInput.fill(invalid);
    await seedLoad.click();

    await expect(seedDisplay).toHaveText(String(loadedSeed));
    await expect(seedInput).toHaveAttribute("aria-invalid", "true");
    expect(await readNumericDataValue(progress)).toBeGreaterThanOrEqual(
      progressBefore,
    );
  }

  await seedInput.fill("42");
  await expect(seedInput).not.toHaveAttribute("aria-invalid", "true");

  await seedInput.fill("7");
  await seedLoad.click();
  await expect(seedDisplay).toHaveText("7");
  await expect(progress).toHaveAttribute("data-value", "0");
});

test("pressing Enter in the seed input loads the seed", async ({ page }) => {
  await page.goto("./");

  const seedInput = page.getByTestId("seed-input");
  await seedInput.fill("123456");
  await seedInput.press("Enter");

  await expect(page.getByTestId("seed-display")).toHaveText("123456");
});

test("the URL seed parameter loads a valid seed and ignores invalid ones", async ({ page }) => {
  const seedDisplay = page.getByTestId("seed-display");

  await page.goto("./?seed=42");
  await expect(seedDisplay).toHaveText("42");

  await page.goto("./?seed=0");
  await expect(seedDisplay).toHaveText("0");

  await page.goto("./?seed=abc");
  await expect(seedDisplay).toHaveText(String(DEFAULT_SEED));

  await page.goto("./?seed=4294967296");
  await expect(seedDisplay).toHaveText(String(DEFAULT_SEED));
});

test("on-screen instructions mention Q, W, Space, E, R, and the tunnel but not gates", async ({ page }) => {
  await page.goto("./");

  const instructions = page.getByTestId("instructions");
  await expect(instructions).toBeVisible();
  await expect(instructions).toContainText(/\bQ\b/i);
  await expect(instructions).toContainText(/\bW\b/i);
  await expect(instructions).toContainText(/\bSpace\b/i);
  await expect(instructions).toContainText(/\bE\b/i);
  await expect(instructions).toContainText(/\bR\b/i);
  await expect(instructions).toContainText(/tunnel/i);
  await expect(instructions).toContainText(/inside the tunnel/i);
  await expect(instructions).not.toContainText(/gates/i);
});

test("eye sensor panel and chart canvas are visible with rendered data", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

  await expect(page.getByTestId("eye-sensor-panel")).toBeVisible();

  const chart = page.getByTestId("eye-sensor-chart");
  await expect(chart).toBeVisible();
  expect(await hasNonBackgroundPixels(chart)).toBe(true);

  const scanTick = Number(await chart.getAttribute("data-scan-tick"));
  const scanRadius = Number(await chart.getAttribute("data-scan-radius"));
  expect(Number.isFinite(scanTick)).toBe(true);
  expect(scanTick).toBeGreaterThanOrEqual(0);
  expect(scanTick % 120).toBe(0);
  expect(Number.isFinite(scanRadius)).toBe(true);
  expect(scanRadius).toBe(120);
});

test("eye sensor radius slider has the configured range and updates its readout", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

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
  expect(await readNumericDataValue(radiusValue)).toBe(80);
});

test("eye sensor radius slider drag applies to the next scheduled scan", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

  const chart = page.getByTestId("eye-sensor-chart");
  const slider = page.getByTestId("eye-sensor-radius");
  const radiusValue = page.getByTestId("eye-sensor-radius-value");

  await expect(chart).toHaveAttribute("data-scan-radius", "120");

  const box = await slider.boundingBox();
  expect(box).not.toBeNull();

  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
  }

  const configured = Number(await slider.inputValue());
  expect(Number.isFinite(configured)).toBe(true);
  expect(configured).toBeGreaterThanOrEqual(20);
  expect(configured).toBeLessThanOrEqual(200);
  expect(configured).not.toBe(120);
  await expect(radiusValue).toContainText(String(configured));

  await expect
    .poll(() => chart.getAttribute("data-scan-radius"), { timeout: 5_000 })
    .toBe(String(configured));
});

test("autopilot restart works while the focused eye sensor slider keeps focus", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

  const seedDisplay = page.getByTestId("seed-display");
  const slider = page.getByTestId("eye-sensor-radius");
  const radiusValue = page.getByTestId("eye-sensor-radius-value");
  const chart = page.getByTestId("eye-sensor-chart");
  const autopilotStatus = page.getByTestId("autopilot-status");

  await slider.focus();
  await expect(slider).toBeFocused();
  await slider.press("Home");
  await expect(slider).toHaveValue("20");
  await expect(radiusValue).toContainText("20");

  const configured = Number(await slider.inputValue());
  expect(configured).toBe(20);
  const seedBefore = await readSeed(page);

  await page.keyboard.press("r");

  await expect(slider).toBeFocused();
  await expect(seedDisplay).not.toHaveText(String(seedBefore));
  await expect(slider).toHaveValue("20");
  await expect(radiusValue).toContainText("20");
  await expect(autopilotStatus).toHaveAttribute("data-active", "true");
  await expect(autopilotStatus).toContainText("AUTOPILOT");
  await expectSensorConsoleVisible(page);

  const reset = await readTestIdNumbers(page, [
    "hud-hull",
    "hud-progress",
    "hud-score",
  ]);
  expect(reset["hud-hull"]!).toBe(100);
  expect(reset["hud-score"]!).toBe(reset["hud-progress"]!);

  await expect
    .poll(() => chart.getAttribute("data-scan-radius"), { timeout: 5_000 })
    .toBe("20");

  await page.keyboard.press("e");

  await expect(autopilotStatus).toHaveAttribute("data-active", "false");
  await expect(autopilotStatus).toContainText("MANUAL");
  await expectSensorConsoleHidden(page);
  await expect(slider).not.toBeFocused();
});

test("eye sensor chart reflects the updated radius at the next scan", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

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

test("eye sensor scan radius supports the 20 m and 200 m limits after the next scan", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

  const chart = page.getByTestId("eye-sensor-chart");
  const slider = page.getByTestId("eye-sensor-radius");
  const radiusValue = page.getByTestId("eye-sensor-radius-value");

  await expect(chart).toHaveAttribute("data-scan-radius", "120");

  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("20");
  await expect(radiusValue).toContainText("20");
  await expect
    .poll(() => chart.getAttribute("data-scan-radius"), { timeout: 5_000 })
    .toBe("20");

  await slider.press("End");
  await expect(slider).toHaveValue("200");
  await expect(radiusValue).toContainText("200");
  await expect
    .poll(() => chart.getAttribute("data-scan-radius"), { timeout: 5_000 })
    .toBe("200");
});

test("eye sensor scan tick advances at the one-second cadence", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

  const readScan = async (): Promise<{
    tick: string | null;
    text: string | null;
  }> =>
    page.evaluate(() => {
      const chart = document.querySelector<HTMLElement>(
        '[data-testid="eye-sensor-chart"]',
      );
      const display = document.querySelector<HTMLElement>(
        '[data-testid="eye-sensor-scan-tick"]',
      );

      return {
        tick: chart?.getAttribute("data-scan-tick") ?? null,
        text: display?.textContent?.trim() ?? null,
      };
    });

  const initial = await readScan();
  expect(initial.tick).not.toBeNull();
  expect(initial.text).toBe(initial.tick);

  const initialTick = Number(initial.tick);
  expect(Number.isFinite(initialTick)).toBe(true);
  expect(initialTick % 120).toBe(0);

  await expect
    .poll(
      async () => {
        const snapshot = await readScan();
        return snapshot.tick === null ? 0 : Number(snapshot.tick);
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThan(initialTick);

  const next = await readScan();
  const nextTick = Number(next.tick);
  expect(Number.isFinite(nextTick)).toBe(true);
  expect(nextTick - initialTick).toBeGreaterThan(0);
  expect((nextTick - initialTick) % 120).toBe(0);
  expect(next.text).toBe(next.tick);
});

test("the configured eye sensor radius persists across R", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

  const chart = page.getByTestId("eye-sensor-chart");
  const slider = page.getByTestId("eye-sensor-radius");
  const radiusValue = page.getByTestId("eye-sensor-radius-value");
  const seedBefore = await readSeed(page);

  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("20");
  await expect
    .poll(() => chart.getAttribute("data-scan-radius"), { timeout: 5_000 })
    .toBe("20");

  await page.keyboard.press("r");

  const resetScanTick = await chart.getAttribute("data-scan-tick");
  expect(resetScanTick).toBe("0");
  await expect(page.getByTestId("seed-display")).not.toHaveText(
    String(seedBefore),
  );
  await expect(slider).toHaveValue("20");
  await expect(radiusValue).toContainText("20");
  await expect(chart).toHaveAttribute("data-scan-radius", "20");
});

test("direction sensor needle and degree readout are visible", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

  await expect(page.getByTestId("direction-needle")).toBeVisible();

  const directionValue = page.getByTestId("direction-value");
  await expect(directionValue).toBeVisible();
  await expect(directionValue).toContainText(/[-+]?\d+(?:\.\d+)?\s*(?:°|deg(?:rees)?)/i);
});

test("direction needle and readout track the autopilot ship angle", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto("./");
  await enableAutopilot(page);

  const initial = await readDirectionSnapshot(page);
  expect(Number.isFinite(initial.direction)).toBe(true);
  expect(initial.direction).toBeGreaterThanOrEqual(-180);
  expect(initial.direction).toBeLessThanOrEqual(180);
  expect(initial.needle).toMatch(/^-?\d+(?:\.\d+)?deg$/);

  const degreesApart = (left: number, right: number): number => {
    const delta = Math.abs(left - right) % 360;
    return Math.min(delta, 360 - delta);
  };

  await expect
    .poll(
      async () =>
        degreesApart(
          (await readDirectionSnapshot(page)).direction,
          initial.direction,
        ),
      { timeout: 40_000 },
    )
    .toBeGreaterThan(0.1);

  const snapshot = await readDirectionSnapshot(page);
  expect(Number.isFinite(snapshot.direction)).toBe(true);
  expect(snapshot.direction).toBeGreaterThanOrEqual(-180);
  expect(snapshot.direction).toBeLessThanOrEqual(180);
  expect(snapshot.needle).toMatch(/^-?\d+(?:\.\d+)?deg$/);

  const needleDegrees = Number.parseFloat(snapshot.needle);
  const initialNeedleDegrees = Number.parseFloat(initial.needle);
  expect(Number.isFinite(needleDegrees)).toBe(true);
  expect(Number.isFinite(initialNeedleDegrees)).toBe(true);
  expect(needleDegrees).not.toBe(initialNeedleDegrees);
});

test("distance and velocity sensor blocks show numeric values", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

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
    await readNumericDataValue(sensorValue);
  }
});

test("distance and velocity sensors update from autopilot ship motion", async ({ page }) => {
  await page.goto("./");
  await enableAutopilot(page);

  const initial = await readSensorSnapshot(page);
  expect(Number.isFinite(initial.distance)).toBe(true);
  expect(initial.distance).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(initial.speed)).toBe(true);
  expect(initial.speed).toBeGreaterThanOrEqual(0);

  await expect
    .poll(async () => (await readSensorSnapshot(page)).speed, { timeout: 10_000 })
    .toBeGreaterThan(initial.speed + 0.1);

  const snapshot = await readSensorSnapshot(page);
  expect(Number.isFinite(snapshot.distance)).toBe(true);
  expect(snapshot.distance).toBeGreaterThan(initial.distance);
  expect(snapshot.speed).toBeGreaterThan(0);
  expect(snapshot.vx).toBeGreaterThan(0);
  expect(Number.isFinite(snapshot.vy)).toBe(true);
  expect(Number.isFinite(snapshot.angle)).toBe(true);
  expect(snapshot.speed).toBeCloseTo(
    Math.hypot(snapshot.vx, snapshot.vy),
    6,
  );
  expect(snapshot.angle).toBeGreaterThanOrEqual(-180);
  expect(snapshot.angle).toBeLessThanOrEqual(180);
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

test("rear thruster latch resets on window blur and page hide", async ({ page }) => {
  await page.goto("./");

  const rearThruster = page.getByTestId("thruster-rear");

  await page.keyboard.press("Space");
  await expect(rearThruster).toHaveAttribute("data-active", "true");

  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
  });
  await expect(rearThruster).toHaveAttribute("data-active", "false");

  await page.keyboard.press("Space");
  await expect(rearThruster).toHaveAttribute("data-active", "true");

  await page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
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

test("E restores manual control with the rear latch off after autopilot", async ({ page }) => {
  await page.goto("./");

  const autopilotStatus = page.getByTestId("autopilot-status");
  const rearThruster = page.getByTestId("thruster-rear");
  const leftThruster = page.getByTestId("thruster-left");

  await page.keyboard.press("Space");
  await expect(rearThruster).toHaveAttribute("data-active", "true");

  await page.keyboard.press("e");
  await expect(autopilotStatus).toHaveAttribute("data-active", "true");

  await page.keyboard.press("Space");
  await page.keyboard.down("q");
  await page.waitForTimeout(250);
  await page.keyboard.up("q");

  await page.keyboard.press("e");
  await expect(autopilotStatus).toHaveAttribute("data-active", "false");
  await expect(autopilotStatus).toContainText("MANUAL");
  await expect(rearThruster).toHaveAttribute("data-active", "false");

  await page.keyboard.down("q");
  await expect(leftThruster).toHaveAttribute("data-active", "true");
  await page.keyboard.up("q");
  await expect(leftThruster).toHaveAttribute("data-active", "false");
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

test("autopilot mode persists across R while progress restarts", async ({ page }) => {
  await page.goto("./");

  const autopilotStatus = page.getByTestId("autopilot-status");
  const progress = page.getByTestId("hud-progress");
  const seedBefore = await readSeed(page);

  await page.keyboard.press("e");
  await expect(autopilotStatus).toHaveAttribute("data-active", "true");
  await expect
    .poll(() => readNumericDataValue(progress), { timeout: 10_000 })
    .toBeGreaterThan(0);

  await page.keyboard.press("r");

  await expect(autopilotStatus).toHaveAttribute("data-active", "true");
  await expect(autopilotStatus).toContainText("AUTOPILOT");
  expect(await readSeed(page)).not.toBe(seedBefore);
  await expect(progress).toHaveAttribute("data-value", "0");

  await expect
    .poll(() => readNumericDataValue(progress), { timeout: 10_000 })
    .toBeGreaterThan(0);
});

test("manual mode hides the whole sensor console and radar, and E toggles them", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByTestId("autopilot-status")).toHaveAttribute(
    "data-active",
    "false",
  );
  await expectSensorConsoleHidden(page);

  await page.keyboard.press("e");
  await expect(page.getByTestId("autopilot-status")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expectSensorConsoleVisible(page);
  await expect(page.getByTestId("eye-sensor-radius")).toBeVisible();

  await page.keyboard.press("e");
  await expect(page.getByTestId("autopilot-status")).toHaveAttribute(
    "data-active",
    "false",
  );
  await expectSensorConsoleHidden(page);
});

test("revealing the hidden sensor console draws its chart at a real size", async ({ page }) => {
  await page.goto("./");
  await expectSensorConsoleHidden(page);

  const chart = page.getByTestId("eye-sensor-chart");
  expect(await chart.evaluate((element) => element.clientWidth)).toBe(0);
  expect(await chart.evaluate((element) => element.clientHeight)).toBe(0);

  await enableAutopilot(page);

  const metrics = await chart.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return {
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      width: canvas.width,
      height: canvas.height,
    };
  });
  expect(metrics.clientWidth).toBeGreaterThan(0);
  expect(metrics.clientHeight).toBeGreaterThan(0);
  expect(metrics.width).toBeGreaterThan(1);
  expect(metrics.height).toBeGreaterThan(1);
  expect(await hasNonBackgroundPixels(chart)).toBe(true);

  const panel = page.getByTestId("eye-sensor-panel");
  await expect(panel).toBeVisible();
  await expectInsideViewport(page, panel);
});

test("sensor visibility follows autopilot mode across R and seed loads", async ({ page }) => {
  await page.goto("./");

  const seedDisplay = page.getByTestId("seed-display");
  const seedInput = page.getByTestId("seed-input");
  const seedLoad = page.getByTestId("seed-load");
  const autopilotStatus = page.getByTestId("autopilot-status");

  const seedBefore = await readSeed(page);
  await page.keyboard.press("r");
  expect(await readSeed(page)).not.toBe(seedBefore);
  await expectSensorConsoleHidden(page);

  await seedInput.fill("42");
  await seedLoad.click();
  await expect(seedDisplay).toHaveText("42");
  await expectSensorConsoleHidden(page);

  await enableAutopilot(page);
  const autopilotSeedBefore = await readSeed(page);
  await page.keyboard.press("r");
  expect(await readSeed(page)).not.toBe(autopilotSeedBefore);
  await expect(autopilotStatus).toHaveAttribute("data-active", "true");
  await expectSensorConsoleVisible(page);

  await seedInput.fill("7");
  await seedLoad.click();
  await expect(seedDisplay).toHaveText("7");
  await expect(autopilotStatus).toHaveAttribute("data-active", "true");
  await expectSensorConsoleVisible(page);
});

test("build info exposes the documented label and attributes", async ({ page }) => {
  await page.goto("./");

  const buildInfo = page.getByTestId("build-info");
  await expect(buildInfo).toBeVisible();

  const snapshot = await readBuildInfo(page);
  expect(snapshot.number).not.toBeNull();
  expect(snapshot.sha).not.toBeNull();
  expect(snapshot.time).not.toBeNull();
  expect(snapshot.source).not.toBeNull();

  expect(snapshot.source).toMatch(/^(ci|local)$/);
  expect(snapshot.number).toMatch(
    snapshot.source === "ci" ? /^\d+$/ : /^DEV$/,
  );
  expect(snapshot.sha).toMatch(/^(?:[0-9a-f]{7}|unknown)$/);
  expect(snapshot.time).toMatch(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/,
  );
  expect(snapshot.text).toBe(
    `BUILD ${snapshot.number} · ${snapshot.sha} · ${snapshot.time}`,
  );
  await expect(buildInfo).toContainText(
    `BUILD ${snapshot.number} · ${snapshot.sha} · ${snapshot.time}`,
  );
});

test("Change Log modal lists every curated entry newest first and expands entries", async ({ page }) => {
  test.setTimeout(45_000);

  const curated = readCuratedChangelog();
  expect(curated.length).toBeGreaterThan(0);

  await page.goto("./");

  const button = page.getByTestId("changelog-button");
  const dialog = page.getByTestId("changelog-dialog");
  const list = page.getByTestId("changelog-list");
  const entries = page.getByTestId("changelog-entry");

  await expect(button).toBeVisible();
  await expect(button).toContainText(/change log/i);
  await expect(dialog).toBeHidden();

  await button.click();
  await expect(dialog).toBeVisible();
  await expect(entries).toHaveCount(curated.length);

  const dates = await entries.locator(".changelog-entry-date").allInnerTexts();
  const titles = await entries.locator(".changelog-entry-title").allInnerTexts();
  expect(dates.map((value) => value.trim())).toEqual(
    curated.map((entry) => entry.date),
  );
  expect(titles.map((value) => value.trim())).toEqual(
    curated.map((entry) => entry.title),
  );

  await expect(entries.first()).toHaveAttribute("data-expanded", "true");
  await expect(entries.first().locator("summary")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(entries.nth(1)).toHaveAttribute("data-expanded", "false");

  await entries.nth(1).locator("summary").click();
  await expect(entries.nth(1)).toHaveAttribute("data-expanded", "true");
  await expect(entries.nth(1).locator("summary")).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await entries.first().locator("summary").click();
  await expect(entries.first()).toHaveAttribute("data-expanded", "false");
  await expect(entries.first().locator("summary")).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  const scroll = await list.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(scroll.scrollHeight).toBeGreaterThanOrEqual(scroll.clientHeight);
  expect(scroll.overflowY).toBe("auto");
});

test("Change Log closes by button, Escape, and outside click with focus return", async ({ page }) => {
  await page.goto("./");

  const button = page.getByTestId("changelog-button");
  const dialog = page.getByTestId("changelog-dialog");
  const close = page.getByTestId("changelog-close");

  const closeCases: (() => Promise<void>)[] = [
    async () => {
      await close.click();
    },
    async () => {
      await page.keyboard.press("Escape");
    },
    async () => {
      await page.mouse.click(4, 4);
    },
  ];

  for (const closeDialog of closeCases) {
    await button.click();
    await expect(dialog).toBeVisible();
    await closeDialog();
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  }
});

test("game keys are ignored while the Change Log modal is open", async ({ page }) => {
  await page.goto("./");

  const button = page.getByTestId("changelog-button");
  const dialog = page.getByTestId("changelog-dialog");
  const list = page.getByTestId("changelog-list");
  const autopilotStatus = page.getByTestId("autopilot-status");
  const seedBefore = await readSeed(page);

  await button.click();
  await expect(dialog).toBeVisible();
  await list.focus();
  await expect(list).toBeFocused();

  await page.keyboard.down("q");
  await page.keyboard.down("w");
  await page.keyboard.press("Space");
  await page.keyboard.press("e");
  await page.keyboard.press("r");
  await page.keyboard.up("q");
  await page.keyboard.up("w");

  await expect(autopilotStatus).toHaveAttribute("data-active", "false");
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

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  await page.keyboard.press("r");
  expect(await readSeed(page)).not.toBe(seedBefore);
});

test("progress increases while holding Q", async ({ page }) => {
  await page.goto("./");

  const progress = page.getByTestId("hud-progress");
  const score = page.getByTestId("hud-score");
  const initialProgress = await readNumericDataValue(progress);

  await page.keyboard.down("q");
  try {
    await expect
      .poll(() => readNumericDataValue(progress), { timeout: 8_000 })
      .toBeGreaterThan(initialProgress);
  } finally {
    await page.keyboard.up("q");
  }

  const values = await readTestIdNumbers(page, ["hud-progress", "hud-score"]);
  expect(values["hud-progress"]!).toBeGreaterThan(0);
  expect(Number.isInteger(values["hud-progress"]!)).toBe(true);
  expect(values["hud-score"]!).toBe(values["hud-progress"]!);
});

test("game canvas contains rendered pixels that differ from its background", async ({ page }) => {
  await page.goto("./");

  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toBeVisible();
  expect(await hasNonBackgroundPixels(canvas)).toBe(true);
});

test("game canvas keeps animating so the radar sweep and scene redraw", async ({ page }) => {
  await page.goto("./");

  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toBeVisible();
  expect(await hasNonBackgroundPixels(canvas)).toBe(true);

  const firstFrame = await canvasHash(canvas);
  expect(firstFrame).not.toBe(0);

  await expect
    .poll(async () => (await canvasHash(canvas)) !== firstFrame, {
      timeout: 3_000,
    })
    .toBe(true);

  expect(await hasNonBackgroundPixels(canvas)).toBe(true);
});

test("outcome overlay is attached but hidden while the Starship is flying", async ({ page }) => {
  await page.goto("./");

  const outcome = page.getByTestId("outcome");
  await expect(outcome).toBeAttached();
  await expect(outcome).toBeHidden();
});

test("destruction shows the outcome overlay with the final score and R restarts", async ({ page }) => {
  test.setTimeout(45_000);

  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => {
    runtimeErrors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`console: ${message.text()}`);
    }
  });

  await page.goto("./");

  const outcome = page.getByTestId("outcome");
  const seedDisplay = page.getByTestId("seed-display");
  const hull = page.getByTestId("hud-hull");
  const progress = page.getByTestId("hud-progress");
  const seedBefore = await readSeed(page);

  await expect(outcome).toBeAttached();
  await expect(outcome).toBeHidden();

  await page.keyboard.down("w");
  await page.waitForTimeout(3_500);
  await page.keyboard.down("q");

  await expect(outcome).toBeVisible({ timeout: 20_000 });
  await page.keyboard.up("q");
  await page.keyboard.up("w");

  await expect(outcome).toContainText(/Starship Destroyed/i);
  await expect(hull).toHaveAttribute("data-value", "0");

  const finalScore = Number(
    (await outcome.locator(".outcome-score-value").innerText()).trim(),
  );
  expect(Number.isInteger(finalScore)).toBe(true);
  expect(finalScore).toBeGreaterThanOrEqual(0);

  const hudScore = await readNumericDataValue(page.getByTestId("hud-score"));
  expect(hudScore).toBe(finalScore);

  await page.keyboard.press("r");

  await expect(outcome).toBeHidden();
  await expect(hull).toHaveAttribute("data-value", "100");
  await expect(progress).toHaveAttribute("data-value", "0");
  await expect(seedDisplay).not.toHaveText(String(seedBefore));

  expect(runtimeErrors).toEqual([]);
});

test("desktop layout has no overflow with the console hidden or visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");

  const canvas = page.getByTestId("game-canvas");
  const instructions = page.getByTestId("instructions");
  const panel = page.getByTestId("eye-sensor-panel");

  await expect(canvas).toBeVisible();
  await expectSensorConsoleHidden(page);
  await expectNoHorizontalOverflow(page);

  const mainBox = await page.locator("main.game").boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(mainBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();

  if (mainBox !== null && canvasBox !== null) {
    expect(Math.abs(canvasBox.width - mainBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(canvasBox.height - mainBox.height)).toBeLessThanOrEqual(1);
  }

  for (const testId of [
    "hud-hull",
    "hud-speed",
    "hud-progress",
    "hud-score",
    "thruster-left",
    "thruster-right",
    "thruster-rear",
    "autopilot-status",
    "seed-display",
    "seed-input",
    "seed-load",
    "build-info",
    "changelog-button",
    "instructions",
    "sim-panel",
    "sim-panel-toggle",
    "sim-speed",
    "gravity-scale",
    "bottom-power",
    "rear-power",
  ]) {
    const locator = page.getByTestId(testId);
    await expect(locator).toBeVisible();
    await expectInsideViewport(page, locator);
  }

  const hiddenInstructionsMaxWidth = await instructions.evaluate(
    (element) => getComputedStyle(element).maxWidth,
  );
  expect(hiddenInstructionsMaxWidth).toBe("none");

  await enableAutopilot(page);
  await expectNoHorizontalOverflow(page);

  for (const testId of [
    "hud-hull",
    "hud-speed",
    "hud-progress",
    "hud-score",
    "thruster-left",
    "thruster-right",
    "thruster-rear",
    "autopilot-status",
    "seed-display",
    "seed-input",
    "seed-load",
    "build-info",
    "changelog-button",
    "instructions",
    "sim-panel",
    "sim-panel-toggle",
    "sim-speed",
    "gravity-scale",
    "bottom-power",
    "rear-power",
    "eye-sensor-panel",
  ]) {
    const locator = page.getByTestId(testId);
    await expect(locator).toBeVisible();
    await expectInsideViewport(page, locator);
  }

  const visibleInstructionsMaxWidth = await instructions.evaluate(
    (element) => getComputedStyle(element).maxWidth,
  );
  expect(visibleInstructionsMaxWidth).not.toBe(hiddenInstructionsMaxWidth);

  const instructionsBox = await instructions.boundingBox();
  const consoleBox = await panel.boundingBox();
  expect(instructionsBox).not.toBeNull();
  expect(consoleBox).not.toBeNull();

  if (instructionsBox !== null && consoleBox !== null) {
    expect(rectsOverlap(instructionsBox, consoleBox)).toBe(false);
  }
});

test("narrow layout has no overflow with the console hidden or visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");

  const canvas = page.getByTestId("game-canvas");
  const instructions = page.getByTestId("instructions");
  const panel = page.getByTestId("eye-sensor-panel");

  await expect(canvas).toBeVisible();
  await expectSensorConsoleHidden(page);
  await expectNoHorizontalOverflow(page);

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  if (canvasBox !== null) {
    expect(canvasBox.width).toBeGreaterThan(0);
    expect(canvasBox.height).toBeGreaterThan(0);
    expect(Math.abs(canvasBox.width - 390)).toBeLessThanOrEqual(1);
  }

  for (const testId of [
    "hud-hull",
    "hud-speed",
    "hud-progress",
    "hud-score",
    "thruster-left",
    "thruster-right",
    "thruster-rear",
    "autopilot-status",
    "seed-display",
    "seed-input",
    "seed-load",
    "build-info",
    "changelog-button",
    "instructions",
    "sim-panel",
    "sim-panel-toggle",
    "sim-speed",
    "gravity-scale",
    "bottom-power",
    "rear-power",
  ]) {
    const locator = page.getByTestId(testId);
    await expect(locator).toBeVisible();
    await expectInsideViewport(page, locator);
  }

  const hiddenInstructionsMaxWidth = await instructions.evaluate(
    (element) => getComputedStyle(element).maxWidth,
  );
  expect(hiddenInstructionsMaxWidth).toBe("none");

  await enableAutopilot(page);
  await expectNoHorizontalOverflow(page);

  for (const testId of [
    "hud-hull",
    "hud-speed",
    "hud-progress",
    "hud-score",
    "thruster-left",
    "thruster-right",
    "thruster-rear",
    "autopilot-status",
    "seed-display",
    "seed-input",
    "seed-load",
    "build-info",
    "changelog-button",
    "instructions",
    "sim-panel",
    "sim-panel-toggle",
    "sim-speed",
    "gravity-scale",
    "bottom-power",
    "rear-power",
    "eye-sensor-panel",
  ]) {
    const locator = page.getByTestId(testId);
    await expect(locator).toBeVisible();
    await expectInsideViewport(page, locator);
  }

  const visibleInstructionsMaxWidth = await instructions.evaluate(
    (element) => getComputedStyle(element).maxWidth,
  );
  expect(visibleInstructionsMaxWidth).not.toBe(hiddenInstructionsMaxWidth);

  const instructionsBox = await instructions.boundingBox();
  const consoleBox = await panel.boundingBox();
  expect(instructionsBox).not.toBeNull();
  expect(consoleBox).not.toBeNull();

  if (instructionsBox !== null && consoleBox !== null) {
    expect(rectsOverlap(instructionsBox, consoleBox)).toBe(false);
  }
});
