/* ============================================================
 * app.js — Núcleo da SPA "Compras Inteligentes"
 * ------------------------------------------------------------
 * Responsabilidades:
 *   - Estado global + persiste no IndexedDB (db.js)
 *   - Cálculo de totais e validação de pagamentos
 *   - Índice de preços (comparador) e sugestões rápidas
 *   - Agregações do dashboard (chamando js/charts.js)
 *   - Backup exportar/importar .json
 *   - Inicialização: banco, service worker, storage.persist()
 *
 * Renderizadores de interface ficam em js/views.js.
 * Fluxo:  Planejamento -> (Iniciar Compra) -> Em Compras
 *         -> (Finalizar) -> Histórico -> (Reaproveitar) -> Planejamento
 * ============================================================ */

"use strict";

/* --------------------------------------------------------------
 * 1) Constantes e Estado Global
 * -------------------------------------------------------------- */

const CATEGORIES = [
  "Hortifrúti", "Padaria", "Açougue", "Laticínios", "Mercearia",
  "Bebidas", "Congelados", "Limpeza", "Higiene", "Casa", "Outros",
];

const DEFAULT_PAYMENT_METHODS = [
  "Dinheiro", "Pix", "Cartão Benefício iFood", "Débito", "Crédito",
];

const state = {
  view: "plan",            // aba ativa
  plan: [],                // planejamento {id,name,category,qty,estPrice}
  cart: [],                // carrinho     {id,name,category,qty,estPrice,checked,realQty,realPrice}
  supermarket: "",         // estabelecimento atual
  payments: [],            // pagamentos   {id,method,amount}
  purchases: [],           // histórico    {id,date,supermarket,items,payments,total}
  compareQuery: "",
  historyQuery: "",
};

/* --------------------------------------------------------------
 * 2) Funções utilitárias
 * -------------------------------------------------------------- */

/** Id curto e único (apenas [a-z0-9]; seguro para seletores CSS). */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Escapa texto do usuário antes de inserir em HTML. */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Converte entrada numérica (aceita vírgula) em número válido. */
function parseNum(v) {
  const n = parseFloat(String(v).replace(",", ".").trim());
  return isFinite(n) ? n : 0;
}

/** Formata valor como moeda brasileira. */
function fmt(n) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

/** Normaliza texto (sem acentos/maiúsculas/espaços) para comparar. */
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Rótulo curto de mês/ano a partir de "YYYY-MM". */
function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

/** Valor de uma linha: pego usa o real; pendente usa o estimado. */
function itemLine(it) {
  return it.checked
    ? (it.realQty || 0) * (it.realPrice || 0)
    : (it.qty || 0) * (it.estPrice || 0);
}

/* --------------------------------------------------------------
 * 3) Persistência (wrappers sobre db.js)
 * -------------------------------------------------------------- */

function saveCart() {
  return clearStore("cart").then(() => bulkPut("cart", state.cart));
}
function savePlan() {
  return clearStore("plan").then(() => bulkPut("plan", state.plan));
}
function saveMeta() {
  return bulkPut("cartMeta", [
    { key: "supermarket", value: state.supermarket },
    { key: "payments", value: state.payments },
  ]);
}

/* --------------------------------------------------------------
 * 4) Totais do carrinho + validação de pagamento
 * -------------------------------------------------------------- */

function cartTotals() {
  let picked = 0;
  let pending = 0;
  for (const it of state.cart) {
    if (it.checked) picked += itemLine(it);
    else pending += itemLine(it);
  }
  const paid = state.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  return {
    picked,                       // subtotal do que já está no carrinho (R$ reais)
    pending,                      // subtotal estimado dos pendentes
    estTotal: picked + pending,   // estimativa total da lista
    paid,                         // soma lançada nas formas de pagamento
    diff: paid - picked,          // diferença "pago - total"
  };
}

/** Só pode finalizar se houver item pego E pagamentos fechados. */
function canFinalize() {
  if (!state.cart.some((c) => c.checked)) return false;
  return Math.abs(cartTotals().diff) < 0.005;
}

/* --------------------------------------------------------------
 * 5) Índice de preços (comparador) e sugestões rápidas
 * -------------------------------------------------------------- */

