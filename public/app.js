import {
  CASH_TARGET,
  DEFAULT_ASSETS,
  DEFAULT_CAPITAL_MXN,
  applyOrders,
  buildPortfolioSnapshot,
  buildRecommendations,
  calculateMetrics,
  generateRebalanceOrders,
} from "/strategy-core.mjs";

const STORAGE_KEY = "bolsa-lab-paper-v1";
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const percentage = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });

let market = { quotes: {}, usdMxn: 18, mode: "loading", fetchedAt: null };
let state = loadState();
let pendingOrders = [];

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.cashMxn >= 0 && stored?.positions) return stored;
  } catch {}
  return { initialCapitalMxn: DEFAULT_CAPITAL_MXN, cashMxn: DEFAULT_CAPITAL_MXN, positions: {}, transactions: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function qs(id) { return document.getElementById(id); }
function cleanNumber(value) { return Number.isFinite(value) ? value : 0; }

function marketSnapshot() {
  return buildPortfolioSnapshot({
    assets: DEFAULT_ASSETS,
    quotes: market.quotes,
    positions: state.positions,
    cashMxn: state.cashMxn,
    usdMxn: market.usdMxn,
  });
}

function metricsMap() {
  return Object.fromEntries(DEFAULT_ASSETS.map((asset) => [asset.symbol, calculateMetrics(market.quotes[asset.symbol]?.history ?? [])]));
}

function render() {
  const snapshot = marketSnapshot();
  const recommendations = buildRecommendations(snapshot, metricsMap());
  const pnl = snapshot.totalMxn - state.initialCapitalMxn - contributionTotal();

  qs("totalValue").textContent = money.format(snapshot.totalMxn);
  qs("totalPnl").textContent = `${pnl >= 0 ? "+" : ""}${money.format(pnl)} desde el inicio`;
  qs("totalPnl").className = pnl > 0 ? "positive" : pnl < 0 ? "negative" : "neutral";
  qs("investedValue").textContent = money.format(snapshot.investedMxn);
  qs("investedShare").textContent = `${percentage.format(snapshot.totalMxn ? snapshot.investedMxn / snapshot.totalMxn : 0)} de la cartera`;
  qs("cashValue").textContent = money.format(snapshot.cashMxn);
  qs("updatedAt").textContent = market.fetchedAt ? `Actualizado ${new Date(market.fetchedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : "Sin actualizar";

  renderAllocation(snapshot);
  renderPositions(snapshot, recommendations);
  renderRecommendations(recommendations);
  renderActivity();
}

function contributionTotal() {
  return state.transactions.filter((tx) => tx.side === "CONTRIBUTION").reduce((sum, tx) => sum + tx.amountMxn, 0);
}

function renderAllocation(snapshot) {
  const items = snapshot.rows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    current: row.currentWeight,
    target: row.targetWeight,
  }));
  items.push({ symbol: "EFECTIVO", name: "Reserva en MXN", current: snapshot.cashWeight, target: CASH_TARGET });
  qs("allocationBars").innerHTML = items.map((item) => `
    <div class="allocation-item">
      <div class="allocation-title"><strong>${item.symbol}</strong><span>${item.name}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(item.current * 100, 100)}%"></div></div>
      <div class="bar-value">${percentage.format(item.current)} / ${percentage.format(item.target)}</div>
    </div>`).join("");
}

function renderPositions(snapshot, recommendations) {
  qs("positionsTable").innerHTML = snapshot.rows.map((row) => {
    const recommendation = recommendations.find((item) => item.symbol === row.symbol);
    const quote = row.quote;
    const displayPrice = quote ? new Intl.NumberFormat("es-MX", { style: "currency", currency: quote.currency }).format(quote.price) : "—";
    const signalClass = recommendation.action === "COMPRAR" ? "signal-buy" : recommendation.action === "REDUCIR" ? "signal-reduce" : "signal-hold";
    return `<tr>
      <td><div class="asset-cell"><strong>${row.symbol}</strong><span>${row.name}</span></div></td>
      <td>${row.market}</td>
      <td>${displayPrice}</td>
      <td>${money.format(row.valueMxn)}<br><small class="muted">${cleanNumber(row.shares).toFixed(4)} títulos</small></td>
      <td class="weight-cell"><div class="bar-track"><div class="bar-fill" style="width:${Math.min(row.currentWeight / row.targetWeight * 100, 100)}%"></div></div><div class="weight-label"><span>${percentage.format(row.currentWeight)}</span><span>meta ${percentage.format(row.targetWeight)}</span></div></td>
      <td><span class="signal ${signalClass}">${recommendation.action}</span></td>
    </tr>`;
  }).join("");
}

function renderRecommendations(recommendations) {
  qs("recommendations").innerHTML = recommendations.map((item) => {
    const signalClass = item.action === "COMPRAR" ? "signal-buy" : item.action === "REDUCIR" ? "signal-reduce" : "signal-hold";
    return `<article class="recommendation">
      <div class="recommendation-head"><div><strong>${item.symbol}</strong> <span class="signal ${signalClass}">${item.action}</span></div><span class="score">señal ${item.score}/100</span></div>
      <p>${item.explanation}. Ajuste estimado: ${money.format(item.amountMxn)}.</p>
    </article>`;
  }).join("");
}

function renderActivity() {
  if (!state.transactions.length) {
    qs("activity").innerHTML = '<div class="activity-empty">Todavía no hay movimientos. El primer rebalanceo conservará 10% en efectivo.</div>';
    return;
  }
  qs("activity").innerHTML = state.transactions.slice(0, 20).map((tx) => {
    const isContribution = tx.side === "CONTRIBUTION";
    return `<div class="activity-row">
      <span class="activity-icon">${isContribution ? "+" : "↑"}</span>
      <div><strong>${isContribution ? "Aportación virtual" : `Compra de ${tx.symbol}`}</strong><small>${new Date(tx.executedAt).toLocaleString("es-MX")}</small></div>
      <span>${money.format(tx.amountMxn)}</span>
    </div>`;
  }).join("");
}

async function refreshMarket() {
  qs("dataStatus").textContent = "Cargando mercado…";
  qs("dataStatus").className = "status status-loading";
  qs("refreshButton").disabled = true;
  try {
    const symbols = [...DEFAULT_ASSETS.map((asset) => asset.symbol), "MXN=X"];
    const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
    if (!response.ok) throw new Error("No fue posible consultar precios");
    const payload = await response.json();
    market.quotes = Object.fromEntries(payload.results.filter((quote) => quote.symbol !== "MXN=X").map((quote) => [quote.symbol, quote]));
    const fx = payload.results.find((quote) => quote.symbol === "MXN=X");
    market.usdMxn = fx?.price || 18;
    market.mode = payload.mode;
    market.fetchedAt = payload.fetchedAt;
    qs("dataStatus").textContent = payload.mode === "live" ? "Datos de mercado" : "Modo demostración";
    qs("dataStatus").className = payload.mode === "live" ? "status" : "status status-demo";
  } catch {
    qs("dataStatus").textContent = "Sin conexión";
    qs("dataStatus").className = "status status-demo";
  } finally {
    qs("refreshButton").disabled = false;
    render();
  }
}

function openRebalance() {
  if (!Object.keys(market.quotes).length) return;
  const snapshot = marketSnapshot();
  pendingOrders = generateRebalanceOrders({ snapshot, assets: DEFAULT_ASSETS, quotes: market.quotes, usdMxn: market.usdMxn });
  qs("orderPreview").innerHTML = pendingOrders.length
    ? pendingOrders.map((order) => `<div class="order-row"><span>COMPRAR ${order.symbol}</span><strong>${money.format(order.amountMxn)}</strong></div>`).join("")
    : '<div class="activity-empty">La cartera ya está cerca de su objetivo o no hay efectivo disponible.</div>';
  qs("confirmOrdersButton").disabled = !pendingOrders.length;
  qs("confirmDialog").showModal();
}

function confirmOrders(event) {
  event.preventDefault();
  state = applyOrders(state, pendingOrders);
  saveState();
  qs("confirmDialog").close();
  pendingOrders = [];
  render();
}

function addContribution() {
  const amount = Number(qs("contributionInput").value);
  if (!Number.isFinite(amount) || amount < 50) return;
  state.cashMxn += amount;
  state.transactions.unshift({ id: crypto.randomUUID(), side: "CONTRIBUTION", amountMxn: amount, executedAt: new Date().toISOString(), simulated: true });
  saveState();
  render();
}

function resetSimulation() {
  if (!confirm("¿Reiniciar la cartera virtual a $1,000 MXN?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  render();
}

qs("refreshButton").addEventListener("click", refreshMarket);
qs("rebalanceButton").addEventListener("click", openRebalance);
qs("confirmOrdersButton").addEventListener("click", confirmOrders);
qs("contributionButton").addEventListener("click", addContribution);
qs("resetButton").addEventListener("click", resetSimulation);
qs("logoutButton").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.replace("/login");
});

refreshMarket();
