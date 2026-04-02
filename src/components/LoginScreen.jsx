import { useState, useEffect, useCallback } from "react";

const VALID_USERS = [
  { username: "admin", password: "ArbScan2026!" },
  { username: "maxj", password: "KalshiEdge#99" },
];

function formatTerminalClock() {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}.${get("month")}.${get("day")} — ${get("hour")}:${get("minute")}:${get("second")} CST`;
  } catch {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} — ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} CST`;
  }
}

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [clock, setClock] = useState(() => formatTerminalClock());

  const tick = useCallback(() => setClock(formatTerminalClock()), []);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProgressKey((k) => k + 1);
    setTimeout(() => {
      const match = VALID_USERS.find((u) => u.username === username && u.password === password);
      if (match) {
        onLogin(match.username);
      } else {
        setError("Invalid username or password");
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="login-terminal">
      <div className="login-terminal-scanlines" aria-hidden />
      <div className="login-terminal-inner">
        <header className="login-terminal-brand">
          <h1 className="login-terminal-wordmark">ARBITRAGE</h1>
          <h1 className="login-terminal-wordmark login-terminal-wordmark--accent">SCANNER</h1>
          <div className="login-terminal-rule" />
          <p className="login-terminal-tagline">Cross-exchange arbitrage detection</p>
        </header>

        <form className="login-terminal-form" onSubmit={handleSubmit} noValidate>
          <div className="login-terminal-field">
            <label className="login-terminal-label" htmlFor="login-user">
              USERNAME
            </label>
            <input
              id="login-user"
              type="text"
              className="login-terminal-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              spellCheck={false}
            />
          </div>
          <div className="login-terminal-field">
            <label className="login-terminal-label" htmlFor="login-pass">
              PASSWORD
            </label>
            <input
              id="login-pass"
              type="password"
              className="login-terminal-input login-terminal-input--password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="login-terminal-actions">
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="login-terminal-btn"
            >
              AUTHENTICATE →
            </button>
            {loading && (
              <div className="login-progress-track" aria-hidden>
                <div key={progressKey} className="login-progress-bar" />
              </div>
            )}
          </div>

          {error && !loading && (
            <p className="login-terminal-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>

      <time className="login-terminal-clock" dateTime={new Date().toISOString()}>
        {clock}
      </time>
    </div>
  );
}
