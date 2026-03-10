export const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

/**
 * Sport config for Odds API + Kalshi. Each sport has Odds API key and Kalshi series tickers.
 */
export const SPORT_CONFIG = {
  mlb: {
    label: "Baseball (MLB)",
    oddsApiKey: "baseball_mlb",
    kalshiSeries: {
      spread: "KXMLBSPREAD",
      total: "KXMLBTOTAL",
      moneyline: "KXMLB",
    },
  },
  nba: {
    label: "Basketball (NBA)",
    oddsApiKey: "basketball_nba",
    kalshiSeries: {
      spread: "KXNBASPREAD",
      total: "KXNBATOTAL",
      moneyline: "KXNBA",
    },
  },
  ncaab: {
    label: "NCAA Basketball",
    oddsApiKey: "basketball_ncaab",
    kalshiSeries: {
      spread: "KXNCAAMB1HSPREAD",
      total: "KXNCAAMBTOTAL",
      moneyline: "KXNCAAMB",
    },
  },
  nfl: {
    label: "NFL",
    oddsApiKey: "americanfootball_nfl",
    kalshiSeries: {
      spread: "KXNFLSPREAD",
      total: "KXNFLTOTAL",
      moneyline: "KXNFL",
    },
  },
};

export const KALSHI_GAME_SERIES = Object.fromEntries(
  Object.entries(SPORT_CONFIG).map(([k, v]) => [k, v.kalshiSeries])
);
