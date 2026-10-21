import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyBuildPlaceholders,
  createBuildInfo,
  escapeHtml,
  formatBuildLabel,
  formatBuildTime,
  parseChangelog,
  serializeChangelog,
  shortenSha,
} from "../build-info";

const FIXED_TIME = new Date("2026-10-21T02:30:45.000Z");
const FIXED_TIME_TEXT = "2026-10-21 02:30 UTC";

describe("short SHA formatting", () => {
  it.each([
    { name: "a full SHA", value: "abcdef1234567890", expected: "abcdef1" },
    { name: "whitespace around the SHA", value: "  abcdef123456  ", expected: "abcdef1" },
    { name: "an already short SHA", value: "abc1234", expected: "abc1234" },
    { name: "a shorter SHA", value: "abc12", expected: "abc12" },
    { name: "an empty SHA", value: "", expected: "unknown" },
    { name: "whitespace only", value: "   ", expected: "unknown" },
    { name: "null", value: null, expected: "unknown" },
    { name: "undefined", value: undefined, expected: "unknown" },
  ])("shortens $name", ({ value, expected }) => {
    expect(shortenSha(value)).toBe(expected);
  });
});

describe("UTC build time formatting", () => {
  it.each([
    {
      name: "an ordinary timestamp",
      value: FIXED_TIME,
      expected: FIXED_TIME_TEXT,
    },
    {
      name: "UTC midnight",
      value: "2026-10-21T00:00:00.000Z",
      expected: "2026-10-21 00:00 UTC",
    },
    {
      name: "the last minute of the UTC day",
      value: "2026-10-21T23:59:59.999Z",
      expected: "2026-10-21 23:59 UTC",
    },
    {
      name: "a numeric timestamp",
      value: Date.parse("2026-10-21T02:30:45.000Z"),
      expected: FIXED_TIME_TEXT,
    },
  ])("formats $name as YYYY-MM-DD HH:MM UTC", ({ value, expected }) => {
    expect(formatBuildTime(value)).toBe(expected);
  });

  it("formats the same instant identically regardless of the Date construction path", () => {
    expect(formatBuildTime(new Date(Date.parse("2026-10-21T02:30:45.000Z")))).toBe(
      formatBuildTime("2026-10-21T02:30:45.000Z"),
    );
  });

  it.each([
    { name: "an invalid string", value: "not-a-date" },
    { name: "an invalid number", value: Number.NaN },
  ])("returns unknown for $name", ({ value }) => {
    expect(formatBuildTime(value)).toBe("unknown");
  });
});

describe("build label formatting", () => {
  it("formats the documented CI label", () => {
    expect(
      formatBuildLabel({
        buildNumber: "42",
        buildSha: "abcdef123456",
        buildTime: FIXED_TIME_TEXT,
      }),
    ).toBe("BUILD 42 \u00b7 abcdef1 \u00b7 2026-10-21 02:30 UTC");
  });

  it("accepts the alias fields used by integration call sites", () => {
    expect(
      formatBuildLabel({
        runNumber: "42",
        shortSha: "abcdef123456",
        time: FIXED_TIME_TEXT,
      }),
    ).toBe("BUILD 42 \u00b7 abcdef1 \u00b7 2026-10-21 02:30 UTC");
  });

  it("formats the positional build number, SHA, and time", () => {
    expect(
      formatBuildLabel("42", "abcdef123456", FIXED_TIME_TEXT),
    ).toBe("BUILD 42 \u00b7 abcdef1 \u00b7 2026-10-21 02:30 UTC");
  });

  it("falls back to DEV and unknown without metadata", () => {
    const label = formatBuildLabel({});

    expect(label).toMatch(
      /^BUILD DEV \u00b7 unknown \u00b7 \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/,
    );
  });

  it("treats a blank build number as the local DEV build", () => {
    expect(
      formatBuildLabel({
        buildNumber: "   ",
        buildSha: "abcdef1",
        buildTime: FIXED_TIME_TEXT,
      }),
    ).toBe("BUILD DEV \u00b7 abcdef1 \u00b7 2026-10-21 02:30 UTC");
  });

  it("does not shorten an already short SHA twice", () => {
    expect(
      formatBuildLabel({
        buildNumber: "7",
        buildSha: "abc1234",
        buildTime: FIXED_TIME_TEXT,
      }),
    ).toBe("BUILD 7 \u00b7 abc1234 \u00b7 2026-10-21 02:30 UTC");
  });
});

