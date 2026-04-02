import { useState, useEffect } from "react";
import { buildStakePlan, americanToDecimal, kalshiCentsToDecimal, kalshiCentsToDecimalRaw, kalshiFeePerContract } from "../arb/index.js";
import { Calculator, TrendingUp, AlertTriangle } from "lucide-react";

export default function BetCalculator({ stake: defaultStake }) {
  const [legs, setLegs] = useState([
    { type: "kalshi", value: "", label: "Leg A" },
    { type: "sportsbook", value: "", label: "Leg B" },
  ]);
  const [stake, setStake] = useState(String(defaultStake || 100));

  useEffect(() => {
    setStake(String(defaultStake || 100));
  }, [defaultStake]);

  function updateLeg(idx, field, val) {
    setLegs(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  }

  function getDecimal(leg) {
    const v = parseFloat(leg.value);
    if (isNaN(v)) return null;
    if (leg.type === "kalshi") return kalshiCentsToDecimal(v);
    return americanToDecimal(v);
  }

  function getRawDecimal(leg) {
    const v = parseFloat(leg.value);
    if (isNaN(v)) return null;
    if (leg.type === "kalshi") return kalshiCentsToDecimalRaw(v);
    return americanToDecimal(v);
  }

  const decA = getDecimal(legs[0]);
  const decB = getDecimal(legs[1]);
  const rawA = getRawDecimal(legs[0]);
  const rawB = getRawDecimal(legs[1]);
  const s = parseFloat(stake) || 100;
  const hasOdds = !!(decA && decB);
  const kalshiLegCount = legs.filter(leg => leg.type === "kalshi").length;
  const exactKalshiLeg = kalshiLegCount === 2
    ? { mode: "double", centsA: parseFloat(legs[0].value), centsB: parseFloat(legs[1].value) }
    : kalshiLegCount === 1
      ? { mode: "single", position: legs[0].type === "kalshi" ? "A" : "B", cents: parseFloat(legs[0].type === "kalshi" ? legs[0].value : legs[1].value) }
      : null;
  const stakePlan = hasOdds ? buildStakePlan({ decA, decB, stake: s, kalshiLeg: exactKalshiLeg }) : null;
  const exactSizingUnavailable = hasOdds && !!exactKalshiLeg && !stakePlan;
  const hasResult = hasOdds && !exactSizingUnavailable;
  const displayDecA = stakePlan?.decimalA ?? decA;
  const displayDecB = stakePlan?.decimalB ?? decB;
  const impSum = stakePlan?.impSum ?? (hasResult ? 1 / decA + 1 / decB : null);
  const rawImpSum = rawA && rawB ? 1 / rawA + 1 / rawB : null;
  const roi = stakePlan?.roi ?? (impSum ? (1 - impSum) * 100 : null);
  const betA = stakePlan?.betA ?? (hasResult ? ((1 / decA) / impSum) * s : null);
  const betB = stakePlan?.betB ?? (hasResult ? ((1 / decB) / impSum) * s : null);
  const payoutA = stakePlan?.payoutA ?? (hasResult ? betA * decA : null);
  const payoutB = stakePlan?.payoutB ?? (hasResult ? betB * decB : null);
  const usedStake = stakePlan?.usedStake ?? s;
  const unusedStake = stakePlan?.unusedStake ?? 0;
  const profit = stakePlan?.profit ?? (hasResult ? Math.min(payoutA, payoutB) - s : null);
  const isArb = impSum && impSum < 1;
  const feeA = legs[0].type === "kalshi" && parseFloat(legs[0].value) ? kalshiFeePerContract(parseFloat(legs[0].value)) : 0;
  const feeB = legs[1].type === "kalshi" && parseFloat(legs[1].value) ? kalshiFeePerContract(parseFloat(legs[1].value)) : 0;

  return (
    <div className="calculator">
      <div className="calc-header">
        <h2 className="calc-heading-row">
          <Calculator size={16} className="calc-heading-icon" aria-hidden />
          Bet Calculator
        </h2>
        <p>Enter two opposing bets to check for arbitrage. Kalshi legs use exact whole-contract sizing with aggregate taker fees.</p>
      </div>

      <div className="calc-legs">
        {legs.map((leg, i) => (
          <div key={i} className="calc-leg">
            <div className="calc-leg-label" style={{ color: i === 0 ? "var(--green)" : "var(--blue)" }}>
              {leg.label}
            </div>
            <div className="form-group">
              <label className="form-label">Platform</label>
              <div className="platform-toggle">
                {["kalshi", "sportsbook"].map(t => (
                  <button key={t} onClick={() => updateLeg(i, "type", t)}
                    className="platform-btn"
                    style={{
                      background: leg.type === t ? (t === "kalshi" ? "var(--cyan-dim)" : "var(--green-dim)") : "var(--bg-input)",
                      borderColor: leg.type === t ? (t === "kalshi" ? "var(--cyan-border)" : "var(--green-border)") : "var(--border-default)",
                      color: leg.type === t ? (t === "kalshi" ? "var(--cyan)" : "var(--green)") : "var(--text-dim)",
                      fontWeight: leg.type === t ? 600 : 470,
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{leg.type === "kalshi" ? "Price (cents, 1-99)" : "American Odds"}</label>
              <input
                type="text"
                className="form-input form-input-mono"
                value={leg.value}
                onChange={e => updateLeg(i, "value", e.target.value)}
                placeholder={leg.type === "kalshi" ? "e.g. 45" : "e.g. -110"}
              />
            </div>
            {leg.type === "kalshi" && parseFloat(leg.value) > 0 && parseFloat(leg.value) < 100 && (
              <div className="type-mono" style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>
                Fee: ${kalshiFeePerContract(parseFloat(leg.value)).toFixed(2)}/ct
                {" · "}Cost: {(parseFloat(leg.value)/100 + kalshiFeePerContract(parseFloat(leg.value))).toFixed(4)}
                {" · "}Raw: {kalshiCentsToDecimalRaw(parseFloat(leg.value))?.toFixed(3)}
                {" · "}Adj: {kalshiCentsToDecimal(parseFloat(leg.value))?.toFixed(3)}
              </div>
            )}
            {leg.type === "sportsbook" && parseFloat(leg.value) && (
              <div className="type-mono" style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>
                Dec: {americanToDecimal(parseFloat(leg.value))?.toFixed(3)}
                {" · "}Impl: {(100 / americanToDecimal(parseFloat(leg.value))).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label">Total Stake ($)</label>
        <input type="number" className="form-input form-input-mono" value={stake} onChange={e => setStake(e.target.value)} style={{ width: 160 }} />
      </div>

      {hasResult && (
        <div className={`calc-result${isArb ? " arb" : ""}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: isArb ? "var(--green)" : "var(--amber)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                {isArb ? <TrendingUp size={14} /> : <AlertTriangle size={14} />}
                {isArb ? "Arbitrage Found" : "No Arbitrage"}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Implied sum:{" "}
                <span className="type-mono" style={{ color: isArb ? "var(--green)" : "var(--amber)", fontWeight: 600 }}>
                  {impSum.toFixed(6)}
                </span>
                {rawImpSum && Math.abs(rawImpSum - impSum) > 0.0001 && (
                  <span className="type-mono" style={{ color: "var(--text-dim)", marginLeft: 8 }}>
                    (pre-fee: {rawImpSum.toFixed(6)})
                  </span>
                )}
                {unusedStake > 0.009 && (
                  <span className="type-mono" style={{ color: "var(--text-dim)", marginLeft: 8 }}>
                    (idle: ${unusedStake.toFixed(2)})
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                className="type-mono"
                style={{
                  fontSize: 26,
                  color: isArb ? "var(--green)" : roi > -3 ? "var(--amber)" : "var(--text-dim)",
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                }}
              >
                {roi > 0 ? "+" : ""}{roi.toFixed(2)}%
              </div>
              <div style={{ fontSize: 12, color: isArb ? "var(--green)" : "var(--text-dim)" }}>
                {isArb ? `$${profit.toFixed(2)} guaranteed` : `${((impSum - 1) * 100).toFixed(2)}% from arb`}
              </div>
            </div>
          </div>

          <div className="calc-result-grid">
            {[
              { label: "Bet on A", value: `$${betA.toFixed(2)}`, color: "var(--text-primary)" },
              { label: "Bet on B", value: `$${betB.toFixed(2)}`, color: "var(--text-primary)" },
              { label: "Payout if A", value: `$${payoutA.toFixed(2)}`, color: isArb ? "var(--green)" : "var(--text-secondary)" },
              { label: "Payout if B", value: `$${payoutB.toFixed(2)}`, color: isArb ? "var(--green)" : "var(--text-secondary)" },
            ].map((item, i) => (
              <div key={i} className="calc-result-item">
                <div className="label">{item.label}</div>
                <div className="value" style={{ color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div className="type-mono" style={{ marginTop: 16, display: "flex", gap: 14, fontSize: 11, color: "var(--text-dim)", flexWrap: "wrap" }}>
            <span>A: {displayDecA.toFixed(4)}{feeA > 0 ? " (adj)" : ""}</span>
            <span>B: {displayDecB.toFixed(4)}{feeB > 0 ? " (adj)" : ""}</span>
            <span>Imp A: {(100 / displayDecA).toFixed(1)}%</span>
            <span>Imp B: {(100 / displayDecB).toFixed(1)}%</span>
            <span>Used: ${usedStake.toFixed(2)}</span>
            {exactKalshiLeg?.mode === "single" && <span>Contracts: {exactKalshiLeg.position === "A" ? stakePlan?.kalshiContractsA : stakePlan?.kalshiContractsB}</span>}
            {exactKalshiLeg?.mode === "double" && <span>Contracts: A {stakePlan?.kalshiContractsA} | B {stakePlan?.kalshiContractsB}</span>}
          </div>
        </div>
      )}

      {!hasResult && (
        <div className="calc-result">
          <div className="empty-state" style={{ padding: 28 }}>
            <div className="empty-state-title">
              {exactSizingUnavailable ? "Stake too small for whole Kalshi contracts" : "Enter valid odds for both legs"}
            </div>
            <div className="empty-state-subtitle">
              Kalshi: contract price in cents (1-99) · Sportsbook: American odds (e.g. -110, +150)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
