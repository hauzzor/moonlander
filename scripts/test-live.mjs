import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeAssetPath,
  normalizeBaseUrl,
  tryReadAssetPathFromIndex,
} from "./lib/live-asset.mjs";
import { waitForDeployment } from "./lib/live-deploy.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const distIndexPath = resolve(repositoryRoot, "packages/game/dist/index.html");
const playwrightCli = createRequire(import.meta.url).resolve("@playwright/test/cli");

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const waitAttempts = positiveInteger(process.env.LIVE_WAIT_ATTEMPTS, 40);
const waitDelayMs = positiveInteger(process.env.LIVE_WAIT_DELAY_MS, 3_000);

async function resolveExpectedAsset() {
  const explicit = process.env.EXPECT_ASSET?.trim();
  if (explicit) {
    return normalizeAssetPath(explicit);
  }

  return tryReadAssetPathFromIndex(distIndexPath);
}

const targetUrl = normalizeBaseUrl(process.env.BASE_URL);
const expectedAsset = await resolveExpectedAsset();

if (expectedAsset) {
  console.log(`[live] Expecting ${expectedAsset}`);
} else {
  console.log("[live] No built asset found; waiting for the deployed page only");
}

await waitForDeployment(targetUrl, expectedAsset, {
  attempts: waitAttempts,
  delayMs: waitDelayMs,
});

const child = spawn(
  process.execPath,
  [playwrightCli, "test", ...process.argv.slice(2)],
  {
    cwd: repositoryRoot,
    env: { ...process.env, BASE_URL: targetUrl },
    stdio: "inherit",
  },
);

const exitCode = await new Promise((resolvePromise, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    resolvePromise(signal ? 1 : (code ?? 1));
  });
});

process.exit(exitCode);
