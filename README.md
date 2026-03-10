# Arbitrage Scanner

Multi-sport arbitrage scanner for MLB, NBA, NCAA Basketball, and NFL. Finds profitable betting opportunities across sportsbooks and Kalshi event contracts.

## Features

- **Cross-book arbitrage detection** — compares odds across DraftKings, FanDuel, BetMGM, and other major sportsbooks
- **Kalshi integration** — spots arbitrage between Kalshi event contracts and traditional sportsbooks, accounting for taker fees and whole-contract sizing
- **Moneyline & spread markets** — scans both market types for each game
- **Confidence scoring** — rates opportunities by Kalshi volume and bid-ask spread
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

The app starts at `http://localhost:5173`.

### The Odds API (required for sportsbook odds)

Sportsbook odds come from [The Odds API](https://the-odds-api.com/). Get a free key (500 requests/month):

1. Sign up at [the-odds-api.com](https://the-odds-api.com/)
2. Add to `.env`:
   ```
   VITE_ODDS_API_KEY=your-odds-api-key
   ```

**Important:** This is different from the Kalshi API key. Do not use your Kalshi key for the Odds API.

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
│   ├── arbValidation/         # Execution validation, confidence scoring
│   ├── paperTrading/          # Paper trading store & dashboard
│   └── components/            # LoginScreen, SetupScreen, Dashboard, ArbCard, etc.
├── arbitrage_scanner.py
├── vite.config.js
└── package.json
```

## License

ISC
