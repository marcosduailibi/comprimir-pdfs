// ui.js
// Camada de interface: renderiza o DOM a partir do estado e dispara handlers do
// app.js nos eventos. Nao contem logica de PDF nem do Web Worker.

import {
  appState, MODES, PRESETS, STEPS, modeAllowsMultiple, modeNeedsCompression,
  qualityHint, passesInfo, presetFromValues, validateSelection, riskLevel,
  calculateSelectedFilesSummary, DPI_PRESETS, dpiHint, dpiLabel,
} from "./state.js?v=10";
import { formatBytes, formatTime, prettyMode } from "./utils.js?v=10";
import { bindThemeToggle, initTheme as initSharedTheme } from "./theme.js?v=10";

const $ = (id) => document.getElementById(id);
let H = {}; // handlers

// --------------------------- render: modos ---------------------------
export function renderModes() {
  const box = $("modes");
  const adv = $("modesAdvanced");
  box.innerHTML = "";
  if (adv) adv.innerHTML = "";
  const multi = appState.files.length > 1;
  for (const m of MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mode" + (appState.mode === m.id ? " is-active" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(appState.mode === m.id));
    const recommended = m.recommended && multi;
    b.innerHTML =
      `<span class="mode__icon" aria-hidden="true">${m.icon}</span>` +
      `<span class="mode__title">${m.title}</span>` +
      `<span class="mode__text">${m.text}</span>` +
      (recommended ? `<span class="mode__tag">Recomendado</span>` : "");
    b.addEventListener("click", () => H.onModeSelect(m.id));
    // Modos nao-primarios vao para "Configuracoes avancadas" (se o container existir).
    (m.primary === false && adv ? adv : box).appendChild(b);
  }
}

// --------------------------- render: presets ---------------------------
export function renderPresets() {
  const box = $("presets");
  const adv = $("presetsAdvanced");
  box.innerHTML = "";
  if (adv) adv.innerHTML = "";
  for (const [key, p] of Object.entries(PRESETS)) {
    if (key === "custom") continue; // "Personalizado" e detectado pelo slider, sem chip.
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.key = key;
    b.className = "preset" + (appState.preset === key ? " is-active" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(appState.preset === key));
    b.innerHTML =
      `<span class="preset__name">${p.label}</span>` +
      `<span class="preset__desc">${p.description}</span>`;
    b.addEventListener("click", () => H.onPresetSelect(key));
    (p.primary === false && adv ? adv : box).appendChild(b);
  }
}

// --------------------------- render: lista ---------------------------
export function renderFileList() {
  const card = $("fileListCard");
  const list = $("fileList");
  if (appState.files.length === 0) { card.hidden = true; list.innerHTML = ""; return; }
  card.hidden = false;
  list.innerHTML = "";

  appState.files.forEach((f, i) => {
    const li = document.createElement("li");
    li.className = "file-item";
    li.draggable = true;
    li.dataset.index = String(i);
    const pages = f.pages ? `${f.pages} págs` : "…";
    li.innerHTML =
      `<span class="file-item__grip" aria-hidden="true">⋮⋮</span>` +
      `<span class="file-item__order">${i + 1}</span>` +
      `<span class="file-item__info"><strong>${escapeHtml(f.name)}</strong>` +
      `<span class="file-item__meta">${formatBytes(f.size)} · ${pages}</span></span>` +
      `<span class="file-item__actions">` +
      `<button class="mini-btn" data-act="up" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>` +
      `<button class="mini-btn" data-act="down" ${i === appState.files.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>` +
      `<button class="mini-btn mini-btn--danger" data-act="remove" aria-label="Remover">🗑️</button>` +
      `</span>`;
    li.querySelector('[data-act="up"]').addEventListener("click", () => H.onFileUp(i));
    li.querySelector('[data-act="down"]').addEventListener("click", () => H.onFileDown(i));
    li.querySelector('[data-act="remove"]').addEventListener("click", () => H.onFileRemove(i));

    li.addEventListener("dragstart", (e) => { li.classList.add("is-dragging"); e.dataTransfer.setData("text/plain", String(i)); });
    li.addEventListener("dragend", () => li.classList.remove("is-dragging"));
    li.addEventListener("dragover", (e) => { e.preventDefault(); li.classList.add("drag-over"); });
    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
    li.addEventListener("drop", (e) => {
      e.preventDefault(); li.classList.remove("drag-over");
      const from = Number(e.dataTransfer.getData("text/plain"));
      const to = Number(li.dataset.index);
      if (!Number.isNaN(from) && from !== to) H.onReorder(from, to);
    });
    list.appendChild(li);
  });
}

