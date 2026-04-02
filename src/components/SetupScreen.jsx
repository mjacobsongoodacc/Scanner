import { useState } from "react";
import { SPORT_CONFIG } from "../arb/constants.js";
import { Zap, ArrowRight, ExternalLink } from "lucide-react";

const SPORT_OPTIONS = Object.entries(SPORT_CONFIG).map(([value, { label }]) => ({ value, label }));

export default function SetupScreen({ onStart }) {
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_ODDS_API_KEY ?? "");
  const [sport, setSport] = useState("nba");
  const [stake, setStake] = useState("100");

  function handleCardMove(e) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--shadow-x", `${-px * 28}px`);
    el.style.setProperty("--shadow-y", `${-py * 28 + 12}px`);
  }

  function handleCardLeave(e) {
    const el = e.currentTarget;
    el.style.setProperty("--shadow-x", "0px");
    el.style.setProperty("--shadow-y", "12px");
  }

  return (
    <div className="auth-page">
      <div className="auth-mesh" aria-hidden />
      <div className="auth-card-outer on-setup">
        <div
          className="auth-card wide"
          onMouseMove={handleCardMove}
          onMouseLeave={handleCardLeave}
        >
          <div className="auth-brand">
            <div className="setup-brand-block">
              <div className="setup-brand-mark" aria-hidden>
                <Zap size={20} color="var(--accent-on-accent)" strokeWidth={2.25} />
              </div>
              <h1 className="auth-wordmark tracking-display">Arbitrage Scanner</h1>
              <p>
                Kalshi + Multi-Book <span className="brand-accent">Cross-Exchange</span> Arbitrage
              </p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="setup-api">
              The Odds API Key
            </label>
            <input
              id="setup-api"
              type="text"
              className="form-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key here"
            />
          </div>

          <div className="form-row" style={{ marginBottom: 28 }}>
            <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
              <label className="form-label" htmlFor="setup-sport">
                League
              </label>
              <select
                id="setup-sport"
                className="form-select"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
              >
                {SPORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label" htmlFor="setup-stake">
                Stake ($)
              </label>
              <input
                id="setup-stake"
                type="number"
                className="form-input form-input-mono"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-primary-full"
            onClick={() => apiKey && onStart({ apiKey, sport, stake: parseFloat(stake) || 100 })}
            disabled={!apiKey}
          >
            Start Scanner <ArrowRight size={15} />
          </button>

          <div className="info-card">
            <p className="setup-info-stack">
              <span className="setup-info-row">
                <ExternalLink size={12} className="setup-info-icon" aria-hidden />
                <span>
                  Get a free API key at{" "}
                  <a href="https://the-odds-api.com" target="_blank" rel="noopener noreferrer">
                    the-odds-api.com
                  </a>{" "}
                  — 500 requests/month
                </span>
              </span>
              <span className="setup-info-note">
                Kalshi spreads fetched via authenticated proxy. Compares vs DraftKings, FanDuel, BetMGM, and more.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
