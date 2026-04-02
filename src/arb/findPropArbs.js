/**
 * Find arbitrage opportunities on player props (Over/Under).
 * Cross-book: best Over vs best Under. Kalshi: YES/NO vs sportsbook.
 */

import { americanToDecimal, decimalToAmerican } from "./oddsUtils.js";
import { kalshiCentsToDecimal, teamMatch } from "./kalshiUtils.js";
import { playerNamesMatch, lineAligns, getLineDiff } from "./playerPropUtils.js";
import { buildStakePlan } from "./stakeSizing.js";

/** Parse "Team A @ Team B", "Team A vs Team B", or "Team A at Team B" from event title. */
function parseEventTitleForTeams(title) {
  if (!title || typeof title !== "string") return null;
  const m = title.match(/^(.+?)\s+(?:@|vs\.?|v\.?|at)\s+(.+?)\s*$/i);
  if (!m) return null;
  return [m[1].trim(), m[2].trim()];
}

/**
 * Find player prop arbs.
 * @param {Array} games - Games with eventId, home, away, commence
 * @param {Record<string, Array>} propsByEvent - Odds API props by eventId
 * @param {Array} kalshiPropMarkets - Kalshi player prop markets
 * @param {number} stake
 * @param {number} nearArbThreshold
 */
export function findPropArbs(games, propsByEvent, kalshiPropMarkets, stake, nearArbThreshold = 1.03) {
  const opps = [];
  let bestImpSum = Infinity;
  let bestImpDetail = null;

  function record({ impSum, decA, decB, sideA, bookA, americanA, sideB, bookB, americanB, game, kalshiTicker, marketType, kalshiVolume, kalshiBaSpread, kalshiLeg, player, line, statType, matchQuality }) {
    if (!decA || !decB) return;
    const stakePlan = buildStakePlan({ decA, decB, stake, kalshiLeg });
    if (!stakePlan) return;

    const exactImpSum = stakePlan.impSum ?? impSum;
    if (exactImpSum < bestImpSum) {
      bestImpSum = exactImpSum;
      bestImpDetail = { impSum: exactImpSum, sideA, bookA, sideB, bookB, game: `${game.away} @ ${game.home}` };
    }
    if (exactImpSum >= nearArbThreshold) return;

    const roi = stakePlan.roi;
    const isKalshi = !!kalshiTicker;
    let confidence = "high";
    if (isKalshi) {
      const vol = kalshiVolume || 0;
      const baSpread = kalshiBaSpread ?? 99;
      if (vol < 100 || baSpread > 5) confidence = "low";
      else if (vol < 500 || baSpread > 3) confidence = "medium";
    }
    if (roi > 10) confidence = "low";
    else if (roi > 5 && confidence !== "low") confidence = "medium";

    opps.push({
      game: `${game.away} @ ${game.home}`,
      commence: game.commence,
      sideA,
      bookA,
      americanA: stakePlan.americanA ?? americanA,
      decimalA: stakePlan.decimalA,
      sideB,
      bookB,
      americanB: stakePlan.americanB ?? americanB,
      decimalB: stakePlan.decimalB,
      impSum: exactImpSum,
      roi,
      betA: stakePlan.betA,
      betB: stakePlan.betB,
      payoutA: stakePlan.payoutA,
      payoutB: stakePlan.payoutB,
      usedStake: stakePlan.usedStake,
      unusedStake: stakePlan.unusedStake,
      profit: stakePlan.profit,
      isTrueArb: exactImpSum < 1.0 && stakePlan.profit > 0,
      kalshiTicker: kalshiTicker || "",
      marketType: marketType || "player_points",
      kalshiVolume: kalshiVolume ?? null,
      kalshiBaSpread: kalshiBaSpread ?? null,
      kalshiContractsA: stakePlan.kalshiContractsA,
      kalshiContractsB: stakePlan.kalshiContractsB,
      kalshiFeeA: stakePlan.kalshiFeeA,
      kalshiFeeB: stakePlan.kalshiFeeB,
      confidence,
      propPlayer: player || null,
      propLine: line ?? null,
      propStatType: statType || null,
      matchQuality: matchQuality || null,
    });
  }

  for (const game of games) {
    const eventId = game.eventId;
    const gameProps = (propsByEvent || {})[eventId] || [];
    if (gameProps.length === 0) continue;

    for (const prop of gameProps) {
      const { player, line, statType, overs, unders } = prop;
      if (!player || line == null || !overs?.length || !unders?.length) continue;

      const bestOver = overs.reduce((best, o) => (o.decimal > (best?.decimal || 0) ? o : best), null);
      const bestUnder = unders.reduce((best, u) => (u.decimal > (best?.decimal || 0) ? u : best), null);
      if (!bestOver || !bestUnder || bestOver.book === bestUnder.book) continue;

      for (const overEntry of overs) {
        for (const underEntry of unders) {
          if (overEntry.book === underEntry.book) continue;
          const imp = 1 / overEntry.decimal + 1 / underEntry.decimal;
          if (imp >= nearArbThreshold) continue;
          record({
            impSum: imp,
            decA: overEntry.decimal,
            decB: underEntry.decimal,
            sideA: `Over ${line} @ ${overEntry.book}`,
            bookA: overEntry.book,
            americanA: overEntry.price,
            sideB: `Under ${line} @ ${underEntry.book}`,
            bookB: underEntry.book,
            americanB: underEntry.price,
            game,
            marketType: statType,
            player,
            line,
            statType,
            matchQuality: "Line aligned",
          });
        }
      }
    }

    const kalshiForGame = (kalshiPropMarkets || []).filter((km) => {
      const teams = parseEventTitleForTeams(km.eventTitle);
      if (!teams) return false;
      return (teamMatch(teams[0], game.away) && teamMatch(teams[1], game.home)) || (teamMatch(teams[0], game.home) && teamMatch(teams[1], game.away));
    });

    for (const prop of gameProps) {
      const { player, line, statType, overs, unders } = prop;
      if (!player || line == null) continue;

      for (const km of kalshiForGame) {
        if (km.type !== statType) continue;
        if (!playerNamesMatch(km.parsedPlayer, player)) continue;
        const kalshiThreshold = km.parsedThreshold;
        if (!lineAligns(kalshiThreshold, line)) continue;

        const lineDiffVal = getLineDiff(kalshiThreshold, line);
        const matchQuality = lineDiffVal != null && lineDiffVal > 0 ? `Line diff: ${lineDiffVal.toFixed(1)}` : "Line aligned";

        const kalshiYesDec = kalshiCentsToDecimal(km.yesAsk);
        const kalshiNoDec = kalshiCentsToDecimal(km.noAsk);
        const kalshiYesAm = kalshiYesDec ? decimalToAmerican(kalshiYesDec) : null;
        const kalshiNoAm = kalshiNoDec ? decimalToAmerican(kalshiNoDec) : null;

        for (const u of unders || []) {
          if (!kalshiYesDec || !u.decimal) continue;
          const impSum = 1 / kalshiYesDec + 1 / u.decimal;
          const statLabel = statType === "player_points" ? "pts" : statType === "player_assists" ? "ast" : "reb";
          record({
            impSum,
            decA: kalshiYesDec,
            decB: u.decimal,
            sideA: `${player} ${kalshiThreshold}+ ${statLabel} (Kalshi YES)`,
            bookA: "Kalshi",
            americanA: kalshiYesAm,
            sideB: `Under ${line} @ ${u.book}`,
            bookB: u.book,
            americanB: u.price,
            game,
            kalshiTicker: km.ticker,
            marketType: statType,
            kalshiVolume: km.volume,
            kalshiBaSpread: km.yesBaSpread,
            kalshiLeg: { position: "A", cents: km.yesAsk },
            player,
            line,
            statType,
            matchQuality,
          });
        }

        for (const o of overs || []) {
          if (!kalshiNoDec || !o.decimal) continue;
          const impSum = 1 / o.decimal + 1 / kalshiNoDec;
          const statLabel = statType === "player_points" ? "pts" : statType === "player_assists" ? "ast" : "reb";
          record({
            impSum,
            decA: o.decimal,
            decB: kalshiNoDec,
            sideA: `Over ${line} @ ${o.book}`,
            bookA: o.book,
            americanA: o.price,
            sideB: `${player} ${kalshiThreshold}+ ${statLabel} (Kalshi NO)`,
            bookB: "Kalshi",
            americanB: kalshiNoAm,
            game,
            kalshiTicker: km.ticker,
            marketType: statType,
            kalshiVolume: km.volume,
            kalshiBaSpread: km.noBaSpread,
            kalshiLeg: { position: "B", cents: km.noAsk },
            player,
            line,
            statType,
            matchQuality,
          });
        }

        let bestUnderDec = 0,
          bestUnderBook = "",
          bestUnderAm = 0;
        for (const u of unders || []) {
          if (u.decimal > bestUnderDec) {
            bestUnderDec = u.decimal;
            bestUnderBook = u.book;
            bestUnderAm = u.price;
          }
        }
        if (kalshiYesDec && bestUnderDec) {
          const impSum = 1 / kalshiYesDec + 1 / bestUnderDec;
          const statLabel = statType === "player_points" ? "pts" : statType === "player_assists" ? "ast" : "reb";
          record({
            impSum,
            decA: kalshiYesDec,
            decB: bestUnderDec,
            sideA: `${player} ${kalshiThreshold}+ ${statLabel} (Kalshi YES)`,
            bookA: "Kalshi",
            americanA: kalshiYesAm,
            sideB: `Under ${line} @ ${bestUnderBook}`,
            bookB: bestUnderBook,
            americanB: bestUnderAm,
            game,
            kalshiTicker: km.ticker,
            marketType: statType,
            kalshiVolume: km.volume,
            kalshiBaSpread: km.yesBaSpread,
            kalshiLeg: { position: "A", cents: km.yesAsk },
            player,
            line,
            statType,
            matchQuality,
          });
        }

        let bestOverDec = 0,
          bestOverBook = "",
          bestOverAm = 0;
        for (const o of overs || []) {
          if (o.decimal > bestOverDec) {
            bestOverDec = o.decimal;
            bestOverBook = o.book;
            bestOverAm = o.price;
          }
        }
        if (kalshiNoDec && bestOverDec) {
          const impSum = 1 / bestOverDec + 1 / kalshiNoDec;
          const statLabel = statType === "player_points" ? "pts" : statType === "player_assists" ? "ast" : "reb";
          record({
            impSum,
            decA: bestOverDec,
            decB: kalshiNoDec,
            sideA: `Over ${line} @ ${bestOverBook}`,
            bookA: bestOverBook,
            americanA: bestOverAm,
            sideB: `${player} ${kalshiThreshold}+ ${statLabel} (Kalshi NO)`,
            bookB: "Kalshi",
            americanB: kalshiNoAm,
            game,
            kalshiTicker: km.ticker,
            marketType: statType,
            kalshiVolume: km.volume,
            kalshiBaSpread: km.noBaSpread,
            kalshiLeg: { position: "B", cents: km.noAsk },
            player,
            line,
            statType,
            matchQuality,
          });
        }
      }
    }
  }

  const seen = new Map();
  for (const opp of opps) {
    const key = `${opp.game}|${opp.sideA}|${opp.bookA}|${opp.sideB}|${opp.bookB}|${opp.marketType}`;
    const existing = seen.get(key);
    if (!existing || opp.impSum < existing.impSum) seen.set(key, opp);
  }
  const deduped = [...seen.values()];
  deduped.sort((a, b) => a.impSum - b.impSum);
  return { opps: deduped, bestImpSum, bestImpDetail };
}
