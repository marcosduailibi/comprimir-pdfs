import { bindThemeToggle, initTheme } from "../theme.js?v=14";
import { showToast } from "../utils.js?v=10";
import { recordComplete, recordOpen } from "./stores.js?v=10";
import { getSupportedOutputFormats, outputFormatForFile, outputFormatIds } from "../image/image-formats.js";
import { DEFAULT_IMAGE_OPTIONS, IMAGE_PRESETS, mergePresetOptions, normalizeQuality } from "../image/image-quality.js";
import { calculateOutputSize, resizeSummary } from "../image/image-resize.js";
import { friendlyImageError, validateImageFile } from "../image/image-errors.js";
import { buildOutputName, compressImageFile, decodeImage, formatBytes, reductionPercent } from "../image/image-compressor.js";
import { canUseImageWorker, createImageCompressionWorker } from "../image/image-worker-client.js";
import { createZipBlob } from "../image/zip.js";

const PREF_KEY = "arqkit.imageCompress.preferences.v1";
const MAX_FILES = 500;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_SINGLE_BYTES = 1024 * 1024 * 1024;

const IMAGE_MODE = window.location.hash.includes("convert-image") ? "convert-image" : "compress-image";
const IMAGE_ACTION_LABEL = IMAGE_MODE === "convert-image" ? "Converter imagens" : "Comprimir imagens";
const IMAGE_RUNNING_LABEL = IMAGE_MODE === "convert-image" ? "Convertendo..." : "Comprimindo...";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let state = {
  items: [],
  selectedId: null,
  options: loadPrefs(),
  running: false,
  cancelRequested: false,
  workerClient: null,
  previewMode: "result",
  startedAt: 0,
};

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    return { ...DEFAULT_IMAGE_OPTIONS, ...saved };
  } catch {
    return { ...DEFAULT_IMAGE_OPTIONS };
  }
}

function savePrefs() {
  const { preset, outputFormat, quality, resizeMode, maxWidth, maxHeight, longEdge, scalePercent, backgroundColor, removeMetadata, preventLarger } = state.options;
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      preset,
      outputFormat,
      quality,
      resizeMode,
      maxWidth,
      maxHeight,
      longEdge,
      scalePercent,
      backgroundColor,
      removeMetadata,
      preventLarger,
    }));
  } catch {
    // Private browsing/quota: ignore. Never store files or file names.
  }
}

function uniqueId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function statusText(item) {
  const map = {
    queued: "aguardando",
    reading: "lendo dimensoes",
    ready: "pronta para comprimir",
    processing: "processando",
    done: "concluida",
    error: "erro",
  };
  return map[item.status] || item.status;
}

function itemMeta(item) {
  const size = formatBytes(item.originalBytes);
  const dims = item.width && item.height ? `${item.width}x${item.height}` : "dimensoes pendentes";
  const type = (item.type || "imagem").replace("image/", "").toUpperCase();
  return `${size} · ${dims} · ${type}`;
}

function itemResultMeta(item) {
  if (item.status === "error") return item.error || "Falha ao processar.";
  if (item.status !== "done") return "Resultado pendente.";
  const pct = item.reduction > 0 ? `-${item.reduction}%` : "sem reducao";
  const extra = item.keptOriginal ? " · manteve menor arquivo" : "";
  return `Resultado: ${formatBytes(item.outputBytes)} · ${pct}${extra}`;
}

function revokeItemUrls(item) {
  if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  item.thumbnailUrl = "";
  item.resultUrl = "";
}

function totalOriginalBytes() {
  return state.items.reduce((sum, item) => sum + item.originalBytes, 0);
}

function completedItems() {
  return state.items.filter((item) => item.status === "done" && item.resultBlob);
}

function currentItem() {
  return state.items.find((item) => item.id === state.selectedId) || state.items[0] || null;
}

function setLive(message) {
  const live = $("#imageLive");
  if (live) live.textContent = message;
}

