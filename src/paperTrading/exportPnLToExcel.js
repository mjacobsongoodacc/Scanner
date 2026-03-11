/**
 * Export All-Time PnL History to Excel
 * Creates an easily readable .xlsx with Balance History and Trade PnL sheets.
 */

import * as XLSX from "xlsx";

const DEFAULT_BANKROLL = 1000;

/**
 * Build Excel workbook from balance history and trades.
 * @param {{ ts: string; balance: number }[]} balanceHistory - Time-series of account balance
 * @param {Object[]} trades - Paper trades (for Trade PnL sheet)
 * @param {number} [startBalance] - Starting bankroll for PnL calc
 */
export function buildPnLWorkbook(balanceHistory = [], trades = [], startBalance = DEFAULT_BANKROLL) {
  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: Balance History (All-Time PnL Timeline) ───
  const balanceHeaders = ["Date", "Time", "Balance ($)", "Cumulative PnL ($)", "PnL %"];
  const balanceRows = (balanceHistory.length ? balanceHistory : [{ ts: new Date().toISOString(), balance: startBalance }])
    .map(({ ts, balance }) => {
      const d = new Date(ts);
      const pnl = balance - startBalance;
      const pnlPct = startBalance > 0 ? ((pnl / startBalance) * 100).toFixed(2) : "";
      return [
        d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }),
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        Number(balance.toFixed(2)),
        Number(pnl.toFixed(2)),
        pnlPct ? `${pnlPct}%` : "",
      ];
    });

  const balanceSheet = XLSX.utils.aoa_to_sheet([balanceHeaders, ...balanceRows]);
  balanceSheet["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, balanceSheet, "Balance History");

  // ─── Sheet 2: Trade PnL (Per-Trade Contributions) ───
  const tradeHeaders = [
    "Date",
    "Game",
    "Leg A",
    "Leg B",
    "Total Staked ($)",
    "Gross PnL ($)",
    "Additional Fees ($)",
    "Kalshi Fees In Stake ($)",
    "Net PnL ($)",
    "Status",
  ];
  const settledTrades = trades.filter((t) => t.status === "SETTLED");
  const tradeRows = settledTrades.map((t) => {
    const date = t.settledAt || t.placedAt || t.detectedAt;
    const d = date ? new Date(date) : null;
    const gross = t.grossPnl ?? 0;
    const fees = t.fees?.total ?? (t.fees?.creditCard ?? 0) + (t.fees?.platform ?? 0);
    const kalshiIncluded = t.fees?.kalshi ?? 0;
    const net = t.netPnl ?? gross - fees;
    return [
      d ? d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "",
      t.game ?? "",
      `${t.legA?.platform ?? ""} ${t.legA?.line ?? ""}`.trim(),
      `${t.legB?.platform ?? ""} ${t.legB?.line ?? ""}`.trim(),
      Number((t.totalStaked ?? 0).toFixed(2)),
      Number(gross.toFixed(2)),
      Number(fees.toFixed(2)),
      Number(kalshiIncluded.toFixed(2)),
      Number(net.toFixed(2)),
      t.status ?? "",
    ];
  });

  // Add summary row at top of trade sheet
  const grossTotal = settledTrades.reduce((s, t) => s + (t.grossPnl ?? 0), 0);
  const feeTotal = settledTrades.reduce(
    (s, t) => s + (t.fees?.total ?? (t.fees?.creditCard ?? 0) + (t.fees?.platform ?? 0)),
    0
  );
  const kalshiIncludedTotal = settledTrades.reduce(
    (s, t) => s + (t.fees?.kalshi ?? 0),
    0
  );
  const netTotal = settledTrades.reduce((s, t) => s + (t.netPnl ?? ((t.grossPnl ?? 0) - (t.fees?.total ?? 0))), 0);

  const tradeSheet = XLSX.utils.aoa_to_sheet([
    ["Paper Trading PnL Summary", "", "", "", "", "", "", "", "", ""],
    ["Total Gross PnL", "", "", "", "", grossTotal.toFixed(2), "", "", "", ""],
    ["Total Additional Fees", "", "", "", "", "", feeTotal.toFixed(2), "", "", ""],
    ["Kalshi Fees Already In Stake", "", "", "", "", "", "", kalshiIncludedTotal.toFixed(2), "", ""],
    ["Total Net PnL", "", "", "", "", "", "", "", netTotal.toFixed(2), ""],
    [],
    tradeHeaders,
    ...tradeRows,
  ]);
  tradeSheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
    { wch: 12 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, tradeSheet, "Trade PnL");

  return wb;
}

/**
 * Trigger download of PnL History as .xlsx
 * @param {Object} state - Paper trading state { balanceHistory, trades, bankroll }
 */
export function downloadPnLExcel(state) {
  const history = state?.balanceHistory ?? [];
  const trades = state?.trades ?? [];
  // Use first balance snapshot as baseline for cumulative PnL
  const firstBalance = history[0]?.balance ?? state?.bankroll ?? DEFAULT_BANKROLL;

  const wb = buildPnLWorkbook(history, trades, firstBalance);
  const filename = `paper_trading_pnl_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Check if File System Access API is supported (Chrome, Edge).
 */
export function canUpdateExistingExcel() {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/**
 * Update an existing Excel file. User picks the file; we update Balance History and Trade PnL sheets.
 * Requires Chrome or Edge. Must be called from a user gesture (e.g. button click).
 * @param {Object} state - Paper trading state
 * @returns {Promise<{ ok: boolean; message: string }>}
 */
export async function updateExistingExcelFile(state) {
  if (!canUpdateExistingExcel()) {
    return { ok: false, message: "This feature requires Chrome or Edge. Use Download Excel in other browsers." };
  }

  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: "Excel files", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
      multiple: false,
    });

    const file = await fileHandle.getFile();
    const data = await file.arrayBuffer();
    const existingWb = XLSX.read(data, { type: "array" });

    const history = state?.balanceHistory ?? [];
    const trades = state?.trades ?? [];
    const firstBalance = history[0]?.balance ?? state?.bankroll ?? DEFAULT_BANKROLL;
    const pnlWb = buildPnLWorkbook(history, trades, firstBalance);

    // Replace or add our sheets; leave other sheets untouched
    const sheetNames = existingWb.SheetNames ?? [];
    const toUpdate = [
      { name: "Balance History", sheet: pnlWb.Sheets["Balance History"] },
      { name: "Trade PnL", sheet: pnlWb.Sheets["Trade PnL"] },
    ];

    for (const { name, sheet } of toUpdate) {
      const idx = sheetNames.indexOf(name);
      if (idx >= 0) {
        existingWb.Sheets[name] = sheet;
      } else {
        existingWb.SheetNames.push(name);
        existingWb.Sheets[name] = sheet;
      }
    }

    const out = XLSX.write(existingWb, { bookType: "xlsx", type: "array" });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([out]));
    await writable.close();

    return { ok: true, message: "Excel file updated successfully." };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, message: "Cancelled." };
    }
    return { ok: false, message: err?.message ?? String(err) };
  }
}