describe("build metadata", () => {
  it("reports a CI build with the run number, short SHA, and UTC time", () => {
    const info = createBuildInfo({
      env: {
        GITHUB_RUN_NUMBER: "42",
        GITHUB_SHA: "abcdef1234567890",
      },
      now: FIXED_TIME,
    });

    expect(info).toEqual({
      buildNumber: "42",
      buildSha: "abcdef1",
      buildTime: FIXED_TIME_TEXT,
      buildSource: "ci",
      label: "BUILD 42 \u00b7 abcdef1 \u00b7 2026-10-21 02:30 UTC",
    });
  });

  it("reports a local build from the git SHA fallback", () => {
    const info = createBuildInfo({
      env: {},
      gitSha: "fedcba9876543210",
      now: FIXED_TIME,
    });

    expect(info).toEqual({
      buildNumber: "DEV",
      buildSha: "fedcba9",
      buildTime: FIXED_TIME_TEXT,
      buildSource: "local",
      label: "BUILD DEV \u00b7 fedcba9 \u00b7 2026-10-21 02:30 UTC",
    });
  });

  it("reports unknown for a local build without CI env or git", () => {
    const info = createBuildInfo({ env: {}, now: FIXED_TIME });

    expect(info.buildNumber).toBe("DEV");
    expect(info.buildSha).toBe("unknown");
    expect(info.buildSource).toBe("local");
    expect(info.label).toBe(
      "BUILD DEV \u00b7 unknown \u00b7 2026-10-21 02:30 UTC",
    );
  });

  it("keeps CI metadata when the run number is present but the SHA is missing", () => {
    const info = createBuildInfo({
      env: { GITHUB_RUN_NUMBER: "101", GITHUB_SHA: "" },
      now: FIXED_TIME,
    });

    expect(info.buildSource).toBe("ci");
    expect(info.buildNumber).toBe("101");
    expect(info.buildSha).toBe("unknown");
    expect(info.label).toBe(
      "BUILD 101 \u00b7 unknown \u00b7 2026-10-21 02:30 UTC",
    );
  });

  it.each([
    { name: "an empty run number", env: { GITHUB_RUN_NUMBER: "" } },
    { name: "a whitespace run number", env: { GITHUB_RUN_NUMBER: "  " } },
    { name: "no run number", env: {} },
  ])("treats $name as a local build", ({ env }) => {
    const info = createBuildInfo({
      env: { ...env, GITHUB_SHA: "abcdef1234567890" },
      now: FIXED_TIME,
    });

    expect(info.buildSource).toBe("local");
    expect(info.buildNumber).toBe("DEV");
    expect(info.buildSha).toBe("abcdef1");
  });

  it("ignores whitespace around CI metadata", () => {
    const info = createBuildInfo({
      env: {
        GITHUB_RUN_NUMBER: " 42 ",
        GITHUB_SHA: " abcdef1234567890 ",
      },
      now: FIXED_TIME,
    });

    expect(info.buildNumber).toBe("42");
    expect(info.buildSha).toBe("abcdef1");
  });
});

