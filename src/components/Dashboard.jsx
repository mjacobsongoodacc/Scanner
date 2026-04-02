import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePaperTrading } from "../paperTrading/PaperTradingContext.jsx";
import PaperTradingDashboard from "../paperTrading/PaperTradingDashboard.jsx";
import { validateArbs } from "../arbValidation/index.js";
import {
  ODDS_API_BASE,
  SPORT_CONFIG,
  americanToDecimal,
  decimalToAmerican,
  formatAmerican,
  findArbs,
  findPropArbs,
  fetchKalshiGameMarkets,
  fetchKalshiPlayerProps,
  fetchOddsApiPlayerProps,
  kalshiCentsToDecimal,
} from "../arb/index.js";
import ArbCard, { arbToKey } from "./ArbCard.jsx";
import PropArbCard from "./PropArbCard.jsx";
import BetCalculator from "./BetCalculator.jsx";
import CollapsibleRejectedSection from "./CollapsibleRejectedSection.jsx";
import Sidebar from "./ui/Sidebar.jsx";
import LoadingBar from "./ui/LoadingBar.jsx";
import MetricCard from "./ui/MetricCard.jsx";
import NotificationsView from "./NotificationsView.jsx";
import {
  Bell, ChevronDown, RefreshCw, RotateCw, Activity, BarChart3,
  TrendingUp, Calculator, Users, Eye, Target,
  CheckCircle,
} from "lucide-react";

const ODDS_CACHE_TTL = 24 * 60 * 60 * 1000;
const SPORT_KEYS = Object.keys(SPORT_CONFIG);

