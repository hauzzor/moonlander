import { expect, type Page } from "@playwright/test";

export type LevelId = "sandworm" | "gravity" | "anti-gravity";

export const LEVEL_NAMES: Record<LevelId, string> = {
  sandworm: "Inside the Sandworm's Gut",
  gravity: "Gravity",
  "anti-gravity": "Anti Gravity",
};

export const LEVELS = Object.keys(LEVEL_NAMES) as LevelId[];

export interface StartLevelOptions {
  seed?: number | null;
  search?: string | URLSearchParams;
}

function buildLevelSearch(
  level: LevelId,
  options: StartLevelOptions,
): string {
  const params = new URLSearchParams(
    typeof options.search === "string"
      ? options.search.replace(/^\?/, "")
      : (options.search ?? ""),
  );

  params.set("level", level);

  if (options.seed !== null) {
    params.set("seed", String(options.seed ?? 1));
  }

  return params.toString();
}

export async function startLevel(
  page: Page,
  level: LevelId = "sandworm",
  options: StartLevelOptions = {},
): Promise<void> {
  const query = buildLevelSearch(level, options);
  await page.goto(query.length > 0 ? `./?${query}` : "./");

  await expect(page.getByTestId("start-menu")).toBeHidden();
  await expect(page.getByTestId("game-menu")).toBeHidden();
  await expect(page.getByTestId("hud-level")).toHaveAttribute(
    "data-level",
    level,
  );
}

export async function startLevelFromMenu(
  page: Page,
  level: LevelId = "sandworm",
  options: Omit<StartLevelOptions, "seed"> & { seed?: number | null } = {},
): Promise<void> {
  const params = new URLSearchParams(
    typeof options.search === "string"
      ? options.search.replace(/^\?/, "")
      : (options.search ?? ""),
  );

  if (options.seed !== undefined && options.seed !== null) {
    params.set("seed", String(options.seed));
  }

  const query = params.toString();
  await page.goto(query.length > 0 ? `./?${query}` : "./");

  await expect(page.getByTestId("start-menu")).toBeVisible();
  await page.getByTestId(`level-card-${level}`).click();

  const levelStart = page.getByTestId("level-start");
  if (await levelStart.isVisible()) {
    await levelStart.click();
  }

  await expect(page.getByTestId("start-menu")).toBeHidden();
  await expect(page.getByTestId("game-menu")).toBeHidden();
  await expect(page.getByTestId("hud-level")).toHaveAttribute(
    "data-level",
    level,
  );
}

export async function readSimulationTick(page: Page): Promise<number> {
  const status = page.getByTestId("simulation-status");

  if ((await status.count()) === 0) {
    return 0;
  }

  const raw = await status.getAttribute("data-tick");
  if (raw === null || raw.trim().length === 0) {
    return 0;
  }

  const tick = Number(raw);
  expect(Number.isFinite(tick)).toBe(true);
  return tick;
}
