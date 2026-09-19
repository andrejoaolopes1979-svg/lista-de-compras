/* ============================================================
 * db.js — Camada de persistência em IndexedDB
 * ------------------------------------------------------------
 * Armazena os dados localmente, sem limites severos de espaço
 * (diferente do LocalStorage). Todos os bancos do app vivem
 * aqui, protegidos contra vazamento para a rede.
 *
 * Estrutura do banco:
 *   plan       { id, name, category, qty, estPrice }   → planejamento
 *   cart       { id, name, category, qty, estPrice,
 *                checked, realQty, realPrice }          → carrinho ativo
 *   cartMeta   { key, value }                           → supermercado + pagamentos
 *   purchases  { id, date, supermarket, items, payments, total } → histórico
 * ============================================================ */

"use strict";

const DB_NAME = "compras-db";
const DB_VERSION = 1;

/** Object stores do banco com a chave primária de cada um. */
const STORES = {
  plan: "id",
  cart: "id",
  cartMeta: "key",
  purchases: "id",
};

let _db = null;

/** Abre (ou reutiliza) a conexão com o IndexedDB. */
function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Cria as object stores na primeira abertura / upgrade.
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

/** Garante que o banco está pronto antes de qualquer operação. */
async function ready() {
  if (!_db) await openDB();
  return _db;
}

/** Executa uma requisição simples e devolve o resultado. */
async function single(storeName, mode, fn) {
  const db = await ready();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Retorna todos os registros de uma store. */
function getAll(storeName) {
  return single(storeName, "readonly", (s) => s.getAll());
}

/** Retorna um registro pela chave. */
function get(storeName, key) {
  return single(storeName, "readonly", (s) => s.get(key));
}

/** Insere/atualiza um único registro. */
function put(storeName, value) {
  return single(storeName, "readwrite", (s) => s.put(value));
}

/** Insere/atualiza vários registros em uma única transação. */
function bulkPut(storeName, values) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await ready();
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      (values || []).forEach((v) => store.put(v));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

/** Remove um registro pela chave. */
function remove(storeName, key) {
  return single(storeName, "readwrite", (s) => s.delete(key));
}

/** Apaga todos os registros de uma store. */
function clearStore(storeName) {
  return single(storeName, "readwrite", (s) => s.clear());
}