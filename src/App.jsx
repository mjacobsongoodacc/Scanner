import { useState } from "react";
import { PaperTradingProvider } from "./paperTrading/PaperTradingContext.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import SetupScreen from "./components/SetupScreen.jsx";
import Dashboard from "./components/Dashboard.jsx";

const DEFAULT_CONFIG = {
  apiKey: import.meta.env.VITE_ODDS_API_KEY ?? "",
  sport: "nba",
  stake: 100,
};

export default function App() {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  const content = config ? <Dashboard config={config} onConfigChange={setConfig} /> : <SetupScreen onStart={setConfig} />;
  return <PaperTradingProvider user={user}>{content}</PaperTradingProvider>;
}
