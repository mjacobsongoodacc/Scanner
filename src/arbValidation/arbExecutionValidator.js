/**
 * ArbExecutionValidator — Main pipeline: theoretical arb → execution-aware status
 * Runs after findArbs. Does NOT modify stake-sizing math.
 */

import { getValidationConfig } from "./arbValidationConfig.js";
import { scoreArbConfidence } from "./arbConfidenceScorer.js";
import { evaluateQuoteQuality } from "./quoteQualityEvaluator.js";

/** @type {"actionable" | "monitor" | "reject"} */
export const ARB_STATUS = {
  ACTIONABLE: "actionable",
  MONITOR: "monitor",
  REJECT: "reject",
};

/**
 * Apply slippage penalty to Kalshi decimal (worsen price = higher implied prob).
 * @param {number} decimal - Odds in decimal form
 * @param {number} slippageCents - Cents to add to ask
 * @returns {number|null} Worse decimal (lower) or null
 */
function applySlippageToDecimal(decimal, slippageCents) {
  if (!decimal || decimal <= 1 || slippageCents <= 0) return decimal;
  const cents = Math.round(100 / decimal);
  const worseCents = Math.min(99, cents + slippageCents);
  return 100 / worseCents;
}

/**
 * Compute execution-adjusted margin using slippage on exchange leg.
 * @param {Object} arb - Raw arb
 * @param {number} slippageCents - From QuoteQualityEvaluator
 * @returns {{ executionAdjustedImpSum: number, executionAdjustedRoi: number, stillArb: boolean }}
 */
function computeExecutionAdjustedMargin(arb, slippageCents) {
  if (slippageCents <= 0) {
    return {
      executionAdjustedImpSum: arb.impSum,
      executionAdjustedRoi: arb.roi,
      stillArb: arb.impSum < 1,
    };
  }

  const isKalshiA = arb.bookA === "Kalshi";
  const isKalshiB = arb.bookB === "Kalshi";
  let decA = arb.decimalA;
  let decB = arb.decimalB;

  if (isKalshiA) decA = applySlippageToDecimal(decA, slippageCents);
  if (isKalshiB) decB = applySlippageToDecimal(decB, slippageCents);
  if (!decA || !decB) {
    return { executionAdjustedImpSum: arb.impSum, executionAdjustedRoi: arb.roi, stillArb: false };
  }

  const executionAdjustedImpSum = 1 / decA + 1 / decB;
  const executionAdjustedRoi = (1 - executionAdjustedImpSum) * 100;
  const stillArb = executionAdjustedImpSum < 1;

  return {
    executionAdjustedImpSum,
    executionAdjustedRoi,
    stillArb,
  };
}

/**
 * Validate a single arb and assign status.
 * @param {Object} arb - Raw arb from findArbs
 * @returns {Object} Arb with validationResult attached
 */
export function validateArb(arb) {
  const config = getValidationConfig();
  const isKalshi = !!arb.kalshiTicker;

  const confidenceResult = scoreArbConfidence(arb);
  const { score, reasons, slippageCents } = confidenceResult;

  const { executionAdjustedImpSum, executionAdjustedRoi, stillArb } = computeExecutionAdjustedMargin(
    arb,
    slippageCents ?? 0
  );

  let status = ARB_STATUS.REJECT;
  const statusReasons = [...reasons];

  if (isKalshi) {
    const quality = evaluateQuoteQuality({
      volume: arb.kalshiVolume ?? 0,
      baSpreadCents: arb.kalshiBaSpread ?? 99,
    });
    if (!quality.pass) {
      statusReasons.unshift("Exchange leg fails liquidity/spread filter");
    }
  }

  if (!stillArb && arb.impSum < 1) {
    statusReasons.unshift("Execution-adjusted margin eliminates arb edge");
  }

  if (score >= config.minConfidenceActionable && stillArb) {
    if (isKalshi) {
      const quality = evaluateQuoteQuality({
        volume: arb.kalshiVolume ?? 0,
        baSpreadCents: arb.kalshiBaSpread ?? 99,
      });
      if (quality.pass) {
        status = ARB_STATUS.ACTIONABLE;
        statusReasons.unshift("Actionable: executable edge confirmed");
      } else {
        status = ARB_STATUS.MONITOR;
        statusReasons.unshift("Monitor: liquidity below ideal but margin exists");
      }
    } else {
      status = ARB_STATUS.ACTIONABLE;
      statusReasons.unshift("Actionable: book vs book, firm quotes");
    }
  } else if (score >= config.minConfidenceMonitor && stillArb) {
    status = ARB_STATUS.MONITOR;
    if (!statusReasons[0]?.startsWith("Monitor:")) {
      statusReasons.unshift("Monitor: wide spread and/or low volume");
    }
  } else {
    status = ARB_STATUS.REJECT;
    if (!statusReasons.some((r) => r.toLowerCase().includes("reject"))) {
      statusReasons.unshift(
        stillArb
          ? "Rejected: exchange quote quality below threshold"
          : "Rejected: stale or non-executable exchange quote"
      );
    }
  }

  return {
    ...arb,
    validationResult: {
      status,
      confidenceScore: score,
      theoreticalMargin: arb.roi,
      executionAdjustedMargin: executionAdjustedRoi,
      theoreticalImpSum: arb.impSum,
      executionAdjustedImpSum,
      stillArbAfterAdjustment: stillArb,
      reasons: statusReasons,
      slippageCents,
    },
  };
}

/**
 * Run validation pipeline on raw arbs. Splits into actionable / monitor / reject.
 * @param {Object[]} rawArbs - From findArbs
 * @returns {{ actionable: Object[], monitor: Object[], rejected: Object[], all: Object[] }}
 */
export function validateArbs(rawArbs) {
  if (!rawArbs || !Array.isArray(rawArbs)) {
    return { actionable: [], monitor: [], rejected: [], all: [] };
  }

  const actionable = [];
  const monitor = [];
  const rejected = [];

  for (const arb of rawArbs) {
    const validated = validateArb(arb);
    validated.validationResult.status === ARB_STATUS.ACTIONABLE && actionable.push(validated);
    validated.validationResult.status === ARB_STATUS.MONITOR && monitor.push(validated);
    validated.validationResult.status === ARB_STATUS.REJECT && rejected.push(validated);
  }

  return {
    actionable,
    monitor,
    rejected,
    all: [...actionable, ...monitor, ...rejected],
  };
}
