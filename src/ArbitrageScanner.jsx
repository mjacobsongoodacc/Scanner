import { useState, useEffect, useCallback } from "react";

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

// ── Kalshi Fetcher ──────────────────────────────────────────────────────────

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

// ── Arb Finder ──────────────────────────────────────────────────────────────

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

    // ── H2H: Best-line across ALL books ──
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

    // ── H2H: Pairwise book-vs-book ──
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

    // ── SPREAD: Kalshi vs Books ──
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

      // ── SPREAD: Best-line across books for this spread value ──
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

    // ── MONEYLINE: Kalshi vs Books ──
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

      // Kalshi YES (team wins) vs best sportsbook ML on opponent
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

      // Sportsbook ML on team vs Kalshi NO (team loses = opponent wins)
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

      // Pairwise: Kalshi vs each individual book
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

    // ── SPREAD: Book-vs-book spread arbs (same spread line, different books) ──
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

  // Deduplicate
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

// ── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onStart }) {
  const [apiKey, setApiKey] = useState("e966c5b7e7c8187cca15830e86bf6984");
  const [sport, setSport] = useState("nba");
  const [stake, setStake] = useState("100");

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>
      <div style={{ width: 480, padding: 48, background: "linear-gradient(145deg, #111 0%, #1a1a1a 100%)", borderRadius: 2, border: "1px solid #222" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: 6, color: "#4caf50", marginBottom: 8, textTransform: "uppercase" }}>System</div>
          <h1 style={{ fontSize: 28, color: "#fff", margin: 0, fontWeight: 400, letterSpacing: -0.5 }}>Arbitrage Scanner</h1>
          <div style={{ fontSize: 12, color: "#555", marginTop: 8 }}>Kalshi x Multi-Book Cross-Exchange</div>
        </div>
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: "block", fontSize: 10, letterSpacing: 3, color: "#666", marginBottom: 8, textTransform: "uppercase" }}>The Odds API Key</label>
          <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Get free key at the-odds-api.com"
            style={{ width: "100%", padding: "14px 16px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 2, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 10, letterSpacing: 3, color: "#666", marginBottom: 8, textTransform: "uppercase" }}>League</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["nba", "ncaab"].map(s => (
                <button key={s} onClick={() => setSport(s)}
                  style={{ flex: 1, padding: "12px 0", background: sport === s ? "#4caf50" : "#0a0a0a", border: `1px solid ${sport === s ? "#4caf50" : "#333"}`, borderRadius: 2, color: sport === s ? "#000" : "#666", fontSize: 12, fontFamily: "inherit", cursor: "pointer", fontWeight: sport === s ? 700 : 400, letterSpacing: 2, textTransform: "uppercase" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: 120 }}>
            <label style={{ display: "block", fontSize: 10, letterSpacing: 3, color: "#666", marginBottom: 8, textTransform: "uppercase" }}>Stake $</label>
            <input type="number" value={stake} onChange={e => setStake(e.target.value)}
              style={{ width: "100%", padding: "12px 16px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 2, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        <button onClick={() => apiKey && onStart({ apiKey, sport, stake: parseFloat(stake) || 100 })} disabled={!apiKey}
          style={{ width: "100%", padding: 16, background: apiKey ? "#4caf50" : "#222", border: "none", borderRadius: 2, color: apiKey ? "#000" : "#555", fontSize: 13, fontFamily: "inherit", cursor: apiKey ? "pointer" : "default", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          Initialize Scanner
        </button>
        <div style={{ marginTop: 24, padding: 16, background: "#0d1f0d", borderRadius: 2, border: "1px solid #1b3a1b" }}>
          <div style={{ fontSize: 10, color: "#4caf50", letterSpacing: 2, marginBottom: 6, textTransform: "uppercase" }}>Setup</div>
          <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6 }}>
            1. Get a free API key at <span style={{ color: "#4caf50" }}>the-odds-api.com</span> (500 req/mo)<br/>
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
      const result = findArbs(parsed, kalshiResult, config.stake);
      setArbs(result.opps);
      setBestImpSum(result.bestImpSum);
      setBestImpDetail(result.bestImpDetail);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const trueArbs = arbs.filter(a => a.isTrueArb);
  const nearArbs = arbs.filter(a => !a.isTrueArb);
  const arbCount = trueArbs.length;
  const kalshiArbCount = arbs.filter(a => a.kalshiTicker).length;
  const mlArbCount = arbs.filter(a => a.marketType === "h2h").length;
  const spreadArbCount = arbs.filter(a => a.marketType === "spread").length;
  const gameCount = games.length;
  const bestRoi = trueArbs.length ? trueArbs[0].roi : 0;
  const gapFromArb = bestImpSum && bestImpSum < Infinity ? ((bestImpSum - 1) * 100) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace", color: "#ccc" }}>
      {/* Header */}
      <div style={{ padding: "20px 32px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div>
            <span style={{ fontSize: 11, letterSpacing: 4, color: "#4caf50", textTransform: "uppercase" }}>Live</span>
            <h1 style={{ margin: 0, fontSize: 18, color: "#fff", fontWeight: 400 }}>Arb Scanner — {config.sport.toUpperCase()}</h1>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: loading ? "#ff9800" : error ? "#f44336" : "#4caf50", animation: loading ? "pulse 1s infinite" : "none" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 11, color: "#555" }}>
          <span>API left: <span style={{ color: "#4caf50" }}>{remaining}</span></span>
          <span>Odds: {lastUpdate ? lastUpdate.toLocaleDateString() : "—"}</span>
          <button onClick={() => fetchData(false)} disabled={loading}
            style={{ padding: "8px 12px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 2, color: "#4caf50", fontSize: 10, fontFamily: "inherit", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase" }}>
            Refresh Kalshi
          </button>
          <button onClick={() => { if (confirm("This uses an Odds API call. Continue?")) fetchData(true); }} disabled={loading}
            style={{ padding: "8px 12px", background: "#1a1a1a", border: "1px solid #553300", borderRadius: 2, color: "#ff9800", fontSize: 10, fontFamily: "inherit", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase" }}>
            Force Odds Refresh
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ display: "flex", padding: "0 32px", borderBottom: "1px solid #1a1a1a", flexWrap: "wrap" }}>
        {[
          { label: "Games", value: gameCount, color: "#fff" },
          { label: "Kalshi Mkts", value: kalshiMarkets.length, color: kalshiError ? "#ff9800" : "#00bcd4" },
          { label: "True Arbs", value: arbCount, color: arbCount > 0 ? "#4caf50" : "#666" },
          { label: "Near Arbs", value: nearArbs.length, color: nearArbs.length > 0 ? "#ff9800" : "#666" },
          { label: "Moneyline", value: mlArbCount, color: mlArbCount > 0 ? "#64b5f6" : "#666" },
          { label: "Spread", value: spreadArbCount, color: spreadArbCount > 0 ? "#ce93d8" : "#666" },
          { label: "Kalshi Arbs", value: kalshiArbCount, color: kalshiArbCount > 0 ? "#00bcd4" : "#666" },
          { label: "Best ROI", value: bestRoi > 0 ? `${bestRoi.toFixed(2)}%` : "—", color: bestRoi > 0 ? "#4caf50" : "#666" },
          { label: "Gap to Arb", value: gapFromArb != null ? `${gapFromArb.toFixed(2)}%` : "—", color: gapFromArb != null && gapFromArb <= 0 ? "#4caf50" : gapFromArb != null && gapFromArb < 2 ? "#ff9800" : "#666" },
          { label: "Stake", value: `$${config.stake}`, color: "#fff" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "16px 0", marginRight: 32 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, color: s.color, fontWeight: 300 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", padding: "0 32px", borderBottom: "1px solid #1a1a1a" }}>
        {[
          { key: "arbs", label: `Opportunities${arbs.length > 0 ? ` (${arbs.length})` : ""}` },
          { key: "games", label: `All Games (${gameCount})` },
          { key: "kalshi", label: `Kalshi (${kalshiMarkets.length})` },
          { key: "calc", label: "Calculator" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "14px 24px", background: "transparent", border: "none", borderBottom: tab === t.key ? "2px solid #4caf50" : "2px solid transparent", color: tab === t.key ? "#4caf50" : "#555", fontSize: 11, fontFamily: "inherit", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "24px 32px" }}>
        <div style={{ padding: 12, background: "#111", border: "1px solid #1a1a1a", borderRadius: 2, marginBottom: 16, fontSize: 11, color: "#666" }}>
          Sportsbook odds are cached daily (1 API call/day). Kalshi prices refresh on each load.
          Kalshi taker fees and whole-contract sizing are included. Whole-number spread pushes are excluded so "true arbs" stay truly risk-free.
          {getCachedOdds() && (
            <span style={{ color: "#555", marginLeft: 8 }}>
              Odds cached: {new Date(getCachedOdds().ts).toLocaleString()}
            </span>
          )}
          {arbs.some(a => a.confidence === "low") && (
            <span style={{ color: "#f44336", marginLeft: 8 }}>
              Some results flagged low-confidence — see warnings on individual cards.
            </span>
          )}
        </div>

        {error && (
          <div style={{ padding: 16, background: "#1a0a0a", border: "1px solid #4a1a1a", borderRadius: 2, color: "#f44336", fontSize: 12, marginBottom: 16 }}>
            Error: {error}
          </div>
        )}
        {kalshiError && (
          <div style={{ padding: 16, background: "#1a1200", border: "1px solid #4a3a00", borderRadius: 2, color: "#ff9800", fontSize: 12, marginBottom: 16 }}>
            Kalshi: {kalshiError} — cross-exchange arbs unavailable, showing book-vs-book only
          </div>
        )}

        {/* ── Opportunities Tab ── */}
        {tab === "arbs" && (
          <>
            {bestImpDetail && arbs.length === 0 && !loading && (
              <div style={{ padding: 16, background: "#111", border: "1px solid #1a1a1a", borderRadius: 2, marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 8 }}>Closest to Arbitrage</div>
                <div style={{ fontSize: 13, color: "#ff9800" }}>
                  {bestImpDetail.game}: {bestImpDetail.sideA} ({bestImpDetail.bookA}) vs {bestImpDetail.sideB} ({bestImpDetail.bookB})
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                  Implied sum: {bestImpDetail.impSum.toFixed(4)} — need below 1.0000 for arb ({((bestImpDetail.impSum - 1) * 100).toFixed(2)}% away)
                </div>
              </div>
            )}

            {arbs.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.3 }}>⊘</div>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>No arbitrage opportunities detected</div>
                <div style={{ fontSize: 11, color: "#333" }}>True arbs are rare and close fast. Scanner refreshes every 2 min.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {trueArbs.length > 0 && (() => {
                  const trueML = trueArbs.filter(a => a.marketType === "h2h");
                  const trueSP = trueArbs.filter(a => a.marketType === "spread");
                  return (
                    <>
                      <div style={{ fontSize: 10, letterSpacing: 3, color: "#4caf50", textTransform: "uppercase", marginBottom: 4 }}>
                        True Arbitrage ({trueArbs.length})
                        {trueML.length > 0 && <span style={{ color: "#64b5f6", marginLeft: 12 }}>{trueML.length} moneyline</span>}
                        {trueSP.length > 0 && <span style={{ color: "#ce93d8", marginLeft: 12 }}>{trueSP.length} spread</span>}
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
                      <div style={{ fontSize: 10, letterSpacing: 3, color: "#ff9800", textTransform: "uppercase", marginTop: 12, marginBottom: 4 }}>
                        Near-Arbitrage — within 3% ({nearArbs.length})
                        {nearML.length > 0 && <span style={{ color: "#64b5f6", marginLeft: 12 }}>{nearML.length} moneyline</span>}
                        {nearSP.length > 0 && <span style={{ color: "#ce93d8", marginLeft: 12 }}>{nearSP.length} spread</span>}
                      </div>
                      {nearArbs.map((a, i) => <ArbCard key={`near-${i}`} a={a} />)}
                    </>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* ── All Games Tab ── */}
        {tab === "games" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {games.map((g, gi) => {
              const books = Object.entries(g.bookOdds);
              const bestHome = books.reduce((best, [, o]) => { const d = americanToDecimal(o.home); return d && d > best ? d : best; }, 0);
              const bestAway = books.reduce((best, [, o]) => { const d = americanToDecimal(o.away); return d && d > best ? d : best; }, 0);
              const crossImp = bestHome && bestAway ? 1 / bestHome + 1 / bestAway : null;
              const spreadBooks = Object.entries(g.spreadOdds || {});

              return (
                <div key={gi} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a1a1a" }}>
                    <div style={{ fontSize: 13, color: "#fff" }}>{g.away} <span style={{ color: "#333", margin: "0 8px" }}>@</span> {g.home}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {crossImp != null && (
                        <span style={{ fontSize: 10, color: crossImp < 1 ? "#4caf50" : crossImp < 1.02 ? "#ff9800" : "#555" }}>
                          H2H best: {crossImp.toFixed(4)}
                        </span>
                      )}
                      <div style={{ fontSize: 10, color: "#555" }}>{g.commence ? new Date(g.commence).toLocaleString() : ""}</div>
                    </div>
                  </div>
                  {/* H2H */}
                  <div style={{ padding: "8px 0" }}>
                    <div style={{ padding: "4px 20px", fontSize: 9, letterSpacing: 2, color: "#4caf50", textTransform: "uppercase" }}>Moneyline</div>
                    <div style={{ display: "grid", gridTemplateColumns: "140px 90px 90px 90px 90px", padding: "4px 20px", fontSize: 9, letterSpacing: 2, color: "#444", textTransform: "uppercase" }}>
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
                        <div key={bi} style={{ display: "grid", gridTemplateColumns: "140px 90px 90px 90px 90px", padding: "4px 20px", fontSize: 12, borderTop: bi > 0 ? "1px solid #0a0a0a" : "none" }}>
                          <span style={{ color: "#888" }}>{name}</span>
                          <span style={{ textAlign: "right", color: isHomeBest ? "#4caf50" : "#ccc", fontWeight: isHomeBest ? 700 : 400 }}>{formatAmerican(odds.home)}</span>
                          <span style={{ textAlign: "right", color: isAwayBest ? "#4caf50" : "#ccc", fontWeight: isAwayBest ? 700 : 400 }}>{formatAmerican(odds.away)}</span>
                          <span style={{ textAlign: "right", color: "#555" }}>{hDec?.toFixed(3) || "—"}</span>
                          <span style={{ textAlign: "right", color: "#555" }}>{aDec?.toFixed(3) || "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Spreads */}
                  {spreadBooks.length > 0 && (
                    <div style={{ padding: "8px 0", borderTop: "1px solid #1a1a1a" }}>
                      <div style={{ padding: "4px 20px", fontSize: 9, letterSpacing: 2, color: "#00bcd4", textTransform: "uppercase" }}>Spreads</div>
                      {spreadBooks.slice(0, 4).map(([name, lines], si) => (
                        <div key={si} style={{ display: "flex", padding: "3px 20px", fontSize: 11 }}>
                          <span style={{ width: 140, color: "#888" }}>{name}</span>
                          <span style={{ flex: 1, color: "#ccc" }}>
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

        {/* ── Kalshi Tab ── */}
        {tab === "kalshi" && (
          <div>
            {kalshiError && (
              <div style={{ padding: 16, background: "#1a1200", border: "1px solid #4a3a00", borderRadius: 2, color: "#ff9800", fontSize: 12, marginBottom: 16 }}>{kalshiError}</div>
            )}
            {kalshiMarkets.length === 0 && !loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#555", fontSize: 13 }}>No open Kalshi game markets found.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {(() => {
                  const byEvent = {};
                  for (const km of kalshiMarkets) {
                    const key = km.eventTicker;
                    if (!byEvent[key]) byEvent[key] = { title: km.eventTitle, markets: [] };
                    byEvent[key].markets.push(km);
                  }
                  return Object.entries(byEvent).map(([eventTicker, { title, markets }]) => (
                    <div key={eventTicker} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a1a", fontSize: 13, color: "#fff" }}>{title}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px 70px 80px", padding: "6px 20px", fontSize: 9, letterSpacing: 2, color: "#444", textTransform: "uppercase", borderBottom: "1px solid #0a0a0a" }}>
                        <span>Market</span>
                        <span style={{ textAlign: "right" }}>Yes Bid</span>
                        <span style={{ textAlign: "right" }}>Yes Ask</span>
                        <span style={{ textAlign: "right" }}>No Bid</span>
                        <span style={{ textAlign: "right" }}>No Ask</span>
                        <span style={{ textAlign: "right" }}>Volume</span>
                      </div>
                      {markets.map((km, i) => {
                        const yesDecRaw = kalshiCentsToDecimalRaw(km.yesAsk);
                        const yesDec = kalshiCentsToDecimal(km.yesAsk);
                        const yesFee = km.yesAsk ? kalshiFeePerContract(km.yesAsk) : 0;
                        const isML = km.type === "moneyline";
                        return (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px 70px 80px", padding: "8px 20px", fontSize: 12, borderTop: i > 0 ? "1px solid #0a0a0a" : "none" }}>
                            <div style={{ color: "#ccc", display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 8, letterSpacing: 1, padding: "1px 5px",
                                background: isML ? "#2196f310" : "#9c27b010",
                                border: `1px solid ${isML ? "#2196f340" : "#9c27b040"}`,
                                borderRadius: 2,
                                color: isML ? "#64b5f6" : "#ce93d8",
                                textTransform: "uppercase", flexShrink: 0
                              }}>{isML ? "ML" : km.type === "spread" ? "SPR" : km.type}</span>
                              {km.title}
                              {yesDec && <span style={{ fontSize: 10, color: "#555", marginLeft: 8 }}>({formatAmerican(decimalToAmerican(yesDec))} incl fee)</span>}
                            </div>
                            <span style={{ textAlign: "right", color: "#888" }}>{km.yesBid || "—"}</span>
                            <span style={{ textAlign: "right", color: "#4caf50" }}>{km.yesAsk || "—"}</span>
                            <span style={{ textAlign: "right", color: "#888" }}>{km.noBid || "—"}</span>
                            <span style={{ textAlign: "right", color: "#4caf50" }}>{km.noAsk || "—"}</span>
                            <span style={{ textAlign: "right", color: "#555" }}>{km.volume?.toLocaleString()}</span>
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

        {/* ── Calculator Tab ── */}
        {tab === "calc" && <BetCalculator stake={config.stake} />}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
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

  const inputStyle = { width: "100%", padding: "12px 14px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 2, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const labelStyle = { display: "block", fontSize: 10, letterSpacing: 3, color: "#666", marginBottom: 6, textTransform: "uppercase" };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#4caf50", textTransform: "uppercase", marginBottom: 8 }}>Manual Bet Calculator</div>
        <div style={{ fontSize: 12, color: "#555" }}>Enter two opposing bets to check for arbitrage. When one side is Kalshi, the calculator uses exact whole-contract sizing and aggregate taker fees.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {legs.map((leg, i) => (
          <div key={i} style={{ padding: 20, background: "#111", border: "1px solid #1a1a1a", borderRadius: 2 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: i === 0 ? "#4caf50" : "#00bcd4", textTransform: "uppercase", marginBottom: 16 }}>{leg.label}</div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Platform</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["kalshi", "sportsbook"].map(t => (
                  <button key={t} onClick={() => updateLeg(i, "type", t)}
                    style={{ flex: 1, padding: "10px 0", background: leg.type === t ? (t === "kalshi" ? "#00bcd4" : "#4caf50") : "#0a0a0a", border: `1px solid ${leg.type === t ? (t === "kalshi" ? "#00bcd4" : "#4caf50") : "#333"}`, borderRadius: 2, color: leg.type === t ? "#000" : "#666", fontSize: 11, fontFamily: "inherit", cursor: "pointer", fontWeight: leg.type === t ? 700 : 400, letterSpacing: 1, textTransform: "uppercase" }}>
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
              <div style={{ marginTop: 10, fontSize: 10, color: "#555" }}>
                Fee: ${kalshiFeePerContract(parseFloat(leg.value)).toFixed(2)}/contract
                {" | "}Eff. cost: {(parseFloat(leg.value)/100 + kalshiFeePerContract(parseFloat(leg.value))).toFixed(4)}
                {" | "}Raw: {kalshiCentsToDecimalRaw(parseFloat(leg.value))?.toFixed(3)} dec
                {" | "}After fees: {kalshiCentsToDecimal(parseFloat(leg.value))?.toFixed(3)} dec
              </div>
            )}
            {leg.type === "sportsbook" && parseFloat(leg.value) && (
              <div style={{ marginTop: 10, fontSize: 10, color: "#555" }}>
                Decimal: {americanToDecimal(parseFloat(leg.value))?.toFixed(3)}
                {" | "}Implied: {(100 / americanToDecimal(parseFloat(leg.value))).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Total Stake ($)</label>
        <input type="number" value={stake} onChange={e => setStake(e.target.value)} style={{ ...inputStyle, width: 160 }} />
      </div>

      {hasResult && (
        <div style={{ padding: 24, background: "#111", border: `1px solid ${isArb ? "#2e7d32" : impSum < 1.03 ? "#4a3a00" : "#1a1a1a"}`, borderRadius: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: isArb ? "#4caf50" : "#ff9800", textTransform: "uppercase", marginBottom: 6 }}>
                {isArb ? "Arbitrage Found" : "No Arbitrage"}
              </div>
              <div style={{ fontSize: 13, color: "#ccc" }}>
                Implied probability sum: <span style={{ color: isArb ? "#4caf50" : "#ff9800", fontWeight: 700 }}>{impSum.toFixed(6)}</span>
                {rawImpSum && Math.abs(rawImpSum - impSum) > 0.0001 && (
                  <span style={{ color: "#555", marginLeft: 8 }}>(without fees: {rawImpSum.toFixed(6)})</span>
                )}
                {unusedStake > 0.009 && (
                  <span style={{ color: "#555", marginLeft: 8 }}>(cash left idle: ${unusedStake.toFixed(2)})</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, color: isArb ? "#4caf50" : roi > -3 ? "#ff9800" : "#666", fontWeight: 300 }}>
                {roi > 0 ? "+" : ""}{roi.toFixed(2)}%
              </div>
              <div style={{ fontSize: 11, color: isArb ? "#4caf50" : "#666" }}>
                {isArb ? `$${profit.toFixed(2)} guaranteed profit` : `${((impSum - 1) * 100).toFixed(2)}% from arb`}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, fontSize: 12 }}>
            {[
              { label: "Bet on A", value: `$${betA.toFixed(2)}`, color: "#fff" },
              { label: "Bet on B", value: `$${betB.toFixed(2)}`, color: "#fff" },
              { label: "Payout if A", value: `$${payoutA.toFixed(2)}`, color: isArb ? "#4caf50" : "#ccc" },
              { label: "Payout if B", value: `$${payoutB.toFixed(2)}`, color: isArb ? "#4caf50" : "#ccc" },
            ].map((item, i) => (
              <div key={i} style={{ padding: 12, background: "#0a0a0a", borderRadius: 2, border: "1px solid #1a1a1a" }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 6 }}>{item.label}</div>
                <div style={{ color: item.color, fontWeight: 500 }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 20, fontSize: 10, color: "#555" }}>
            <span>Dec A: {displayDecA.toFixed(4)}{feeA > 0 ? ` (fee-adj)` : ""}</span>
            <span>Dec B: {displayDecB.toFixed(4)}{feeB > 0 ? ` (fee-adj)` : ""}</span>
            <span>Imp A: {(100 / displayDecA).toFixed(1)}%</span>
            <span>Imp B: {(100 / displayDecB).toFixed(1)}%</span>
            <span>Used: ${usedStake.toFixed(2)}</span>
            {exactKalshiLeg?.mode === "single" && <span>Kalshi contracts: {exactKalshiLeg.position === "A" ? stakePlan?.kalshiContractsA : stakePlan?.kalshiContractsB}</span>}
            {exactKalshiLeg?.mode === "double" && <span>Kalshi contracts: A {stakePlan?.kalshiContractsA} | B {stakePlan?.kalshiContractsB}</span>}
          </div>
        </div>
      )}

      {!hasResult && (
        <div style={{ padding: 32, background: "#111", border: "1px solid #1a1a1a", borderRadius: 2, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#555" }}>
            {exactSizingUnavailable ? "Stake is too small to buy even one Kalshi contract and hedge it exactly" : "Enter valid odds for both legs to see results"}
          </div>
          <div style={{ fontSize: 11, color: "#333", marginTop: 8 }}>
            Kalshi: enter contract price in cents (1-99) | Sportsbook: enter American odds (e.g. -110, +150)
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
  const accent = isLowConf ? "#666" : isTrueArb ? (isKalshi ? "#00bcd4" : "#4caf50") : "#ff9800";
  const borderColor = isLowConf ? "#4a1a1a"
    : isTrueArb ? (a.roi > 1 ? (isKalshi ? "#004d5a" : "#2e7d32") : (isKalshi ? "#002a33" : "#1a3a1a"))
    : "#3a2a00";

  const betTypeLabel = isMoneyline ? "Moneyline" : isSpread ? "Spread" : a.marketType;

  return (
    <div style={{ padding: 20, background: "#111", border: `1px solid ${borderColor}`, borderRadius: 2, opacity: isLowConf ? 0.7 : 1 }}>
      {isLowConf && (
        <div style={{ padding: "8px 12px", background: "#2a0a0a", border: "1px solid #5a1a1a", borderRadius: 2, marginBottom: 12, fontSize: 11, color: "#f44336" }}>
          Low confidence — likely stale/thin data. ROI &gt;5% is rare in efficient markets. Verify both sides manually before acting.
        </div>
      )}
      {isMedConf && (
        <div style={{ padding: "8px 12px", background: "#2a1a00", border: "1px solid #5a3a00", borderRadius: 2, marginBottom: 12, fontSize: 11, color: "#ff9800" }}>
          Verify lines — Kalshi volume is thin or ROI is unusually high. Confirm prices on both platforms before placing bets.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, color: "#fff" }}>{a.game}</div>
            {isMoneyline && (
              <span style={{ fontSize: 9, letterSpacing: 2, padding: "2px 6px", background: "#2196f320", border: "1px solid #2196f360", borderRadius: 2, color: "#64b5f6", textTransform: "uppercase" }}>Moneyline</span>
            )}
            {isSpread && (
              <span style={{ fontSize: 9, letterSpacing: 2, padding: "2px 6px", background: "#9c27b020", border: "1px solid #9c27b060", borderRadius: 2, color: "#ce93d8", textTransform: "uppercase" }}>Spread</span>
            )}
            {isKalshi && (
              <span style={{ fontSize: 9, letterSpacing: 2, padding: "2px 6px", background: "#00bcd420", border: "1px solid #00bcd460", borderRadius: 2, color: "#00bcd4", textTransform: "uppercase" }}>Kalshi</span>
            )}
            {!isTrueArb && (
              <span style={{ fontSize: 9, letterSpacing: 2, padding: "2px 6px", background: "#ff980020", border: "1px solid #ff980060", borderRadius: 2, color: "#ff9800", textTransform: "uppercase" }}>Near-Arb</span>
            )}
            <span style={{ fontSize: 9, letterSpacing: 2, padding: "2px 6px",
              background: conf === "high" ? "#4caf5020" : conf === "medium" ? "#ff980020" : "#f4433620",
              border: `1px solid ${conf === "high" ? "#4caf5060" : conf === "medium" ? "#ff980060" : "#f4433660"}`,
              borderRadius: 2,
              color: conf === "high" ? "#4caf50" : conf === "medium" ? "#ff9800" : "#f44336",
              textTransform: "uppercase"
            }}>{conf}</span>
          </div>
          <div style={{ fontSize: 10, color: "#555" }}>{a.commence ? new Date(a.commence).toLocaleString() : ""}</div>
          {isKalshi && (
            <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>
              {a.kalshiTicker}
              {a.kalshiVolume != null && <span style={{ marginLeft: 8 }}>Vol: {a.kalshiVolume.toLocaleString()}</span>}
              {a.kalshiBaSpread != null && <span style={{ marginLeft: 8 }}>Spread: {a.kalshiBaSpread}c</span>}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, color: accent, fontWeight: 300 }}>
            {isTrueArb ? "+" : ""}{a.roi.toFixed(2)}%
          </div>
          <div style={{ fontSize: 11, color: accent }}>
            {isTrueArb ? `$${a.profit.toFixed(2)} profit` : `${((a.impSum - 1) * 100).toFixed(2)}% from arb`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { side: a.sideA, book: a.bookA, american: a.americanA, decimal: a.decimalA, bet: a.betA, label: "LEG A", contracts: a.kalshiContractsA, fee: a.kalshiFeeA },
          { side: a.sideB, book: a.bookB, american: a.americanB, decimal: a.decimalB, bet: a.betB, label: "LEG B", contracts: a.kalshiContractsB, fee: a.kalshiFeeB },
        ].map((leg, li) => {
          const legIsKalshi = leg.book === "Kalshi";
          const impliedProb = leg.decimal ? (100 / leg.decimal) : null;
          return (
            <div key={li} style={{ padding: 14, background: "#0a0a0a", borderRadius: 2, border: `1px solid ${legIsKalshi ? "#00bcd420" : "#1a1a1a"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: legIsKalshi ? "#00bcd4" : "#555", textTransform: "uppercase" }}>{leg.label}</div>
                <div style={{ fontSize: 9, letterSpacing: 2, padding: "2px 6px",
                  background: isMoneyline ? "#2196f310" : "#9c27b010",
                  border: `1px solid ${isMoneyline ? "#2196f340" : "#9c27b040"}`,
                  borderRadius: 2,
                  color: isMoneyline ? "#64b5f6" : "#ce93d8",
                  textTransform: "uppercase"
                }}>{betTypeLabel}</div>
              </div>
              <div style={{ fontSize: 13, color: "#fff", marginBottom: 6 }}>{leg.side}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: legIsKalshi ? "#00bcd4" : "#888" }}>{leg.book}</span>
                <span style={{ fontSize: 16, color: accent, fontWeight: 600 }}>{formatAmerican(leg.american)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555" }}>
                <span>Decimal: {leg.decimal?.toFixed(3) ?? "—"}</span>
                <span>Implied: {impliedProb != null ? `${impliedProb.toFixed(1)}%` : "—"}</span>
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "#555" }}>{isTrueArb ? "Bet" : "Would bet"}</span>
                <span style={{ color: "#fff", fontWeight: 600 }}>${leg.bet.toFixed(2)}</span>
              </div>
              {legIsKalshi && leg.contracts != null && (
                <div style={{ marginTop: 6, fontSize: 10, color: "#555" }}>
                  {leg.contracts} contracts
                  {leg.fee != null && ` | $${leg.fee.toFixed(2)} fee`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 24, fontSize: 10, color: "#555", flexWrap: "wrap" }}>
        <span>Bet type: {betTypeLabel}</span>
        <span>Implied sum: {a.impSum.toFixed(4)}</span>
        <span>Used stake: ${a.usedStake.toFixed(2)}</span>
        {a.unusedStake > 0.009 && <span>Cash left: ${a.unusedStake.toFixed(2)}</span>}
        <span>Fees included: {isKalshi ? "yes" : "n/a"}</span>
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

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        width: 380,
        background: "rgba(20, 20, 30, 0.95)",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        padding: "48px 36px 40px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "linear-gradient(135deg, #00e676, #00bcd4)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, marginBottom: 16,
          }}>⚡</div>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 700, color: "#fff",
            letterSpacing: "-0.02em",
          }}>Arbitrage Scanner</h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#666" }}>
            Sign in to access the dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              style={{
                width: "100%", padding: "12px 14px", fontSize: 14,
                background: "#0d0d14", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, color: "#fff", outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => e.target.style.borderColor = "#00e676"}
              onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              style={{
                width: "100%", padding: "12px 14px", fontSize: 14,
                background: "#0d0d14", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, color: "#fff", outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => e.target.style.borderColor = "#00e676"}
              onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(244,67,54,0.12)", border: "1px solid rgba(244,67,54,0.3)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 18,
              fontSize: 13, color: "#ef5350", textAlign: "center",
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 600,
              background: loading || !username || !password
                ? "rgba(0,230,118,0.3)"
                : "linear-gradient(135deg, #00e676, #00c853)",
              color: "#000", border: "none", borderRadius: 10,
              cursor: loading || !username || !password ? "not-allowed" : "pointer",
              transition: "opacity 0.2s",
              letterSpacing: "0.01em",
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
