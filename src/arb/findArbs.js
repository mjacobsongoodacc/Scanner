import { americanToDecimal, decimalToAmerican } from "./oddsUtils.js";
import { kalshiCentsToDecimal, teamMatch, isWholeNumber } from "./kalshiUtils.js";
import { buildStakePlan } from "./stakeSizing.js";

export function findArbs(games, kalshiMarkets, stake, nearArbThreshold = 1.03) {
  const opps = [];
  let bestImpSum = Infinity;
  let bestImpDetail = null;

  function record({ impSum, decA, decB, sideA, bookA, americanA, sideB, bookB, americanB, game, kalshiTicker, marketType, kalshiVolume, kalshiBaSpread, kalshiLeg }) {
    const stakePlan = buildStakePlan({ decA, decB, stake, kalshiLeg });
    if (!stakePlan) return;

    const exactImpSum = stakePlan.impSum ?? impSum;
    if (exactImpSum < bestImpSum) {
      bestImpSum = exactImpSum;
      bestImpDetail = { impSum: exactImpSum, sideA, bookA, sideB, bookB, game: `${game.away} @ ${game.home}` };
    }
    if (exactImpSum < nearArbThreshold) {
      const roi = stakePlan.roi;
      const betA = stakePlan.betA;
      const betB = stakePlan.betB;
      const isKalshi = !!(kalshiTicker);
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
        sideA, bookA, americanA: stakePlan.americanA ?? americanA, decimalA: stakePlan.decimalA,
        sideB, bookB, americanB: stakePlan.americanB ?? americanB, decimalB: stakePlan.decimalB,
        impSum: exactImpSum,
        roi,
        betA,
        betB,
        payoutA: stakePlan.payoutA,
        payoutB: stakePlan.payoutB,
        usedStake: stakePlan.usedStake,
        unusedStake: stakePlan.unusedStake,
        profit: stakePlan.profit,
        isTrueArb: exactImpSum < 1.0 && stakePlan.profit > 0,
        kalshiTicker: kalshiTicker || "",
        marketType: marketType || "h2h",
        kalshiVolume: kalshiVolume || null,
        kalshiBaSpread: kalshiBaSpread ?? null,
        kalshiContractsA: stakePlan.kalshiContractsA,
        kalshiContractsB: stakePlan.kalshiContractsB,
        kalshiFeeA: stakePlan.kalshiFeeA,
        kalshiFeeB: stakePlan.kalshiFeeB,
        confidence,
      });
    }
  }

  for (const game of games) {
    const bookNames = Object.keys(game.bookOdds);

    let bestHomeDec = 0, bestHomeName = "", bestHomeAm = 0;
    let bestAwayDec = 0, bestAwayName = "", bestAwayAm = 0;
    for (const bn of bookNames) {
      const o = game.bookOdds[bn];
      const hd = americanToDecimal(o.home);
      const ad = americanToDecimal(o.away);
      if (hd && hd > bestHomeDec) { bestHomeDec = hd; bestHomeName = bn; bestHomeAm = o.home; }
      if (ad && ad > bestAwayDec) { bestAwayDec = ad; bestAwayName = bn; bestAwayAm = o.away; }
    }
    if (bestHomeDec && bestAwayDec && bestHomeName !== bestAwayName) {
      const impSum = 1 / bestHomeDec + 1 / bestAwayDec;
      record({ impSum, decA: bestHomeDec, decB: bestAwayDec, sideA: `${game.home} ML`, bookA: bestHomeName, americanA: bestHomeAm, sideB: `${game.away} ML`, bookB: bestAwayName, americanB: bestAwayAm, game, marketType: "h2h" });
    }

    for (let i = 0; i < bookNames.length; i++) {
      for (let j = i + 1; j < bookNames.length; j++) {
        const b1 = bookNames[i], b2 = bookNames[j];
        const o1 = game.bookOdds[b1], o2 = game.bookOdds[b2];
        const combos = [
          { ha: "home", book_a: b1, odds_a: o1, hb: "away", book_b: b2, odds_b: o2 },
          { ha: "home", book_a: b2, odds_a: o2, hb: "away", book_b: b1, odds_b: o1 },
        ];
        for (const c of combos) {
          const decA = americanToDecimal(c.odds_a[c.ha]);
          const decB = americanToDecimal(c.odds_b[c.hb]);
          if (!decA || !decB) continue;
          const impSum = 1 / decA + 1 / decB;
          record({ impSum, decA, decB, sideA: `${c.ha === "home" ? game.home : game.away} ML`, bookA: c.book_a, americanA: c.odds_a[c.ha], sideB: `${c.hb === "home" ? game.home : game.away} ML`, bookB: c.book_b, americanB: c.odds_b[c.hb], game, marketType: "h2h" });
        }
      }
    }

    const spreadBooks = game.spreadOdds || {};
    const matchedKalshi = kalshiMarkets.filter(km => {
      if (km.type !== "spread" || km.parsedTeam == null || km.parsedSpread == null) return false;
      return teamMatch(km.parsedTeam, game.home) || teamMatch(km.parsedTeam, game.away);
    });

    for (const km of matchedKalshi) {
      const kalshiTeamIsHome = teamMatch(km.parsedTeam, game.home);
      const kalshiTeam = kalshiTeamIsHome ? game.home : game.away;
      const oppositeTeam = kalshiTeamIsHome ? game.away : game.home;
      const kalshiSpread = km.parsedSpread;

      const kalshiYesDec = kalshiCentsToDecimal(km.yesAsk);
      const kalshiNoDec = kalshiCentsToDecimal(km.noAsk);
      const kalshiYesAm = kalshiYesDec ? decimalToAmerican(kalshiYesDec) : null;
      const kalshiNoAm = kalshiNoDec ? decimalToAmerican(kalshiNoDec) : null;

      for (const [bookName, spreads] of Object.entries(spreadBooks)) {
        for (const line of spreads) {
          if (Math.abs(Math.abs(line.point) - kalshiSpread) > 0.01) continue;

          const isBookSameTeam = line.name === kalshiTeam;
          const isBookOpposite = line.name === oppositeTeam;
          if (!isBookSameTeam && !isBookOpposite) continue;

          const bookDec = americanToDecimal(line.price);
          if (!bookDec) continue;

          if (isBookOpposite && kalshiYesDec && !isWholeNumber(kalshiSpread)) {
            const impSum = 1 / kalshiYesDec + 1 / bookDec;
            record({
              impSum, decA: kalshiYesDec, decB: bookDec,
              sideA: `${kalshiTeam} -${kalshiSpread} (Kalshi YES)`,
              bookA: "Kalshi",
              americanA: kalshiYesAm,
              sideB: `${oppositeTeam} +${kalshiSpread}`,
              bookB: bookName,
              americanB: line.price,
              game, kalshiTicker: km.ticker, marketType: "spread",
              kalshiVolume: km.volume, kalshiBaSpread: km.yesBaSpread,
              kalshiLeg: { position: "A", cents: km.yesAsk },
            });
          }

          if (isBookSameTeam && kalshiNoDec) {
            const impSum = 1 / bookDec + 1 / kalshiNoDec;
            record({
              impSum, decA: bookDec, decB: kalshiNoDec,
              sideA: `${kalshiTeam} -${kalshiSpread}`,
              bookA: bookName,
              americanA: line.price,
              sideB: `${oppositeTeam} +${kalshiSpread} (Kalshi NO)`,
              bookB: "Kalshi",
              americanB: kalshiNoAm,
              game, kalshiTicker: km.ticker, marketType: "spread",
              kalshiVolume: km.volume, kalshiBaSpread: km.noBaSpread,
              kalshiLeg: { position: "B", cents: km.noAsk },
            });
          }
        }
      }

      let bestCoverDec = 0, bestCoverBook = "", bestCoverAm = 0;
      let bestOppDec = 0, bestOppBook = "", bestOppAm = 0;
      for (const [bookName, spreads] of Object.entries(spreadBooks)) {
        for (const line of spreads) {
          if (Math.abs(Math.abs(line.point) - kalshiSpread) > 0.01) continue;
          const dec = americanToDecimal(line.price);
          if (!dec) continue;
          const isSameTeam = line.name === kalshiTeam;
          if (isSameTeam && dec > bestCoverDec) { bestCoverDec = dec; bestCoverBook = bookName; bestCoverAm = line.price; }
          if (!isSameTeam && line.name === oppositeTeam && dec > bestOppDec) { bestOppDec = dec; bestOppBook = bookName; bestOppAm = line.price; }
        }
      }

      if (bestOppDec && kalshiYesDec && !isWholeNumber(kalshiSpread)) {
        const impSum = 1 / kalshiYesDec + 1 / bestOppDec;
        record({
          impSum, decA: kalshiYesDec, decB: bestOppDec,
          sideA: `${kalshiTeam} -${kalshiSpread} (Kalshi YES)`,
          bookA: "Kalshi",
          americanA: kalshiYesAm,
          sideB: `${oppositeTeam} +${kalshiSpread}`,
          bookB: bestOppBook,
          americanB: bestOppAm,
          game, kalshiTicker: km.ticker, marketType: "spread",
          kalshiVolume: km.volume, kalshiBaSpread: km.yesBaSpread,
          kalshiLeg: { position: "A", cents: km.yesAsk },
        });
      }
      if (bestCoverDec && kalshiNoDec) {
        const impSum = 1 / bestCoverDec + 1 / kalshiNoDec;
        record({
          impSum, decA: bestCoverDec, decB: kalshiNoDec,
          sideA: `${kalshiTeam} -${kalshiSpread}`,
          bookA: bestCoverBook,
          americanA: bestCoverAm,
          sideB: `${oppositeTeam} +${kalshiSpread} (Kalshi NO)`,
          bookB: "Kalshi",
          americanB: kalshiNoAm,
          game, kalshiTicker: km.ticker, marketType: "spread",
          kalshiVolume: km.volume, kalshiBaSpread: km.noBaSpread,
          kalshiLeg: { position: "B", cents: km.noAsk },
        });
      }
    }

    const matchedKalshiML = kalshiMarkets.filter(km => {
      if (km.type !== "moneyline" || !km.parsedTeam) return false;
      return teamMatch(km.parsedTeam, game.home) || teamMatch(km.parsedTeam, game.away);
    });

    for (const km of matchedKalshiML) {
      const kalshiTeamIsHome = teamMatch(km.parsedTeam, game.home);
      const kalshiTeam = kalshiTeamIsHome ? game.home : game.away;
      const oppositeTeam = kalshiTeamIsHome ? game.away : game.home;

      const kalshiYesDec = kalshiCentsToDecimal(km.yesAsk);
      const kalshiNoDec = kalshiCentsToDecimal(km.noAsk);
      const kalshiYesAm = kalshiYesDec ? decimalToAmerican(kalshiYesDec) : null;
      const kalshiNoAm = kalshiNoDec ? decimalToAmerican(kalshiNoDec) : null;

      let bestOppMLDec = 0, bestOppMLBook = "", bestOppMLAm = 0;
      for (const bn of bookNames) {
        const o = game.bookOdds[bn];
        const oppAm = kalshiTeamIsHome ? o.away : o.home;
        const oppDec = americanToDecimal(oppAm);
        if (oppDec && oppDec > bestOppMLDec) { bestOppMLDec = oppDec; bestOppMLBook = bn; bestOppMLAm = oppAm; }
      }
      if (kalshiYesDec && bestOppMLDec) {
        const impSum = 1 / kalshiYesDec + 1 / bestOppMLDec;
        record({
          impSum, decA: kalshiYesDec, decB: bestOppMLDec,
          sideA: `${kalshiTeam} ML (Kalshi YES)`,
          bookA: "Kalshi",
          americanA: kalshiYesAm,
          sideB: `${oppositeTeam} ML`,
          bookB: bestOppMLBook,
          americanB: bestOppMLAm,
          game, kalshiTicker: km.ticker, marketType: "h2h",
          kalshiVolume: km.volume, kalshiBaSpread: km.yesBaSpread,
          kalshiLeg: { position: "A", cents: km.yesAsk },
        });
      }

      let bestSameMLDec = 0, bestSameMLBook = "", bestSameMLAm = 0;
      for (const bn of bookNames) {
        const o = game.bookOdds[bn];
        const sameAm = kalshiTeamIsHome ? o.home : o.away;
        const sameDec = americanToDecimal(sameAm);
        if (sameDec && sameDec > bestSameMLDec) { bestSameMLDec = sameDec; bestSameMLBook = bn; bestSameMLAm = sameAm; }
      }
      if (bestSameMLDec && kalshiNoDec) {
        const impSum = 1 / bestSameMLDec + 1 / kalshiNoDec;
        record({
          impSum, decA: bestSameMLDec, decB: kalshiNoDec,
          sideA: `${kalshiTeam} ML`,
          bookA: bestSameMLBook,
          americanA: bestSameMLAm,
          sideB: `${oppositeTeam} ML (Kalshi NO)`,
          bookB: "Kalshi",
          americanB: kalshiNoAm,
          game, kalshiTicker: km.ticker, marketType: "h2h",
          kalshiVolume: km.volume, kalshiBaSpread: km.noBaSpread,
          kalshiLeg: { position: "B", cents: km.noAsk },
        });
      }

      for (const bn of bookNames) {
        const o = game.bookOdds[bn];
        const oppAm = kalshiTeamIsHome ? o.away : o.home;
        const oppDec = americanToDecimal(oppAm);
        const sameAm = kalshiTeamIsHome ? o.home : o.away;
        const sameDec = americanToDecimal(sameAm);

        if (kalshiYesDec && oppDec) {
          const impSum = 1 / kalshiYesDec + 1 / oppDec;
          record({
            impSum, decA: kalshiYesDec, decB: oppDec,
            sideA: `${kalshiTeam} ML (Kalshi YES)`,
            bookA: "Kalshi",
            americanA: kalshiYesAm,
            sideB: `${oppositeTeam} ML`,
            bookB: bn,
            americanB: oppAm,
            game, kalshiTicker: km.ticker, marketType: "h2h",
            kalshiVolume: km.volume, kalshiBaSpread: km.yesBaSpread,
            kalshiLeg: { position: "A", cents: km.yesAsk },
          });
        }
        if (sameDec && kalshiNoDec) {
          const impSum = 1 / sameDec + 1 / kalshiNoDec;
          record({
            impSum, decA: sameDec, decB: kalshiNoDec,
            sideA: `${kalshiTeam} ML`,
            bookA: bn,
            americanA: sameAm,
            sideB: `${oppositeTeam} ML (Kalshi NO)`,
            bookB: "Kalshi",
            americanB: kalshiNoAm,
            game, kalshiTicker: km.ticker, marketType: "h2h",
            kalshiVolume: km.volume, kalshiBaSpread: km.noBaSpread,
            kalshiLeg: { position: "B", cents: km.noAsk },
          });
        }
      }
    }

    const spreadByLine = {};
    for (const [bookName, spreads] of Object.entries(spreadBooks)) {
      for (const line of spreads) {
        const absPoint = Math.abs(line.point);
        const key = absPoint.toFixed(1);
        if (!spreadByLine[key]) spreadByLine[key] = [];
        spreadByLine[key].push({ ...line, bookName });
      }
    }
    for (const lines of Object.values(spreadByLine)) {
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const a = lines[i], b = lines[j];
          if (a.bookName === b.bookName) continue;
          if (a.name === b.name) continue;
          const decA = americanToDecimal(a.price);
          const decB = americanToDecimal(b.price);
          if (!decA || !decB) continue;
          const impSum = 1 / decA + 1 / decB;
          const spreadVal = Math.abs(a.point);
          if (isWholeNumber(spreadVal)) continue;
          record({
            impSum, decA, decB,
            sideA: `${a.name} ${a.point > 0 ? "+" : ""}${a.point}`,
            bookA: a.bookName,
            americanA: a.price,
            sideB: `${b.name} ${b.point > 0 ? "+" : ""}${b.point}`,
            bookB: b.bookName,
            americanB: b.price,
            game, marketType: "spread",
          });
        }
      }
    }
  }

  const seen = new Map();
  for (const opp of opps) {
    const key = `${opp.game}|${opp.sideA}|${opp.bookA}|${opp.sideB}|${opp.bookB}`;
    const existing = seen.get(key);
    if (!existing || opp.impSum < existing.impSum) seen.set(key, opp);
  }
  const deduped = [...seen.values()];
  deduped.sort((a, b) => a.impSum - b.impSum);
  return { opps: deduped, bestImpSum, bestImpDetail };
}