/** Indexa o histórico por produto → menor preço e onde foi achado. */
function buildPriceIndex() {
  const map = new Map();
  for (const p of state.purchases) {
    for (const it of p.items) {
      const key = norm(it.name);
      if (!key || !(it.price > 0)) continue;
      const cur = map.get(key) || { count: 0, best: Infinity };
      cur.count++;
      const price = Number(it.price) || 0;
      if (price < cur.best) {
        cur.name = it.name;
        cur.price = price;
        cur.supermarket = p.supermarket || "?";
      }
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => a.price - b.price);
}

/** Itens mais comprados no histórico (chips de sugestão rápida). */
function frequentItems() {
  const map = new Map();
  for (const p of state.purchases) {
    for (const it of p.items) {
      const k = norm(it.name);
      if (!k) continue;
      const cur = map.get(k) || { name: it.name, category: it.category, count: 0 };
      cur.count++;
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Atualiza o <datalist> de autocompletar com itens frequentes. */
function refreshSuggestions() {
  const dl = document.getElementById("suggestNames");
  if (dl) dl.innerHTML = frequentItems().map((f) => `<option value="${esc(f.name)}">`).join("");
}

/* --------------------------------------------------------------
 * 6) Agregações do dashboard
 * -------------------------------------------------------------- */

function aggregateDashboard() {
  const category = {};
  const payment = {};
  const months = new Map();
  let total = 0;

  for (const p of state.purchases) {
    total += Number(p.total) || 0;
    for (const it of p.items) {
      const cat = it.category || "Outros";
      category[cat] = (category[cat] || 0) + (it.qty || 0) * (it.price || 0);
    }
    for (const pm of p.payments || []) {
      const m = pm.method || "Outros";
      payment[m] = (payment[m] || 0) + (Number(pm.amount) || 0);
    }
    const mk = (p.date || "").slice(0, 7);
    if (mk) months.set(mk, (months.get(mk) || 0) + (Number(p.total) || 0));
  }

  // Evolução mensal (ordenada cronologicamente)
  const trend = [...months.keys()].sort().map((k) => ({ label: monthLabel(k), total: months.get(k) }));

  // Supermercado mais frequentado (moda)
  const freq = {};
  let topSupermarket = "—";
  let topN = 0;
  for (const p of state.purchases) {
    const k = p.supermarket || "?";
    freq[k] = (freq[k] || 0) + 1;
    if (freq[k] > topN) { topN = freq[k]; topSupermarket = k; }
  }

  // Forma de pagamento principal (maior valor pago acumulado)
  const topPayment = Object.keys(payment).sort((a, b) => payment[b] - payment[a])[0] || "—";

  return {
    total,
    avg: state.purchases.length ? total / state.purchases.length : 0,
    topSupermarket,
    topPayment,
    category,
    payment,
    trend,
  };
}

/* --------------------------------------------------------------
 * 7) Navegação entre views
 * -------------------------------------------------------------- */

function switchView(name) {
  state.view = name;
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + name));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  const renders = {
    plan: renderPlan,
    cart: renderCart,
    compare: renderCompare,
    history: renderHistory,
    dashboard: renderDashboard,
    backup: renderBackup,
  };
  (renders[name] || renderPlan)();
  window.scrollTo(0, 0);
}

/* --------------------------------------------------------------
 * 8) Ações de negócio
 * -------------------------------------------------------------- */

function addPlanItem() {
  const name = (document.getElementById("planName")?.value || "").trim();
  if (!name) return toast("Informe o nome do produto.", true);
  const cat = document.getElementById("planCat")?.value || "Outros";
  const qty = parseNum(document.getElementById("planQty")?.value) || 1;
  const price = parseNum(document.getElementById("planPrice")?.value);
  state.plan.push({ id: uid(), name, category: cat, qty, estPrice: price });
  savePlan();
  document.getElementById("planName").value = "";
  document.getElementById("planPrice").value = "";
  refreshSuggestions();
  renderPlan();
}

async function startPurchase() {
  if (!state.plan.length) return;
  const replace = state.cart.length > 0;
  const msg = replace
    ? `Já existe uma compra em andamento (${state.cart.length} itens).\nDeseja substituí-la pelos itens planejados?`
    : `Iniciar compra com ${state.plan.length} produtos?\nA lista de planejamento será esvaziada após a transferência.`;
  if (!(await showConfirm(msg, "Iniciar"))) return;

  // Transfere itens planejados -> carrinho (sem marcar como pego)
  state.cart = state.plan.map((p) => ({
    id: uid(), name: p.name, category: p.category,
    qty: p.qty, estPrice: p.estPrice || 0,
    checked: false, realQty: p.qty, realPrice: p.estPrice || 0,
  }));
  state.plan = [];
  state.payments = [];
  await Promise.all([saveCart(), clearStore("plan"), saveMeta()]);
  toast(`Compra iniciada com ${state.cart.length} itens!`);
  switchView("cart");
}

function addCartItem() {
  const name = (document.getElementById("cartName")?.value || "").trim();
  if (!name) return toast("Informe o nome do produto.", true);
  const cat = document.getElementById("cartCat")?.value || "Outros";
  const qty = parseNum(document.getElementById("cartQty")?.value) || 1;
  state.cart.push({ id: uid(), name, category: cat, qty, estPrice: 0, checked: false, realQty: qty, realPrice: 0 });
  saveCart();
  document.getElementById("cartName").value = "";
  refreshSuggestions();
  renderCart();
}

function pickAll() {
  state.cart.forEach((it) => {
    if (!it.checked) {
      it.checked = true;
      it.realQty = it.qty;
      it.realPrice = it.estPrice || 0;
    }
  });
  saveCart();
  renderCart();
  toast("Todos marcados como pegos");
}

async function finalizePurchase() {
  const t = cartTotals();
  const picked = state.cart.filter((c) => c.checked);
  if (!picked.length || Math.abs(t.diff) >= 0.005) return;

  const payTxt = state.payments.length
    ? state.payments.map((p) => "  • " + p.method + ": " + fmt(p.amount)).join("\n")
    : "  • nenhum pagamento lançado";
  const pending = state.cart.length - picked.length;
  const msg =
    `Finalizar compra em "${state.supermarket || "mercado não identificado"}"?\n` +
    `Itens: ${picked.length}\n` +
    `Total: ${fmt(t.picked)}\n\n` +
    `Pagamentos:\n${payTxt}\n\n` +
    (pending ? `${pending} item(ns) pendentes serão descartados.` : "Toda a lista foi pega.");

  if (!(await showConfirm(msg, "Finalizar"))) return;

  // Snapshot da compra -> histórico
  const purchase = {
    id: uid(),
    date: new Date().toISOString(),
    supermarket: state.supermarket.trim() || "Sem identificação",
    items: picked.map((it) => ({
      name: it.name,
      category: it.category,
      qty: it.realQty || it.qty,
      price: it.realPrice || 0,
    })),
    payments: state.payments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 })),
    total: Math.round(t.picked * 100) / 100,
  };

  state.purchases.push(purchase);
  state.cart = [];
  state.payments = [];
  await Promise.all([
    put("purchases", purchase),
    saveCart(),
    saveMeta(),
  ]).then(refreshSuggestions);
  toast("Compra finalizada e salva no histórico!");
  switchView("history");
}

