/**
 * Paper Trading Store — localStorage-backed persistence
 * Self-contained module for arb paper trading simulation.
 */

const STORAGE_KEY_PREFIX = "paper_trading_data_";
const DEFAULT_BANKROLL = 1000;
const MAX_BALANCE_HISTORY = 500;

const DEFAULT_SETTINGS = {
  creditCardFeePct: 2,
  kalshiFeePerContract: 0.017,
  otherPlatformFeePct: 0,
  otherPlatformFeeFixed: 0,
};

function generateId() {
  return `pt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getStorageKey(user) {
  return `${STORAGE_KEY_PREFIX}${user || "default"}`;
}

function loadFromStorage(user) {
  try {
    let raw = localStorage.getItem(getStorageKey(user));
    if (!raw && user === "admin") {
      raw = localStorage.getItem("paper_trading_data");
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToStorage(data, user) {
  try {
    localStorage.setItem(getStorageKey(user), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * Append a balance snapshot to history. Limits to MAX_BALANCE_HISTORY points.
 */
export function appendBalanceSnapshot(state, balance) {
  const entry = { ts: new Date().toISOString(), balance };
  const history = [...(state.balanceHistory || []), entry];
  const trimmed = history.length > MAX_BALANCE_HISTORY ? history.slice(-MAX_BALANCE_HISTORY) : history;
  return { ...state, balanceHistory: trimmed };
}

/**
 * Backfill balanceHistory from trades for legacy data.
 */
function backfillBalanceHistory(trades, settings) {
  const events = [];
  for (const t of trades) {
    if (t.status === "OPEN") {
      events.push({ ts: t.placedAt, type: "place", trade: t });
    } else if (t.status === "SETTLED" && t.settledAt) {
      events.push({ ts: t.settledAt, type: "settle", trade: t });
    } else if (t.status === "VOID" && t.settledAt) {
      events.push({ ts: t.settledAt, type: "void", trade: t });
    }
  }
  events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  let balance = DEFAULT_BANKROLL;
  const history = [{ ts: events[0] ? new Date(new Date(events[0].ts).getTime() - 1).toISOString() : new Date().toISOString(), balance: 1000 }];
  for (const e of events) {
    if (e.type === "place") {
      const t = e.trade.lots ? e.trade : backfillLots(e.trade);
      balance -= t.totalStaked ?? 0;
    } else if (e.type === "settle") {
      const payout = getPayoutForTrade(e.trade, e.trade.winningLeg);
      balance += payout ?? 0;
    } else if (e.type === "void") {
      const t = e.trade.lots ? e.trade : backfillLots(e.trade);
      balance += t.totalStaked ?? 0;
    }
    history.push({ ts: e.ts, balance });
  }
  return history;
}

/**
 * Calculate fee drag for a paper trade.
 * @param {Object} trade - Paper trade record
 * @param {Object} settings - Fee settings
 * @returns {{ creditCard: number, kalshi: number, platform: number, total: number }}
 */
function calculateFees(trade, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const fromBets = (trade.betA || 0) + (trade.betB || 0);
  const fromLegs = (trade.legA?.stake || 0) + (trade.legB?.stake || 0);
  const totalStake = trade.totalStaked ?? (fromBets || fromLegs || 0);
  const creditCard = totalStake * (s.creditCardFeePct / 100);
  let kalshi = 0;
  const kA = trade.kalshiContractsA ?? trade.legA?.kalshiContracts;
  const kB = trade.kalshiContractsB ?? trade.legB?.kalshiContracts;
  if (kA) kalshi += kA * s.kalshiFeePerContract;
  if (kB) kalshi += kB * s.kalshiFeePerContract;
  const platform = totalStake * (s.otherPlatformFeePct / 100) + (s.otherPlatformFeeFixed || 0);
  return {
    creditCard,
    kalshi,
    platform,
    total: creditCard + kalshi + platform,
  };
}

/**
 * Create a paper trade record from an arb opportunity.
 * Snapshots current odds — does not update after placement.
 * @param {Object} arb - Arb object from findArbs (game, sideA, bookA, americanA, betA, etc.)
 * @param {Object} settings - Current fee settings
 * @returns {Object} Paper trade record
 */
function buildLotFromArb(arb) {
  const stakeA = arb.betA ?? 0;
  const stakeB = arb.betB ?? 0;
  const totalStaked = stakeA + stakeB;
  const payoutA = arb.payoutA ?? stakeA * (arb.decimalA ?? 2);
  const payoutB = arb.payoutB ?? stakeB * (arb.decimalB ?? 2);
  return {
    placedAt: new Date().toISOString(),
    stakeA,
    stakeB,
    decimalA: arb.decimalA ?? null,
    decimalB: arb.decimalB ?? null,
    payoutA,
    payoutB,
    kalshiContractsA: arb.kalshiContractsA ?? null,
    kalshiContractsB: arb.kalshiContractsB ?? null,
    totalStaked,
  };
}

/**
 * Backfill lots for legacy trades without a lots array.
 */
function backfillLots(trade) {
  if (trade.lots?.length) return trade;
  const stakeA = trade.legA?.stake ?? 0;
  const stakeB = trade.legB?.stake ?? 0;
  const lot = {
    placedAt: trade.placedAt || trade.detectedAt || new Date().toISOString(),
    stakeA,
    stakeB,
    decimalA: trade.legA?.decimal ?? null,
    decimalB: trade.legB?.decimal ?? null,
    payoutA: trade.payoutA ?? stakeA * (trade.legA?.decimal ?? 2),
    payoutB: trade.payoutB ?? stakeB * (trade.legB?.decimal ?? 2),
    kalshiContractsA: trade.legA?.kalshiContracts ?? null,
    kalshiContractsB: trade.legB?.kalshiContracts ?? null,
    totalStaked: stakeA + stakeB,
  };
  return { ...trade, lots: [lot] };
}

export function createPaperTrade(arb, settings) {
  const id = generateId();
  const lot = buildLotFromArb(arb);
  const fees = calculateFees(
    {
      betA: arb.betA,
      betB: arb.betB,
      kalshiContractsA: arb.kalshiContractsA,
      kalshiContractsB: arb.kalshiContractsB,
    },
    settings
  );
  const grossArbPct = arb.impSum != null ? (1 - arb.impSum) * 100 : null;
  const netArbPct = grossArbPct != null ? grossArbPct - (fees.total / ((arb.betA || 0) + (arb.betB || 0))) * 100 : null;

  return {
    id,
    status: "OPEN",
    detectedAt: new Date().toISOString(),
    placedAt: new Date().toISOString(),

    game: arb.game || "",
    commence: arb.commence || null,
    marketType: arb.marketType ?? null,

    legA: {
      platform: arb.bookA || "",
      line: arb.sideA || "",
      oddsAmerican: arb.americanA ?? null,
      stake: arb.betA ?? 0,
      decimal: arb.decimalA ?? null,
      kalshiContracts: arb.kalshiContractsA ?? null,
    },
    legB: {
      platform: arb.bookB || "",
      line: arb.sideB || "",
      oddsAmerican: arb.americanB ?? null,
      stake: arb.betB ?? 0,
      decimal: arb.decimalB ?? null,
      kalshiContracts: arb.kalshiContractsB ?? null,
    },

    lots: [lot],
    grossArbPct,
    netArbPct,
    fees,
    totalStaked: lot.totalStaked,
    payoutA: arb.payoutA ?? null,
    payoutB: arb.payoutB ?? null,

    // Settlement
    winningLeg: null,
    grossPnl: null,
    netPnl: null,
    settledAt: null,
  };
}

/**
 * Add an additional lot to an existing open paper trade.
 * Locks in odds at the moment of this add.
 * @param {Object} trade - Existing open trade
 * @param {Object} arb - Arb opportunity for the add (current odds)
 * @param {Object} settings - Fee settings
 * @returns {Object} Updated trade (immutable)
 */
export function addToPaperTrade(trade, arb, settings) {
  const withLots = backfillLots(trade);
  const newLot = buildLotFromArb(arb);
  const lots = [...(withLots.lots || []), newLot];

  const totalStaked = lots.reduce((s, l) => s + (l.totalStaked || 0), 0);
  const stakeA = lots.reduce((s, l) => s + (l.stakeA || 0), 0);
  const stakeB = lots.reduce((s, l) => s + (l.stakeB || 0), 0);
  const kalshiContractsA = lots.reduce((s, l) => s + (l.kalshiContractsA || 0), 0) || null;
  const kalshiContractsB = lots.reduce((s, l) => s + (l.kalshiContractsB || 0), 0) || null;

  const fees = calculateFees(
    {
      betA: stakeA,
      betB: stakeB,
      kalshiContractsA,
      kalshiContractsB,
      totalStaked,
    },
    settings
  );

  return {
    ...withLots,
    lots,
    totalStaked,
    legA: { ...withLots.legA, stake: stakeA },
    legB: { ...withLots.legB, stake: stakeB },
    fees,
    payoutA: lots.reduce((s, l) => s + (l.payoutA ?? 0), 0),
    payoutB: lots.reduce((s, l) => s + (l.payoutB ?? 0), 0),
  };
}

/**
 * Get total payout for a trade based on winning leg, using lot-level locked odds.
 */
export function getPayoutForTrade(trade, winningLeg) {
  const withLots = backfillLots(trade);
  const lots = withLots.lots || [];
  return lots.reduce((sum, lot) => {
    const payout =
      winningLeg === "A"
        ? lot.payoutA ?? lot.stakeA * (lot.decimalA ?? 2)
        : lot.payoutB ?? lot.stakeB * (lot.decimalB ?? 2);
    return sum + (payout ?? 0);
  }, 0);
}

/**
 * Settle a paper trade. winningLeg: "A" | "B"
 * Uses lot-level locked odds for payout.
 * @param {Object} trade - Trade to settle
 * @param {"A"|"B"} winningLeg - Which leg won
 * @param {Object} settings - Fee settings for net P&L
 */
export function settleTrade(trade, winningLeg, settings) {
  const payout = getPayoutForTrade(trade, winningLeg);
  const totalStaked = backfillLots(trade).totalStaked ?? trade.totalStaked ?? 0;
  const grossPnl = payout - totalStaked;
  const fees = calculateFees(backfillLots(trade), settings);
  const netPnl = grossPnl - fees.total;

  return {
    ...trade,
    status: "SETTLED",
    winningLeg,
    grossPnl,
    netPnl,
    fees,
    settledAt: new Date().toISOString(),
  };
}

export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

export function getDefaultBankroll() {
  return DEFAULT_BANKROLL;
}

/**
 * Return a fresh paper trading state (empty account, default bankroll).
 * Used when clearing/resetting the account.
 */
export function getInitialState(bankroll = DEFAULT_BANKROLL, settings = null) {
  const now = new Date().toISOString();
  return {
    bankroll,
    settings: settings ? { ...DEFAULT_SETTINGS, ...settings } : { ...DEFAULT_SETTINGS },
    trades: [],
    opportunityKeys: [],
    balanceHistory: [{ ts: now, balance: bankroll }],
  };
}

/**
 * Key for matching arb opportunities. Includes marketType to distinguish ML vs spread.
 */
function arbKey(arb) {
  return `${arb.game || ""}|${arb.sideA || ""}|${arb.bookA || ""}|${arb.sideB || ""}|${arb.bookB || ""}|${arb.marketType || ""}`;
}

/**
 * Build key from an existing trade for matching against arbKey(arb).
 * Infers marketType for legacy trades without it.
 */
function arbKeyFromTrade(trade) {
  const marketType =
    trade.marketType ??
    (/\bML\b/.test(trade.legA?.line || "") || /\bML\b/.test(trade.legB?.line || "") ? "h2h" : "spread");
  return `${trade.game || ""}|${trade.legA?.line || ""}|${trade.legA?.platform || ""}|${trade.legB?.line || ""}|${trade.legB?.platform || ""}|${marketType}`;
}

/**
 * Find an OPEN paper trade that matches the given arb opportunity.
 * @param {Object[]} trades - All trades
 * @param {Object} arb - Arb opportunity (game, sideA, bookA, sideB, bookB, marketType)
 * @returns {Object|null} Matching open trade or null
 */
export function findOpenTradeForArb(trades, arb) {
  const key = arbKey(arb);
  return trades.find((t) => t.status === "OPEN" && arbKeyFromTrade(t) === key) ?? null;
}

export function loadState(user) {
  const data = loadFromStorage(user);
  if (!data) {
    const now = new Date().toISOString();
    return {
      bankroll: DEFAULT_BANKROLL,
      settings: { ...DEFAULT_SETTINGS },
      trades: [],
      opportunityKeys: [],
      balanceHistory: [{ ts: now, balance: DEFAULT_BANKROLL }],
    };
  }
  let balanceHistory = data.balanceHistory;
  if (!balanceHistory?.length && (data.trades ?? []).length > 0) {
    balanceHistory = backfillBalanceHistory(data.trades, data.settings || DEFAULT_SETTINGS);
  } else if (!balanceHistory?.length) {
    balanceHistory = [{ ts: new Date().toISOString(), balance: data.bankroll ?? DEFAULT_BANKROLL }];
  }
  return {
    bankroll: data.bankroll ?? DEFAULT_BANKROLL,
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    trades: data.trades ?? [],
    opportunityKeys: data.opportunityKeys ?? [],
    balanceHistory,
  };
}

/**
 * Persist state.
 */
export function persistState(state, user) {
  return saveToStorage(
    {
      bankroll: state.bankroll,
      settings: state.settings,
      trades: state.trades,
      opportunityKeys: state.opportunityKeys ?? [],
      balanceHistory: state.balanceHistory ?? [],
    },
    user
  );
}

export function mergeOpportunityKeys(currentKeys, arbs) {
  const set = new Set(currentKeys || []);
  for (const a of arbs || []) {
    if (a.impSum != null && a.impSum < 1.03) set.add(arbKey(a));
  }
  return [...set];
}

/**
 * Export trades to CSV string.
 */
export function exportTradesToCSV(trades) {
  const headers = [
    "id",
    "status",
    "detectedAt",
    "placedAt",
    "game",
    "legA_platform",
    "legA_line",
    "legA_odds",
    "legA_stake",
    "legB_platform",
    "legB_line",
    "legB_odds",
    "legB_stake",
    "grossArbPct",
    "netArbPct",
    "totalStaked",
    "winningLeg",
    "grossPnl",
    "netPnl",
    "settledAt",
    "fee_creditCard",
    "fee_kalshi",
    "fee_platform",
  ];
  const rows = trades.map((t) => [
    t.id,
    t.status,
    t.detectedAt,
    t.placedAt,
    t.game,
    t.legA?.platform ?? "",
    t.legA?.line ?? "",
    t.legA?.oddsAmerican ?? "",
    t.legA?.stake ?? "",
    t.legB?.platform ?? "",
    t.legB?.line ?? "",
    t.legB?.oddsAmerican ?? "",
    t.legB?.stake ?? "",
    t.grossArbPct ?? "",
    t.netArbPct ?? "",
    t.totalStaked ?? "",
    t.winningLeg ?? "",
    t.grossPnl ?? "",
    t.netPnl ?? "",
    t.settledAt ?? "",
    t.fees?.creditCard ?? "",
    t.fees?.kalshi ?? "",
    t.fees?.platform ?? "",
  ]);
  const rowStrs = rows.map((r) =>
    r.map((c) => (typeof c === "string" && c.includes(",") ? `"${c}"` : c)).join(",")
  );
  const csvContent = [headers.join(","), ...rowStrs].join("\n");
  return csvContent;
}
