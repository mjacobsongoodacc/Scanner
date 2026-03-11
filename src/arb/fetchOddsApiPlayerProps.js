/**
 * Fetch Odds API player props for given events.
 * Uses event-odds endpoint: 1 credit per market per region per event.
 */

import { ODDS_API_BASE, SPORT_CONFIG, PLAYER_PROP_STATS } from "./constants.js";
import { americanToDecimal } from "./oddsUtils.js";

const PROPS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCachedProps(sport) {
  try {
    const raw = localStorage.getItem(`odds_props_cache_${sport}`);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts > PROPS_CACHE_TTL) return null;
    return cached;
  } catch {
    return null;
  }
}

function setCachedProps(sport, data, remaining) {
  try {
    localStorage.setItem(
      `odds_props_cache_${sport}`,
      JSON.stringify({ ts: Date.now(), propsByEvent: data, remaining })
    );
  } catch {}
}

/**
 * Fetch player props for a list of event IDs.
 * @param {string} apiKey - Odds API key
 * @param {string} sport - Sport key (nba, ncaab)
 * @param {string[]} eventIds - Event IDs from main odds fetch
 * @param {boolean} [forceRefresh] - Skip cache
 * @returns {Promise<{ propsByEvent: Record<string, Array>, remaining: string, error?: string }>}
 */
export async function fetchOddsApiPlayerProps(apiKey, sport, eventIds, forceRefresh = false) {
  const sportCfg = SPORT_CONFIG[sport] || SPORT_CONFIG.nba;
  const oddsApiKey = sportCfg.oddsApiKey;
  const markets = PLAYER_PROP_STATS.join(",");

  if (!forceRefresh) {
    const cached = getCachedProps(sport);
    if (cached && cached.propsByEvent) {
      return { propsByEvent: cached.propsByEvent, remaining: cached.remaining ?? "?" };
    }
  }

  const propsByEvent = {};
  let remaining = "?";
  const ids = (eventIds || []).filter(Boolean);
  if (ids.length === 0) return { propsByEvent, remaining };

  for (const eventId of ids) {
    try {
      const url = `${ODDS_API_BASE}/sports/${oddsApiKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${markets}&oddsFormat=american`;
      const resp = await fetch(url);
      remaining = resp.headers.get("x-requests-remaining") || remaining;
      if (resp.status === 429) {
        return { propsByEvent, remaining, error: "Rate limited; try later" };
      }
      if (!resp.ok) {
        return { propsByEvent, remaining, error: `Odds API: ${resp.status}` };
      }
      const eventData = await resp.json();

      const props = [];
      for (const bk of eventData.bookmakers || []) {
        const bookName = bk.title || bk.key;
        for (const mkt of bk.markets || []) {
          const statKey = mkt.key;
          if (!PLAYER_PROP_STATS.includes(statKey)) continue;
          for (const oc of mkt.outcomes || []) {
            const player = oc.description || "";
            const line = oc.point;
            const price = oc.price;
            const isOver = (oc.name || "").toLowerCase() === "over";
            if (!player || line == null || !price) continue;
            const dec = americanToDecimal(price);
            if (!dec) continue;

            let entry = props.find((p) => p.player === player && Math.abs(p.line - line) < 0.01 && p.statType === statKey);
            if (!entry) {
              entry = { player, line, statType: statKey, overs: [], unders: [] };
              props.push(entry);
            }
            if (isOver) entry.overs.push({ book: bookName, price, decimal: dec });
            else entry.unders.push({ book: bookName, price, decimal: dec });
          }
        }
      }
      propsByEvent[eventId] = props;
    } catch (e) {
      return { propsByEvent, remaining, error: e.message };
    }
  }

  setCachedProps(sport, propsByEvent, remaining);
  return { propsByEvent, remaining };
}