export default function Dashboard({ config, onConfigChange }) {
  const pt = usePaperTrading();
  const [sportData, setSportData] = useState(() =>
    Object.fromEntries(SPORT_KEYS.map((s) => [s, { games: [], kalshiMarkets: [], loaded: false }]))
  );
  const [arbs, setArbs] = useState([]);
  const [bestImpSum, setBestImpSum] = useState(null);
  const [bestImpDetail, setBestImpDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState("?");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tab, setTab] = useState("arbs");
  const [stake, setStake] = useState(config.stake);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [stakeInput, setStakeInput] = useState(String(config.stake));
  const [sportDropdownOpen, setSportDropdownOpen] = useState(false);
  const [propArbs, setPropArbs] = useState([]);
  const [propArbsLoading, setPropArbsLoading] = useState(false);
  const [propArbsError, setPropArbsError] = useState(null);
  const [propArbsLoadedForSport, setPropArbsLoadedForSport] = useState(null);
  const [propKalshiCount, setPropKalshiCount] = useState(0);

  const stakeRef = useRef(stake);
  stakeRef.current = stake;
  const propsFetchConfirmedRef = useRef(false);

  const games = sportData[config.sport]?.games ?? [];
  const kalshiMarkets = sportData[config.sport]?.kalshiMarkets ?? [];
  const error = sportData[config.sport]?.error ?? null;
  const kalshiError = sportData[config.sport]?.kalshiError ?? null;

  function parseOddsData(oddsData) {
    return oddsData.map(g => {
      const bookOdds = {};
      const spreadOdds = {};
      (g.bookmakers || []).forEach(bk => {
        const name = bk.title || bk.key;
        for (const mkt of bk.markets || []) {
          if (mkt.key === "h2h") {
            const homeOc = mkt.outcomes?.find(o => o.name === g.home_team);
            const awayOc = mkt.outcomes?.find(o => o.name === g.away_team);
            if (homeOc && awayOc) {
              bookOdds[name] = { home: homeOc.price, away: awayOc.price };
            }
          } else if (mkt.key === "spreads") {
            const lines = (mkt.outcomes || []).map(o => ({
              name: o.name, point: o.point, price: o.price,
            }));
            if (lines.length) spreadOdds[name] = lines;
          }
        }
      });
      return { home: g.home_team, away: g.away_team, commence: g.commence_time, eventId: g.id, bookOdds, spreadOdds };
    });
  }

  function getCachedOdds(sport) {
    try {
      const raw = localStorage.getItem(`odds_cache_${sport}`);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts > ODDS_CACHE_TTL) return null;
      return cached;
    } catch { return null; }
  }

  const fetchSportData = useCallback(
    async (sport, forceOddsRefresh = false) => {
      const sportCfg = SPORT_CONFIG[sport] || SPORT_CONFIG.nba;
      let parsed;
      let rem = "?";
      const cached = getCachedOdds(sport);
      if (!forceOddsRefresh && cached) {
        parsed = cached.games;
        rem = cached.remaining ?? "?";
      } else {
        const oddsApiKey = sportCfg.oddsApiKey;
        if (!config.apiKey?.trim()) {
          throw new Error("Odds API key missing.");
        }
        const oddsUrl = `${ODDS_API_BASE}/sports/${oddsApiKey}/odds?apiKey=${config.apiKey}&regions=us&markets=h2h,spreads&oddsFormat=american`;
        const oddsResp = await fetch(oddsUrl);
        if (!oddsResp.ok) {
          const msg = oddsResp.status === 401
            ? "Odds API 401: Invalid key."
            : `Odds API: ${oddsResp.status} ${oddsResp.statusText}`;
          throw new Error(msg);
        }
        rem = oddsResp.headers.get("x-requests-remaining") || "?";
        const oddsData = await oddsResp.json();
        parsed = parseOddsData(oddsData);
        try {
          localStorage.setItem(`odds_cache_${sport}`, JSON.stringify({ ts: Date.now(), remaining: rem, games: parsed, raw: oddsData }));
        } catch {}
      }
      let kalshiMarkets = [];
      let kalshiErr = null;
      try { kalshiMarkets = await fetchKalshiGameMarkets(sport); }
      catch (e) { kalshiErr = e.message; }
      return { games: parsed, kalshiMarkets, kalshiError: kalshiErr, remaining: rem, lastUpdate: Date.now() };
    },
    [config.apiKey]
  );

  const fetchAllSports = useCallback(
    async (forceOddsRefresh = false) => {
      setLoading(true);
      try {
        const results = await Promise.all(
          SPORT_KEYS.map(async (sport) => {
            try {
              const data = await fetchSportData(sport, forceOddsRefresh);
              return { sport, data, error: null };
            } catch (e) {
              return { sport, data: null, error: e.message };
            }
          })
        );
        setSportData((prev) => {
          const next = { ...prev };
          let lastRem = "?";
          let lastTs = null;
          for (const { sport, data, error } of results) {
            if (data) {
              next[sport] = { games: data.games, kalshiMarkets: data.kalshiMarkets, kalshiError: data.kalshiError ?? null, error: null, loaded: true };
              lastRem = data.remaining ?? lastRem;
              lastTs = data.lastUpdate ?? lastTs;
            } else {
              next[sport] = { ...prev[sport], error: error ?? null, loaded: true };
            }
          }
          setRemaining(lastRem);
          if (lastTs) setLastUpdate(new Date(lastTs));
          return next;
        });
      } finally { setLoading(false); }
    },
    [fetchSportData]
  );

  useEffect(() => { fetchAllSports(false); }, [fetchAllSports]);

  const refreshCurrentSport = useCallback(() => {
    setLoading(true);
    fetchSportData(config.sport, false)
      .then((data) => {
        if (data) {
          setSportData((prev) => ({
            ...prev,
            [config.sport]: { games: data.games, kalshiMarkets: data.kalshiMarkets, kalshiError: data.kalshiError ?? null, error: null, loaded: true },
          }));
          setRemaining(data.remaining ?? "?");
          if (data.lastUpdate) setLastUpdate(new Date(data.lastUpdate));
        }
      })
      .finally(() => setLoading(false));
  }, [config.sport, fetchSportData]);

  const forceRefreshAll = useCallback(() => { fetchAllSports(true); }, [fetchAllSports]);

  const fetchPropsForSport = useCallback(
    async (sport) => {
      const sportGames = sportData[sport]?.games ?? [];
      const eventIds = sportGames.map((g) => g.eventId).filter(Boolean);
      if (!config.apiKey?.trim() || eventIds.length === 0) {
        setPropArbs([]);
        setPropArbsError("No games with event IDs. Refresh main odds first.");
        return;
      }
      setPropArbsLoading(true);
      setPropArbsError(null);
      try {
        const [oddsResult, kalshiProps] = await Promise.all([
          fetchOddsApiPlayerProps(config.apiKey, sport, eventIds),
          fetchKalshiPlayerProps(sport).catch(() => []),
        ]);
        setPropKalshiCount(kalshiProps?.length ?? 0);
        if (oddsResult.error) { setPropArbsError(oddsResult.error); setPropArbs([]); return; }
        const result = findPropArbs(sportGames, oddsResult.propsByEvent, kalshiProps, stakeRef.current);
        const validated = validateArbs(result.opps);
        setPropArbs(validated.all);
        setPropArbsLoadedForSport(sport);
      } catch (e) { setPropArbsError(e.message); setPropArbs([]); }
      finally { setPropArbsLoading(false); }
    },
    [config.apiKey, sportData]
  );

  useEffect(() => {
    if (tab === "props" && !propArbsLoading) {
      const needsLoad = propArbsLoadedForSport !== config.sport;
      if (!needsLoad) return;
      const sportGames = sportData[config.sport]?.games ?? [];
      const eventIds = sportGames.map((g) => g.eventId).filter(Boolean);
      if (eventIds.length === 0) { setPropArbsError("No games with event IDs."); return; }
      const credits = eventIds.length * 3;
      if (!propsFetchConfirmedRef.current) {
        if (!confirm(`Player props will use ~${credits} API credits (${eventIds.length} games × 3). Continue?`)) {
          setPropArbsError("Fetch cancelled.");
          return;
        }
        propsFetchConfirmedRef.current = true;
      }
      fetchPropsForSport(config.sport);
    }
  }, [tab, config.sport, propArbsLoadedForSport, propArbsLoading, fetchPropsForSport, sportData]);

  useEffect(() => {
    if (games.length === 0 && kalshiMarkets.length === 0) return;
    const result = findArbs(games, kalshiMarkets, stake);
    const validated = validateArbs(result.opps);
    setArbs(validated.all);
    setBestImpSum(result.bestImpSum);
    setBestImpDetail(result.bestImpDetail);
  }, [stake, games, kalshiMarkets]);

  useEffect(() => {
    if (pt?.reportOpportunities && (arbs.length > 0 || propArbs.length > 0)) {
      pt.reportOpportunities([...arbs, ...propArbs]);
    }
  }, [pt?.reportOpportunities, arbs, propArbs]);

  useEffect(() => { setSelectedKeys(new Set()); }, [config.sport]);

  function commitStake() {
    const v = parseFloat(stakeInput);
    if (v && v > 0) setStake(v);
    else setStakeInput(String(stake));
  }

  const actionableArbs = arbs.filter(a => a.validationResult?.status === "actionable");
  const monitorArbs = arbs.filter(a => a.validationResult?.status === "monitor");
  const rejectedArbs = arbs.filter(a => a.validationResult?.status === "reject");
  const arbCount = actionableArbs.length;
  const kalshiArbCount = arbs.filter(a => a.kalshiTicker).length;
  const mlArbCount = arbs.filter(a => a.marketType === "h2h").length;
  const spreadArbCount = arbs.filter(a => a.marketType === "spread").length;
  const gameCount = games.length;
  const bestRoi = actionableArbs.length ? actionableArbs[0].roi : 0;
  const gapFromArb = bestImpSum && bestImpSum < Infinity ? ((bestImpSum - 1) * 100) : null;

  function toggleSelect(a) {
    const k = arbToKey(a);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function paperTradeSelected() {
    const selectableArbs = tab === "props"
      ? [...propArbs.filter((a) => a.validationResult?.status === "actionable"), ...propArbs.filter((a) => a.validationResult?.status === "monitor")]
      : [...actionableArbs, ...monitorArbs];
    const selected = selectableArbs.filter((a) => selectedKeys.has(arbToKey(a)));
    const toAdd = [];
    const toCreate = [];
    for (const arb of selected) {
      const existing = pt?.getOpenTradeForArb?.(arb);
      if (existing) toAdd.push(arb); else toCreate.push(arb);
    }
    for (const arb of toAdd) pt?.addToPaperTrade?.(arb);
    if (toCreate.length) pt?.paperTradeBulk?.(toCreate);
    setSelectedKeys(new Set());
  }

  function clearSelection() { setSelectedKeys(new Set()); }

  const selectedCount = selectedKeys.size;

  function handleSportSelect(newSport) {
    if (newSport !== config.sport && onConfigChange) {
      onConfigChange({ ...config, sport: newSport });
    }
    setSportDropdownOpen(false);
  }

  const currentSportLabel = SPORT_CONFIG[config.sport]?.label ?? config.sport?.toUpperCase() ?? "NBA";

  const notificationsSignature = useMemo(
    () =>
      [error ?? "", kalshiError ?? "", String(rejectedArbs.length), propArbsError ?? ""].join("\x1e"),
    [error, kalshiError, rejectedArbs.length, propArbsError]
  );

  const needsNotificationAttention = Boolean(
    error || kalshiError || propArbsError || rejectedArbs.length > 0
  );

  const [lastReadNotifSig, setLastReadNotifSig] = useState(() => {
    try {
      return window.localStorage.getItem("scanner_notif_sig") ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (tab !== "notifications") return;
    setLastReadNotifSig(notificationsSignature);
    try {
      localStorage.setItem("scanner_notif_sig", notificationsSignature);
    } catch {
      /* ignore */
    }
  }, [tab, notificationsSignature]);

  const notificationsUnread =
    needsNotificationAttention && notificationsSignature !== lastReadNotifSig;

  const cachedOdds = getCachedOdds(config.sport);
  const cacheTimeLabel = cachedOdds ? new Date(cachedOdds.ts).toLocaleString() : null;

  const navItems = useMemo(
    () => [
      { key: "arbs", title: "Scanner", icon: Target },
      { key: "notifications", title: "Notifications", icon: Bell, showBadge: notificationsUnread },
      { key: "props", title: "Props", icon: Users },
      { key: "paper", title: "Paper Trading", icon: TrendingUp },
      { key: "games", title: "Games", icon: Activity },
      { key: "kalshi", title: "Kalshi", icon: BarChart3 },
      { key: "calc", title: "Calculator", icon: Calculator },
    ],
    [notificationsUnread]
  );

  const roiProgress = bestRoi > 0 ? Math.min(1, bestRoi / 10) : null;
  const gapProgress =
    gapFromArb != null ? (gapFromArb <= 0 ? 1 : Math.max(0, 1 - gapFromArb / 4)) : null;
  const gapProgressTone =
    gapFromArb != null && gapFromArb <= 0 ? "accent" : gapFromArb != null && gapFromArb < 2 ? "amber" : "muted";

  const ribbonMetrics = [
    { label: "Games", value: gameCount, valueColor: "var(--text-primary)" },
    {
      label: "Kalshi",
      value: kalshiMarkets.length,
      valueColor: kalshiError ? "var(--amber)" : "var(--text-primary)",
    },
    {
      label: "Actionable",
      value: arbCount,
      valueColor: arbCount > 0 ? "var(--accent)" : "var(--text-dim)",
    },
    {
      label: "Monitor",
      value: monitorArbs.length,
      valueColor: monitorArbs.length > 0 ? "var(--amber)" : "var(--text-dim)",
    },
    {
      label: "Rejected",
      value: rejectedArbs.length,
      valueColor: rejectedArbs.length > 0 ? "var(--red)" : "var(--text-dim)",
    },
    { label: "ML", value: mlArbCount, valueColor: mlArbCount > 0 ? "var(--blue)" : "var(--text-dim)" },
    {
      label: "Spread",
      value: spreadArbCount,
      valueColor: spreadArbCount > 0 ? "var(--purple)" : "var(--text-dim)",
    },
    {
      label: "Best ROI",
      value: bestRoi > 0 ? `${bestRoi.toFixed(2)}%` : "—",
      valueColor: bestRoi > 0 ? "var(--accent)" : "var(--text-dim)",
      progress: roiProgress,
      progressTone: "accent",
    },
    {
      label: "Gap",
      value: gapFromArb != null ? `${gapFromArb.toFixed(2)}%` : "—",
      valueColor:
        gapFromArb != null && gapFromArb <= 0
          ? "var(--accent)"
          : gapFromArb != null && gapFromArb < 2
            ? "var(--amber)"
            : "var(--text-dim)",
      progress: gapProgress,
      progressTone: gapProgressTone,
    },
  ];

  return (
    <div className="app-shell fade-in-soft">
      <LoadingBar active={loading} />
      <Sidebar items={navItems} active={tab} onChange={setTab} />

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-left">
            <div className="sport-pill-wrap">
              <button
                type="button"
                className={`sport-pill${sportDropdownOpen ? " is-open" : ""}`}
                onClick={() => setSportDropdownOpen((o) => !o)}
                onBlur={() => setTimeout(() => setSportDropdownOpen(false), 180)}
              >
                {currentSportLabel}
                <ChevronDown size={14} strokeWidth={2} />
              </button>
              <div className={`sport-dropdown-floating${sportDropdownOpen ? " is-visible" : ""}`}>
                {Object.entries(SPORT_CONFIG).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    className={config.sport === key ? "is-active" : ""}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSportSelect(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div
              className={`status-pip${loading ? " is-pulse" : ""}`}
              style={{
                color: loading ? "var(--amber)" : error ? "var(--red)" : "var(--accent)",
                background: loading ? "var(--amber)" : error ? "var(--red)" : "var(--accent)",
              }}
              title={loading ? "Loading" : error ? "Error" : "Live"}
            />
            <span className="terminal-live-label">Live</span>
          </div>
          <div className="app-topbar-right topbar-meta">
            <span>
              API{" "}
              <span className="font-data" style={{ color: "var(--accent)" }}>
                {remaining}
              </span>
            </span>
            <span className="font-data">{lastUpdate ? lastUpdate.toLocaleString() : "—"}</span>
            <button type="button" className="btn btn-accent-green btn-sm" onClick={() => refreshCurrentSport()} disabled={loading}>
              <RefreshCw size={12} />
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-accent-amber btn-sm"
              onClick={() => {
                if (confirm("Uses 4 API calls. Continue?")) forceRefreshAll();
              }}
              disabled={loading}
            >
              <RotateCw size={12} />
              Force All
            </button>
          </div>
        </header>

        <div className="app-content-wrap">
          <div className="app-content">
            {tab !== "notifications" && (
              <div className="terminal-metrics-panel">
                <div className="terminal-metrics-panel__head">
                  <span className="terminal-overline">Scanner</span>
                  <span className="terminal-metrics-panel__head-title">Market overview</span>
                </div>
                <div className="metrics-ribbon">
                  {ribbonMetrics.map((m, i) => (
                    <MetricCard
                      key={i}
                      label={m.label}
                      value={m.value}
                      valueColor={m.valueColor}
                      progress={m.progress}
                      progressTone={m.progressTone}
                    />
                  ))}
                  <div className="metric-ribbon-item metric-ribbon-item--stake">
                    <div className="metric-ribbon-label">Stake</div>
                    <div className="metric-stake-row">
                      <span className="metric-ribbon-value font-data metric-stake-prefix">$</span>
                      <input
                        type="number"
                        className="stake-input-inline"
                        value={stakeInput}
                        onChange={(e) => setStakeInput(e.target.value)}
                        onBlur={commitStake}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitStake();
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab !== "paper" && tab !== "notifications" && (
              <div className="paper-trading-inset">
                <PaperTradingDashboard />
              </div>
            )}

            <div style={{ marginTop: 20 }} className="fade-in-soft">
              {tab === "notifications" && (
                <NotificationsView
                  sportLabel={currentSportLabel}
                  cacheTimeLabel={cacheTimeLabel}
                  rejectedCount={rejectedArbs.length}
                  error={error}
                  kalshiError={kalshiError}
                  propArbsError={propArbsError}
                  gamesCount={games.length}
                  propCreditsEstimate={games.length * 3}
                  propKalshiCount={propKalshiCount}
                />
              )}

              {/* Opportunities Tab */}
              {tab === "arbs" && (
          <>
            {bestImpDetail && arbs.length === 0 && !loading && (
              <div className="terminal-callout terminal-callout--amber">
                <div className="terminal-callout__label">Closest to arbitrage</div>
                <div className="terminal-callout__title">
                  {bestImpDetail.game}: {bestImpDetail.sideA} ({bestImpDetail.bookA}) vs {bestImpDetail.sideB} ({bestImpDetail.bookB})
                </div>
                <div className="terminal-callout__meta type-mono">
                  Implied sum: {bestImpDetail.impSum.toFixed(4)} — need below 1.0000 ({((bestImpDetail.impSum - 1) * 100).toFixed(2)}% away)
                </div>
              </div>
            )}

            {arbs.length === 0 ? (
              <div className="empty-state">
                <Target size={28} style={{ color: "var(--text-dim)", marginBottom: 12 }} />
                <div className="empty-state-title">No arbitrage opportunities detected</div>
                <div className="empty-state-subtitle">True arbs are rare and close fast. Scanner refreshes on each load.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedCount > 0 && (
                  <div className="selection-bar">
                    <span className="selection-count">{selectedCount} selected</span>
                    <button type="button" className="btn btn-primary btn-sm ui-btn--shimmer" onClick={paperTradeSelected}>
                      <TrendingUp size={12} /> Paper Trade Selected
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={clearSelection}>
                      Clear
                    </button>
                  </div>
                )}
                {actionableArbs.length > 0 && (() => {
                  const aML = actionableArbs.filter(a => a.marketType === "h2h");
                  const aSP = actionableArbs.filter(a => a.marketType === "spread");
                  return (
                    <>
                      <div className="section-label" style={{ color: "var(--green)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <CheckCircle size={12} /> Actionable ({actionableArbs.length})
                        </span>
                        {aML.length > 0 && <span style={{ color: "var(--blue)", fontWeight: 500 }}>{aML.length} moneyline</span>}
                        {aSP.length > 0 && <span style={{ color: "var(--purple)", fontWeight: 500 }}>{aSP.length} spread</span>}
                      </div>
                      {actionableArbs.map((a, i) => (
                        <ArbCard
                          key={`actionable-${i}`}
                          staggerMs={i * 45}
                          a={a}
                          onPaperTrade={pt?.paperTrade}
                          canPaperTrade={pt?.canPaperTrade}
                          existingOpenTrade={pt?.getOpenTradeForArb?.(a) ?? null}
                          onAddToPaperTrade={pt?.addToPaperTrade}
                          canAddToPaperTrade={pt?.canAddToPaperTrade}
                          selected={selectedKeys.has(arbToKey(a))}
                          onToggleSelect={toggleSelect}
                          selectable
                        />
                      ))}
                    </>
                  );
                })()}

                {monitorArbs.length > 0 && (() => {
                  const mML = monitorArbs.filter(a => a.marketType === "h2h");
                  const mSP = monitorArbs.filter(a => a.marketType === "spread");
                  return (
                    <>
                      <div className="section-label" style={{ color: "var(--amber)", marginTop: 12 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <Eye size={12} /> Monitor ({monitorArbs.length})
                        </span>
                        {mML.length > 0 && <span style={{ color: "var(--blue)", fontWeight: 500 }}>{mML.length} moneyline</span>}
                        {mSP.length > 0 && <span style={{ color: "var(--purple)", fontWeight: 500 }}>{mSP.length} spread</span>}
                      </div>
                      {monitorArbs.map((a, i) => (
                        <ArbCard
                          key={`monitor-${i}`}
                          staggerMs={i * 45}
                          a={a}
                          onPaperTrade={null}
                          canPaperTrade={null}
                          existingOpenTrade={pt?.getOpenTradeForArb?.(a) ?? null}
                          onAddToPaperTrade={pt?.addToPaperTrade}
                          canAddToPaperTrade={pt?.canAddToPaperTrade}
                          selected={selectedKeys.has(arbToKey(a))}
                          onToggleSelect={toggleSelect}
                          selectable
                        />
                      ))}
                    </>
                  );
                })()}

                {rejectedArbs.length > 0 && <CollapsibleRejectedSection arbs={rejectedArbs} />}
              </div>
            )}
          </>
        )}

        {/* Player Props Tab */}
        {tab === "props" && (
          <>
            {propArbsLoading ? (
              <div className="empty-state">
                <Activity size={24} style={{ color: "var(--text-dim)", marginBottom: 8 }} />
                <div className="empty-state-title">Loading player props…</div>
              </div>
            ) : propArbs.length === 0 ? (
              <div className="empty-state">
                <Users size={28} style={{ color: "var(--text-dim)", marginBottom: 12 }} />
                <div className="empty-state-title">No player prop arbitrage opportunities</div>
                <div className="empty-state-subtitle">Select a league and ensure games are loaded.</div>
                <button className="btn btn-accent-green btn-sm" style={{ marginTop: 14 }}
                  onClick={() => { setPropArbsLoadedForSport(null); fetchPropsForSport(config.sport); }}>
                  <RefreshCw size={12} /> Refresh Props
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedCount > 0 && (
                  <div className="selection-bar">
                    <span className="selection-count">{selectedCount} selected</span>
                    <button type="button" className="btn btn-primary btn-sm ui-btn--shimmer" onClick={paperTradeSelected}>
                      <TrendingUp size={12} /> Paper Trade Selected
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={clearSelection}>
                      Clear
                    </button>
                  </div>
                )}
                {propArbs.filter((a) => a.validationResult?.status === "actionable").map((a, i) => (
                  <PropArbCard
                    key={`prop-a-${i}`}
                    staggerMs={i * 45}
                    a={a}
                    onPaperTrade={pt?.paperTrade}
                    canPaperTrade={pt?.canPaperTrade}
                    existingOpenTrade={pt?.getOpenTradeForArb?.(a) ?? null}
                    onAddToPaperTrade={pt?.addToPaperTrade}
                    canAddToPaperTrade={pt?.canAddToPaperTrade}
                    selected={selectedKeys.has(arbToKey(a))}
                    onToggleSelect={toggleSelect}
                    selectable
                  />
                ))}
                {propArbs.filter((a) => a.validationResult?.status === "monitor").map((a, i) => (
                  <PropArbCard
                    key={`prop-m-${i}`}
                    staggerMs={i * 45}
                    a={a}
                    onPaperTrade={null}
                    canPaperTrade={null}
                    existingOpenTrade={pt?.getOpenTradeForArb?.(a) ?? null}
                    onAddToPaperTrade={pt?.addToPaperTrade}
                    canAddToPaperTrade={pt?.canAddToPaperTrade}
                    selected={selectedKeys.has(arbToKey(a))}
                    onToggleSelect={toggleSelect}
                    selectable
                  />
                ))}
                {propArbs.filter((a) => a.validationResult?.status === "reject").length > 0 && (
                  <CollapsibleRejectedSection arbs={propArbs.filter((a) => a.validationResult?.status === "reject")} CardComponent={PropArbCard} />
                )}
              </div>
            )}
          </>
        )}

        {/* All Games Tab */}
        {tab === "games" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {games.map((g, gi) => {
              const books = Object.entries(g.bookOdds);
              const bestHome = books.reduce((best, [, o]) => { const d = americanToDecimal(o.home); return d && d > best ? d : best; }, 0);
              const bestAway = books.reduce((best, [, o]) => { const d = americanToDecimal(o.away); return d && d > best ? d : best; }, 0);
              const crossImp = bestHome && bestAway ? 1 / bestHome + 1 / bestAway : null;
              const spreadBooks = Object.entries(g.spreadOdds || {});
              return (
                <div key={gi} className="game-card">
                  <div className="game-card-header">
                    <div className="game-matchup">{g.away}<span className="at">@</span>{g.home}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {crossImp != null && (
                        <span
                          className="type-mono"
                          style={{ fontSize: 12, color: crossImp < 1 ? "var(--green)" : crossImp < 1.02 ? "var(--amber)" : "var(--text-dim)" }}
                        >
                          {crossImp.toFixed(4)}
                        </span>
                      )}
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{g.commence ? new Date(g.commence).toLocaleString() : ""}</div>
                    </div>
                  </div>
                  <div style={{ padding: "6px 0" }}>
                    <div style={{ padding: "4px 18px", fontSize: 10, color: "var(--green)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Moneyline</div>
                    <div className="table-scroll table-scroll--odds">
                      <div className="odds-table-header" style={{ gridTemplateColumns: "140px 90px 90px 90px 90px" }}>
                        <span>Book</span>
                        <span style={{ textAlign: "right" }}>{g.home.split(" ").pop()}</span>
                        <span style={{ textAlign: "right" }}>{g.away.split(" ").pop()}</span>
                        <span style={{ textAlign: "right" }}>Home Dec</span>
                        <span style={{ textAlign: "right" }}>Away Dec</span>
                      </div>
                      {books.map(([name, odds], bi) => {
                        const hDec = americanToDecimal(odds.home);
                        const aDec = americanToDecimal(odds.away);
                        const isHomeBest = hDec && Math.abs(hDec - bestHome) < 0.001;
                        const isAwayBest = aDec && Math.abs(aDec - bestAway) < 0.001;
                        return (
                          <div key={bi} className="odds-row" style={{ gridTemplateColumns: "140px 90px 90px 90px 90px" }}>
                            <span style={{ color: "var(--text-muted)" }}>{name}</span>
                            <span
                              className="type-mono"
                              style={{ textAlign: "right", color: isHomeBest ? "var(--green)" : "var(--text-secondary)", fontWeight: isHomeBest ? 600 : 470 }}
                            >
                              {formatAmerican(odds.home)}
                            </span>
                            <span
                              className="type-mono"
                              style={{ textAlign: "right", color: isAwayBest ? "var(--green)" : "var(--text-secondary)", fontWeight: isAwayBest ? 600 : 470 }}
                            >
                              {formatAmerican(odds.away)}
                            </span>
                            <span className="type-mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>
                              {hDec?.toFixed(3) || "—"}
                            </span>
                            <span className="type-mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>
                              {aDec?.toFixed(3) || "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {spreadBooks.length > 0 && (
                    <div style={{ padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
                      <div style={{ padding: "4px 18px", fontSize: 10, color: "var(--purple)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Spreads</div>
                      {spreadBooks.slice(0, 4).map(([name, lines], si) => (
                        <div key={si} style={{ display: "flex", padding: "3px 18px", fontSize: 11 }}>
                          <span style={{ width: 140, color: "var(--text-muted)" }}>{name}</span>
                          <span className="type-mono" style={{ flex: 1, color: "var(--text-secondary)" }}>
                            {lines.map(l => `${l.name.split(" ").pop()} ${l.point > 0 ? "+" : ""}${l.point} (${formatAmerican(l.price)})`).join("  |  ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {games.length === 0 && !loading && (
              <div className="empty-state">
                <Activity size={28} style={{ color: "var(--text-dim)", marginBottom: 12 }} />
                <div className="empty-state-title">No games found</div>
              </div>
            )}
          </div>
        )}

        {/* Kalshi Tab */}
        {tab === "kalshi" && (
          <div>
            {kalshiMarkets.length === 0 && !loading ? (
              <div className="empty-state">
                <BarChart3 size={28} style={{ color: "var(--text-dim)", marginBottom: 12 }} />
                <div className="empty-state-title">No open Kalshi game markets found</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(() => {
                  const byEvent = {};
                  for (const km of kalshiMarkets) {
                    const key = km.eventTicker;
                    if (!byEvent[key]) byEvent[key] = { title: km.eventTitle, markets: [] };
                    byEvent[key].markets.push(km);
                  }
                  return Object.entries(byEvent).map(([eventTicker, { title, markets }]) => (
                    <div key={eventTicker} className="kalshi-event-card">
                      <div className="kalshi-event-header">{title}</div>
                      <div className="table-scroll table-scroll--kalshi">
                        <div className="kalshi-table-header">
                          <span>Market</span>
                          <span style={{ textAlign: "right" }}>Yes Bid</span>
                          <span style={{ textAlign: "right" }}>Yes Ask</span>
                          <span style={{ textAlign: "right" }}>No Bid</span>
                          <span style={{ textAlign: "right" }}>No Ask</span>
                          <span style={{ textAlign: "right" }}>Volume</span>
                        </div>
                      {markets.map((km, i) => {
                        const yesDec = kalshiCentsToDecimal(km.yesAsk);
                        const isML = km.type === "moneyline";
                        return (
                          <div key={i} className="kalshi-row">
                            <div style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                              <span className={`badge ${isML ? "badge-blue" : "badge-purple"}`}>{isML ? "ML" : km.type === "spread" ? "SPR" : km.type}</span>
                              <span>{km.title}</span>
                              {yesDec && (
                                <span className="type-mono" style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 6 }}>
                                  ({formatAmerican(decimalToAmerican(yesDec))})
                                </span>
                              )}
                            </div>
                            <span className="type-mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>
                              {km.yesBid || "—"}
                            </span>
                            <span className="type-mono" style={{ textAlign: "right", color: "var(--green)" }}>
                              {km.yesAsk || "—"}
                            </span>
                            <span className="type-mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>
                              {km.noBid || "—"}
                            </span>
                            <span className="type-mono" style={{ textAlign: "right", color: "var(--green)" }}>
                              {km.noAsk || "—"}
                            </span>
                            <span className="type-mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>
                              {km.volume?.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

              {tab === "paper" && <PaperTradingDashboard defaultExpanded />}
              {tab === "calc" && <BetCalculator stake={stake} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
