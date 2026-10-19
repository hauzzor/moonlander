#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
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
const options = {
  once: argv.includes("--once"),
  dryRun: argv.includes("--dry-run"),
  help: argv.includes("--help") || argv.includes("-h"),
  maxParallel: Number(
    (() => {
      const index = argv.indexOf("--max-parallel");
      return index >= 0 ? argv[index + 1] : process.env.TICKET_MAX_PARALLEL ?? 3;
    })(),
  ),
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

function usage() {
  return `Moonlander ticket runner

Usage:
  npm.cmd run tickets:run
  npm.cmd run tickets:run -- --once
  npm.cmd run tickets:run -- --dry-run
  npm.cmd run tickets:run -- --max-parallel 2

Environment:
  TICKET_MAX_PARALLEL       default 3
  TICKET_POLL_MS            default 5000
  TICKET_AGENT_TIMEOUT_MS   default 2700000
  TICKET_PORT_BASE          default 4300

Only confirmed ready tickets are claimed. See docs/tickets/README.md.`;
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
        ? setTimeout(() => {
            if (!settled) {
              settled = true;
              child.kill();
              reject(new Error(`${label} timed out after ${timeoutMs}ms`));
            }
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
      reject(error);
    });
    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const result = { code: code ?? 1, stdout, stderr };
      if (check && result.code !== 0) {
        const detail = (stderr.trim() || stdout.trim()).slice(-4000);
        reject(new Error(`${label} failed with exit code ${result.code}${detail ? `\n${detail}` : ""}`));
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

async function blockTicket(ticket, error, worktree, logPath) {
  const message = error?.message ?? String(error);
  log(`BLOCKED: ${message}`, ticket.id);
  if (logPath) {
    await appendFile(logPath, `\nBLOCKED: ${message}\n`).catch(() => {});
  }
  const current = await findTicket(root, ticket.id);
  if (current && current.status !== "done") {
    await updateTicket(current, {
      "blocked-reason": message,
      "blocked-at": new Date().toISOString(),
    });
    await moveTicket(root, current, "blocked");
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

  try {
    await moveTicket(root, ticket, "in-progress");
    log(`worktree=${worktree} branch=${branch} port=${port}`, ticketId);
    await appendFile(runnerLog, `claimed ${ticketId} worktree=${worktree}\n`);
    await createWorktree(ticket, worktree, branch);
    await heartbeat(lockPath);

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
    const ticketText = current
      ? `---\n${JSON.stringify(current.data, null, 2)}\n---\n\n${current.body}`
      : "Ticket file unavailable.";
    const briefPath = path.join(logDirectory, "brief.md");
    await writeFile(briefPath, ticketText, "utf8");
    const prompt = `You are the Moonlander ticket runner for ${ticketId}. Work only inside this worktree.

Read the attached confirmed ticket brief. Follow AGENTS.md and the brief. Use strict TDD: have test-engineer write failing tests first and prove red, then have the responsible implementation engineer make them green. Spawn game-architect and code-reviewer as required by AGENTS.md. Run the narrow tests, typecheck, local e2e, and build. Do not edit tests to obtain green. Do not run git commit, git push, or modify .git; the runner owns integration and delivery. Do not edit other tickets.

At the end, print a TICKET REPORT section. Include exactly one of:
REVIEW: PASS
BLOCKED: <reason>
Only print REVIEW: PASS after the code-reviewer accepts the change and all required checks pass.`;

    log("starting ticket agent", ticketId);
    await run(
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
        `${ticketId}: ${current?.data.title ?? "ticket"}`,
        prompt,
      ],
      {
        cwd: worktree,
        env: { TICKET_ID: ticketId, TICKET_PORT: String(port) },
        logPath: agentLog,
        label: "ticket agent",
        ticketId,
        timeoutMs: options.agentTimeoutMs,
      },
    );
    await heartbeat(lockPath);

    const agentOutput = await readFile(agentLog, "utf8").catch(() => "");
    if (!/REVIEW:\s*PASS/i.test(agentOutput)) {
      throw new Error("ticket agent did not report REVIEW: PASS");
    }

    log("running worktree verification", ticketId);
    await run(npmCommand, ["run", "verify"], {
      cwd: worktree,
      env: { TICKET_PORT: String(port) },
      logPath: verifyLog,
      label: "npm run verify",
      ticketId,
      timeoutMs: 15 * 60 * 1000,
    });

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
    if (worktreeStatus.stdout.trim() && !worktreeStatus.stdout.includes("docs/tickets/")) {
      await run("git", ["commit", "-m", `feat(${ticketId}): ${current?.data.title ?? "ticket"}`], {
        cwd: worktree,
        ticketId,
      });
    } else if (worktreeStatus.stdout.trim()) {
      await run("git", ["commit", "-m", `feat(${ticketId}): ${current?.data.title ?? "ticket"}`], {
        cwd: worktree,
        ticketId,
      });
    } else if (commitCount === 0) {
      throw new Error("ticket agent produced no changes");
    }

    const deliveryLock = await acquireDeliveryLock({ ticketId });
    try {
      await addQueueCommit(`chore(tickets): start ${ticketId}`);
      log("rebase onto main", ticketId);
      await run("git", ["rebase", "main"], { cwd: worktree, ticketId });
      await run(npmCommand, ["run", "verify"], {
        cwd: worktree,
        env: { TICKET_PORT: String(port) },
        logPath: verifyLog,
        label: "post-rebase verify",
        ticketId,
        timeoutMs: 15 * 60 * 1000,
      });
      await run("git", ["merge", "--ff-only", branch], { cwd: repoRoot, ticketId });
      const merged = await findTicket(root, ticketId);
      if (merged) {
        await moveTicket(root, merged, "review");
        await addQueueCommit(`chore(tickets): review ${ticketId}`);
      }

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
    await blockTicket(ticket, error, worktree, runnerLog);
  }
}

async function main() {
  if (options.help) {
    console.log(usage());
    return;
  }
  await ensureQueue(root);
  if (options.maxParallel < 1) throw new Error("--max-parallel must be at least 1");

  while (true) {
    if (existsSync(path.join(root, "PAUSE"))) {
      log("paused by docs/tickets/PAUSE");
      if (options.once) return;
      await new Promise((resolve) => setTimeout(resolve, options.pollMs));
      continue;
    }

    const tickets = await listTickets(root);
    const active = tickets.filter((ticket) =>
      ACTIVE_STATUSES.includes(ticket.status),
    );
    const slots = Math.max(0, options.maxParallel - active.length);
    const selected =
      slots > 0 ? selectClaimable(tickets, slots, active) : [];

    if (options.dryRun) {
      console.log(selected.map((ticket) => ticket.id).join("\n") || "(no claimable tickets)");
      return;
    }

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
}

main().catch((error) => {
  console.error(`ticket-runner: ${error.message}`);
  process.exitCode = 1;
});
