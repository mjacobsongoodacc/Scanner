import { useState, useEffect, useCallback, useRef } from "react";
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
  fetchKalshiGameMarkets,
  kalshiCentsToDecimal,
} from "../arb/index.js";
import ArbCard, { arbToKey } from "./ArbCard.jsx";
import BetCalculator from "./BetCalculator.jsx";
import CollapsibleRejectedSection from "./CollapsibleRejectedSection.jsx";
import { FONT, MONO, badge } from "../styles.js";

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

  const stakeRef = useRef(stake);
  stakeRef.current = stake;

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
              name: o.name,
              point: o.point,
              price: o.price,
            }));
            if (lines.length) spreadOdds[name] = lines;
          }
        }
      });
      return { home: g.home_team, away: g.away_team, commence: g.commence_time, bookOdds, spreadOdds };
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
          throw new Error("Odds API key missing. Add VITE_ODDS_API_KEY to env (local: .env; Netlify: Site settings) and redeploy.");
        }
        const oddsUrl = `${ODDS_API_BASE}/sports/${oddsApiKey}/odds?apiKey=${config.apiKey}&regions=us&markets=h2h,spreads&oddsFormat=american`;
        const oddsResp = await fetch(oddsUrl);
        if (!oddsResp.ok) {
          const msg = oddsResp.status === 401
            ? "Odds API 401: Invalid key. Use your the-odds-api.com key (not Kalshi). Add VITE_ODDS_API_KEY to .env"
            : `Odds API: ${oddsResp.status} ${oddsResp.statusText}`;
          throw new Error(msg);
        }
        rem = oddsResp.headers.get("x-requests-remaining") || "?";
        const oddsData = await oddsResp.json();
        parsed = parseOddsData(oddsData);
        try {
          localStorage.setItem(
            `odds_cache_${sport}`,
            JSON.stringify({ ts: Date.now(), remaining: rem, games: parsed, raw: oddsData })
          );
        } catch {}
      }

      let kalshiMarkets = [];
      let kalshiErr = null;
      try {
        kalshiMarkets = await fetchKalshiGameMarkets(sport);
      } catch (e) {
        kalshiErr = e.message;
      }

      return {
        games: parsed,
        kalshiMarkets,
        kalshiError: kalshiErr,
        remaining: rem,
        lastUpdate: Date.now(),
      };
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
              next[sport] = {
                games: data.games,
                kalshiMarkets: data.kalshiMarkets,
                kalshiError: data.kalshiError ?? null,
                error: null,
                loaded: true,
              };
              lastRem = data.remaining ?? lastRem;
              lastTs = data.lastUpdate ?? lastTs;
            } else {
              next[sport] = {
                ...prev[sport],
                error: error ?? null,
                loaded: true,
              };
            }
          }
          setRemaining(lastRem);
          if (lastTs) setLastUpdate(new Date(lastTs));
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    [fetchSportData]
  );

  useEffect(() => {
    fetchAllSports(false);
  }, [fetchAllSports]);

  const refreshCurrentSport = useCallback(() => {
    setLoading(true);
    fetchSportData(config.sport, false)
      .then((data) => {
        if (data) {
          setSportData((prev) => ({
            ...prev,
            [config.sport]: {
              games: data.games,
              kalshiMarkets: data.kalshiMarkets,
              kalshiError: data.kalshiError ?? null,
              error: null,
              loaded: true,
            },
          }));
          setRemaining(data.remaining ?? "?");
          if (data.lastUpdate) setLastUpdate(new Date(data.lastUpdate));
        }
      })
      .finally(() => setLoading(false));
  }, [config.sport, fetchSportData]);

  const forceRefreshAll = useCallback(() => {
    fetchAllSports(true);
  }, [fetchAllSports]);

  useEffect(() => {
    if (games.length === 0 && kalshiMarkets.length === 0) return;
    const result = findArbs(games, kalshiMarkets, stake);
    const validated = validateArbs(result.opps);
    setArbs(validated.all);
    setBestImpSum(result.bestImpSum);
    setBestImpDetail(result.bestImpDetail);
  }, [stake, games, kalshiMarkets]);

  useEffect(() => {
    if (pt?.reportOpportunities && arbs.length > 0) pt.reportOpportunities(arbs);
  }, [pt?.reportOpportunities, arbs]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [config.sport]);

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
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function paperTradeSelected() {
    const selectableArbs = [...actionableArbs, ...monitorArbs];
    const selected = selectableArbs.filter((a) => selectedKeys.has(arbToKey(a)));
    const toAdd = [];
    const toCreate = [];
    for (const arb of selected) {
      const existing = pt?.getOpenTradeForArb?.(arb);
      if (existing) toAdd.push(arb);
      else toCreate.push(arb);
    }
    for (const arb of toAdd) pt?.addToPaperTrade?.(arb);
    if (toCreate.length) pt?.paperTradeBulk?.(toCreate);
    setSelectedKeys(new Set());
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  const selectedCount = selectedKeys.size;

  function handleSportSelect(newSport) {
    if (newSport !== config.sport && onConfigChange) {
      onConfigChange({ ...config, sport: newSport });
    }
    setSportDropdownOpen(false);
  }

  const currentSportLabel = SPORT_CONFIG[config.sport]?.label ?? config.sport?.toUpperCase() ?? "NBA";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: FONT, color: "#bbb" }}>
      <div style={{ padding: "clamp(12px, 2vw, 16px) clamp(16px, 4vw, 28px)", borderBottom: "1px solid #1a1a1a", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(14px, 2.5vw, 16px)", color: "#e0e0e0", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              Arb Scanner
              <span style={{ fontWeight: 400, color: "#666" }}>/</span>
              <button
                type="button"
                onClick={() => setSportDropdownOpen((o) => !o)}
                onBlur={() => setTimeout(() => setSportDropdownOpen(false), 150)}
                style={{
                  padding: "2px 8px",
                  background: sportDropdownOpen ? "#1a2a1a" : "transparent",
                  border: "1px solid transparent",
                  borderRadius: 4,
                  color: sportDropdownOpen ? "#5a9e6f" : "#888",
                  fontSize: "inherit",
                  fontFamily: FONT,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {currentSportLabel} ▾
              </button>
            </h1>
            {sportDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "#111",
                  border: "1px solid #2a2a2a",
                  borderRadius: 4,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  zIndex: 100,
                  minWidth: 180,
                }}
              >
                {Object.entries(SPORT_CONFIG).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSportSelect(key)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "10px 14px",
                      background: config.sport === key ? "#1a2a1a" : "transparent",
                      border: "none",
                      color: config.sport === key ? "#5a9e6f" : "#bbb",
                      fontSize: 13,
                      fontFamily: FONT,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: loading ? "#c89030" : error ? "#c04040" : "#5a9e6f",
            animation: loading ? "pulse 1.2s infinite" : "none",
          }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "#555" }}>
          <span>API: <span style={{ color: "#5a9e6f" }}>{remaining}</span></span>
          <span>{lastUpdate ? lastUpdate.toLocaleDateString() : "—"}</span>
          <button onClick={() => refreshCurrentSport()} disabled={loading}
            style={{
              padding: "6px 12px", background: "#151515", border: "1px solid #2a2a2a",
              borderRadius: 4, color: "#5a9e6f", fontSize: 11, fontFamily: FONT,
              cursor: "pointer", fontWeight: 500,
            }}>
            Refresh Current
          </button>
          <button onClick={() => { if (confirm("This uses 4 Odds API calls (one per sport). Continue?")) forceRefreshAll(); }} disabled={loading}
            style={{
              padding: "6px 12px", background: "#151515", border: "1px solid #3a2a00",
              borderRadius: 4, color: "#c89030", fontSize: 11, fontFamily: FONT,
              cursor: "pointer", fontWeight: 500,
            }}>
            Force Refresh All Sports
          </button>
        </div>
      </div>

      <div style={{ display: "flex", padding: "0 28px", borderBottom: "1px solid #1a1a1a", flexWrap: "wrap", alignItems: "center" }}>
        {[
          { label: "Games", value: gameCount, color: "#ccc" },
          { label: "Kalshi Mkts", value: kalshiMarkets.length, color: kalshiError ? "#c89030" : "#5a8fae" },
          { label: "Actionable", value: arbCount, color: arbCount > 0 ? "#5a9e6f" : "#555" },
          { label: "Monitor", value: monitorArbs.length, color: monitorArbs.length > 0 ? "#c89030" : "#555" },
          { label: "Rejected", value: rejectedArbs.length, color: rejectedArbs.length > 0 ? "#c04040" : "#555" },
          { label: "ML", value: mlArbCount, color: mlArbCount > 0 ? "#6a9fd8" : "#555" },
          { label: "Spread", value: spreadArbCount, color: spreadArbCount > 0 ? "#a07dba" : "#555" },
          { label: "Kalshi", value: kalshiArbCount, color: kalshiArbCount > 0 ? "#5a8fae" : "#555" },
          { label: "Best ROI", value: bestRoi > 0 ? `${bestRoi.toFixed(2)}%` : "—", color: bestRoi > 0 ? "#5a9e6f" : "#555" },
          { label: "Gap", value: gapFromArb != null ? `${gapFromArb.toFixed(2)}%` : "—", color: gapFromArb != null && gapFromArb <= 0 ? "#5a9e6f" : gapFromArb != null && gapFromArb < 2 ? "#c89030" : "#555" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "12px 0", marginRight: 24 }}>
            <div style={{ fontSize: 10, color: "#555", marginBottom: 3, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 18, color: s.color, fontWeight: 400, fontFamily: MONO }}>{s.value}</div>
          </div>
        ))}
        <div style={{ padding: "12px 0", marginRight: 24 }}>
          <div style={{ fontSize: 10, color: "#555", marginBottom: 3, fontWeight: 500 }}>Stake</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 18, color: "#ccc", fontWeight: 400, fontFamily: MONO }}>$</span>
            <input
              type="number"
              value={stakeInput}
              onChange={e => setStakeInput(e.target.value)}
              onBlur={commitStake}
              onKeyDown={e => { if (e.key === "Enter") commitStake(); }}
              style={{
                width: 72, padding: "3px 6px", fontSize: 18, fontWeight: 400,
                fontFamily: MONO, background: "transparent", border: "1px solid transparent",
                borderRadius: 3, color: "#ccc", outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => { e.target.style.borderColor = "#2a2a2a"; e.target.style.background = "#111"; }}
              onBlurCapture={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; }}
            />
          </div>
        </div>
      </div>

      {tab !== "paper" && (
        <div style={{ padding: "0 28px" }}>
          <PaperTradingDashboard />
        </div>
      )}

      <div style={{ display: "flex", padding: "0 28px", borderBottom: "1px solid #1a1a1a" }}>
        {[
          { key: "arbs", label: `Opportunities${arbs.length > 0 ? ` (${arbs.length})` : ""}` },
          { key: "paper", label: "Paper Trading" },
          { key: "games", label: `All Games (${gameCount})` },
          { key: "kalshi", label: `Kalshi (${kalshiMarkets.length})` },
          { key: "calc", label: "Calculator" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "12px 20px", background: "transparent", border: "none",
              borderBottom: tab === t.key ? "2px solid #5a9e6f" : "2px solid transparent",
              color: tab === t.key ? "#e0e0e0" : "#555",
              fontSize: 12, fontFamily: FONT, cursor: "pointer", fontWeight: tab === t.key ? 500 : 400,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 28px" }}>
        <div style={{ padding: "10px 14px", background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, marginBottom: 14, fontSize: 12, color: "#555", lineHeight: 1.6 }}>
          Sportsbook odds cached daily (1 API call/day). Kalshi prices refresh on each load.
          Execution validation: only arbs with sufficient liquidity and tight spread shown as actionable.
          {getCachedOdds() && (
            <span style={{ marginLeft: 6 }}>
              Cached: {new Date(getCachedOdds().ts).toLocaleString()}
            </span>
          )}
          {rejectedArbs.length > 0 && (
            <span style={{ color: "#c04040", marginLeft: 6 }}>
              {rejectedArbs.length} phantom/stale arbs rejected.
            </span>
          )}
        </div>

        {error && (
          <div style={{ padding: 14, background: "#1a0f0f", border: "1px solid #3a1a1a", borderRadius: 4, color: "#c04040", fontSize: 12, marginBottom: 14 }}>
            Error: {error}
          </div>
        )}
        {kalshiError && (
          <div style={{ padding: 14, background: "#1a1500", border: "1px solid #3a2a00", borderRadius: 4, color: "#c89030", fontSize: 12, marginBottom: 14 }}>
            Kalshi: {kalshiError} — cross-exchange arbs unavailable, showing book-vs-book only
          </div>
        )}

        {tab === "arbs" && (
          <>
            {bestImpDetail && arbs.length === 0 && !loading && (
              <div style={{ padding: 14, background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 500 }}>Closest to Arbitrage</div>
                <div style={{ fontSize: 13, color: "#c89030" }}>
                  {bestImpDetail.game}: {bestImpDetail.sideA} ({bestImpDetail.bookA}) vs {bestImpDetail.sideB} ({bestImpDetail.bookB})
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  Implied sum: {bestImpDetail.impSum.toFixed(4)} — need below 1.0000 ({((bestImpDetail.impSum - 1) * 100).toFixed(2)}% away)
                </div>
              </div>
            )}

            {arbs.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>No arbitrage opportunities detected</div>
                <div style={{ fontSize: 12, color: "#333" }}>True arbs are rare and close fast. Scanner refreshes on each load.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedCount > 0 && (
                  <div style={{
                    padding: "12px 16px",
                    background: "#111",
                    border: "1px solid #1a2a1a",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}>
                    <span style={{ fontSize: 12, color: "#888" }}>{selectedCount} selected</span>
                    <button
                      onClick={paperTradeSelected}
                      style={{
                        padding: "8px 16px",
                        background: "#2a6e3f",
                        border: "1px solid #2a6e3f",
                        borderRadius: 4,
                        color: "#fff",
                        fontSize: 12,
                        fontFamily: FONT,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Paper Trade Selected
                    </button>
                    <button
                      onClick={clearSelection}
                      style={{
                        padding: "8px 16px",
                        background: "#151515",
                        border: "1px solid #2a2a2a",
                        borderRadius: 4,
                        color: "#888",
                        fontSize: 12,
                        fontFamily: FONT,
                        cursor: "pointer",
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
                {actionableArbs.length > 0 && (() => {
                  const aML = actionableArbs.filter(a => a.marketType === "h2h");
                  const aSP = actionableArbs.filter(a => a.marketType === "spread");
                  return (
                    <>
                      <div style={{ fontSize: 11, color: "#5a9e6f", fontWeight: 500, marginBottom: 2, display: "flex", gap: 10, alignItems: "center" }}>
                        <span>Actionable ({actionableArbs.length})</span>
                        {aML.length > 0 && <span style={{ color: "#6a9fd8" }}>{aML.length} moneyline</span>}
                        {aSP.length > 0 && <span style={{ color: "#a07dba" }}>{aSP.length} spread</span>}
                      </div>
                      {actionableArbs.map((a, i) => (
                        <ArbCard
                          key={`actionable-${i}`}
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
                      <div style={{ fontSize: 11, color: "#c89030", fontWeight: 500, marginTop: 10, marginBottom: 2, display: "flex", gap: 10, alignItems: "center" }}>
                        <span>Monitor: wide spread and/or low volume ({monitorArbs.length})</span>
                        {mML.length > 0 && <span style={{ color: "#6a9fd8" }}>{mML.length} moneyline</span>}
                        {mSP.length > 0 && <span style={{ color: "#a07dba" }}>{mSP.length} spread</span>}
                      </div>
                      {monitorArbs.map((a, i) => (
                        <ArbCard
                          key={`monitor-${i}`}
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

                {rejectedArbs.length > 0 && (
                  <CollapsibleRejectedSection arbs={rejectedArbs} />
                )}
              </div>
            )}
          </>
        )}

        {tab === "games" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {games.map((g, gi) => {
              const books = Object.entries(g.bookOdds);
              const bestHome = books.reduce((best, [, o]) => { const d = americanToDecimal(o.home); return d && d > best ? d : best; }, 0);
              const bestAway = books.reduce((best, [, o]) => { const d = americanToDecimal(o.away); return d && d > best ? d : best; }, 0);
              const crossImp = bestHome && bestAway ? 1 / bestHome + 1 / bestAway : null;
              const spreadBooks = Object.entries(g.spreadOdds || {});

              return (
                <div key={gi} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a1a1a" }}>
                    <div style={{ fontSize: 13, color: "#e0e0e0" }}>{g.away} <span style={{ color: "#444", margin: "0 6px" }}>@</span> {g.home}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {crossImp != null && (
                        <span style={{ fontSize: 11, color: crossImp < 1 ? "#5a9e6f" : crossImp < 1.02 ? "#c89030" : "#555", fontFamily: MONO }}>
                          {crossImp.toFixed(4)}
                        </span>
                      )}
                      <div style={{ fontSize: 11, color: "#555" }}>{g.commence ? new Date(g.commence).toLocaleString() : ""}</div>
                    </div>
                  </div>
                  <div style={{ padding: "6px 0" }}>
                    <div style={{ padding: "3px 18px", fontSize: 10, color: "#5a9e6f", fontWeight: 500 }}>Moneyline</div>
                    <div style={{ display: "grid", gridTemplateColumns: "140px 90px 90px 90px 90px", padding: "3px 18px", fontSize: 10, color: "#444", fontWeight: 500 }}>
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
                        <div key={bi} style={{ display: "grid", gridTemplateColumns: "140px 90px 90px 90px 90px", padding: "3px 18px", fontSize: 12, borderTop: bi > 0 ? "1px solid #0e0e0e" : "none" }}>
                          <span style={{ color: "#888" }}>{name}</span>
                          <span style={{ textAlign: "right", color: isHomeBest ? "#5a9e6f" : "#bbb", fontWeight: isHomeBest ? 600 : 400, fontFamily: MONO }}>{formatAmerican(odds.home)}</span>
                          <span style={{ textAlign: "right", color: isAwayBest ? "#5a9e6f" : "#bbb", fontWeight: isAwayBest ? 600 : 400, fontFamily: MONO }}>{formatAmerican(odds.away)}</span>
                          <span style={{ textAlign: "right", color: "#555", fontFamily: MONO }}>{hDec?.toFixed(3) || "—"}</span>
                          <span style={{ textAlign: "right", color: "#555", fontFamily: MONO }}>{aDec?.toFixed(3) || "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                  {spreadBooks.length > 0 && (
                    <div style={{ padding: "6px 0", borderTop: "1px solid #1a1a1a" }}>
                      <div style={{ padding: "3px 18px", fontSize: 10, color: "#5a8fae", fontWeight: 500 }}>Spreads</div>
                      {spreadBooks.slice(0, 4).map(([name, lines], si) => (
                        <div key={si} style={{ display: "flex", padding: "2px 18px", fontSize: 11 }}>
                          <span style={{ width: 140, color: "#888" }}>{name}</span>
                          <span style={{ flex: 1, color: "#bbb", fontFamily: MONO }}>
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
              <div style={{ padding: 40, textAlign: "center", color: "#555", fontSize: 13 }}>No games found.</div>
            )}
          </div>
        )}

        {tab === "kalshi" && (
          <div>
            {kalshiError && (
              <div style={{ padding: 14, background: "#1a1500", border: "1px solid #3a2a00", borderRadius: 4, color: "#c89030", fontSize: 12, marginBottom: 14 }}>{kalshiError}</div>
            )}
            {kalshiMarkets.length === 0 && !loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#555", fontSize: 13 }}>No open Kalshi game markets found.</div>
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
                    <div key={eventTicker} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ padding: "10px 18px", borderBottom: "1px solid #1a1a1a", fontSize: 13, color: "#e0e0e0" }}>{title}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px 70px 80px", padding: "5px 18px", fontSize: 10, color: "#444", fontWeight: 500, borderBottom: "1px solid #0e0e0e" }}>
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
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px 70px 80px", padding: "7px 18px", fontSize: 12, borderTop: i > 0 ? "1px solid #0e0e0e" : "none" }}>
                            <div style={{ color: "#bbb", display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={badge(isML ? "#6a9fd8" : "#a07dba")}>{isML ? "ML" : km.type === "spread" ? "SPR" : km.type}</span>
                              {km.title}
                              {yesDec && <span style={{ fontSize: 11, color: "#555", marginLeft: 6, fontFamily: MONO }}>({formatAmerican(decimalToAmerican(yesDec))})</span>}
                            </div>
                            <span style={{ textAlign: "right", color: "#888", fontFamily: MONO }}>{km.yesBid || "—"}</span>
                            <span style={{ textAlign: "right", color: "#5a9e6f", fontFamily: MONO }}>{km.yesAsk || "—"}</span>
                            <span style={{ textAlign: "right", color: "#888", fontFamily: MONO }}>{km.noBid || "—"}</span>
                            <span style={{ textAlign: "right", color: "#5a9e6f", fontFamily: MONO }}>{km.noAsk || "—"}</span>
                            <span style={{ textAlign: "right", color: "#555", fontFamily: MONO }}>{km.volume?.toLocaleString()}</span>
                          </div>
                        );
                      })}
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

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
      `}</style>
    </div>
  );
}
