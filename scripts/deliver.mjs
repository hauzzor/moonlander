#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BRANCH = "main";
const DEFAULT_REMOTE = "origin";
const DEFAULT_LIVE_URL = "https://hauzzor.github.io/moonlander/";
const DEFAULT_TIMEOUT_SECONDS = 1200;
const POLL_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const distIndexPath = resolve(repositoryRoot, "packages/game/dist/index.html");
const liveTestPath = resolve(repositoryRoot, "scripts/test-live.mjs");

function usage() {
  return `Moonlander delivery automation

Usage:
  npm run deliver -- --message "feat: ..."
  node scripts/deliver.mjs [options]

Options:
  --message <text>   Commit message. Required for a real run.
  --stage-all        Stage every working-tree change with git add -A.
  --skip-verify      Skip npm run verify.
  --dry-run          Print the plan and make no changes.
  --no-push          Commit but do not push or verify the live deployment.
  --no-live          Skip deployment polling and the live Playwright suite.
  --timeout <sec>    Live deployment timeout in seconds (default: ${DEFAULT_TIMEOUT_SECONDS}).
  --branch <name>    Branch to require and push (default: ${DEFAULT_BRANCH}).
  --remote <name>    Git remote to require and push to (default: ${DEFAULT_REMOTE}).
  --help             Show this help.

Defaults:
  Live URL: ${DEFAULT_LIVE_URL}
  BASE_URL overrides the live URL.
  Poll interval: 15 seconds.

The script never force-pushes, amends, or resets commits.`;
}

function normalizeBaseUrl(value) {
  const candidate = value?.trim() || DEFAULT_LIVE_URL;
  return candidate.endsWith("/") ? candidate : `${candidate}/`;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    message: undefined,
    stageAll: false,
    skipVerify: false,
    dryRun: false,
    noPush: false,
    noLive: false,
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    branch: DEFAULT_BRANCH,
    remote: DEFAULT_REMOTE,
    liveUrl: normalizeBaseUrl(process.env.BASE_URL),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--message":
        options.message = readValue(argv, (index += 1), arg);
        break;
      case "--stage-all":
        options.stageAll = true;
        break;
      case "--skip-verify":
        options.skipVerify = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-push":
        options.noPush = true;
        break;
      case "--no-live":
        options.noLive = true;
        break;
      case "--timeout": {
        const raw = readValue(argv, (index += 1), arg);
        const seconds = Number(raw);
        if (!Number.isFinite(seconds) || seconds <= 0) {
          throw new Error(`${arg} must be a positive number of seconds`);
        }
        options.timeoutSeconds = seconds;
        break;
      }
      case "--branch":
        options.branch = readValue(argv, (index += 1), arg);
        break;
      case "--remote":
        options.remote = readValue(argv, (index += 1), arg);
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }
  }

  if (!options.branch.trim()) {
    throw new Error("--branch must not be empty");
  }
  if (!options.remote.trim()) {
    throw new Error("--remote must not be empty");
  }
  if (options.message !== undefined && !options.message.trim()) {
    throw new Error("--message must not be empty");
  }

  return options;
}

function spawnCommand(command, args, options) {
  if (process.platform === "win32" && command === npmCommand) {
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", npmCommand, ...args], options);
  }
  return spawn(command, args, options);
}

function runCommand(command, args, options = {}) {
  const {
    env,
    capture = false,
    allowFailure = false,
    label = [command, ...args].join(" "),
  } = options;

  return new Promise((resolvePromise, reject) => {
    const child = spawnCommand(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, ...env },
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const result = {
        code: signal ? 1 : (code ?? 1),
        signal,
        stdout,
        stderr,
      };

      if (result.code !== 0 && !allowFailure) {
        const detail = (stderr.trim() || stdout.trim());
        const suffix = detail ? `\n${detail}` : "";
        reject(new Error(`${label} failed with exit code ${result.code}${suffix}`));
        return;
      }

      resolvePromise(result);
    });
  });
}

