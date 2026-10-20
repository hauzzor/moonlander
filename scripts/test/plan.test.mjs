import { describe, expect, it } from "vitest";
import {
  findScopeConflicts,
  formatPlan,
  hasParallelizationPlan,
  isReadyTicket,
  planWaves,
  resolvePlanConcurrency,
  ticketDependencyIds,
  ticketScopes,
} from "../lib/plan.mjs";

const PLAN_BODY = "## Parallelization plan\n\n- Synthetic wave plan.\n";

function makeTicket(id, options = {}) {
  const {
    status = "ready",
    priority = "normal",
    dependsOn = [],
    scopes = [`packages/${id.toLowerCase()}/src/index.ts`],
    confirmed = true,
    openQuestions = [],
    contract = false,
    body = PLAN_BODY,
  } = options;

  return {
    id,
    status,
    data: {
      id,
      priority,
      "depends-on": dependsOn,
      scopes,
      confirmed,
      contract,
      "open-questions": openQuestions,
    },
    body,
  };
}

function waveIds(plan) {
  return plan.waves.map((wave) => wave.tickets.map((ticket) => ticket.id));
}

function reasonsById(plan) {
  return Object.fromEntries(
    plan.unscheduled.map((item) => [item.ticket.id, item.reason]),
  );
}

describe("ticket plan helpers", () => {
  it("normalizes dependency ids from arrays, comma strings, and missing values", () => {
    expect(ticketDependencyIds({ data: { "depends-on": ["T-0001", "T-0002"] } })).toEqual([
      "T-0001",
      "T-0002",
    ]);
    expect(ticketDependencyIds({ data: { "depends-on": "T-0001, T-0002" } })).toEqual([
      "T-0001",
      "T-0002",
    ]);
    expect(ticketDependencyIds({ data: { "depends-on": [] } })).toEqual([]);
    expect(ticketDependencyIds({ data: {} })).toEqual([]);
    expect(ticketDependencyIds({})).toEqual([]);
  });

  it("normalizes scopes from arrays and comma strings", () => {
    expect(ticketScopes({ data: { scopes: ["a", "b"] } })).toEqual(["a", "b"]);
    expect(ticketScopes({ data: { scopes: "a, b" } })).toEqual(["a", "b"]);
    expect(ticketScopes({ data: {} })).toEqual([]);
  });

  it("requires ready status, confirmation, no open questions, and scopes", () => {
    expect(isReadyTicket(makeTicket("T-0001"))).toBe(true);

    expect(isReadyTicket(makeTicket("T-0001", { status: "in-progress" }))).toBe(false);
    expect(isReadyTicket(makeTicket("T-0001", { status: "blocked" }))).toBe(false);
    expect(isReadyTicket(makeTicket("T-0001", { confirmed: false }))).toBe(false);
    expect(
      isReadyTicket(makeTicket("T-0001", { openQuestions: ["Which scope?"] })),
    ).toBe(false);
    expect(isReadyTicket(makeTicket("T-0001", { openQuestions: "none" }))).toBe(true);
    expect(isReadyTicket(makeTicket("T-0001", { openQuestions: "" }))).toBe(true);
    expect(isReadyTicket(makeTicket("T-0001", { scopes: [] }))).toBe(false);
  });

  it("detects a parallelization plan heading case-insensitively", () => {
    expect(hasParallelizationPlan(makeTicket("T-0001"))).toBe(true);
    expect(
      hasParallelizationPlan({ body: "   ## parallelization PLAN\n\nDetails." }),
    ).toBe(true);
    expect(
      hasParallelizationPlan({
        body: "## Parallelization plan\n\n- Independent units: T-0005\n",
      }),
    ).toBe(true);
    expect(
      hasParallelizationPlan({
        body: "## Parallelization plan\n\nWe run sequentially because the files overlap.\n",
      }),
    ).toBe(true);
    expect(hasParallelizationPlan({ body: "## Goal\n\nNo plan." })).toBe(false);
    expect(hasParallelizationPlan({ body: "" })).toBe(false);
    expect(hasParallelizationPlan({})).toBe(false);
  });

  it("rejects a plan section containing only blank template bullets", () => {
    expect(
      hasParallelizationPlan({
        body: [
          "## Parallelization plan",
          "",
          "- Independent units:",
          "- Disjoint scopes:",
          "- Shared files / integration points:",
          "- Wave and dependencies:",
          "- Max concurrency (default 2):",
          "- Coordination / handoff notes:",
          "- Why sequential, if no split:",
          "",
          "## Verification plan",
          "",
          "Run the tests.",
        ].join("\n"),
      }),
    ).toBe(false);
  });
});

