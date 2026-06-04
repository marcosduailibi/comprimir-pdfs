// camera-to-pdf-tool.js
// Ferramenta mobile-first para gerar PDF local a partir da camera ou imagens.

import { CAMERA_STATES, isLikelyMobile, mapCameraError, requestEnvironmentCamera, stopCameraStream } from "../camera/camera-controller.js?v=10";
import { captureFrame, createPageFromBlob, createPagesFromFiles } from "../camera/capture.js?v=10";
import { IMAGE_PRESETS, normalizeRotation } from "../camera/image-editor.js?v=10";
import { generatePdfFromImagePages } from "../camera/pdf-generator.js?v=10";
import { formatBytes, safeImageName, setLiveStatus } from "../camera/camera-ui.js?v=10";
import { bindThemeToggle } from "../theme.js?v=11";
import { recordOpen, recordComplete } from "./stores.js?v=10";

const $ = (id) => document.getElementById(id);

const state = {
  status: CAMERA_STATES.idle,
  stream: null,
  facingMode: "environment",
  pages: [],
  selectedId: null,
  resultUrl: null,
};

function setStatus(status, message = "") {
  state.status = status;
  document.body.dataset.cameraState = status;
  setLiveStatus($("cameraLive"), message);
}

function showError(err) {
  const info = mapCameraError(err);
  const box = $("cameraError");
  box.hidden = false;
  box.innerHTML = `<strong>${info.title}</strong><span>${info.action}</span>`;
  setStatus(CAMERA_STATES.error, info.title);
}

function clearError() {
  const box = $("cameraError");
  if (box) { box.hidden = true; box.textContent = ""; }
}

function cleanupResult() {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = null;
  $("cameraDownload").removeAttribute("href");
}

function cleanupPages() {
  state.pages.forEach((page) => URL.revokeObjectURL(page.url));
  state.pages = [];
  state.selectedId = null;
  cleanupResult();
  renderPages();
}

async function openCamera() {
  clearError();
  cleanupResult();
  setStatus(CAMERA_STATES.requestingPermission, "O navegador vai pedir permissão para usar a câmera.");
  try {
    stopCameraStream(state.stream);
    state.stream = await requestEnvironmentCamera();
    const video = $("cameraVideo");
    video.srcObject = state.stream;
    await video.play();
    $("cameraPanel").hidden = false;
    setStatus(CAMERA_STATES.cameraReady, "Câmera pronta. Posicione o documento e capture a página.");
  } catch (err) {
    stopCameraStream(state.stream);
    state.stream = null;
    showError(err);
  }
}

function closeCamera() {
  stopCameraStream(state.stream);
  state.stream = null;
  $("cameraVideo").srcObject = null;
  $("cameraPanel").hidden = true;
  setStatus(state.pages.length ? CAMERA_STATES.review : CAMERA_STATES.idle, state.pages.length ? "Revise suas páginas." : "Câmera desligada.");
}

async function capturePage() {
  const video = $("cameraVideo");
  if (!state.stream || !video.srcObject) return;
  clearError();
  setStatus(CAMERA_STATES.capturing, "Capturando página.");
  try {
    const frame = await captureFrame(video, { quality: Number($("cameraQuality").value) / 100 });
    const page = await createPageFromBlob(frame.blob, `captura-${state.pages.length + 1}.jpg`);
    page.preset = $("imagePreset").value;
    state.pages.push(page);
    state.selectedId = page.id;
    renderPages();
    setStatus(CAMERA_STATES.cameraReady, "Página capturada. Você pode capturar outra ou gerar o PDF.");
  } catch (err) {
    showError(err);
  }
}

async function importImages(files) {
  clearError();
  cleanupResult();
  setStatus(CAMERA_STATES.processingCapture, "Importando imagens localmente.");
  try {
    const pages = await createPagesFromFiles(files);
    pages.forEach((page) => {
      page.name = safeImageName(page.name);
      page.preset = $("imagePreset").value;
    });
    state.pages.push(...pages);
    if (pages[0]) state.selectedId = pages[0].id;
    renderPages();
    setStatus(CAMERA_STATES.review, pages.length ? "Revise, gire ou reorganize suas páginas." : "Nenhuma imagem compatível foi selecionada.");
  } catch (err) {
    showError(err);
  }
}

function selectedIndex() {
  return state.pages.findIndex((page) => page.id === state.selectedId);
}

function moveSelected(delta) {
  const i = selectedIndex();
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.pages.length) return;
  const [page] = state.pages.splice(i, 1);
  state.pages.splice(j, 0, page);
  renderPages();
}

function rotateSelected(delta) {
  const i = selectedIndex();
  if (i < 0) return;
  state.pages[i].rotation = normalizeRotation((state.pages[i].rotation || 0) + delta);
  renderPages();
}

function deleteSelected() {
  const i = selectedIndex();
  if (i < 0) return;
  const [page] = state.pages.splice(i, 1);
  URL.revokeObjectURL(page.url);
  state.selectedId = state.pages[Math.min(i, state.pages.length - 1)]?.id || null;
  cleanupResult();
  renderPages();
}

function applyPresetToSelected(value) {
  const i = selectedIndex();
  if (i < 0) return;
  state.pages[i].preset = value;
  renderPages();
}