// --------------------------- config (qualidade/passadas/preset) ---------------------------
export function updateConfigUI() {
  // visibilidade conforme o modo
  $("configCard").hidden = !modeNeedsCompression(appState.mode);

  const q = appState.quality;
  $("qualityValue").textContent = q + "%";
  $("qualityRange").value = q;
  $("qualityRange").style.background =
    `linear-gradient(to right, var(--primary) 0%, var(--primary) ${q}%, var(--track) ${q}%, var(--track) 100%)`;
  const qh = qualityHint(q);
  $("qualityHint").textContent = qh.text;
  const qw = $("qualityWarn");
  if (qh.warn) { qw.textContent = qh.warn; qw.hidden = false; } else qw.hidden = true;

  const dpiSelect = $("dpiPreset");
  if (dpiSelect) {
    if (!dpiSelect.options.length) {
      DPI_PRESETS.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        dpiSelect.appendChild(o);
      });
    }
    dpiSelect.value = appState.dpiPreset;
    const customWrap = $("dpiCustomWrap");
    if (customWrap) customWrap.hidden = appState.dpiPreset !== "custom";
    const customInput = $("dpiCustom");
    if (customInput) customInput.value = appState.customDpi;
    const dh = dpiHint(appState.dpi);
    const hint = $("dpiHint");
    if (hint) hint.textContent = dh.text;
    const warn = $("dpiWarn");
    if (warn) {
      if (dh.warn) { warn.textContent = dh.warn; warn.hidden = false; }
      else warn.hidden = true;
    }
  }

  $("passesValue").value = appState.passes;
  const pi = passesInfo(appState.passes);
  $("passesHint").textContent = pi.text;
  const pw = $("passesWarn");
  if (pi.warn) { pw.textContent = pi.warn; pw.hidden = false; } else pw.hidden = true;

  // realca preset (por data-key, pois os chips sao um subconjunto dos PRESETS)
  document.querySelectorAll(".preset[data-key]").forEach((el) => {
    const active = el.dataset.key === appState.preset;
    el.classList.toggle("is-active", active);
    el.setAttribute("aria-checked", String(active));
  });
}

// --------------------------- resumo ---------------------------
export function updateSummary() {
  const card = $("summaryCard");
  if (appState.files.length === 0) { card.hidden = true; return; }
  card.hidden = false;
  // Total SEMPRE pela soma de todos os arquivos (função pura testável).
  const { totalBytes, largestFileBytes, totalPages, remainingBytes } = calculateSelectedFilesSummary(appState.files);
  const order = appState.files.map((f) => f.name).join(" → ");
  const rows = [
    ["Modo", prettyMode(appState.mode)],
    ["Arquivos", `${appState.files.length} PDF(s)`],
    ["Tamanho total", formatBytes(totalBytes)],
    ["Maior arquivo", formatBytes(largestFileBytes)],
  ];
  if (totalPages > 0) rows.push(["Páginas (analisadas)", String(totalPages)]);
  if (modeNeedsCompression(appState.mode)) {
    rows.push(["Qualidade das imagens", appState.quality + "%"]);
    rows.push(["Resolução", dpiLabel(appState.dpi)]);
    rows.push(["Passadas", String(appState.passes)]);
  }
  rows.push(["Risco", riskLevel(appState.files)]);
  rows.push(["Limite restante (1 GB)", formatBytes(remainingBytes)]);
  rows.push(["Processamento", "local no navegador"]);
  if (appState.files.length > 1) rows.push(["Ordem", order.length > 60 ? order.slice(0, 60) + "…" : order]);

  $("summaryGrid").innerHTML = rows.map(([k, v]) => `<span><b>${k}:</b> ${escapeHtml(String(v))}</span>`).join("");
}

// --------------------------- dropzone / upload ---------------------------
export function updateUploadUI() {
  const multi = modeAllowsMultiple(appState.mode);
  $("fileInput").multiple = multi;
  $("dropTitle").textContent = multi
    ? "Arraste seus PDFs aqui ou clique para escolher"
    : "Arraste seu PDF aqui ou clique para escolher";
}

