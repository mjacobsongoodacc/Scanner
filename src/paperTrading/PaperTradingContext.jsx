/**
 * Paper Trading React Context — state and actions
 * Provides paper trading state to the app without modifying arb detection.
 */

import { createContext, useContext, useCallback, useReducer, useEffect } from "react";
import {
  loadState,
  persistState,
  createPaperTrade,
  settleTrade as storeSettleTrade,
  addToPaperTrade as storeAddToPaperTrade,
  findOpenTradeForArb,
  getPayoutForTrade,
  mergeOpportunityKeys,
  exportTradesToCSV,
  appendBalanceSnapshot,
  getInitialState,
  getDefaultBankroll,
} from "./paperTradingStore.js";
import { downloadPnLExcel, updateExistingExcelFile as updateExistingExcelFileFn, canUpdateExistingExcel } from "./exportPnLToExcel.js";

const PaperTradingContext = createContext(null);

function paperTradingReducer(state, action) {
  switch (action.type) {
    case "LOAD":
      return action.payload;
    case "PAPER_TRADE": {
      const { arb } = action.payload;
      const trade = createPaperTrade(arb, state.settings);
      const newBankroll = state.bankroll - trade.totalStaked;
      if (newBankroll < 0) return state;
      return appendBalanceSnapshot(
        { ...state, bankroll: newBankroll, trades: [trade, ...state.trades] },
        newBankroll
      );
    }
    case "PAPER_TRADE_BULK": {
      const { arbs } = action.payload;
      let bankroll = state.bankroll;
      const newTrades = [];
      for (const arb of arbs) {
        const trade = createPaperTrade(arb, state.settings);
        if (bankroll - trade.totalStaked >= 0) {
          bankroll -= trade.totalStaked;
          newTrades.push(trade);
        }
      }
      if (newTrades.length === 0) return state;
      return appendBalanceSnapshot(
        { ...state, bankroll, trades: [...newTrades, ...state.trades] },
        bankroll
      );
    }
    case "ADD_TO_PAPER_TRADE": {
      const { tradeId, arb } = action.payload;
      const idx = state.trades.findIndex((t) => t.id === tradeId);
      if (idx < 0) return state;
      const trade = state.trades[idx];
      if (trade.status !== "OPEN") return state;
      const additionalStake = (arb.betA || 0) + (arb.betB || 0);
      if (state.bankroll - additionalStake < 0) return state;
      const updated = storeAddToPaperTrade(trade, arb, state.settings);
      const newBankroll = state.bankroll - additionalStake;
      return appendBalanceSnapshot(
        {
          ...state,
          bankroll: newBankroll,
          trades: state.trades.map((t, i) => (i === idx ? updated : t)),
        },
        newBankroll
      );
    }
    case "SETTLE": {
      const { tradeId, winningLeg } = action.payload;
      const idx = state.trades.findIndex((t) => t.id === tradeId);
      if (idx < 0) return state;
      const trade = state.trades[idx];
      if (trade.status !== "OPEN") return state;
      const settled = storeSettleTrade(trade, winningLeg, state.settings);
      const actualPayout = getPayoutForTrade(settled, winningLeg);
      const newBankroll = state.bankroll + actualPayout;
      return appendBalanceSnapshot(
        {
          ...state,
          bankroll: newBankroll,
          trades: state.trades.map((t, i) => (i === idx ? settled : t)),
        },
        newBankroll
      );
    }
    case "VOID": {
      const { tradeId } = action.payload;
      const idx = state.trades.findIndex((t) => t.id === tradeId);
      if (idx < 0) return state;
      const trade = state.trades[idx];
      if (trade.status !== "OPEN") return state;
      const newBankroll = state.bankroll + trade.totalStaked;
      return appendBalanceSnapshot(
        {
          ...state,
          bankroll: newBankroll,
          trades: state.trades.map((t, i) => (i === idx ? { ...t, status: "VOID", settledAt: new Date().toISOString() } : t)),
        },
        newBankroll
      );
    }
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case "UPDATE_BANKROLL": {
      const newBankroll = action.payload;
      return appendBalanceSnapshot({ ...state, bankroll: newBankroll }, newBankroll);
    }
    case "REPORT_OPPORTUNITIES":
      return { ...state, opportunityKeys: mergeOpportunityKeys(state.opportunityKeys, action.payload) };
    case "CLEAR_ACCOUNT":
      return getInitialState(getDefaultBankroll(), state.settings);
    default:
      return state;
  }
}

