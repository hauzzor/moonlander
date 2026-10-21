import { afterEach, describe, expect, it } from "vitest";
import {
  createBuildInfo,
  serializeChangelog,
  type ChangelogEntry,
} from "../build-info";
import {
  createChangelog,
  decodeChangelog,
  renderChangelogEntries,
  type ChangelogController,
  type ChangelogOptions,
} from "../src/changelog";
import {
  FakeDialogElement,
  FakeElement,
  installFakeDom,
  type FakeDom,
} from "./fake-dom";

const ENTRIES: readonly ChangelogEntry[] = [
  {
    date: "2026-10-21",
    title: "Newest entry",
    bullets: ["Newest bullet", "Second newest bullet"],
  },
  {
    date: "2026-10-20",
    title: "Middle entry",
    bullets: ["Middle bullet"],
  },
  {
    date: "2026-10-19",
    title: "Oldest entry",
    bullets: ["Oldest bullet"],
  },
];

interface ChangelogFixture {
  dom: FakeDom;
  button: FakeElement;
  dialog: FakeDialogElement;
  close: FakeElement;
  list: FakeElement;
  controller: ChangelogController;
  opens: boolean[];
}

let activeDom: FakeDom | null = null;

function installChangelogFixture(
  options: {
    entries?: readonly ChangelogEntry[];
    injected?: string;
    allowEmpty?: boolean;
  } = {},
): ChangelogFixture {
  const dom = installFakeDom();
  activeDom = dom;

  const button = dom.addElement("changelog-button", "button");
  const dialog = dom.addDialog("changelog-dialog");
  const close = dom.addElement("changelog-close", "button");
  const list = dom.addElement("changelog-list", "div");
  dialog.appendChild(new FakeElement("div"));

  if (options.injected !== undefined) {
    const script = dom.addElement("changelog-data", "script");
    script.textContent = options.injected;
  }

  const opens: boolean[] = [];
  const changelogOptions: ChangelogOptions = {
    onOpenChange: (open) => {
      opens.push(open);
    },
  };

  if (options.entries !== undefined) {
    changelogOptions.entries = options.entries;
  } else if (!("injected" in options) && options.allowEmpty !== true) {
    changelogOptions.entries = ENTRIES;
  }

  const controller = createChangelog(changelogOptions);

  return { dom, button, dialog, close, list, controller, opens };
}

afterEach(() => {
  activeDom?.restore();
  activeDom = null;
});

function renderedEntries(list: FakeElement): FakeElement[] {
  return list.children.filter(
    (child) => child.tagName === "details",
  );
}

function summaryFor(entry: FakeElement): FakeElement {
  const summary = entry.children.find((child) => child.tagName === "summary");
  expect(summary).toBeDefined();
  return summary!;
}

function textOf(element: FakeElement): string {
  return element.textContent.trim();
}

describe("changelog decoding", () => {
  it("normalizes entries, defaults missing bullets, and sorts newest first", () => {
    const decoded = decodeChangelog(
      JSON.stringify([
        { date: "2026-10-19", title: "Older", bullets: ["old"] },
        { date: "2026-10-21", title: "Newer", items: ["new", " "] },
        { date: "2026-10-20", title: "No bullets" },
      ]),
    );

    expect(decoded).toEqual([
      { date: "2026-10-21", title: "Newer", bullets: ["new"] },
      { date: "2026-10-20", title: "No bullets", bullets: [] },
      { date: "2026-10-19", title: "Older", bullets: ["old"] },
    ]);
  });

  it.each([
    { name: "null", raw: null },
    { name: "undefined", raw: undefined },
    { name: "empty", raw: "" },
    { name: "whitespace", raw: "  \n\t " },
    { name: "the raw placeholder", raw: "__CHANGELOG_JSON__" },
    { name: "malformed JSON", raw: "{not-json" },
    { name: "a JSON object", raw: "{}" },
    { name: "a JSON string", raw: '"entries"' },
  ])("returns no entries for $name", ({ raw }) => {
    expect(decodeChangelog(raw)).toEqual([]);
  });

  it("drops entries without a date or title and non-string bullets", () => {
    const decoded = decodeChangelog(
      JSON.stringify([
        { date: "", title: "Missing date", bullets: ["x"] },
        { date: "2026-10-21", title: "  ", bullets: ["x"] },
        { date: "2026-10-21", title: "Kept", bullets: ["ok", 3, null] },
        null,
        42,
      ]),
    );

    expect(decoded).toEqual([
      { date: "2026-10-21", title: "Kept", bullets: ["ok"] },
    ]);
  });
});

