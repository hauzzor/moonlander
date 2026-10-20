import {
  ACTIVE_STATUSES,
  PRIORITY_ORDER,
  normalizeScope,
  scopesOverlap,
} from "./tickets.mjs";

function toStringList(raw) {
  if (raw === null || raw === undefined) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  const result = [];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      result.push(...toStringList(value));
      continue;
    }
    for (const part of String(value).split(",")) {
      const trimmed = part.trim();
      if (trimmed) result.push(trimmed);
    }
  }
  return result;
}

export function ticketDependencyIds(ticket) {
  return toStringList(ticket?.data?.["depends-on"] ?? ticket?.["depends-on"]);
}

export function ticketScopes(ticket) {
  return toStringList(ticket?.data?.scopes ?? ticket?.scopes);
}

function hasOpenQuestions(raw) {
  if (raw === null || raw === undefined) return false;
  if (Array.isArray(raw)) {
    return raw.some((question) => String(question ?? "").trim() !== "");
  }
  const text = String(raw).trim().toLowerCase();
  return text !== "" && text !== "none" && text !== "[]";
}

export function isReadyTicket(ticket) {
  if (!ticket || ticket.status !== "ready") return false;
  if (ticket.data?.confirmed !== true) return false;
  if (hasOpenQuestions(ticket.data?.["open-questions"])) return false;
  return ticketScopes(ticket).length > 0;
}

export function hasParallelizationPlan(ticket) {
  const lines = String(ticket?.body ?? "").split(/\r?\n/);
  const heading = /^[ \t]*##[ \t]+parallelization[ \t]+plan\b/i;
  const sectionHeading = /^[ \t]*##[ \t]+\S/;
  const anyHeading = /^[ \t]*#{1,6}[ \t]+\S/;
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return false;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (sectionHeading.test(line)) break;
    if (anyHeading.test(line)) continue;

    const trimmed = line.trim();
    if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) continue;

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      const content = bullet[1].trim();
      if (!content) continue;
      const label = content.replace(/[*_`]/g, "").trim();
      if (label.endsWith(":")) continue;
    }

    return true;
  }

  return false;
}

function ticketPriority(ticket) {
  return PRIORITY_ORDER[ticket?.data?.priority] ?? PRIORITY_ORDER.normal;
}

function compareTickets(first, second) {
  return (
    ticketPriority(first) - ticketPriority(second) ||
    String(first.id).localeCompare(String(second.id))
  );
}

function scopesConflict(first, second) {
  const a = ticketScopes(first);
  const b = ticketScopes(second);
  return a.some((scopeA) => b.some((scopeB) => scopesOverlap(scopeA, scopeB)));
}

export function findScopeConflicts(tickets = []) {
  const ordered = [...tickets].sort((a, b) =>
    String(a.id).localeCompare(String(b.id)),
  );
  const conflicts = [];

  for (let first = 0; first < ordered.length; first += 1) {
    for (let second = first + 1; second < ordered.length; second += 1) {
      const a = ordered[first];
      const b = ordered[second];
      const pairs = [];
      const seen = new Set();
      for (const scopeA of ticketScopes(a)) {
        for (const scopeB of ticketScopes(b)) {
          if (!scopesOverlap(scopeA, scopeB)) continue;
          const normalizedA = normalizeScope(scopeA);
          const normalizedB = normalizeScope(scopeB);
          const key = `${normalizedA}\u0000${normalizedB}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push([normalizedA, normalizedB]);
        }
      }
      if (pairs.length > 0) {
        conflicts.push({ a, b, scopes: pairs });
      }
    }
  }

  return conflicts;
}

function readyCycleIds(readyTickets) {
  const byId = new Map(readyTickets.map((ticket) => [String(ticket.id), ticket]));
  const state = new Map();
  const stack = [];
  const cycles = new Set();

  const visit = (id) => {
    const current = state.get(id) ?? 0;
    if (current === 1) {
      const start = stack.indexOf(id);
      if (start >= 0) {
        for (let index = start; index < stack.length; index += 1) {
          cycles.add(stack[index]);
        }
      }
      return;
    }
    if (current === 2) return;

    state.set(id, 1);
    stack.push(id);
    for (const dependency of ticketDependencyIds(byId.get(id))) {
      if (byId.has(dependency)) visit(dependency);
    }
    stack.pop();
    state.set(id, 2);
  };

  for (const id of byId.keys()) visit(id);
  return cycles;
}