// --------------------------- botao principal ---------------------------
export function updateStartButton() {
  const btn = $("startBtn");
  const label = $("startBtnLabel");
  const n = appState.files.length;
  const validation = n > 0 ? validateSelection(appState.files) : { level: "ok" };

  if (appState.status === "processing") { btn.disabled = true; label.textContent = "Processando localmente…"; return; }
  if (n === 0) { btn.disabled = true; label.textContent = "Selecione PDFs para continuar"; return; }
  if (validation.level === "block") { btn.disabled = true; label.textContent = "Seleção muito grande"; return; }
  if (modeAllowsMultiple(appState.mode) && n < 2) { btn.disabled = true; label.textContent = "Selecione 2 ou mais PDFs"; return; }

  btn.disabled = false;
  label.textContent = {
    compress: "Comprimir PDF",
    merge: "Juntar PDFs",
    merge_then_compress: "Juntar e comprimir",
    compress_then_merge: "Comprimir e juntar",
  }[appState.mode];
}

// --------------------------- banner ---------------------------
export function showBanner(type, message) { const b = $("banner"); b.className = "banner banner--" + type; b.textContent = message; b.hidden = false; }
export function hideBanner() { $("banner").hidden = true; }

// --------------------------- progresso / etapas ---------------------------
export function renderSteps() {
  const box = $("steps");
  box.innerHTML = "";
  for (const [id, label] of STEPS[appState.mode]) {
    const d = document.createElement("div");
    d.className = "step"; d.dataset.step = id;
    d.innerHTML = `<span class="step__dot"></span><div><b>${label}</b></div>`;
    box.appendChild(d);
  }
}
export function setStep(step, status) {
  const node = document.querySelector(`.step[data-step="${step}"]`);
  if (!node) return;
  node.classList.remove("is-done", "is-active", "is-paused", "is-error");
  if (status === "done") node.classList.add("is-done");
  else if (status === "active") node.classList.add("is-active");
  else if (status === "paused") node.classList.add("is-paused");
  else if (status === "error") node.classList.add("is-error");
}
export function markActiveStepsPaused(paused) {
  document.querySelectorAll(".step.is-active").forEach((n) => n.classList.toggle("is-paused", paused));
}

// Progresso GLOBAL e MONOTÔNICO: o valor exibido nunca diminui durante uma
// tarefa. As fases internas (passadas, repeticoes por qualidade) podem reemitir
// fracoes menores; aqui travamos no maior valor ja alcancado para a barra nunca
// "voltar". Reiniciado a cada novo processamento em showProgress().
let lastProgressFrac = 0;
export function resetProgress() { lastProgressFrac = 0; }