function setError(message) {
  const error = $("#imageInputError");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message || "";
}

function populateFormats() {
  const select = $("#outputFormat");
  if (!select) return;
  const formats = getSupportedOutputFormats();
  select.innerHTML = "";
  formats.forEach((format) => {
    const option = document.createElement("option");
    option.value = format.id;
    option.textContent = format.label;
    select.appendChild(option);
  });
  if (!formats.some((format) => format.id === state.options.outputFormat)) {
    state.options.outputFormat = "original";
  }
  select.value = state.options.outputFormat;
}

function syncControlsFromState() {
  $("#compressionPreset").value = state.options.preset;
  $("#outputFormat").value = state.options.outputFormat;
  $("#qualityRange").value = Math.round(normalizeQuality(state.options.quality) * 100);
  $("#qualityValue").textContent = `${$("#qualityRange").value}%`;
  $("#resizeMode").value = state.options.resizeMode;
  $("#maxWidth").value = state.options.maxWidth || "";
  $("#maxHeight").value = state.options.maxHeight || "";
  $("#longEdge").value = state.options.longEdge || "";
  $("#scalePercent").value = state.options.scalePercent || 100;
  $("#backgroundColor").value = state.options.backgroundColor || "#ffffff";
  $("#removeMetadata").checked = state.options.removeMetadata !== false;
  $("#preventLarger").checked = state.options.preventLarger !== false;
  updateHints();
}

function readControlsIntoState() {
  state.options = {
    ...state.options,
    preset: $("#compressionPreset").value,
    outputFormat: $("#outputFormat").value,
    quality: normalizeQuality($("#qualityRange").value),
    resizeMode: $("#resizeMode").value,
    maxWidth: Number($("#maxWidth").value) || 0,
    maxHeight: Number($("#maxHeight").value) || 0,
    longEdge: Number($("#longEdge").value) || 0,
    scalePercent: Number($("#scalePercent").value) || 100,
    backgroundColor: $("#backgroundColor").value || "#ffffff",
    removeMetadata: $("#removeMetadata").checked,
    preventLarger: $("#preventLarger").checked,
  };
  savePrefs();
  updateHints();
  renderList();
  renderPreview();
}

function applyPreset(presetId) {
  state.options = mergePresetOptions(state.options, presetId);
  syncControlsFromState();
  savePrefs();
  renderList();
}

function updateHints() {
  const format = $("#outputFormat")?.value || "original";
  const hint = $("#formatHint");
  const warning = $("#transparencyWarning");
  if (hint) {
    hint.textContent = {
      original: "Mantem o formato quando o navegador consegue gerar esse formato; GIF/BMP podem sair como WebP ou JPG.",
      jpeg: "JPG e bom para fotos e arquivos menores, mas nao suporta transparencia.",
      png: "PNG preserva transparencia, mas pode reduzir pouco sem redimensionar.",
      webp: "WebP equilibra qualidade, tamanho e transparencia quando suportado.",
      avif: "AVIF pode gerar arquivos menores, mas depende do navegador.",
    }[format] || "";
  }
  if (warning) warning.hidden = format !== "jpeg";
}

async function readImageDimensions(item) {
  item.status = "reading";
  renderList();
  try {
    const bitmap = await decodeImage(item.file);
    item.width = bitmap.width;
    item.height = bitmap.height;
    if (typeof bitmap.close === "function") bitmap.close();
    item.status = "ready";
  } catch (error) {
    item.status = "error";
    item.error = friendlyImageError(error);
  }
  renderList();
  renderPreview();
}

