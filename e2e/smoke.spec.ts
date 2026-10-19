import { expect, test } from "@playwright/test";

test("page loads without uncaught page errors or console errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("./");

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
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