function git(args, options = {}) {
  return runCommand("git", args, {
    label: `git ${args.join(" ")}`,
    ...options,
  });
}

function npm(args, options = {}) {
  return runCommand(npmCommand, args, {
    label: `${npmCommand} ${args.join(" ")}`,
    ...options,
  });
}

function step(message) {
  console.log(`\n==> ${message}`);
}

function detail(message) {
  console.log(`    ${message}`);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

async function preflight(options) {
  step("Preflight");

  const insideWorkTree = await git(["rev-parse", "--is-inside-work-tree"], {
    capture: true,
    allowFailure: true,
  });
  if (insideWorkTree.code !== 0 || insideWorkTree.stdout.trim() !== "true") {
    throw new Error(`Not a git repository: ${repositoryRoot}`);
  }

  const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], { capture: true })).stdout.trim();
  if (branch !== options.branch) {
    throw new Error(
      `Current branch "${branch}" does not match --branch "${options.branch}". ` +
        `Switch branches or pass --branch "${branch}".`,
    );
  }

  const remote = await git(["remote", "get-url", options.remote], {
    capture: true,
    allowFailure: true,
  });
  if (remote.code !== 0) {
    throw new Error(`Remote "${options.remote}" does not exist`);
  }

  const unmerged = await git(["ls-files", "--unmerged"], { capture: true });
  if (unmerged.stdout.trim()) {
    throw new Error("Repository has unresolved merge conflicts");
  }

  const unstagedWhitespace = await git(["diff", "--check"], {
    capture: true,
    allowFailure: true,
  });
  if (unstagedWhitespace.code !== 0) {
    throw new Error(
      `Whitespace check failed:\n${(unstagedWhitespace.stderr.trim() || unstagedWhitespace.stdout.trim())}`,
    );
  }

  const stagedWhitespace = await git(["diff", "--cached", "--check"], {
    capture: true,
    allowFailure: true,
  });
  if (stagedWhitespace.code !== 0) {
    throw new Error(
      `Staged whitespace check failed:\n${(stagedWhitespace.stderr.trim() || stagedWhitespace.stdout.trim())}`,
    );
  }

  detail(`Repository: ${repositoryRoot}`);
  detail(`Branch: ${branch}`);
  detail(`Remote: ${options.remote} (${remote.stdout.trim()})`);
  detail(`Live URL: ${options.liveUrl}`);
}

async function readStatus() {
  return (await git(["status", "--porcelain"], { capture: true })).stdout.trimEnd();
}

async function readStagedStat() {
  return (await git(["diff", "--cached", "--stat"], { capture: true })).stdout.trimEnd();
}

function printState(status, stagedStat) {
  console.log("\nWorking tree status (git status --porcelain):");
  console.log(status || "(clean)");
  console.log("\nStaged diff stat (git diff --cached --stat):");
  console.log(stagedStat || "(no staged changes)");
}

async function hasStagedChanges() {
  const result = await git(["diff", "--cached", "--quiet"], {
    capture: true,
    allowFailure: true,
  });
  if (result.code === 0) {
    return false;
  }
  if (result.code === 1) {
    return true;
  }
  throw new Error(
    `Unable to inspect staged changes:\n${(result.stderr.trim() || result.stdout.trim())}`,
  );
}

async function checkStagedWhitespace() {
  const result = await git(["diff", "--cached", "--check"], {
    capture: true,
    allowFailure: true,
  });
  if (result.code !== 0) {
    throw new Error(
      `Staged whitespace check failed:\n${(result.stderr.trim() || result.stdout.trim())}`,
    );
  }
}

