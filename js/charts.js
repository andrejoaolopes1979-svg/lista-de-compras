/* ============================================================
 * charts.js — Dashboard com Chart.js (carregado via CDN)
 * ------------------------------------------------------------
 * Recebe os totais agregados calculados em app.js e desenha
 * os três gráficos. Qualquer gráfico anterior é destruído antes
 * de desenhar de novo (evita vazamento de memória/re-render).
 * ============================================================ */

"use strict";

const chartInstances = [];

/** Destrói todos os gráficos criados (necessário antes de re-render). */
function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances.length = 0;
}

/**
 * Desenha o dashboard completo.
 * @param {Object} totals
 *   totals.category -> { nomeCategoria: somaEmReais }
 *   totals.payment  -> { nomeForma: somaEmReais }
 *   totals.trend    -> [{ label: "2026-09", total: Number }] (ordenado)
 */
function drawDashboard(totals) {
  destroyCharts();

  // ---- Paleta do tema dark (verde + tons complementares) ----
  const palette = [
    "#22c55e", "#3b82f6", "#eab308", "#f97316",
    "#a855f7", "#ec4899", "#14b8a6", "#f43f5e",
    "#84cc16", "#6366f1",
  ];

  const style = getComputedStyle(document.documentElement);
  const textColor = style.getPropertyValue("--muted").trim() || "#94a3b8";
  const gridColor = "rgba(148,163,184,0.12)";

  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = "rgba(148,163,184,0.15)";
  Chart.defaults.font.family =
    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  // ---- GRÁFICO 1: Gastos por Categoria (Rosca / Doughnut) ----
  const catKeys = Object.keys(totals.category || {});
  if (catKeys.length && document.getElementById("chartCategory")) {
    const ctx = document.getElementById("chartCategory");
    chartInstances.push(
      new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: catKeys,
          datasets: [
            {
              data: catKeys.map((k) => totals.category[k]),
              backgroundColor: palette,
              borderWidth: 0,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, padding: 14 } },
          },
        },
      })
    );
  }

  // ---- GRÁFICO 2: Gastos por Forma de Pagamento (Pizza / Pie) ----
  const payKeys = Object.keys(totals.payment || {});
  if (payKeys.length && document.getElementById("chartPayment")) {
    const ctx = document.getElementById("chartPayment");
    chartInstances.push(
      new Chart(ctx, {
        type: "pie",
        data: {
          labels: payKeys,
          datasets: [
            {
              data: payKeys.map((k) => totals.payment[k]),
              backgroundColor: palette,
              borderWidth: 0,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, padding: 14 } },
          },
        },
      })
    );
  }

  // ---- GRÁFICO 3: Evolução Mensal de Gastos (Linha) ----
  const trend = totals.trend || [];
  if (trend.length && document.getElementById("chartTrend")) {
    const ctx = document.getElementById("chartTrend");
    chartInstances.push(
      new Chart(ctx, {
        type: "line",
        data: {
          labels: trend.map((p) => p.label),
          datasets: [
            {
              label: "Gasto mensal",
              data: trend.map((p) => p.total),
              borderColor: "#22c55e",
              backgroundColor: "rgba(34,197,94,0.18)",
              fill: true,
              tension: 0.35,
              pointBackgroundColor: "#22c55e",
              pointRadius: 4,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: gridColor } },
            y: { beginAtZero: true, grid: { color: gridColor } },
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: (c) => fmtBRL(c.parsed.y),
              },
            },
          },
        },
      })
    );
  }
}

/** Formata valores como moeda (R$). */
function fmtBRL(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}