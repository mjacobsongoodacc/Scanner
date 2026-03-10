import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import https from "https";
import crypto from "crypto";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const KALSHI_HOST = process.env.KALSHI_API_HOST || "api.elections.kalshi.com";
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID;
const KALSHI_KEY_PATH = process.env.KALSHI_PRIVATE_KEY_PATH || "./kalshi.key";

let privateKey = null;
try {
  privateKey = fs.readFileSync(KALSHI_KEY_PATH, "utf-8");
} catch {
  // Private key optional for public endpoints (e.g. GET /events)
}

function signRequest(timestamp, method, path) {
  const pathWithoutQuery = path.split("?")[0];
  const message = `${timestamp}${method}${pathWithoutQuery}`;
  const signature = crypto.sign("sha256", Buffer.from(message), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString("base64");
}

function kalshiProxyPlugin() {
  return {
    name: "kalshi-proxy",
    configureServer(server) {
      server.middlewares.use("/kalshi-api", (req, res) => {
        // req.url may be full path (/kalshi-api/...) or remainder (/trade-api/...) depending on Connect
        let upstreamPath = (req.url || "/").replace(/^\/kalshi-api/, "").trim() || "/trade-api/v2/";
        if (!upstreamPath.startsWith("/")) upstreamPath = `/${upstreamPath}`;

        const hasAuth = privateKey && KALSHI_API_KEY_ID;
        const isGetEvents = req.method === "GET" && upstreamPath.includes("/events");

        const headers = { Accept: "application/json" };
        if (hasAuth) {
          const pathForSigning = upstreamPath.split("?")[0];
          const timestamp = String(Date.now());
          const signature = signRequest(timestamp, req.method, pathForSigning);
          headers["KALSHI-ACCESS-KEY"] = KALSHI_API_KEY_ID;
          headers["KALSHI-ACCESS-TIMESTAMP"] = timestamp;
          headers["KALSHI-ACCESS-SIGNATURE"] = signature;
        }

        const options = {
          hostname: KALSHI_HOST,
          path: upstreamPath,
          method: req.method,
          headers,
        };

        const proxyReq = https.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, {
            "Content-Type": proxyRes.headers["content-type"] || "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          proxyRes.pipe(res);
        });
        proxyReq.on("error", (err) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Kalshi proxy: ${err.message}` }));
        });
        proxyReq.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), kalshiProxyPlugin()],
});
