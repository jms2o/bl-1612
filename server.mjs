import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./public", import.meta.url));
const strategyPath = fileURLToPath(new URL("./lib/strategy.mjs", import.meta.url));
const port = Number(process.env.PORT || 4173);
const allowedSymbol = /^[A-Z0-9.^=-]{1,32}$/i;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function fetchYahooChart(symbol) {
  const endpoint = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  endpoint.searchParams.set("range", "1y");
  endpoint.searchParams.set("interval", "1d");
  endpoint.searchParams.set("events", "div,splits");

  const upstream = await fetch(endpoint, {
    headers: { "User-Agent": "Mozilla/5.0 BolsaLab/0.1" },
    signal: AbortSignal.timeout(9000),
  });
  if (!upstream.ok) throw new Error(`Fuente respondió ${upstream.status}`);
  const payload = await upstream.json();
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(payload?.chart?.error?.description || "Sin datos");

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const history = timestamps
    .map((timestamp, index) => ({ date: new Date(timestamp * 1000).toISOString(), close: closes[index] }))
    .filter((point) => Number.isFinite(point.close));
  const price = Number(result.meta?.regularMarketPrice ?? history.at(-1)?.close);
  return {
    symbol,
    price,
    previousClose: Number(result.meta?.chartPreviousClose ?? price),
    currency: result.meta?.currency ?? (symbol.endsWith(".MX") ? "MXN" : "USD"),
    exchange: result.meta?.exchangeName ?? "",
    history,
  };
}

function demoChart(symbol, index) {
  const isMxn = symbol.endsWith(".MX");
  const base = isMxn ? 45 + index * 7 : 70 + index * 55;
  const history = [];
  for (let day = 0; day < 252; day += 1) {
    const date = new Date(Date.now() - (251 - day) * 86400000);
    const trend = 1 + day * (0.00018 + index * 0.00003);
    const wave = 1 + Math.sin(day / 14 + index) * 0.035 + Math.sin(day / 43) * 0.025;
    history.push({ date: date.toISOString(), close: Number((base * trend * wave).toFixed(2)) });
  }
  return {
    symbol,
    price: history.at(-1).close,
    previousClose: history.at(-2).close,
    currency: isMxn ? "MXN" : "USD",
    exchange: isMxn ? "MEX" : "NASDAQ",
    history,
    demo: true,
  };
}

async function quoteRoute(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const symbols = [...new Set((url.searchParams.get("symbols") || "").split(",").filter(Boolean))];
  if (!symbols.length || symbols.length > 12 || symbols.some((symbol) => !allowedSymbol.test(symbol))) {
    return json(response, 400, { error: "Solicita entre 1 y 12 símbolos válidos." });
  }

  let mode = "live";
  const results = await Promise.all(
    symbols.map(async (symbol, index) => {
      try {
        return await fetchYahooChart(symbol);
      } catch (error) {
        mode = "demo";
        return { ...demoChart(symbol, index), fallbackReason: error.message };
      }
    }),
  );
  json(response, 200, { mode, fetchedAt: new Date().toISOString(), results });
}

async function staticRoute(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/strategy-core.mjs") {
    const body = await readFile(strategyPath);
    response.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
    return;
  }
  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safePath = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(root, safePath);
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No encontrado");
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET") return json(response, 405, { error: "Método no permitido" });
  if (request.url.startsWith("/api/quotes")) return quoteRoute(request, response);
  return staticRoute(request, response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`BolsaLab disponible en http://localhost:${port}`);
});
