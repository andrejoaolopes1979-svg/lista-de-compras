/* ============================================================
 * views.js — Renderizadores das 6 vistas da SPA
 * ------------------------------------------------------------
 * Cada função reconstroi o conteúdo de uma <section id="view-*">.
 * Funções usam o estado global (state) e helpers definidos em
 * app.js, chamados apenas em tempo de execução (mesmo documento).
 *
 * Observações de UX:
 *  - Inputs de valores usam atributos data-edit/data-id para que o
 *    handler de app.js faça atualização pontual (sem perder o foco).
 *  - Buscas (comparar/histórico) re-renderizam SOMENTE a lista
 *    interna (#compareList / #historyList), preservando o campo.
 * ============================================================ */

"use strict";

/* ---------------- 1. PLANEJAMENTO ---------------- */

function renderPlan() {
  const v = document.getElementById("view-plan");
  const chips = frequentItems()
    .filter((f) => !state.plan.some((p) => norm(p.name) === norm(f.name)))
    .slice(0, 6);

  v.innerHTML = `
    <h2 class="view-title">Planejamento</h2>
    <p class="view-subtitle">Monte a lista antes de sair de casa.</p>

    <div class="card">
      <button class="btn btn-primary" data-action="start-purchase" ${state.plan.length ? "" : "disabled"}>
        Iniciar Compra <span class="muted">(${state.plan.length} ${state.plan.length === 1 ? "item" : "itens"})</span>
      </button>
      <p class="muted text-center mt">Os itens serão transferidos para <b>Em Compras</b>.</p>
    </div>

    <div class="card">
      <div class="card-title">Adicionar produto</div>
      <div class="field">
        <label for="planName">Nome do produto</label>
        <input id="planName" list="suggestNames" placeholder="Ex: Arroz 5kg" autocomplete="off">
      </div>
      <div class="form-row">
        <div class="field">
          <label for="planCat">Categoria</label>
          <select id="planCat">${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label for="planQty">Qtd estimada</label>
          <input id="planQty" type="number" min="1" step="1" value="1">
        </div>
      </div>
      <div class="field">
        <label for="planPrice">Preço estimado (opcional)</label>
        <input id="planPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="R$ 0,00">
      </div>
      <button class="btn btn-ghost btn-block" data-action="add-plan">Adicionar à lista</button>
    </div>

    ${chips.length ? `
      <div class="card">
        <div class="card-title">Sugestões rápidas</div>
        <div class="chips">
          ${chips.map((c) => `<button class="chip" data-action="quick-add" data-name="${esc(c.name)}" data-cat="${esc(c.category || "Outros")}">${esc(c.name)}</button>`).join("")}
        </div>
      </div>` : ""}

    <div class="card">
      <div class="card-title">Lista planejada (${state.plan.length})</div>
      ${state.plan.length
        ? `<div class="list">${state.plan.map(planRow).join("")}</div>`
        : '<div class="empty-state">Nenhum item planejado ainda.</div>'}
    </div>
  `;
  updateAllLineTotals();
}

function planRow(it) {
  return `
    <div class="item">
      <div class="item-body">
        <div class="item-name">${esc(it.name)}</div>
        <div class="item-meta">${esc(it.category)}</div>
        <div class="item-fields">
          <span>Qtd</span>
          <input type="number" min="1" step="1" value="${it.qty}" data-edit="plan" data-id="${it.id}" data-field="qty">
          <span>Est.</span>
          <input type="number" min="0" step="0.01" inputmode="decimal" value="${it.estPrice || ""}" data-edit="plan" data-id="${it.id}" data-field="estPrice" placeholder="0,00">
        </div>
      </div>
      <div class="item-right">
        <div class="line-total est" data-total-for="${it.id}"></div>
        <button class="icon-btn" data-action="del-plan" data-id="${it.id}" aria-label="Remover">&times;</button>
      </div>
    </div>`;
}

/* ---------------- 2. EM COMPRAS ---------------- */

