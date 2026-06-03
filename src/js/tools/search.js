// tools/search.js
// Busca PURA de ferramentas — sem acento, sem distinção de maiúsculas, por
// nome, aliases (inclui termos em inglês), categorias e extensões. Módulo-folha
// (testável em Node). A UI apenas consome o resultado.

/** Remove acentos e normaliza para minúsculas. */
export function normalize(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Pontua uma ferramenta para um termo (0 = não casa).
 * Prioriza: nome começa-com > nome contém > alias exato > qualquer campo contém.
 */
function scoreTerm(tool, term) {
  const name = normalize(tool.name);
  const short = normalize(tool.shortName);
  if (name.startsWith(term) || short.startsWith(term)) return 6;

  const aliases = (tool.aliases || []).map(normalize);
  if (aliases.some((a) => a === term)) return 5;

  if (name.includes(term) || short.includes(term)) return 4;
  if (aliases.some((a) => a.includes(term))) return 3;

  const exts = [...(tool.inputExtensions || []), ...(tool.outputExtensions || [])].map(normalize);
  if (exts.includes(term)) return 3;

  const cats = (tool.categoryIds || []).map(normalize);
  const desc = normalize(tool.description);
  if (cats.some((c) => c.includes(term)) || desc.includes(term)) return 1;

  return 0;
}

/**
 * Busca ferramentas. Query vazia retorna todas (na ordem original).
 * Todos os termos precisam casar (AND); a pontuação ordena os resultados.
 * @param {string} query
 * @param {Array<object>} tools
 * @returns {Array<object>}
 */
export function searchTools(query, tools) {
  const list = Array.isArray(tools) ? tools : [];
  const q = normalize(query).trim();
  if (!q) return list.slice();

  const terms = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const tool of list) {
    let total = 0;
    let matchedAll = true;
    for (const term of terms) {
      const s = scoreTerm(tool, term);
      if (s === 0) { matchedAll = false; break; }
      total += s;
    }
    if (matchedAll) scored.push({ tool, total });
  }
  scored.sort((a, b) => b.total - a.total || a.tool.name.localeCompare(b.tool.name, "pt"));
  return scored.map((x) => x.tool);
}
