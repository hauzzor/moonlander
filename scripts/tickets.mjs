#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isLockStale,
  recoverySummary,
  resolveRecoveryPolicy,
  selectRecoverable,
} from "./lib/recovery.mjs";
import {
  ACTIVE_STATUSES,
  STATUSES,
  ensureQueue,
  findTicket,
  formatTable,
  listTickets,
  moveTicket,
  nextTicketId,
  parseFrontmatter,
  selectClaimable,
  serializeTicket,
  statusDir,
  ticketsRoot,
  updateTicket,
} from "./lib/tickets.mjs";

const repoRoot = process.cwd();
const root = ticketsRoot(repoRoot);

function usage() {
  return `Moonlander ticket queue

Usage:
  npm.cmd run tickets:new -- "Title"
  npm.cmd run tickets:list [--status ready]
  npm.cmd run tickets:status [--watch]
  npm.cmd run tickets:show -- T-0001
  npm.cmd run tickets:confirm -- T-0001
  npm.cmd run tickets:move -- T-0001 ready
  npm.cmd run tickets:recover -- T-0001 [--force]
  npm.cmd run tickets:logs -- T-0001 [--follow]
  npm.cmd run tickets:pause
  npm.cmd run tickets:resume

Lifecycle:
  inbox -> needs-info <-> ready -> in-progress -> review -> done
                                               \-> blocked -> ready (auto recovery)

Only confirmed ready tickets with satisfied dependencies and disjoint scopes
are claimable by the runner. Recoverable blocked tickets are automatically
requeued once by the runner. Ambiguous tickets move to needs-info. See
docs/tickets/README.md.`;
}

function valueAfter(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

async function commandNew(args) {
  const title = args.join(" ").trim();
  if (!title) throw new Error('Usage: npm.cmd run tickets:new -- "Title"');
  await ensureQueue(root);
  const template = await readFile(path.join(root, "TEMPLATE.md"), "utf8");
  const id = await nextTicketId(root);
  const parsed = parseFrontmatter(template);
  const data = {
    ...parsed.data,
    id,
    title,
    status: "inbox",
    priority: "normal",
    parent: null,
    "depends-on": [],
    scopes: [],
    contract: false,
    confirmed: false,
    "confirmed-at": null,
    "open-questions": [],
  };
  const filePath = path.join(statusDir(root, "inbox"), `${id}.md`);
  await writeFile(filePath, serializeTicket({ data, body: parsed.body }), "utf8");
  console.log(`created ${id}: ${filePath}`);
}

async function commandList(args) {
  const statusIndex = args.indexOf("--status");
  const filter = statusIndex >= 0 ? valueAfter(args, statusIndex + 1, "--status") : null;
  if (filter && !STATUSES.includes(filter)) {
    throw new Error(`Unknown status: ${filter}`);
  }
  const tickets = await listTickets(root);
  const filtered = filter ? tickets.filter((ticket) => ticket.status === filter) : tickets;
  console.log(formatTable(filtered));
  if (filtered.length === 0) console.log("(no tickets)");
}

async function readLocks() {
  const directory = path.join(root, ".locks");
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const locks = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await readFile(path.join(directory, entry.name), "utf8"));
      locks.push({ ...parsed, file: entry.name });
    } catch {
      locks.push({ file: entry.name, invalid: true });
    }
  }
  return locks;
}