function addFiles(fileList) {
  setError("");
  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;
  const accepted = [];
  let total = totalOriginalBytes();

  for (const file of incoming) {
    if (state.items.length + accepted.length >= MAX_FILES) {
      setError(`Limite de ${MAX_FILES} imagens atingido.`);
      break;
    }
    try {
      validateImageFile(file, { maxBytes: MAX_SINGLE_BYTES });
      if (total + file.size > MAX_TOTAL_BYTES) {
        setError("A soma das imagens passa de 1 GB. Remova alguns arquivos para continuar.");
        break;
      }
      total += file.size;
      accepted.push(file);
    } catch (error) {
      setError(`${file.name || "Arquivo"}: ${friendlyImageError(error)}`);
    }
  }

  for (const file of accepted) {
    const item = {
      id: uniqueId(),
      file,
      name: file.name || "imagem",
      type: file.type || "",
      originalBytes: file.size || 0,
      width: 0,
      height: 0,
      outputBytes: 0,
      reduction: 0,
      status: "queued",
      error: "",
      thumbnailUrl: URL.createObjectURL(file),
      resultUrl: "",
      resultBlob: null,
      outputName: "",
      keptOriginal: false,
    };
    state.items.push(item);
    if (!state.selectedId) state.selectedId = item.id;
    readImageDimensions(item);
  }

  renderAll();
  if (accepted.length) setLive(`${accepted.length} imagem(ns) recebida(s).`);
}

function removeItem(id) {
  const index = state.items.findIndex((item) => item.id === id);
  if (index < 0) return;
  revokeItemUrls(state.items[index]);
  state.items.splice(index, 1);
  if (state.selectedId === id) state.selectedId = state.items[0]?.id || null;
  renderAll();
}

function clearAll() {
  if (state.workerClient) {
    state.workerClient.cancel();
    state.workerClient = null;
  }
  state.cancelRequested = true;
  state.running = false;
  state.items.forEach(revokeItemUrls);
  state.items = [];
  state.selectedId = null;
  $("#imageInput").value = "";
  $("#imageResults").hidden = true;
  $("#imageProgressCard").hidden = true;
  setError("");
  setLive("Arquivos temporarios limpos.");
  renderAll();
}

function optionsForItem(item) {
  const supportedFormats = outputFormatIds();
  const outputFormat = outputFormatForFile(item.file, state.options.outputFormat, supportedFormats);
  return {
    ...state.options,
    outputFormat: outputFormat.id,
    supportedFormats,
    maxSingleFileSizeBytes: MAX_SINGLE_BYTES,
  };
}

function resetItemResult(item) {
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  item.resultUrl = "";
  item.resultBlob = null;
  item.outputBytes = 0;
  item.reduction = 0;
  item.outputName = "";
  item.keptOriginal = false;
  if (item.status !== "error") item.status = "ready";
}

function progressMessage(processed, total, item = null) {
  const elapsed = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;
  const completed = completedItems();
  const original = completed.reduce((sum, it) => sum + it.originalBytes, 0);
  const output = completed.reduce((sum, it) => sum + it.outputBytes, 0);
  const saved = Math.max(0, original - output);
  const current = item ? ` Processando ${item.name}.` : "";
  return `Processando localmente no navegador. ${processed} de ${total} imagem(ns). ${elapsed}s decorridos. Economia acumulada: ${formatBytes(saved)}.${current}`;
}

function updateProgress(processed, total, item = null) {
  const card = $("#imageProgressCard");
  const progress = $("#imageProgress");
  const text = $("#progressText");
  if (!card || !progress || !text) return;
  card.hidden = false;
  progress.value = total ? Math.round((processed / total) * 100) : 0;
  text.textContent = progressMessage(processed, total, item);
}

function applyImageModeCopy() {
  if (IMAGE_MODE !== "convert-image") return;
  document.title = "Converter imagem | ArqKit";
  const title = $("#imageToolTitle");
  if (title) title.textContent = "Converter imagem";
  const breadcrumb = document.querySelector(".ak-breadcrumb span:last-child");
  if (breadcrumb) breadcrumb.textContent = "Converter imagem";
  const heroText = document.querySelector(".image-tool-hero p:not(.ak-kicker):not(.image-privacy-note)");
  if (heroText) heroText.textContent = "Converta imagens entre JPG, PNG, WebP e AVIF quando o navegador suportar, sem enviar arquivos para servidor.";
  const uploadTitle = $("#uploadTitle");
  if (uploadTitle) uploadTitle.textContent = "1. Adicione imagens para converter";
  const again = $("#compressAgain");
  if (again) again.textContent = "Converter novamente";
}

