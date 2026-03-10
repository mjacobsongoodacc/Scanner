/**
 * Paper Trading Settings — fee inputs, bankroll
 */

import { useState, useEffect } from "react";
import { usePaperTrading } from "./PaperTradingContext.jsx";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function PaperTradingSettings() {
  const pt = usePaperTrading();
  const [ccFee, setCcFee] = useState(String(pt.settings.creditCardFeePct ?? 2));
  const [kalshiFee, setKalshiFee] = useState(String(pt.settings.kalshiFeePerContract ?? 0.017));
  const [otherPct, setOtherPct] = useState(String(pt.settings.otherPlatformFeePct ?? 0));
  const [otherFixed, setOtherFixed] = useState(String(pt.settings.otherPlatformFeeFixed ?? 0));
  const [bankroll, setBankroll] = useState(String(pt.bankroll ?? 1000));

  useEffect(() => {
    setCcFee(String(pt.settings.creditCardFeePct ?? 2));
    setKalshiFee(String(pt.settings.kalshiFeePerContract ?? 0.017));
    setOtherPct(String(pt.settings.otherPlatformFeePct ?? 0));
    setOtherFixed(String(pt.settings.otherPlatformFeeFixed ?? 0));
    setBankroll(String(pt.bankroll ?? 1000));
  }, [pt.settings, pt.bankroll]);

  function apply() {
    const cc = parseFloat(ccFee);
    const k = parseFloat(kalshiFee);
    const op = parseFloat(otherPct);
    const of = parseFloat(otherFixed);
    const b = parseFloat(bankroll);
    pt.updateSettings({
      creditCardFeePct: isNaN(cc) ? 2 : cc,
      kalshiFeePerContract: isNaN(k) ? 0.017 : k,
      otherPlatformFeePct: isNaN(op) ? 0 : op,
      otherPlatformFeeFixed: isNaN(of) ? 0 : of,
    });
    if (!isNaN(b) && b >= 0) pt.updateBankroll(b);
  }

  const inputStyle = {
    width: 100,
    padding: "6px 10px",
    background: "#0a0a0a",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    color: "#e0e0e0",
    fontSize: 12,
    fontFamily: "'SF Mono', monospace",
    outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 11, color: "#666", marginBottom: 4, display: "block", fontWeight: 500 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16 }}>
      <div>
        <label style={labelStyle}>Credit card deposit fee (%)</label>
        <input type="number" value={ccFee} onChange={(e) => setCcFee(e.target.value)} onBlur={apply} step={0.5} min={0} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Kalshi fee ($/contract)</label>
        <input type="number" value={kalshiFee} onChange={(e) => setKalshiFee(e.target.value)} onBlur={apply} step={0.001} min={0} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Other platform fee (%)</label>
        <input type="number" value={otherPct} onChange={(e) => setOtherPct(e.target.value)} onBlur={apply} step={0.1} min={0} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Other platform fee ($)</label>
        <input type="number" value={otherFixed} onChange={(e) => setOtherFixed(e.target.value)} onBlur={apply} step={0.01} min={0} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Virtual bankroll ($)</label>
        <input type="number" value={bankroll} onChange={(e) => setBankroll(e.target.value)} onBlur={apply} step={100} min={0} style={inputStyle} />
      </div>
    </div>
  );
}