describe("changelog parsing", () => {
  it("parses the documented header and bullet format", () => {
    const entries = parseChangelog(
      [
        "# Changelog",
        "",
        "## 2026-10-20 \u2014 Older entry",
        "",
        "- First bullet",
        "- Second bullet",
        "",
      ].join("\n"),
    );

    expect(entries).toEqual([
      {
        date: "2026-10-20",
        title: "Older entry",
        bullets: ["First bullet", "Second bullet"],
      },
    ]);
  });

  it("orders entries newest first", () => {
    const entries = parseChangelog(
      [
        "## 2026-10-19 \u2014 Oldest",
        "- old",
        "## 2026-10-21 \u2014 Newest",
        "- new",
        "## 2026-10-20 \u2014 Middle",
        "- middle",
      ].join("\n"),
    );

    expect(entries.map((entry) => entry.date)).toEqual([
      "2026-10-21",
      "2026-10-20",
      "2026-10-19",
    ]);
    expect(entries.map((entry) => entry.title)).toEqual([
      "Newest",
      "Middle",
      "Oldest",
    ]);
  });

  it("joins wrapped bullet continuation lines", () => {
    const entries = parseChangelog(
      [
        "## 2026-10-21 \u2014 Wrapped",
        "- A sentence that wraps",
        "  onto the next line.",
        "- Another bullet",
        "    with more indentation.",
      ].join("\n"),
    );

    expect(entries[0]?.bullets).toEqual([
      "A sentence that wraps onto the next line.",
      "Another bullet with more indentation.",
    ]);
  });

  it.each([
    { name: "an em dash", separator: "\u2014" },
    { name: "an en dash", separator: "\u2013" },
    { name: "a hyphen", separator: "-" },
  ])("accepts $name in the header", ({ separator }) => {
    const entries = parseChangelog(
      `## 2026-10-21 ${separator} Title\n- bullet`,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe("Title");
  });

  it.each([
    { name: "empty text", value: "" },
    { name: "whitespace only", value: " \n\t\r\n " },
    { name: "a headerless document", value: "# Changelog\n\n- orphan bullet" },
    {
      name: "a malformed date",
      value: "## not-a-date \u2014 Title\n- bullet",
    },
    {
      name: "a header without a title",
      value: "## 2026-10-21 \u2014 \n- bullet",
    },
    {
      name: "a header without a separator",
      value: "## 2026-10-21 Title\n- bullet",
    },
  ])("returns no entries for $name", ({ value }) => {
    expect(parseChangelog(value)).toEqual([]);
  });

  it("ignores bullets before the first valid entry but keeps later entries", () => {
    const entries = parseChangelog(
      [
        "- orphan",
        "## 2026-10-21 \u2014 Valid",
        "- kept",
      ].join("\n"),
    );

    expect(entries).toEqual([
      { date: "2026-10-21", title: "Valid", bullets: ["kept"] },
    ]);
  });

  it("allows an entry with no bullets", () => {
    expect(parseChangelog("## 2026-10-21 \u2014 Bare")).toEqual([
      { date: "2026-10-21", title: "Bare", bullets: [] },
    ]);
  });

  it("is deterministic for the same input", () => {
    const source = [
      "## 2026-10-21 \u2014 Newest",
      "- one",
      "## 2026-10-20 \u2014 Older",
      "- two",
    ].join("\n");

    expect(parseChangelog(source)).toEqual(parseChangelog(source));
  });

  it("parses the repository changelog in newest-first order", () => {
    const markdown = readFileSync(
      new URL("../../../docs/CHANGELOG.md", import.meta.url),
      "utf8",
    );
    const entries = parseChangelog(markdown);
    const firstHeader = /^## \d{4}-\d{2}-\d{2}\s+[\u2014\u2013-]\s+(.+)$/m.exec(
      markdown,
    );

    expect(entries.length).toBeGreaterThan(0);
    expect(firstHeader).not.toBeNull();
    expect(entries[0]?.title).toBe(firstHeader?.[1]?.trim());
    expect(entries[0]?.title).toBe("Configurable simulation settings");

    for (let index = 1; index < entries.length; index += 1) {
      expect(
        entries[index - 1]!.date.localeCompare(entries[index]!.date),
      ).toBeGreaterThanOrEqual(0);
    }

    for (const entry of entries) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.bullets.length).toBeGreaterThan(0);
    }
  });
});

describe("changelog serialization and HTML injection", () => {
  const entries = [
    {
      date: "2026-10-21",
      title: "Unsafe </script> & <tag>",
      bullets: ["Keeps HTML inert", "Includes \u2028 and \u2029"],
    },
  ] as const;

  it("escapes HTML-sensitive characters in JSON", () => {
    const serialized = serializeChangelog(entries);

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<tag>");
    expect(serialized).not.toContain("&");
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(JSON.parse(serialized)).toEqual(entries);
  });

  it("escapes HTML entities", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("replaces every build and changelog placeholder", () => {
    const info = createBuildInfo({
      env: { GITHUB_RUN_NUMBER: "42", GITHUB_SHA: "<abcdef1>" },
      now: FIXED_TIME,
    });
    const html = [
      '<span data-build-number="__BUILD_NUMBER__"',
      ' data-build-sha="__BUILD_SHA__"',
      ' data-build-time="__BUILD_TIME__"',
      ' data-build-source="__BUILD_SOURCE__"></span>',
      '<script id="changelog-data">__CHANGELOG_JSON__</script>',
    ].join("");

    const output = applyBuildPlaceholders(html, info, entries);
    const scriptMatch = /<script id="changelog-data">([\s\S]*)<\/script>/.exec(
      output,
    );

    expect(output).not.toMatch(/__[A-Z_]+__/);
    expect(output).toContain('data-build-number="42"');
    expect(output).toContain('data-build-sha="&lt;abcdef1&gt;"');
    expect(output).toContain(`data-build-time="${FIXED_TIME_TEXT}"`);
    expect(output).toContain('data-build-source="ci"');
    expect(scriptMatch).not.toBeNull();
    expect(JSON.parse(scriptMatch![1]!)).toEqual(entries);
  });

  it("leaves an empty changelog as a valid JSON array", () => {
    const info = createBuildInfo({
      env: {},
      gitSha: "abcdef1234",
      now: FIXED_TIME,
    });

    const output = applyBuildPlaceholders("__CHANGELOG_JSON__", info, []);

    expect(JSON.parse(output)).toEqual([]);
  });
});