export function PaperTradingProvider({ children, user }) {
  const [state, dispatch] = useReducer(paperTradingReducer, loadState(user));

  useEffect(() => {
    dispatch({ type: "LOAD", payload: loadState(user) });
  }, [user]);

  useEffect(() => {
    if (state) persistState(state, user);
  }, [state, user]);

  const paperTrade = useCallback(
    (arb) => {
      if (!state) return false;
      const trade = createPaperTrade(arb, state.settings);
      if (state.bankroll - trade.totalStaked < 0) return false;
      dispatch({ type: "PAPER_TRADE", payload: { arb } });
      return true;
    },
    [state]
  );

  const paperTradeBulk = useCallback(
    (arbs) => {
      if (!state || !arbs?.length) return;
      dispatch({ type: "PAPER_TRADE_BULK", payload: { arbs } });
    },
    [state]
  );

  const addToPaperTrade = useCallback(
    (arb) => {
      if (!state) return false;
      const existing = findOpenTradeForArb(state.trades, arb);
      if (!existing) return false;
      const additionalStake = (arb.betA || 0) + (arb.betB || 0);
      if (state.bankroll - additionalStake < 0) return false;
      dispatch({ type: "ADD_TO_PAPER_TRADE", payload: { tradeId: existing.id, arb } });
      return true;
    },
    [state]
  );

  const getOpenTradeForArb = useCallback(
    (arb) => findOpenTradeForArb(state?.trades ?? [], arb),
    [state?.trades]
  );

  const settle = useCallback((tradeId, winningLeg) => {
    dispatch({ type: "SETTLE", payload: { tradeId, winningLeg } });
  }, []);

  const voidTrade = useCallback((tradeId) => {
    dispatch({ type: "VOID", payload: { tradeId } });
  }, []);

  const updateSettings = useCallback((settings) => {
    dispatch({ type: "UPDATE_SETTINGS", payload: settings });
  }, []);

  const updateBankroll = useCallback((bankroll) => {
    dispatch({ type: "UPDATE_BANKROLL", payload: bankroll });
  }, []);

  const reportOpportunities = useCallback((arbs) => {
    dispatch({ type: "REPORT_OPPORTUNITIES", payload: arbs });
  }, []);

  const exportCSV = useCallback(() => {
    if (!state?.trades?.length) return "";
    return exportTradesToCSV(state.trades);
  }, [state?.trades]);

  const exportPnLToExcel = useCallback(() => {
    downloadPnLExcel(state);
  }, [state]);

  const updateExistingExcelFile = useCallback(async () => {
    return updateExistingExcelFileFn(state);
  }, [state]);

  const canUpdateExistingExcelFile = canUpdateExistingExcel();

  const clearAccount = useCallback(() => {
    dispatch({ type: "CLEAR_ACCOUNT" });
  }, []);

  const value = state
    ? {
        ...state,
        paperTrade,
        paperTradeBulk,
        addToPaperTrade,
        getOpenTradeForArb,
        settle,
        voidTrade,
        updateSettings,
        updateBankroll,
        reportOpportunities,
        exportCSV,
        exportPnLToExcel,
        updateExistingExcelFile,
        canUpdateExistingExcelFile,
        clearAccount,
        canPaperTrade: (arb) => {
          const trade = createPaperTrade(arb, state.settings);
          return state.bankroll >= trade.totalStaked;
        },
        canAddToPaperTrade: (arb) => {
          const existing = findOpenTradeForArb(state.trades, arb);
          if (!existing) return false;
          const additionalStake = (arb.betA || 0) + (arb.betB || 0);
          return state.bankroll >= additionalStake;
        },
      }
    : null;

  return (
    <PaperTradingContext.Provider value={value}>
      {children}
    </PaperTradingContext.Provider>
  );
}

export function usePaperTrading() {
  const ctx = useContext(PaperTradingContext);
  if (!ctx) throw new Error("usePaperTrading must be used within PaperTradingProvider");
  return ctx;
}

export function usePaperTradingOptional() {
  return useContext(PaperTradingContext);
}
