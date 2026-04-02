/**
 * findPropArbs — unit tests
 */

import { describe, it, expect } from "vitest";
import { findPropArbs } from "./findPropArbs.js";

function makeGame(overrides = {}) {
  return {
    home: "Boston Celtics",
    away: "Los Angeles Lakers",
    commence: new Date().toISOString(),
    eventId: "ev-123",
    bookOdds: {},
    spreadOdds: {},
    ...overrides,
  };
}

describe("findPropArbs", () => {
  it("finds cross-book Over/Under arb", () => {
    const games = [makeGame()];
    const propsByEvent = {
      "ev-123": [
        {
          player: "Anthony Davis",
          line: 24.5,
          statType: "player_points",
          overs: [{ book: "DraftKings", price: -110, decimal: 1.909 }],
          unders: [{ book: "FanDuel", price: 105, decimal: 2.05 }],
        },
      ],
    };
    const result = findPropArbs(games, propsByEvent, [], 100);
    expect(result.opps.length).toBeGreaterThan(0);
    const arb = result.opps[0];
    expect(arb.sideA).toContain("Over");
    expect(arb.sideB).toContain("Under");
    expect(arb.marketType).toBe("player_points");
    expect(arb.propPlayer).toBe("Anthony Davis");
    expect(arb.propLine).toBe(24.5);
  });

  it("returns empty when no props", () => {
    const games = [makeGame()];
    const result = findPropArbs(games, {}, [], 100);
    expect(result.opps).toEqual([]);
  });

  it("skips when Over and Under from same book", () => {
    const games = [makeGame()];
    const propsByEvent = {
      "ev-123": [
        {
          player: "Anthony Davis",
          line: 24.5,
          statType: "player_points",
          overs: [{ book: "DraftKings", price: -110, decimal: 1.909 }],
          unders: [{ book: "DraftKings", price: 105, decimal: 2.05 }],
        },
      ],
    };
    const result = findPropArbs(games, propsByEvent, [], 100);
    expect(result.opps.length).toBe(0);
  });

  it("deduplicates by key", () => {
    const games = [makeGame()];
    const propsByEvent = {
      "ev-123": [
        {
          player: "LeBron James",
          line: 25.5,
          statType: "player_points",
          overs: [
            { book: "DraftKings", price: -115, decimal: 1.87 },
            { book: "FanDuel", price: -108, decimal: 1.926 },
          ],
          unders: [
            { book: "BetMGM", price: 102, decimal: 2.02 },
            { book: "Caesars", price: 108, decimal: 2.08 },
          ],
        },
      ],
    };
    const result = findPropArbs(games, propsByEvent, [], 100);
    const keys = new Set(result.opps.map((o) => `${o.sideA}|${o.sideB}`));
    expect(result.opps.length).toBe(keys.size);
  });
});
