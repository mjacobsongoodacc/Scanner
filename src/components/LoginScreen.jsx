import { useState } from "react";
import { FONT } from "../styles.js";

const VALID_USERS = [
  { username: "admin", password: "ArbScan2026!" },
  { username: "maxj", password: "KalshiEdge#99" },
];

export default function LoginScreen({ onLogin }) {
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

  const inputStyle = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    background: "#0a0a0a", border: "1px solid #2a2a2a",
    borderRadius: 4, color: "#e0e0e0", outline: "none",
    boxSizing: "border-box", fontFamily: FONT,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: FONT,
    }}>
      <div style={{
        width: 360,
        background: "#111",
        borderRadius: 6,
        border: "1px solid #1e1e1e",
        padding: "40px 32px 36px",
      }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 600, color: "#e0e0e0",
          }}>Arbitrage Scanner</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#666" }}>
            Sign in to access the dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 5, fontWeight: 500 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 5, fontWeight: 500 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              background: "#1a0f0f", border: "1px solid #3a1a1a",
              borderRadius: 4, padding: "8px 12px", marginBottom: 16,
              fontSize: 13, color: "#c04040", textAlign: "center",
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 600,
              background: loading || !username || !password ? "#1a1a1a" : "#2a6e3f",
              color: loading || !username || !password ? "#555" : "#fff",
              border: "none", borderRadius: 4, fontFamily: FONT,
              cursor: loading || !username || !password ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
