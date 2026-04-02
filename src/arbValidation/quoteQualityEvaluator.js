/**
 * QuoteQualityEvaluator — Evaluates Kalshi exchange quote quality
 * Produces warnings and pass/fail flags used by arb eligibility.
 */

import { getValidationConfig } from "./arbValidationConfig.js";

/**
 * @typedef {Object} QuoteQualityResult
 * @property {boolean} pass - Meets minimum quality for actionable
 * @property {string[]} warnings - Human-readable warnings
 * @property {number} slippageCents - Additional cents to add to ask (execution penalty)
 */

/**
 * Evaluate Kalshi quote quality for one side (YES or NO).
 * @param {Object} params
 * @param {number} [params.volume] - Market volume
 * @param {number} [params.baSpreadCents] - Bid-ask spread in cents
 * @param {number} [params.askCents] - Ask price in cents (executable price for our side)
 * @returns {QuoteQualityResult}
 */
export function evaluateQuoteQuality({ volume = 0, baSpreadCents = 99, askCents = 0 }) {
  const config = getValidationConfig();
  const warnings = [];
  let slippageCents = 0;

  if (volume < config.minVolume) {
    warnings.push(`Low volume (${volume} < ${config.minVolume})`);
    slippageCents += config.slippagePenaltyThinVolume;
    if (volume < 100) {
      warnings.push("Extremely thin market — high execution risk");
      slippageCents += 1;
    }
  } else if (volume < config.volumeWarningThreshold) {
    warnings.push(`Moderate volume (${volume})`);
  }

  if (baSpreadCents > config.maxBaSpreadCents) {
    warnings.push(`Wide bid-ask spread (${baSpreadCents}c > ${config.maxBaSpreadCents}c)`);
    slippageCents += config.slippagePenaltyWideSpread;
    if (baSpreadCents > 5) {
      warnings.push("Very wide spread — quote likely stale or illiquid");
      slippageCents += 1;
    }
  } else if (baSpreadCents > config.spreadWarningCents) {
    warnings.push(`Moderate spread (${baSpreadCents}c)`);
  }

  const pass = volume >= config.minVolume && baSpreadCents <= config.maxBaSpreadCents;

  return {
    pass,
    warnings,
    slippageCents,
  };
}
