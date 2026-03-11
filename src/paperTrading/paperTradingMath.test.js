import { describe, expect, it } from "vitest";
import { buildStakePlan } from "../arb/stakeSizing.js";
import { createPaperTrade, addToPaperTrade, settleTrade } from "./paperTradingStore.js";
import { buildPnLWorkbook } from "./exportPnLToExcel.js";

const ZERO_ADDITIONAL_FEE_SETTINGS = {
  creditCardFeePct: 0,
  kalshiFeePerContract: 0.017,
  otherPlatformFeePct: 0,
  otherPlatformFeeFixed: 0,
};

const CREDIT_CARD_FEE_SETTINGS = {
  ...ZERO_ADDITIONAL_FEE_SETTINGS,
  creditCardFeePct: 2,
};

function makeKalshiArb({ stake = 100, cents = 45, bookDec = 2.2 } = {}) {
  const plan = buildStakePlan({
    decA: 2,
    decB: bookDec,
    stake,
    kalshiLeg: { position: "A", cents },
  });

  return {
    game: "Los Angeles Lakers @ Boston Celtics",
    commence: "2026-03-11T00:00:00.000Z",
    sideA: "Kalshi YES",
    bookA: "Kalshi",
    americanA: plan.americanA,
    decimalA: plan.decimalA,
    sideB: "Under 24.5 @ FanDuel",
    bookB: "FanDuel",
    americanB: -110,
    decimalB: plan.decimalB,
    marketType: "player_points",
    impSum: plan.impSum,
    roi: plan.roi,
    betA: plan.betA,
    betB: plan.betB,
    payoutA: plan.payoutA,
    payoutB: plan.payoutB,
    usedStake: plan.usedStake,
    unusedStake: plan.unusedStake,
    profit: plan.profit,
    kalshiContractsA: plan.kalshiContractsA,
    kalshiContractsB: plan.kalshiContractsB,
    kalshiFeeA: plan.kalshiFeeA,
    kalshiFeeB: plan.kalshiFeeB,
  };
}

describe("paper trading math", () => {
  it("does not double-count Kalshi fees in settled net PnL", () => {
    const arb = makeKalshiArb();
    const trade = createPaperTrade(arb, ZERO_ADDITIONAL_FEE_SETTINGS);
    const settled = settleTrade(trade, "A", ZERO_ADDITIONAL_FEE_SETTINGS);

    expect(trade.fees.kalshi).toBeGreaterThan(0);
    expect(trade.fees.total).toBe(0);
    expect(settled.netPnl).toBeCloseTo(settled.grossPnl, 8);
  });

  it("recomputes margin after adding a new lot", () => {
    const firstArb = makeKalshiArb({ stake: 100, cents: 45, bookDec: 2.25 });
    const secondArb = makeKalshiArb({ stake: 100, cents: 45, bookDec: 2.05 });
    const trade = createPaperTrade(firstArb, ZERO_ADDITIONAL_FEE_SETTINGS);
    const updated = addToPaperTrade(trade, secondArb, ZERO_ADDITIONAL_FEE_SETTINGS);

    const expectedGrossArbPct = ((Math.min(updated.payoutA, updated.payoutB) - updated.totalStaked) / updated.totalStaked) * 100;

    expect(updated.grossArbPct).toBeCloseTo(expectedGrossArbPct, 8);
    expect(updated.grossArbPct).not.toBeCloseTo(trade.grossArbPct, 8);
  });

  it("exports additional fees separately from Kalshi fees already embedded in stake", () => {
    const arb = makeKalshiArb();
    const trade = createPaperTrade(arb, CREDIT_CARD_FEE_SETTINGS);
    const settled = settleTrade(trade, "A", CREDIT_CARD_FEE_SETTINGS);
    const wb = buildPnLWorkbook(
      [
        { ts: "2026-03-11T00:00:00.000Z", balance: 1000 },
        { ts: "2026-03-11T01:00:00.000Z", balance: 1000 + settled.netPnl },
      ],
      [settled],
      1000
    );
    const sheet = wb.Sheets["Trade PnL"];

    expect(Number(sheet.G3.v)).toBeCloseTo(Number(settled.fees.total.toFixed(2)), 8);
    expect(Number(sheet.H4.v)).toBeCloseTo(Number(settled.fees.kalshi.toFixed(2)), 8);
    expect(Number(sheet.G8.v)).toBeCloseTo(Number(settled.fees.total.toFixed(2)), 8);
    expect(Number(sheet.H8.v)).toBeCloseTo(Number(settled.fees.kalshi.toFixed(2)), 8);
    expect(Number(sheet.I8.v)).toBeCloseTo(Number(settled.netPnl.toFixed(2)), 8);
  });
});
