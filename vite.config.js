import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import https from "https";

const KALSHI_API_KEY = "74a43176-8f20-4502-ae7b-160f9673132f";

function kalshiProxyPlugin() {
  return {
    name: "kalshi-proxy",
    configureServer(server) {
      server.middlewares.use("/kalshi-api", (req, res) => {
        const options = {
          hostname: "trading-api.kalshi.com",
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
