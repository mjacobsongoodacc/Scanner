import { useState, useEffect, useCallback, useRef } from "react";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const KALSHI_GAME_SERIES = {
  nba: {
    spread: "KXNBASPREAD",
    total: "KXNBATOTAL",
    moneyline: "KXNBA",
  },
  ncaab: {
    spread: "KXNCAAMB1HSPREAD",
    total: "KXNCAAMBTOTAL",
    moneyline: "KXNCAAMB",
  },
};

function americanToDecimal(am) {
  if (!am) return null;
  return am > 0 ? am / 100 + 1 : 100 / Math.abs(am) + 1;
}

function decimalToAmerican(dec) {
  if (!dec || dec <= 1) return null;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

// Kalshi taker fee: total fee = ceil(0.07 * contracts * P * (1-P)) rounded up to cents
// P = price in dollars. For scans we size whole Kalshi contracts exactly.
function kalshiTakerFee(cents, contracts = 1) {
  if (!cents || cents <= 0 || cents >= 100 || !contracts || contracts <= 0) return 0;
  const p = cents / 100;
  return Math.ceil(0.07 * contracts * p * (1 - p) * 100) / 100;
}

function kalshiFeePerContract(cents) {
  return kalshiTakerFee(cents, 1);
}

function kalshiCostForContracts(cents, contracts) {
  if (!contracts || contracts <= 0) return 0;
  return contracts * (cents / 100) + kalshiTakerFee(cents, contracts);
}

function kalshiCentsToDecimal(cents) {
  if (!cents || cents <= 0 || cents >= 100) return null;
  const totalCost = kalshiCostForContracts(cents, 1);
  if (totalCost >= 1) return null;
  return 1 / totalCost;
}

function kalshiCentsToDecimalRaw(cents) {
  if (!cents || cents <= 0 || cents >= 100) return null;
  return 100 / cents;
}

function formatAmerican(am) {
  if (am == null) return "—";
  return am > 0 ? `+${am}` : `${am}`;
}

function parseKalshiSpreadTitle(title) {
  const m = title.match(/^(.+?)\s+wins?\s+by\s+over\s+([\d.]+)\s+points?\??$/i);
  if (!m) return null;
  return { team: m[1].trim(), spread: parseFloat(m[2]) };
}

function parseKalshiMoneylineTitle(title) {
  if (/\b(?:by\s+over|spread|points?|total|over\/under)\b/i.test(title)) return null;
  let m;
  m = title.match(/^(?:will\s+(?:the\s+)?)?(.+?)\s+(?:wins?|beat|defeat)(?:\s*\??\s*$)/i);
  if (m) return m[1].replace(/^the\s+/i, "").trim();
  m = title.match(/^(.+?)\s+to\s+win\s*\??\s*$/i);
  if (m) return m[1].replace(/^the\s+/i, "").trim();
  m = title.match(/^(.+?)\s+(?:vs?\.?)\s+(.+?)\s*\??\s*$/i);
  if (m) return m[1].replace(/^the\s+/i, "").trim();
  return null;
}

function teamMatch(kalshiTeam, oddsApiTeam) {
  const k = kalshiTeam.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const o = oddsApiTeam.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (o.includes(k) || k.includes(o)) return true;
  const kWords = k.split(/\s+/);
  const oWords = o.split(/\s+/);
  if (kWords[0] === oWords[0] && kWords[0].length > 3) return true;
  const CITY_MAP = {
    "los angeles l": "lakers",
    "los angeles c": "clippers",
    "new york": "knicks",
    "brooklyn": "nets",
    "oklahoma city": "thunder",
    "golden state": "warriors",
    "san antonio": "spurs",
  };
  const mapped = CITY_MAP[k];
  if (mapped) return o.includes(mapped);
  if (kWords.some(w => w.length > 4 && oWords.includes(w))) return true;
  return false;
}

function isWholeNumber(value) {
  return Math.abs(value - Math.round(value)) < 1e-9;
}

function sizeKalshiVsBook({ kalshiCents, bookDec, stake }) {
  if (!kalshiCents || !bookDec || !stake || stake <= 0) return null;

  const totalOutlay = contracts => {
    const kalshiCost = kalshiCostForContracts(kalshiCents, contracts);
    const bookBet = contracts / bookDec;
    return kalshiCost + bookBet;
  };

  let lo = 0;
  let hi = 1;
  while (totalOutlay(hi) <= stake) hi *= 2;

  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (totalOutlay(mid) <= stake) lo = mid;
    else hi = mid;
  }

  const contracts = lo;
  if (contracts < 1) return null;

  const fee = kalshiTakerFee(kalshiCents, contracts);
  const kalshiCost = kalshiCostForContracts(kalshiCents, contracts);
  const bookBet = contracts / bookDec;
  const usedStake = kalshiCost + bookBet;
  const profit = contracts - usedStake;

  return {
    contracts,
    fee,
    kalshiCost,
    bookBet,
    usedStake,
    unusedStake: Math.max(0, stake - usedStake),
    profit,
    payout: contracts,
    kalshiDecimal: contracts / kalshiCost,
  };
}