function renderCart() {
  const v = document.getElementById("view-cart");
  const picked = state.cart.filter((c) => c.checked);
  const pending = state.cart.filter((c) => !c.checked);

  v.innerHTML = `
    <h2 class="view-title">Em Compras</h2>
    <p class="view-subtitle">Checklist direto no mercado.</p>

    <div class="card">
      <div class="card-title">Estabelecimento</div>
      <input type="text" id="supermarketInput" value="${esc(state.supermarket)}" placeholder="Nome do supermercado (ex: Assaí)">
    </div>

    <div class="card">
      <div class="card-title">Adicionar item de última hora</div>
      <div class="field">
        <label for="cartName">Nome do produto</label>
        <input id="cartName" list="suggestNames" placeholder="Ex: Salgadinho" autocomplete="off">
      </div>
      <div class="form-row">
        <div class="field">
          <label for="cartCat">Categoria</label>
          <select id="cartCat">${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label for="cartQty">Qtd</label>
          <input id="cartQty" type="number" min="1" step="1" value="1">
        </div>
      </div>
      <button class="btn btn-ghost btn-block" data-action="add-cart">Adicionar ao carrinho</button>
    </div>

    <div class="totals-grid" id="cartTotalsBox">
      ${renderTotalsCards()}
    </div>

    ${!state.cart.length ? `
      <div class="card text-center">
        <div class="muted mb">Carrinho vazio.</div>
        ${state.plan.length
          ? `<button class="btn btn-primary" data-action="start-purchase">Iniciar a partir do planejamento (${state.plan.length})</button>`
          : `<button class="btn btn-ghost" data-action="go-plan">Ir para o Planejamento</button>`}
      </div>` : `
      <div class="card">
        <div class="flex-between">
          <div class="card-title">No carrinho (${picked.length})</div>
          <button class="btn btn-sm btn-ghost" data-action="pick-all">Pegar todos</button>
        </div>
        ${picked.length
          ? `<div class="list">${picked.map(cartRow).join("")}</div>`
          : '<div class="empty-state">Nenhum item pego ainda.</div>'}

        <div class="card-title mt">Pendentes (${pending.length})</div>
        ${pending.length
          ? `<div class="list">${pending.map(cartRow).join("")}</div>`
          : '<div class="empty-state">Tudo pego! Pode ir ao caixa.</div>'}
      </div>

      <div class="card">
        <div class="card-title">Pagamentos</div>
        <div id="payList">${renderPayList()}</div>
        <div class="pay-row">
          <select id="payMethodSelect">${DEFAULT_PAYMENT_METHODS.map((m) => `<option>${esc(m)}</option>`).join("")}</select>
          <input type="number" id="payAmount" min="0" step="0.01" inputmode="decimal" placeholder="R$ 0,00">
          <button class="btn btn-sm btn-ghost" data-action="add-payment">+</button>
        </div>
        <div id="paySummary">${renderPaySummary()}</div>
      </div>

      <button class="btn btn-primary" data-action="finalize" ${canFinalize() ? "" : "disabled"}>Finalizar e salvar compra</button>
      <button class="btn btn-ghost btn-block mt" data-action="clear-cart">Limpar carrinho</button>
    `}
  `;
  updateAllLineTotals();
}

function cartRow(it) {
  return `
    <div class="item ${it.checked ? "picked" : ""}">
      <label class="item-check">
        <input type="checkbox" ${it.checked ? "checked" : ""} data-edit="toggle" data-id="${it.id}">
      </label>
      <div class="item-body">
        <div class="item-name">${esc(it.name)}</div>
        <div class="item-meta">${esc(it.category)}</div>
        ${it.checked ? `
          <div class="item-fields">
            <span>Qtd real</span>
            <input type="number" min="0" step="1" value="${it.realQty ?? ""}" data-edit="cart" data-id="${it.id}" data-field="realQty">
            <span>Preço real</span>
            <input type="number" min="0" step="0.01" inputmode="decimal" value="${it.realPrice || ""}" data-edit="cart" data-id="${it.id}" data-field="realPrice" placeholder="0,00">
          </div>` : `
          <div class="item-fields">
            <span>Qtd</span>
            <input type="number" min="1" step="1" value="${it.qty}" data-edit="cart" data-id="${it.id}" data-field="qty">
            <span>Est.</span>
            <input type="number" min="0" step="0.01" inputmode="decimal" value="${it.estPrice || ""}" data-edit="cart" data-id="${it.id}" data-field="estPrice" placeholder="0,00">
          </div>`}
      </div>
      <div class="item-right">
        <div class="line-total ${it.checked ? "" : "est"}" data-total-for="${it.id}"></div>
        <button class="icon-btn" data-action="del-item" data-id="${it.id}" aria-label="Remover">&times;</button>
      </div>
    </div>`;
}

