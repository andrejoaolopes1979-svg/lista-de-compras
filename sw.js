/* ============================================================
 * sw.js — Service Worker do PWA "Compras Inteligentes"
 * ------------------------------------------------------------
 * Estratégia: "stale-while-revalidate" com fallback offline.
 *  - Précache da casca do app na instalação;
 *  - Requisições GET servidas do cache imediatamente e
 *    atualizadas em segundo plano (quando online);
 *  - Navegações caem no index.html (fallback SPA);
 *  - O CDN do Chart.js também é cacheado após o 1º acesso,
 *    permitindo gráficos 100% offline depois disso.
 * ============================================================ */

"use strict";

const CACHE_NAME = "compras-inteligentes-v1";
const RUNTIME_CACHE = "compras-inteligentes-runtime-v1";

/* Recursos necessários para o app shell funcionar offline. */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/db.js",
  "./js/charts.js",
  "./js/views.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
];

/* ---------- Instalação: precache da casca ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url))
      ))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Ativação: remove caches antigos ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Intercepta as requisições GET de recursos do próprio app
 * (mesma origem) e do CDN do Chart.js. O restante não é tocado.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isAppAsset =
    url.origin === self.location.origin ||
    url.hostname === "cdn.jsdelivr.net";

  if (!isAppAsset) return;

  // Navegação (HTML) -> fallback para index.html (SPA)
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(request))
    );
    return;
  }

  // Stale-while-revalidate: serve do cache e atualiza em segundo plano
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});