async function compressOne(item, client) {
  item.status = "processing";
  item.error = "";
  renderList();
  const options = optionsForItem(item);
  const result = client ? await client.compress(item.file, options) : await compressImageFile(item.file, options);
  item.resultBlob = result.blob;
  item.outputBytes = result.outputBytes;
  item.reduction = result.reduction;
  item.width = result.width;
  item.height = result.height;
  item.outputName = result.outputName || buildOutputName(item.name, result.extension);
  item.keptOriginal = result.keptOriginal;
  item.resultUrl = URL.createObjectURL(result.blob);
  item.status = "done";
}

async function runCompression() {
  const ready = state.items.filter((item) => item.status === "ready" || item.status === "done");
  if (!ready.length || state.running) return;

  try { recordOpen(IMAGE_MODE); } catch {}
  state.running = true;
  state.cancelRequested = false;
  state.startedAt = Date.now();
  $("#compressImages").textContent = IMAGE_RUNNING_LABEL;
  $("#compressImages").disabled = true;
  $("#cancelCompression").hidden = false;
  $("#imageResults").hidden = true;
  ready.forEach(resetItemResult);
  updateProgress(0, ready.length);
  $("#imageProgressCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
  showToast(IMAGE_MODE === "convert-image"
    ? "Conversao iniciada. Acompanhe o progresso abaixo."
    : "Compressao iniciada. Acompanhe o progresso abaixo.", "info");

  const useWorker = canUseImageWorker();
  let client = null;
  if (useWorker) {
    try { client = createImageCompressionWorker(); }
    catch { client = null; }
  }
  state.workerClient = client;
  let processed = 0;

  for (const item of ready) {
    if (state.cancelRequested) break;
    updateProgress(processed, ready.length, item);
    try {
      await compressOne(item, client);
    } catch (error) {
      item.status = state.cancelRequested ? "ready" : "error";
      item.error = state.cancelRequested ? "" : friendlyImageError(error);
    }
    processed += 1;
    updateProgress(processed, ready.length, item);
    renderList();
    renderPreview();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (client) client.close();
  state.workerClient = null;
  state.running = false;
  $("#cancelCompression").hidden = true;
  $("#compressImages").disabled = false;
  $("#compressImages").textContent = IMAGE_ACTION_LABEL;

  if (state.cancelRequested) {
    $("#imageProgressCard").hidden = true;
    setLive("Compressao cancelada. Os temporarios foram limpos.");
    showToast("Compressao cancelada.", "info");
    renderAll();
    return;
  }

  try { recordComplete(IMAGE_MODE); } catch {}
  setLive("Compressao concluida.");
  renderResults();
  renderAll();
}

function cancelCompression() {
  state.cancelRequested = true;
  if (state.workerClient) state.workerClient.cancel();
}

function renderList() {
  const root = $("#imageList");
  const count = $("#fileCountLabel");
  const compressButton = $("#compressImages");
  const clearButton = $("#clearImages");
  if (!root) return;

  if (count) {
    const total = formatBytes(totalOriginalBytes());
    count.textContent = state.items.length ? `${state.items.length} imagem(ns) · ${total}` : "Nenhuma imagem adicionada.";
  }

  if (compressButton) {
    const hasReady = state.items.some((item) => item.status === "ready" || item.status === "done");
    compressButton.disabled = state.running || !hasReady;
    if (!state.running) compressButton.textContent = hasReady ? IMAGE_ACTION_LABEL : "Selecione imagens para continuar";
  }
  if (clearButton) clearButton.disabled = state.running || state.items.length === 0;

  if (!state.items.length) {
    root.innerHTML = '<div class="image-empty">As imagens selecionadas aparecem aqui.</div>';
    return;
  }

  root.innerHTML = state.items.map((item) => `
    <article class="image-file-card ${item.id === state.selectedId ? "is-selected" : ""}" data-id="${escapeHtml(item.id)}">
      <img src="${escapeHtml(item.thumbnailUrl)}" alt="Previa de ${escapeHtml(item.name)}" loading="lazy" />
      <div class="image-file-main">
        <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(itemMeta(item))}</span>
        <span class="image-file-status ${item.status === "done" ? "is-done" : item.status === "error" ? "is-error" : ""}">${escapeHtml(statusText(item))}</span>
        <span>${escapeHtml(itemResultMeta(item))}</span>
      </div>
      <div class="image-file-actions">
        ${item.status === "done" ? `<button class="btn btn--primary btn--sm" type="button" data-action="download">Baixar imagem</button>` : ""}
        <button class="btn btn--ghost btn--sm" type="button" data-action="select">Previa</button>
        <button class="btn btn--ghost btn--sm" type="button" data-action="remove" aria-label="Remover ${escapeHtml(item.name)}">Remover</button>
      </div>
    </article>
  `).join("");
}

function renderPreview() {
  const item = currentItem();
  const original = $("#originalPreview");
  const result = $("#resultPreview");
  const meta = $("#previewMeta");
  const toggle = $("#togglePreview");
  if (!original || !result || !meta || !toggle) return;

  if (!item) {
    original.removeAttribute("src");
    result.removeAttribute("src");
    original.alt = "";
    result.alt = "";
    meta.textContent = "Selecione uma imagem para comparar original e resultado.";
    toggle.disabled = true;
    return;
  }

  original.src = item.thumbnailUrl;
  original.alt = `Original de ${item.name}`;
  if (item.resultUrl) {
    result.src = item.resultUrl;
    result.alt = `Resultado de ${item.name}`;
    toggle.disabled = false;
  } else {
    result.removeAttribute("src");
    result.alt = "";
    toggle.disabled = true;
  }

  let estimated = "";
  try {
    if (item.width && item.height) estimated = ` · Saida estimada: ${resizeSummary(calculateOutputSize(item.width, item.height, state.options))}`;
  } catch {}
  meta.textContent = `${item.name} · ${itemMeta(item)}${estimated}`;
}

function renderResults() {
  const done = completedItems();
  const box = $("#imageResults");
  const summary = $("#resultSummary");
  if (!box || !summary) return;
  if (!done.length) {
    box.hidden = true;
    return;
  }

  const original = done.reduce((sum, item) => sum + item.originalBytes, 0);
  const output = done.reduce((sum, item) => sum + item.outputBytes, 0);
  const saved = Math.max(0, original - output);
  const pct = reductionPercent(original, output);
  const format = $("#outputFormat")?.selectedOptions?.[0]?.textContent || "Configurado";
  const quality = `${Math.round(normalizeQuality(state.options.quality) * 100)}%`;

  summary.innerHTML = [
    ["Imagens", String(done.length)],
    ["Original", formatBytes(original)],
    ["Final", formatBytes(output)],
    ["Economia", `${formatBytes(saved)} · ${pct > 0 ? `-${pct}%` : "sem reducao"}`],
    ["Formato", format],
    ["Qualidade", quality],
    ["Dimensoes", state.options.resizeMode === "none" ? "Sem redimensionar" : state.options.resizeMode],
    ["Privacidade", "Processado no navegador"],
  ].map(([label, value]) => `
    <div class="image-summary-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("");

  $("#downloadAll").hidden = done.length < 2;
  $("#downloadSingle").hidden = done.length !== 1;
  box.hidden = false;
}

function renderAll() {
  renderList();
  renderPreview();
  renderResults();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function downloadAllZip() {
  const done = completedItems();
  if (done.length < 2) return;
  $("#downloadAll").disabled = true;
  $("#downloadAll").textContent = "Preparando ZIP...";
  try {
    const zip = await createZipBlob(done.map((item) => ({ name: item.outputName, blob: item.resultBlob })));
    downloadBlob(zip, "imagens-comprimidas.zip");
  } finally {
    $("#downloadAll").disabled = false;
    $("#downloadAll").textContent = "Baixar tudo em ZIP";
  }
}

function downloadSingle() {
  const item = completedItems()[0];
  if (item) downloadBlob(item.resultBlob, item.outputName);
}

function bindDropzone() {
  const drop = $("#imageDropzone");
  const input = $("#imageInput");
  const pick = $("#pickImages");
  if (!drop || !input || !pick) return;

  const openPicker = () => input.click();
  drop.addEventListener("click", (event) => {
    if (event.target !== pick) openPicker();
  });
  pick.addEventListener("click", (event) => {
    event.stopPropagation();
    openPicker();
  });
  drop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  });
  input.addEventListener("change", () => addFiles(input.files));

  ["dragenter", "dragover"].forEach((name) => {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((name) => {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove("is-dragover");
    });
  });
  drop.addEventListener("drop", (event) => addFiles(event.dataTransfer?.files));
}

function bindControls() {
  populateFormats();
  syncControlsFromState();

  $("#compressionPreset").addEventListener("change", (event) => applyPreset(event.target.value));
  $("#qualityRange").addEventListener("input", (event) => {
    state.options.preset = "custom";
    state.options.quality = normalizeQuality(event.target.value);
    $("#qualityValue").textContent = `${event.target.value}%`;
    $("#compressionPreset").value = "custom";
    savePrefs();
  });
  ["outputFormat", "resizeMode", "maxWidth", "maxHeight", "longEdge", "scalePercent", "backgroundColor", "removeMetadata", "preventLarger"].forEach((id) => {
    $(`#${id}`).addEventListener("input", readControlsIntoState);
    $(`#${id}`).addEventListener("change", readControlsIntoState);
  });

  $("#compressImages").addEventListener("click", runCompression);
  $("#cancelCompression").addEventListener("click", cancelCompression);
  $("#clearImages").addEventListener("click", clearAll);
  $("#downloadAll").addEventListener("click", downloadAllZip);
  $("#downloadSingle").addEventListener("click", downloadSingle);
  $("#compressAgain").addEventListener("click", () => {
    state.items.forEach((item) => { if (item.status === "done") resetItemResult(item); });
    $("#imageResults").hidden = true;
    $("#imageProgressCard").hidden = true;
    renderAll();
  });
  $("#togglePreview").addEventListener("click", () => {
    const result = $("#resultPreview");
    if (!result?.src) return;
    state.previewMode = state.previewMode === "result" ? "original" : "result";
    result.style.opacity = state.previewMode === "result" ? "1" : "0.24";
  });

  $("#imageList").addEventListener("click", (event) => {
    const card = event.target.closest(".image-file-card");
    if (!card) return;
    const item = state.items.find((entry) => entry.id === card.dataset.id);
    if (!item) return;
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "remove") removeItem(item.id);
    else if (action === "download" && item.resultBlob) downloadBlob(item.resultBlob, item.outputName);
    else {
      state.selectedId = item.id;
      renderAll();
    }
  });
}

function bindHeader() {
  bindThemeToggle($("#themeToggle"));
  const nav = $("#siteNav");
  const toggle = $("#navToggle");
  if (!nav || !toggle) return;
  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-open", open);
  };
  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function init() {
  initTheme();
  applyImageModeCopy();
  bindHeader();
  bindDropzone();
  bindControls();
  renderAll();
  try { recordOpen(IMAGE_MODE); } catch {}
  if (!canUseImageWorker()) {
    $("#progressText").textContent = "Web Worker indisponivel; a compressao usara fila local no navegador.";
  }
}

window.addEventListener("beforeunload", () => {
  state.items.forEach(revokeItemUrls);
  if (state.workerClient) state.workerClient.close();
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
