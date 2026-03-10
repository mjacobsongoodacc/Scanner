/**
 * Arb Execution Validation — Configurable thresholds
 * Conservative defaults: favor false negatives over false positives.
 */

export const ARB_VALIDATION_CONFIG = {
  // Liquidity (Kalshi exchange legs)
  minVolume: 500,
  maxBaSpreadCents: 3,
  volumeWarningThreshold: 1000,
  spreadWarningCents: 2,

  // Confidence scoring (0-100)
  minConfidenceActionable: 70,
  minConfidenceMonitor: 40,

  // Slippage / execution penalty (when depth unknown)
  // Applied as extra cents to Kalshi ask when volume thin or spread wide
  slippagePenaltyThinVolume: 1,
  slippagePenaltyWideSpread: 0.5,

  // ROI sanity (suspicious if theoretical arb ROI exceeds this)
  maxPlausibleRoiPct: 5,

  // Consensus deviation (Kalshi implied % vs book consensus)
  // If Kalshi implied prob differs from book consensus by more than this, flag as outlier
  maxConsensusDeviationPct: 8,
};

export function getValidationConfig(overrides = {}) {
  return { ...ARB_VALIDATION_CONFIG, ...overrides };
}
