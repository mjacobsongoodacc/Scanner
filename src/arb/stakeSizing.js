import { decimalToAmerican } from "./oddsUtils.js";
import { kalshiTakerFee, kalshiCostForContracts } from "./kalshiUtils.js";

function sizeKalshiVsBook({ kalshiCents, bookDec, stake }) {
  if (!kalshiCents || !bookDec || !stake || stake <= 0) return null;

  const totalOutlay = contracts => {
    const kalshiCost = kalshiCostForContracts(kalshiCents, contracts);
    const bookBet = contracts / bookDec;
    return kalshiCost + bookBet;
  };

  let lo = 0;
  let hi = 1;
  while (totalOutlay(hi) <= stake) hi *= 2;

  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (totalOutlay(mid) <= stake) lo = mid;
    else hi = mid;
  }

  const contracts = lo;
  if (contracts < 1) return null;

  const fee = kalshiTakerFee(kalshiCents, contracts);
  const kalshiCost = kalshiCostForContracts(kalshiCents, contracts);
  const bookBet = contracts / bookDec;
  const usedStake = kalshiCost + bookBet;
  const profit = contracts - usedStake;

  return {
    contracts,
    fee,
    kalshiCost,
    bookBet,
    usedStake,
    unusedStake: Math.max(0, stake - usedStake),
    profit,
    payout: contracts,
    kalshiDecimal: contracts / kalshiCost,
  };
}

function sizeKalshiVsKalshi({ centsA, centsB, stake }) {
  if (!centsA || !centsB || !stake || stake <= 0) return null;

  const totalOutlay = contracts => (
    kalshiCostForContracts(centsA, contracts) + kalshiCostForContracts(centsB, contracts)
  );

  let lo = 0;
  let hi = 1;
  while (totalOutlay(hi) <= stake) hi *= 2;

  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (totalOutlay(mid) <= stake) lo = mid;
    else hi = mid;
  }

  const contracts = lo;
  if (contracts < 1) return null;

  const feeA = kalshiTakerFee(centsA, contracts);
  const feeB = kalshiTakerFee(centsB, contracts);
  const costA = kalshiCostForContracts(centsA, contracts);
  const costB = kalshiCostForContracts(centsB, contracts);
  const usedStake = costA + costB;
  const profit = contracts - usedStake;

  return {
    contracts,
    costA,
    costB,
    feeA,
    feeB,
    usedStake,
    unusedStake: Math.max(0, stake - usedStake),
    profit,
    payout: contracts,
    decimalA: contracts / costA,
    decimalB: contracts / costB,
  };
}

export function buildStakePlan({ decA, decB, stake, kalshiLeg }) {
  if (!decA || !decB || !stake || stake <= 0) return null;

  if (kalshiLeg?.mode === "double") {
    const sized = sizeKalshiVsKalshi({ centsA: kalshiLeg.centsA, centsB: kalshiLeg.centsB, stake });
    if (!sized) return null;

    const impSum = sized.usedStake / sized.payout;
    return {
      impSum,
      roi: (1 - impSum) * 100,
      betA: sized.costA,
      betB: sized.costB,
      payoutA: sized.payout,
      payoutB: sized.payout,
      profit: sized.profit,
      usedStake: sized.usedStake,
      unusedStake: sized.unusedStake,
      decimalA: sized.decimalA,
      decimalB: sized.decimalB,
      americanA: decimalToAmerican(sized.decimalA),
      americanB: decimalToAmerican(sized.decimalB),
      kalshiContractsA: sized.contracts,
      kalshiContractsB: sized.contracts,
      kalshiFeeA: sized.feeA,
      kalshiFeeB: sized.feeB,
    };
  }

  if (!kalshiLeg) {
    const impSum = 1 / decA + 1 / decB;
    const betA = ((1 / decA) / impSum) * stake;
    const betB = ((1 / decB) / impSum) * stake;
    const payoutA = betA * decA;
    const payoutB = betB * decB;
    const profit = Math.min(payoutA, payoutB) - stake;

    return {
      impSum,
      roi: (1 - impSum) * 100,
      betA,
      betB,
      payoutA,
      payoutB,
      profit,
      usedStake: stake,
      unusedStake: 0,
      decimalA: decA,
      decimalB: decB,
      americanA: null,
      americanB: null,
      kalshiContractsA: null,
      kalshiContractsB: null,
      kalshiFeeA: null,
      kalshiFeeB: null,
    };
  }

  const sized = sizeKalshiVsBook({
    kalshiCents: kalshiLeg.cents,
    bookDec: kalshiLeg.position === "A" ? decB : decA,
    stake,
  });
  if (!sized) return null;

  const impSum = sized.usedStake / sized.payout;
  const common = {
    impSum,
    roi: (1 - impSum) * 100,
    profit: sized.profit,
    usedStake: sized.usedStake,
    unusedStake: sized.unusedStake,
  };

  if (kalshiLeg.position === "A") {
    return {
      ...common,
      betA: sized.kalshiCost,
      betB: sized.bookBet,
      payoutA: sized.payout,
      payoutB: sized.payout,
      decimalA: sized.kalshiDecimal,
      decimalB: decB,
      americanA: decimalToAmerican(sized.kalshiDecimal),
      americanB: null,
      kalshiContractsA: sized.contracts,
      kalshiContractsB: null,
      kalshiFeeA: sized.fee,
      kalshiFeeB: null,
    };
  }

  return {
    ...common,
    betA: sized.bookBet,
    betB: sized.kalshiCost,
    payoutA: sized.payout,
    payoutB: sized.payout,
    decimalA: decA,
    decimalB: sized.kalshiDecimal,
    americanA: null,
    americanB: decimalToAmerican(sized.kalshiDecimal),
    kalshiContractsA: null,
    kalshiContractsB: sized.contracts,
    kalshiFeeA: null,
    kalshiFeeB: sized.fee,
  };
}
