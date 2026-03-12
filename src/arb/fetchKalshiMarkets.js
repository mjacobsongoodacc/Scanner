import { KALSHI_GAME_SERIES } from "./constants.js";
import { parseKalshiSpreadTitle, parseKalshiMoneylineTitle } from "./kalshiUtils.js";

export async function fetchKalshiGameMarkets(sport) {
  const cfg = KALSHI_GAME_SERIES[sport] || KALSHI_GAME_SERIES.nba;
  const markets = [];

  for (const [type, seriesTicker] of Object.entries(cfg)) {
    let cursor = "";
    let pages = 0;
    do {
      const params = new URLSearchParams({
        status: "open",
        with_nested_markets: "true",
        limit: "200",
        series_ticker: seriesTicker,
      });
      if (cursor) params.set("cursor", cursor);

      const kalshiPath = `/trade-api/v2/events?${params}`;
      const url = `/kalshi-api?path=${encodeURIComponent(kalshiPath)}`;
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

          if (vol === 0) continue;
          if (yesBaSpread > 15 && noBaSpread > 15) continue;

          let parsedTeam = null;
          let parsedSpread = null;
          let effectiveType = type;
          const spreadParsed = parseKalshiSpreadTitle(mkt.title || "");
          if (spreadParsed) {
            effectiveType = "spread";
            parsedTeam = spreadParsed.team;
            parsedSpread = spreadParsed.spread;
          } else if (type === "moneyline") {
            parsedTeam = parseKalshiMoneylineTitle(mkt.title || "");
          }

          markets.push({
            eventTicker: ev.event_ticker,
            eventTitle: ev.title || "",
            ticker: mkt.ticker || "",
            title: mkt.title || "",
            type: effectiveType,
            yesBid,
            yesAsk,
            noBid,
            noAsk,
            volume: vol,
            yesBaSpread,
            noBaSpread,
            closeTime: mkt.close_time || "",
            parsedTeam,
            parsedSpread,
          });
        }
      }

      cursor = data.cursor || "";
      pages++;
    } while (cursor && pages < 5);
  }

  return markets;
}
