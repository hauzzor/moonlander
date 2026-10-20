#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  NEEDS_INFO_CATEGORIES,
  RETRYABLE_CATEGORIES,
  classifyBlock,
  isLockStale,
  nextRecoveryTimeoutMs,
  parseAgentReport,
  resolveRecoveryPolicy,
  selectRecoverable,
  ticketRecoveryCategory,
} from "./lib/recovery.mjs";
import {
  ACTIVE_STATUSES,
  ensureQueue,
  findTicket,
  listTickets,
  moveTicket,
  selectClaimable,
  statusDir,
  ticketsRoot,
  updateTicket,
} from "./lib/tickets.mjs";

const repoRoot = process.cwd();
const root = ticketsRoot(repoRoot);
const argv = process.argv.slice(2);
const recoveryEnv = resolveRecoveryPolicy(process.env);
const options = {
  once: argv.includes("--once"),
  dryRun: argv.includes("--dry-run"),
  force: argv.includes("--force"),
  recover: !argv.includes("--no-recover"),
  help: argv.includes("--help") || argv.includes("-h"),
  maxParallel: Number(
    (() => {
      const index = argv.indexOf("--max-parallel");
      return index >= 0 ? argv[index + 1] : process.env.TICKET_MAX_PARALLEL ?? 3;
    })(),
  ),
  maxRecoveryAttempts: Number(
    (() => {
      const index = argv.indexOf("--max-recovery-attempts");
      return index >= 0 ? argv[index + 1] : recoveryEnv.maxAttempts;
    })(),
  ),
  recoveryDelayMs: recoveryEnv.cooldownMs,
  recoveryTimeoutMs: recoveryEnv.recoveryTimeoutMs,
  staleLockMs: recoveryEnv.staleLockMs,
  runnerHeartbeatMs: Number(process.env.TICKET_RUNNER_HEARTBEAT_MS ?? 30_000),
  pollMs: Number(process.env.TICKET_POLL_MS ?? 5000),
  agentTimeoutMs: Number(process.env.TICKET_AGENT_TIMEOUT_MS ?? 45 * 60 * 1000),
  portBase: Number(process.env.TICKET_PORT_BASE ?? 4300),
};
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const opencodeCommand = process.platform === "win32" ? "opencode.exe" : "opencode";

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

function log(message, ticketId = "runner") {
  console.log(`[${timestamp()}] [${ticketId}] ${message}`);
}

class TicketBlockedError extends Error {
  constructor(message, { stage, category, agentOutput = "" } = {}) {
    super(message);
    this.name = "TicketBlockedError";
    this.stage = stage;
    this.category = category;
    this.agentOutput = agentOutput;
  }
}

