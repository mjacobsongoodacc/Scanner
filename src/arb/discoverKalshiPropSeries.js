/**
 * Discover Kalshi player prop series tickers via API.
 * Calls /series, filters by Sports/Basketball and title patterns.
 * Caches result in sessionStorage for the session.
 */

const CACHE_KEY_PREFIX = "kalshi_prop_series_";
const PROP_KEYWORDS = ["points", "player", "prop", "pts", "assists", "rebounds"];

/**
 * Check if series title suggests player props (points, assists, rebounds).
 */
function isPlayerPropLike(series) {
  const title = (series.title || "").toLowerCase();
  const ticker = (series.ticker || "").toUpperCase();
  const cat = (series.category || "").toLowerCase();
  const tags = (series.tags || []).map((t) => (t || "").toLowerCase());

  if (cat !== "sports") return false;
  if (!tags.includes("basketball") && !title.includes("nba") && !title.includes("ncaa") && !ticker.includes("NBA") && !ticker.includes("NCAAB")) {
    return false;
  }
  return PROP_KEYWORDS.some((kw) => title.includes(kw) || ticker.includes(kw.toUpperCase()));
}

/**
 * Discover player prop series ticker for a sport.
 * @param {"nba"|"ncaab"} sport
 * @returns {Promise<string|null>} Series ticker or null
 */
export async function discoverKalshiPropSeries(sport) {
  const cacheKey = `${CACHE_KEY_PREFIX}${sport}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached === "null" ? null : cached;
  } catch {}

  const params = new URLSearchParams({ limit: "500" });
  const path = `/trade-api/v2/series?${params}`;
  const url = `/kalshi-api?path=${encodeURIComponent(path)}`;

  let data;
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`Kalshi: ${resp.status} ${resp.statusText}`);
    data = await resp.json();
  } catch (e) {
    return null;
  }

  const seriesList = data.series || [];
  const sportUpper = sport.toUpperCase();
  const match = seriesList.find((s) => {
    if (!isPlayerPropLike(s)) return false;
    const t = (s.ticker || "").toUpperCase();
    const title = (s.title || "").toLowerCase();
    if (sport === "nba") return t.includes("NBA") || title.includes("nba") || title.includes("pro basketball");
    if (sport === "ncaab") return t.includes("NCAAB") || t.includes("NCAAMB") || title.includes("ncaa") || title.includes("college");
    return false;
  });

  const result = match ? match.ticker : null;
  try {
    sessionStorage.setItem(cacheKey, String(result));
  } catch {}
  return result;
}
