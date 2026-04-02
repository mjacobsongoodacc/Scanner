/**
 * ArbConfidenceScorer — Computes 0-100 confidence score from multiple factors
 * Used to separate actionable from monitor from reject.
 */

import { getValidationConfig } from "./arbValidationConfig.js";
import { evaluateQuoteQuality } from "./quoteQualityEvaluator.js";

/**
 * @typedef {Object} ConfidenceResult
 * @property {number} score - 0-100
 * @property {string[]} reasons - Explanations for score components
 */

/**
 * Score confidence for an arb opportunity.
 * @param {Object} arb - Raw arb from findArbs
 * @param {Object} [params] - Extra context
 * @param {Object[]} [params.bookOddsForGame] - All book odds for this game (for consensus)
 * @returns {ConfidenceResult}
 */
export function scoreArbConfidence(arb, params = {}) {
  const config = getValidationConfig();
  const reasons = [];
  let score = 100;

  const isKalshi = !!arb.kalshiTicker;
  const vol = arb.kalshiVolume ?? 0;
  const baSpread = arb.kalshiBaSpread ?? 99;

  if (!isKalshi) {
    // Sportsbook-vs-sportsbook: generally executable, minor penalty for cross-book variance
    reasons.push("Book vs book: firm quotes, high fill probability");
    return { score: 95, reasons, slippageCents: 0 };
  }

  // Kalshi leg: apply quality evaluation
  const quality = evaluateQuoteQuality({
    volume: vol,
    baSpreadCents: baSpread,
  });

  reasons.push(...quality.warnings);

  if (vol < config.minVolume) {
    score -= 35;
  } else if (vol < config.volumeWarningThreshold) {
    score -= 15;
  }

  if (baSpread > config.maxBaSpreadCents) {
    score -= 30;
  } else if (baSpread > config.spreadWarningCents) {
    score -= 10;
  }

  if (arb.roi > config.maxPlausibleRoiPct) {
    score -= 25;
    reasons.push(`Unusually high ROI (${arb.roi.toFixed(1)}%) — likely stale or phantom`);
  } else if (arb.roi > 3) {
    score -= 5;
  }

  if (quality.slippageCents > 0) {
    reasons.push(`Execution penalty: +${quality.slippageCents}c slippage estimate`);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  if (finalScore >= 70) reasons.unshift("Executable: liquidity and spread acceptable");
  else if (finalScore >= 40) reasons.unshift("Monitor: verify quotes before acting");
  else reasons.unshift("Rejected: poor execution probability");

  return {
    score: finalScore,
    reasons,
    slippageCents: quality.slippageCents,
  };
}
