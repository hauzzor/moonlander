import { readFile } from "node:fs/promises";

export const DEFAULT_LIVE_URL = "https://hauzzor.github.io/moonlander/";

const ASSET_PATTERN = /^assets\/[^/]+\.(?:js|mjs)$/i;

export function normalizeBaseUrl(value) {
  const candidate = value?.trim() || DEFAULT_LIVE_URL;
  return candidate.endsWith("/") ? candidate : `${candidate}/`;
}

export function normalizeAssetPath(value) {
  let asset = String(value ?? "").trim();

  if (/^https?:\/\//i.test(asset)) {
    asset = new URL(asset).pathname;
  }

  const assetsIndex = asset.indexOf("assets/");
  asset = assetsIndex >= 0 ? asset.slice(assetsIndex) : asset.replace(/^\.?\//, "");

  if (!ASSET_PATTERN.test(asset)) {
    throw new Error(`Unexpected asset path: ${asset || "(empty)"}`);
  }

  return asset;
}

export function extractAssetPath(html) {
  const scriptMatch = html.match(
    /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+\.(?:js|mjs))["']/i,
  );
  const fallbackMatch = html.match(/assets\/[A-Za-z0-9._-]+\.(?:js|mjs)/i);
  const asset = scriptMatch?.[1] ?? fallbackMatch?.[0];

  if (!asset) {
    throw new Error("Could not find a hashed JavaScript asset in index.html");
  }

  return normalizeAssetPath(asset);
}

export function tryExtractAssetPath(html) {
  try {
    return extractAssetPath(html);
  } catch {
    return undefined;
  }
}

export async function readAssetPathFromIndex(indexPath, missingHint) {
  let html;

  try {
    html = await readFile(indexPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      const hint = missingHint ? ` ${missingHint}` : "";
      throw new Error(`Missing build output: ${indexPath}.${hint}`);
    }
    throw error;
  }

  return extractAssetPath(html);
}

export async function tryReadAssetPathFromIndex(indexPath) {
  try {
    return await readAssetPathFromIndex(indexPath);
  } catch {
    return undefined;
  }
}
