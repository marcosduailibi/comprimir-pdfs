// pdf-worker.js
// Web Worker que orquestra os 4 fluxos (comprimir / juntar / juntar+comprimir /
// comprimir+juntar), reportando progresso e logs, com pausa/retomada/cancelamento
// cooperativos. O mesmo `runTask` e reutilizado pela thread principal (fallback)
// quando o Worker nao pode ser criado.

import { compressBytes } from "./pdf-compress.js?v=5";
import { mergeBytesList, analyzeBytes } from "./pdf-merge.js?v=5";

// ----------------------------- orquestracao -----------------------------

async function readFiles(files, ctx, emit) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    if (ctx.isCancelled()) throw new Error("TASK_CANCELLED");
    const f = files[i];
    const buf = await f.arrayBuffer();
    out.push({ name: f.name, size: f.size, bytes: new Uint8Array(buf) });
    emit({ type: "log", level: "INFO", message: `PDF ${i + 1} de ${files.length} carregado na memória do navegador.` });
  }
  return out;
}

function blobOf(bytes) {
  return new Blob([bytes], { type: "application/pdf" });
}

/**
 * Executa uma tarefa completa.
 * @param {{mode,files,quality,passes}} task  files = array de File
 * @param {{ctx, emit}} io  ctx.isPaused()/isCancelled(); emit(msg)
 */
export async function runTask(task, { ctx, emit }) {
  const { mode, files, quality = 50, passes = 2 } = task;
  emit({ type: "log", level: "INFO", message: "Arquivos selecionados localmente pelo usuário." });
  emit({ type: "log", level: "INFO", message: "Nenhum upload foi realizado." });

  const loaded = await readFiles(files, ctx, emit);
  const initialSize = loaded.reduce((s, f) => s + f.bytes.length, 0);
  emit({ type: "step", step: "loaded", status: "done" });

  const progress = (fraction, fields) =>
    emit({ type: "progress", progress: Math.max(0, Math.min(1, fraction)), ...fields });

  let resultBytes, totalPages = 0, filesProcessed = loaded.length;

  if (mode === "compress") {
    // --------------------- Fluxo A: comprimir 1 PDF ---------------------
    emit({ type: "step", step: "analyzed", status: "active" });
    const file = loaded[0];
    emit({ type: "step", step: "analyzed", status: "done" });
    emit({ type: "step", step: "images", status: "active" });
    emit({ type: "log", level: "INFO", message: `Compressão iniciada com qualidade de ${quality}%.` });

    const r = await compressBytes(file.bytes, {
      quality, passes, ctx,
      onImage: ({ pass, totalPasses, index, count }) => {
        const frac = count > 0 ? index / count : 1;
        const overall = ((pass - 1) + frac) / totalPasses;
        progress(0.05 + overall * 0.9, {
          fileIndex: 0, totalFiles: 1, fileName: file.name,
          stepLabel: "Comprimindo imagens no navegador", pass, totalPasses,
          page: index, totalPages: count,
        });
      },
      onPass: ({ pass, totalPasses }) => {
        emit({ type: "log", level: "INFO", message: `Passada ${pass} de ${totalPasses} concluída.` });
        if (pass === totalPasses) { emit({ type: "step", step: "images", status: "done" }); emit({ type: "step", step: "passes", status: "done" }); }
      },
    });
    resultBytes = r.bytes;
    try { totalPages = (await analyzeBytes(resultBytes)).pages; } catch { /* ignore */ }
  }

  else if (mode === "merge") {
    // ----------------------- Fluxo B: juntar -----------------------
    emit({ type: "step", step: "order", status: "done" });
    emit({ type: "step", step: "copied", status: "active" });
    const r = await mergeBytesList(loaded, {
      ctx,
      onPage: ({ fileIndex, name, page, totalPages: tp }) =>
        progress(0.05 + (page / tp) * 0.9, {
          fileIndex, totalFiles: loaded.length, fileName: name,
          stepLabel: "Copiando páginas no navegador", page, totalPages: tp,
        }),
    });
    resultBytes = r.bytes; totalPages = r.totalPages;
    emit({ type: "step", step: "copied", status: "done" });
    emit({ type: "log", level: "INFO", message: "Páginas copiadas para o PDF final." });
  }

  else if (mode === "merge_then_compress") {
    // ---------------- Fluxo C: juntar e depois comprimir ----------------
    emit({ type: "step", step: "merged", status: "active" });
    const merged = await mergeBytesList(loaded, {
      ctx,
      onPage: ({ page, totalPages: tp, name }) =>
        progress((page / tp) * 0.4, { fileName: name, stepLabel: "Unindo PDFs no navegador", page, totalPages: tp, totalFiles: loaded.length }),
    });
    totalPages = merged.totalPages;
    emit({ type: "step", step: "merged", status: "done" });
    emit({ type: "step", step: "images", status: "active" });
    emit({ type: "log", level: "INFO", message: `Compressão do PDF unido com qualidade de ${quality}%.` });

    const r = await compressBytes(merged.bytes, {
      quality, passes, ctx,
      onImage: ({ pass, totalPasses, index, count }) => {
        const frac = count > 0 ? index / count : 1;
        const overall = ((pass - 1) + frac) / totalPasses;
        progress(0.4 + overall * 0.55, { stepLabel: "Comprimindo imagens no navegador", pass, totalPasses, page: index, totalPages: count, totalFiles: loaded.length });
      },
      onPass: ({ pass, totalPasses }) => {
        emit({ type: "log", level: "INFO", message: `Passada ${pass} de ${totalPasses} concluída.` });
        if (pass === totalPasses) { emit({ type: "step", step: "images", status: "done" }); emit({ type: "step", step: "passes", status: "done" }); }
      },
    });
    resultBytes = r.bytes;
  }

  else if (mode === "compress_then_merge") {
    // -------------- Fluxo D: comprimir cada um e depois juntar --------------
    emit({ type: "step", step: "compressed", status: "active" });
    const compressedList = [];
    for (let i = 0; i < loaded.length; i++) {
      const file = loaded[i];
      emit({ type: "log", level: "INFO", message: `Comprimindo arquivo ${i + 1} de ${loaded.length}: ${file.name}` });
      const r = await compressBytes(file.bytes, {
        quality, passes, ctx,
        onImage: ({ pass, totalPasses, index, count }) => {
          const frac = count > 0 ? index / count : 1;
          const fileFrac = ((pass - 1) + frac) / totalPasses;
          const overall = (i + fileFrac) / loaded.length;
          progress(0.05 + overall * 0.65, {
            fileIndex: i, totalFiles: loaded.length, fileName: file.name,
            stepLabel: "Comprimindo imagens no navegador", pass, totalPasses, page: index, totalPages: count,
          });
        },
      });
      compressedList.push({ name: file.name, bytes: r.bytes });
    }
    emit({ type: "step", step: "compressed", status: "done" });
    emit({ type: "step", step: "merged", status: "active" });
    const merged = await mergeBytesList(compressedList, {
      ctx,
      onPage: ({ page, totalPages: tp, name }) =>
        progress(0.7 + (page / tp) * 0.25, { fileName: name, stepLabel: "Unindo PDFs comprimidos", page, totalPages: tp, totalFiles: loaded.length }),
    });
    resultBytes = merged.bytes; totalPages = merged.totalPages;
    emit({ type: "step", step: "merged", status: "done" });
  }

  else {
    throw new Error("Modo desconhecido: " + mode);
  }

  emit({ type: "step", step: "generated", status: "done" });
  emit({ type: "log", level: "INFO", message: "PDF final gerado localmente no navegador." });
  emit({ type: "step", step: "download", status: "done" });
  emit({ type: "log", level: "INFO", message: "Download preparado localmente." });
  progress(1, { stepLabel: "Pronto para baixar" });

  emit({
    type: "done",
    blob: blobOf(resultBytes),
    stats: { initialSize, finalSize: resultBytes.length, totalPages, filesProcessed, mode, quality, passes },
  });
}

