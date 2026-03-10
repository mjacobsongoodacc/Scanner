# Arbitrage Scanner

NBA and NCAAB arbitrage scanner that finds profitable betting opportunities across sportsbooks and Kalshi event contracts.

## Features

- **Cross-book arbitrage detection** — compares odds across DraftKings, FanDuel, BetMGM, and other major sportsbooks
- **Kalshi integration** — spots arbitrage between Kalshi event contracts and traditional sportsbooks, accounting for taker fees and whole-contract sizing
- **Moneyline & spread markets** — scans both market types for each game
- **Confidence scoring** — rates opportunities by Kalshi volume and bid-ask spread
- **Built-in calculator** — manual two-leg arbitrage calculator with Kalshi fee modeling
- **Login-protected dashboard** — authentication gate before accessing the scanner

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
├── index.html                 # HTML shell
├── src/
│   ├── main.jsx               # React entry point
│   └── ArbitrageScanner.jsx   # All UI: login, setup, dashboard, calculator
├── arbitrage_scanner.py       # Standalone Python CLI scanner
├── vite.config.js             # Vite config with Kalshi proxy middleware
└── package.json
```

## License

ISC