describe("resolvePlanConcurrency", () => {
  it("defaults to 2", () => {
    expect(resolvePlanConcurrency()).toBe(2);
    expect(resolvePlanConcurrency([], {})).toBe(2);
    expect(resolvePlanConcurrency([], { TICKET_PLAN_MAX_PARALLEL: "" })).toBe(2);
  });

  it("accepts an explicit separate argument", () => {
    expect(resolvePlanConcurrency(["--max-parallel", "3"])).toBe(3);
  });

  it("accepts an inline argument", () => {
    expect(resolvePlanConcurrency(["--max-parallel=4"])).toBe(4);
  });

  it("uses TICKET_PLAN_MAX_PARALLEL when no argument is present", () => {
    expect(
      resolvePlanConcurrency([], { TICKET_PLAN_MAX_PARALLEL: "5" }),
    ).toBe(5);
  });

  it("prefers an explicit argument and ignores legacy TICKET_MAX_PARALLEL", () => {
    expect(
      resolvePlanConcurrency(["--max-parallel", "3"], {
        TICKET_PLAN_MAX_PARALLEL: "5",
        TICKET_MAX_PARALLEL: "9",
      }),
    ).toBe(3);
    expect(resolvePlanConcurrency([], { TICKET_MAX_PARALLEL: "9" })).toBe(2);
  });

  it("rejects invalid values", () => {
    expect(() => resolvePlanConcurrency(["--max-parallel", "0"])).toThrow(
      /positive integer/,
    );
    expect(() => resolvePlanConcurrency(["--max-parallel", "1.5"])).toThrow(
      /positive integer/,
    );
    expect(() => resolvePlanConcurrency(["--max-parallel", "NaN"])).toThrow(
      /positive integer/,
    );
    expect(() =>
      resolvePlanConcurrency([], { TICKET_PLAN_MAX_PARALLEL: "0" }),
    ).toThrow(/positive integer/);
  });
});

