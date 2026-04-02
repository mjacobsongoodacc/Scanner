import { formatAmerican } from "../arb/oddsUtils.js";
import { CheckCircle, Eye, XCircle, TrendingUp, ArrowRightLeft } from "lucide-react";

function arbToKey(a) {
  return `${a.game}|${a.sideA}|${a.bookA}|${a.sideB}|${a.bookB}|${a.marketType}|${a.commence ?? ""}`;
}

export { arbToKey };

const STATUS_ICON = {
  actionable: CheckCircle,
  monitor: Eye,
  reject: XCircle,
};

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
  staggerMs = 0,
}) {
  const vr = a.validationResult;
  const status = vr?.status ?? "monitor";
  const isActionable = status === "actionable";
  const isMonitor = status === "monitor";
  const isRejected = status === "reject";
  const isKalshi = !!a.kalshiTicker;
  const isSpread = a.marketType === "spread";
  const isMoneyline = a.marketType === "h2h";
  const execMargin = vr?.executionAdjustedMargin;
  const hasSlippage = (vr?.slippageCents ?? 0) > 0;
  const betTypeLabel = isMoneyline ? "Moneyline" : isSpread ? "Spread" : a.marketType;

  const isProp = a.marketType?.startsWith("player_");
  const STAT_LABELS = { player_points: "Pts", player_assists: "Ast", player_rebounds: "Reb" };
  const propStatLabel = STAT_LABELS[a.marketType] || a.marketType;
  const propPlayer = a.propPlayer ?? null;
  const propLine = a.propLine ?? null;
  const matchQuality = a.matchQuality ?? null;

  const roiColor = isActionable ? "var(--green)" : isMonitor ? "var(--amber)" : "var(--red)";
  const statusBadgeClass = isActionable ? "badge-green" : isMonitor ? "badge-amber" : "badge-red";
  const StatusIcon = STATUS_ICON[status] || Eye;

  const cardClass = [
    "arb-card",
    isActionable && (isKalshi ? "actionable-kalshi" : "actionable"),
    isMonitor && "monitor",
    isRejected && "rejected",
    selected && "selected",
  ].filter(Boolean).join(" ");

  const gameParts = a.game?.split(" @ ") ?? [a.game];
  const away = gameParts[0] ?? "";
  const home = gameParts[1] ?? a.game;

  return (
    <div className={cardClass} style={{ ["--stagger"]: `${staggerMs}ms` }}>
      {isProp && (propPlayer != null || propLine != null) && (
        <div className="prop-header">
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Player Prop
          </div>
          <div className="prop-player">
            {propPlayer || "—"}
            {propLine != null && (
              <span className="prop-line">
                {propLine} {propStatLabel}
              </span>
            )}
          </div>
          <div className="prop-sides">
            <span style={{ color: "var(--text-dim)" }}>Lines:</span>{" "}
            <span style={{ color: "var(--purple)" }}>{a.sideA}</span>
            <span style={{ color: "var(--text-dim)", margin: "0 5px" }}>+</span>
            <span style={{ color: "var(--purple)" }}>{a.sideB}</span>
          </div>
          {matchQuality && (
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>{matchQuality}</div>
          )}
        </div>
      )}

      {vr?.reasons?.length > 0 && (
        <div className={`card-validation ${status === "reject" ? "rejected" : status}`}>
          <div style={{ fontWeight: 600, marginBottom: vr.reasons.length > 1 ? 3 : 0, display: "flex", alignItems: "center", gap: 5 }}>
            <StatusIcon size={12} />
            {vr.reasons[0]}
          </div>
          {vr.reasons.length > 1 && (
            <div style={{ fontSize: 10, opacity: 0.7 }}>{vr.reasons.slice(1).join(" · ")}</div>
          )}
        </div>
      )}

      <div className="card-header">
        <div className="card-game-info" style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {selectable && !isRejected && (
            <label className="arb-select-label">
              <input
                type="checkbox"
                className="arb-checkbox"
                checked={!!selected}
                onChange={() => onToggleSelect?.(a)}
                aria-label={`Select arb ${a.game}`}
              />
            </label>
          )}
          <div>
            <div className="card-badges">
              <span className={`badge ${statusBadgeClass}`}>
                <StatusIcon size={9} />
                {isActionable ? "Actionable" : isMonitor ? "Monitor" : "Rejected"}
              </span>
              {isMoneyline && <span className="badge badge-blue">ML</span>}
              {isSpread && <span className="badge badge-purple">Spread</span>}
              {isKalshi && <span className="badge badge-cyan">Kalshi</span>}
              {vr?.confidenceScore != null && (
                <span className="badge badge-muted">Score {vr.confidenceScore}</span>
              )}
            </div>
            <div className="card-game-name">
              {gameParts.length === 2 ? (
                <>{away}<span className="vs">@</span>{home}</>
              ) : a.game}
            </div>
            <div className="card-meta">
              <span>{a.commence ? new Date(a.commence).toLocaleString() : ""}</span>
              {isKalshi && (
                <>
                  <span>{a.kalshiTicker}</span>
                  {a.kalshiVolume != null && <span>vol {a.kalshiVolume.toLocaleString()}</span>}
                  {a.kalshiBaSpread != null && <span>ba {a.kalshiBaSpread}c</span>}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="card-roi">
          <div className="card-roi-value" style={{ color: roiColor }}>
            {a.roi >= 0 ? "+" : ""}{a.roi.toFixed(2)}%
          </div>
          {execMargin != null && hasSlippage && Math.abs(execMargin - a.roi) > 0.01 && (
            <div className="card-roi-detail" style={{ color: "var(--text-muted)" }}>
              Exec-adj: {execMargin >= 0 ? "+" : ""}{execMargin.toFixed(2)}%
            </div>
          )}
          <div className="card-roi-detail" style={{ color: roiColor }}>
            {a.impSum < 1 ? `$${a.profit.toFixed(2)} profit` : `${((a.impSum - 1) * 100).toFixed(2)}% from arb`}
          </div>
        </div>
      </div>

      <div className="card-legs">
        {[
          { side: a.sideA, book: a.bookA, american: a.americanA, decimal: a.decimalA, bet: a.betA, label: "Leg A", contracts: a.kalshiContractsA, fee: a.kalshiFeeA },
          { side: a.sideB, book: a.bookB, american: a.americanB, decimal: a.decimalB, bet: a.betB, label: "Leg B", contracts: a.kalshiContractsB, fee: a.kalshiFeeB },
        ].map((leg, li) => {
          const legIsKalshi = leg.book === "Kalshi";
          const impliedProb = leg.decimal ? (100 / leg.decimal) : null;
          const legColor = li === 0 ? "var(--green)" : "var(--blue)";
          return (
            <div key={li} className={`card-leg${legIsKalshi ? " kalshi" : ""}`}>
              <div className="leg-header">
                <div className="leg-label" style={{ color: legIsKalshi ? "var(--cyan)" : legColor }}>
                  {leg.label}
                </div>
                <span className={`badge ${isMoneyline ? "badge-blue" : "badge-purple"}`} style={{ fontSize: 9 }}>
                  {betTypeLabel}
                </span>
              </div>
              <div className="leg-side">{leg.side}</div>
              <div className="leg-book-row">
                <span style={{ color: legIsKalshi ? "var(--cyan)" : "var(--text-muted)" }}>{leg.book}</span>
                <span className="leg-odds" style={{ color: roiColor }}>{formatAmerican(leg.american)}</span>
              </div>
              <div className="leg-detail">
                <span>{leg.decimal?.toFixed(3) ?? "—"} dec</span>
                <span>{impliedProb != null ? `${impliedProb.toFixed(1)}%` : "—"}</span>
              </div>
              <div className="leg-bet">
                <span style={{ color: "var(--text-muted)" }}>{isActionable ? "Bet" : "Would bet"}</span>
                <span className="leg-bet-amount">${leg.bet.toFixed(2)}</span>
              </div>
              {legIsKalshi && leg.contracts != null && (
                <div className="type-mono" style={{ marginTop: 6, fontSize: 11, color: "var(--text-dim)" }}>
                  {leg.contracts} contracts
                  {leg.fee != null && ` · $${leg.fee.toFixed(2)} fee`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card-footer">
        <span className="card-footer-item">
          <ArrowRightLeft size={11} />
          {betTypeLabel}
        </span>
        <span>imp {a.impSum.toFixed(4)}</span>
        <span>used ${a.usedStake.toFixed(2)}</span>
        {a.unusedStake > 0.009 && <span>idle ${a.unusedStake.toFixed(2)}</span>}
        {isKalshi && <span>fees incl</span>}
        {existingOpenTrade && (
          <span style={{ fontSize: 10, color: "var(--cyan)", marginLeft: "auto" }}>
            Already traded · Add only
          </span>
        )}
        {((existingOpenTrade && onAddToPaperTrade) || (isActionable && !existingOpenTrade && onPaperTrade)) && (
          <button
            className="btn btn-primary btn-sm ui-btn--shimmer"
            onClick={() => existingOpenTrade ? onAddToPaperTrade?.(a) : onPaperTrade?.(a)}
            disabled={
              existingOpenTrade
                ? canAddToPaperTrade && !canAddToPaperTrade(a)
                : canPaperTrade && !canPaperTrade(a)
            }
            title={
              existingOpenTrade
                ? canAddToPaperTrade && !canAddToPaperTrade(a) ? "Insufficient bankroll" : "Add to existing trade"
                : canPaperTrade && !canPaperTrade(a) ? "Insufficient bankroll" : ""
            }
            style={{ marginLeft: existingOpenTrade ? 0 : "auto" }}
          >
            <TrendingUp size={11} />
            {existingOpenTrade ? "Add to Trade" : "Paper Trade"}
          </button>
        )}
      </div>
    </div>
  );
}