function renderTotalsCards() {
  const t = cartTotals();
  return `
    <div class="total-card green full">
      <div class="label">Subtotal no carrinho</div>
      <div class="value">${fmt(t.picked)}</div>
    </div>
    <div class="total-card">
      <div class="label">Pendente (estimado)</div>
      <div class="value">${fmt(t.pending)}</div>
    </div>
    <div class="total-card">
      <div class="label">Estimativa total</div>
      <div class="value">${fmt(t.estTotal)}</div>
    </div>
    <div class="total-card">
      <div class="label">Pago até agora</div>
      <div class="value">${fmt(t.paid)}</div>
    </div>`;
}

function renderPayList() {
  if (!state.payments.length) return '<div class="empty-state">Nenhum pagamento lançado.</div>';
  return state.payments
    .map((p) => `
      <div class="pay-row">
        <select data-edit="pay" data-id="${p.id}" data-field="method">
          ${DEFAULT_PAYMENT_METHODS.map((m) => `<option ${m === p.method ? "selected" : ""}>${esc(m)}</option>`).join("")}
        </select>
        <input type="number" min="0" step="0.01" inputmode="decimal" value="${p.amount || ""}" data-edit="pay" data-id="${p.id}" data-field="amount" placeholder="0,00">
        <button class="icon-btn" data-action="del-payment" data-id="${p.id}" aria-label="Remover">&times;</button>
      </div>`)
    .join("");
}

function renderPaySummary() {
  const t = cartTotals();
  if (Math.abs(t.diff) < 0.005) {
    return `<div class="pay-status ok">Pagamento fechado (${fmt(t.paid)}) — pode finalizar</div>`;
  }
  return t.diff > 0
    ? `<div class="pay-status over">Pagamento excede o total em ${fmt(t.diff)}</div>`
    : `<div class="pay-status wait">Faltam ${fmt(-t.diff)} para fechar</div>`;
}

/* ---------------- 3. COMPARAR PREÇOS ---------------- */

function renderCompare() {
  const v = document.getElementById("view-compare");
  v.innerHTML = `
    <h2 class="view-title">Comparar Preços</h2>
    <p class="view-subtitle">Onde cada produto compensa mais (menor preço já registrado).</p>

    <div class="card">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <input type="search" placeholder="Buscar produto ou local..." data-edit="filter" data-key="compareQuery" value="${esc(state.compareQuery)}">
      </div>
    </div>
    <div id="compareList"></div>
    <p class="muted text-center">Ranking baseado em <b>${state.purchases.length}</b> compra(s) registrada(s).</p>
  `;
  renderCompareList();
}

function renderCompareList() {
  const cont = document.getElementById("compareList");
  if (!cont) return;
  const q = norm(state.compareQuery);
  const rows = buildPriceIndex().filter((r) => {
    if (!q) return true;
    return norm(r.name).includes(q) || norm(r.supermarket).includes(q);
  });

  cont.innerHTML = rows.length
    ? `<div class="list">${rows
        .map((r, i) => `
          <div class="item">
            <div class="rank">${i + 1}</div>
            <div class="item-body">
              <div class="item-name">${esc(r.name)}</div>
              <div class="item-meta">${esc(r.supermarket)} &middot; ${r.count} registro(s)</div>
            </div>
            <div class="line-total">${fmt(r.price)}</div>
          </div>`)
        .join("")}</div>`
    : '<div class="card empty-state">Nenhum resultado. Os preços só aparecem após compras salvas no histórico.</div>';
}

