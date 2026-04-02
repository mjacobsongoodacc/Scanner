import { defineConfig } from "vite";
import https from "https";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same root `.env` as `scripts/dev-free-port.mjs` so `VITE_DEV_PORT` always agrees.
dotenv.config({ path: path.resolve(__dirname, ".env") });
const KALSHI_HOST = process.env.KALSHI_API_HOST || "api.elections.kalshi.com";
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID;
function resolveKalshiKeyPath() {
  const raw = process.env.KALSHI_PRIVATE_KEY_PATH;
  // vite.config.js lives at repo root — default key is ./kalshi.key next to it
  if (!raw) return path.resolve(__dirname, "kalshi.key");
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), raw);
}
const KALSHI_KEY_PATH = resolveKalshiKeyPath();

/** Lazy read so a bad path does not block Vite config. Path defaults to repo-root kalshi.key. */
let privateKeyCache;
function getPrivateKey() {
  if (privateKeyCache !== undefined) return privateKeyCache;
  try {
    privateKeyCache = fs.readFileSync(KALSHI_KEY_PATH, "utf-8");
  } catch {
    privateKeyCache = null;
  }
  return privateKeyCache;
}

function signRequest(privateKey, timestamp, method, urlPath) {
  const pathWithoutQuery = urlPath.split("?")[0];
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
      // Guard: prefix-mounted middleware must not run for GET `/` (hangs proxying index to Kalshi).
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || "";
        const pathOnly = rawUrl.split("?")[0] || "";
        if (!pathOnly.startsWith("/kalshi-api")) {
          return next();
        }
        let upstreamPath;
        const pathPart = pathOnly;
        const queryPart = rawUrl.split("?")[1] || "";
        const params = new URLSearchParams(queryPart);
        const pathParam = params.get("path");
        if (pathParam) {
          upstreamPath = pathParam.startsWith("/") ? pathParam : `/${pathParam}`;
        } else {
          upstreamPath = pathPart.replace(/^\/kalshi-api/, "").trim() || "/trade-api/v2/";
          if (queryPart) upstreamPath += `?${queryPart}`;
          if (!upstreamPath.startsWith("/")) upstreamPath = `/${upstreamPath}`;
        }

        const privateKey = getPrivateKey();
        const hasAuth = privateKey && KALSHI_API_KEY_ID;

        const headers = { Accept: "application/json" };
        if (hasAuth) {
          const pathForSigning = upstreamPath.split("?")[0];
          const timestamp = String(Date.now());
          const signature = signRequest(privateKey, timestamp, req.method, pathForSigning);
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
          const code = proxyRes.statusCode ?? 502;
          res.writeHead(code, {
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

const DEV_PORT = Number(process.env.VITE_DEV_PORT) || 5180;

export default defineConfig({
  // JSX via esbuild (plugin-react/Babel was hanging dev transforms on macOS after sleep).
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  plugins: [kalshiProxyPlugin()],
  server: {
    host: true,
    port: DEV_PORT,
    strictPort: true,
    // macOS: FS watchers often break after sleep; polling avoids a wedged dev server.
    watch: { usePolling: true, interval: 300 },
    // Avoid dev-only deadlocks where pre-transforming linked modules never completes.
    preTransformRequests: false,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
  },
});