function runnerLockFile() {
  return path.join(root, ".locks", "runner.json");
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function processCommandLine(pid) {
  return new Promise((resolve) => {
    const command =
      process.platform === "win32" ? "powershell.exe" : "ps";
    const args =
      process.platform === "win32"
        ? [
            "-NoProfile",
            "-Command",
            `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
          ]
        : ["-p", String(pid), "-o", "command="];
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", () => resolve(""));
    child.once("exit", () => resolve(output.trim()));
  });
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function processLooksLikeRunner(pid) {
  if (!processIsAlive(pid)) return false;
  const commandLine = await processCommandLine(pid);
  return /ticket-runner|opencode/i.test(commandLine);
}

async function terminateProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
      child.once("error", () => resolve());
      child.once("exit", () => resolve());
    });
    return true;
  }
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

async function acquireRunnerLock() {
  const lockPath = runnerLockFile();
  while (true) {
    try {
      await writeFile(
        lockPath,
        JSON.stringify(
          {
            pid: process.pid,
            cwd: repoRoot,
            startedAt: new Date().toISOString(),
            heartbeat: new Date().toISOString(),
          },
          null,
          2,
        ),
        { encoding: "utf8", flag: "wx" },
      );
      return lockPath;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = await readJson(lockPath);
      if (
        existing &&
        !options.force &&
        !isLockStale(existing, Date.now(), options.staleLockMs)
      ) {
        throw new Error(
          `Another runner is active (pid=${existing.pid ?? "?"}, heartbeat=${
            existing.heartbeat ?? "?"
          }). Use --force to take over.`,
        );
      }
      if (existing?.pid && existing.pid !== process.pid) {
        if (processIsAlive(existing.pid)) {
          const isRunner = await processLooksLikeRunner(existing.pid);
          if (!isRunner && !options.force) {
            throw new Error(
              `Stale runner lock has live pid=${existing.pid} that is not a ticket runner; inspect ${lockPath}`,
            );
          }
          if (isRunner) {
            log(`terminating stale runner pid=${existing.pid}`);
            await terminateProcessTree(existing.pid);
          }
        }
      }
      log(`taking over stale runner lock ${lockPath}`);
      await rm(lockPath, { force: true });
    }
  }
}

async function heartbeatRunnerLock(lockPath) {
  const lock = await readJson(lockPath);
  if (!lock) return;
  lock.heartbeat = new Date().toISOString();
  await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
}

function releaseRunnerLock(lockPath) {
  if (!lockPath) return;
  try {
    rmSync(lockPath, { force: true });
  } catch {
    // The lock may already be gone.
  }
}

function recoveryPolicy() {
  return {
    maxAttempts: options.maxRecoveryAttempts,
    cooldownMs: options.recoveryDelayMs,
    recoveryTimeoutMs: options.recoveryTimeoutMs,
    staleLockMs: options.staleLockMs,
  };
}

async function appendRecoveryLog(ticketId, message) {
  const directory = await ensureTicketLogDir(ticketId);
  await appendFile(
    path.join(directory, "recovery.log"),
    `[${new Date().toISOString()}] ${message}\n`,
  );
}

async function mainWorktreeCleanOutsideQueue() {
  const status = await run("git", ["status", "--porcelain"], {
    capture: true,
    check: false,
  });
  return status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .every((line) => line.slice(3).startsWith("docs/tickets/"));
}

function usage() {
  return `Moonlander ticket runner

Usage:
  npm.cmd run tickets:run
  npm.cmd run tickets:run -- --once
  npm.cmd run tickets:run -- --dry-run
  npm.cmd run tickets:run -- --max-parallel 2
  npm.cmd run tickets:run -- --no-recover
  npm.cmd run tickets:run -- --max-recovery-attempts 1
  npm.cmd run tickets:run -- --force

Environment:
  TICKET_MAX_PARALLEL          default 3
  TICKET_POLL_MS               default 5000
  TICKET_AGENT_TIMEOUT_MS      default 2700000
  TICKET_MAX_RECOVERY_ATTEMPTS default 1
  TICKET_RECOVERY_DELAY_MS     default 300000
  TICKET_RECOVERY_TIMEOUT_MS   default 5400000
  TICKET_STALE_LOCK_MS         default 300000
  TICKET_RUNNER_HEARTBEAT_MS   default 30000
  TICKET_PORT_BASE             default 4300

Only confirmed ready tickets are claimed. Recoverable blocked tickets are
requeued once with their preserved worktree and a longer agent timeout. Stale
in-progress locks are recovered through the same path. See
docs/tickets/README.md.`;
}

function spawnCommand(command, args, spawnOptions) {
  if (process.platform === "win32" && command === npmCommand) {
    return spawn(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", npmCommand, ...args],
      spawnOptions,
    );
  }
  return spawn(command, args, spawnOptions);
}

async function run(command, args, runOptions = {}) {
  const {
    cwd = repoRoot,
    env = {},
    logPath,
    label = [command, ...args].join(" "),
    capture = false,
    check = true,
    timeoutMs = 0,
    ticketId = "runner",
  } = runOptions;

  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(async () => {
            if (settled) return;
            settled = true;
            await terminateProcessTree(child.pid);
            const error = new Error(`${label} timed out after ${timeoutMs}ms`);
            error.stdout = stdout;
            error.stderr = stderr;
            error.timedOut = true;
            reject(error);
          }, timeoutMs)
        : null;

    const handle = (chunk, stream) => {
      const text = chunk.toString();
      if (stream === "stdout") stdout += text;
      else stderr += text;
      if (logPath) appendFile(logPath, text).catch(() => {});
      if (!capture) {
        (stream === "stdout" ? process.stdout : process.stderr).write(text);
      }
    };

    child.stdout.on("data", (chunk) => handle(chunk, "stdout"));
    child.stderr.on("data", (chunk) => handle(chunk, "stderr"));
    child.once("error", (error) => {
      if (timer) clearTimeout(timer);
      settled = true;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const result = { code: code ?? 1, stdout, stderr };
      if (check && result.code !== 0) {
        const detail = (stderr.trim() || stdout.trim()).slice(-4000);
        const error = new Error(
          `${label} failed with exit code ${result.code}${detail ? `\n${detail}` : ""}`,
        );
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      log(`${label} -> ${result.code}`, ticketId);
      resolve(result);
    });
  });
}

async function ensureTicketLogDir(ticketId) {
  const directory = path.join(root, "logs", ticketId);
  await mkdir(directory, { recursive: true });
  return directory;
}

async function writeLock(ticket, info) {
  const directory = path.join(root, ".locks");
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, `${ticket.id}.json`);
  await writeFile(
    lockPath,
    JSON.stringify(
      {
        id: ticket.id,
        pid: process.pid,
        updatedAt: new Date().toISOString(),
        ...info,
      },
      null,
      2,
    ),
    "utf8",
  );
  return lockPath;
}

async function removeLock(ticketId) {
  await rm(path.join(root, ".locks", `${ticketId}.json`), { force: true });
}

async function heartbeat(lockPath) {
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.heartbeat = new Date().toISOString();
    await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
  } catch {
    // The lock may have been removed; the current ticket still owns the worktree.
  }
}

async function acquireDeliveryLock(info, timeoutMs = 30 * 60 * 1000) {
  const lockPath = path.join(root, ".locks", "delivery.json");
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      await writeFile(
        lockPath,
        JSON.stringify({ ...info, pid: process.pid, heartbeat: new Date().toISOString() }, null, 2),
        { encoding: "utf8", flag: "wx" },
      );
      return lockPath;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        const heartbeatTime = Date.parse(lock.heartbeat ?? lock.updatedAt ?? 0);
        if (Number.isFinite(heartbeatTime) && Date.now() - heartbeatTime > 30 * 60 * 1000) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error("Timed out waiting for the delivery lock");
      }
      log("waiting for delivery lock", info.ticketId ?? "runner");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function addQueueCommit(message) {
  const status = await run("git", ["status", "--porcelain"], { capture: true, check: false });
  const lines = status.stdout.split(/\r?\n/).filter(Boolean);
  const outsideQueue = lines.filter((line) => !line.slice(3).startsWith("docs/tickets/"));
  if (outsideQueue.length > 0) {
    throw new Error(
      `Main worktree has changes outside docs/tickets:\n${outsideQueue.join("\n")}`,
    );
  }
  if (lines.length === 0) return;
  await run("git", ["add", "docs/tickets"]);
  await run("git", ["commit", "-m", message]);
}

async function blockTicket(ticket, error, worktree, logPath, meta = {}) {
  const message = error?.message ?? String(error);
  const stage = meta.stage ?? "unknown";
  const current = await findTicket(root, ticket.id);
  const attempts = Number(current?.data["recovery-attempts"] ?? 0) || 0;
  const classification = meta.category
    ? {
        category: meta.category,
        retryable:
          meta.retryable ?? RETRYABLE_CATEGORIES.has(meta.category),
      }
    : classifyBlock({
        stage,
        message,
        agentOutput: error?.agentOutput ?? "",
      });
  const category = classification.category;
  const retryable = classification.retryable;
  const exhausted = !retryable || attempts >= options.maxRecoveryAttempts;
  const destination =
    NEEDS_INFO_CATEGORIES.has(category) || category === "needs-info"
      ? "needs-info"
      : "blocked";

  log(
    `BLOCKED (${stage}/${category}): ${message}`,
    ticket.id,
  );
  if (logPath) {
    await appendFile(logPath, `\nBLOCKED (${stage}/${category}): ${message}\n`).catch(
      () => {},
    );
  }
  await appendRecoveryLog(
    ticket.id,
    `blocked stage=${stage} category=${category} attempts=${attempts}/${options.maxRecoveryAttempts} exhausted=${exhausted} destination=${destination} reason=${message}`,
  );
  if (current && current.status !== "done") {
    await updateTicket(current, {
      "blocked-reason": message,
      "blocked-at": new Date().toISOString(),
      "blocked-stage": stage,
      "blocked-category": category,
      "recovery-exhausted": exhausted,
    });
    await moveTicket(root, current, destination);
    try {
      await addQueueCommit(`chore(tickets): block ${ticket.id}`);
    } catch (commitError) {
      log(`could not commit blocked ticket: ${commitError.message}`, ticket.id);
    }
  }
  await removeLock(ticket.id);
  if (worktree && existsSync(worktree)) {
    log(`worktree preserved for inspection: ${worktree}`, ticket.id);
  }
}

async function createWorktree(ticket, worktree, branch) {
  if (existsSync(worktree)) {
    log(`using existing worktree ${worktree}`, ticket.id);
    return;
  }
  try {
    await run("git", ["worktree", "add", worktree, "-b", branch, "main"]);
  } catch {
    await run("git", ["worktree", "add", worktree, branch]);
  }
}

async function requeueRecoverable(tickets, active, slots) {
  if (!options.recover || options.maxRecoveryAttempts <= 0 || slots <= 0) {
    return [];
  }
  if (!(await mainWorktreeCleanOutsideQueue())) {
    log("skipping recovery: main worktree has changes outside docs/tickets");
    return [];
  }

  const policy = recoveryPolicy();
  const selected = selectRecoverable(
    tickets,
    active,
    Date.now(),
    policy,
    slots,
  );
  const recovered = [];
  for (const ticket of selected) {
    const attempts = Number(ticket.data["recovery-attempts"] ?? 0) || 0;
    const category = ticketRecoveryCategory(ticket);
    const reason = String(ticket.data["blocked-reason"] ?? "");
    const timeoutMs = nextRecoveryTimeoutMs(ticket, policy);
    try {
      await updateTicket(ticket, {
        "recovery-attempts": attempts + 1,
        "recovery-last-at": new Date().toISOString(),
        "recovery-exhausted": false,
      });
      await moveTicket(root, ticket, "ready");
      await appendRecoveryLog(
        ticket.id,
        `requeued attempt ${attempts + 1}/${policy.maxAttempts} category=${category} timeout=${timeoutMs} reason=${reason}`,
      );
      log(
        `recovering ${ticket.id} attempt ${attempts + 1}/${policy.maxAttempts} (${category}, timeout=${timeoutMs}ms)`,
        ticket.id,
      );
      recovered.push(ticket);
    } catch (error) {
      log(`could not requeue ${ticket.id}: ${error.message}`, ticket.id);
    }
  }

  if (recovered.length > 0) {
    try {
      await addQueueCommit(
        `chore(tickets): recover ${recovered.map((item) => item.id).join(", ")}`,
      );
    } catch (error) {
      log(`could not commit recovered tickets: ${error.message}`);
    }
  }
  return recovered;
}

async function recoverOrphans() {
  if (!options.recover) return [];
  const tickets = await listTickets(root);
  const candidates = tickets.filter(
    (ticket) => ticket.status === "in-progress",
  );
  const recovered = [];

  for (const ticket of candidates) {
    const lockPath = path.join(root, ".locks", `${ticket.id}.json`);
    const lock = await readJson(lockPath);
    if (lock?.pid === process.pid) continue;
    if (!isLockStale(lock, Date.now(), options.staleLockMs)) continue;

    if (lock?.pid && processIsAlive(lock.pid)) {
      const isRunner = await processLooksLikeRunner(lock.pid);
      if (!isRunner) {
        log(
          `orphan check skipped ${ticket.id}: live pid=${lock.pid} is not a ticket runner`,
          ticket.id,
        );
        continue;
      }
      log(
        `terminating stale runner pid=${lock.pid} for ${ticket.id}`,
        ticket.id,
      );
      await terminateProcessTree(lock.pid);
    }

    try {
      await updateTicket(ticket, {
        "blocked-reason": "orphaned: runner lock is missing or stale",
        "blocked-at": new Date().toISOString(),
        "blocked-stage": "orphaned",
        "blocked-category": "infra",
      });
      await moveTicket(root, ticket, "blocked");
      await appendRecoveryLog(
        ticket.id,
        `orphaned from stale lock lock=${lock?.heartbeat ?? "missing"}`,
      );
      log(`recovered orphaned ${ticket.id} from a stale lock`, ticket.id);
      recovered.push(ticket);
    } catch (error) {
      log(
        `could not recover orphaned ${ticket.id}: ${error.message}`,
        ticket.id,
      );
    }
  }

  if (recovered.length > 0) {
    try {
      await addQueueCommit(
        `chore(tickets): recover orphaned ${recovered
          .map((item) => item.id)
          .join(", ")}`,
      );
    } catch (error) {
      log(`could not commit orphan recovery: ${error.message}`);
    }
  }
  return recovered;
}

async function runTicket(ticket) {
  const ticketId = ticket.id;
  const logDirectory = await ensureTicketLogDir(ticketId);
  const runnerLog = path.join(logDirectory, "runner.log");
  const agentLog = path.join(logDirectory, "agent.log");
  const verifyLog = path.join(logDirectory, "verify.log");
  const deliveryLog = path.join(logDirectory, "delivery.log");
  const worktree = path.join(repoRoot, ".worktrees", ticketId);
  const branch = `ticket/${ticketId}`;
  const numericId = Number(String(ticketId).replace(/\D/g, "")) || 1;
  const port = options.portBase + (numericId % 100);
  const lockPath = await writeLock(ticket, {
    branch,
    worktree,
    port,
    heartbeat: new Date().toISOString(),
  });
  let stage = "setup";
  let heartbeatTimer;

  try {
    await moveTicket(root, ticket, "in-progress");
    log(`worktree=${worktree} branch=${branch} port=${port}`, ticketId);
    await appendFile(runnerLog, `claimed ${ticketId} worktree=${worktree}\n`);
    await createWorktree(ticket, worktree, branch);
    await heartbeat(lockPath);
    heartbeatTimer = setInterval(() => {
      heartbeat(lockPath).catch(() => {});
    }, options.runnerHeartbeatMs);

    stage = "setup";
    log("installing worktree dependencies", ticketId);
    await run(npmCommand, ["ci"], {
      cwd: worktree,
      env: { TICKET_PORT: String(port) },
      logPath: runnerLog,
      label: "npm ci",
      ticketId,
      timeoutMs: 10 * 60 * 1000,
    });

    const current = await findTicket(root, ticketId);
    const attempts = Number(current?.data["recovery-attempts"] ?? 0) || 0;
    const isRecovery = attempts > 0;
    const policy = recoveryPolicy();
    const agentTimeoutMs = isRecovery
      ? nextRecoveryTimeoutMs(current, policy)
      : options.agentTimeoutMs;
    const ticketText = current
      ? `---\n${JSON.stringify(current.data, null, 2)}\n---\n\n${current.body}`
      : "Ticket file unavailable.";
    const briefPath = path.join(logDirectory, "brief.md");
    await writeFile(briefPath, ticketText, "utf8");

    const recoveryNote = isRecovery
      ? `\n\nThis is recovery attempt ${attempts}/${options.maxRecoveryAttempts}. The worktree is preserved from a previous attempt that blocked at stage "${current?.data["blocked-stage"] ?? "unknown"}" with reason: ${current?.data["blocked-reason"] ?? "unknown"}. Continue from the existing worktree. Do not restart the TDD cycle from scratch and do not rewrite tests merely to force red. Inspect the existing diff, tests, and logs; fix only what is failing; keep the code-reviewer and all required checks. If the remaining work needs a contract, scope, or ambiguity decision, report BLOCKED with a specific reason.`
      : "";
    const prompt = `You are the Moonlander ticket runner for ${ticketId}. Work only inside this worktree.

Read the attached confirmed ticket brief. Follow AGENTS.md and the brief. Use strict TDD: have test-engineer write failing tests first and prove red, then have the responsible implementation engineer make them green. Spawn game-architect and code-reviewer as required by AGENTS.md. Run the narrow tests, typecheck, local e2e, and build. Do not edit tests to obtain green. Do not run git commit, git push, or modify .git; the runner owns integration and delivery. Do not edit other tickets.${recoveryNote}

At the end, print a TICKET REPORT section. Include exactly one of:
REVIEW: PASS
BLOCKED: <reason>
Only print REVIEW: PASS after the code-reviewer accepts the change and all required checks pass.`;

    let recoveredDelivery = false;
    if (isRecovery && current?.data["blocked-stage"] === "delivery") {
      const merged = await run(
        "git",
        ["merge-base", "--is-ancestor", branch, "main"],
        { cwd: worktree, capture: true, check: false },
      );
      const clean = await run("git", ["status", "--porcelain"], {
        cwd: worktree,
        capture: true,
        check: false,
      });
      if (merged.code === 0 && !clean.stdout.trim()) {
        recoveredDelivery = true;
        log(
          "delivery-only recovery: branch is merged and worktree is clean; skipping agent",
          ticketId,
        );
      }
    }

    if (!recoveredDelivery) {
      stage = "agent";
      log(
        `starting ticket agent${
          isRecovery ? ` (recovery ${attempts}/${options.maxRecoveryAttempts})` : ""
        }`,
        ticketId,
      );
      let agentRun;
      try {
        agentRun = await run(
          opencodeCommand,
          [
            "run",
            "--agent",
            "ticket-runner",
            "--auto",
            "--dir",
            worktree,
            "--file",
            briefPath,
            "--title",
            `${ticketId}: ${current?.data.title ?? "ticket"}${
              isRecovery ? ` (recovery ${attempts}/${options.maxRecoveryAttempts})` : ""
            }`,
            prompt,
          ],
          {
            cwd: worktree,
            env: { TICKET_ID: ticketId, TICKET_PORT: String(port) },
            logPath: agentLog,
            label: "ticket agent",
            ticketId,
            timeoutMs: agentTimeoutMs,
          },
        );
      } catch (error) {
        const agentOutput = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
        if (error?.timedOut) {
          throw new TicketBlockedError(error.message, {
            stage: "agent",
            category: "agent-timeout",
            agentOutput,
          });
        }
        const report = parseAgentReport(agentOutput);
        if (report.status === "blocked") {
          const classification = classifyBlock({
            stage: "agent",
            message: report.reason,
            agentOutput,
          });
          throw new TicketBlockedError(
            `ticket agent reported BLOCKED: ${report.reason || "(no reason)"}`,
            {
              stage: "agent",
              category: classification.category,
              agentOutput,
            },
          );
        }
        error.agentOutput = agentOutput;
        throw error;
      }
      await heartbeat(lockPath);

      const agentOutput = `${agentRun.stdout}\n${agentRun.stderr}`;
      const report = parseAgentReport(agentOutput);
      if (report.status === "blocked") {
        const classification = classifyBlock({
          stage: "agent",
          message: report.reason,
          agentOutput,
        });
        throw new TicketBlockedError(
          `ticket agent reported BLOCKED: ${report.reason || "(no reason)"}`,
          {
            stage: "agent",
            category: classification.category,
            agentOutput,
          },
        );
      }
      if (report.status !== "pass") {
        const error = new Error("ticket agent did not report REVIEW: PASS");
        error.agentOutput = agentOutput;
        throw error;
      }
    }

    stage = "verify";
    log("running worktree verification", ticketId);
    await run(npmCommand, ["run", "verify"], {
      cwd: worktree,
      env: { TICKET_PORT: String(port) },
      logPath: verifyLog,
      label: "npm run verify",
      ticketId,
      timeoutMs: 15 * 60 * 1000,
    });

    stage = "commit";
    await run("git", ["add", "-A"], { cwd: worktree, ticketId });
    const worktreeStatus = await run("git", ["status", "--porcelain"], {
      cwd: worktree,
      capture: true,
      check: false,
    });
    const ahead = await run("git", ["rev-list", "--count", "main..HEAD"], {
      cwd: worktree,
      capture: true,
      check: false,
    });
    const commitCount = Number(ahead.stdout.trim() || 0);
    if (worktreeStatus.stdout.trim()) {
      await run(
        "git",
        ["commit", "-m", `feat(${ticketId}): ${current?.data.title ?? "ticket"}`],
        { cwd: worktree, ticketId },
      );
    } else if (!recoveredDelivery && commitCount === 0) {
      throw new Error("ticket agent produced no changes");
    }

    const deliveryLock = await acquireDeliveryLock({ ticketId });
    try {
      stage = "queue";
      await addQueueCommit(`chore(tickets): start ${ticketId}`);
      stage = "rebase";
      log("rebase onto main", ticketId);
      await run("git", ["rebase", "main"], { cwd: worktree, ticketId });
      stage = "verify";
      await run(npmCommand, ["run", "verify"], {
        cwd: worktree,
        env: { TICKET_PORT: String(port) },
        logPath: verifyLog,
        label: "post-rebase verify",
        ticketId,
        timeoutMs: 15 * 60 * 1000,
      });
      stage = "merge";
      await run("git", ["merge", "--ff-only", branch], { cwd: repoRoot, ticketId });
      const merged = await findTicket(root, ticketId);
      if (merged) {
        await moveTicket(root, merged, "review");
        await addQueueCommit(`chore(tickets): review ${ticketId}`);
      }

      stage = "delivery";
      log("delivering merged ticket", ticketId);
      await run(
        npmCommand,
        [
          "run",
          "deliver",
          "--",
          "--push-current",
          "--message",
          `feat(${ticketId}): ${current?.data.title ?? "ticket"}`,
        ],
        {
          cwd: repoRoot,
          logPath: deliveryLog,
          label: "ticket delivery",
          ticketId,
          timeoutMs: 45 * 60 * 1000,
        },
      );

      const reviewed = await findTicket(root, ticketId);
      if (reviewed) {
        await moveTicket(root, reviewed, "done");
        await addQueueCommit(`chore(tickets): complete ${ticketId}`);
        await run("git", ["push", "origin", "main"], { cwd: repoRoot, ticketId });
      }
      log(`DONE ${ticketId}`, ticketId);
      await removeLock(ticketId);
      await rm(worktree, { recursive: true, force: true }).catch(() => {});
      await run("git", ["worktree", "prune"], { cwd: repoRoot, check: false, ticketId });
    } finally {
      await rm(deliveryLock, { force: true });
    }
  } catch (error) {
    const category =
      error?.category ??
      classifyBlock({
        stage,
        message: error?.message ?? String(error),
        agentOutput: error?.agentOutput ?? "",
      }).category;
    await blockTicket(ticket, error, worktree, runnerLog, {
      stage: error?.stage ?? stage,
      category,
    });
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }
}

async function main() {
  if (options.help) {
    console.log(usage());
    return;
  }
  await ensureQueue(root);
  if (options.maxParallel < 1) throw new Error("--max-parallel must be at least 1");
  if (
    !Number.isFinite(options.maxRecoveryAttempts) ||
    options.maxRecoveryAttempts < 0
  ) {
    throw new Error("--max-recovery-attempts must be zero or greater");
  }
  if (
    !Number.isFinite(options.runnerHeartbeatMs) ||
    options.runnerHeartbeatMs < 1000
  ) {
    throw new Error("TICKET_RUNNER_HEARTBEAT_MS must be at least 1000");
  }

  const runnerLockPath = options.dryRun ? null : await acquireRunnerLock();
  const runnerHeartbeat = runnerLockPath
    ? setInterval(() => {
        heartbeatRunnerLock(runnerLockPath).catch(() => {});
      }, options.runnerHeartbeatMs)
    : null;
  const cleanup = () => {
    if (runnerHeartbeat) clearInterval(runnerHeartbeat);
    releaseRunnerLock(runnerLockPath);
  };
  process.once("exit", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    while (true) {
      if (existsSync(path.join(root, "PAUSE"))) {
        log("paused by docs/tickets/PAUSE");
        if (options.once) return;
        await new Promise((resolve) => setTimeout(resolve, options.pollMs));
        continue;
      }

      let tickets = await listTickets(root);
      let active = tickets.filter((ticket) =>
        ACTIVE_STATUSES.includes(ticket.status),
      );
      let slots = Math.max(0, options.maxParallel - active.length);

      if (options.dryRun) {
        const recoverable = options.recover
          ? selectRecoverable(
              tickets,
              active,
              Date.now(),
              recoveryPolicy(),
              slots,
            )
          : [];
        const claimable =
          slots > 0 ? selectClaimable(tickets, slots, active) : [];
        console.log(
          `recoverable: ${recoverable.map((ticket) => ticket.id).join(", ") || "(none)"}`,
        );
        console.log(
          `claimable: ${claimable.map((ticket) => ticket.id).join(", ") || "(none)"}`,
        );
        return;
      }

      try {
        await recoverOrphans();
      } catch (error) {
        log(`orphan recovery failed: ${error.message}`);
      }

      tickets = await listTickets(root);
      active = tickets.filter((ticket) =>
        ACTIVE_STATUSES.includes(ticket.status),
      );
      slots = Math.max(0, options.maxParallel - active.length);

      if (options.recover && slots > 0) {
        try {
          const recovered = await requeueRecoverable(tickets, active, slots);
          if (recovered.length > 0) {
            tickets = await listTickets(root);
            active = tickets.filter((ticket) =>
              ACTIVE_STATUSES.includes(ticket.status),
            );
            slots = Math.max(0, options.maxParallel - active.length);
          }
        } catch (error) {
          log(`automatic recovery failed: ${error.message}`);
        }
      }

      const selected =
        slots > 0 ? selectClaimable(tickets, slots, active) : [];

      if (selected.length > 0) {
        log(`claiming ${selected.map((ticket) => ticket.id).join(", ")}`);
        await Promise.all(selected.map((ticket) => runTicket(ticket)));
      } else if (active.length === 0) {
        log("no claimable tickets");
      }

      if (options.once) {
        const remaining = await listTickets(root);
        if (remaining.some((ticket) => ACTIVE_STATUSES.includes(ticket.status))) {
          await new Promise((resolve) => setTimeout(resolve, options.pollMs));
          continue;
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, options.pollMs));
    }
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(`ticket-runner: ${error.message}`);
  process.exitCode = 1;
});