describe("planWaves", () => {
  it("groups disjoint ready tickets into one wave up to maxConcurrent", () => {
    const tickets = [
      makeTicket("T-0001", { scopes: ["packages/sim/src/a.ts"] }),
      makeTicket("T-0002", { scopes: ["packages/sim/src/b.ts"] }),
      makeTicket("T-0003", { scopes: ["packages/sim/src/c.ts"] }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });

    expect(waveIds(plan)).toEqual([["T-0001", "T-0002"], ["T-0003"]]);
    expect(plan.unscheduled).toEqual([]);
  });

  it("serializes overlapping scopes into separate waves", () => {
    const tickets = [
      makeTicket("T-0001", { scopes: ["packages/sim/src/shared.ts"] }),
      makeTicket("T-0002", { scopes: ["packages/sim/src/shared.ts"] }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });

    expect(waveIds(plan)).toEqual([["T-0001"], ["T-0002"]]);
    expect(plan.waves[0].serialized).toBe(true);
    expect(plan.waves[1].serialized).toBe(false);
  });

  it("orders dependent tickets into later waves", () => {
    const tickets = [
      makeTicket("T-0001", { scopes: ["packages/sim/src/a.ts"] }),
      makeTicket("T-0002", {
        dependsOn: ["T-0001"],
        scopes: ["packages/sim/src/b.ts"],
      }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });

    expect(waveIds(plan)).toEqual([["T-0001"], ["T-0002"]]);
    expect(plan.unscheduled).toEqual([]);
  });

  it("treats a dependency that is already done as satisfied", () => {
    const tickets = [
      makeTicket("T-0001", {
        status: "done",
        scopes: ["packages/sim/src/a.ts"],
      }),
      makeTicket("T-0002", {
        dependsOn: ["T-0001"],
        scopes: ["packages/sim/src/b.ts"],
      }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });

    expect(waveIds(plan)).toEqual([["T-0002"]]);
    expect(plan.unscheduled).toEqual([]);
  });

  it("orders tickets within a wave by high, normal, then low priority", () => {
    const tickets = [
      makeTicket("T-0001", {
        priority: "low",
        scopes: ["packages/sim/src/low.ts"],
      }),
      makeTicket("T-0002", {
        priority: "normal",
        scopes: ["packages/sim/src/normal.ts"],
      }),
      makeTicket("T-0003", {
        priority: "high",
        scopes: ["packages/sim/src/high.ts"],
      }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });

    expect(waveIds(plan)).toEqual([["T-0003", "T-0002"], ["T-0001"]]);
  });

  it("unschedules tickets that overlap an active ticket", () => {
    const tickets = [
      makeTicket("T-0001", {
        status: "in-progress",
        scopes: ["packages/sim/src/shared.ts"],
      }),
      makeTicket("T-0002", { scopes: ["packages/sim/src/shared.ts"] }),
      makeTicket("T-0003", { scopes: ["packages/game/src/main.ts"] }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });
    const output = formatPlan(plan, tickets);

    expect(waveIds(plan)).toEqual([["T-0003"]]);
    expect(reasonsById(plan)["T-0002"]).toBe("overlaps active T-0001");
    expect(output).toContain("T-0001 <-> T-0002");
  });

  it("unschedules ready tickets without a parallelization plan", () => {
    const tickets = [
      makeTicket("T-0001", { scopes: ["packages/sim/src/a.ts"] }),
      makeTicket("T-0002", {
        scopes: ["packages/sim/src/b.ts"],
        body: "## Goal\n\nNo parallelization section.",
      }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });
    const output = formatPlan(plan, tickets);

    expect(isReadyTicket(tickets[1])).toBe(true);
    expect(waveIds(plan)).toEqual([["T-0001"]]);
    expect(reasonsById(plan)["T-0002"]).toBe("missing parallelization plan");
    expect(output).toContain("T-0002");
    expect(output).toContain("missing parallelization plan");
  });

  it("requires plan content, not just blank template bullets", () => {
    const tickets = [
      makeTicket("T-0001", {
        scopes: ["packages/sim/src/blank.ts"],
        body: "## Parallelization plan\n\n- Independent units:\n- Disjoint scopes:\n",
      }),
      makeTicket("T-0002", {
        scopes: ["packages/sim/src/filled.ts"],
        body: "## Parallelization plan\n\n- Independent units: T-0005, T-0007\n",
      }),
      makeTicket("T-0003", {
        scopes: ["packages/sim/src/no-plan.ts"],
        body: "## Goal\n\nNo plan here.\n",
      }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });
    const reasons = reasonsById(plan);

    expect(waveIds(plan)).toEqual([["T-0002"]]);
    expect(reasons["T-0001"]).toBe("missing parallelization plan");
    expect(reasons["T-0002"]).toBeUndefined();
    expect(reasons["T-0003"]).toBe("missing parallelization plan");
  });

  it("schedules contract tickets alone and before other tickets", () => {
    const tickets = [
      makeTicket("T-0001", {
        priority: "high",
        scopes: ["packages/sim/src/feature.ts"],
      }),
      makeTicket("T-0002", {
        priority: "low",
        contract: true,
        scopes: ["packages/sim/src/contract.ts"],
      }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });

    expect(waveIds(plan)).toEqual([["T-0002"], ["T-0001"]]);
    expect(plan.waves[0].contract).toBe(true);
    expect(plan.waves[0].tickets).toHaveLength(1);
    expect(plan.waves[1].contract).toBe(false);
    expect(formatPlan(plan, tickets)).toContain("(contract)");
  });

  it("reports missing dependencies and dependency cycles", () => {
    const tickets = [
      makeTicket("T-0003", {
        dependsOn: ["T-9999"],
        scopes: ["packages/sim/src/missing.ts"],
      }),
      makeTicket("T-0004", {
        dependsOn: ["T-0005"],
        scopes: ["packages/sim/src/cycle-a.ts"],
      }),
      makeTicket("T-0005", {
        dependsOn: ["T-0004"],
        scopes: ["packages/sim/src/cycle-b.ts"],
      }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });
    const reasons = reasonsById(plan);

    expect(waveIds(plan)).toEqual([]);
    expect(reasons["T-0003"]).toMatch(/missing dependency T-9999/);
    expect(reasons["T-0004"]).toMatch(/cycle/);
    expect(reasons["T-0005"]).toMatch(/cycle/);
  });

  it("reports tickets waiting on non-done dependencies", () => {
    const tickets = [
      makeTicket("T-0001", {
        status: "in-progress",
        scopes: ["packages/sim/src/a.ts"],
      }),
      makeTicket("T-0002", {
        dependsOn: ["T-0001"],
        scopes: ["packages/sim/src/b.ts"],
      }),
    ];

    const plan = planWaves(tickets, { maxConcurrent: 2 });

    expect(waveIds(plan)).toEqual([]);
    expect(reasonsById(plan)["T-0002"]).toMatch(/waiting on dependency T-0001/);
  });

  it("honors maxConcurrent of 1 and 2", () => {
    const tickets = [
      makeTicket("T-0001", { scopes: ["packages/sim/src/a.ts"] }),
      makeTicket("T-0002", { scopes: ["packages/sim/src/b.ts"] }),
      makeTicket("T-0003", { scopes: ["packages/sim/src/c.ts"] }),
    ];

    expect(waveIds(planWaves(tickets, { maxConcurrent: 1 }))).toEqual([
      ["T-0001"],
      ["T-0002"],
      ["T-0003"],
    ]);
    expect(waveIds(planWaves(tickets, { maxConcurrent: 2 }))).toEqual([
      ["T-0001", "T-0002"],
      ["T-0003"],
    ]);
  });

  it("rejects a non-positive or non-integer maxConcurrent", () => {
    expect(() => planWaves([], { maxConcurrent: 0 })).toThrow(/positive integer/);
    expect(() => planWaves([], { maxConcurrent: 1.5 })).toThrow(/positive integer/);
    expect(() => planWaves([], { maxConcurrent: Number.NaN })).toThrow(
      /positive integer/,
    );
  });
});

