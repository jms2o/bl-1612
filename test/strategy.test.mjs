import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ASSETS,
  applyOrders,
  buildPortfolioSnapshot,
  calculateMetrics,
  generateRebalanceOrders,
} from "../lib/strategy.mjs";

const quotes = Object.fromEntries(DEFAULT_ASSETS.map((asset, index) => [asset.symbol, {
  price: asset.currency === "USD" ? 100 + index * 10 : 50,
  currency: asset.currency,
  history: Array.from({ length: 252 }, (_, day) => ({ close: 100 + day * 0.1 })),
}]));

test("calculates positive trend metrics", () => {
  const metrics = calculateMetrics(Array.from({ length: 252 }, (_, day) => ({ close: 100 + day })));
  assert.ok(metrics.return12m > 0);
  assert.ok(metrics.sma200 > 0);
  assert.equal(metrics.drawdown, 0);
});

test("keeps ten percent cash during initial rebalance", () => {
  const snapshot = buildPortfolioSnapshot({ assets: DEFAULT_ASSETS, quotes, positions: {}, cashMxn: 1000, usdMxn: 18 });
  const orders = generateRebalanceOrders({ snapshot, assets: DEFAULT_ASSETS, quotes, usdMxn: 18 });
  const total = orders.reduce((sum, order) => sum + order.amountMxn, 0);
  assert.ok(Math.abs(total - 900) < 0.01);
});

test("applies paper orders without overspending", () => {
  const state = { cashMxn: 1000, positions: {}, transactions: [] };
  const next = applyOrders(state, [{ side: "BUY", symbol: "VTI", amountMxn: 450, shares: 0.25, priceMxn: 1800 }]);
  assert.equal(next.cashMxn, 550);
  assert.equal(next.positions.VTI.costMxn, 450);
  assert.equal(next.transactions.length, 1);
});