function sizeKalshiVsKalshi({ centsA, centsB, stake }) {
  if (!centsA || !centsB || !stake || stake <= 0) return null;

  const totalOutlay = contracts => (
    kalshiCostForContracts(centsA, contracts) + kalshiCostForContracts(centsB, contracts)
  );

  let lo = 0;
  let hi = 1;
  while (totalOutlay(hi) <= stake) hi *= 2;

  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (totalOutlay(mid) <= stake) lo = mid;
    else hi = mid;
  }

  const contracts = lo;
  if (contracts < 1) return null;

  const feeA = kalshiTakerFee(centsA, contracts);
  const feeB = kalshiTakerFee(centsB, contracts);
  const costA = kalshiCostForContracts(centsA, contracts);
  const costB = kalshiCostForContracts(centsB, contracts);
  const usedStake = costA + costB;
  const profit = contracts - usedStake;

  return {
    contracts,
    costA,
    costB,
    feeA,
    feeB,
    usedStake,
    unusedStake: Math.max(0, stake - usedStake),
    profit,
    payout: contracts,
    decimalA: contracts / costA,
    decimalB: contracts / costB,
  };
}

function buildStakePlan({ decA, decB, stake, kalshiLeg }) {
  if (!decA || !decB || !stake || stake <= 0) return null;

  if (kalshiLeg?.mode === "double") {
    const sized = sizeKalshiVsKalshi({ centsA: kalshiLeg.centsA, centsB: kalshiLeg.centsB, stake });
    if (!sized) return null;

    const impSum = sized.usedStake / sized.payout;
    return {
      impSum,
      roi: (1 - impSum) * 100,
      betA: sized.costA,
      betB: sized.costB,
      payoutA: sized.payout,
      payoutB: sized.payout,
      profit: sized.profit,
      usedStake: sized.usedStake,
      unusedStake: sized.unusedStake,
      decimalA: sized.decimalA,
      decimalB: sized.decimalB,
      americanA: decimalToAmerican(sized.decimalA),
      americanB: decimalToAmerican(sized.decimalB),
      kalshiContractsA: sized.contracts,
      kalshiContractsB: sized.contracts,
      kalshiFeeA: sized.feeA,
      kalshiFeeB: sized.feeB,
    };
  }

  if (!kalshiLeg) {
    const impSum = 1 / decA + 1 / decB;
    const betA = ((1 / decA) / impSum) * stake;
    const betB = ((1 / decB) / impSum) * stake;
    const payoutA = betA * decA;
    const payoutB = betB * decB;
    const profit = Math.min(payoutA, payoutB) - stake;

    return {
      impSum,
      roi: (1 - impSum) * 100,
      betA,
      betB,
      payoutA,
      payoutB,
      profit,
      usedStake: stake,
      unusedStake: 0,
      decimalA: decA,
      decimalB: decB,
      americanA: null,
      americanB: null,
      kalshiContractsA: null,
      kalshiContractsB: null,
      kalshiFeeA: null,
      kalshiFeeB: null,
    };
  }

  const sized = sizeKalshiVsBook({
    kalshiCents: kalshiLeg.cents,
    bookDec: kalshiLeg.position === "A" ? decB : decA,
    stake,
  });
  if (!sized) return null;

  const impSum = sized.usedStake / sized.payout;
  const common = {
    impSum,
    roi: (1 - impSum) * 100,
    profit: sized.profit,
    usedStake: sized.usedStake,
    unusedStake: sized.unusedStake,
  };

  if (kalshiLeg.position === "A") {
    return {
      ...common,
      betA: sized.kalshiCost,
      betB: sized.bookBet,
      payoutA: sized.payout,
      payoutB: sized.payout,
      decimalA: sized.kalshiDecimal,
      decimalB: decB,
      americanA: decimalToAmerican(sized.kalshiDecimal),
      americanB: null,
      kalshiContractsA: sized.contracts,
      kalshiContractsB: null,
      kalshiFeeA: sized.fee,
      kalshiFeeB: null,
    };
  }

  return {
    ...common,
    betA: sized.bookBet,
    betB: sized.kalshiCost,
    payoutA: sized.payout,
    payoutB: sized.payout,
    decimalA: decA,
    decimalB: sized.kalshiDecimal,
    americanA: null,
    americanB: decimalToAmerican(sized.kalshiDecimal),
    kalshiContractsA: null,
    kalshiContractsB: sized.contracts,
    kalshiFeeA: null,
    kalshiFeeB: sized.fee,
  };
}