export function resolvePlanConcurrency(args = [], env = {}) {
  const flag = "--max-parallel";
  let raw = null;
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline !== undefined) {
    raw = inline.slice(flag.length + 1);
  } else {
    const index = args.indexOf(flag);
    if (index >= 0) {
      raw = args[index + 1];
      if (raw === undefined) throw new Error(`${flag} requires a value`);
    }
  }

  if (raw === null) {
    const fromEnv = env?.TICKET_PLAN_MAX_PARALLEL;
    raw =
      fromEnv === undefined || fromEnv === null || String(fromEnv).trim() === ""
        ? "2"
        : fromEnv;
  }

  const maxConcurrent = Number(raw);
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return maxConcurrent;
}

export function planWaves(tickets, { maxConcurrent = 2 } = {}) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error("maxConcurrent must be a positive integer");
  }

  const all = Array.isArray(tickets) ? tickets : [];
  const byId = new Map();
  for (const ticket of all) {
    if (ticket?.id === null || ticket?.id === undefined) continue;
    byId.set(String(ticket.id), ticket);
  }

  const ready = all.filter((ticket) => ticket?.status === "ready").sort(compareTickets);
  const activeTickets = all
    .filter((ticket) => ACTIVE_STATUSES.includes(ticket?.status))
    .sort((first, second) => String(first.id).localeCompare(String(second.id)));
  const cycles = readyCycleIds(ready);
  const reasons = new Map();

  for (const ticket of ready) {
    const id = String(ticket.id);
    if (ticket.data?.confirmed !== true) {
      reasons.set(id, "unconfirmed");
      continue;
    }
    if (hasOpenQuestions(ticket.data?.["open-questions"])) {
      reasons.set(id, "open questions");
      continue;
    }
    if (ticketScopes(ticket).length === 0) {
      reasons.set(id, "no scopes");
      continue;
    }

    const overlapping = activeTickets.find((active) =>
      ticketScopes(ticket).some((scope) =>
        ticketScopes(active).some((activeScope) =>
          scopesOverlap(scope, activeScope),
        ),
      ),
    );
    if (overlapping) {
      reasons.set(id, `overlaps active ${overlapping.id}`);
      continue;
    }

    if (!hasParallelizationPlan(ticket)) {
      reasons.set(id, "missing parallelization plan");
      continue;
    }

    if (cycles.has(id)) {
      reasons.set(
        id,
        `dependency cycle/unavailable (${[...cycles].sort().join(", ")})`,
      );
      continue;
    }

    const dependencies = ticketDependencyIds(ticket);
    const missing = dependencies.filter((dependency) => !byId.has(dependency));
    if (missing.length > 0) {
      reasons.set(id, `missing dependency ${missing.join(", ")}`);
      continue;
    }

    const waiting = dependencies.filter((dependency) => {
      const candidate = byId.get(dependency);
      return candidate && candidate.status !== "done" && candidate.status !== "ready";
    });
    if (waiting.length > 0) {
      const detail = waiting
        .map((dependency) => `${dependency} (${byId.get(dependency)?.status ?? "unknown"})`)
        .join(", ");
      reasons.set(id, `waiting on dependency ${detail}`);
    }
  }

  const schedulable = new Set(
    ready
      .map((ticket) => String(ticket.id))
      .filter((id) => !reasons.has(id)),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...schedulable]) {
      const ticket = byId.get(id);
      const unavailable = ticketDependencyIds(ticket).find((dependency) => {
        const candidate = byId.get(dependency);
        return candidate?.status === "ready" && !schedulable.has(dependency);
      });
      if (unavailable) {
        schedulable.delete(id);
        reasons.set(
          id,
          `dependency cycle/unavailable ${unavailable} (not schedulable)`,
        );
        changed = true;
      }
    }
  }

  const scheduled = new Set();
  const waves = [];
  const remaining = ready.filter((ticket) => schedulable.has(String(ticket.id)));

  while (remaining.length > 0) {
    const available = remaining.filter((ticket) =>
      ticketDependencyIds(ticket).every((dependency) => {
        const candidate = byId.get(dependency);
        return candidate?.status === "done" || scheduled.has(dependency);
      }),
    );

    if (available.length === 0) {
      for (const ticket of remaining) {
        reasons.set(String(ticket.id), "dependency cycle/unavailable");
      }
      break;
    }

    const contractTicket = available.find(
      (ticket) => ticket.data?.contract === true,
    );
    const waveTickets = [contractTicket ?? available[0]];
    if (!contractTicket) {
      for (const candidate of available.slice(1)) {
        if (waveTickets.length >= maxConcurrent) break;
        if (waveTickets.some((chosen) => scopesConflict(chosen, candidate))) continue;
        waveTickets.push(candidate);
      }
    }

    const conflictForced =
      available.length > 1 &&
      waveTickets.length === 1 &&
      available
        .filter((candidate) => candidate !== waveTickets[0])
        .every((candidate) => scopesConflict(waveTickets[0], candidate));

    waves.push({
      tickets: waveTickets,
      serialized: conflictForced,
      contract: Boolean(contractTicket),
    });
    for (const ticket of waveTickets) {
      scheduled.add(String(ticket.id));
      const index = remaining.indexOf(ticket);
      if (index >= 0) remaining.splice(index, 1);
    }
  }

  const unscheduled = ready
    .filter((ticket) => !scheduled.has(String(ticket.id)))
    .map((ticket) => ({
      ticket,
      reason: reasons.get(String(ticket.id)) ?? "dependency cycle/unavailable",
    }));

  return { waves, unscheduled };
}

