# Arbitrage Scanner

Multi-sport arbitrage scanner for MLB, NBA, NCAA Basketball, and NFL. Finds profitable betting opportunities across sportsbooks and Kalshi event contracts.

## Features

- **Cross-book arbitrage detection** — compares odds across DraftKings, FanDuel, BetMGM, and other major sportsbooks
- **Kalshi integration** — spots arbitrage between Kalshi event contracts and traditional sportsbooks, accounting for taker fees and whole-contract sizing
- **Player props arbitrage** — scans Over/Under player points, assists, and rebounds (NBA, NCAAB) across sportsbooks and Kalshi; lazy-loads on Player Props tab with API credit confirmation
- **Moneyline & spread markets** — scans both market types for each game
- **Confidence scoring** — rates opportunities by Kalshi volume and bid-ask spread
- **Execution validation** — filters phantom/stale arbs; actionable vs monitor vs rejected
- **Paper trading** — track simulated trades with PnL and Excel export
- **Built-in calculator** — manual two-leg arbitrage calculator with Kalshi fee modeling
- **Login-protected dashboard** — authentication gate before accessing the scanner
- **Multi-sport support** — Baseball (MLB), Basketball (NBA), NCAA Basketball, NFL via dropdown selector

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite 7 |
| APIs | [The Odds API](https://the-odds-api.com/), [Kalshi API](https://kalshi.com/) |
| CLI tool | Python 3 (`arbitrage_scanner.py`) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- (Optional) Python 3.10+ for the CLI scanner

### Install & Run

```bash
npm install
npm run dev
```

The app starts at `http://localhost:5174` (override with `VITE_DEV_PORT`).

### The Odds API (required for sportsbook odds)

Sportsbook odds come from [The Odds API](https://the-odds-api.com/). Get a free key (500 requests/month):

1. Sign up at [the-odds-api.com](https://the-odds-api.com/)
2. Add to `.env`:
   ```
   VITE_ODDS_API_KEY=your-odds-api-key
   ```

**Important:** This is different from the Kalshi API key. Do not use your Kalshi key for the Odds API.

**Player props:** The Player Props tab uses the event-odds endpoint (~N games × 3 markets per fetch). A confirmation dialog appears before the first props fetch; results are cached 1 hour.

### Kalshi API (optional)

The Kalshi events endpoint is **public** — no API keys needed for market data. To use authenticated endpoints or ensure best availability:

1. Create an API key at [Kalshi](https://kalshi.com/) → Account & Security → API Keys.
2. Add to `.env`:
   ```
   KALSHI_API_KEY_ID=your-key-id
   KALSHI_PRIVATE_KEY_PATH=./kalshi.key
   ```
3. Place your downloaded private key at `./kalshi.key`.

Override the API host with `KALSHI_API_HOST` (default: `api.elections.kalshi.com`).

### Deploy to Netlify

**Environment variables** (Netlify → Site settings → Environment variables):

| Variable | Required | Scope | Notes |
|----------|----------|-------|-------|
| `VITE_ODDS_API_KEY` | Yes | **Builds** (or All) | Sportsbook odds. Must be set before deploy; triggers a new build. |
| `KALSHI_API_KEY_ID` | For Kalshi | Functions (or All) | Your Kalshi API key ID |
| `KALSHI_PRIVATE_KEY` | For Kalshi | Functions (or All) | **Full PEM content** of your private key — not `KALSHI_PRIVATE_KEY_PATH` |

**Important:**
- `KALSHI_PRIVATE_KEY_PATH` does **not** work on Netlify (no filesystem). Use `KALSHI_PRIVATE_KEY` and paste the entire key contents.
- `VITE_ODDS_API_KEY` is embedded at **build** time. After adding or changing it: **Deploys → Trigger deploy → Deploy site** (a new build must run).
- Ensure env vars have scope **Builds** (or All) so they're available during the build.

### Build for Production

```bash
npm run build
npm run preview
```

### Python CLI Scanner

```bash
pip install requests openpyxl
python arbitrage_scanner.py --odds-api-key YOUR_KEY --sport nba --stake 100
```

Outputs an Excel file with all detected arbitrage opportunities.

## Project Structure

```
├── netlify/functions/
│   └── kalshi-proxy.mjs      # Kalshi API proxy for Netlify deployments
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── styles.js
│   ├── arb/                   # Arb detection, odds utils, Kalshi fetch
│   │   ├── fetchKalshiMarkets.js
│   │   ├── fetchKalshiPlayerProps.js
│   │   ├── discoverKalshiPropSeries.js
│   │   ├── fetchOddsApiPlayerProps.js
│   │   ├── findArbs.js / findPropArbs.js
│   │   ├── playerPropUtils.js
│   │   └── stakeSizing.js
│   ├── arbValidation/         # Execution validation, confidence scoring
│   ├── paperTrading/          # Paper trading store, dashboard, Excel export
│   └── components/           # Dashboard, ArbCard, PropArbCard, etc.
├── arbitrage_scanner.py      # Python CLI scanner
├── docs/ARB_VALIDATION.md     # Validation pipeline docs
├── vite.config.js
└── package.json
```

## How it works

### Arbitrage detection

An arbitrage exists when the implied probabilities of two opposite outcomes sum to less than 1.0:

```
1/decimalOdds_A + 1/decimalOdds_B < 1.0
```

The profit margin is `(1 − implied_sum) / implied_sum` as a percentage of total stake. The scanner flags opportunities below a 1.03 implied sum threshold (true arbs and near-arbs).

### Kalshi fee model

Kalshi charges a 7% taker fee on the notional contract value:

```
taker_fee = ceil(0.07 × contracts × (price_cents/100) × (1 − price_cents/100) × 100) / 100
```

This fee is applied per leg and subtracted before determining whether an opportunity is profitable.

### Validation pipeline

Raw arbs are passed through a validation pipeline that:

1. Evaluates Kalshi bid-ask spread and volume (slippage risk)
2. Applies execution-adjusted margin accounting for fees and slippage
3. Assigns status: **Actionable** (green), **Monitor** (amber), or **Rejected** (red)
4. Computes a 0–100 confidence score

See [`docs/ARB_VALIDATION.md`](docs/ARB_VALIDATION.md) for full details.

## License

ISC