async function reusePurchase(id) {
  const p = state.purchases.find((x) => x.id === id);
  if (!p) return;
  if (!(await showConfirm(`Reaproveitar ${p.items.length} itens de "${p.supermarket}"\nno Planejamento?`, "Reaproveitar"))) return;
  p.items.forEach((it) => {
    state.plan.push({
      id: uid(), name: it.name, category: it.category || "Outros",
      qty: it.qty || 1, estPrice: it.price || 0,
    });
  });
  await bulkPut("plan", state.plan);
  refreshSuggestions();
  switchView("plan");
  toast(`${p.items.length} itens adicionados ao planejamento.`);
}

async function deletePurchase(id) {
  if (!(await showConfirm("Excluir esta compra do histórico?\nEsta ação não pode ser desfeita.", "Excluir"))) return;
  state.purchases = state.purchases.filter((p) => p.id !== id);
  await remove("purchases", id);
  switchView("history");
  toast("Compra removida do histórico.");
}

/* --------------------------------------------------------------
 * 9) Backup (exportar / importar / apagar tudo)
 * -------------------------------------------------------------- */

function exportBackup() {
  const payload = {
    app: "compras-inteligentes",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      plan: state.plan,
      cart: state.cart,
      cartMeta: [
        { key: "supermarket", value: state.supermarket },
        { key: "payments", value: state.payments },
      ],
      purchases: state.purchases,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compras-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast("Backup exportado!");
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !parsed.data || !Array.isArray(parsed.data.purchases)) {
        return toast("Arquivo inválido: não é um backup desta aplicação.", true);
      }
      if (!(await showConfirm(
        "Importar este backup?\nTODOS os dados atuais serão substituídos pelos dados do arquivo.",
        "Importar"
      ))) return;

      const d = parsed.data;
      // Limpa todas as stores e recarrega com os dados importados
      await Promise.all([
        clearStore("plan"), clearStore("cart"), clearStore("cartMeta"), clearStore("purchases"),
      ]);
      await Promise.all([
        bulkPut("plan", Array.isArray(d.plan) ? d.plan : []),
        bulkPut("cart", Array.isArray(d.cart) ? d.cart : []),
        bulkPut("purchases", d.purchases),
      ]);
      const meta = {};
      (d.cartMeta || []).forEach((m) => { meta[m.key] = m.value; });

      state.plan = Array.isArray(d.plan) ? d.plan : [];
      state.cart = Array.isArray(d.cart) ? d.cart : [];
      state.purchases = d.purchases;
      state.supermarket = meta.supermarket || "";
      state.payments = Array.isArray(meta.payments) ? meta.payments : [];
      await saveMeta();
      refreshSuggestions();
      switchView(state.view);
      toast("Backup importado com sucesso!");
    } catch (err) {
      toast("Falha ao ler o arquivo JSON: " + err.message, true);
    }
  };
  reader.readAsText(file);
}

