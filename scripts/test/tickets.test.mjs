import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureQueue,
  findTicket,
  formatTable,
  isClaimable,
  listTickets,
  moveTicket,
  nextTicketIdFrom,
  parseFrontmatter,
  scopesOverlap,
  selectClaimable,
  serializeTicket,
  statusDir,
  ticketsRoot,
} from "../lib/tickets.mjs";

const sample = `---
id: T-0007
title: Test ticket
status: ready
priority: high
parent: null
depends-on: [T-0001, T-0002]
scopes:
  - packages/sim/src/foo.ts
  - packages/sim/test/foo.test.ts
contract: false
confirmed: true
confirmed-at: 2026-10-19T12:00:00Z
open-questions: []
---

## Goal

Do the thing.
`;

function ticket(overrides = {}) {
  const parsed = parseFrontmatter(sample);
  return {
    id: "T-0007",
    status: "ready",
    filePath: "T-0007.md",
    data: { ...parsed.data, ...overrides },
    body: parsed.body,
  };
}

describe("ticket core", () => {
  it("parses frontmatter scalars, arrays, and block lists", () => {
    const parsed = parseFrontmatter(sample);

    expect(parsed.data.id).toBe("T-0007");
    expect(parsed.data.priority).toBe("high");
    expect(parsed.data.parent).toBeNull();
    expect(parsed.data["depends-on"]).toEqual(["T-0001", "T-0002"]);
    expect(parsed.data.scopes).toEqual([
      "packages/sim/src/foo.ts",
      "packages/sim/test/foo.test.ts",
    ]);
    expect(parsed.data.confirmed).toBe(true);
    expect(parsed.data["open-questions"]).toEqual([]);
    expect(parsed.body).toContain("## Goal");
  });

  it("round-trips a ticket through serialization", () => {
    const parsed = parseFrontmatter(sample);
    const roundTrip = parseFrontmatter(
      serializeTicket({ data: parsed.data, body: parsed.body }),
    );

    expect(roundTrip.data).toEqual(parsed.data);
    expect(roundTrip.body).toContain("Do the thing.");
  });

  it("assigns the next id across existing tickets", () => {
    expect(
      nextTicketIdFrom([
        { id: "T-0002" },
        { id: "T-0011" },
        { id: "not-a-ticket" },
      ]),
    ).toBe("T-0012");
  });

  it("detects exact, nested, global, and unrelated scopes", () => {
    expect(scopesOverlap("packages/sim/src/a.ts", "packages/sim/src/a.ts")).toBe(true);
    expect(scopesOverlap("packages/sim/src", "packages/sim/src/a.ts")).toBe(true);
    expect(scopesOverlap("packages/sim/src/a.ts", "packages/game/src/a.ts")).toBe(false);
    expect(scopesOverlap("*", "docs/spec.md")).toBe(true);
    expect(scopesOverlap("", "docs/spec.md")).toBe(true);
  });

  it("only claims confirmed ready tickets with done dependencies and clear scopes", () => {
    const all = [
      ticket({ "depends-on": [] }),
      { ...ticket({ "depends-on": [] }), id: "T-0008", data: { ...ticket().data, id: "T-0008", confirmed: false } },
      { ...ticket({ "depends-on": ["T-0001"] }), id: "T-0009", data: { ...ticket().data, id: "T-0009", "depends-on": ["T-0001"] } },
      {
        ...ticket({ "depends-on": [] }),
        id: "T-0010",
        data: { ...ticket().data, id: "T-0010", "depends-on": [] },
        status: "done",
      },
    ];

    expect(isClaimable(all[0], all, [])).toBe(true);
    expect(isClaimable(all[1], all, [])).toBe(false);
    expect(isClaimable(all[2], all, [])).toBe(false);

    const active = [ticket({ "depends-on": [] })];
    active[0].id = "T-0011";
    active[0].status = "in-progress";
    active[0].data = { ...active[0].data, id: "T-0011", scopes: ["packages/sim/src"] };
    expect(isClaimable(all[0], [...all, ...active], active)).toBe(false);
  });

  it("selects claimable tickets in priority and id order", () => {
    const make = (id, priority) => {
      const base = ticket({ "depends-on": [] });
      return {
        ...base,
        id,
        data: {
          ...base.data,
          id,
          priority,
          scopes: [`packages/sim/src/${id}.ts`],
        },
      };
    };
    const tickets = [
      make("T-0002", "low"),
      make("T-0003", "high"),
      make("T-0004", "normal"),
    ];

    expect(selectClaimable(tickets, 2).map((item) => item.id)).toEqual([
      "T-0003",
      "T-0004",
    ]);
  });

  it("formats a table with ticket state", () => {
    const table = formatTable([ticket({ "depends-on": [] })]);
    expect(table).toContain("T-0007");
    expect(table).toContain("ready");
    expect(table).toContain("Test ticket");
  });

  it("moves a ticket between status folders and updates its status", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "moonlander-tickets-"));
    try {
      const root = ticketsRoot(repoRoot);
      await ensureQueue(root);
      const parsed = parseFrontmatter(sample);
      const filePath = path.join(statusDir(root, "ready"), "T-0007.md");
      await writeFile(filePath, serializeTicket({ data: parsed.data, body: parsed.body }), "utf8");

      const found = await findTicket(root, "T-0007");
      expect(found?.status).toBe("ready");
      await moveTicket(root, found, "in-progress");

      const moved = await findTicket(root, "T-0007");
      expect(moved?.status).toBe("in-progress");
      expect(moved?.data.status).toBe("in-progress");
      expect((await listTickets(root)).length).toBe(1);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
