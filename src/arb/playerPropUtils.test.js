/**
 * Player prop utils — unit tests
 */

import { describe, it, expect } from "vitest";
import { normalizePlayerName, playerNamesMatch, lineAligns, getLineDiff } from "./playerPropUtils.js";

describe("normalizePlayerName", () => {
  it("lowercases and trims", () => {
    expect(normalizePlayerName("  Anthony Davis  ")).toBe("anthony davis");
  });

  it("strips Jr./Sr./III suffixes", () => {
    expect(normalizePlayerName("Gary Payton Jr.")).toBe("gary payton");
    expect(normalizePlayerName("Tim Duncan III")).toBe("tim duncan");
  });

  it("returns empty for invalid input", () => {
    expect(normalizePlayerName("")).toBe("");
    expect(normalizePlayerName(null)).toBe("");
  });
});

describe("playerNamesMatch", () => {
  it("matches exact same name", () => {
    expect(playerNamesMatch("Anthony Davis", "Anthony Davis")).toBe(true);
  });

  it("matches case-insensitive", () => {
    expect(playerNamesMatch("anthony davis", "Anthony Davis")).toBe(true);
  });

  it("matches by last name when last name is long enough", () => {
    expect(playerNamesMatch("LeBron James", "James")).toBe(true);
    expect(playerNamesMatch("Jalen Brunson", "Brunson")).toBe(true);
  });

  it("rejects non-matching names", () => {
    expect(playerNamesMatch("Anthony Davis", "LeBron James")).toBe(false);
    expect(playerNamesMatch("Davis", "James")).toBe(false);
  });

  it("handles special characters", () => {
    expect(playerNamesMatch("D'Angelo Russell", "D'Angelo Russell")).toBe(true);
  });
});

describe("lineAligns", () => {
  it("matches 24.5 O/U with 25+ Kalshi", () => {
    expect(lineAligns(25, 24.5)).toBe(true);
  });

  it("matches 23.5 O/U with 24+ Kalshi", () => {
    expect(lineAligns(24, 23.5)).toBe(true);
  });

  it("rejects 24.5 O/U with 20+ Kalshi", () => {
    expect(lineAligns(20, 24.5)).toBe(false);
  });

  it("rejects 24.5 O/U with 30+ Kalshi", () => {
    expect(lineAligns(30, 24.5)).toBe(false);
  });

  it("rejects nearby but non-equivalent lines", () => {
    expect(lineAligns(25, 24.0)).toBe(false);
    expect(lineAligns(25, 24.6)).toBe(false);
  });
});

describe("getLineDiff", () => {
  it("returns 0 for perfect alignment", () => {
    expect(getLineDiff(25, 24.5)).toBe(0);
  });

  it("returns diff when not aligned", () => {
    expect(getLineDiff(25, 24.0)).toBe(0.5);
  });
});
