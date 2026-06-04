// tools/search.js
// Busca pura de ferramentas: sem acento, sem caixa, por nome, aliases,
// keywords, categorias, extensoes, status e descricao.

import { CATEGORIES, STATUS_META } from "./registry.js";

export function normalize(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function categoryTerms(tool) {
  return (tool.categoryIds || []).flatMap((id) => {
    const category = CATEGORIES.find((item) => item.id === id);
    return [id, category?.name || ""];
  });
}

function scoreTerm(tool, term) {
  const name = normalize(tool.name);
  const short = normalize(tool.shortName);
  if (name.startsWith(term) || short.startsWith(term)) return 7;

  const aliases = (tool.aliases || []).map(normalize);
  if (aliases.some((alias) => alias === term)) return 6;

  if (name.includes(term) || short.includes(term)) return 5;
  if (aliases.some((alias) => alias.includes(term))) return 4;

  const keywords = (tool.keywords || []).map(normalize);
  if (keywords.some((keyword) => keyword === term)) return 4;
  if (keywords.some((keyword) => keyword.includes(term))) return 3;

  const exts = [...(tool.inputExtensions || []), ...(tool.outputExtensions || [])].map(normalize);
  if (exts.includes(term)) return 3;

  const categories = categoryTerms(tool).map(normalize);
  if (categories.some((category) => category.includes(term))) return 2;

  const haystack = [
    tool.description,
    tool.tooltip,
    STATUS_META[tool.status]?.label,
    tool.status,
  ].map(normalize).join(" ");
  if (haystack.includes(term)) return 1;

  return 0;
}

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
      const score = scoreTerm(tool, term);
      if (score === 0) {
        matchedAll = false;
        break;
      }
      total += score;
    }
    if (matchedAll) scored.push({ tool, total });
  }

  scored.sort((a, b) => {
    const statusBias = (b.tool.status === "ready") - (a.tool.status === "ready");
    return b.total - a.total
      || statusBias
      || normalize(a.tool.name).length - normalize(b.tool.name).length
      || a.tool.name.localeCompare(b.tool.name, "pt-BR");
  });
  return scored.map((item) => item.tool);
}