function renderPages() {
  const list = $("cameraPages");
  const empty = $("cameraEmpty");
  const count = $("pageCount");
  const totalSize = state.pages.reduce((sum, page) => sum + (page.blob?.size || 0), 0);
  count.textContent = `${state.pages.length} página(s) · ${formatBytes(totalSize)}`;
  empty.hidden = state.pages.length > 0;
  list.innerHTML = "";

  state.pages.forEach((page, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "camera-page" + (page.id === state.selectedId ? " is-active" : "");
    item.setAttribute("aria-pressed", String(page.id === state.selectedId));
    item.innerHTML = `
      <span class="camera-page__thumb"><img src="${page.url}" alt=""></span>
      <span class="camera-page__meta"><strong>Página ${index + 1}</strong><small>${formatBytes(page.blob.size)} · ${page.rotation || 0}°</small></span>
    `;
    item.addEventListener("click", () => { state.selectedId = page.id; renderPages(); });
    list.appendChild(item);
  });

  const hasPages = state.pages.length > 0;
  $("generatePdf").disabled = !hasPages;
  $("clearPages").disabled = !hasPages;
  $("deletePage").disabled = !state.selectedId;
  $("movePageUp").disabled = selectedIndex() <= 0;
  $("movePageDown").disabled = selectedIndex() < 0 || selectedIndex() >= state.pages.length - 1;
  $("rotateLeft").disabled = !state.selectedId;
  $("rotateRight").disabled = !state.selectedId;
  $("selectedPageTools").hidden = !state.selectedId;
  $("cameraResults").hidden = !state.resultUrl;
}

function pdfQuality() {
  const raw = Number($("cameraQuality").value) || 84;
  return Math.max(0.35, Math.min(0.95, raw / 100));
}

async function generatePdf() {
  if (!state.pages.length) return;
  cleanupResult();
  setStatus(CAMERA_STATES.generatingPdf, "Gerando seu PDF localmente.");
  const progress = $("cameraProgress");
  progress.hidden = false;
  progress.textContent = "Preparando imagens.";
  $("generatePdf").disabled = true;
  try {
    const dpi = Number($("cameraDpi").value) || 144;
    const result = await generatePdfFromImagePages(state.pages, {
      pageSize: $("pageSize").value,
      orientation: $("pageOrientation").value,
      margin: $("pageMargin").value,
      fit: $("pageFit").value,
      quality: pdfQuality(),
      dpi,
    }, ({ index, total }) => {
      progress.textContent = `Processando página ${index} de ${total}.`;
    });

    state.resultUrl = URL.createObjectURL(result.blob);
    const download = $("cameraDownload");
    download.href = state.resultUrl;
    download.download = "documento-camera.pdf";
    $("resultStats").textContent = `${result.stats.pages} página(s) · ${formatBytes(result.stats.finalBytes)} · ${result.stats.dpi} DPI`;
    $("cameraResults").hidden = false;
    progress.hidden = true;
    try { recordComplete("camera-to-pdf"); } catch { /* optional */ }
    setStatus(CAMERA_STATES.done, "PDF criado com sucesso. Download preparado.");
  } catch (err) {
    progress.hidden = true;
    showError(err);
  } finally {
    $("generatePdf").disabled = state.pages.length === 0;
  }
}

function bind() {
  try { recordOpen("camera-to-pdf"); } catch { /* optional */ }
  bindThemeToggle($("themeToggle"));

  if (!isLikelyMobile()) $("computerNotice").hidden = false;

  IMAGE_PRESETS.forEach((preset) => {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.label;
    $("imagePreset").appendChild(opt);
  });
  $("imagePreset").value = "document";

  $("openCamera").addEventListener("click", openCamera);
  $("closeCamera").addEventListener("click", closeCamera);
  $("capturePage").addEventListener("click", capturePage);
  $("importCameraImages").addEventListener("change", (e) => { importImages(e.target.files); e.target.value = ""; });
  $("importGalleryImages").addEventListener("change", (e) => { importImages(e.target.files); e.target.value = ""; });
  $("galleryButton").addEventListener("click", () => $("importGalleryImages").click());
  $("cameraGalleryButton").addEventListener("click", () => $("importGalleryImages").click());
  $("rotateLeft").addEventListener("click", () => rotateSelected(-90));
  $("rotateRight").addEventListener("click", () => rotateSelected(90));
  $("movePageUp").addEventListener("click", () => moveSelected(-1));
  $("movePageDown").addEventListener("click", () => moveSelected(1));
  $("deletePage").addEventListener("click", deleteSelected);
  $("imagePreset").addEventListener("change", (e) => applyPresetToSelected(e.target.value));
  $("generatePdf").addEventListener("click", generatePdf);
  $("clearPages").addEventListener("click", () => {
    setStatus(CAMERA_STATES.cleanup, "Limpando imagens temporárias.");
    cleanupPages();
    setStatus(CAMERA_STATES.idle, "Imagens removidas.");
  });
  $("createAnother").addEventListener("click", () => {
    cleanupResult();
    $("cameraResults").hidden = true;
    setStatus(CAMERA_STATES.review, "Você pode gerar outro PDF com as páginas atuais.");
  });

  window.addEventListener("beforeunload", () => {
    stopCameraStream(state.stream);
    cleanupPages();
  });
  window.addEventListener("pagehide", () => {
    stopCameraStream(state.stream);
    cleanupPages();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCameraStream(state.stream);
  });

  renderPages();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
else bind();
