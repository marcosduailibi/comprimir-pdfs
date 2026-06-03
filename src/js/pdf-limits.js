// pdf-limits.js
// Limites de ENTRADA e RESUMO PURO da seleção de PDFs.
// Módulo-folha: SEM dependências e SEM import de CDN — por isso é importável e
// testável diretamente no Node (node --test).

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

// Limites RÍGIDOS de entrada (rejeição controlada — ver state.js/validateSelection).
//  - Compressão / dividir: até 1 GB por PDF.
//  - União / juntar e comprimir: até 500 PDFs e 1 GB no total.
export const MAX = { perFile: 1 * GB, total: 1 * GB, files: 500 };

/**
 * Resumo PURO da seleção. Soma SEMPRE todos os arquivos — nunca apenas o
 * primeiro ou o último. Aceita itens no formato do app ({ size, pages }) ou
 * com { size, pageCount }.
 *
 * @param {Array<{ size:number, pages?:number|null, pageCount?:number|null }>} files
 * @returns {{ totalBytes:number, largestFileBytes:number, fileCount:number, totalPages:number, remainingBytes:number }}
 */
export function calculateSelectedFilesSummary(files) {
  const list = Array.isArray(files) ? files : [];
  const totalBytes = list.reduce((sum, f) => sum + (Number(f && f.size) || 0), 0);
  const largestFileBytes = list.reduce((max, f) => Math.max(max, Number(f && f.size) || 0), 0);
  const fileCount = list.length;
  const totalPages = list.reduce((sum, f) => {
    const p = f && (f.pages != null ? f.pages : f.pageCount);
    return sum + (Number(p) || 0);
  }, 0);
  const remainingBytes = Math.max(0, MAX.total - totalBytes);
  return { totalBytes, largestFileBytes, fileCount, totalPages, remainingBytes };
}
