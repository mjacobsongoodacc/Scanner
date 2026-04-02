import { AlertTriangle, Info } from "lucide-react";

/** Dedicated notifications / alerts (moved off main scanner tabs). */
export default function NotificationsView({
  sportLabel,
  cacheTimeLabel,
  rejectedCount,
  error,
  kalshiError,
  propArbsError,
  gamesCount,
  propCreditsEstimate,
  propKalshiCount,
}) {
  return (
    <div className="notifications-page">
      <h1 className="notifications-page-title">Notifications</h1>
      <p className="notifications-page-lede">
        Scanner status, API messages, and disclaimers. Main views stay clean — everything actionable lives here.
      </p>

      <section className="notifications-section">
        <h2 className="notifications-section-title">
          <Info size={18} strokeWidth={2.25} aria-hidden />
          Data &amp; caching
        </h2>
        <div className="notifications-card notifications-card--info">
          <p className="notifications-body">
            Sportsbook odds cached daily (1 API call/day). Kalshi prices refresh on each load. Only arbs with sufficient
            liquidity and tight spread shown as actionable.
            {cacheTimeLabel && (
              <span className="notifications-meta"> Cached ({sportLabel}): {cacheTimeLabel}</span>
            )}
          </p>
          {rejectedCount > 0 && (
            <p className="notifications-body notifications-body--emphasis-warn">
              <strong>{rejectedCount}</strong> phantom/stale arbs rejected for the current sport.
            </p>
          )}
        </div>
      </section>

      {error && (
        <section className="notifications-section">
          <h2 className="notifications-section-title">Odds feed</h2>
          <div className="notifications-card notifications-card--error">
            <p className="notifications-body">
              <strong>Error:</strong> {error}
            </p>
          </div>
        </section>
      )}

      {kalshiError && (
        <section className="notifications-section">
          <h2 className="notifications-section-title">
            <AlertTriangle size={18} strokeWidth={2.25} aria-hidden />
            Kalshi
          </h2>
          <div className="notifications-card notifications-card--warning">
            <p className="notifications-body">
              <strong>Kalshi:</strong> {kalshiError} — cross-exchange arbs unavailable until this clears.
            </p>
          </div>
        </section>
      )}

      <section className="notifications-section">
        <h2 className="notifications-section-title">
          <AlertTriangle size={18} strokeWidth={2.25} aria-hidden />
          Trading disclaimer
        </h2>
        <div className="notifications-card notifications-card--warning">
          <p className="notifications-body">
            <strong>Disclaimer:</strong> Kalshi cross-exchange arbs include taker fees that can turn apparent profits into
            losses. Verify fees and execution before placing real bets.
          </p>
        </div>
      </section>

      <section className="notifications-section">
        <h2 className="notifications-section-title">Player props</h2>
        <div className="notifications-card notifications-card--warning">
          <p className="notifications-body">
            Player props use the event-odds endpoint (~{gamesCount} games × 3 markets ={" "}
            <strong>{propCreditsEstimate}</strong> API credits when loaded).
          </p>
          <p className="notifications-body">
            {propKalshiCount > 0 ? (
              <>
                <strong>Kalshi:</strong> {propKalshiCount} prop markets included for matching.
              </>
            ) : (
              <span className="notifications-muted">
                Kalshi player props not detected for this league — props tab may show sportsbook-only arbs.
              </span>
            )}
          </p>
        </div>
      </section>

      {propArbsError && (
        <section className="notifications-section">
          <h2 className="notifications-section-title">Props fetch</h2>
          <div className="notifications-card notifications-card--error">
            <p className="notifications-body">
              <strong>Player props:</strong> {propArbsError}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