async function commandStatus(args) {
  const watch = args.includes("--watch");
  const print = async () => {
    const tickets = await listTickets(root);
    const recoveryPolicy = resolveRecoveryPolicy(process.env);
    const counts = Object.fromEntries(
      STATUSES.map((status) => [
        status,
        tickets.filter((ticket) => ticket.status === status).length,
      ]),
    );
    const active = tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status));
    const claimable = selectClaimable(
      tickets,
      Number(process.env.TICKET_MAX_PARALLEL ?? 3),
      active,
    );
    const recoverable = selectRecoverable(
      tickets,
      active,
      Date.now(),
      recoveryPolicy,
      Number(process.env.TICKET_MAX_PARALLEL ?? 3),
    );
    const blocked = tickets.filter((ticket) => ticket.status === "blocked");
    const locks = await readLocks();
    const runnerLock = locks.find((lock) => lock.file === "runner.json");
    const worktrees = existsSync(path.join(repoRoot, ".worktrees"))
      ? (await readdir(path.join(repoRoot, ".worktrees"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
      : [];
    const paused = existsSync(path.join(root, "PAUSE"));

    console.clear();
    console.log(`Ticket queue: ${root}`);
    console.log(`Paused: ${paused ? "YES" : "no"}`);
    console.log(
      `Runner: ${
        runnerLock
          ? `pid=${runnerLock.pid ?? "?"} heartbeat=${runnerLock.heartbeat ?? "?"} ${
              isLockStale(runnerLock, Date.now(), recoveryPolicy.staleLockMs)
                ? "stale"
                : "active"
            }`
          : "(none)"
      }`,
    );
    console.log(
      `Statuses: ${STATUSES.map((status) => `${status}=${counts[status]}`).join("  ")}`,
    );
    console.log(`Active: ${active.map((ticket) => ticket.id).join(", ") || "(none)"}`);
    console.log(`Claimable now: ${claimable.map((ticket) => ticket.id).join(", ") || "(none)"}`);
    console.log(
      `Recoverable now: ${recoverable.map((ticket) => ticket.id).join(", ") || "(none)"}`,
    );
    console.log(
      `Blocked recovery: ${
        blocked.length > 0
          ? blocked
              .map(
                (ticket) =>
                  `${ticket.id} ${recoverySummary(ticket, Date.now(), recoveryPolicy)}`,
              )
              .join("; ")
          : "(none)"
      }`,
    );
    console.log(`Locks: ${locks.length}`);
    for (const lock of locks) {
      console.log(
        `  ${lock.id ?? lock.file} pid=${lock.pid ?? "?"} heartbeat=${lock.heartbeat ?? "?"} worktree=${lock.worktree ?? "?"}`,
      );
    }
    console.log(`Worktrees: ${worktrees.join(", ") || "(none)"}`);
    console.log("");
    console.log(formatTable(active.length > 0 ? active : tickets.slice(0, 20)));
    if (watch) {
      console.log("\nRefreshing every 2s. Ctrl+C to stop.");
    }
  };

  await print();
  if (!watch) return;
  await new Promise(() => {
    setInterval(() => {
      print().catch((error) => console.error(error.message));
    }, 2000);
  });
}

async function commandShow(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: npm.cmd run tickets:show -- T-0001");
  const ticket = await findTicket(root, id);
  if (!ticket) throw new Error(`Ticket not found: ${id}`);
  console.log(`File: ${ticket.filePath}`);
  console.log(`Status: ${ticket.status}`);
  console.log(JSON.stringify(ticket.data, null, 2));
  console.log("");
  console.log(ticket.body.trim());
}

async function commandConfirm(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: npm.cmd run tickets:confirm -- T-0001");
  const ticket = await findTicket(root, id);
  if (!ticket) throw new Error(`Ticket not found: ${id}`);
  const questions = ticket.data["open-questions"];
  if (
    (Array.isArray(questions) && questions.length > 0) ||
    (typeof questions === "string" && questions.trim().toLowerCase() !== "none")
  ) {
    throw new Error("Ticket still has open questions.");
  }
  if (!Array.isArray(ticket.data.scopes) || ticket.data.scopes.length === 0) {
    throw new Error("Ticket must declare at least one scope.");
  }
  await updateTicket(ticket, {
    confirmed: true,
    "confirmed-at": new Date().toISOString(),
  });
  if (ticket.status === "inbox" || ticket.status === "needs-info") {
    await moveTicket(root, ticket, "ready");
  }
  console.log(`confirmed ${id} (${ticket.status})`);
}

async function commandMove(args) {
  const [id, status] = args;
  if (!id || !status) throw new Error("Usage: npm.cmd run tickets:move -- T-0001 ready");
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  const ticket = await findTicket(root, id);
  if (!ticket) throw new Error(`Ticket not found: ${id}`);
  if (status === "ready" && ticket.data.confirmed !== true) {
    throw new Error("Cannot move an unconfirmed ticket to ready. Confirm it first.");
  }
  await moveTicket(root, ticket, status);
  console.log(`${id} -> ${status}`);
}

async function commandRecover(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: npm.cmd run tickets:recover -- T-0001 [--force]");
  const force = args.includes("--force");
  const ticket = await findTicket(root, id);
  if (!ticket) throw new Error(`Ticket not found: ${id}`);
  if (ticket.status !== "blocked") {
    throw new Error(`${id} is ${ticket.status}; only blocked tickets can be recovered.`);
  }
  if (ticket.data.confirmed !== true) {
    throw new Error(`${id} is not confirmed.`);
  }
  const questions = ticket.data["open-questions"];
  if (
    (Array.isArray(questions) && questions.length > 0) ||
    (typeof questions === "string" &&
      questions.trim() &&
      questions.trim().toLowerCase() !== "none")
  ) {
    throw new Error(`${id} still has open questions.`);
  }
  if (!Array.isArray(ticket.data.scopes) || ticket.data.scopes.length === 0) {
    throw new Error(`${id} has no scopes.`);
  }

  const recoveryPolicy = resolveRecoveryPolicy(process.env);
  const attempts = Number(ticket.data["recovery-attempts"] ?? 0) || 0;
  if (ticket.data["recovery-exhausted"] === true && !force) {
    throw new Error(
      `${id} is recovery-exhausted; inspect the logs, then use --force to grant one more recovery.`,
    );
  }
  if (attempts >= recoveryPolicy.maxAttempts && !force) {
    throw new Error(
      `${id} has used all ${recoveryPolicy.maxAttempts} recovery attempt(s); use --force to grant one more.`,
    );
  }

  const nextAttempts = force
    ? Math.max(1, recoveryPolicy.maxAttempts)
    : Math.max(1, attempts);
  await updateTicket(ticket, {
    "recovery-attempts": nextAttempts,
    "recovery-exhausted": false,
    "recovery-last-at": new Date().toISOString(),
  });
  await moveTicket(root, ticket, "ready");
  console.log(
    `requeued ${id}; the runner will use recovery mode with attempt ${nextAttempts}/${recoveryPolicy.maxAttempts}`,
  );
}

async function commandLogs(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: npm.cmd run tickets:logs -- T-0001 [--follow]");
  const directory = path.join(root, "logs", id);
  await mkdir(directory, { recursive: true });
  const readAll = async () => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      console.log(`\n== ${entry.name} ==`);
      process.stdout.write(await readFile(path.join(directory, entry.name), "utf8"));
    }
  };
  await readAll();
  if (!args.includes("--follow")) return;

  const sizes = new Map();
  const poll = async () => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(directory, entry.name);
      const content = await readFile(filePath, "utf8");
      const previous = sizes.get(filePath) ?? 0;
      if (content.length > previous) {
        process.stdout.write(content.slice(previous));
        sizes.set(filePath, content.length);
      } else if (!sizes.has(filePath)) {
        sizes.set(filePath, content.length);
      }
    }
  };
  await poll();
  await new Promise(() => {
    setInterval(() => {
      poll().catch((error) => console.error(error.message));
    }, 1000);
  });
}

