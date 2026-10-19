import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://hauzzor.github.io/moonlander/";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const playwrightCli = createRequire(import.meta.url).resolve("@playwright/test/cli");

function normalizeBaseUrl(value) {
  const candidate = value?.trim() || DEFAULT_BASE_URL;
  return candidate.endsWith("/") ? candidate : `${candidate}/`;
}

async function waitForDeployment(url, attempts = 20, delayMs = 3000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) {
        return;
      }
    } catch {
      // Pages can be briefly unreachable while a deployment propagates.
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Deployed site did not become ready: ${url}`);
}

const targetUrl = normalizeBaseUrl(process.env.BASE_URL);
await waitForDeployment(targetUrl);

const child = spawn(
  process.execPath,
  [playwrightCli, "test", "e2e/smoke.spec.ts", ...process.argv.slice(2)],
  {
    cwd: repositoryRoot,
    env: { ...process.env, BASE_URL: targetUrl },
    stdio: "inherit",
  },
);

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    resolve(signal ? 1 : (code ?? 1));
  });
});

process.exit(exitCode);
