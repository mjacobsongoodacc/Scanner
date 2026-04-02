import { useState, useEffect } from "react";
import { usePaperTrading } from "./PaperTradingContext.jsx";

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
    const of_ = parseFloat(otherFixed);
    const b = parseFloat(bankroll);
    pt.updateSettings({
      creditCardFeePct: isNaN(cc) ? 2 : cc,
      kalshiFeePerContract: isNaN(k) ? 0.017 : k,
      otherPlatformFeePct: isNaN(op) ? 0 : op,
      otherPlatformFeeFixed: isNaN(of_) ? 0 : of_,
    });
    if (!isNaN(b) && b >= 0) pt.updateBankroll(b);
  }

  const fields = [
    { label: "CC Deposit Fee (%)", value: ccFee, onChange: setCcFee, step: 0.5 },
    { label: "Kalshi Fee ($/ct)", value: kalshiFee, onChange: setKalshiFee, step: 0.001 },
    { label: "Other Fee (%)", value: otherPct, onChange: setOtherPct, step: 0.1 },
    { label: "Other Fee ($)", value: otherFixed, onChange: setOtherFixed, step: 0.01 },
    { label: "Bankroll ($)", value: bankroll, onChange: setBankroll, step: 100 },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16 }}>
      {fields.map((f, i) => (
        <div key={i} className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{f.label}</label>
          <input
            type="number"
            className="form-input form-input-mono"
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            onBlur={apply}
            step={f.step}
            min={0}
            style={{ width: 110 }}
          />
        </div>
      ))}
    </div>
  );
}