async function commandPause(args) {
  if (args[0] === "resume") {
    await rm(path.join(root, "PAUSE"), { force: true });
    console.log("runner resumed");
    return;
  }
  await writeFile(path.join(root, "PAUSE"), new Date().toISOString(), "utf8");
  console.log("runner paused");
}

async function main() {
  const [command = "help", ...rawArgs] = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  await ensureQueue(root);
  switch (command) {
    case "new":
      await commandNew(args);
      break;
    case "list":
      await commandList(args);
      break;
    case "status":
      await commandStatus(args);
      break;
    case "show":
      await commandShow(args);
      break;
    case "confirm":
      await commandConfirm(args);
      break;
    case "move":
      await commandMove(args);
      break;
    case "recover":
      await commandRecover(args);
      break;
    case "logs":
      await commandLogs(args);
      break;
    case "pause":
      await commandPause(args);
      break;
    case "resume":
      await commandPause(["resume"]);
      break;
    case "next": {
      const tickets = await listTickets(root);
      const active = tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status));
      const claimable = selectClaimable(
        tickets,
        Number(process.env.TICKET_MAX_PARALLEL ?? 3),
        active,
      );
      console.log(claimable.map((ticket) => ticket.id).join("\n") || "(none)");
      break;
    }
    case "help":
    case "--help":
    case "-h":
      console.log(usage());
      break;
    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

main().catch((error) => {
  console.error(`tickets: ${error.message}`);
  process.exitCode = 1;
});
