import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECOVERY_POLICY,
  classifyBlock,
  isLockStale,
  isRecoveryEligible,
  nextRecoveryTimeoutMs,
  parseAgentReport,
  recoverySummary,
  resolveRecoveryPolicy,
  selectRecoverable,
  ticketRecoveryCategory,
} from "../lib/recovery.mjs";

const now = Date.parse("2026-10-20T12:00:00.000Z");
const policy = { ...DEFAULT_RECOVERY_POLICY };

function ticket(overrides = {}, data = {}) {
  return {
    id: "T-0002",
    status: "blocked",
    filePath: "T-0002.md",
    data: {
      id: "T-0002",
      title: "Test ticket",
      status: "blocked",
      priority: "high",
      "depends-on": [],
      scopes: ["packages/sim/src/field.ts"],
      confirmed: true,
      "open-questions": [],
      "blocked-reason": "ticket agent timed out after 2700000ms",
      "blocked-at": "2026-10-20T09:24:55.411Z",
      ...data,
    },
    ...overrides,
  };
}

describe("block classification", () => {
  it("classifies agent timeouts as recoverable", () => {
    expect(
      classifyBlock({
        stage: "agent",
        message: "ticket agent timed out after 2700000ms",
      }),
    ).toEqual({ category: "agent-timeout", retryable: true });
  });

  it("classifies explicit ambiguity as needs-info", () => {
    expect(
      classifyBlock({
        stage: "agent",
        message: "ticket agent did not report REVIEW: PASS",
        agentOutput: "BLOCKED: needs contract clarification before continuing",
      }),
    ).toEqual({ category: "needs-info", retryable: false });
  });

  it("classifies non-ambiguous agent blocks as transient", () => {
    expect(
      classifyBlock({
        stage: "agent",
        message: "ticket agent did not report REVIEW: PASS",
        agentOutput: "BLOCKED: e2e test fails on steep terrain",
      }),
    ).toEqual({ category: "transient", retryable: true });
  });

  it("classifies an agent without a report as incomplete", () => {
    expect(
      classifyBlock({
        stage: "agent",
        message: "ticket agent did not report REVIEW: PASS",
      }),
    ).toEqual({ category: "agent-incomplete", retryable: true });
  });

  it("classifies verification, delivery, merge, queue, and setup failures", () => {
    expect(classifyBlock({ stage: "verify", message: "npm run verify failed" })).toEqual({
      category: "verification",
      retryable: true,
    });
    expect(classifyBlock({ stage: "delivery", message: "ticket delivery failed" })).toEqual({
      category: "delivery",
      retryable: true,
    });
    expect(classifyBlock({ stage: "rebase", message: "git rebase main failed" })).toEqual({
      category: "merge-conflict",
      retryable: false,
    });
    expect(
      classifyBlock({
        stage: "queue",
        message: "Main worktree has changes outside docs/tickets",
      }),
    ).toEqual({ category: "main-dirty", retryable: false });
    expect(classifyBlock({ stage: "setup", message: "npm ci failed" })).toEqual({
      category: "infra",
      retryable: true,
    });
  });

  it("does not retry unknown failures", () => {
    expect(classifyBlock({ stage: "unknown", message: "unexpected" })).toEqual({
      category: "unknown",
      retryable: false,
    });
  });
});

describe("agent report parsing", () => {
  it("reads the final pass marker", () => {
    expect(parseAgentReport("TICKET REPORT\nREVIEW: PASS\n")).toEqual({
      status: "pass",
      reason: "",
    });
  });

  it("lets a later blocked marker override an earlier pass", () => {
    expect(parseAgentReport("REVIEW: PASS\nBLOCKED: scope changed\n")).toEqual({
      status: "blocked",
      reason: "scope changed",
    });
  });

  it("strips ANSI color codes", () => {
    expect(parseAgentReport("\u001b[0mREVIEW: PASS\u001b[0m")).toEqual({
      status: "pass",
      reason: "",
    });
  });

  it("reports an unknown status without a marker", () => {
    expect(parseAgentReport("still working")).toEqual({
      status: "unknown",
      reason: "",
    });
  });
});

