# Arb Execution Validation

## Root Cause

The scanner was flagging **theoretical** arbs (math checks out on displayed odds) as placeable when the exchange leg was not executable:

- Kalshi volume was thin
- Bid-ask spread was wide (e.g. 3+ cents)
- Quoted exchange line was likely stale
- Existing "low confidence" badge was cosmetic — it did not affect eligibility

**The bug was in arb qualification, not stake-sizing math.**

## Architecture

```
findArbs() → raw opps
     ↓
validateArbs() → ArbExecutionValidator pipeline
     ↓
{ actionable, monitor, rejected }
     ↓
UI: Actionable (paper-tradeable) | Monitor | Rejected (collapsible)
```

## New Modules

| File | Purpose |
|------|---------|
| `src/arbValidation/arbValidationConfig.js` | Configurable thresholds (min volume, max spread, confidence cutoffs) |
| `src/arbValidation/quoteQualityEvaluator.js` | Evaluates Kalshi quote quality → pass/fail, warnings, slippage penalty |
| `src/arbValidation/arbConfidenceScorer.js` | 0–100 confidence score from volume, spread, ROI, warnings |
| `src/arbValidation/arbExecutionValidator.js` | Main pipeline: compute executable margin, assign status, reasons |

## Config (`arbValidationConfig.js`)

```js
minVolume: 500           // Kalshi min volume
maxBaSpreadCents: 3      // Max bid-ask spread (cents)
minConfidenceActionable: 70
minConfidenceMonitor: 40
slippagePenaltyThinVolume: 1
slippagePenaltyWideSpread: 0.5
maxPlausibleRoiPct: 5
```

## Arb Status

| Status | Meaning |
|--------|---------|
| **actionable** | Executable edge confirmed — Paper Trade enabled |
| **monitor** | Wide spread and/or low volume — verify manually before acting |
| **reject** | Stale, thin, or execution-adjusted margin eliminates edge |

## UI Changes

- **Actionable** section: green, Paper Trade button enabled
- **Monitor** section: amber, no Paper Trade
- **Rejected** section: collapsible, red, shows reasons

Each arb displays:

- Theoretical margin vs execution-adjusted margin (when slippage applied)
- Confidence score
- Status label
- Reasons array (first reason prominent, rest summarized)

## Edge Cases & Future Improvements

1. **Odds API age**: No per-quote timestamp; we use cache TTL. Future: track fetch time and degrade confidence if cache is old.

2. **Order book depth**: Kalshi events API does not return depth. We apply a conservative execution penalty when volume/spread is poor. Future: call orderbook endpoint per market for exact depth.

3. **Consensus deviation**: Not implemented (would require aggregating all book odds per game). Could flag Kalshi implied prob far from book consensus.

4. **Double Kalshi arbs**: Validator treats them similar to single-Kalshi; both legs get quality checks. Current logic focuses on the leg with worse liquidity.
