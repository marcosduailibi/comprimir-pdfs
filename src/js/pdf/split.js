// pdf/split.js
// Execução da divisão com pdf-lib (carregado por CDN jsDelivr). Recebe um PLANO
// (de page-ranges.js) e produz os PDFs de saída. Tudo no navegador.

import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

/** Número de páginas de um PDF. */
export async function getPageCount(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return doc.getPageCount();
}

/**
 * Executa o plano de divisão.
 * @param {Uint8Array} bytes  PDF de origem
 * @param {Array<{label:string, pages:number[]}>} groups  plano (1-based)
 * @param {string} baseName  nome base para os arquivos de saída
 * @param {(p:{index:number,total:number,label:string})=>void} [onProgress]
 * @returns {Promise<Array<{ name:string, bytes:Uint8Array, pages:number }>>}
 */
export async function executeSplit(bytes, groups, baseName, onProgress) {
  if (!groups || !groups.length) throw new Error("EMPTY_PLAN");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const total = src.getPageCount();
  const out = [];
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const indices = grp.pages
      .map((p) => p - 1)
      .filter((i) => i >= 0 && i < total);
    if (!indices.length) continue;
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(src, indices);
    copied.forEach((pg) => doc.addPage(pg));
    const outBytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
    out.push({ name: `${baseName}-${grp.label}.pdf`, bytes: outBytes, pages: indices.length });
    if (onProgress) onProgress({ index: g + 1, total: groups.length, label: grp.label });
    await new Promise((r) => setTimeout(r, 0)); // cede o event loop (UI responsiva)
  }
  if (!out.length) throw new Error("EMPTY_RESULT");
  return out;
}