/* ---------------- 4. HISTÓRICO ---------------- */

function renderHistory() {
  const v = document.getElementById("view-history");
  v.innerHTML = `
    <h2 class="view-title">Histórico</h2>
    <p class="view-subtitle">Compras passadas, detalhes e reaproveitamento.</p>

    <div class="card">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <input type="search" placeholder="Buscar local ou produto..." data-edit="filter" data-key="historyQuery" value="${esc(state.historyQuery)}">
      </div>
    </div>
    <div id="historyList"></div>
  `;
  renderHistoryList();
}

function renderHistoryList() {
  const cont = document.getElementById("historyList");
  if (!cont) return;
  const q = norm(state.historyQuery);
  const list = [...state.purchases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((p) => {
      if (!q) return true;
      if (norm(p.supermarket).includes(q)) return true;
      return p.items.some((i) => norm(i.name).includes(q));
    });

  if (!state.purchases.length) {
    cont.innerHTML =
      '<div class="card empty-state">Nenhuma compra finalizada ainda.<br>Complete seu primeiro checklist para começar o histórico.</div>';
    return;
  }
  if (!list.length) {
    cont.innerHTML = '<div class="card empty-state">Nenhuma compra encontrada para sua busca.</div>';
    return;
  }

  cont.innerHTML = list.map(historyCard).join("");
}

function historyCard(p) {
  const d = new Date(p.date);
  const dateTxt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return `
    <div class="card purchase-card" data-id="${p.id}">
      <div class="purchase-head" data-action="toggle-purchase" data-id="${p.id}">
        <div>
          <div class="purchase-place">${esc(p.supermarket)}</div>
          <div class="purchase-meta">${dateTxt} &middot; ${p.items.length} itens</div>
        </div>
        <div class="purchase-total">${fmt(p.total)}</div>
        <button class="icon-btn" data-action="del-purchase" data-id="${p.id}" aria-label="Excluir">&times;</button>
      </div>

      <div class="purchase-body hidden">
        <div class="sub-title">Itens comprados</div>
        <div class="list">
          ${p.items.map((it) => `
            <div class="item">
              <div class="item-body">
                <div class="item-name">${esc(it.name)}</div>
                <div class="item-meta">${esc(it.category || "Outros")} &middot; Qtd: ${it.qty}</div>
              </div>
              <div class="line-total">${fmt((it.qty || 0) * (it.price || 0))}</div>
            </div>`).join("")}
        </div>

        <div class="sub-title">Formas de pagamento</div>
        ${(p.payments || []).map((pm) => `
          <div class="pay-break"><span>${esc(pm.method)}</span><b>${fmt(pm.amount)}</b></div>`).join("") ||
          '<div class="muted">Nenhum pagamento informado.</div>'}

        <div class="flex-between mt">
          <button class="btn btn-sm btn-ghost" data-action="reuse" data-id="${p.id}">Reutilizar no planejamento</button>
        </div>
      </div>
    </div>`;
}

/* ---------------- 5. DASHBOARD ---------------- */

function renderDashboard() {
  const v = document.getElementById("view-dashboard");
  if (!state.purchases.length) {
    v.innerHTML = `
      <h2 class="view-title">Dashboard</h2>
      <p class="view-subtitle">Análise dos seus gastos.</p>
      <div class="card empty-state">Nenhuma compra finalizada ainda.<br><br>
        <button class="btn btn-ghost btn-sm" data-action="go-plan">Começar pelo Planejamento</button>
      </div>`;
    return;
  }

  const agg = aggregateDashboard();

  v.innerHTML = `
    <h2 class="view-title">Dashboard</h2>
    <p class="view-subtitle">Análise de todas as compras registradas.</p>

    <div class="kpi-grid">
      ${kpiCard("Total acumulado", fmt(agg.total))}
      ${kpiCard("Média por compra", fmt(agg.avg))}
      ${kpiCard("Supermercado top", agg.topSupermarket)}
      ${kpiCard("Forma de pagamento", agg.topPayment)}
    </div>

    <div class="card">
      <div class="card-title">Gastos por categoria</div>
      <div class="chart-wrap"><canvas id="chartCategory"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">Gastos por forma de pagamento</div>
      <div class="chart-wrap"><canvas id="chartPayment"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">Evolução mensal de gastos</div>
      <div class="chart-wrap"><canvas id="chartTrend"></canvas></div>
    </div>
  `;

  if (window.Chart) {
    drawDashboard(agg);
  } else {
    toast("Gráficos indisponíveis nesta primeira visita offline.", true);
  }
}

function kpiCard(label, value) {
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${esc(value)}</div></div>`;
}

/* ---------------- 6. BACKUP ---------------- */

async function renderBackup() {
  const v = document.getElementById("view-backup");
  let persisted = false;
  try {
    if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted();
  } catch (e) { /* ignore */ }

  v.innerHTML = `
    <h2 class="view-title">Backup</h2>
    <p class="view-subtitle">Proteja e transporte seus dados.</p>

    <div class="card persist-card ${persisted ? "saved" : "unsaved"}">
      <div class="card-title">Proteção de armazenamento</div>
      <div class="status">${persisted
        ? "Dados protegidos: o navegador não os removerá automaticamente (navigator.storage.persist)."
        : "Armazenamento ainda não é persistente. O navegador pode limpar os dados em situações de falta de espaço."}</div>
      ${persisted
        ? ""
        : `<button class="btn btn-ghost btn-block" data-action="request-persist">Solicitar persistência</button>`}
      <p class="muted mt">Banco IndexedDB: plan ${state.plan.length}, compra atual ${state.cart.length}, histórico ${state.purchases.length}.</p>
    </div>

    <div class="card">
      <div class="card-title">Exportar backup</div>
      <p class="muted">Baixa um arquivo <b>.json</b> com todos os dados (planejamento, carrinho e histórico) no armazenamento do seu celular.</p>
      <button class="btn btn-primary mt" data-action="export-backup">Exportar .json</button>
    </div>

    <div class="card">
      <div class="card-title">Importar backup</div>
      <p class="muted">Restaura TUDO a partir de um arquivo <b>.json</b> exportado anteriormente (substitui os dados atuais).</p>
      <label class="btn btn-ghost btn-block mt">
        Escolher arquivo .json...
        <input type="file" id="importFile" class="file-input" accept="application/json,.json" data-action="import-file">
      </label>
    </div>

    <div class="divider"></div>

    <button class="btn btn-danger btn-block" data-action="clear-all">Apagar todos os dados</button>
  `;
}

/* ============================================================
 * Helpers de renderização compartilhados (usados em app.js)
 * ============================================================ */

/** Atualiza somente os cards de totais + status do pagamento (preserva foco). */
function updateTotalsUI() {
  const box = document.getElementById("cartTotalsBox");
  if (box) box.innerHTML = renderTotalsCards();
  const ps = document.getElementById("paySummary");
  if (ps) ps.innerHTML = renderPaySummary();
  const fb = document.querySelector('#view-cart [data-action="finalize"]');
  if (fb) fb.disabled = !canFinalize();
}

/** Atualiza os totais de cada linha (rótulo específico de cada item). */
function updateAllLineTotals() {
  const all = [...state.cart, ...state.plan];
  all.forEach((it) => {
    const el = document.querySelector(`[data-total-for="${it.id}"]`);
    if (el) el.textContent = fmt(itemLine(it));
  });
}

/** Re-renderiza apenas a área de pagamentos + totais (sem tocar no restante). */
function rerenderPayArea() {
  const list = document.getElementById("payList");
  if (list) list.innerHTML = renderPayList();
  updateTotalsUI();
}