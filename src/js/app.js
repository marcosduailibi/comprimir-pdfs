// app.js
// Bootstrap e orquestracao: liga estado (state.js), interface (ui.js) e
// processamento (Web Worker pdf-worker.js, com fallback na thread principal).

import { appState, PRESETS, presetFromValues, validateSelection, modeAllowsMultiple, modeNeedsCompression, estimateCapacity, resolveDpiValue } from "./state.js?v=11";
import * as UI from "./ui.js?v=11";
import { buildFinalName, clamp, showToast } from "./utils.js?v=10";
import { bindDonation, showDownloadDonationPrompt } from "./donation.js?v=11";
import { recordOpen, recordComplete } from "./tools/stores.js?v=10";

let idSeq = 0;
let originalOrder = [];        // snapshot para "Restaurar ordem"
let worker = null;
let fallbackCtx = null;        // ctx de pausa/cancel quando sem worker
let analyzeQueue = [];         // FIFO de lotes (ids) aguardando analise de paginas

// ============================ Estado da tarefa ============================
// Persistimos apenas METADADOS (nunca os bytes do PDF) em sessionStorage, para
// detectar, ao recarregar a pagina, que havia um processamento em andamento.
const JOB_KEY = "pdfcompress_current_job";
const isProcessing = () => appState.status === "processing" || appState.status === "paused";
const PAGE_HEADINGS = {
  compress: {
    title: "Comprimir PDF",
    crumb: "Comprimir PDF",
    description: "Reduza o tamanho do seu PDF localmente, com segurança e sem perder o controle dos seus arquivos.",
  },
  merge: {
    title: "Juntar PDFs",
    crumb: "Juntar PDFs",
    description: "Una vários PDFs em um único arquivo localmente, mantendo seus documentos somente no navegador.",
  },
  merge_then_compress: {
    title: "Juntar e Comprimir PDF",
    crumb: "Juntar e comprimir",
    description: "Una vários PDFs e reduza o tamanho do arquivo final em um fluxo local no navegador.",
  },
  compress_then_merge: {
    title: "Comprimir e Juntar PDFs",
    crumb: "Comprimir e juntar",
    description: "Comprima cada PDF individualmente e depois gere um único arquivo final localmente.",
  },
};

function saveJob(extra = {}) {
  try {
    const first = appState.files[0];
    const job = {
      status: appState.status,
      startedAt: Date.now(),
      fileName: first ? first.name : "",
      fileSize: first ? first.size : 0,
      filesCount: appState.files.length,
      mode: appState.mode,
      progress: 0,
      currentStep: "",
      ...extra,
    };
    sessionStorage.setItem(JOB_KEY, JSON.stringify(job));
  } catch { /* sessionStorage indisponivel: segue sem persistir */ }
}
function updateJob(extra) {
  try {
    const raw = sessionStorage.getItem(JOB_KEY);
    if (!raw) return;
    sessionStorage.setItem(JOB_KEY, JSON.stringify({ ...JSON.parse(raw), ...extra }));
  } catch { /* ignore */ }
}
function clearJob() {
  try { sessionStorage.removeItem(JOB_KEY); } catch { /* ignore */ }
}

// ============================ Web Worker ============================
function initWorker() {
  try {
    worker = new Worker(new URL("./pdf-worker.js?v=10", import.meta.url), { type: "module" });
    worker.onmessage = (e) => onEngineMessage(e.data);
    worker.onerror = () => { worker = null; }; // cai no fallback ao processar
  } catch {
    worker = null;
  }
}

