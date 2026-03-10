import { useState } from "react";
import { FONT } from "../styles.js";
import { SPORT_CONFIG } from "../arb/constants.js";

const SPORT_OPTIONS = Object.entries(SPORT_CONFIG).map(([value, { label }]) => ({ value, label }));

export default function SetupScreen({ onStart }) {
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_ODDS_API_KEY ?? "");
  const [sport, setSport] = useState("nba");
  const [stake, setStake] = useState("100");

  const inputStyle = {
    width: "100%", padding: "10px 12px", background: "#0a0a0a",
    border: "1px solid #2a2a2a", borderRadius: 4, color: "#e0e0e0",
    fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ width: 440, padding: "40px 36px", background: "#111", borderRadius: 6, border: "1px solid #1e1e1e" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, color: "#e0e0e0", margin: 0, fontWeight: 600 }}>Arbitrage Scanner</h1>
          <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>Kalshi + Multi-Book Cross-Exchange</div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>The Odds API Key</label>
          <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="Get free key at the-odds-api.com" style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>League</label>
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              style={{
                ...inputStyle,
                padding: "9px 12px",
                cursor: "pointer",
                width: "100%",
              }}
            >
              {SPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 120 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>Stake ($)</label>
            <input type="number" value={stake} onChange={e => setStake(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <button onClick={() => apiKey && onStart({ apiKey, sport, stake: parseFloat(stake) || 100 })} disabled={!apiKey}
          style={{
            width: "100%", padding: 12,
            background: apiKey ? "#2a6e3f" : "#1a1a1a",
            border: "none", borderRadius: 4,
            color: apiKey ? "#fff" : "#555",
            fontSize: 14, fontFamily: FONT, fontWeight: 600,
            cursor: apiKey ? "pointer" : "default",
          }}>
          Start Scanner
        </button>
        <div style={{ marginTop: 20, padding: 14, background: "#0c0c0c", borderRadius: 4, border: "1px solid #1e1e1e" }}>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
            1. Get a free API key at <span style={{ color: "#5a9e6f" }}>the-odds-api.com</span> (500 req/mo)<br/>
            2. Kalshi game spreads fetched via authenticated proxy<br/>
            3. Scanner compares Kalshi spreads vs DraftKings, FanDuel, BetMGM, etc.
          </div>
        </div>
      </div>
    </div>
  );
}
