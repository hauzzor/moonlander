export type BuildSource = "ci" | "local";

export interface BuildInfo {
  readonly buildNumber: string;
  readonly buildSha: string;
  readonly buildTime: string;
  readonly buildSource: BuildSource;
  readonly label: string;
}

export interface ChangelogEntry {
  readonly date: string;
  readonly title: string;
  readonly bullets: readonly string[];
}

export interface BuildInfoEnv {
  readonly [name: string]: string | undefined;
}

export interface BuildInfoInput {
  env?: BuildInfoEnv;
  now?: Date;
  gitSha?: string | null;
}

export interface BuildLabelInput {
  buildNumber?: string;
  buildSha?: string;
  buildTime?: string;
  buildSource?: BuildSource;
  number?: string;
  runNumber?: string;
  sha?: string;
  shortSha?: string;
  time?: string;
  source?: BuildSource;
}

const UNKNOWN_SHA = "unknown";
const LOCAL_BUILD_NUMBER = "DEV";
const SHORT_SHA_LENGTH = 7;
const HEX_SHA = /^[0-9a-f]+$/i;

export function shortenSha(value: string | null | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (trimmed.length === 0) {
    return UNKNOWN_SHA;
  }

  return HEX_SHA.test(trimmed)
    ? trimmed.slice(0, SHORT_SHA_LENGTH)
    : trimmed;
}

export function formatBuildTime(date: Date | string | number = new Date()): string {
  const parsed = date instanceof Date ? date : new Date(date);
  const milliseconds = parsed.getTime();

  if (!Number.isFinite(milliseconds)) {
    return "unknown";
  }

  const iso = parsed.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function readString(
  ...values: readonly (string | undefined)[]
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function labelInput(input: BuildLabelInput | BuildInfo): BuildLabelInput {
  return input as BuildLabelInput;
}

export function formatBuildLabel(
  input: BuildLabelInput | BuildInfo | string = {},
  sha?: string,
  time?: string,
): string {
  if (typeof input === "string") {
    const buildNumber = input.trim().length > 0 ? input.trim() : LOCAL_BUILD_NUMBER;
    return `BUILD ${buildNumber} \u00b7 ${shortenSha(sha)} \u00b7 ${time ?? formatBuildTime()}`;
  }

  const value = labelInput(input);
  const buildNumber =
    readString(value.buildNumber, value.runNumber, value.number) ??
    LOCAL_BUILD_NUMBER;
  const buildSha = shortenSha(
    readString(value.buildSha, value.shortSha, value.sha) ?? undefined,
  );
  const buildTime =
    readString(value.buildTime, value.time) ?? formatBuildTime();

  return `BUILD ${buildNumber} \u00b7 ${buildSha} \u00b7 ${buildTime}`;
}

export const formatBuildInfo = formatBuildLabel;

export function createBuildInfo(input: BuildInfoInput = {}): BuildInfo {
  const env = input.env ?? {};
  const runNumber = readString(env.GITHUB_RUN_NUMBER);
  const buildSource: BuildSource = runNumber === null ? "local" : "ci";
  const buildNumber = runNumber ?? LOCAL_BUILD_NUMBER;
  const buildSha = shortenSha(env.GITHUB_SHA ?? input.gitSha);
  const buildTime = formatBuildTime(input.now ?? new Date());
  const label = formatBuildLabel({
    buildNumber,
    buildSha,
    buildTime,
  });

  return {
    buildNumber,
    buildSha,
    buildTime,
    buildSource,
    label,
  };
}

export const readBuildInfo = createBuildInfo;

const CHANGELOG_HEADER =
  /^##\s+(\d{4}-\d{2}-\d{2})\s+[-\u2013\u2014]\s+(.+?)\s*$/;
const CHANGELOG_BULLET = /^\s*[-*]\s+(.*)$/;

interface MutableChangelogEntry {
  date: string;
  title: string;
  bullets: string[];
}

function appendContinuation(
  entry: MutableChangelogEntry | null,
  line: string,
): void {
  if (entry === null || entry.bullets.length === 0) {
    return;
  }

  const continuation = line.trim();
  if (continuation.length === 0) {
    return;
  }

  const index = entry.bullets.length - 1;
  entry.bullets[index] = `${entry.bullets[index] ?? ""} ${continuation}`.trim();
}

export function parseChangelog(markdown: string): ChangelogEntry[] {
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    return [];
  }

  const entries: MutableChangelogEntry[] = [];
  let current: MutableChangelogEntry | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.startsWith("## ")) {
      const header = CHANGELOG_HEADER.exec(line);
      if (header === null) {
        current = null;
        continue;
      }

      const date = header[1]!;
      const title = header[2]!.trim();
      if (title.length === 0) {
        current = null;
        continue;
      }

      current = { date, title, bullets: [] };
      entries.push(current);
      continue;
    }

    if (current === null) {
      continue;
    }

    const bullet = CHANGELOG_BULLET.exec(line);
    if (bullet !== null) {
      const text = bullet[1]!.trim();
      if (text.length > 0) {
        current.bullets.push(text);
      }
      continue;
    }

    appendContinuation(current, line);
  }

  return entries
    .map((entry) => ({
      date: entry.date,
      title: entry.title,
      bullets: [...entry.bullets],
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

export const parseChangelogEntries = parseChangelog;

export function serializeChangelog(
  entries: readonly ChangelogEntry[],
): string {
  return JSON.stringify(entries)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function applyBuildPlaceholders(
  html: string,
  info: BuildInfo,
  entries: readonly ChangelogEntry[] = [],
): string {
  return html
    .replaceAll("__BUILD_NUMBER__", escapeHtml(info.buildNumber))
    .replaceAll("__BUILD_SHA__", escapeHtml(info.buildSha))
    .replaceAll("__BUILD_TIME__", escapeHtml(info.buildTime))
    .replaceAll("__BUILD_SOURCE__", escapeHtml(info.buildSource))
    .replaceAll("__CHANGELOG_JSON__", serializeChangelog(entries));
}