describe("findScopeConflicts", () => {
  it("detects exact, nested, and wildcard overlaps and ignores unrelated scopes", () => {
    const tickets = [
      makeTicket("T-0001", { scopes: ["packages/game/src/main.ts"] }),
      makeTicket("T-0002", { scopes: ["packages/game/src/main.ts"] }),
      makeTicket("T-0003", { scopes: ["packages/sim/src"] }),
      makeTicket("T-0004", { scopes: ["packages/sim/src/field.ts"] }),
      makeTicket("T-0005", { scopes: ["*"] }),
      makeTicket("T-0006", { scopes: ["docs/spec.md"] }),
      makeTicket("T-0007", { scopes: ["README.md"] }),
      makeTicket("T-0008", { scopes: ["LICENSE"] }),
    ];

    const conflicts = findScopeConflicts(tickets);
    const pairs = conflicts.map((conflict) => [conflict.a.id, conflict.b.id]);

    expect(pairs).toContainEqual(["T-0001", "T-0002"]);
    expect(pairs).toContainEqual(["T-0003", "T-0004"]);
    expect(pairs).toContainEqual(["T-0005", "T-0006"]);
    expect(pairs).not.toContainEqual(["T-0007", "T-0008"]);

    const exact = conflicts.find(
      (conflict) => conflict.a.id === "T-0001" && conflict.b.id === "T-0002",
    );
    expect(exact.scopes).toEqual([
      ["packages/game/src/main.ts", "packages/game/src/main.ts"],
    ]);
    expect(pairs).toEqual([...pairs].sort((left, right) => {
      const first = left[0].localeCompare(right[0]);
      return first || left[1].localeCompare(right[1]);
    }));
  });
});

describe("formatPlan", () => {
  it("includes conflicts, waves, and unscheduled reasons", () => {
    const tickets = [
      makeTicket("T-0001", { scopes: ["packages/sim/src/shared.ts"] }),
      makeTicket("T-0002", { scopes: ["packages/sim/src/shared.ts"] }),
      makeTicket("T-0003", {
        dependsOn: ["T-9999"],
        scopes: ["packages/sim/src/other.ts"],
      }),
    ];
    const plan = planWaves(tickets, { maxConcurrent: 2 });
    const output = formatPlan(plan, tickets);

    expect(output).toContain("Ready:");
    expect(output).toContain("Conflicts:");
    expect(output).toContain("T-0001 <-> T-0002");
    expect(output).toContain("Waves:");
    expect(output).toContain("(serialized)");
    expect(output).toContain("Unscheduled:");
    expect(output).toMatch(/T-0003: missing dependency T-9999/);
  });

  it("prints (none) for every empty section", () => {
    const output = formatPlan({ waves: [], unscheduled: [] }, []);

    expect(output).toContain("Ready:");
    expect(output).toContain("Conflicts:");
    expect(output).toContain("Waves:");
    expect(output).toContain("Unscheduled:");
    expect(output.match(/\(none\)/g)).toHaveLength(4);
  });
});