// ============================ Arquivos ============================
function isPdf(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function onFilesAdded(fileList) {
  UI.hideBanner();
  const incoming = Array.from(fileList);
  const invalid = incoming.filter((f) => !isPdf(f));
  if (invalid.length) UI.showBanner("error", "Um dos arquivos selecionados não parece ser um PDF válido. Remova o arquivo e tente novamente.");

  let valid = incoming.filter(isPdf);

  // Modo de arquivo único ("Comprimir um PDF"):
  //  - Se o usuário selecionar VÁRIOS PDFs de uma vez, ele claramente quer
  //    trabalhar com múltiplos. Em vez de descartar os extras em silêncio (o que
  //    fazia o "tamanho total" refletir só 1 arquivo), mudamos para "Juntar e
  //    comprimir" e mantemos todos.
  //  - Se selecionar apenas 1, mantemos a semântica de substituir o arquivo atual.
  if (!modeAllowsMultiple(appState.mode)) {
    if (valid.length > 1) {
      appState.mode = "merge_then_compress";
      showToast("Vários PDFs selecionados — mudamos para “Juntar e comprimir”. Você pode trocar o modo acima.");
    } else {
      appState.files = [];   // 1 arquivo: substitui (modo Comprimir)
    }
  }

  const added = valid.map((file) => ({ id: ++idSeq, file, name: file.name, size: file.size, pages: null }));
  appState.files = appState.files.concat(added);
  originalOrder = appState.files.map((f) => f.id);
  appState.status = appState.files.length ? "files_selected" : "idle";

  analyzeFiles(added);
  refresh();
  validateAndWarn();
}

function analyzeFiles(batch) {
  if (batch.length === 0) return;
  if (worker) {
    analyzeQueue.push(batch.map((f) => f.id));
    worker.postMessage({ type: "analyze", files: batch.map((f) => f.file) });
  } else {
    (async () => {
      const { analyzeBytes } = await import("./pdf-merge.js?v=10");
      for (const f of batch) {
        try { const { pages } = await analyzeBytes(new Uint8Array(await f.file.arrayBuffer())); setPages(f.id, pages); }
        catch { setPages(f.id, null); }
      }
    })();
  }
}
function setPages(id, pages) {
  const f = appState.files.find((x) => x.id === id);
  if (f) { f.pages = pages; UI.renderFileList(); UI.updateSummary(); validateAndWarn(); UI.updateStartButton(); }
}

function reorder(from, to) {
  const arr = appState.files;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  refresh();
}
function moveUp(i) { if (i > 0) reorder(i, i - 1); }
function moveDown(i) { if (i < appState.files.length - 1) reorder(i, i + 1); }
function removeFile(i) {
  appState.files.splice(i, 1);
  if (appState.files.length === 0) appState.status = "idle";
  refresh(); validateAndWarn();
}
function clearList() { appState.files = []; originalOrder = []; appState.status = "idle"; UI.hideBanner(); refresh(); }
function sortBy(key) {
  appState.files.sort((a, b) => key === "name" ? a.name.localeCompare(b.name) : a.size - b.size);
  refresh();
}
function restoreOrder() {
  appState.files.sort((a, b) => originalOrder.indexOf(a.id) - originalOrder.indexOf(b.id));
  refresh();
}

function validateAndWarn() {
  if (appState.files.length === 0) { UI.hideBanner(); return; }
  const v = validateSelection(appState.files);
  if (v.level === "block") UI.showBanner("error", v.messages[0]);
  else if (v.level === "warn") UI.showBanner("warn", v.messages[0]);
  else UI.hideBanner();
}

// ============================ Config ============================
function selectMode(mode) {
  appState.mode = mode;
  if (!modeAllowsMultiple(mode) && appState.files.length > 1) appState.files = appState.files.slice(0, 1);
  refresh(); validateAndWarn();
}
function applyPreset(key) {
  appState.preset = key;
  const p = PRESETS[key];
  if (key !== "custom") {
    appState.quality = p.quality;
    appState.passes = p.passes;
    appState.dpi = p.dpi;
    appState.dpiPreset = String(p.dpi);
    appState.customDpi = p.dpi || appState.customDpi;
  }
  UI.updateConfigUI(); UI.updateSummary(); UI.updateTechSummary();
}
function setQuality(v) {
  appState.quality = clamp(Math.round(v) || 1, 1, 100);
  appState.preset = presetFromValues(appState.quality, appState.passes, appState.dpi);
  UI.updateConfigUI(); UI.updateSummary(); UI.updateTechSummary();
}
function setPasses(v) {
  appState.passes = clamp(Math.round(v) || 1, 1, 5);
  appState.preset = presetFromValues(appState.quality, appState.passes, appState.dpi);
  UI.updateConfigUI(); UI.updateSummary(); UI.updateTechSummary();
}
function setDpiPreset(value) {
  appState.dpiPreset = String(value || "144");
  appState.dpi = resolveDpiValue(appState.dpiPreset, appState.customDpi);
  appState.preset = "custom";
  UI.updateConfigUI(); UI.updateSummary(); UI.updateTechSummary();
}
function setCustomDpi(v) {
  appState.customDpi = clamp(Math.round(v) || 144, 36, 600);
  appState.dpi = resolveDpiValue(appState.dpiPreset, appState.customDpi);
  appState.preset = "custom";
  UI.updateConfigUI(); UI.updateSummary(); UI.updateTechSummary();
}

// ============================ Processamento ============================
async function startProcessing() {
  if (appState.status === "processing") return;
  const v = validateSelection(appState.files);
  if (v.level === "block") { UI.showBanner("error", v.messages[0]); return; }

  // Falha controlada: se o navegador indicar pouco armazenamento local para o
  // volume selecionado, recusamos com mensagem clara em vez de travar a aba.
  const totalBytes = appState.files.reduce((s, f) => s + f.size, 0);
  const cap = await estimateCapacity(totalBytes);
  if (!cap.ok) {
    UI.showBanner("error", "Seu navegador indicou pouco armazenamento local disponível para processar esta quantidade de dados com segurança. Reduza o tamanho ou a quantidade de PDFs, ou tente em um navegador de computador com mais memória. Nenhum arquivo foi enviado para servidores.");
    return;
  }

  appState.status = "processing";
  appState.result = null;
  saveJob({ status: "processing", currentStep: "Carregando arquivos no navegador" });
  UI.updateStartButton();
  UI.hideBanner();
  UI.clearLog();
  UI.showProgress();
  showToast("Processamento iniciado. Acompanhe o progresso abaixo.");
  const initialSize = appState.files.reduce((s, f) => s + f.size, 0);
  UI.startTimer(initialSize);

  const task = {
    mode: appState.mode,
    files: appState.files.map((f) => f.file),
    quality: appState.quality,
    passes: appState.passes,
    dpi: appState.dpi,
  };

  if (worker) {
    worker.postMessage({ type: "start", task });
  } else {
    runFallback(task);
  }
}

async function runFallback(task) {
  fallbackCtx = { paused: false, cancelled: false, isPaused() { return this.paused; }, isCancelled() { return this.cancelled; } };
  try {
    const { runTask } = await import("./pdf-worker.js?v=10");
    await runTask(task, { ctx: fallbackCtx, emit: onEngineMessage });
  } catch (err) {
    if (err && err.message === "TASK_CANCELLED") onEngineMessage({ type: "cancelled" });
    else onEngineMessage({ type: "error", message: String(err && err.message ? err.message : err) });
  }
}

function pauseProcessing() {
  if (appState.status !== "processing") return;
  appState.status = "paused";
  if (worker) worker.postMessage({ type: "pause" });
  else if (fallbackCtx) fallbackCtx.paused = true;
  UI.setPausedUI(true); UI.pauseTimer();
  UI.addLog("INFO", "Processamento pausado pelo usuário.");
  showToast("Processamento pausado.");
}
function resumeProcessing() {
  if (appState.status !== "paused") return;
  appState.status = "processing";
  if (worker) worker.postMessage({ type: "resume" });
  else if (fallbackCtx) fallbackCtx.paused = false;
  UI.setPausedUI(false); UI.resumeTimer();
  UI.addLog("INFO", "Processamento retomado pelo usuário.");
  showToast("Processamento retomado.");
}
function stopProcessing() {
  if (appState.status !== "processing" && appState.status !== "paused") return;
  if (worker) worker.postMessage({ type: "cancel" });
  else if (fallbackCtx) { fallbackCtx.cancelled = true; fallbackCtx.paused = false; }
  UI.addLog("WARNING", "Cancelamento solicitado pelo usuário.");
}

// ---------------------- mensagens da engine (worker/fallback) ----------------------
function onEngineMessage(msg) {
  switch (msg.type) {
    case "analyzed": {
      const ids = analyzeQueue.shift() || [];
      (msg.perFile || []).forEach((r, i) => setPages(ids[i], r ? r.pages : null));
      break;
    }
    case "progress": {
      UI.setProgress(msg.progress, msg.stepLabel);
      UI.setProgressDetail(msg);
      updateJob({ progress: Math.round((msg.progress || 0) * 100), currentStep: msg.stepLabel || "" });
      const initialSize = appState.files.reduce((s, f) => s + f.size, 0);
      const el = UI.elapsedMs();
      if (el > 500 && msg.progress > 0.02) UI.setSpeed((msg.progress * initialSize) / 1024 / (el / 1000));
      break;
    }
    case "log": UI.addLog(msg.level || "INFO", msg.message); break;
    case "step": UI.setStep(msg.step, msg.status); break;
    case "paused": break;   // confirmacao; UI ja atualizada
    case "resumed": break;
    case "done": onDone(msg); break;
    case "cancelled": onCancelled(); break;
    case "error": onError(msg); break;
  }
}

function onDone(msg) {
  UI.stopTimer();
  clearJob();
  try { recordComplete(appState.mode); } catch { /* uso é opcional */ }
  appState.status = "done";
  const url = URL.createObjectURL(msg.blob);
  const name = buildFinalName(appState.mode, appState.files);
  appState.result = { blob: msg.blob, url, name, stats: msg.stats };
  UI.addLog("SUCCESS", "Processamento concluído localmente. PDF final pronto para download.");
  UI.showResult(msg.stats, { url, name, totalTime: UI.elapsedMs() });
  UI.updateStartButton();
}

function onCancelled() {
  UI.stopTimer();
  clearJob();
  appState.status = "files_selected";
  document.getElementById("progressCard").hidden = true;
  UI.addLog("WARNING", "Operação cancelada. Nenhum arquivo foi enviado para servidores.");
  UI.showBanner("warn", "Processamento interrompido. Nenhum arquivo foi enviado para servidores. Os arquivos selecionados foram mantidos.");
  UI.updateStartButton();
  fallbackCtx = null;
  showToast("Processamento cancelado.");
}

function onError(msg) {
  UI.stopTimer();
  clearJob();
  appState.status = "error";
  document.querySelectorAll(".step.is-active").forEach((n) => { n.classList.remove("is-active"); n.classList.add("is-error"); });
  const m = String(msg.message || "").toLowerCase();
  let friendly;
  if (m.includes("merge_invalid") || m.includes("encrypt") || m.includes("invalid") || m.includes("parse")) {
    friendly = appState.mode === "merge" || appState.mode.includes("merge")
      ? "Não foi possível juntar os PDFs. Verifique se algum arquivo está protegido, corrompido ou incompatível."
      : "Não foi possível comprimir este PDF. Tente outro nível de qualidade ou use menos passadas.";
  } else if (m.includes("memory") || m.includes("allocation")) {
    friendly = "O navegador pode não ter memória suficiente para concluir esta operação. Tente fechar outras abas ou processar menos PDFs por vez.";
  } else {
    friendly = "Não foi possível concluir a operação. Nenhum arquivo foi enviado para servidores. Tente novamente com outras configurações.";
  }
  UI.showBanner("error", friendly);
  UI.addLog("ERROR", friendly);
  UI.updateStartButton();
  fallbackCtx = null;
}

// ---------------------- resultado: acoes ----------------------
function onDownload() {
  // o proprio <a download> baixa; exibe prompt de apoio nao bloqueante.
  setTimeout(() => showDownloadDonationPrompt(), 400);
}
function processAgain() {
  if (appState.result) { URL.revokeObjectURL(appState.result.url); appState.result = null; }
  appState.status = appState.files.length ? "files_selected" : "idle";
  document.getElementById("resultCard").hidden = true;
  UI.updateStartButton();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function changeOrder() {
  document.getElementById("resultCard").hidden = true;
  document.getElementById("fileListCard").scrollIntoView({ behavior: "smooth", block: "center" });
}

// ============================ refresh agregado ============================
function refresh() {
  UI.renderModes();
  UI.updateUploadUI();
  UI.renderFileList();
  UI.updateConfigUI();
  UI.updateSummary();
  UI.updateStartButton();
  UI.updateTechSummary();
  updatePageHeading();
}

function updatePageHeading() {
  const info = PAGE_HEADINGS[appState.mode] || PAGE_HEADINGS.compress;
  document.title = `${info.title} | ArqKit`;
  const title = document.getElementById("compressTitle");
  if (title) title.textContent = info.title;
  const description = document.querySelector(".ak-tool-heading p");
  if (description) description.textContent = info.description;
  const crumb = document.querySelector(".ak-tool-heading .ak-breadcrumb span:last-child");
  if (crumb) crumb.textContent = info.crumb;
}

// ============================ Ciclo de vida / aba ============================
// Avisa antes de fechar/recarregar durante o processamento e alerta (sem
// bloquear) quando a aba vai para segundo plano, onde o navegador pode reduzir
// tarefas pesadas. Nao prometemos continuidade absoluta em background.
let bgNoticeShown = false;
function bindLifecycleGuards() {
  window.addEventListener("beforeunload", (e) => {
    if (isProcessing()) { e.preventDefault(); e.returnValue = ""; return ""; }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isProcessing() && !bgNoticeShown) {
      bgNoticeShown = true;
      UI.addLog("WARNING", "Aba em segundo plano: alguns navegadores podem reduzir o processamento.");
      showToast("A compressão continua no navegador, mas mantenha esta aba aberta para arquivos grandes.");
    }
    if (!document.hidden) bgNoticeShown = false;
  });
}

// Detecta, ao carregar a pagina, um processamento que ficou em aberto (aba
// fechada/recarregada). Como os PDFs nunca saem do navegador, nao ha como
// restaurar os arquivos: orientamos a selecionar novamente. Sempre limpa o
// registro para nao repetir o aviso.
function checkPreviousJob() {
  let job = null;
  try { const raw = sessionStorage.getItem(JOB_KEY); if (raw) job = JSON.parse(raw); } catch { /* ignore */ }
  if (!job) return;
  clearJob();
  UI.showBanner("warn", "Detectamos que havia uma compressão em andamento. Se a aba foi fechada ou o navegador pausou o processo, será necessário selecionar o arquivo novamente, pois seus PDFs não são enviados nem armazenados em servidor.");
}

// Abre a ferramenta indicada pela URL (ex.: vinda do catalogo: ./comprimir-pdf.html#tool=merge).
function applyToolHash() {
  const m = (location.hash.match(/tool=([a-z_]+)/) || [])[1];
  const valid = ["compress", "merge", "merge_then_compress", "compress_then_merge"];
  if (!m || !valid.includes(m)) return;
  selectMode(m);
  try { recordOpen(m); } catch { /* uso é opcional */ }
  document.getElementById("ferramenta")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ============================ Init ============================
initWorker();
bindLifecycleGuards();
checkPreviousJob();
bindDonation();
UI.initUI({
  onModeSelect: selectMode,
  onFilesAdded,
  onFileUp: moveUp,
  onFileDown: moveDown,
  onFileRemove: removeFile,
  onReorder: reorder,
  onSortName: () => sortBy("name"),
  onSortSize: () => sortBy("size"),
  onRestoreOrder: restoreOrder,
  onClearList: clearList,
  onPresetSelect: applyPreset,
  onQualityInput: setQuality,
  onPassesInput: setPasses,
  onDpiPreset: setDpiPreset,
  onCustomDpi: setCustomDpi,
  onStart: startProcessing,
  onPause: pauseProcessing,
  onResume: resumeProcessing,
  onStop: stopProcessing,
  onDownload,
  onProcessAgain: processAgain,
  onChangeOrder: changeOrder,
});

// Abre a ferramenta vinda do hub (e ao mudar o hash sem recarregar).
applyToolHash();
window.addEventListener("hashchange", applyToolHash);
