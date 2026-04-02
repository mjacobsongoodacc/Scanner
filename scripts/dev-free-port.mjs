/**
 * Frees the dev port before `npm run dev` so stale Vite/Node listeners
 * don't wedge the tab (connection accepted but never responds).
 * Must load the same .env as vite.config.js so VITE_DEV_PORT matches.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const port = process.env.VITE_DEV_PORT || "5180";

try {
  const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`, {
    encoding: "utf8",
  }).trim();
  const pids = out.split(/\n/).filter(Boolean);
  for (const pid of pids) {
    const n = Number(pid);
    if (n > 0) {
      try {
        process.kill(n, "SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }
} catch {
  /* no listeners */
}
