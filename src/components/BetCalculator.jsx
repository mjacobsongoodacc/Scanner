import { useState, useEffect } from "react";
import { buildStakePlan, americanToDecimal, kalshiCentsToDecimal, kalshiCentsToDecimalRaw, kalshiFeePerContract } from "../arb/index.js";
import { FONT, MONO } from "../styles.js";

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
    ? {
        mode: "double",
        centsA: parseFloat(legs[0].value),
        centsB: parseFloat(legs[1].value),
      }
    : kalshiLegCount === 1
      ? {
          mode: "single",
          position: legs[0].type === "kalshi" ? "A" : "B",
          cents: parseFloat(legs[0].type === "kalshi" ? legs[0].value : legs[1].value),
        }
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

  const inputStyle = {
    width: "100%", padding: "10px 12px", background: "#0a0a0a",
    border: "1px solid #2a2a2a", borderRadius: 4, color: "#e0e0e0",
    fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 12, color: "#666", marginBottom: 5, fontWeight: 500 };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 600, marginBottom: 6 }}>Bet Calculator</div>
        <div style={{ fontSize: 12, color: "#666" }}>Enter two opposing bets to check for arbitrage. Kalshi legs use exact whole-contract sizing with aggregate taker fees.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        {legs.map((leg, i) => (
          <div key={i} style={{ padding: 16, background: "#111", border: "1px solid #1a1a1a", borderRadius: 4 }}>
            <div style={{ fontSize: 12, color: i === 0 ? "#5a9e6f" : "#5a8fae", fontWeight: 600, marginBottom: 14 }}>{leg.label}</div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Platform</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["kalshi", "sportsbook"].map(t => (
                  <button key={t} onClick={() => updateLeg(i, "type", t)}
                    style={{
                      flex: 1, padding: "8px 0",
                      background: leg.type === t ? (t === "kalshi" ? "#2a5a6e" : "#2a6e3f") : "#0a0a0a",
                      border: `1px solid ${leg.type === t ? (t === "kalshi" ? "#2a5a6e" : "#2a6e3f") : "#2a2a2a"}`,
                      borderRadius: 4,
                      color: leg.type === t ? "#fff" : "#666",
                      fontSize: 11, fontFamily: FONT, cursor: "pointer",
                      fontWeight: leg.type === t ? 600 : 400,
                      textTransform: "capitalize",
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>{leg.type === "kalshi" ? "Price (cents, 1-99)" : "American Odds (e.g. -110, +150)"}</label>
              <input type="text" value={leg.value} onChange={e => updateLeg(i, "value", e.target.value)}
                placeholder={leg.type === "kalshi" ? "e.g. 45" : "e.g. -110"}
                style={inputStyle} />
            </div>

            {leg.type === "kalshi" && parseFloat(leg.value) > 0 && parseFloat(leg.value) < 100 && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#555", fontFamily: MONO }}>
                Fee: ${kalshiFeePerContract(parseFloat(leg.value)).toFixed(2)}/ct
                {" | "}Cost: {(parseFloat(leg.value)/100 + kalshiFeePerContract(parseFloat(leg.value))).toFixed(4)}
                {" | "}Raw: {kalshiCentsToDecimalRaw(parseFloat(leg.value))?.toFixed(3)}
                {" | "}Adj: {kalshiCentsToDecimal(parseFloat(leg.value))?.toFixed(3)}
              </div>
            )}
            {leg.type === "sportsbook" && parseFloat(leg.value) && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#555", fontFamily: MONO }}>
                Dec: {americanToDecimal(parseFloat(leg.value))?.toFixed(3)}
                {" | "}Impl: {(100 / americanToDecimal(parseFloat(leg.value))).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Total Stake ($)</label>
        <input type="number" value={stake} onChange={e => setStake(e.target.value)} style={{ ...inputStyle, width: 160 }} />
      </div>

      {hasResult && (
        <div style={{ padding: 20, background: "#111", border: `1px solid ${isArb ? "#2a4a2a" : impSum < 1.03 ? "#3a2a00" : "#1a1a1a"}`, borderRadius: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: isArb ? "#5a9e6f" : "#c89030", fontWeight: 600, marginBottom: 4 }}>
                {isArb ? "Arbitrage Found" : "No Arbitrage"}
              </div>
              <div style={{ fontSize: 13, color: "#bbb" }}>
                Implied sum: <span style={{ color: isArb ? "#5a9e6f" : "#c89030", fontWeight: 600, fontFamily: MONO }}>{impSum.toFixed(6)}</span>
                {rawImpSum && Math.abs(rawImpSum - impSum) > 0.0001 && (
                  <span style={{ color: "#555", marginLeft: 8, fontFamily: MONO }}>(pre-fee: {rawImpSum.toFixed(6)})</span>
                )}
                {unusedStake > 0.009 && (
                  <span style={{ color: "#555", marginLeft: 8, fontFamily: MONO }}>(idle: ${unusedStake.toFixed(2)})</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, color: isArb ? "#5a9e6f" : roi > -3 ? "#c89030" : "#555", fontWeight: 400, fontFamily: MONO }}>
                {roi > 0 ? "+" : ""}{roi.toFixed(2)}%
              </div>
              <div style={{ fontSize: 12, color: isArb ? "#5a9e6f" : "#555" }}>
                {isArb ? `$${profit.toFixed(2)} guaranteed` : `${((impSum - 1) * 100).toFixed(2)}% from arb`}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, fontSize: 12 }}>
            {[
              { label: "Bet on A", value: `$${betA.toFixed(2)}`, color: "#e0e0e0" },
              { label: "Bet on B", value: `$${betB.toFixed(2)}`, color: "#e0e0e0" },
              { label: "Payout if A", value: `$${payoutA.toFixed(2)}`, color: isArb ? "#5a9e6f" : "#bbb" },
              { label: "Payout if B", value: `$${payoutB.toFixed(2)}`, color: isArb ? "#5a9e6f" : "#bbb" },
            ].map((item, i) => (
              <div key={i} style={{ padding: 10, background: "#0a0a0a", borderRadius: 4, border: "1px solid #1a1a1a" }}>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 4, fontWeight: 500 }}>{item.label}</div>
                <div style={{ color: item.color, fontWeight: 500, fontFamily: MONO }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 16, fontSize: 11, color: "#555", fontFamily: MONO, flexWrap: "wrap" }}>
            <span>A: {displayDecA.toFixed(4)}{feeA > 0 ? ` (adj)` : ""}</span>
            <span>B: {displayDecB.toFixed(4)}{feeB > 0 ? ` (adj)` : ""}</span>
            <span>Imp A: {(100 / displayDecA).toFixed(1)}%</span>
            <span>Imp B: {(100 / displayDecB).toFixed(1)}%</span>
            <span>Used: ${usedStake.toFixed(2)}</span>
            {exactKalshiLeg?.mode === "single" && <span>Contracts: {exactKalshiLeg.position === "A" ? stakePlan?.kalshiContractsA : stakePlan?.kalshiContractsB}</span>}
            {exactKalshiLeg?.mode === "double" && <span>Contracts: A {stakePlan?.kalshiContractsA} | B {stakePlan?.kalshiContractsB}</span>}
          </div>
        </div>
      )}

      {!hasResult && (
        <div style={{ padding: 28, background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#555" }}>
            {exactSizingUnavailable ? "Stake is too small to buy even one Kalshi contract and hedge it exactly" : "Enter valid odds for both legs to see results"}
          </div>
          <div style={{ fontSize: 12, color: "#333", marginTop: 6 }}>
            Kalshi: contract price in cents (1-99) | Sportsbook: American odds (e.g. -110, +150)
          </div>
        </div>
      )}
    </div>
  );
}
