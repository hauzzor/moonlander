import { PRIORITY_ORDER, dependenciesDone, scopesOverlap } from "./tickets.mjs";

const MINUTE_MS = 60_000;

export const DEFAULT_RECOVERY_POLICY = Object.freeze({
  maxAttempts: 1,
  cooldownMs: 5 * MINUTE_MS,
  recoveryTimeoutMs: 90 * MINUTE_MS,
  staleLockMs: 5 * MINUTE_MS,
});

export const RETRYABLE_CATEGORIES = new Set([
  "agent-timeout",
  "agent-incomplete",
  "transient",
  "verification",
  "delivery",
  "infra",
  "orphaned",
]);

export const NEEDS_INFO_CATEGORIES = new Set([
  "needs-info",
  "merge-conflict",
  "main-dirty",
]);

const AMBIGUITY_PATTERN =
  /ambigu|needs[- ]info|contract|scope|missing|open question|confirm|specification|spec\b/i;

function stripAnsi(value) {
  return String(value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRecoveryPolicy(env = process.env) {
  const rawAttempts = env.TICKET_MAX_RECOVERY_ATTEMPTS;
  const parsedAttempts = Number(rawAttempts);
  const maxAttempts =
    rawAttempts === undefined || rawAttempts === ""
      ? DEFAULT_RECOVERY_POLICY.maxAttempts
      : Number.isFinite(parsedAttempts) && parsedAttempts >= 0
        ? Math.floor(parsedAttempts)
        : DEFAULT_RECOVERY_POLICY.maxAttempts;

  return {
    maxAttempts,
    cooldownMs: positiveNumber(
      env.TICKET_RECOVERY_DELAY_MS,
      DEFAULT_RECOVERY_POLICY.cooldownMs,
    ),
    recoveryTimeoutMs: positiveNumber(
      env.TICKET_RECOVERY_TIMEOUT_MS,
      DEFAULT_RECOVERY_POLICY.recoveryTimeoutMs,
    ),
    staleLockMs: positiveNumber(
      env.TICKET_STALE_LOCK_MS,
      DEFAULT_RECOVERY_POLICY.staleLockMs,
    ),
  };
}

export function parseAgentReport(output) {
  const clean = stripAnsi(output);
  const matches = [
    ...clean.matchAll(
      /(?:^|\n)\s*(?:[-*]\s*)?(REVIEW:\s*PASS|BLOCKED:\s*([^\n]*))/gi,
    ),
  ];
  if (matches.length === 0) {
    return { status: "unknown", reason: "" };
  }
  const last = matches[matches.length - 1];
  if (/^REVIEW:/i.test(last[1])) {
    return { status: "pass", reason: "" };
  }
  return { status: "blocked", reason: (last[2] ?? "").trim() };
}

export function classifyBlock({ stage, message = "", agentOutput = "" }) {
  const normalizedStage = String(stage ?? "unknown");
  const text = `${message}\n${agentOutput}`;

  if (/ticket agent timed out|agent timed out/i.test(text)) {
    return { category: "agent-timeout", retryable: true };
  }

  if (normalizedStage === "agent") {
    const report = parseAgentReport(agentOutput);
    if (report.status === "blocked") {
      if (AMBIGUITY_PATTERN.test(report.reason)) {
        return { category: "needs-info", retryable: false };
      }
      if (/timed out|timeout|network|temporar|flak|retry/i.test(report.reason)) {
        return { category: "agent-timeout", retryable: true };
      }
      return { category: "transient", retryable: true };
    }
    return { category: "agent-incomplete", retryable: true };
  }

  if (normalizedStage === "verify") {
    return { category: "verification", retryable: true };
  }
  if (normalizedStage === "delivery") {
    return { category: "delivery", retryable: true };
  }
  if (normalizedStage === "rebase" || normalizedStage === "merge") {
    return { category: "merge-conflict", retryable: false };
  }
  if (
    normalizedStage === "queue" ||
    /main worktree has changes/i.test(text)
  ) {
    return { category: "main-dirty", retryable: false };
  }
  if (
    normalizedStage === "setup" ||
    normalizedStage === "commit" ||
    normalizedStage === "orphaned"
  ) {
    return { category: "infra", retryable: true };
  }
  if (/timed out|timeout/i.test(text)) {
    return { category: "infra", retryable: true };
  }
  return { category: "unknown", retryable: false };
}

export function ticketRecoveryCategory(ticket) {
  const explicit = ticket?.data?.["blocked-category"];
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit.trim();
  }
  return classifyBlock({
    stage: ticket?.data?.["blocked-stage"] ?? "unknown",
    message: ticket?.data?.["blocked-reason"] ?? "",
  }).category;
}

export function isRecoveryEligible(
  ticket,
  tickets,
  activeTickets = [],
  now = Date.now(),
  policy = DEFAULT_RECOVERY_POLICY,
) {
  if (!ticket || ticket.status !== "blocked") return false;
  const data = ticket.data ?? {};
  if (data.confirmed !== true) return false;

  const questions = data["open-questions"];
  if (Array.isArray(questions)) {
    if (questions.length > 0) return false;
  } else if (typeof questions === "string") {
    const trimmed = questions.trim().toLowerCase();
    if (trimmed && trimmed !== "none" && trimmed !== "[]") return false;
  }

  const scopes = Array.isArray(data.scopes) ? data.scopes : [];
  if (scopes.length === 0) return false;
  if (!dependenciesDone(ticket, tickets)) return false;

  const attempts = Number(data["recovery-attempts"] ?? 0);
  if (!Number.isFinite(attempts) || attempts >= policy.maxAttempts) return false;
  if (data["recovery-exhausted"] === true) return false;
  if (!RETRYABLE_CATEGORIES.has(ticketRecoveryCategory(ticket))) return false;

  const blockedAt = Date.parse(String(data["blocked-at"] ?? ""));
  if (Number.isFinite(blockedAt) && now - blockedAt < policy.cooldownMs) {
    return false;
  }

  return activeTickets.every((active) => {
    const activeScopes = Array.isArray(active?.data?.scopes)
      ? active.data.scopes
      : [];
    return scopes.every((scope) =>
      activeScopes.every((activeScope) => !scopesOverlap(scope, activeScope)),
    );
  });
}

export function selectRecoverable(
  tickets,
  activeTickets = [],
  now = Date.now(),
  policy = DEFAULT_RECOVERY_POLICY,
  maximum = 1,
) {
  const active = [...activeTickets];
  const selected = [];
  const blocked = tickets
    .filter((ticket) => ticket.status === "blocked")
    .sort((a, b) => {
      const priorityA =
        PRIORITY_ORDER[a.data.priority] ?? PRIORITY_ORDER.normal;
      const priorityB =
        PRIORITY_ORDER[b.data.priority] ?? PRIORITY_ORDER.normal;
      return (
        priorityA - priorityB ||
        String(a.id).localeCompare(String(b.id))
      );
    });

  for (const ticket of blocked) {
    if (selected.length >= maximum) break;
    if (!isRecoveryEligible(ticket, tickets, active, now, policy)) continue;
    selected.push(ticket);
    active.push(ticket);
  }
  return selected;
}

export function nextRecoveryTimeoutMs(_ticket, policy = DEFAULT_RECOVERY_POLICY) {
  return policy.recoveryTimeoutMs;
}

export function isLockStale(
  lock,
  now = Date.now(),
  staleMs = DEFAULT_RECOVERY_POLICY.staleLockMs,
) {
  if (!lock || typeof lock !== "object") return true;
  const raw = lock.heartbeat ?? lock.updatedAt;
  if (!raw) return true;
  const timestamp = Date.parse(String(raw));
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp > staleMs;
}

export function recoverySummary(
  ticket,
  now = Date.now(),
  policy = DEFAULT_RECOVERY_POLICY,
) {
  if (!ticket || ticket.status !== "blocked") return "";
  const category = ticketRecoveryCategory(ticket);
  const attempts = Number(ticket.data["recovery-attempts"] ?? 0) || 0;

  if (ticket.data["recovery-exhausted"] === true || attempts >= policy.maxAttempts) {
    return `exhausted (${category}, attempts ${attempts}/${policy.maxAttempts})`;
  }
  if (!RETRYABLE_CATEGORIES.has(category)) {
    return `not retryable (${category})`;
  }

  const blockedAt = Date.parse(String(ticket.data["blocked-at"] ?? ""));
  const remaining = Number.isFinite(blockedAt)
    ? policy.cooldownMs - (now - blockedAt)
    : 0;
  if (remaining > 0) {
    return `waiting ${Math.ceil(remaining / MINUTE_MS)}m (${category}, attempt ${
      attempts + 1
    }/${policy.maxAttempts})`;
  }
  return `eligible (${category}, attempt ${attempts + 1}/${policy.maxAttempts})`;
}
