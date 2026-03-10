import crypto from "crypto";
import https from "https";

const KALSHI_HOST = process.env.KALSHI_API_HOST || "api.elections.kalshi.com";
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID;
const KALSHI_PRIVATE_KEY = (process.env.KALSHI_PRIVATE_KEY || "")
  .replace(/\\n/g, "\n")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n")
  .trim();

function signRequest(timestamp, method, path, privateKey) {
  const pathWithoutQuery = path.split("?")[0];
  const message = `${timestamp}${method}${pathWithoutQuery}`;
  return crypto
    .sign("sha256", Buffer.from(message), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    .toString("base64");
}

function fetchKalshi(pathWithQuery, method = "GET") {
  return new Promise((resolve, reject) => {
    const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
    const hasAuth = KALSHI_PRIVATE_KEY && KALSHI_API_KEY_ID;

    const headers = { Accept: "application/json" };
    if (hasAuth) {
      const pathForSigning = path.split("?")[0];
      const timestamp = String(Date.now());
      const signature = signRequest(timestamp, method, pathForSigning, KALSHI_PRIVATE_KEY);
      headers["KALSHI-ACCESS-KEY"] = KALSHI_API_KEY_ID;
      headers["KALSHI-ACCESS-TIMESTAMP"] = timestamp;
      headers["KALSHI-ACCESS-SIGNATURE"] = signature;
    }

    const options = {
      hostname: KALSHI_HOST,
      path,
      method,
      headers,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks), contentType: res.headers["content-type"] })
      );
    });
    req.on("error", reject);
    req.end();
  });
}

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    let pathWithQuery;
    const pathFromQuery = url.searchParams.get("path");
    if (pathFromQuery) {
      url.searchParams.delete("path");
      const rest = url.searchParams.toString();
      pathWithQuery = rest ? `${pathFromQuery}?${rest}` : pathFromQuery;
    } else {
      const pathname = req.headers.get("x-netlify-original-pathname") || url.pathname;
      const basePath = pathname.replace(/^\/kalshi-api/, "") || "/trade-api/v2/";
      const query = url.searchParams.toString();
      pathWithQuery = query ? `${basePath}?${query}` : basePath;
    }
    const fullPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;

    const { status, body, contentType } = await fetchKalshi(fullPath, req.method || "GET");

    return new Response(body, {
      status,
      headers: {
        "Content-Type": contentType || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Kalshi proxy: ${err.message}` }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};