async function readAssetPath() {
  let html;
  try {
    html = await readFile(distIndexPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Missing build output: ${distIndexPath}. Run npm run build or omit --skip-verify.`,
      );
    }
    throw error;
  }

  const scriptMatch = html.match(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+\.(?:js|mjs))["']/i);
  const fallbackMatch = html.match(/assets\/[A-Za-z0-9._-]+\.(?:js|mjs)/i);
  let asset = scriptMatch?.[1] ?? fallbackMatch?.[0];

  if (!asset) {
    throw new Error(`Could not find a hashed JavaScript asset in ${distIndexPath}`);
  }

  if (/^https?:\/\//i.test(asset)) {
    asset = new URL(asset).pathname;
  }

  const assetsIndex = asset.indexOf("assets/");
  asset = assetsIndex >= 0 ? asset.slice(assetsIndex) : asset.replace(/^\.?\//, "");

  if (!/^assets\/[^/]+\.(?:js|mjs)$/i.test(asset)) {
    throw new Error(`Unexpected asset path in ${distIndexPath}: ${asset}`);
  }

  return asset;
}

async function tryReadAssetPath() {
  try {
    return await readAssetPath();
  } catch {
    return undefined;
  }
}

function liveChecksEnabled(options) {
  return !options.noPush && !options.noLive;
}

function printPlan(options, message) {
  console.log(message);
  const steps = [
    `Git preflight: repository, branch "${options.branch}", remote "${options.remote}", conflicts, whitespace`,
    options.stageAll ? "Stage all changes: git add -A" : "Use already staged changes",
  ];

  steps.push(options.skipVerify ? "Skip npm run verify" : "Run npm run verify");
  steps.push(
    options.message
      ? `Commit: git commit -m "${options.message}"`
      : "Commit: needs --message for a real run",
  );

  if (options.noPush) {
    steps.push("Skip push (--no-push)");
  } else {
    steps.push(`Push: git push ${options.remote} ${options.branch}`);
  }

  steps.push(`Read built asset from ${distIndexPath}`);

  if (liveChecksEnabled(options)) {
    steps.push(
      `Poll ${options.liveUrl} every 15s for up to ${options.timeoutSeconds}s until the built asset is served`,
    );
    steps.push(
      `Live test: BASE_URL=${options.liveUrl} node scripts/test-live.mjs`,
    );
  } else {
    steps.push(options.noPush ? "Skip live checks (--no-push)" : "Skip live checks (--no-live)");
  }

  console.log("\nPlanned steps:");
  steps.forEach((entry, index) => {
    console.log(`  ${index + 1}. ${entry}`);
  });
}

async function dryRun(options, status, stagedStat, hasChanges) {
  printPlan(options, "Delivery plan (dry run)");

  const asset = await tryReadAssetPath();
  console.log("\nStaged diff stat would be applied after optional staging.");
  console.log(`Asset: ${asset ?? "(not built; would be read after npm run verify)"}`);
  console.log(`Live URL: ${options.liveUrl}`);

  if (!hasChanges) {
    console.log("\nnothing to deliver");
  }

  console.log("\nDelivery result (dry run)");
  console.log("  Commit: (none)");
  detail(`Branch: ${options.branch}`);
  detail(`Remote: ${options.remote}`);
  detail(`Asset: ${asset ?? "(not built)"}`);
  detail(`Live URL: ${options.liveUrl}`);
  detail("Live tests: not run");
  console.log("\nDry run complete; no changes were made.");
}

async function fetchLiveHtml(url, remainingMs) {
  const controller = new AbortController();
  const requestTimeout = Math.max(1, Math.min(REQUEST_TIMEOUT_MS, remainingMs));
  const timer = setTimeout(() => {
    controller.abort();
  }, requestTimeout);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForLiveAsset(liveUrl, assetPath, timeoutSeconds) {
  const assetName = assetPath.split("/").pop();
  const deadline = Date.now() + timeoutSeconds * 1000;
  let attempt = 0;

  while (true) {
    attempt += 1;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        `Timed out after ${timeoutSeconds}s waiting for ${assetName} at ${liveUrl}`,
      );
    }

    const url = new URL(liveUrl);
    url.searchParams.set("delivery", `${Date.now()}-${attempt}`);
    console.log(`[live] Attempt ${attempt}: checking ${url.toString()}`);

    try {
      const html = await fetchLiveHtml(url.toString(), remaining);
      if (html.includes(assetName) || html.includes(assetPath)) {
        console.log(`[live] Deployment is serving ${assetName}`);
        return;
      }
      console.log(`[live] Live HTML does not contain ${assetName} yet`);
    } catch (error) {
      console.log(`[live] Not ready: ${error.message}`);
    }

    const waitMs = Math.min(POLL_INTERVAL_MS, deadline - Date.now());
    if (waitMs <= 0) {
      throw new Error(
        `Timed out after ${timeoutSeconds}s waiting for ${assetName} at ${liveUrl}`,
      );
    }
    console.log(`[live] Retrying in ${Math.ceil(waitMs / 1000)}s`);
    await sleep(waitMs);
  }
}

function printResult({ commit, options, asset, liveResult }) {
  console.log("\nDelivery result");
  console.log(`  Commit: ${commit}`);
  detail(`Branch: ${options.branch}`);
  detail(`Remote: ${options.remote}`);
  detail(`Asset: ${asset}`);
  detail(`Live URL: ${options.liveUrl}`);
  detail(`Live tests: ${liveResult}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  if (!options.dryRun && !options.message) {
    throw new Error("--message is required for a real delivery run");
  }

  await preflight(options);

  const status = await readStatus();
  const stagedStat = await readStagedStat();
  printState(status, stagedStat);

  let hasChanges;

  if (options.stageAll) {
    if (options.dryRun) {
      console.log("\n--stage-all would run: git add -A");
      hasChanges = status.trim().length > 0;
    } else {
      step("Staging all changes");
      await git(["add", "-A"]);
      const stagedStatus = await readStatus();
      const stagedAfter = await readStagedStat();
      printState(stagedStatus, stagedAfter);
      await checkStagedWhitespace();
      hasChanges = await hasStagedChanges();
    }
  } else {
    hasChanges = await hasStagedChanges();
    if (!hasChanges && status.trim()) {
      console.log(
        "\nNo staged changes. Stage files intentionally or rerun with --stage-all.",
      );
    }
  }

  if (options.dryRun) {
    await dryRun(options, status, stagedStat, hasChanges);
    return;
  }

  if (!hasChanges) {
    console.log("\nnothing to deliver");
    return;
  }

  if (options.skipVerify) {
    step("Skipping verification (--skip-verify)");
  } else {
    step("Running verification (npm run verify)");
    await npm(["run", "verify"]);
  }

  const asset = await readAssetPath();
  step(`Built asset: ${asset}`);

  step("Committing");
  detail(`git commit -m "${options.message}"`);
  await git(["commit", "-m", options.message]);
  const commit = (await git(["rev-parse", "HEAD"], { capture: true })).stdout.trim();

  if (options.noPush) {
    step("Skipping push (--no-push)");
  } else {
    step(`Pushing to ${options.remote} ${options.branch}`);
    await git(["push", options.remote, options.branch]);
  }

  let liveResult;

  if (options.noPush) {
    liveResult = "skipped (--no-push)";
  } else if (options.noLive) {
    liveResult = "skipped (--no-live)";
  } else {
    step(`Waiting for ${asset} at ${options.liveUrl}`);
    await waitForLiveAsset(options.liveUrl, asset, options.timeoutSeconds);

    step("Running live Playwright suite");
    detail(`BASE_URL=${options.liveUrl} node scripts/test-live.mjs`);
    const live = await runCommand(process.execPath, [liveTestPath], {
      env: { BASE_URL: options.liveUrl },
      allowFailure: true,
      label: "live Playwright suite",
    });
    liveResult = live.code === 0 ? "passed" : `failed (exit ${live.code})`;
  }

  printResult({ commit, options, asset, liveResult });

  if (liveResult.startsWith("failed")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nDelivery failed: ${error.message}`);
  process.exitCode = 1;
});