// ------------------------ wiring do Web Worker ------------------------
// So ativa quando este modulo roda como Worker (em window, app.js importa
// apenas `runTask`/`analyzeBytes` para o fallback).
const isWorker =
  typeof WorkerGlobalScope !== "undefined" &&
  typeof self !== "undefined" &&
  self instanceof WorkerGlobalScope;

if (isWorker) {
  let paused = false;
  let cancelled = false;
  const ctx = { isPaused: () => paused, isCancelled: () => cancelled };
  const emit = (msg) => self.postMessage(msg);

  self.onmessage = async (e) => {
    const data = e.data || {};
    switch (data.type) {
      case "start":
        paused = false; cancelled = false;
        try {
          await runTask(data.task, { ctx, emit });
        } catch (err) {
          if (err && err.message === "TASK_CANCELLED") {
            emit({ type: "cancelled" });
          } else {
            emit({ type: "error", message: String(err && err.message ? err.message : err), code: err && err.message });
          }
        }
        break;
      case "pause": paused = true; emit({ type: "paused" }); break;
      case "resume": paused = false; emit({ type: "resumed" }); break;
      case "cancel": cancelled = true; paused = false; break;
      case "analyze":
        try {
          const perFile = [];
          for (const f of data.files) {
            const bytes = new Uint8Array(await f.arrayBuffer());
            try { perFile.push(await analyzeBytes(bytes)); } catch { perFile.push({ pages: null }); }
          }
          emit({ type: "analyzed", perFile });
        } catch (err) {
          emit({ type: "error", message: String(err) });
        }
        break;
    }
  };
}
