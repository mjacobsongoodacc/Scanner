import { useState, useMemo } from "react";
import { usePaperTrading } from "./PaperTradingContext.jsx";
import PaperTradingSettings from "./PaperTradingSettings.jsx";
import BalanceHistoryChart from "./BalanceHistoryChart.jsx";
import {
  ChevronDown, ChevronRight, Settings, Trash2, Download,
  FileSpreadsheet, TrendingUp, DollarSign,
} from "lucide-react";

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
  const [excelMessage, setExcelMessage] = useState(null);

  const metrics = useMemo(() => {
    const settled = pt.trades.filter((t) => t.status === "SETTLED");
    const grossPnl = settled.reduce((s, t) => s + (t.grossPnl ?? 0), 0);
    const feeCreditCard = settled.reduce((s, t) => s + (t.fees?.creditCard ?? 0), 0);
    const feeKalshi = settled.reduce((s, t) => s + (t.fees?.kalshi ?? 0), 0);
    const feePlatform = settled.reduce((s, t) => s + (t.fees?.platform ?? 0), 0);
    const totalFees = feeCreditCard + feePlatform;
    const netPnl = settled.reduce((s, t) => s + (t.netPnl ?? ((t.grossPnl ?? 0) - (t.fees?.total ?? 0))), 0);
    const wins = settled.filter((t) => (t.netPnl ?? 0) > 0).length;
    const winRate = settled.length ? (wins / settled.length) * 100 : 0;
    const avgMargin = settled.length ? settled.reduce((s, t) => s + (t.netArbPct ?? 0), 0) / settled.length : 0;
    const openCount = pt.trades.filter((t) => t.status === "OPEN").length;
    return { totalArbsFound: (pt.opportunityKeys || []).length, arbsPaperTraded: pt.trades.length, grossPnl, netPnl, feeCreditCard, feeKalshi, feePlatform, totalFees, winRate, avgMargin, bankroll: pt.bankroll, openCount };
  }, [pt.trades, pt.bankroll, pt.opportunityKeys]);

  const sortedTrades = useMemo(() => {
    const arr = [...pt.trades];
    const sign = sortDesc ? -1 : 1;
    if (sortBy === "date") arr.sort((a, b) => sign * (new Date(b.placedAt || b.detectedAt) - new Date(a.placedAt || a.detectedAt)));
    else if (sortBy === "pnl") arr.sort((a, b) => sign * ((a.netPnl ?? -999) - (b.netPnl ?? -999)));
    else if (sortBy === "margin") arr.sort((a, b) => sign * ((a.netArbPct ?? -999) - (b.netArbPct ?? -999)));
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

  const metricItems = [
    { label: "Arbs found", value: metrics.totalArbsFound, color: "var(--text-secondary)" },
    { label: "Paper traded", value: metrics.arbsPaperTraded, color: "var(--blue)" },
    { label: "Open", value: metrics.openCount, color: "var(--amber)" },
    { label: "Gross P&L", value: `$${metrics.grossPnl.toFixed(2)}`, color: "var(--text-primary)" },
    { label: "Net P&L", value: `$${metrics.netPnl.toFixed(2)}`, color: metrics.netPnl >= 0 ? "var(--green)" : "var(--red)" },
    { label: "Fees", value: `$${metrics.totalFees.toFixed(2)}`, color: "var(--amber)" },
    { label: "Win rate", value: `${metrics.winRate.toFixed(1)}%`, color: "var(--green)" },
    { label: "Avg margin", value: `${metrics.avgMargin.toFixed(2)}%`, color: "var(--text-muted)" },
    { label: "Bankroll", value: `$${metrics.bankroll.toFixed(2)}`, color: "var(--green)" },
  ];

  return (
    <div className="paper-panel">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={`paper-panel-header${collapsed ? "" : " expanded"}`}
      >
        <div className="paper-panel-header-title">
          <TrendingUp size={15} style={{ color: "var(--accent)" }} />
          <span>Paper Trading</span>
          <span className="badge badge-green" style={{ fontSize: 9, padding: "3px 8px" }}>
            Simulated
          </span>
        </div>
        <div className="paper-panel-header-stats">
          <span style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <DollarSign size={12} />
            {metrics.bankroll.toFixed(2)}
          </span>
          <span style={{ color: metrics.netPnl >= 0 ? "var(--green)" : "var(--red)" }}>
            {metrics.netPnl >= 0 ? "+" : ""}
            {metrics.netPnl.toFixed(2)}
          </span>
          <span className="paper-panel-chevron">{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</span>
        </div>
      </button>

      {!collapsed && (
        <>
          <div className="paper-metrics-grid">
            {metricItems.map((m, i) => (
              <div key={i}>
                <div className="paper-metric-label">{m.label}</div>
                <div className="paper-metric-value" style={{ color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div className="paper-chart-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>PnL History</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-accent-green btn-xs" onClick={() => pt.exportPnLToExcel()}>
                  <FileSpreadsheet size={11} /> Excel
                </button>
                {pt.canUpdateExistingExcelFile && (
                  <button className="btn btn-accent-green btn-xs" onClick={async () => {
                    setExcelMessage(null);
                    const result = await pt.updateExistingExcelFile();
                    setExcelMessage(result.message);
                  }}>
                    Update File
                  </button>
                )}
              </div>
            </div>
            {excelMessage && (
              <div style={{ fontSize: 11, color: excelMessage.includes("successfully") ? "var(--green)" : "var(--text-muted)", marginBottom: 8 }}>
                {excelMessage}
              </div>
            )}
            <BalanceHistoryChart balanceHistory={pt.balanceHistory ?? []} />
          </div>

          {(metrics.feeCreditCard > 0 || metrics.feeKalshi > 0 || metrics.feePlatform > 0) && (
            <div className="paper-fees-inline">
              <span style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>
                Fees
              </span>
              {metrics.feeCreditCard > 0 && <span>CC ${metrics.feeCreditCard.toFixed(2)}</span>}
              {metrics.feeKalshi > 0 && <span>Kalshi ${metrics.feeKalshi.toFixed(2)}</span>}
              {metrics.feePlatform > 0 && <span>Plat ${metrics.feePlatform.toFixed(2)}</span>}
            </div>
          )}

          <div className="paper-actions">
            <button className="btn btn-accent-green btn-sm" onClick={() => setShowSettings(!showSettings)}>
              <Settings size={12} /> {showSettings ? "Hide" : "Fee Settings"}
            </button>
            <button className="btn btn-accent-amber btn-sm" onClick={() => { if (confirm("Clear all paper trades and reset bankroll to $1000?")) pt.clearAccount(); }}>
              <Trash2 size={12} /> Clear Account
            </button>
            <button className="btn btn-accent-blue btn-sm" onClick={handleExportCSV} disabled={!pt.trades.length}>
              <Download size={12} /> CSV
            </button>
          </div>

          {showSettings && (
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <PaperTradingSettings />
            </div>
          )}

          <div style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12, letterSpacing: "-0.01em" }}>
              Trade History
            </div>
            {pt.trades.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: 24, textAlign: "center" }}>
                No paper trades yet. Click "Paper Trade" on an arb card to simulate.
              </div>
            ) : (
              <>
                <div className="sort-group">
                  {["date", "pnl", "margin"].map((k) => (
                    <button
                      key={k}
                      className={`sort-btn${sortBy === k ? " active" : ""}`}
                      onClick={() => { if (sortBy === k) setSortDesc(!sortDesc); else setSortBy(k); }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="paper-table">
                    <thead>
                      <tr>
                        <th>Game</th>
                        <th>Leg A</th>
                        <th>Leg B</th>
                        <th style={{ textAlign: "right" }}>Margin</th>
                        <th style={{ textAlign: "right" }}>P&L</th>
                        <th style={{ textAlign: "center" }}>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrades.map((t) => {
                        const lotCount = t.lots?.length ?? 1;
                        return (
                          <tr key={t.id}>
                            <td className="type-mono" style={{ color: "var(--text-secondary)" }}>
                              {t.game}
                              {lotCount > 1 && (
                                <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px" }}>
                                  {lotCount} adds
                                </span>
                              )}
                            </td>
                            <td style={{ color: "var(--text-muted)", fontSize: 10 }}>
                              {t.legA?.platform} {t.legA?.line} @ {formatAmerican(t.legA?.oddsAmerican)} ${(t.legA?.stake ?? 0).toFixed(2)}
                            </td>
                            <td style={{ color: "var(--text-muted)", fontSize: 10 }}>
                              {t.legB?.platform} {t.legB?.line} @ {formatAmerican(t.legB?.oddsAmerican)} ${(t.legB?.stake ?? 0).toFixed(2)}
                            </td>
                            <td className="type-mono" style={{ textAlign: "right", color: t.netArbPct > 0 ? "var(--green)" : "var(--text-muted)" }}>
                              {t.netArbPct != null ? `${t.netArbPct.toFixed(2)}%` : "—"}
                            </td>
                            <td className="type-mono" style={{ textAlign: "right", color: (t.netPnl ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                              {t.netPnl != null ? `${t.netPnl >= 0 ? "+" : ""}$${t.netPnl.toFixed(2)}` : "—"}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className={`badge ${t.status === "OPEN" ? "badge-amber" : t.status === "SETTLED" ? "badge-green" : "badge-muted"}`}>
                                {t.status}
                              </span>
                            </td>
                            <td>
                              {t.status === "OPEN" && (
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button className="btn btn-accent-green btn-xs" onClick={() => pt.settle(t.id, "A")}>A won</button>
                                  <button className="btn btn-accent-green btn-xs" onClick={() => pt.settle(t.id, "B")}>B won</button>
                                  <button className="btn btn-secondary btn-xs" onClick={() => pt.voidTrade(t.id)}>Void</button>
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