describe("changelog entry rendering", () => {
  it("renders every entry as a details element with date, title, and bullets", () => {
    const fixture = installChangelogFixture();
    const entries = renderedEntries(fixture.list);

    expect(entries).toHaveLength(ENTRIES.length);

    entries.forEach((entry, index) => {
      const expected = ENTRIES[index]!;
      const details = entry as FakeElement & { open?: boolean };
      const summary = summaryFor(entry);
      const list = entry.children.find((child) => child.tagName === "ul");

      expect(entry.tagName).toBe("details");
      expect(entry.classList.contains("changelog-entry")).toBe(true);
      expect(entry.getAttribute("data-testid")).toBe("changelog-entry");
      expect(details.open).toBe(index === 0);
      expect(entry.getAttribute("data-expanded")).toBe(
        String(index === 0),
      );
      expect(summary.getAttribute("aria-expanded")).toBe(
        String(index === 0),
      );
      expect(
        textOf(
          summary.children.find(
            (child) => child.classList.contains("changelog-entry-date"),
          )!,
        ),
      ).toBe(expected.date);
      expect(
        textOf(
          summary.children.find(
            (child) => child.classList.contains("changelog-entry-title"),
          )!,
        ),
      ).toBe(expected.title);

      expect(list).toBeDefined();
      const bullets = list!.children.filter(
        (child) => child.tagName === "li",
      );
      expect(bullets.map(textOf)).toEqual(expected.bullets);
    });
  });

  it("renders entries newest first even when given unsorted input", () => {
    const fixture = installChangelogFixture({
      entries: [ENTRIES[2]!, ENTRIES[0]!, ENTRIES[1]!],
    });
    const titles = renderedEntries(fixture.list).map((entry) =>
      textOf(
        summaryFor(entry).children.find((child) =>
          child.classList.contains("changelog-entry-title"),
        )!,
      ),
    );

    expect(titles).toEqual([
      "Newest entry",
      "Middle entry",
      "Oldest entry",
    ]);
    expect(renderedEntries(fixture.list)[0]?.getAttribute("data-expanded")).toBe(
      "true",
    );
  });

  it("reads the build-time injected JSON from the changelog script", () => {
    const fixture = installChangelogFixture({
      injected: serializeChangelog(ENTRIES),
    });

    expect(renderedEntries(fixture.list)).toHaveLength(ENTRIES.length);
    expect(
      textOf(
        summaryFor(renderedEntries(fixture.list)[0]!).children.find(
          (child) => child.classList.contains("changelog-entry-title"),
        )!,
      ),
    ).toBe("Newest entry");
  });

  it.each([
    { name: "a missing changelog script", injected: undefined },
    { name: "an empty changelog script", injected: "" },
    { name: "a malformed changelog script", injected: "[broken" },
  ])("renders an empty list for $name", ({ injected }) => {
    const fixture =
      injected === undefined
        ? installChangelogFixture({ allowEmpty: true })
        : installChangelogFixture({ injected });

    expect(renderedEntries(fixture.list)).toHaveLength(0);
  });

  it("clears a previous render instead of duplicating entries", () => {
    const fixture = installChangelogFixture();

    renderChangelogEntries(
      ENTRIES,
      fixture.list as unknown as HTMLElement,
      fixture.dom.document as unknown as Document,
    );

    expect(renderedEntries(fixture.list)).toHaveLength(ENTRIES.length);
    expect(
      renderedEntries(fixture.list)[0]?.getAttribute("data-expanded"),
    ).toBe("true");
  });

  it("toggles data-expanded and aria-expanded with the details element", () => {
    const fixture = installChangelogFixture();
    const entries = renderedEntries(fixture.list);
    const second = entries[1]!;
    const secondSummary = summaryFor(second);

    second.setAttribute("open", "");
    (second as FakeElement & { open: boolean }).open = true;
    second.dispatch("toggle");

    expect(second.getAttribute("data-expanded")).toBe("true");
    expect(secondSummary.getAttribute("aria-expanded")).toBe("true");

    const first = entries[0]!;
    (first as FakeElement & { open: boolean }).open = false;
    first.removeAttribute("open");
    first.dispatch("toggle");

    expect(first.getAttribute("data-expanded")).toBe("false");
    expect(summaryFor(first).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("changelog dialog lifecycle", () => {
  it("opens from the button and marks the body as modal", () => {
    const fixture = installChangelogFixture();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.dialog.hasAttribute("open")).toBe(false);

    fixture.button.dispatch("click");

    expect(fixture.controller.isOpen()).toBe(true);
    expect(fixture.dialog.open).toBe(true);
    expect(fixture.dialog.hasAttribute("open")).toBe(true);
    expect(fixture.dom.document.body.classList.contains("changelog-open")).toBe(
      true,
    );
    expect(fixture.opens).toEqual([true]);
  });

  it("closes with the close button and returns focus to the button", () => {
    const fixture = installChangelogFixture();
    fixture.button.dispatch("click");
    fixture.close.focus();
    expect(fixture.dom.document.activeElement).toBe(fixture.close);

    fixture.close.dispatch("click");

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.dialog.open).toBe(false);
    expect(fixture.dialog.hasAttribute("open")).toBe(false);
    expect(fixture.dom.document.body.classList.contains("changelog-open")).toBe(
      false,
    );
    expect(fixture.dom.document.activeElement).toBe(fixture.button);
    expect(fixture.opens).toEqual([true, false]);
  });

  it("finalizes a native dialog close, such as Escape, and returns focus", () => {
    const fixture = installChangelogFixture();
    fixture.button.dispatch("click");
    fixture.close.focus();

    fixture.dialog.close();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.dom.document.body.classList.contains("changelog-open")).toBe(
      false,
    );
    expect(fixture.dom.document.activeElement).toBe(fixture.button);
    expect(fixture.opens).toEqual([true, false]);
  });

  it("closes on an outside click on the dialog backdrop", () => {
    const fixture = installChangelogFixture();
    fixture.button.dispatch("click");

    fixture.dialog.dispatch("click", { target: fixture.dialog });

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.dialog.hasAttribute("open")).toBe(false);
    expect(fixture.dom.document.activeElement).toBe(fixture.button);
  });

  it("keeps the dialog open when a child is clicked", () => {
    const fixture = installChangelogFixture();
    fixture.button.dispatch("click");
    const card = fixture.dialog.children[0];
    expect(card).toBeDefined();

    fixture.dialog.dispatch("click", { target: card });

    expect(fixture.controller.isOpen()).toBe(true);
    expect(fixture.dialog.hasAttribute("open")).toBe(true);
  });

  it("exposes open and close methods that are idempotent", () => {
    const fixture = installChangelogFixture();

    fixture.controller.open();
    fixture.controller.open();

    expect(fixture.controller.isOpen()).toBe(true);
    expect(fixture.opens).toEqual([true]);

    fixture.controller.close();
    fixture.controller.close();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.opens).toEqual([true, false]);
  });

  it("closes and returns focus when disposed", () => {
    const fixture = installChangelogFixture();
    fixture.controller.open();

    fixture.controller.dispose();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.dom.document.activeElement).toBe(fixture.button);
  });

  it("toggles the dialog closed when the button is clicked again", () => {
    const fixture = installChangelogFixture();

    fixture.button.dispatch("click");
    fixture.button.dispatch("click");

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.dialog.hasAttribute("open")).toBe(false);
  });

  it("renders the full build-injected changelog with the latest entry open", () => {
    const info = createBuildInfo({
      env: { GITHUB_RUN_NUMBER: "42", GITHUB_SHA: "abcdef1234" },
    });
    const fixture = installChangelogFixture({
      injected: serializeChangelog(ENTRIES),
    });

    expect(info.buildSource).toBe("ci");
    expect(renderedEntries(fixture.list)).toHaveLength(ENTRIES.length);
    expect(
      renderedEntries(fixture.list).filter(
        (entry) => entry.getAttribute("data-expanded") === "true",
      ),
    ).toHaveLength(1);
    expect(
      renderedEntries(fixture.list)[0]?.getAttribute("data-expanded"),
    ).toBe("true");
  });
});
