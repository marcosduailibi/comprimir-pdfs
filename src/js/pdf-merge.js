// pdf-merge.js
// Engine de juncao de PDFs: copia as paginas de varios documentos, na ordem
// definida pelo usuario, para um unico PDF final (pdf-lib copyPages).
// Importa pdf-lib por URL completa para funcionar no Web Worker e no fallback.

import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkpoint(ctx) {
  await sleep(0);
  if (ctx && ctx.isCancelled && ctx.isCancelled()) throw new Error("TASK_CANCELLED");
  while (ctx && ctx.isPaused && ctx.isPaused()) await sleep(150);
  if (ctx && ctx.isCancelled && ctx.isCancelled()) throw new Error("TASK_CANCELLED");
}

/** Le metadados rapidos de um PDF (numero de paginas). */
export async function analyzeBytes(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  return { pages: doc.getPageCount() };
}

/**
 * Junta uma lista de PDFs em um unico documento, respeitando a ordem recebida.
 * @param {Array<{ name: string, bytes: Uint8Array }>} list
 * @returns {Promise<{ bytes: Uint8Array, totalPages: number }>}
 */
export async function mergeBytesList(list, { ctx, onPage, onFile } = {}) {
  if (!list || list.length === 0) throw new Error("Nenhum PDF para juntar.");

  const out = await PDFDocument.create();
  let copiedPages = 0;

  // Conta total de paginas para o progresso.
  let totalPages = 0;
  const docs = [];
  for (let i = 0; i < list.length; i++) {
    await checkpoint(ctx);
    let srcDoc;
    try {
      srcDoc = await PDFDocument.load(list[i].bytes, { ignoreEncryption: true, updateMetadata: false });
    } catch {
      throw new Error("MERGE_INVALID_PDF");
    }
    totalPages += srcDoc.getPageCount();
    docs.push(srcDoc);
  }

  for (let i = 0; i < docs.length; i++) {
    if (onFile) onFile({ fileIndex: i, name: list[i].name, total: list.length });
    const srcDoc = docs[i];
    const indices = srcDoc.getPageIndices();
    // Copia pagina a pagina para permitir checkpoint e progresso por pagina.
    for (const idx of indices) {
      await checkpoint(ctx);
      const [page] = await out.copyPages(srcDoc, [idx]);
      out.addPage(page);
      copiedPages++;
      if (onPage) onPage({ fileIndex: i, name: list[i].name, page: copiedPages, totalPages });
    }
  }

  const bytes = await out.save({ useObjectStreams: true, addDefaultPage: false });
  return { bytes, totalPages };
}
