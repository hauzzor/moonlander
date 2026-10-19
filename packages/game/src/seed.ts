export const DEFAULT_SEED = 1;
export const MAX_SEED = 0xffffffff;
export const SEED_MULTIPLIER = 1664525;
export const SEED_INCREMENT = 1013904223;

export function parseSeed(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SEED) {
    return null;
  }

  return value >>> 0;
}

export function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, SEED_MULTIPLIER) + SEED_INCREMENT) >>> 0;
}
