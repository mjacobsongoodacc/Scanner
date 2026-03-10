import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import https from "https";

const KALSHI_API_KEY = "1abdab8d-2e42-4705-b12f-8a7be9e72d43";

function kalshiProxyPlugin() {
  return {
    name: "kalshi-proxy",
    configureServer(server) {
      server.middlewares.use("/kalshi-api", (req, res) => {
        const options = {
          hostname: "api.elections.kalshi.com",
          path: req.url,
          method: req.method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${KALSHI_API_KEY}`,
          },
        };
        const proxyReq = https.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, {
            "Content-Type": proxyRes.headers["content-type"] || "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          proxyRes.pipe(res);
        });
        proxyReq.on("error", (err) => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        });
        proxyReq.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), kalshiProxyPlugin()],
});
