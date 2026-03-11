import { formatAmerican } from "../arb/oddsUtils.js";
import { FONT, MONO, badge } from "../styles.js";

function arbToKey(a) {
  return `${a.game}|${a.sideA}|${a.bookA}|${a.sideB}|${a.bookB}|${a.marketType}|${a.commence ?? ""}`;
}

export { arbToKey };

export default function ArbCard({
  a,
  onPaperTrade,
  canPaperTrade,
  existingOpenTrade,
  onAddToPaperTrade,
  canAddToPaperTrade,
  selected,
  onToggleSelect,
  selectable,
}) {
  const vr = a.validationResult;
  const status = vr?.status ?? "monitor";
  const isActionable = status === "actionable";
  const isMonitor = status === "monitor";
  const isRejected = status === "reject";
  const isKalshi = !!a.kalshiTicker;
  const isSpread = a.marketType === "spread";
  const isMoneyline = a.marketType === "h2h";
  const accent = isActionable ? (isKalshi ? "#5a8fae" : "#5a9e6f") : isMonitor ? "#c89030" : "#c04040";
  const borderColor = isActionable ? (isKalshi ? "#1a2a33" : "#1a2a1a") : isMonitor ? "#2a2000" : "#2a1515";
  const execMargin = vr?.executionAdjustedMargin;
  const hasSlippage = (vr?.slippageCents ?? 0) > 0;

  const betTypeLabel = isMoneyline ? "Moneyline" : isSpread ? "Spread" : a.marketType;

  const isProp = a.marketType?.startsWith("player_");
  const STAT_LABELS = { player_points: "Pts", player_assists: "Ast", player_rebounds: "Reb" };
  const propStatLabel = STAT_LABELS[a.marketType] || a.marketType;
  const propPlayer = a.propPlayer ?? null;
  const propLine = a.propLine ?? null;
  const matchQuality = a.matchQuality ?? null;

  return (
    <div style={{
      padding: 16, background: "#111", border: `1px solid ${selected ? "#2a6e3f" : borderColor}`,
      borderRadius: 4, opacity: isRejected ? 0.85 : 1,
    }}>
      {isProp && (propPlayer != null || propLine != null) && (
        <div style={{
          padding: "10px 12px",
          background: "#0d0a14",
          border: "1px solid #2a2035",
          borderRadius: 4,
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 4, fontWeight: 500 }}>Player Prop</div>
          <div style={{ fontSize: 15, color: "#e0e0e0", fontWeight: 600, marginBottom: 6 }}>
            {propPlayer || "—"}
            {propLine != null && (
              <span style={{ fontWeight: 500, color: "#9a8fae", marginLeft: 6 }}>
                {propLine} {propStatLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>
            <span style={{ color: "#555" }}>Lines to take:</span>{" "}
            <span style={{ color: "#b8a8d0", fontFamily: FONT }}>{a.sideA}</span>
            <span style={{ color: "#555", margin: "0 6px" }}>+</span>
            <span style={{ color: "#b8a8d0", fontFamily: FONT }}>{a.sideB}</span>
          </div>
          {matchQuality && (
            <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>{matchQuality}</div>
          )}
        </div>
      )}

      {vr?.reasons?.length > 0 && (
        <div style={{
          padding: "7px 10px",
          background: isRejected ? "#1a0f0f" : isMonitor ? "#1a1500" : "#0d1a0d",
          border: `1px solid ${isRejected ? "#3a1a1a" : isMonitor ? "#3a2a00" : "#1a3a1a"}`,
          borderRadius: 3,
          marginBottom: 10,
          fontSize: 11,
          color: isRejected ? "#c04040" : isMonitor ? "#c89030" : "#5a9e6f",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{vr.reasons[0]}</div>
          {vr.reasons.length > 1 && (
            <div style={{ fontSize: 10, color: "#666" }}>{vr.reasons.slice(1).join(" · ")}</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          {selectable && !isRejected && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, marginTop: 2 }}>
              <input
                type="checkbox"
                checked={!!selected}
                onChange={() => onToggleSelect?.(a)}
                style={{ width: 16, height: 16, accentColor: "#5a9e6f", cursor: "pointer" }}
              />
              <span style={{ fontSize: 11, color: "#555" }}>Select</span>
            </label>
          )}
          <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 500 }}>{a.game}</div>
            {isMoneyline && <span style={badge("#6a9fd8")}>ML</span>}
            {isSpread && <span style={badge("#a07dba")}>Spread</span>}
            {isKalshi && <span style={badge("#5a8fae")}>Kalshi</span>}
            <span style={badge(isActionable ? "#5a9e6f" : isMonitor ? "#c89030" : "#c04040")}>
              {isActionable ? "Actionable" : isMonitor ? "Monitor" : "Rejected"}
            </span>
            {vr?.confidenceScore != null && (
              <span style={badge("#555")}>Score {vr.confidenceScore}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#555" }}>{a.commence ? new Date(a.commence).toLocaleString() : ""}</div>
          {isKalshi && (
            <div style={{ fontSize: 11, color: "#444", marginTop: 2, fontFamily: MONO }}>
              {a.kalshiTicker}
              {a.kalshiVolume != null && <span style={{ marginLeft: 8 }}>vol {a.kalshiVolume.toLocaleString()}</span>}
              {a.kalshiBaSpread != null && <span style={{ marginLeft: 8 }}>ba {a.kalshiBaSpread}c</span>}
            </div>
          )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, color: accent, fontWeight: 400, fontFamily: MONO }}>
            {a.roi >= 0 ? "+" : ""}{a.roi.toFixed(2)}%
          </div>
          {execMargin != null && hasSlippage && Math.abs(execMargin - a.roi) > 0.01 && (
            <div style={{ fontSize: 11, color: "#888" }}>
              Exec-adj: {execMargin >= 0 ? "+" : ""}{execMargin.toFixed(2)}%
            </div>
          )}
          <div style={{ fontSize: 12, color: accent }}>
            {a.impSum < 1 ? `$${a.profit.toFixed(2)} profit` : `${((a.impSum - 1) * 100).toFixed(2)}% from arb`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { side: a.sideA, book: a.bookA, american: a.americanA, decimal: a.decimalA, bet: a.betA, label: "Leg A", contracts: a.kalshiContractsA, fee: a.kalshiFeeA },
          { side: a.sideB, book: a.bookB, american: a.americanB, decimal: a.decimalB, bet: a.betB, label: "Leg B", contracts: a.kalshiContractsB, fee: a.kalshiFeeB },
        ].map((leg, li) => {
          const legIsKalshi = leg.book === "Kalshi";
          const impliedProb = leg.decimal ? (100 / leg.decimal) : null;
          return (
            <div key={li} style={{ padding: 12, background: "#0a0a0a", borderRadius: 4, border: `1px solid ${legIsKalshi ? "#1a2a33" : "#1a1a1a"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: legIsKalshi ? "#5a8fae" : "#555", fontWeight: 500 }}>{leg.label}</div>
                <span style={badge(isMoneyline ? "#6a9fd8" : "#a07dba")}>{betTypeLabel}</span>
              </div>
              <div style={{ fontSize: 13, color: "#e0e0e0", marginBottom: 5 }}>{leg.side}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: legIsKalshi ? "#5a8fae" : "#888" }}>{leg.book}</span>
                <span style={{ fontSize: 15, color: accent, fontWeight: 600, fontFamily: MONO }}>{formatAmerican(leg.american)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", fontFamily: MONO }}>
                <span>{leg.decimal?.toFixed(3) ?? "—"} dec</span>
                <span>{impliedProb != null ? `${impliedProb.toFixed(1)}%` : "—"}</span>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#555" }}>{isActionable ? "Bet" : "Would bet"}</span>
                <span style={{ color: "#e0e0e0", fontWeight: 600, fontFamily: MONO }}>${leg.bet.toFixed(2)}</span>
              </div>
              {legIsKalshi && leg.contracts != null && (
                <div style={{ marginTop: 5, fontSize: 11, color: "#555", fontFamily: MONO }}>
                  {leg.contracts} contracts
                  {leg.fee != null && ` | $${leg.fee.toFixed(2)} fee`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 11, color: "#444", fontFamily: MONO, flexWrap: "wrap", alignItems: "center" }}>
        <span>{betTypeLabel}</span>
        <span>imp {a.impSum.toFixed(4)}</span>
        <span>used ${a.usedStake.toFixed(2)}</span>
        {a.unusedStake > 0.009 && <span>idle ${a.unusedStake.toFixed(2)}</span>}
        {isKalshi && <span>fees incl</span>}
        {existingOpenTrade && (
          <span style={{ fontSize: 10, color: "#5a8fae", marginLeft: "auto" }}>Already traded • Add only</span>
        )}
        {((existingOpenTrade && onAddToPaperTrade) || (isActionable && !existingOpenTrade && onPaperTrade)) && (
          <button
            onClick={() =>
              existingOpenTrade ? onAddToPaperTrade?.(a) : onPaperTrade?.(a)
            }
            disabled={
              existingOpenTrade
                ? canAddToPaperTrade && !canAddToPaperTrade(a)
                : canPaperTrade && !canPaperTrade(a)
            }
            title={
              existingOpenTrade
                ? canAddToPaperTrade && !canAddToPaperTrade(a)
                  ? "Insufficient bankroll"
                  : "Add to existing trade at current odds"
                : canPaperTrade && !canPaperTrade(a)
                  ? "Insufficient bankroll"
                  : ""
            }
            style={{
              marginLeft: existingOpenTrade ? 0 : "auto",
              padding: "5px 12px",
              background:
                (existingOpenTrade && canAddToPaperTrade && !canAddToPaperTrade(a)) ||
                (!existingOpenTrade && canPaperTrade && !canPaperTrade(a))
                  ? "#1a1a1a"
                  : "#2a6e3f",
              border: `1px solid ${
                (existingOpenTrade && canAddToPaperTrade && !canAddToPaperTrade(a)) ||
                (!existingOpenTrade && canPaperTrade && !canPaperTrade(a))
                  ? "#2a2a2a"
                  : "#2a6e3f"
              }`,
              borderRadius: 4,
              color:
                (existingOpenTrade && canAddToPaperTrade && !canAddToPaperTrade(a)) ||
                (!existingOpenTrade && canPaperTrade && !canPaperTrade(a))
                  ? "#555"
                  : "#fff",
              fontSize: 11,
              fontFamily: FONT,
              cursor:
                (existingOpenTrade && canAddToPaperTrade && canAddToPaperTrade(a)) ||
                (!existingOpenTrade && canPaperTrade && canPaperTrade(a))
                  ? "pointer"
                  : "default",
              fontWeight: 600,
            }}
          >
            {existingOpenTrade ? "Add to Trade" : "Paper Trade"}
          </button>
        )}
      </div>
    </div>
  );
}