export function showProgress() {
  $("progressCard").hidden = false;
  $("resultCard").hidden = true;
  renderSteps();
  setStep("loaded", "active");
  lastProgressFrac = 0;                 // zera a trava antes de iniciar
  setProgress(0.02, "Carregando arquivos no navegador…");
  $("progressDetail").textContent = "";
  $("pauseBtn").hidden = false; $("resumeBtn").hidden = true;
  $("progressCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Única função responsável por mover a barra. Garante 0..100 e monotonicidade.
export function setProgress(fraction, label) {
  let f = Math.max(0, Math.min(1, fraction || 0));
  if (f < lastProgressFrac) f = lastProgressFrac;   // trava: nunca regride
  lastProgressFrac = f;
  const pct = Math.round(f * 100);
  $("progressFill").style.width = pct + "%";
  $("progressPercent").textContent = pct + "% concluído";
  if (label) $("progressStepLabel").textContent = label;
}
export function setProgressDetail(data) {
  const parts = [];
  if (data.totalFiles > 1 && data.fileIndex != null) parts.push(`Processando arquivo ${data.fileIndex + 1} de ${data.totalFiles}`);
  if (data.fileName) parts.push(data.fileName);
  if (data.pass) parts.push(`Passada ${data.pass} de ${data.totalPasses}`);
  if (data.page && data.totalPages) parts.push(`Página ${data.page} de ${data.totalPages}`);
  $("progressDetail").textContent = parts.join(" · ");
}
export function setPausedUI(paused) {
  $("pauseBtn").hidden = paused; $("resumeBtn").hidden = !paused;
  $("progressStepLabel").textContent = paused ? "Processamento pausado. Você pode retomar de onde parou." : $("progressStepLabel").textContent;
  markActiveStepsPaused(paused);
}

// --------------------------- timer ---------------------------
let timerId = null, startedAt = 0, pausedAccum = 0, pauseStart = 0, lastBytesBase = 0;
export function startTimer(originalSize) {
  startedAt = Date.now(); pausedAccum = 0; pauseStart = 0; lastBytesBase = originalSize || 0;
  timerId = setInterval(() => {
    const elapsed = Date.now() - startedAt - pausedAccum - (pauseStart ? Date.now() - pauseStart : 0);
    $("elapsedTime").textContent = formatTime(elapsed);
    const frac = parseFloat($("progressFill").style.width) / 100 || 0;
    $("remainingTime").textContent = frac > 0.02 ? formatTime(elapsed * (1 - frac) / frac) : "--:--:--";
  }, 500);
}
export function pauseTimer() { if (!pauseStart) pauseStart = Date.now(); }
export function resumeTimer() { if (pauseStart) { pausedAccum += Date.now() - pauseStart; pauseStart = 0; } }
export function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
export function elapsedMs() { return Date.now() - startedAt - pausedAccum - (pauseStart ? Date.now() - pauseStart : 0); }
export function setSpeed(kbps) { $("speed").textContent = kbps != null ? `${kbps.toFixed(1)} KB/s` : "—"; }

// --------------------------- resultado ---------------------------
export function showResult(stats, result) {
  $("progressCard").hidden = true;
  $("resultCard").hidden = false;

  const reduction = stats.initialSize > 0 ? ((stats.initialSize - stats.finalSize) / stats.initialSize) * 100 : 0;
  const saving = Math.max(0, stats.initialSize - stats.finalSize);
  const cards = [
    ["Modo", prettyMode(stats.mode)],
    ["Tamanho original", formatBytes(stats.initialSize)],
    ["Tamanho final", formatBytes(stats.finalSize)],
    ["Redução", `${Math.max(0, reduction).toFixed(0)}%`],
    ["Economia", formatBytes(saving)],
    ["Tempo total", formatTime(result.totalTime || 0)],
  ];
  if (stats.totalPages) cards.push(["Páginas", String(stats.totalPages)]);
  if (stats.filesProcessed) cards.push(["Arquivos", String(stats.filesProcessed)]);
  if (modeNeedsCompression(stats.mode)) { cards.push(["Qualidade", stats.quality + "%"]); cards.push(["DPI", dpiLabel(stats.dpi ?? 144)]); cards.push(["Passadas", String(stats.passes)]); }

  $("resultGrid").innerHTML = cards.map(([k, v]) =>
    `<div class="compare__card"><small>${k}</small><strong${/Redução|Economia/.test(k) ? ' class="text-green"' : ""}>${escapeHtml(String(v))}</strong></div>`
  ).join("");

  const note = $("resultNote");
  if (modeNeedsCompression(stats.mode) && reduction < 1) {
    note.hidden = false;
    note.textContent = "A redução foi pequena: estes PDFs têm pouco conteúdo recompressível. O resultado depende da estrutura dos arquivos.";
  } else note.hidden = true;

  $("changeOrderBtn").hidden = appState.files.length < 2;
  $("downloadBtn").href = result.url;
  $("downloadBtn").download = result.name;
  $("resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// --------------------------- logs ---------------------------
export function addLog(type, message) {
  const time = new Date().toTimeString().slice(0, 8);
  const line = document.createElement("div");
  line.innerHTML = `<span class="lg-time">[${time}]</span> <span class="lg-${type.toLowerCase()}">${type}:</span> ${escapeHtml(message)}`;
  $("log").appendChild(line);
  $("log").scrollTop = $("log").scrollHeight;
}
export function clearLog() { $("log").innerHTML = ""; }
export function updateTechSummary() {
  $("techSummary").textContent =
    `Modo: ${prettyMode(appState.mode)} · Arquivos: ${appState.files.length} · ` +
    (modeNeedsCompression(appState.mode) ? `Qualidade ${appState.quality}% · ${dpiLabel(appState.dpi)} · Passadas ${appState.passes} · ` : "") +
    `Processamento local no navegador`;
}

// --------------------------- modais / tema ---------------------------
let lastFocused = null;
export function openModal(id) {
  const o = $(id); if (!o) return;
  lastFocused = document.activeElement;
  o.hidden = false; document.body.style.overflow = "hidden";
  o.querySelector(".modal__close, .btn")?.focus();
}
export function closeModal(o) { if (!o) return; o.hidden = true; document.body.style.overflow = ""; if (lastFocused?.focus) lastFocused.focus(); }
function closeAllModals() { document.querySelectorAll(".modal-overlay:not([hidden])").forEach(closeModal); }

function bindModals() {
  document.querySelectorAll("[data-modal]").forEach((t) => t.addEventListener("click", () => openModal(t.dataset.modal)));
  document.querySelectorAll(".modal-overlay").forEach((o) => {
    o.addEventListener("click", (e) => { if (e.target === o) closeModal(o); });
    o.querySelector(".modal__close")?.addEventListener("click", () => closeModal(o));
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllModals(); });
}

export function initTheme() {
  initSharedTheme();
}

// --------------------------- bind geral ---------------------------
export function initUI(handlers) {
  H = handlers;
  initTheme();
  renderModes(); renderPresets(); updateConfigUI(); updateUploadUI(); updateStartButton();
  bindModals();

  bindThemeToggle($("themeToggle"));

  // navegacao mobile (hamburger)
  const navToggle = $("navToggle");
  const siteNav = $("siteNav");
  if (navToggle && siteNav) {
    const setNav = (open) => {
      siteNav.classList.toggle("is-open", open);
      navToggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("nav-open", open);
    };
    navToggle.addEventListener("click", () => setNav(!siteNav.classList.contains("is-open")));
    siteNav.querySelectorAll("a, button").forEach((el) => el.addEventListener("click", () => setNav(false)));
  }

  // botoes "Selecionar PDFs" do hero abrem o seletor de arquivos
  document.querySelectorAll("[data-pick-files]").forEach((b) =>
    b.addEventListener("click", () => $("fileInput").click()));

  // FAQ: "Ver todas as perguntas" revela as demais
  const faqMore = $("faqMore");
  if (faqMore) faqMore.addEventListener("click", () => {
    document.querySelectorAll(".faq--rest").forEach((el) => (el.hidden = false));
    faqMore.hidden = true;
  });

  // upload
  const dz = $("dropzone"), fi = $("fileInput");
  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
  fi.addEventListener("change", (e) => { if (e.target.files.length) H.onFilesAdded(e.target.files); fi.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-dragover"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-dragover"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) H.onFilesAdded(e.dataTransfer.files); });

  // lista
  $("sortName").addEventListener("click", () => H.onSortName());
  $("sortSize").addEventListener("click", () => H.onSortSize());
  $("restoreOrder").addEventListener("click", () => H.onRestoreOrder());
  $("clearList").addEventListener("click", () => H.onClearList());

  // config
  $("qualityRange").addEventListener("input", (e) => H.onQualityInput(Number(e.target.value)));
  $("dpiPreset")?.addEventListener("change", (e) => H.onDpiPreset(e.target.value));
  $("dpiCustom")?.addEventListener("input", (e) => H.onCustomDpi(Number(e.target.value)));
  $("passesValue").addEventListener("input", (e) => H.onPassesInput(Number(e.target.value)));
  $("passesMinus").addEventListener("click", () => H.onPassesInput(appState.passes - 1));
  $("passesPlus").addEventListener("click", () => H.onPassesInput(appState.passes + 1));

  // acao + progresso
  $("startBtn").addEventListener("click", () => H.onStart());
  $("pauseBtn").addEventListener("click", () => H.onPause());
  $("resumeBtn").addEventListener("click", () => H.onResume());
  $("stopBtn").addEventListener("click", () => openModal("modalStopConfirm"));
  $("confirmStopBtn").addEventListener("click", () => { closeAllModals(); H.onStop(); });
  $("cancelStopBtn").addEventListener("click", () => closeAllModals());

  // resultado
  $("downloadBtn").addEventListener("click", () => H.onDownload());
  $("processAgainBtn").addEventListener("click", () => H.onProcessAgain());
  $("changeOrderBtn").addEventListener("click", () => H.onChangeOrder());

  // tech
  $("techToggle").addEventListener("click", () => {
    const open = $("techBody").hidden;
    $("techBody").hidden = !open;
    $("techToggle").setAttribute("aria-expanded", String(open));
  });
}

// --------------------------- util interno ---------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function refreshAll() {
  renderModes(); updateUploadUI(); renderFileList(); updateConfigUI(); updateSummary(); updateStartButton(); updateTechSummary();
}
