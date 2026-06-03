// pdf/page-ranges.js
// Parser de intervalos de páginas e PLANO de divisão — funções PURAS, sem
// dependências (testáveis em Node). O pdf-lib só executa o plano (split.js).
//
// Erros são lançados como RangeError com código:
//   EMPTY | INVALID:<token> | INVERTED:<token> | OUT_OF_RANGE:<token> |
//   NO_PAGES | UNKNOWN_MODE

/** "1-3, 5, 10-12" -> [{start:1,end:3,raw}, {start:5,end:5,raw}, {start:10,end:12,raw}] */
export function parseRangeTokens(input) {
  const s = String(input == null ? "" : input).trim();
  if (!s) throw new RangeError("EMPTY");
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new RangeError("EMPTY");
  return parts.map((p) => {
    const m = p.match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if (!m) throw new RangeError("INVALID:" + p);
    const start = parseInt(m[1], 10);
    const end = m[2] != null ? parseInt(m[2], 10) : start;
    return { start, end, raw: p };
  });
}

/** Valida os tokens contra o total de páginas (pageCount opcional). */
export function validateTokens(tokens, pageCount) {
  for (const t of tokens) {
    if (t.start < 1 || t.end < 1) throw new RangeError("OUT_OF_RANGE:" + t.raw);
    if (t.start > t.end) throw new RangeError("INVERTED:" + t.raw);
    if (pageCount && (t.start > pageCount || t.end > pageCount)) throw new RangeError("OUT_OF_RANGE:" + t.raw);
  }
  return tokens;
}

function listRange(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }

/** Lista plana, única e ordenada de páginas (1-based) a partir de um texto de intervalos. */
export function parsePageRanges(input, pageCount) {
  const tokens = validateTokens(parseRangeTokens(input), pageCount);
  const set = new Set();
  for (const t of tokens) for (let i = t.start; i <= t.end; i++) set.add(i);
  return [...set].sort((a, b) => a - b);
}

/**
 * Plano de divisão: retorna grupos { label, pages:[1-based,...] } — cada grupo
 * vira um PDF de saída.
 * @param {'extract'|'ranges'|'everyN'|'all'|'oddEven'} mode
 * @param {{ pageCount:number, rangesText?:string, n?:number }} opts
 */
export function planSplit(mode, opts = {}) {
  const pageCount = Math.floor(Number(opts.pageCount) || 0);
  if (pageCount < 1) throw new RangeError("NO_PAGES");
  const all = listRange(1, pageCount);

  switch (mode) {
    case "extract": {
      const pages = parsePageRanges(opts.rangesText, pageCount);
      return [{ label: "paginas-selecionadas", pages }];
    }
    case "ranges": {
      const tokens = validateTokens(parseRangeTokens(opts.rangesText), pageCount);
      return tokens.map((t, i) => ({ label: `parte-${i + 1}`, pages: listRange(t.start, t.end) }));
    }
    case "everyN": {
      const n = Math.max(1, Math.floor(Number(opts.n) || 1));
      const groups = [];
      for (let i = 0; i < pageCount; i += n) {
        groups.push({ label: `parte-${groups.length + 1}`, pages: all.slice(i, i + n) });
      }
      return groups;
    }
    case "all":
      return all.map((p) => ({ label: `pagina-${p}`, pages: [p] }));
    case "oddEven": {
      const out = [];
      const odd = all.filter((p) => p % 2 === 1);
      const even = all.filter((p) => p % 2 === 0);
      if (odd.length) out.push({ label: "impares", pages: odd });
      if (even.length) out.push({ label: "pares", pages: even });
      return out;
    }
    default:
      throw new RangeError("UNKNOWN_MODE");
  }
}

/** Mensagem amigável para um erro de range/plano. */
export function describeRangeError(err, pageCount) {
  const code = String(err && err.message || err || "");
  const [kind, token] = code.split(":");
  switch (kind) {
    case "EMPTY": return "Informe ao menos um intervalo, ex.: 1-3, 5, 10-12.";
    case "INVALID": return `Trecho inválido: “${token}”. Use números e intervalos, ex.: 1-3, 5.`;
    case "INVERTED": return `Intervalo invertido em “${token}”. O início deve ser ≤ o fim.`;
    case "OUT_OF_RANGE": return `“${token}” está fora do documento${pageCount ? ` (1–${pageCount})` : ""}.`;
    case "NO_PAGES": return "Não foi possível detectar páginas neste PDF.";
    default: return "Verifique os intervalos informados.";
  }
}