async function clearAllData() {
  if (!(await showConfirm(
    "Apagar TODOS os dados?\nPlanejamento, carrinho, histórico e dashboard serão perdidos para sempre.",
    "Apagar tudo"
  ))) return;
  await Promise.all([
    clearStore("plan"), clearStore("cart"), clearStore("cartMeta"), clearStore("purchases"),
  ]);
  state.plan = [];
  state.cart = [];
  state.payments = [];
  state.purchases = [];
  state.supermarket = "";
  refreshSuggestions();
  switchView("plan");
  toast("Todos os dados foram apagados.");
}

/* --------------------------------------------------------------
 * 10) UI: toast + modal de confirmação
 * -------------------------------------------------------------- */

let _toastTimer = null;
function toast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.toggle("error", !!isError);
  t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/** Modal de confirmação baseado em Promise (resolve true/false). */
function showConfirm(message, okLabel) {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal");
    const msgEl = document.getElementById("modalMessage");
    const okBtn = document.getElementById("modalOk");
    const cancelBtn = document.getElementById("modalCancel");
    msgEl.textContent = message;
    okBtn.textContent = okLabel || "Confirmar";
    modal.hidden = false;
    okBtn.onclick = () => { close(); resolve(true); };
    cancelBtn.onclick = () => { close(); resolve(false); };
    function close() {
      modal.hidden = true;
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    }
  });
}

/* --------------------------------------------------------------
 * 11) Handlers de evento (delegação no document)
 * -------------------------------------------------------------- */

