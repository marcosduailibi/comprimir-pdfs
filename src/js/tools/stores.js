// tools/stores.js
// Preferências locais de ferramentas: favoritos, "usado por último" e
// "frequentemente usadas". Persistimos SOMENTE ids e contadores — NUNCA
// arquivos, nomes de arquivos, thumbnails ou conteúdo de documentos.

const FAV_KEY = "pdfTools.favorites.v1";
const USAGE_KEY = "pdfTools.usage.v1";

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota/privado: ignora */ }
}

// ------------------------------ Favoritos ------------------------------
export function getFavorites() { const a = read(FAV_KEY, []); return Array.isArray(a) ? a : []; }
export function isFavorite(id) { return getFavorites().includes(id); }
export function toggleFavorite(id) {
  const set = new Set(getFavorites());
  if (set.has(id)) set.delete(id); else set.add(id);
  const arr = [...set];
  write(FAV_KEY, arr);
  return arr;
}
export function clearFavorites() { write(FAV_KEY, []); }

// ----------------------- Uso (recentes / frequentes) -----------------------
// Formato por ferramenta: { toolId, lastUsedAt, completedRuns, openedCount }
export function getUsage() { const o = read(USAGE_KEY, {}); return o && typeof o === "object" ? o : {}; }
function ensure(u, id) { return u[id] || { toolId: id, lastUsedAt: 0, completedRuns: 0, openedCount: 0 }; }

export function recordOpen(id) {
  const u = getUsage(); const r = ensure(u, id);
  r.openedCount += 1; r.lastUsedAt = Date.now(); u[id] = r; write(USAGE_KEY, u); return r;
}
export function recordComplete(id) {
  const u = getUsage(); const r = ensure(u, id);
  r.completedRuns += 1; r.lastUsedAt = Date.now(); u[id] = r; write(USAGE_KEY, u); return r;
}

/** IDs usados por último (mais recentes primeiro). */
export function getRecent(limit = 5) {
  return Object.values(getUsage())
    .filter((r) => r.lastUsedAt)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit)
    .map((r) => r.toolId);
}

/** Score puro de frequência (exportado para teste). */
export function frequencyScore(record, now = Date.now()) {
  const DAY = 86400000;
  const days = record.lastUsedAt ? (now - record.lastUsedAt) / DAY : 9999;
  const recencyBoost = days < 1 ? 5 : days < 7 ? 3 : days < 30 ? 1 : 0;
  return (record.completedRuns || 0) * 3 + (record.openedCount || 0) + recencyBoost;
}

/** IDs frequentemente usados. */
export function getFrequent(limit = 8) {
  const now = Date.now();
  return Object.values(getUsage())
    .map((r) => ({ id: r.toolId, score: frequencyScore(r, now) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.id);
}
