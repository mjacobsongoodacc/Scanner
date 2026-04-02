/**
 * Arb Execution Validator — Unit tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { validateArb, validateArbs, ARB_STATUS } from "./arbExecutionValidator.js";
import { evaluateQuoteQuality } from "./quoteQualityEvaluator.js";
import { scoreArbConfidence } from "./arbConfidenceScorer.js";
import { ARB_VALIDATION_CONFIG } from "./arbValidationConfig.js";

function makeArb(overrides = {}) {
  return {
    game: "Team A @ Team B",
    commence: new Date().toISOString(),
    sideA: "Team A ML",
    bookA: "DraftKings",
    americanA: -110,
    decimalA: 2.041,
    sideB: "Team B ML",
    bookB: "FanDuel",
    americanB: -110,
    decimalB: 2.041,
    impSum: 0.98,
    roi: 2.04,
    betA: 50,
    betB: 50,
    payoutA: 95.45,
    payoutB: 95.45,
    usedStake: 100,
    profit: 4.55,
    isTrueArb: true,
    kalshiTicker: "",
    marketType: "h2h",
    kalshiVolume: null,
    kalshiBaSpread: null,
    confidence: "high",
    ...overrides,
  };
}

describe("evaluateQuoteQuality", () => {
  it("passes for healthy volume and tight spread", () => {
    const r = evaluateQuoteQuality({ volume: 5000, baSpreadCents: 2 });
    expect(r.pass).toBe(true);
    expect(r.warnings.length).toBe(0);
    expect(r.slippageCents).toBe(0);
  });

  it("fails and adds penalty for low volume", () => {
    const r = evaluateQuoteQuality({ volume: 50, baSpreadCents: 2 });
    expect(r.pass).toBe(false);
    expect(r.warnings.some((w) => w.includes("Low volume"))).toBe(true);
    expect(r.slippageCents).toBeGreaterThan(0);
  });

  it("fails and adds penalty for wide spread", () => {
    const r = evaluateQuoteQuality({ volume: 5000, baSpreadCents: 5 });
    expect(r.pass).toBe(false);
    expect(r.warnings.some((w) => w.includes("Wide bid-ask"))).toBe(true);
    expect(r.slippageCents).toBeGreaterThan(0);
  });
});

describe("scoreArbConfidence", () => {
  it("scores book-vs-book arb high", () => {
    const arb = makeArb({ kalshiTicker: "", kalshiVolume: null });
    const r = scoreArbConfidence(arb);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.reasons.some((x) => x.toLowerCase().includes("book"))).toBe(true);
  });

  it("scores Kalshi arb with healthy liquidity high", () => {
    const arb = makeArb({
      kalshiTicker: "TICKER",
      bookA: "Kalshi",
      kalshiVolume: 2000,
      kalshiBaSpread: 2,
    });
    const r = scoreArbConfidence(arb);
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("scores Kalshi arb with low volume low", () => {
    const arb = makeArb({
      kalshiTicker: "TICKER",
      bookA: "Kalshi",
      kalshiVolume: 50,
      kalshiBaSpread: 2,
    });
    const r = scoreArbConfidence(arb);
    expect(r.score).toBeLessThan(70);
  });

  it("scores Kalshi arb with wide spread low", () => {
    const arb = makeArb({
      kalshiTicker: "TICKER",
      bookA: "Kalshi",
      kalshiVolume: 2000,
      kalshiBaSpread: 5,
      roi: 3.5,
    });
    const r = scoreArbConfidence(arb);
    expect(r.score).toBeLessThan(70);
  });
});

describe("validateArb", () => {
  it("1. true sportsbook arb with healthy liquidity -> actionable", () => {
    const arb = makeArb({ kalshiTicker: "", bookA: "DraftKings", bookB: "FanDuel" });
    const v = validateArb(arb);
    expect(v.validationResult.status).toBe(ARB_STATUS.ACTIONABLE);
    expect(v.validationResult.reasons[0].toLowerCase()).toContain("actionable");
  });

  it("2. math-valid arb with low volume -> rejected or monitor", () => {
    const arb = makeArb({
      kalshiTicker: "TICKER",
      bookA: "Kalshi",
      kalshiVolume: 50,
      kalshiBaSpread: 2,
    });
    const v = validateArb(arb);
    expect([ARB_STATUS.MONITOR, ARB_STATUS.REJECT]).toContain(v.validationResult.status);
    expect(v.validationResult.status).not.toBe(ARB_STATUS.ACTIONABLE);
  });

  it("3. math-valid arb with wide spread -> rejected or monitor", () => {
    const arb = makeArb({
      kalshiTicker: "TICKER",
      bookA: "Kalshi",
      kalshiVolume: 2000,
      kalshiBaSpread: 5,
    });
    const v = validateArb(arb);
    expect([ARB_STATUS.MONITOR, ARB_STATUS.REJECT]).toContain(v.validationResult.status);
    expect(v.validationResult.status).not.toBe(ARB_STATUS.ACTIONABLE);
  });

  it("4. math-valid arb with stale exchange quote (thin + wide) -> rejected", () => {
    const arb = makeArb({
      kalshiTicker: "TICKER",
      bookA: "Kalshi",
      kalshiVolume: 30,
      kalshiBaSpread: 8,
    });
    const v = validateArb(arb);
    expect(v.validationResult.status).toBe(ARB_STATUS.REJECT);
  });

  it("5. internal warning present (high ROI) -> not actionable", () => {
    const arb = makeArb({
      roi: 12,
      impSum: 0.88,
      kalshiTicker: "TICKER",
      kalshiVolume: 50,
      kalshiBaSpread: 3,
    });
    const v = validateArb(arb);
    expect(v.validationResult.status).not.toBe(ARB_STATUS.ACTIONABLE);
    expect(v.validationResult.reasons.some((r) => r.toLowerCase().includes("roi") || r.toLowerCase().includes("stale") || r.toLowerCase().includes("phantom"))).toBe(true);
  });

  it("6. executable-price adjustment turning positive arb into negative -> rejected", () => {
    const arb = makeArb({
      impSum: 0.995,
      roi: 0.5,
      decimalA: 2.02,
      decimalB: 2.02,
      kalshiTicker: "TICKER",
      bookA: "Kalshi",
      kalshiVolume: 30,
      kalshiBaSpread: 10,
    });
    const v = validateArb(arb);
    expect(v.validationResult.stillArbAfterAdjustment).toBe(false);
    expect(v.validationResult.status).toBe(ARB_STATUS.REJECT);
  });
});

describe("validateArbs", () => {
  it("splits arbs into actionable, monitor, rejected", () => {
    const bookArb = makeArb({ kalshiTicker: "" });
    const thinKalshi = makeArb({
      kalshiTicker: "T",
      bookA: "Kalshi",
      kalshiVolume: 30,
      kalshiBaSpread: 5,
    });
    const result = validateArbs([bookArb, thinKalshi]);
    expect(result.actionable.length).toBe(1);
    expect(result.actionable[0].validationResult.status).toBe(ARB_STATUS.ACTIONABLE);
    expect(result.rejected.length + result.monitor.length).toBe(1);
  });
});