function bindEvents() {

  // ----- Navegação inferior -----
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => switchView(b.dataset.view))
  );

  // ----- Cliques (data-action) -----
  document.addEventListener("click", (e) => {
    if (e.target.closest("input") || e.target.closest("select")) return; // campos tratados à parte
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    switch (action) {
      case "go-plan": switchView("plan"); break;
      case "go-history": switchView("history"); break;

      case "add-plan": addPlanItem(); break;
      case "del-plan":
        state.plan = state.plan.filter((i) => i.id !== id);
        savePlan(); renderPlan();
        break;
      case "quick-add":
        state.plan.push({ id: uid(), name: btn.dataset.name, category: btn.dataset.cat || "Outros", qty: 1, estPrice: 0 });
        savePlan(); refreshSuggestions(); renderPlan();
        toast(`"${btn.dataset.name}" adicionado`);
        break;

      case "start-purchase": startPurchase(); break;
      case "add-cart": addCartItem(); break;
      case "del-item":
        state.cart = state.cart.filter((i) => i.id !== id);
        saveCart(); renderCart();
        break;
      case "pick-all": pickAll(); break;
      case "clear-cart":
        showConfirm("Limpar carrinho?\nItens e pagamentos atuais serão removidos.", "Limpar")
          .then((ok) => {
            if (!ok) return;
            state.cart = [];
            state.payments = [];
            saveCart(); saveMeta(); renderCart();
          });
        break;
      case "finalize": finalizePurchase(); break;

      case "add-payment": {
        const sel = document.getElementById("payMethodSelect");
        const amt = document.getElementById("payAmount");
        state.payments.push({ id: uid(), method: sel ? sel.value : "Pix", amount: parseNum(amt ? amt.value : 0) });
        saveMeta();
        if (amt) amt.value = "";
        rerenderPayArea();
        break;
      }
      case "del-payment":
        state.payments = state.payments.filter((p) => p.id !== id);
        saveMeta();
        rerenderPayArea();
        break;

      case "toggle-purchase": {
        const head = btn.closest(".purchase-card");
        const body = head && head.querySelector(".purchase-body");
        if (body) body.classList.toggle("hidden");
        break;
      }
      case "reuse": reusePurchase(id); break;
      case "del-purchase": deletePurchase(id); break;

      case "export-backup": exportBackup(); break;
      case "request-persist":
        navigator.storage && navigator.storage.persist
          ? navigator.storage.persist().then(() => renderBackup())
          : toast("API de persistência não suportada.", true);
        break;
      case "clear-all": clearAllData(); break;
    }
  });

  // ----- Inputs / change (data-edit) -----
  document.addEventListener("input", (e) => {
    const el = e.target;
    const field = el.dataset.field;
    const kind = el.dataset.edit;

    // Filtro de busca (comparar/histórico): re-renderiza só a lista interna
    if (kind === "filter" && el.dataset.key) {
      state[el.dataset.key] = el.value;
      if (el.dataset.key === "compareQuery") renderCompareList();
      else renderHistoryList();
      return;
    }

    // Nome do supermercado
    if (el.id === "supermarketInput") {
      state.supermarket = el.value;
      saveMeta();
      return;
    }

    // Edição inline em itens do planejamento
    if (kind === "plan" && field) {
      const it = state.plan.find((i) => i.id === el.dataset.id);
      if (!it) return;
      it[field] = Math.max(0, parseNum(el.value));
      updateAllLineTotals();
      savePlan();
      return;
    }

    // Edição inline em itens do carrinho
    if (kind === "cart" && field) {
      const it = state.cart.find((i) => i.id === el.dataset.id);
      if (!it) return;
      it[field] = Math.max(0, parseNum(el.value));
      updateAllLineTotals();
      updateTotalsUI();
      saveCart();
      return;
    }

    // Edição inline em pagamentos
    if (kind === "pay" && field) {
      const p = state.payments.find((x) => x.id === el.dataset.id);
      if (!p) return;
      if (field === "method") p.method = el.value;
      else p.amount = Math.max(0, parseNum(el.value));
      updateTotalsUI();
      saveMeta();
      return;
    }
  });

  // Checkbox pego/não pego (evento change garante o novo estado)
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.edit !== "toggle") return;
    const it = state.cart.find((i) => i.id === el.dataset.id);
    if (!it) return;
    it.checked = el.checked;
    if (it.checked) {
      // Ao pegar o item, abre os campos do preço/quantidade REAL
      it.realQty = it.qty;
      it.realPrice = it.estPrice || 0;
    }
    saveCart();
    renderCart();
  });

  // Mudança de forma de pagamento em select (quando re-render).
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.edit === "pay" && el.dataset.field === "method") {
      const p = state.payments.find((x) => x.id === el.dataset.id);
      if (p) { p.method = el.value; saveMeta(); }
    }
  });

  // Filtro de histórico via change (teclado virtual) — cobertura extra
  document.addEventListener("keyup", (e) => {
    const el = e.target;
    if (el.dataset.edit === "filter" && el.dataset.key) {
      state[el.dataset.key] = el.value;
      if (el.dataset.key === "compareQuery") renderCompareList();
      else renderHistoryList();
    }
  });

  // Importar arquivo de backup
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.action === "import-file" && el.files && el.files[0]) {
      importBackup(el.files[0]);
      el.value = ""; // permite reimportar o mesmo arquivo
    }
  });
}

/* --------------------------------------------------------------
 * 12) Boot da aplicação
 * -------------------------------------------------------------- */

async function loadAll() {
  state.plan = await getAll("plan");
  state.cart = await getAll("cart");
  state.purchases = await getAll("purchases");
  const metaArr = await getAll("cartMeta");
  const meta = {};
  (metaArr || []).forEach((m) => { meta[m.key] = m.value; });
  state.supermarket = meta.supermarket || "";
  state.payments = Array.isArray(meta.payments) ? meta.payments : [];
}

/** PWA: registra o Service Worker para funcionar 100% offline. */
function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registro falhou:", err));
    });
  }
}

/** PWA: tenta tornar o armazenamento persistente (evita limpeza automática). */
function requestPersist() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

/** Badge de online/offline no cabeçalho. */
function setupNetworkBadge() {
  const badge = document.getElementById("netBadge");
  const setNet = (online) => {
    badge.textContent = online ? "online" : "offline";
    badge.className = "badge " + (online ? "badge-online" : "badge-offline");
  };
  setNet(navigator.onLine !== false);
  window.addEventListener("online", () => setNet(true));
  window.addEventListener("offline", () => setNet(false));
}

async function init() {
  try {
    await ready(); // abre o IndexedDB
    await loadAll();
    refreshSuggestions();
    bindEvents();
    setupNetworkBadge();
    switchView("plan");
    registerSW();
    requestPersist();
  } catch (err) {
    console.error("Falha na inicialização:", err);
    toast("Erro ao carregar o aplicativo: " + err.message, true);
  }
}

document.addEventListener("DOMContentLoaded", init);