describe("recovery eligibility", () => {
  it("accepts a timed-out confirmed ticket with a done dependency and free scopes", () => {
    expect(isRecoveryEligible(ticket(), [ticket()], [], now, policy)).toBe(true);
  });

  it("infers a legacy blocked reason without category metadata", () => {
    expect(ticketRecoveryCategory(ticket())).toBe("agent-timeout");
    expect(isRecoveryEligible(ticket(), [ticket()], [], now, policy)).toBe(true);
  });

  it("rejects exhausted attempts and explicit exhaustion", () => {
    expect(
      isRecoveryEligible(ticket({}, { "recovery-attempts": 1 }), [ticket()], [], now, policy),
    ).toBe(false);
    expect(
      isRecoveryEligible(ticket({}, { "recovery-exhausted": true }), [ticket()], [], now, policy),
    ).toBe(false);
  });

  it("rejects needs-info, merge-conflict, main-dirty, and unknown categories", () => {
    for (const category of ["needs-info", "merge-conflict", "main-dirty", "unknown"]) {
      expect(
        isRecoveryEligible(ticket({}, { "blocked-category": category }), [ticket()], [], now, policy),
      ).toBe(false);
    }
  });

  it("rejects tickets inside the cooldown window", () => {
    expect(
      isRecoveryEligible(
        ticket({}, { "blocked-at": new Date(now - 60_000).toISOString() }),
        [ticket()],
        [],
        now,
        policy,
      ),
    ).toBe(false);
  });

  it("rejects unconfirmed, open-question, and unscoped tickets", () => {
    expect(
      isRecoveryEligible(ticket({}, { confirmed: false }), [ticket()], [], now, policy),
    ).toBe(false);
    expect(
      isRecoveryEligible(
        ticket({}, { "open-questions": ["Which width?"] }),
        [ticket()],
        [],
        now,
        policy,
      ),
    ).toBe(false);
    expect(
      isRecoveryEligible(ticket({}, { scopes: [] }), [ticket()], [], now, policy),
    ).toBe(false);
  });

  it("rejects tickets whose dependencies are not done", () => {
    const current = ticket({}, { "depends-on": ["T-0001"] });
    const pending = { ...ticket(), id: "T-0001", status: "in-progress" };
    expect(isRecoveryEligible(current, [current, pending], [], now, policy)).toBe(false);
    const done = { ...pending, status: "done" };
    expect(isRecoveryEligible(current, [current, done], [], now, policy)).toBe(true);
  });

  it("rejects scopes that overlap active tickets", () => {
    const active = ticket({}, { scopes: ["packages/sim"] });
    expect(isRecoveryEligible(ticket(), [ticket(), active], [active], now, policy)).toBe(false);
    const disjoint = ticket({}, { scopes: ["packages/game"] });
    expect(isRecoveryEligible(ticket(), [ticket(), disjoint], [disjoint], now, policy)).toBe(true);
  });
});

describe("recovery selection", () => {
  it("selects up to the attempt limit in priority order", () => {
    const high = ticket({ id: "T-0002" }, { priority: "high", scopes: ["packages/sim/src/a.ts"] });
    const normal = ticket({ id: "T-0003" }, { priority: "normal", scopes: ["packages/game/src/b.ts"] });
    expect(selectRecoverable([normal, high], [], now, policy, 1).map((item) => item.id)).toEqual([
      "T-0002",
    ]);
    expect(selectRecoverable([normal, high], [], now, policy, 2).map((item) => item.id)).toEqual([
      "T-0002",
      "T-0003",
    ]);
  });

  it("does not select overlapping tickets in one pass", () => {
    const first = ticket({ id: "T-0002" }, { scopes: ["packages/sim/src"] });
    const second = ticket({ id: "T-0003" }, { scopes: ["packages/sim/src/field.ts"] });
    expect(selectRecoverable([first, second], [], now, policy, 2).map((item) => item.id)).toEqual([
      "T-0002",
    ]);
  });

  it("returns nothing when recovery is disabled", () => {
    expect(selectRecoverable([ticket()], [], now, { ...policy, maxAttempts: 0 }, 1)).toEqual([]);
  });
});

describe("recovery timing and locks", () => {
  it("uses the configured recovery timeout", () => {
    expect(nextRecoveryTimeoutMs(ticket(), policy)).toBe(policy.recoveryTimeoutMs);
    expect(
      nextRecoveryTimeoutMs(ticket(), { ...policy, recoveryTimeoutMs: 12345 }),
    ).toBe(12345);
  });

  it("detects stale, missing, and invalid locks", () => {
    expect(isLockStale({ heartbeat: new Date(now - 60_000).toISOString() }, now, 300_000)).toBe(
      false,
    );
    expect(isLockStale({ heartbeat: new Date(now - 600_000).toISOString() }, now, 300_000)).toBe(
      true,
    );
    expect(isLockStale(null, now, 300_000)).toBe(true);
    expect(isLockStale({ heartbeat: "not-a-date" }, now, 300_000)).toBe(true);
  });
});

describe("recovery policy and summaries", () => {
  it("reads defaults and environment overrides", () => {
    expect(resolveRecoveryPolicy({})).toEqual(DEFAULT_RECOVERY_POLICY);
    expect(
      resolveRecoveryPolicy({
        TICKET_MAX_RECOVERY_ATTEMPTS: "2",
        TICKET_RECOVERY_DELAY_MS: "1000",
        TICKET_RECOVERY_TIMEOUT_MS: "2000",
        TICKET_STALE_LOCK_MS: "3000",
      }),
    ).toEqual({
      maxAttempts: 2,
      cooldownMs: 1000,
      recoveryTimeoutMs: 2000,
      staleLockMs: 3000,
    });
    expect(resolveRecoveryPolicy({ TICKET_MAX_RECOVERY_ATTEMPTS: "nope" })).toEqual(
      DEFAULT_RECOVERY_POLICY,
    );
  });

  it("describes eligible, waiting, exhausted, and non-retryable tickets", () => {
    expect(recoverySummary(ticket(), now, policy)).toContain("eligible");
    expect(
      recoverySummary(
        ticket({}, { "blocked-at": new Date(now - 60_000).toISOString() }),
        now,
        policy,
      ),
    ).toContain("waiting");
    expect(recoverySummary(ticket({}, { "recovery-attempts": 1 }), now, policy)).toContain(
      "exhausted",
    );
    expect(recoverySummary(ticket({}, { "blocked-category": "needs-info" }), now, policy)).toContain(
      "not retryable",
    );
  });
});