export function formatPlan(plan, tickets = []) {
  const waves = Array.isArray(plan?.waves) ? plan.waves : [];
  const unscheduled = Array.isArray(plan?.unscheduled) ? plan.unscheduled : [];
  const all = Array.isArray(tickets) ? tickets : [];
  const ready = all.filter(isReadyTicket).sort(compareTickets);
  const activeTickets = all
    .filter((ticket) => ACTIVE_STATUSES.includes(ticket?.status))
    .sort(compareTickets);
  const conflicts = findScopeConflicts([...ready, ...activeTickets]);
  const lines = [];

  lines.push("Ready:");
  if (ready.length === 0) {
    lines.push("  (none)");
  } else {
    for (const ticket of ready) {
      const scopes = ticketScopes(ticket).join(", ") || "(no scopes)";
      lines.push(`  ${ticket.id} (${ticket.data?.priority ?? "normal"}): ${scopes}`);
    }
  }

  lines.push("Conflicts:");
  if (conflicts.length === 0) {
    lines.push("  (none)");
  } else {
    for (const conflict of conflicts) {
      const scopes = conflict.scopes
        .map(([scopeA, scopeB]) =>
          scopeA === scopeB ? scopeA : `${scopeA} / ${scopeB}`,
        )
        .join(", ");
      lines.push(`  ${conflict.a.id} <-> ${conflict.b.id}: ${scopes}`);
    }
  }

  lines.push("Waves:");
  if (waves.length === 0) {
    lines.push("  (none)");
  } else {
    waves.forEach((wave, index) => {
      const label = `  Wave ${index + 1}${
        wave.serialized ? " (serialized)" : ""
      }${wave.contract ? " (contract)" : ""}:`;
      const entries = (wave.tickets ?? []).map((ticket) => {
        const scopes = ticketScopes(ticket).join(", ") || "(no scopes)";
        return `${ticket.id} [${scopes}]`;
      });
      lines.push(`${label} ${entries.join("; ")}`);
    });
  }

  lines.push("Unscheduled:");
  if (unscheduled.length === 0) {
    lines.push("  (none)");
  } else {
    for (const item of unscheduled) {
      lines.push(`  ${item.ticket?.id ?? "?"}: ${item.reason}`);
    }
  }

  return lines.join("\n");
}
