export const DEFAULT_CAPITAL_MXN = 1000;

export const DEFAULT_ASSETS = [
  {
    symbol: "VTI",
    name: "Mercado total de EE. UU.",
    market: "NYSE/Nasdaq",
    currency: "USD",
    kind: "ETF",
    targetWeight: 0.45,
  },
  {
    symbol: "NAFTRACISHRS.MX",
    name: "Índice bursátil mexicano",
    market: "BMV",
    currency: "MXN",
    kind: "ETF",
    targetWeight: 0.25,
  },
  {
    symbol: "BND",
    name: "Bonos diversificados de EE. UU.",
    market: "NYSE/Nasdaq",
    currency: "USD",
    kind: "ETF",
    targetWeight: 0.20,
  },
];

export const CASH_TARGET = 0.10;

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stdDev(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance);
}

export function calculateMetrics(history) {
  const closes = history.map((point) => Number(point.close)).filter(Number.isFinite);
  if (closes.length < 2) {
    return { return12m: 0, volatility: 0, sma200: closes.at(-1) ?? 0, drawdown: 0 };
  }

  const returns = closes.slice(1).map((value, index) => value / closes[index] - 1);
  const annualizedVolatility = stdDev(returns) * Math.sqrt(252);
  const maxWindow = closes.slice(-252);
  let peak = maxWindow[0];
  let maxDrawdown = 0;
  for (const price of maxWindow) {
    peak = Math.max(peak, price);
    maxDrawdown = Math.min(maxDrawdown, price / peak - 1);
  }

  const first = maxWindow[0];
  const last = maxWindow.at(-1);
  return {
    return12m: first ? last / first - 1 : 0,
    volatility: annualizedVolatility,
    sma200: mean(closes.slice(-200)),
    drawdown: maxDrawdown,
  };
}

export function scoreAsset(price, metrics) {
  let score = 50;
  const reasons = [];

  if (price >= metrics.sma200) {
    score += 15;
    reasons.push("precio por encima de su promedio de 200 días");
  } else {
    score -= 15;
    reasons.push("precio por debajo de su promedio de 200 días");
  }

  if (metrics.return12m > 0) {
    score += 15;
    reasons.push("tendencia anual positiva");
  } else {
    score -= 10;
    reasons.push("tendencia anual negativa");
  }

  if (metrics.volatility <= 0.25) {
    score += 10;
    reasons.push("volatilidad moderada");
  } else if (metrics.volatility > 0.40) {
    score -= 15;
    reasons.push("volatilidad elevada");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export function positionValueMxn(position, quote, usdMxn) {
  const multiplier = quote.currency === "USD" ? usdMxn : 1;
  return (position?.shares ?? 0) * quote.price * multiplier;
}

export function buildPortfolioSnapshot({ assets, quotes, positions, cashMxn, usdMxn }) {
  const rows = assets.map((asset) => {
    const quote = quotes[asset.symbol];
    const position = positions[asset.symbol] ?? { shares: 0, costMxn: 0 };
    const valueMxn = quote ? positionValueMxn(position, quote, usdMxn) : 0;
    return { ...asset, ...position, quote, valueMxn };
  });
  const investedMxn = rows.reduce((sum, row) => sum + row.valueMxn, 0);
  const totalMxn = investedMxn + cashMxn;
  return {
    rows: rows.map((row) => ({
      ...row,
      currentWeight: totalMxn ? row.valueMxn / totalMxn : 0,
      pnlMxn: row.valueMxn - row.costMxn,
    })),
    investedMxn,
    cashMxn,
    totalMxn,
    cashWeight: totalMxn ? cashMxn / totalMxn : 0,
  };
}

export function buildRecommendations(snapshot, metricsBySymbol, driftThreshold = 0.03) {
  return snapshot.rows.map((row) => {
    const metrics = metricsBySymbol[row.symbol] ?? {
      return12m: 0,
      volatility: 0,
      sma200: row.quote?.price ?? 0,
      drawdown: 0,
    };
    const signal = scoreAsset(row.quote?.price ?? 0, metrics);
    const drift = row.targetWeight - row.currentWeight;
    let action = "MANTENER";

    if (drift > driftThreshold) action = "COMPRAR";
    if (drift < -driftThreshold) action = "REDUCIR";

    const targetValueMxn = snapshot.totalMxn * row.targetWeight;
    const amountMxn = Math.abs(targetValueMxn - row.valueMxn);
    const allocationReason =
      action === "COMPRAR"
        ? `está ${Math.abs(drift * 100).toFixed(1)} puntos debajo del objetivo`
        : action === "REDUCIR"
          ? `está ${Math.abs(drift * 100).toFixed(1)} puntos arriba del objetivo`
          : "se encuentra cerca de su peso objetivo";

    return {
      symbol: row.symbol,
      action,
      amountMxn,
      drift,
      score: signal.score,
      explanation: `${allocationReason}; ${signal.reasons.join("; ")}`,
      metrics,
    };
  });
}

export function generateRebalanceOrders({ snapshot, assets, quotes, usdMxn }) {
  const targetCashMxn = snapshot.totalMxn * CASH_TARGET;
  const availableForBuys = Math.max(0, snapshot.cashMxn - targetCashMxn);
  const desired = assets
    .map((asset) => {
      const row = snapshot.rows.find((item) => item.symbol === asset.symbol);
      return {
        asset,
        row,
        deltaMxn: snapshot.totalMxn * asset.targetWeight - (row?.valueMxn ?? 0),
      };
    })
    .filter(({ deltaMxn }) => deltaMxn > 1);

  const totalDesired = desired.reduce((sum, item) => sum + item.deltaMxn, 0);
  if (!totalDesired || !availableForBuys) return [];

  return desired.map(({ asset, deltaMxn }) => {
    const quote = quotes[asset.symbol];
    const amountMxn = Math.min(deltaMxn, availableForBuys * (deltaMxn / totalDesired));
    const priceMxn = quote.price * (quote.currency === "USD" ? usdMxn : 1);
    return {
      side: "BUY",
      symbol: asset.symbol,
      amountMxn,
      shares: priceMxn ? amountMxn / priceMxn : 0,
      priceMxn,
    };
  });
}

export function applyOrders(state, orders) {
  const next = structuredClone(state);
  next.positions ??= {};
  next.transactions ??= [];

  for (const order of orders) {
    if (order.side !== "BUY" || order.amountMxn > next.cashMxn + 0.01) continue;
    const current = next.positions[order.symbol] ?? { shares: 0, costMxn: 0 };
    next.positions[order.symbol] = {
      shares: current.shares + order.shares,
      costMxn: current.costMxn + order.amountMxn,
    };
    next.cashMxn -= order.amountMxn;
    next.transactions.unshift({
      ...order,
      id: crypto.randomUUID(),
      executedAt: new Date().toISOString(),
      simulated: true,
    });
  }

  return next;
}
