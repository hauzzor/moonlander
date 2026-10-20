import { expect, test, type Page } from "@playwright/test";

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

test("page loads without uncaught page errors or console errors", async ({ page }) => {
  const errors = collectRuntimeErrors(page);

  await page.goto("./");

  expect(errors).toEqual([]);
});

test("browser title contains Moonlander", async ({ page }) => {
  await page.goto("./");

  await expect(page).toHaveTitle(/Moonlander/);
});

test("an accessible Moonlander heading is visible", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "Moonlander", exact: true })).toBeVisible();
});

test("the game canvas is visible with non-zero rendered size", async ({ page }) => {
  await page.goto("./");

  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toBeVisible();

  const boundingBox = await canvas.boundingBox();
  expect(boundingBox).not.toBeNull();
  if (boundingBox !== null) {
    expect(boundingBox.width).toBeGreaterThan(0);
    expect(boundingBox.height).toBeGreaterThan(0);
  }
});

test("the page plays without uncaught page errors or console errors", async ({ page }) => {
  const errors = collectRuntimeErrors(page);

  await page.goto("./");

  await page.keyboard.down("q");
  await page.waitForTimeout(150);
  await page.keyboard.up("q");

  await page.keyboard.press("Space");
  await page.keyboard.press("e");
  await page.waitForTimeout(250);
  await page.keyboard.press("e");
  await page.keyboard.press("r");

  const slider = page.getByTestId("eye-sensor-radius");
  await slider.focus();
  await slider.press("Home");
  await slider.press("End");

  const seedInput = page.getByTestId("seed-input");
  await seedInput.fill("42");
  await seedInput.press("Enter");

  await page.waitForTimeout(300);

  expect(errors).toEqual([]);
});

test.describe("high-DPI canvas", () => {
  test.use({
    deviceScaleFactor: 2,
    viewport: { width: 1100, height: 800 },
  });

  test("canvas backing store tracks CSS size and device pixel ratio through resize", async ({ page }) => {
    await page.goto("./");

    const canvas = page.getByTestId("game-canvas");
    await expect(canvas).toBeVisible();

    const matchesDisplay = async (): Promise<boolean> =>
      canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) {
          return false;
        }

        const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const expectedWidth = Math.max(
          1,
          Math.round(element.clientWidth * ratio),
        );
        const expectedHeight = Math.max(
          1,
          Math.round(element.clientHeight * ratio),
        );

        return (
          element.width === expectedWidth && element.height === expectedHeight
        );
      });

    await expect.poll(matchesDisplay, { timeout: 5_000 }).toBe(true);

    const initial = await canvas.evaluate((element) => {
      if (!(element instanceof HTMLCanvasElement)) {
        return {
          width: 0,
          height: 0,
          clientWidth: 0,
          clientHeight: 0,
          devicePixelRatio: 0,
        };
      }

      return {
        width: element.width,
        height: element.height,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        devicePixelRatio: window.devicePixelRatio,
      };
    });

    expect(initial.devicePixelRatio).toBe(2);
    expect(initial.clientWidth).toBeGreaterThan(0);
    expect(initial.clientHeight).toBeGreaterThan(0);
    expect(initial.width).toBe(initial.clientWidth * 2);
    expect(initial.height).toBe(initial.clientHeight * 2);

    await page.setViewportSize({ width: 900, height: 700 });

    await expect
      .poll(
        async () =>
          canvas.evaluate((element) => {
            if (!(element instanceof HTMLCanvasElement)) {
              return { width: 0, height: 0 };
            }

            return { width: element.width, height: element.height };
          }),
        { timeout: 5_000 },
      )
      .not.toEqual({ width: initial.width, height: initial.height });

    await expect.poll(matchesDisplay, { timeout: 5_000 }).toBe(true);
  });
});
