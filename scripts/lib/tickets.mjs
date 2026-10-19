import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const STATUSES = [
  "inbox",
  "needs-info",
  "ready",
  "in-progress",
  "review",
  "done",
  "blocked",
];
export const ACTIVE_STATUSES = ["in-progress", "review"];
export const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const KEY_ORDER = [
  "id",
  "title",
  "status",
  "priority",
  "parent",
  "depends-on",
  "scopes",
  "contract",
  "confirmed",
  "confirmed-at",
  "open-questions",
];

export function ticketsRoot(repoRoot) {
  return path.join(repoRoot, "docs", "tickets");
}

export function statusDir(root, status) {
  return path.join(root, status);
}

export async function ensureQueue(root) {
  for (const status of STATUSES) {
    await mkdir(statusDir(root, status), { recursive: true });
  }
  await mkdir(path.join(root, "logs"), { recursive: true });
  await mkdir(path.join(root, ".locks"), { recursive: true });
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "" || value === "null" || value === "~") {
    return null;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((item) => parseScalar(item));
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: text };
  }

  const data = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (raw === "") {
      const items = [];
      while (
        index + 1 < lines.length &&
        /^\s+-\s+/.test(lines[index + 1])
      ) {
        index += 1;
        items.push(parseScalar(lines[index].replace(/^\s+-\s+/, "")));
      }
      data[key] = items;
    } else {
      data[key] = parseScalar(raw);
    }
  }

  return { data, body: match[2] ?? "" };
}

function serializeValue(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeValue(item)).join(", ")}]`;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(String(value));
}

export function serializeTicket(ticket) {
  const data = ticket.data ?? {};
  const keys = [
    ...KEY_ORDER.filter((key) => key in data),
    ...Object.keys(data).filter((key) => !KEY_ORDER.includes(key)),
  ];
  const frontmatter = keys
    .map((key) => `${key}: ${serializeValue(data[key])}`)
    .join("\n");
  const body = ticket.body ?? "";
  return `---\n${frontmatter}\n---\n\n${body.replace(/^\n+/, "")}`;
}

export async function readTicket(filePath, root = path.dirname(path.dirname(filePath))) {
  const text = await readFile(filePath, "utf8");
  const { data, body } = parseFrontmatter(text);
  return {
    id: data.id,
    status: path.basename(path.dirname(filePath)),
    filePath,
    root,
    data,
    body,
  };
}

export async function listTickets(root) {
  await ensureQueue(root);
  const tickets = [];
  for (const status of STATUSES) {
    const directory = statusDir(root, status);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (entry.name === "TEMPLATE.md" || entry.name === "README.md") continue;
      const ticket = await readTicket(path.join(directory, entry.name), root);
      ticket.status = status;
      ticket.data.status = status;
      tickets.push(ticket);
    }
  }
  return tickets.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function nextTicketIdFrom(tickets) {
  let maximum = 0;
  for (const ticket of tickets) {
    const match = /^T-(\d+)$/.exec(String(ticket.id ?? ""));
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return `T-${String(maximum + 1).padStart(4, "0")}`;
}

export async function nextTicketId(root) {
  return nextTicketIdFrom(await listTickets(root));
}

export async function findTicket(root, id) {
  return (await listTickets(root)).find((ticket) => ticket.id === id) ?? null;
}

export function normalizeScope(scope) {
  const normalized = String(scope)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return normalized;
}

export function scopesOverlap(first, second) {
  const a = normalizeScope(first);
  const b = normalizeScope(second);
  if (!a || !b || a === "*" || b === "*") return true;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function dependenciesDone(ticket, tickets) {
  const dependencies = Array.isArray(ticket.data["depends-on"])
    ? ticket.data["depends-on"]
    : [];
  return dependencies.every((id) =>
    tickets.some((candidate) => candidate.id === id && candidate.status === "done"),
  );
}

export function isClaimable(ticket, tickets, activeTickets) {
  if (ticket.status !== "ready") return false;
  if (ticket.data.confirmed !== true) return false;
  const questions = ticket.data["open-questions"];
  if (Array.isArray(questions) && questions.length > 0) return false;
  if (typeof questions === "string" && questions.trim().toLowerCase() !== "none") {
    return false;
  }
  const scopes = Array.isArray(ticket.data.scopes) ? ticket.data.scopes : [];
  if (scopes.length === 0) return false;
  if (!dependenciesDone(ticket, tickets)) return false;
  return activeTickets.every((active) => {
    const activeScopes = Array.isArray(active.data.scopes)
      ? active.data.scopes
      : [];
    return scopes.every((scope) =>
      activeScopes.every((activeScope) => !scopesOverlap(scope, activeScope)),
    );
  });
}

export function selectClaimable(tickets, maximum, activeTickets = []) {
  const active = [...activeTickets];
  const selected = [];
  const ready = tickets
    .filter((ticket) => ticket.status === "ready")
    .sort((a, b) => {
      const priorityA = PRIORITY_ORDER[a.data.priority] ?? PRIORITY_ORDER.normal;
      const priorityB = PRIORITY_ORDER[b.data.priority] ?? PRIORITY_ORDER.normal;
      return priorityA - priorityB || String(a.id).localeCompare(String(b.id));
    });

  for (const ticket of ready) {
    if (selected.length >= maximum) break;
    if (!isClaimable(ticket, tickets, active)) continue;
    selected.push(ticket);
    active.push(ticket);
  }
  return selected;
}

export async function updateTicket(ticket, patch, body = ticket.body) {
  ticket.data = { ...ticket.data, ...patch };
  await writeFile(ticket.filePath, serializeTicket({ data: ticket.data, body }), "utf8");
  return ticket;
}

export async function moveTicket(root, ticket, toStatus) {
  const targetDirectory = statusDir(root, toStatus);
  const targetPath = path.join(targetDirectory, path.basename(ticket.filePath));
  if (existsSync(targetPath) && targetPath !== ticket.filePath) {
    throw new Error(`Target ticket already exists: ${targetPath}`);
  }
  ticket.data.status = toStatus;
  await writeFile(ticket.filePath, serializeTicket(ticket), "utf8");
  await rename(ticket.filePath, targetPath);
  ticket.filePath = targetPath;
  ticket.status = toStatus;
  return ticket;
}

export function formatTable(tickets) {
  const rows = [
    ["ID", "STATUS", "PRI", "CONF", "DEPENDS", "SCOPES", "TITLE"],
    ...tickets.map((ticket) => [
      String(ticket.id ?? ""),
      ticket.status ?? "",
      String(ticket.data.priority ?? "normal"),
      ticket.data.confirmed === true ? "yes" : "no",
      Array.isArray(ticket.data["depends-on"])
        ? ticket.data["depends-on"].join(",")
        : "",
      Array.isArray(ticket.data.scopes) ? ticket.data.scopes.join(",") : "",
      String(ticket.data.title ?? ""),
    ]),
  ];
  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => String(row[index]).length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, index) => String(cell).padEnd(widths[index]))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}
