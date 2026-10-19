import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEED,
  MAX_SEED,
  SEED_INCREMENT,
  SEED_MULTIPLIER,
  nextSeed,
  parseSeed,
} from "../src/seed";

describe("seed helpers", () => {
  describe("parseSeed", () => {
    it("returns null when no seed was provided", () => {
      expect(parseSeed(null)).toBeNull();
    });

    it.each([
      ["empty", ""],
      ["whitespace-only", " \t\n "],
      ["negative", "-1"],
      ["decimal", "1.5"],
      ["non-numeric", "seed"],
      ["overflowing unsigned 32-bit range", "4294967296"],
    ])("rejects %s input", (_description, raw) => {
      expect(parseSeed(raw)).toBeNull();
    });

    it("accepts valid digits surrounded by whitespace", () => {
      expect(parseSeed("  12345 \t")).toBe(12345);
    });

    it("accepts zero", () => {
      expect(parseSeed("0")).toBe(0);
    });

    it("accepts the maximum unsigned 32-bit seed", () => {
      expect(parseSeed("4294967295")).toBe(4294967295);
    });
  });

  it("exports the documented seed constants", () => {
    expect(DEFAULT_SEED).toBe(1);
    expect(MAX_SEED).toBe(4294967295);
    expect(SEED_MULTIPLIER).toBe(1664525);
    expect(SEED_INCREMENT).toBe(1013904223);
  });

  describe("nextSeed", () => {
    it.each([
      [0, 1013904223],
      [1, 1015568748],
      [2, 1017233273],
      [4294967295, 1012239698],
      [3735928559, 1789648770],
    ])("maps seed %i to its deterministic 32-bit successor", (seed, expected) => {
      expect(nextSeed(seed)).toBe(expected);
    });

    it("matches the documented LCG formula with 32-bit wraparound", () => {
      for (const seed of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
        const expected = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        expect(nextSeed(seed)).toBe(expected);
      }
    });

    it("always returns an unsigned 32-bit integer", () => {
      for (const seed of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
        const result = nextSeed(seed);
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(0xffffffff);
      }
    });
  });
});
