/**
 * Paper Trading Dashboard — collapsible panel, metrics, trade history
 * Matches existing dark theme (dark bg, teal/cyan accents, monospace numbers).
 */

import { useState, useMemo } from "react";
import { usePaperTrading } from "./PaperTradingContext.jsx";
import PaperTradingSettings from "./PaperTradingSettings.jsx";
import BalanceHistoryChart from "./BalanceHistoryChart.jsx";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'Consolas', monospace";

function formatAmerican(am) {
  if (am == null) return "—";
  return am > 0 ? `+${am}` : `${am}`;
}

export default function PaperTradingDashboard({ defaultExpanded = false }) {
  const pt = usePaperTrading();
  const [collapsed, setCollapsed] = useState(!defaultExpanded);
  const [showSettings, setShowSettings] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [sortDesc, setSortDesc] = useState(true);

  const metrics = useMemo(() => {
    const settled = pt.trades.filter((t) => t.status === "SETTLED");
    const grossPnl = settled.reduce((s, t) => s + (t.grossPnl ?? 0), 0);
    const feeCreditCard = settled.reduce((s, t) => s + (t.fees?.creditCard ?? 0), 0);
    const feeKalshi = settled.reduce((s, t) => s + (t.fees?.kalshi ?? 0), 0);
    const feePlatform = settled.reduce((s, t) => s + (t.fees?.platform ?? 0), 0);
    const totalFees = feeCreditCard + feeKalshi + feePlatform;
    const netPnl = grossPnl - totalFees;
    const wins = settled.filter((t) => (t.netPnl ?? 0) > 0).length;
    const winRate = settled.length ? (wins / settled.length) * 100 : 0;
    const avgMargin = settled.length ? settled.reduce((s, t) => s + (t.netArbPct ?? 0), 0) / settled.length : 0;
    const openCount = pt.trades.filter((t) => t.status === "OPEN").length;

    return {
      totalArbsFound: (pt.opportunityKeys || []).length,
      arbsPaperTraded: pt.trades.length,
      grossPnl,
      netPnl,
      feeCreditCard,
      feeKalshi,
      feePlatform,
      totalFees,
      winRate,
      avgMargin,
      bankroll: pt.bankroll,
      openCount,
    };
  }, [pt.trades, pt.bankroll, pt.opportunityKeys]);

  const sortedTrades = useMemo(() => {
    const arr = [...pt.trades];
    const sign = sortDesc ? -1 : 1;
    if (sortBy === "date") {
      arr.sort((a, b) => sign * (new Date(b.placedAt || b.detectedAt) - new Date(a.placedAt || a.detectedAt)));
    } else if (sortBy === "pnl") {
      arr.sort((a, b) => sign * ((a.netPnl ?? -999) - (b.netPnl ?? -999)));
    } else if (sortBy === "margin") {
      arr.sort((a, b) => sign * ((a.netArbPct ?? -999) - (b.netArbPct ?? -999)));
    }
    return arr;
  }, [pt.trades, sortBy, sortDesc]);

  function handleExportCSV() {
    const csv = pt.exportCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paper_trades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ marginBottom: 14, border: "1px solid #1a1a1a", borderRadius: 4, overflow: "hidden", background: "#0d0d0d" }}>
      {/* Collapsed header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: "100%",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#111",
          border: "none",
          borderBottom: collapsed ? "none" : "1px solid #1a1a1a",
          color: "#e0e0e0",
          fontFamily: FONT,
          fontSize: 13,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 600 }}>Paper Trading Dashboard</span>
          <span style={{ fontSize: 11, color: "#5a9e6f" }}>Simulated • No real money</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: MONO, fontSize: 12 }}>
          <span style={{ color: "#5a9e6f" }}>${metrics.bankroll.toFixed(2)}</span>
          <span style={{ color: metrics.netPnl >= 0 ? "#5a9e6f" : "#c04040" }}>
            {metrics.netPnl >= 0 ? "+" : ""}${metrics.netPnl.toFixed(2)}
          </span>
          <span style={{ color: "#555" }}>{collapsed ? "▶" : "▼"}</span>
        </div>
      </button>

      {!collapsed && (
        <>
          {/* Metrics row */}
          <div
            style={{
              padding: "16px 20px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 16,
              background: "#0a0a0a",
              borderBottom: "1px solid #1a1a1a",
            }}
          >
            {[
              { label: "Arbs found", value: metrics.totalArbsFound, color: "#ccc" },
              { label: "Paper traded", value: metrics.arbsPaperTraded, color: "#5a8fae" },
              { label: "Open", value: metrics.openCount, color: "#c89030" },
              { label: "Gross P&L", value: `$${metrics.grossPnl.toFixed(2)}`, color: "#e0e0e0" },
              { label: "Net P&L", value: `$${metrics.netPnl.toFixed(2)}`, color: metrics.netPnl >= 0 ? "#5a9e6f" : "#c04040" },
              { label: "Fee drag", value: `$${metrics.totalFees.toFixed(2)}`, color: "#c89030" },
              { label: "Win rate", value: `${metrics.winRate.toFixed(1)}%`, color: "#5a9e6f" },
              { label: "Avg margin", value: `${metrics.avgMargin.toFixed(2)}%`, color: "#888" },
              { label: "Bankroll", value: `$${metrics.bankroll.toFixed(2)}`, color: "#5a9e6f" },
            ].map((m, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 4, fontWeight: 500 }}>{m.label}</div>
                <div style={{ fontSize: 14, color: m.color, fontFamily: MONO }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Balance history chart */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1a1a", background: "#0a0a0a" }}>
            <BalanceHistoryChart balanceHistory={pt.balanceHistory ?? []} />
          </div>

          {/* Fee breakdown */}
          {(metrics.feeCreditCard > 0 || metrics.feeKalshi > 0 || metrics.feePlatform > 0) && (
            <div style={{ padding: "8px 20px", fontSize: 11, color: "#555", display: "flex", gap: 16, flexWrap: "wrap", borderBottom: "1px solid #1a1a1a" }}>
              Fee breakdown:{" "}
              {metrics.feeCreditCard > 0 && <span>CC: ${metrics.feeCreditCard.toFixed(2)}</span>}
              {metrics.feeKalshi > 0 && <span>Kalshi: ${metrics.feeKalshi.toFixed(2)}</span>}
              {metrics.feePlatform > 0 && <span>Platform: ${metrics.feePlatform.toFixed(2)}</span>}
            </div>
          )}

          {/* Settings & Export */}
          <div style={{ padding: "10px 20px", display: "flex", gap: 10, flexWrap: "wrap", borderBottom: "1px solid #1a1a1a" }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                padding: "6px 12px",
                background: "#151515",
                border: "1px solid #2a2a2a",
                borderRadius: 4,
                color: "#5a9e6f",
                fontSize: 11,
                fontFamily: FONT,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              {showSettings ? "Hide Settings" : "Fee Settings"}
            </button>
            <button
              onClick={() => {
                if (confirm("Clear all paper trades and reset bankroll to $1000?")) pt.clearAccount();
              }}
              style={{
                padding: "6px 12px",
                background: "#151515",
                border: "1px solid #3a2a2a",
                borderRadius: 4,
                color: "#c89030",
                fontSize: 11,
                fontFamily: FONT,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Clear Account
            </button>
            <button
              onClick={handleExportCSV}
              disabled={!pt.trades.length}
              style={{
                padding: "6px 12px",
                background: pt.trades.length ? "#151515" : "#0a0a0a",
                border: "1px solid #2a2a2a",
                borderRadius: 4,
                color: pt.trades.length ? "#5a8fae" : "#444",
                fontSize: 11,
                fontFamily: FONT,
                cursor: pt.trades.length ? "pointer" : "default",
                fontWeight: 500,
              }}
            >
              Export CSV
            </button>
          </div>

          {showSettings && (
            <div style={{ padding: "0 20px 16px", borderBottom: "1px solid #1a1a1a" }}>
              <PaperTradingSettings />
            </div>
          )}

          {/* Trade history table */}
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e0e0e0", marginBottom: 10 }}>Trade History</div>
            {pt.trades.length === 0 ? (
              <div style={{ fontSize: 12, color: "#555", padding: 24, textAlign: "center" }}>No paper trades yet. Click "Paper Trade" on an arb card to simulate.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {["date", "pnl", "margin"].map((k) => (
                    <button
                      key={k}
                      onClick={() => {
                        if (sortBy === k) setSortDesc(!sortDesc);
                        else setSortBy(k);
                      }}
                      style={{
                        padding: "4px 10px",
                        background: sortBy === k ? "#2a6e3f" : "#151515",
                        border: `1px solid ${sortBy === k ? "#2a6e3f" : "#2a2a2a"}`,
                        borderRadius: 3,
                        color: sortBy === k ? "#fff" : "#888",
                        fontSize: 10,
                        fontFamily: FONT,
                        cursor: "pointer",
                      }}
                    >
                      Sort: {k}
                    </button>
                  ))}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1a1a1a" }}>
                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 500 }}>Game</th>
                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 500 }}>Leg A</th>
                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 500 }}>Leg B</th>
                        <th style={{ padding: "8px 10px", textAlign: "right", color: "#555", fontWeight: 500 }}>Margin</th>
                        <th style={{ padding: "8px 10px", textAlign: "right", color: "#555", fontWeight: 500 }}>P&L</th>
                        <th style={{ padding: "8px 10px", textAlign: "center", color: "#555", fontWeight: 500 }}>Status</th>
                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 500 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrades.map((t) => {
                        const lotCount = t.lots?.length ?? 1;
                        return (
                        <tr key={t.id} style={{ borderBottom: "1px solid #0e0e0e" }}>
                          <td style={{ padding: "8px 10px", color: "#bbb", fontFamily: MONO }}>
                            {t.game}
                            {lotCount > 1 && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 10,
                                  color: "#5a8fae",
                                  fontWeight: 500,
                                }}
                              >
                                {lotCount} adds
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", color: "#888", fontSize: 10 }}>
                            {t.legA?.platform} {t.legA?.line} @ {formatAmerican(t.legA?.oddsAmerican)} ${(t.legA?.stake ?? 0).toFixed(2)}
                          </td>
                          <td style={{ padding: "8px 10px", color: "#888", fontSize: 10 }}>
                            {t.legB?.platform} {t.legB?.line} @ {formatAmerican(t.legB?.oddsAmerican)} ${(t.legB?.stake ?? 0).toFixed(2)}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO, color: t.netArbPct > 0 ? "#5a9e6f" : "#888" }}>
                            {t.netArbPct != null ? `${t.netArbPct.toFixed(2)}%` : "—"}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO, color: (t.netPnl ?? 0) >= 0 ? "#5a9e6f" : "#c04040" }}>
                            {t.netPnl != null ? `${t.netPnl >= 0 ? "+" : ""}$${t.netPnl.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center" }}>
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 3,
                                fontSize: 10,
                                background: t.status === "OPEN" ? "#2a2000" : t.status === "SETTLED" ? "#1a2a1a" : "#1a1a1a",
                                color: t.status === "OPEN" ? "#c89030" : t.status === "SETTLED" ? "#5a9e6f" : "#666",
                                border: `1px solid ${t.status === "OPEN" ? "#3a2a00" : "#1e1e1e"}`,
                              }}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            {t.status === "OPEN" && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                <button
                                  onClick={() => pt.settle(t.id, "A")}
                                  style={{
                                    padding: "3px 8px",
                                    fontSize: 10,
                                    background: "#1a2a1a",
                                    border: "1px solid #2a4a2a",
                                    borderRadius: 3,
                                    color: "#5a9e6f",
                                    cursor: "pointer",
                                    fontFamily: FONT,
                                  }}
                                >
                                  A won
                                </button>
                                <button
                                  onClick={() => pt.settle(t.id, "B")}
                                  style={{
                                    padding: "3px 8px",
                                    fontSize: 10,
                                    background: "#1a2a1a",
                                    border: "1px solid #2a4a2a",
                                    borderRadius: 3,
                                    color: "#5a9e6f",
                                    cursor: "pointer",
                                    fontFamily: FONT,
                                  }}
                                >
                                  B won
                                </button>
                                <button
                                  onClick={() => pt.voidTrade(t.id)}
                                  style={{
                                    padding: "3px 8px",
                                    fontSize: 10,
                                    background: "#1a1a1a",
                                    border: "1px solid #2a2a2a",
                                    borderRadius: 3,
                                    color: "#888",
                                    cursor: "pointer",
                                    fontFamily: FONT,
                                  }}
                                >
                                  Void
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