async function fetchKalshiGameMarkets(sport) {
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

      const url = `/kalshi-api/trade-api/v2/events?${params}`;
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      if (!resp.ok) throw new Error(`Kalshi: ${resp.status} ${resp.statusText}`);
      const data = await resp.json();

      for (const ev of data.events || []) {
        for (const mkt of ev.markets || []) {
          if (mkt.status === "finalized" || mkt.status === "closed") continue;
          const yesAsk = mkt.yes_ask || 0;
          const noAsk = mkt.no_ask || 0;
          const yesBid = mkt.yes_bid || 0;
          const noBid = mkt.no_bid || 0;
          if (!yesAsk && !noAsk) continue;

          const vol = mkt.volume || 0;
          const yesBaSpread = yesAsk && yesBid ? yesAsk - yesBid : 99;
          const noBaSpread = noAsk && noBid ? noAsk - noBid : 99;

          // Skip phantom markets: no volume or absurd bid-ask spread
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
          } else if (type === "spread") {
            // spread series but title didn't parse as spread
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

function findArbs(games, kalshiMarkets, stake, nearArbThreshold = 1.03) {
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
      // Confidence: high ROI on thin Kalshi markets is suspicious
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

// ── Shared styles ────────────────────────────────────────────────────────────

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'Consolas', monospace";

const badge = (color) => ({
  fontSize: 10,
  padding: "2px 7px",
  background: `${color}14`,
  border: `1px solid ${color}40`,
  borderRadius: 3,
  color,
  fontWeight: 500,
});

// ── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onStart }) {
  const [apiKey, setApiKey] = useState("e966c5b7e7c8187cca15830e86bf6984");
  const [sport, setSport] = useState("nba");
  const [stake, setStake] = useState("100");

  const inputStyle = {
    width: "100%", padding: "10px 12px", background: "#0a0a0a",
    border: "1px solid #2a2a2a", borderRadius: 4, color: "#e0e0e0",
    fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ width: 440, padding: "40px 36px", background: "#111", borderRadius: 6, border: "1px solid #1e1e1e" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, color: "#e0e0e0", margin: 0, fontWeight: 600 }}>Arbitrage Scanner</h1>
          <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>Kalshi + Multi-Book Cross-Exchange</div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>The Odds API Key</label>
          <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="Get free key at the-odds-api.com" style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>League</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["nba", "ncaab"].map(s => (
                <button key={s} onClick={() => setSport(s)}
                  style={{
                    flex: 1, padding: "9px 0",
                    background: sport === s ? "#2a6e3f" : "#0a0a0a",
                    border: `1px solid ${sport === s ? "#2a6e3f" : "#2a2a2a"}`,
                    borderRadius: 4, color: sport === s ? "#fff" : "#888",
                    fontSize: 12, fontFamily: FONT, cursor: "pointer",
                    fontWeight: sport === s ? 600 : 400,
                    textTransform: "uppercase",
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: 120 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>Stake ($)</label>
            <input type="number" value={stake} onChange={e => setStake(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <button onClick={() => apiKey && onStart({ apiKey, sport, stake: parseFloat(stake) || 100 })} disabled={!apiKey}
          style={{
            width: "100%", padding: 12,
            background: apiKey ? "#2a6e3f" : "#1a1a1a",
            border: "none", borderRadius: 4,
            color: apiKey ? "#fff" : "#555",
            fontSize: 14, fontFamily: FONT, fontWeight: 600,
            cursor: apiKey ? "pointer" : "default",
          }}>
          Start Scanner
        </button>
        <div style={{ marginTop: 20, padding: 14, background: "#0c0c0c", borderRadius: 4, border: "1px solid #1e1e1e" }}>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
            1. Get a free API key at <span style={{ color: "#5a9e6f" }}>the-odds-api.com</span> (500 req/mo)<br/>
            2. Kalshi game spreads fetched via authenticated proxy<br/>
            3. Scanner compares Kalshi spreads vs DraftKings, FanDuel, BetMGM, etc.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ config }) {
  const [games, setGames] = useState([]);
  const [kalshiMarkets, setKalshiMarkets] = useState([]);
  const [arbs, setArbs] = useState([]);
  const [bestImpSum, setBestImpSum] = useState(null);
  const [bestImpDetail, setBestImpDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kalshiError, setKalshiError] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [remaining, setRemaining] = useState("?");
  const [tab, setTab] = useState("arbs");
  const [stake, setStake] = useState(config.stake);
  const [stakeInput, setStakeInput] = useState(String(config.stake));

  const stakeRef = useRef(stake);
  stakeRef.current = stake;

  const ODDS_CACHE_KEY = `odds_cache_${config.sport}`;
  const ODDS_CACHE_TTL = 24 * 60 * 60 * 1000;

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

  function getCachedOdds() {
    try {
      const raw = localStorage.getItem(ODDS_CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts > ODDS_CACHE_TTL) return null;
      return cached;
    } catch { return null; }
  }

  const fetchData = useCallback(async (forceOddsRefresh = false) => {
    setLoading(true);
    setError(null);
    setKalshiError(null);
    try {
      let parsed;
      const cached = getCachedOdds();

      if (!forceOddsRefresh && cached) {
        parsed = cached.games;
        setRemaining(cached.remaining ?? "?");
        setLastUpdate(new Date(cached.ts));
      } else {
        const sportKey = config.sport === "ncaab" ? "basketball_ncaab" : "basketball_nba";
        const oddsUrl = `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${config.apiKey}&regions=us&markets=h2h,spreads&oddsFormat=american`;
        const oddsResp = await fetch(oddsUrl);
        if (!oddsResp.ok) throw new Error(`Odds API: ${oddsResp.status} ${oddsResp.statusText}`);
        const rem = oddsResp.headers.get("x-requests-remaining") || "?";
        setRemaining(rem);
        const oddsData = await oddsResp.json();
        parsed = parseOddsData(oddsData);
        const now = Date.now();
        try {
          localStorage.setItem(ODDS_CACHE_KEY, JSON.stringify({ ts: now, remaining: rem, games: parsed, raw: oddsData }));
        } catch {}
        setLastUpdate(new Date(now));
      }

      const kalshiResult = await fetchKalshiGameMarkets(config.sport).catch(e => { setKalshiError(e.message); return []; });

      setGames(parsed);
      setKalshiMarkets(kalshiResult);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (games.length === 0 && kalshiMarkets.length === 0) return;
    const result = findArbs(games, kalshiMarkets, stake);
    setArbs(result.opps);
    setBestImpSum(result.bestImpSum);
    setBestImpDetail(result.bestImpDetail);
  }, [stake, games, kalshiMarkets]);

  function commitStake() {
    const v = parseFloat(stakeInput);
    if (v && v > 0) setStake(v);
    else setStakeInput(String(stake));
  }

  const trueArbs = arbs.filter(a => a.isTrueArb);
  const nearArbs = arbs.filter(a => !a.isTrueArb);
  const arbCount = trueArbs.length;
  const kalshiArbCount = arbs.filter(a => a.kalshiTicker).length;
  const mlArbCount = arbs.filter(a => a.marketType === "h2h").length;
  const spreadArbCount = arbs.filter(a => a.marketType === "spread").length;
  const gameCount = games.length;
  const bestRoi = trueArbs.length ? trueArbs[0].roi : 0;
  const gapFromArb = bestImpSum && bestImpSum < Infinity ? ((bestImpSum - 1) * 100) : null;

  const statColor = (val, threshold) => val > 0 ? "#5a9e6f" : "#666";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: FONT, color: "#bbb" }}>
      {/* Header */}
      <div style={{ padding: "16px 28px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, color: "#e0e0e0", fontWeight: 600 }}>Arb Scanner <span style={{ fontWeight: 400, color: "#666" }}>/ {config.sport.toUpperCase()}</span></h1>
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
          <button onClick={() => fetchData(false)} disabled={loading}
            style={{
              padding: "6px 12px", background: "#151515", border: "1px solid #2a2a2a",
              borderRadius: 4, color: "#5a9e6f", fontSize: 11, fontFamily: FONT,
              cursor: "pointer", fontWeight: 500,
            }}>
            Refresh Kalshi
          </button>
          <button onClick={() => { if (confirm("This uses an Odds API call. Continue?")) fetchData(true); }} disabled={loading}
            style={{
              padding: "6px 12px", background: "#151515", border: "1px solid #3a2a00",
              borderRadius: 4, color: "#c89030", fontSize: 11, fontFamily: FONT,
              cursor: "pointer", fontWeight: 500,
            }}>
            Force Odds Refresh
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ display: "flex", padding: "0 28px", borderBottom: "1px solid #1a1a1a", flexWrap: "wrap", alignItems: "center" }}>
        {[
          { label: "Games", value: gameCount, color: "#ccc" },
          { label: "Kalshi Mkts", value: kalshiMarkets.length, color: kalshiError ? "#c89030" : "#5a8fae" },
          { label: "True Arbs", value: arbCount, color: arbCount > 0 ? "#5a9e6f" : "#555" },
          { label: "Near Arbs", value: nearArbs.length, color: nearArbs.length > 0 ? "#c89030" : "#555" },
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

      {/* Tabs */}
      <div style={{ display: "flex", padding: "0 28px", borderBottom: "1px solid #1a1a1a" }}>
        {[
          { key: "arbs", label: `Opportunities${arbs.length > 0 ? ` (${arbs.length})` : ""}` },
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

      {/* Content */}
      <div style={{ padding: "20px 28px" }}>
        <div style={{ padding: "10px 14px", background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, marginBottom: 14, fontSize: 12, color: "#555", lineHeight: 1.6 }}>
          Sportsbook odds cached daily (1 API call/day). Kalshi prices refresh on each load.
          Kalshi taker fees and whole-contract sizing included. Whole-number spread pushes excluded.
          {getCachedOdds() && (
            <span style={{ marginLeft: 6 }}>
              Cached: {new Date(getCachedOdds().ts).toLocaleString()}
            </span>
          )}
          {arbs.some(a => a.confidence === "low") && (
            <span style={{ color: "#c04040", marginLeft: 6 }}>
              Some results flagged low-confidence.
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
                {trueArbs.length > 0 && (() => {
                  const trueML = trueArbs.filter(a => a.marketType === "h2h");
                  const trueSP = trueArbs.filter(a => a.marketType === "spread");
                  return (
                    <>
                      <div style={{ fontSize: 11, color: "#5a9e6f", fontWeight: 500, marginBottom: 2, display: "flex", gap: 10, alignItems: "center" }}>
                        <span>True Arbitrage ({trueArbs.length})</span>
                        {trueML.length > 0 && <span style={{ color: "#6a9fd8" }}>{trueML.length} moneyline</span>}
                        {trueSP.length > 0 && <span style={{ color: "#a07dba" }}>{trueSP.length} spread</span>}
                      </div>
                      {trueArbs.map((a, i) => <ArbCard key={`true-${i}`} a={a} />)}
                    </>
                  );
                })()}

                {nearArbs.length > 0 && (() => {
                  const nearML = nearArbs.filter(a => a.marketType === "h2h");
                  const nearSP = nearArbs.filter(a => a.marketType === "spread");
                  return (
                    <>
                      <div style={{ fontSize: 11, color: "#c89030", fontWeight: 500, marginTop: 10, marginBottom: 2, display: "flex", gap: 10, alignItems: "center" }}>
                        <span>Near-Arbitrage, within 3% ({nearArbs.length})</span>
                        {nearML.length > 0 && <span style={{ color: "#6a9fd8" }}>{nearML.length} moneyline</span>}
                        {nearSP.length > 0 && <span style={{ color: "#a07dba" }}>{nearSP.length} spread</span>}
                      </div>
                      {nearArbs.map((a, i) => <ArbCard key={`near-${i}`} a={a} />)}
                    </>
                  );
                })()}
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

function BetCalculator({ stake: defaultStake }) {
  const [legs, setLegs] = useState([
    { type: "kalshi", value: "", label: "Leg A" },
    { type: "sportsbook", value: "", label: "Leg B" },
  ]);
  const [stake, setStake] = useState(String(defaultStake || 100));

  useEffect(() => {
    setStake(String(defaultStake || 100));
  }, [defaultStake]);

  function updateLeg(idx, field, val) {
    setLegs(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  }

  function getDecimal(leg) {
    const v = parseFloat(leg.value);
    if (isNaN(v)) return null;
    if (leg.type === "kalshi") return kalshiCentsToDecimal(v);
    return americanToDecimal(v);
  }

  function getRawDecimal(leg) {
    const v = parseFloat(leg.value);
    if (isNaN(v)) return null;
    if (leg.type === "kalshi") return kalshiCentsToDecimalRaw(v);
    return americanToDecimal(v);
  }

  const decA = getDecimal(legs[0]);
  const decB = getDecimal(legs[1]);
  const rawA = getRawDecimal(legs[0]);
  const rawB = getRawDecimal(legs[1]);
  const s = parseFloat(stake) || 100;
  const hasOdds = !!(decA && decB);
  const kalshiLegCount = legs.filter(leg => leg.type === "kalshi").length;
  const exactKalshiLeg = kalshiLegCount === 2
    ? {
        mode: "double",
        centsA: parseFloat(legs[0].value),
        centsB: parseFloat(legs[1].value),
      }
    : kalshiLegCount === 1
      ? {
          mode: "single",
          position: legs[0].type === "kalshi" ? "A" : "B",
          cents: parseFloat(legs[0].type === "kalshi" ? legs[0].value : legs[1].value),
        }
      : null;
  const stakePlan = hasOdds ? buildStakePlan({ decA, decB, stake: s, kalshiLeg: exactKalshiLeg }) : null;
  const exactSizingUnavailable = hasOdds && !!exactKalshiLeg && !stakePlan;
  const hasResult = hasOdds && !exactSizingUnavailable;
  const displayDecA = stakePlan?.decimalA ?? decA;
  const displayDecB = stakePlan?.decimalB ?? decB;
  const impSum = stakePlan?.impSum ?? (hasResult ? 1 / decA + 1 / decB : null);
  const rawImpSum = rawA && rawB ? 1 / rawA + 1 / rawB : null;
  const roi = stakePlan?.roi ?? (impSum ? (1 - impSum) * 100 : null);
  const betA = stakePlan?.betA ?? (hasResult ? ((1 / decA) / impSum) * s : null);
  const betB = stakePlan?.betB ?? (hasResult ? ((1 / decB) / impSum) * s : null);
  const payoutA = stakePlan?.payoutA ?? (hasResult ? betA * decA : null);
  const payoutB = stakePlan?.payoutB ?? (hasResult ? betB * decB : null);
  const usedStake = stakePlan?.usedStake ?? s;
  const unusedStake = stakePlan?.unusedStake ?? 0;
  const profit = stakePlan?.profit ?? (hasResult ? Math.min(payoutA, payoutB) - s : null);
  const isArb = impSum && impSum < 1;
  const feeA = legs[0].type === "kalshi" && parseFloat(legs[0].value) ? kalshiFeePerContract(parseFloat(legs[0].value)) : 0;
  const feeB = legs[1].type === "kalshi" && parseFloat(legs[1].value) ? kalshiFeePerContract(parseFloat(legs[1].value)) : 0;

  const inputStyle = {
    width: "100%", padding: "10px 12px", background: "#0a0a0a",
    border: "1px solid #2a2a2a", borderRadius: 4, color: "#e0e0e0",
    fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 12, color: "#666", marginBottom: 5, fontWeight: 500 };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 600, marginBottom: 6 }}>Bet Calculator</div>
        <div style={{ fontSize: 12, color: "#666" }}>Enter two opposing bets to check for arbitrage. Kalshi legs use exact whole-contract sizing with aggregate taker fees.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        {legs.map((leg, i) => (
          <div key={i} style={{ padding: 16, background: "#111", border: "1px solid #1a1a1a", borderRadius: 4 }}>
            <div style={{ fontSize: 12, color: i === 0 ? "#5a9e6f" : "#5a8fae", fontWeight: 600, marginBottom: 14 }}>{leg.label}</div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Platform</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["kalshi", "sportsbook"].map(t => (
                  <button key={t} onClick={() => updateLeg(i, "type", t)}
                    style={{
                      flex: 1, padding: "8px 0",
                      background: leg.type === t ? (t === "kalshi" ? "#2a5a6e" : "#2a6e3f") : "#0a0a0a",
                      border: `1px solid ${leg.type === t ? (t === "kalshi" ? "#2a5a6e" : "#2a6e3f") : "#2a2a2a"}`,
                      borderRadius: 4,
                      color: leg.type === t ? "#fff" : "#666",
                      fontSize: 11, fontFamily: FONT, cursor: "pointer",
                      fontWeight: leg.type === t ? 600 : 400,
                      textTransform: "capitalize",
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>{leg.type === "kalshi" ? "Price (cents, 1-99)" : "American Odds (e.g. -110, +150)"}</label>
              <input type="text" value={leg.value} onChange={e => updateLeg(i, "value", e.target.value)}
                placeholder={leg.type === "kalshi" ? "e.g. 45" : "e.g. -110"}
                style={inputStyle} />
            </div>

            {leg.type === "kalshi" && parseFloat(leg.value) > 0 && parseFloat(leg.value) < 100 && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#555", fontFamily: MONO }}>
                Fee: ${kalshiFeePerContract(parseFloat(leg.value)).toFixed(2)}/ct
                {" | "}Cost: {(parseFloat(leg.value)/100 + kalshiFeePerContract(parseFloat(leg.value))).toFixed(4)}
                {" | "}Raw: {kalshiCentsToDecimalRaw(parseFloat(leg.value))?.toFixed(3)}
                {" | "}Adj: {kalshiCentsToDecimal(parseFloat(leg.value))?.toFixed(3)}
              </div>
            )}
            {leg.type === "sportsbook" && parseFloat(leg.value) && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#555", fontFamily: MONO }}>
                Dec: {americanToDecimal(parseFloat(leg.value))?.toFixed(3)}
                {" | "}Impl: {(100 / americanToDecimal(parseFloat(leg.value))).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Total Stake ($)</label>
        <input type="number" value={stake} onChange={e => setStake(e.target.value)} style={{ ...inputStyle, width: 160 }} />
      </div>

      {hasResult && (
        <div style={{ padding: 20, background: "#111", border: `1px solid ${isArb ? "#2a4a2a" : impSum < 1.03 ? "#3a2a00" : "#1a1a1a"}`, borderRadius: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: isArb ? "#5a9e6f" : "#c89030", fontWeight: 600, marginBottom: 4 }}>
                {isArb ? "Arbitrage Found" : "No Arbitrage"}
              </div>
              <div style={{ fontSize: 13, color: "#bbb" }}>
                Implied sum: <span style={{ color: isArb ? "#5a9e6f" : "#c89030", fontWeight: 600, fontFamily: MONO }}>{impSum.toFixed(6)}</span>
                {rawImpSum && Math.abs(rawImpSum - impSum) > 0.0001 && (
                  <span style={{ color: "#555", marginLeft: 8, fontFamily: MONO }}>(pre-fee: {rawImpSum.toFixed(6)})</span>
                )}
                {unusedStake > 0.009 && (
                  <span style={{ color: "#555", marginLeft: 8, fontFamily: MONO }}>(idle: ${unusedStake.toFixed(2)})</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, color: isArb ? "#5a9e6f" : roi > -3 ? "#c89030" : "#555", fontWeight: 400, fontFamily: MONO }}>
                {roi > 0 ? "+" : ""}{roi.toFixed(2)}%
              </div>
              <div style={{ fontSize: 12, color: isArb ? "#5a9e6f" : "#555" }}>
                {isArb ? `$${profit.toFixed(2)} guaranteed` : `${((impSum - 1) * 100).toFixed(2)}% from arb`}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, fontSize: 12 }}>
            {[
              { label: "Bet on A", value: `$${betA.toFixed(2)}`, color: "#e0e0e0" },
              { label: "Bet on B", value: `$${betB.toFixed(2)}`, color: "#e0e0e0" },
              { label: "Payout if A", value: `$${payoutA.toFixed(2)}`, color: isArb ? "#5a9e6f" : "#bbb" },
              { label: "Payout if B", value: `$${payoutB.toFixed(2)}`, color: isArb ? "#5a9e6f" : "#bbb" },
            ].map((item, i) => (
              <div key={i} style={{ padding: 10, background: "#0a0a0a", borderRadius: 4, border: "1px solid #1a1a1a" }}>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 4, fontWeight: 500 }}>{item.label}</div>
                <div style={{ color: item.color, fontWeight: 500, fontFamily: MONO }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 16, fontSize: 11, color: "#555", fontFamily: MONO, flexWrap: "wrap" }}>
            <span>A: {displayDecA.toFixed(4)}{feeA > 0 ? ` (adj)` : ""}</span>
            <span>B: {displayDecB.toFixed(4)}{feeB > 0 ? ` (adj)` : ""}</span>
            <span>Imp A: {(100 / displayDecA).toFixed(1)}%</span>
            <span>Imp B: {(100 / displayDecB).toFixed(1)}%</span>
            <span>Used: ${usedStake.toFixed(2)}</span>
            {exactKalshiLeg?.mode === "single" && <span>Contracts: {exactKalshiLeg.position === "A" ? stakePlan?.kalshiContractsA : stakePlan?.kalshiContractsB}</span>}
            {exactKalshiLeg?.mode === "double" && <span>Contracts: A {stakePlan?.kalshiContractsA} | B {stakePlan?.kalshiContractsB}</span>}
          </div>
        </div>
      )}

      {!hasResult && (
        <div style={{ padding: 28, background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#555" }}>
            {exactSizingUnavailable ? "Stake is too small to buy even one Kalshi contract and hedge it exactly" : "Enter valid odds for both legs to see results"}
          </div>
          <div style={{ fontSize: 12, color: "#333", marginTop: 6 }}>
            Kalshi: contract price in cents (1-99) | Sportsbook: American odds (e.g. -110, +150)
          </div>
        </div>
      )}
    </div>
  );
}

function ArbCard({ a }) {
  const isKalshi = !!a.kalshiTicker;
  const isTrueArb = a.isTrueArb;
  const isSpread = a.marketType === "spread";
  const isMoneyline = a.marketType === "h2h";
  const conf = a.confidence || "high";
  const isLowConf = conf === "low";
  const isMedConf = conf === "medium";
  const accent = isLowConf ? "#666" : isTrueArb ? (isKalshi ? "#5a8fae" : "#5a9e6f") : "#c89030";
  const borderColor = isLowConf ? "#2a1515"
    : isTrueArb ? (isKalshi ? "#1a2a33" : "#1a2a1a")
    : "#2a2000";

  const betTypeLabel = isMoneyline ? "Moneyline" : isSpread ? "Spread" : a.marketType;

  return (
    <div style={{ padding: 16, background: "#111", border: `1px solid ${borderColor}`, borderRadius: 4, opacity: isLowConf ? 0.7 : 1 }}>
      {isLowConf && (
        <div style={{ padding: "7px 10px", background: "#1a0f0f", border: "1px solid #3a1a1a", borderRadius: 3, marginBottom: 10, fontSize: 12, color: "#c04040" }}>
          Low confidence -- likely stale/thin data. Verify both sides manually.
        </div>
      )}
      {isMedConf && (
        <div style={{ padding: "7px 10px", background: "#1a1500", border: "1px solid #3a2a00", borderRadius: 3, marginBottom: 10, fontSize: 12, color: "#c89030" }}>
          Verify lines -- Kalshi volume is thin or ROI is unusually high.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 500 }}>{a.game}</div>
            {isMoneyline && <span style={badge("#6a9fd8")}>ML</span>}
            {isSpread && <span style={badge("#a07dba")}>Spread</span>}
            {isKalshi && <span style={badge("#5a8fae")}>Kalshi</span>}
            {!isTrueArb && <span style={badge("#c89030")}>Near</span>}
            <span style={badge(conf === "high" ? "#5a9e6f" : conf === "medium" ? "#c89030" : "#c04040")}>{conf}</span>
          </div>
          <div style={{ fontSize: 11, color: "#555" }}>{a.commence ? new Date(a.commence).toLocaleString() : ""}</div>
          {isKalshi && (
            <div style={{ fontSize: 11, color: "#444", marginTop: 2, fontFamily: MONO }}>
              {a.kalshiTicker}
              {a.kalshiVolume != null && <span style={{ marginLeft: 8 }}>vol {a.kalshiVolume.toLocaleString()}</span>}
              {a.kalshiBaSpread != null && <span style={{ marginLeft: 8 }}>ba {a.kalshiBaSpread}c</span>}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, color: accent, fontWeight: 400, fontFamily: MONO }}>
            {isTrueArb ? "+" : ""}{a.roi.toFixed(2)}%
          </div>
          <div style={{ fontSize: 12, color: accent }}>
            {isTrueArb ? `$${a.profit.toFixed(2)} profit` : `${((a.impSum - 1) * 100).toFixed(2)}% from arb`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { side: a.sideA, book: a.bookA, american: a.americanA, decimal: a.decimalA, bet: a.betA, label: "Leg A", contracts: a.kalshiContractsA, fee: a.kalshiFeeA },
          { side: a.sideB, book: a.bookB, american: a.americanB, decimal: a.decimalB, bet: a.betB, label: "Leg B", contracts: a.kalshiContractsB, fee: a.kalshiFeeB },
        ].map((leg, li) => {
          const legIsKalshi = leg.book === "Kalshi";
          const impliedProb = leg.decimal ? (100 / leg.decimal) : null;
          return (
            <div key={li} style={{ padding: 12, background: "#0a0a0a", borderRadius: 4, border: `1px solid ${legIsKalshi ? "#1a2a33" : "#1a1a1a"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: legIsKalshi ? "#5a8fae" : "#555", fontWeight: 500 }}>{leg.label}</div>
                <span style={badge(isMoneyline ? "#6a9fd8" : "#a07dba")}>{betTypeLabel}</span>
              </div>
              <div style={{ fontSize: 13, color: "#e0e0e0", marginBottom: 5 }}>{leg.side}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: legIsKalshi ? "#5a8fae" : "#888" }}>{leg.book}</span>
                <span style={{ fontSize: 15, color: accent, fontWeight: 600, fontFamily: MONO }}>{formatAmerican(leg.american)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", fontFamily: MONO }}>
                <span>{leg.decimal?.toFixed(3) ?? "—"} dec</span>
                <span>{impliedProb != null ? `${impliedProb.toFixed(1)}%` : "—"}</span>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#555" }}>{isTrueArb ? "Bet" : "Would bet"}</span>
                <span style={{ color: "#e0e0e0", fontWeight: 600, fontFamily: MONO }}>${leg.bet.toFixed(2)}</span>
              </div>
              {legIsKalshi && leg.contracts != null && (
                <div style={{ marginTop: 5, fontSize: 11, color: "#555", fontFamily: MONO }}>
                  {leg.contracts} contracts
                  {leg.fee != null && ` | $${leg.fee.toFixed(2)} fee`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 11, color: "#444", fontFamily: MONO, flexWrap: "wrap" }}>
        <span>{betTypeLabel}</span>
        <span>imp {a.impSum.toFixed(4)}</span>
        <span>used ${a.usedStake.toFixed(2)}</span>
        {a.unusedStake > 0.009 && <span>idle ${a.unusedStake.toFixed(2)}</span>}
        {isKalshi && <span>fees incl</span>}
      </div>
    </div>
  );
}

const VALID_USERS = [
  { username: "admin", password: "ArbScan2026!" },
  { username: "maxj", password: "KalshiEdge#99" },
];

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTimeout(() => {
      const match = VALID_USERS.find(
        (u) => u.username === username && u.password === password
      );
      if (match) {
        onLogin(match.username);
      } else {
        setError("Invalid username or password");
      }
      setLoading(false);
    }, 600);
  };

  const inputStyle = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    background: "#0a0a0a", border: "1px solid #2a2a2a",
    borderRadius: 4, color: "#e0e0e0", outline: "none",
    boxSizing: "border-box", fontFamily: FONT,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: FONT,
    }}>
      <div style={{
        width: 360,
        background: "#111",
        borderRadius: 6,
        border: "1px solid #1e1e1e",
        padding: "40px 32px 36px",
      }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 600, color: "#e0e0e0",
          }}>Arbitrage Scanner</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#666" }}>
            Sign in to access the dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 5, fontWeight: 500 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 5, fontWeight: 500 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              background: "#1a0f0f", border: "1px solid #3a1a1a",
              borderRadius: 4, padding: "8px 12px", marginBottom: 16,
              fontSize: 13, color: "#c04040", textAlign: "center",
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 600,
              background: loading || !username || !password ? "#1a1a1a" : "#2a6e3f",
              color: loading || !username || !password ? "#555" : "#fff",
              border: "none", borderRadius: 4, fontFamily: FONT,
              cursor: loading || !username || !password ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

const DEFAULT_CONFIG = {
  apiKey: "e966c5b7e7c8187cca15830e86bf6984",
  sport: "nba",
  stake: 100,
};

export default function App() {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  return config ? <Dashboard config={config} /> : <SetupScreen onStart={setConfig} />;
}
