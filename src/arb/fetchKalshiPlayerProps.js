/**
 * Fetch Kalshi player prop markets for a sport.
 * Uses discoverKalshiPropSeries if series ticker not provided.
 * Falls back to KALSHI_PROP_SERIES_PATTERNS when discovery returns null.
 */

import { discoverKalshiPropSeries } from "./discoverKalshiPropSeries.js";
import { KALSHI_PROP_SERIES_PATTERNS } from "./constants.js";

/** Parse "Player Name 25+ points" or "Player Name Over 24.5 points" → { player, threshold, statType } */
const PROP_TITLE_RE = /^(.+?)\s+(\d+)\+\s*(points?|assists?|rebounds?|pts?)\s*$/i;
const PROP_OVER_RE = /^(.+?)\s+over\s+(\d+(?:\.\d+)?)\s*(points?|assists?|rebounds?|pts?)\s*$/i;

function parseKalshiPropTitle(title) {
  if (!title || typeof title !== "string") return null;
  let m = title.match(PROP_TITLE_RE);
  if (m) {
    return {
      player: m[1].trim(),
      threshold: parseInt(m[2], 10),
      statType: m[3].toLowerCase().replace(/s$/, ""),
    };
  }
  m = title.match(PROP_OVER_RE);
  if (m) {
    const line = parseFloat(m[2]);
    return {
      player: m[1].trim(),
      threshold: Math.ceil(line),
      statType: m[3].toLowerCase().replace(/s$/, ""),
    };
  }
  return null;
}

/**
 * Fetch Kalshi player prop markets.
 * @param {"nba"|"ncaab"} sport
 * @param {string|null} [seriesTicker] - If provided, skip discovery
 * @returns {Promise<Array>} Array of { eventTicker, eventTitle, ticker, title, type, yesBid, yesAsk, noBid, noAsk, volume, yesBaSpread, noBaSpread, parsedPlayer, parsedThreshold, parsedStatType }
 */
async function fetchMarketsForTicker(ticker) {
  const markets = [];
  let cursor = "";
  let pages = 0;
  do {
    const params = new URLSearchParams({
      status: "open",
      with_nested_markets: "true",
      limit: "200",
      series_ticker: ticker,
    });
    if (cursor) params.set("cursor", cursor);

    const path = `/trade-api/v2/events?${params}`;
    const url = `/kalshi-api?path=${encodeURIComponent(path)}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`Kalshi: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();

    for (const ev of data.events || []) {
      for (const mkt of ev.markets || []) {
        if (mkt.status === "finalized" || mkt.status === "closed") continue;
        const dollarsToCents = (v) => {
          if (v == null) return 0;
          if (typeof v === "number") return v <= 1 ? Math.round(v * 100) : Math.round(v);
          const s = String(v).trim();
          return s ? Math.round(parseFloat(s) * 100) : 0;
        };
        const yesAsk = dollarsToCents(mkt.yes_ask_dollars ?? mkt.yes_ask);
        const noAsk = dollarsToCents(mkt.no_ask_dollars ?? mkt.no_ask);
        const yesBid = dollarsToCents(mkt.yes_bid_dollars ?? mkt.yes_bid);
        const noBid = dollarsToCents(mkt.no_bid_dollars ?? mkt.no_bid);
        if (!yesAsk && !noAsk) continue;

        const volRaw = mkt.volume_fp ?? mkt.volume ?? 0;
        const vol = volRaw ? Math.floor(parseFloat(volRaw)) : 0;
        const yesBaSpread = yesAsk && yesBid ? yesAsk - yesBid : 99;
        const noBaSpread = noAsk && noBid ? noAsk - noBid : 99;
        if (yesBaSpread > 15 && noBaSpread > 15) continue;

        const parsed = parseKalshiPropTitle(mkt.title || "");
        if (!parsed) continue;

        const statToMarket = { points: "player_points", assist: "player_assists", rebound: "player_rebounds", pt: "player_points" };
        markets.push({
          eventTicker: ev.event_ticker,
          eventTitle: ev.title || "",
          ticker: mkt.ticker || "",
          title: mkt.title || "",
          type: statToMarket[parsed.statType] || "player_points",
          yesBid,
          yesAsk,
          noBid,
          noAsk,
          volume: vol,
          yesBaSpread,
          noBaSpread,
          closeTime: mkt.close_time || "",
          parsedPlayer: parsed.player,
          parsedThreshold: parsed.threshold,
          parsedStatType: parsed.statType,
        });
      }
    }
    cursor = data.cursor || "";
    pages++;
  } while (cursor && pages < 5);
  return markets;
}

export async function fetchKalshiPlayerProps(sport, seriesTicker = null) {
  const ticker = seriesTicker ?? (await discoverKalshiPropSeries(sport));

  if (ticker) {
    return fetchMarketsForTicker(ticker);
  }

  const patterns = KALSHI_PROP_SERIES_PATTERNS[sport];
  if (patterns) {
    for (const candidate of patterns) {
      try {
        const m = await fetchMarketsForTicker(candidate);
        if (m.length > 0) return m;
      } catch {}
    }
  }

  return [];
}
