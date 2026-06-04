import { createFFmpegLoadOptions, loadFFmpegKit } from "../cdn-loader.js?v=2";
import { friendlyProgressMessage, isKnownFfmpegValue, parseFfmpegLog, percentFromStats } from "../video/ffmpeg-progress.js?v=3";
import { buildCompressPlan } from "../video/video-commands.js?v=2";
import {
  PROCESSING_MODES,
  detectBrowserCapabilities,
  processingArgsFor,
  processingSummary,
} from "../video/video-processing-options.js?v=3";
import { sizeReductionPercent } from "../video/video-target-size.js?v=2";
import { runWasmTask } from "../wasm-runner-client.js?v=2";
import {
  $,
  baseName,
  bindStandardHeader,
  downloadBlob,
  escapeHtml,
  fileExt,
  formatBytes,
  setAlert,
  setText,
} from "./tool-page.js?v=3";
import { recordComplete, recordOpen } from "./stores.js?v=10";

const TOOL_CONFIG = {
  "compress-video": {
    title: "Comprimir vídeo",
    description: "Reduza o tamanho de MP4, WebM e MOV localmente usando ffmpeg.wasm.",
    badges: ["Local", "Navegador", "Beta", "Pesada", "WASM", "CDN"],
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.avi,.mkv",
  },
  "convert-video": {
    title: "Converter vídeo",
    description: "Converta vídeos para MP4 ou WebM com processamento local no navegador.",
    badges: ["Local", "Navegador", "Beta", "Pesada", "WASM", "CDN"],
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.avi,.mkv,.m4v",
  },
  "cut-video": {
    title: "Cortar vídeo",
    description: "Corte um trecho do vídeo informando início e fim, sem enviar o arquivo.",
    badges: ["Local", "Navegador", "Beta", "Pesada", "WASM", "CDN"],
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
  },
  "extract-audio": {
    title: "Extrair áudio",
    description: "Extraia áudio de vídeos para MP3, WAV, OGG ou M4A no navegador.",
    badges: ["Local", "Navegador", "Beta", "Pesada", "WASM", "CDN"],
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.avi,.mkv",
  },
};

let currentToolId = "compress-video";
let currentFile = null;
let ffmpeg = null;
let cancelled = false;
let currentDuration = 0;
let progressLog = [];
let processingActive = false;
let activePlan = null;
let activeJobId = null;
let latestProgressValue = 0;

const JOB_STORE_KEY = "arqkit.activeJobs.v1";

function getToolFromHash() {
  const id = (window.location.hash || "").replace(/^#\/?/, "");
  return TOOL_CONFIG[id] ? id : "compress-video";
}

function renderHeader() {
  const tool = TOOL_CONFIG[currentToolId];
  document.title = `${tool.title} | ArqKit`;
  setText("#breadcrumbTool", tool.title);
  setText("#toolTitle", tool.title);
  setText("#toolDescription", tool.description);
  const badges = $("#toolBadges");
  badges.innerHTML = tool.badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("");
}

function uploadMarkup() {
  const tool = TOOL_CONFIG[currentToolId];
  return `
    <h2>1. Adicione o vídeo</h2>
    <div id="dropzone" class="tool-upload" role="button" tabindex="0">
      <div>
        <strong>Arraste o arquivo aqui ou clique para selecionar</strong>
        <span class="tool-note">Processamento local no navegador. Arquivos grandes podem demorar.</span>
        <div class="tool-actions"><button class="btn btn--primary" type="button" id="pickFile">Selecionar vídeo</button></div>
      </div>
      <input id="primaryFile" type="file" accept="${escapeHtml(tool.accept)}" hidden />
    </div>
    <div id="fileInfo" class="tool-list"></div>
    <video id="videoPreview" class="tool-preview" controls hidden></video>
    <p id="toolAlert" class="tool-alert" role="alert" hidden></p>
    <div id="toolProgress" class="tool-progress tool-progress--rich" hidden aria-live="polite">
      <div class="tool-progress__head">
        <div>
          <strong data-progress-title>Processamento local</strong>
          <span data-progress-subtitle>Nada será enviado para servidores do ArqKit.</span>
        </div>
        <strong data-progress-percent>0%</strong>
      </div>
      <progress max="100" value="0" aria-hidden="true"></progress>
      <div class="tool-progress__track" aria-hidden="true"><span data-progress-fill></span></div>
      <p data-progress-text>Preparando.</p>
      <div class="tool-progress__stats" aria-label="Métricas do processamento">
        <span><strong data-stat-time>--</strong><small>Tempo processado</small></span>
        <span><strong data-stat-speed>--</strong><small>Velocidade</small></span>
        <span><strong data-stat-bitrate>--</strong><small>Bitrate</small></span>
        <span><strong data-stat-size>--</strong><small>Tamanho parcial</small></span>
      </div>
      <details class="tool-progress__log">
        <summary>Detalhes técnicos</summary>
        <code data-progress-raw>Sem logs ainda.</code>
      </details>
    </div>
    <div id="toolOutput" class="tool-output"></div>
    <button id="floatingProgress" class="tool-floating-progress" type="button" hidden aria-live="polite">
      <span>
        <strong data-floating-title>Processamento local</strong>
        <small data-floating-subtitle>Nada será enviado para servidores do ArqKit.</small>
      </span>
      <b data-floating-percent>0%</b>
    </button>
  `;
}

function processingControlMarkup() {
  return `
    <label>Ritmo de processamento
      <select id="processingMode">
        <option value="auto" selected>Automático recomendado</option>
        <option value="compatible">Compatível e leve</option>
        <option value="speed">Alta velocidade</option>
        <option value="balanced">Equilibrado</option>
        <option value="compression">Mais compressão</option>
        <option value="maximum">Máxima compressão</option>
        <option value="custom">Personalizado</option>
      </select>
    </label>
    <div class="tool-row tool-row--custom-speed" data-custom-processing hidden>
      <label>Preset H.264
        <select id="customPreset">
          <option value="ultrafast">ultrafast</option>
          <option value="veryfast">veryfast</option>
          <option value="fast">fast</option>
          <option value="medium" selected>medium</option>
          <option value="slow">slow</option>
          <option value="slower">slower</option>
          <option value="veryslow">veryslow</option>
        </select>
      </label>
      <label>Threads
        <input id="customThreads" type="number" min="1" max="8" value="2" />
      </label>
    </div>
  `;
}

function controlsMarkup() {
  if (currentToolId === "compress-video") {
    return `
      <h2>2. Compressão</h2>
      <div class="tool-row">
        <label>Modo
          <select id="compressionMode">
            <option value="profile" selected>Preset rápido</option>
            <option value="target">Tamanho alvo em MB</option>
            <option value="crf">Qualidade CRF</option>
            <option value="bitrate">Bitrate manual</option>
            <option value="extreme">Agressivo</option>
          </select>
        </label>
        <label>Formato
          <select id="outputFormat"><option value="mp4" selected>MP4</option><option value="webm">WebM</option></select>
        </label>
      </div>
      <div class="tool-row" data-compression-panel="profile">
        <label>Perfil
          <select id="profile">
            <option value="light">Leve</option>
            <option value="balanced" selected>Equilibrado</option>
            <option value="strong">Forte</option>
          </select>
        </label>
        <label>CRF de referencia
          <input type="text" value="automático pelo perfil" disabled />
        </label>
      </div>
      <div class="tool-row" data-compression-panel="target" hidden>
        <label>Tamanho alvo
          <input id="targetMB" type="number" min="1" step="0.5" value="26" />
        </label>
        <label>Margem de segurança
          <select id="targetSafety">
            <option value="0.88">Mais agressiva</option>
            <option value="0.92" selected>Recomendada</option>
            <option value="0.96">Mais conservadora</option>
          </select>
        </label>
      </div>
      <label class="tool-check" data-compression-panel="target" hidden><input id="targetTwoPass" type="checkbox" checked /> Usar 2-pass no MP4 para chegar mais perto do tamanho alvo</label>
      <div class="tool-row" data-compression-panel="crf" hidden>
        <label>CRF
          <input id="crf" type="range" min="18" max="42" step="1" value="30" />
        </label>
        <label>Valor do CRF
          <input id="crfValue" type="number" min="18" max="42" step="1" value="30" />
        </label>
      </div>
      <div class="tool-row">
        <label>Resolução máxima
          <select id="resolution">
            <option value="original">Original</option>
            <option value="1080p">1080p</option>
            <option value="720p" selected>720p</option>
            <option value="540p">540p</option>
            <option value="480p">480p</option>
            <option value="360p">360p extremo</option>
          </select>
        </label>
        <label>FPS máximo
          <select id="fps">
            <option value="original">Original</option>
            <option value="30" selected>30 fps</option>
            <option value="24">24 fps</option>
            <option value="20">20 fps</option>
            <option value="15">15 fps extremo</option>
          </select>
        </label>
      </div>
      <div class="tool-row tool-row--single" data-compression-panel="bitrate" hidden>
        <label>Bitrate de vídeo
          <input id="videoBitrate" type="text" value="900k" />
        </label>
      </div>
      <div class="tool-row" data-audio-panel>
        <label>Audio
          <select id="audioBitrate">
            <option value="128k">128k</option>
            <option value="96k" selected>96k</option>
            <option value="64k">64k</option>
            <option value="48k">48k agressivo</option>
            <option value="32k">32k extremo</option>
          </select>
        </label>
        <label>Observação
          <input type="text" value="remover áudio reduz mais" disabled />
        </label>
      </div>
      ${processingControlMarkup()}
      <div class="tool-risk-panel" data-extreme-warning hidden>
        <strong>Modo agressivo</strong>
        <span>Este modo pode usar muita CPU e RAM, deixar a aba lenta ou falhar em celular/notebook simples. Os arquivos continuam locais no navegador.</span>
        <label class="tool-check"><input id="extremeAck" type="checkbox" /> Entendo o risco e quero testar mesmo assim</label>
      </div>
      <label class="tool-check"><input id="removeAudio" type="checkbox" /> Remover áudio</label>
    `;
  }
  if (currentToolId === "convert-video") {
    return `
      <h2>2. Conversão</h2>
      <div class="tool-row">
        <label>Formato de saída
          <select id="outputFormat"><option value="mp4" selected>MP4</option><option value="webm">WebM</option><option value="gif">GIF beta</option></select>
        </label>
        <label>FPS
          <input id="fps" type="number" min="1" max="60" value="30" />
        </label>
      </div>
      ${processingControlMarkup()}
      <label class="tool-check"><input id="removeAudio" type="checkbox" /> Remover áudio</label>
    `;
  }
  if (currentToolId === "cut-video") {
    return `
      <h2>2. Corte</h2>
      <div class="tool-row">
        <label>Início
          <input id="startTime" type="text" value="00:00:00" placeholder="00:00:05" />
        </label>
        <label>Fim
          <input id="endTime" type="text" value="00:00:10" placeholder="00:00:20" />
        </label>
      </div>
      <div class="tool-row">
        <button class="btn btn--ghost" id="useStart" type="button">Usar tempo atual como início</button>
        <button class="btn btn--ghost" id="useEnd" type="button">Usar tempo atual como fim</button>
      </div>
      <label>Modo
        <select id="cutMode"><option value="fast" selected>Corte rápido</option><option value="precise">Corte preciso</option></select>
      </label>
      ${processingControlMarkup()}
      <p class="tool-note">Corte rápido pode ser menos preciso por causa dos keyframes. Corte preciso pode demorar mais.</p>
    `;
  }
  return `
    <h2>2. Áudio</h2>
    <div class="tool-row">
      <label>Formato
        <select id="audioFormat"><option value="mp3" selected>MP3</option><option value="wav">WAV</option><option value="ogg">OGG</option><option value="m4a">M4A</option></select>
      </label>
      <label>Bitrate
        <select id="audioBitrate"><option value="128k">128k</option><option value="192k" selected>192k</option><option value="320k">320k</option></select>
      </label>
    </div>
    ${processingControlMarkup()}
  `;
}

function runButtonLabel() {
  const labels = {
    "compress-video": "Comprimir vídeo",
    "convert-video": "Converter vídeo",
    "cut-video": "Cortar vídeo",
    "extract-audio": "Extrair áudio",
  };
  return labels[currentToolId] || "Processar";
}

function renderWorkspace() {
  currentFile = null;
  currentDuration = 0;
  progressLog = [];
  $("#toolWorkspace").innerHTML = `
    ${uploadMarkup()}
    <form id="toolForm" class="tool-form">
      ${controlsMarkup()}
      <div class="tool-processing-summary" id="processingSummary" aria-live="polite"></div>
      <div class="tool-actions">
        <button class="btn btn--primary" type="button" data-run-tool>${escapeHtml(runButtonLabel())}</button>
        <button class="btn btn--ghost" type="button" data-cancel-tool hidden>Cancelar</button>
        <button class="btn btn--ghost" type="button" data-clear-tool>Limpar tudo</button>
      </div>
    </form>
  `;
  bindUpload();
  bindControls();
  updateProcessingSummary();
}

function renderFileInfo() {
  const root = $("#fileInfo");
  const preview = $("#videoPreview");
  if (!root) return;
  if (!currentFile) {
    root.innerHTML = '<div class="tool-list-item">Nenhum vídeo selecionado.</div>';
    if (preview) {
      preview.hidden = true;
      preview.removeAttribute("src");
    }
    return;
  }
  root.innerHTML = `
    <div class="tool-list-item">
      <strong>${escapeHtml(currentFile.name)}</strong>
      <small>${escapeHtml(currentFile.type || fileExt(currentFile.name).toUpperCase() || "video")} - ${formatBytes(currentFile.size)}</small>
    </div>
  `;
  if (preview) {
    const url = URL.createObjectURL(currentFile);
    preview.src = url;
    preview.hidden = false;
    preview.onloadedmetadata = () => {
      currentDuration = Number.isFinite(preview.duration) ? preview.duration : 0;
      setAlert("#toolAlert", `Vídeo recebido. Duração aproximada: ${formatTime(currentDuration)}.`, "info");
      updateProcessingSummary();
    };
    preview.onemptied = () => URL.revokeObjectURL(url);
  }
}

function bindUpload() {
  const dropzone = $("#dropzone");
  const input = $("#primaryFile");
  const pick = $("#pickFile");
  const setFile = (files) => {
    currentFile = Array.from(files || [])[0] || null;
    $("#toolOutput").innerHTML = "";
    renderFileInfo();
    updateProcessingSummary();
    if (currentFile) setAlert("#toolAlert", "Arquivo recebido. O processamento acontece localmente no navegador.");
  };
  pick.addEventListener("click", (event) => {
    event.stopPropagation();
    input.click();
  });
  dropzone.addEventListener("click", () => input.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => setFile(input.files));
  ["dragenter", "dragover"].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  }));
  ["dragleave", "drop"].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  }));
  dropzone.addEventListener("drop", (event) => setFile(event.dataTransfer?.files));
  renderFileInfo();
}

function bindControls() {
  $("#useStart")?.addEventListener("click", () => {
    $("#startTime").value = formatTime($("#videoPreview")?.currentTime || 0);
  });
  $("#useEnd")?.addEventListener("click", () => {
    $("#endTime").value = formatTime($("#videoPreview")?.currentTime || 0);
  });
  $("#compressionMode")?.addEventListener("change", () => {
    applyCompressionModeDefaults($("#compressionMode")?.value || "profile");
    updateCompressionModeVisibility();
    updateProcessingSummary();
  });
  $("#crf")?.addEventListener("input", () => {
    const value = $("#crf")?.value || "30";
    const target = $("#crfValue");
    if (target) target.value = value;
    updateProcessingSummary();
  });
  $("#crfValue")?.addEventListener("input", () => {
    const value = $("#crfValue")?.value || "30";
    const target = $("#crf");
    if (target) target.value = value;
    updateProcessingSummary();
  });
  [
    "profile",
    "outputFormat",
    "audioFormat",
    "processingMode",
    "customPreset",
    "customThreads",
    "videoBitrate",
    "audioBitrate",
    "targetMB",
    "targetSafety",
    "targetTwoPass",
    "resolution",
    "fps",
    "removeAudio",
    "extremeAck",
    "cutMode",
  ].forEach((id) => {
    $(`#${id}`)?.addEventListener("change", updateProcessingSummary);
    $(`#${id}`)?.addEventListener("input", updateProcessingSummary);
  });
  ["outputFormat", "processingMode", "removeAudio"].forEach((id) => {
    $(`#${id}`)?.addEventListener("change", updateCompressionModeVisibility);
  });
  updateCompressionModeVisibility();
  document.querySelector("[data-run-tool]").addEventListener("click", runCurrentTool);
  document.querySelector("[data-cancel-tool]").addEventListener("click", cancelTool);
  document.querySelector("[data-clear-tool]").addEventListener("click", clearTool);
  $("#floatingProgress")?.addEventListener("click", scrollProgressIntoView);
}

function setBusy(isBusy) {
  processingActive = isBusy;
  document.querySelector("[data-run-tool]").disabled = isBusy;
  document.querySelector("[data-cancel-tool]").hidden = !isBusy;
}

function clearTool() {
  currentFile = null;
  $("#primaryFile").value = "";
  $("#toolOutput").innerHTML = "";
  $("#toolProgress").hidden = true;
  $("#floatingProgress").hidden = true;
  currentDuration = 0;
  progressLog = [];
  activePlan = null;
  setAlert("#toolAlert", "Temporários limpos.");
  renderFileInfo();
  updateProcessingSummary();
}

function cancelTool() {
  cancelled = true;
  try { ffmpeg?.terminate?.(); } catch {}
  ffmpeg = null;
  setAlert("#toolAlert", "Processamento cancelado. A engine será recarregada se você tentar novamente.");
  updateVideoProgress(null, "Processamento cancelado. Temporários limpos.", null);
  finishActiveJob("cancelled", "Processamento cancelado.", latestProgressValue);
  setBusy(false);
}

function formatTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

function readJobs() {
  try {
    const raw = localStorage.getItem(JOB_STORE_KEY);
    const jobs = raw ? JSON.parse(raw) : [];
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  try {
    localStorage.setItem(JOB_STORE_KEY, JSON.stringify(jobs.slice(0, 5)));
    window.dispatchEvent(new CustomEvent("arqkit:jobs-updated"));
  } catch { /* metadata only; ignore quota/private browsing */ }
}

function updateActiveJob(extra = {}) {
  if (!activeJobId) return;
  const now = Date.now();
  const jobs = readJobs().filter((job) => job.id !== activeJobId && now - Number(job.updatedAt || 0) < 2 * 60 * 60 * 1000);
  jobs.unshift({
    id: activeJobId,
    tool: currentToolId,
    title: TOOL_CONFIG[currentToolId]?.title || "Processamento local",
    fileName: currentFile?.name || "arquivo",
    href: `./video-ferramentas.html#${currentToolId}`,
    progress: latestProgressValue,
    status: processingActive ? "processing" : "idle",
    message: "Processamento local no navegador.",
    updatedAt: now,
    ...extra,
  });
  writeJobs(jobs);
}

function finishActiveJob(status, message, progress = latestProgressValue) {
  latestProgressValue = progress;
  updateActiveJob({ status, message, progress, updatedAt: Date.now() });
  if (status === "done" || status === "cancelled") {
    const finishedId = activeJobId;
    window.setTimeout(() => {
      const jobs = readJobs().filter((job) => job.id !== finishedId);
      writeJobs(jobs);
      if (activeJobId === finishedId) activeJobId = null;
    }, status === "done" ? 45000 : 12000);
  }
}

function markInterruptedJob() {
  if (!processingActive || !activeJobId) return;
  finishActiveJob("interrupted", "A página foi fechada ou trocada; selecione o arquivo novamente.", latestProgressValue);
}

function scrollProgressIntoView() {
  const progress = $("#toolProgress");
  if (!progress || progress.hidden) return;
  progress.scrollIntoView({ behavior: "smooth", block: "center" });
}

function scrollProgressSoon() {
  window.requestAnimationFrame(() => window.setTimeout(scrollProgressIntoView, 50));
}

function processingContext() {
  return {
    capabilities: detectBrowserCapabilities(),
    fileSize: currentFile?.size || 0,
    durationSeconds: currentDuration || 0,
  };
}

function selectedProcessingMode() {
  return $("#processingMode")?.value || "auto";
}

function applyCompressionModeDefaults(mode) {
  const defaults = {
    profile: { resolution: "720p", fps: "30", audioBitrate: "96k", processingMode: "auto" },
    target: { resolution: "720p", fps: "30", audioBitrate: "64k", processingMode: "compression" },
    crf: { resolution: "720p", fps: "original", audioBitrate: "96k", processingMode: "balanced", crf: "30" },
    bitrate: { resolution: "720p", fps: "30", audioBitrate: "96k", videoBitrate: "900k", processingMode: "balanced" },
    extreme: { resolution: "480p", fps: "20", audioBitrate: "48k", processingMode: "maximum", crf: "36" },
  }[mode];
  if (!defaults) return;
  for (const [id, value] of Object.entries(defaults)) {
    const element = $(`#${id}`);
    if (element) element.value = value;
  }
  if (defaults.crf) {
    const crfRange = $("#crf");
    const crfValue = $("#crfValue");
    if (crfRange) crfRange.value = defaults.crf;
    if (crfValue) crfValue.value = defaults.crf;
  }
}

function updateCompressionModeVisibility() {
  const processingMode = selectedProcessingMode();
  const customPanel = document.querySelector("[data-custom-processing]");
  if (customPanel) customPanel.hidden = processingMode !== "custom";
  if (currentToolId !== "compress-video") return;
  const mode = $("#compressionMode")?.value || "profile";
  const format = $("#outputFormat")?.value || "mp4";
  document.querySelectorAll("[data-compression-panel]").forEach((panel) => {
    const value = panel.getAttribute("data-compression-panel");
    const shouldShow = value === mode && (value !== "target" || format === "mp4" || panel.tagName !== "LABEL");
    panel.hidden = !shouldShow;
  });
  if (mode === "target" && format !== "mp4") {
    $("#targetTwoPass")?.closest("label")?.setAttribute("hidden", "");
  }
  const extremeWarning = document.querySelector("[data-extreme-warning]");
  if (extremeWarning) extremeWarning.hidden = !(mode === "extreme" || processingMode === "maximum" || processingMode === "custom");
  const audioSelect = $("#audioBitrate");
  if (audioSelect) audioSelect.disabled = !!$("#removeAudio")?.checked;
}

function compressionOptions(input = "input.mp4", output = "output.mp4") {
  const mode = $("#compressionMode")?.value || "profile";
  const format = outputFor("compress-video");
  return {
    inputName: input,
    outputName: output,
    outputFormat: format,
    compressionMode: mode,
    profile: $("#profile")?.value || "balanced",
    targetMB: $("#targetMB")?.value || 26,
    twoPass: $("#targetTwoPass")?.checked !== false,
    safetyFactor: $("#targetSafety")?.value || 0.92,
    crf: $("#crfValue")?.value || $("#crf")?.value || 30,
    videoBitrate: $("#videoBitrate")?.value || "900k",
    audioBitrate: $("#audioBitrate")?.value || "96k",
    resolution: $("#resolution")?.value || "720p",
    fps: $("#fps")?.value || "30",
    removeAudio: !!$("#removeAudio")?.checked,
    processingMode: selectedProcessingMode(),
    customPreset: $("#customPreset")?.value || "medium",
    customThreads: $("#customThreads")?.value || "2",
    context: processingContext(),
  };
}

function currentCompressPlan(input = "input.mp4", output = "output.mp4") {
  return buildCompressPlan(compressionOptions(input, output));
}

function customProcessingSettings() {
  if (selectedProcessingMode() !== "custom") return {};
  return {
    x264Preset: $("#customPreset")?.value || "medium",
    threads: $("#customThreads")?.value || "2",
  };
}

function formatMB(value) {
  return `${(Math.max(0, Number(value) || 0)).toFixed(value >= 10 ? 1 : 2)} MB`;
}

function updateProcessingSummary() {
  const root = $("#processingSummary");
  if (!root) return;
  updateCompressionModeVisibility();
  const context = processingContext();
  const effective = processingSummary(selectedProcessingMode(), context);
  const memory = effective.memory ? `${effective.memory} GB RAM aprox.` : "memória não informada";
  const recommendation = effective.selected === "auto"
    ? `Automático escolheu ${effective.label.toLowerCase()}.`
    : `Modo escolhido: ${effective.label.toLowerCase()}.`;
  const warning = effective.riskMessage
    || (effective.lowPower || effective.largeJob
      ? "Use modos agressivos apenas se aceitar risco de lentidão ou falha por memória."
      : "Configura??o adequada para este navegador.");

  if (currentToolId === "compress-video") {
    let plan = null;
    try {
      plan = currentCompressPlan();
    } catch (error) {
      root.innerHTML = `<div><strong>Revise os parâmetros</strong><span>${escapeHtml(error?.message || "Configuração inválida.")}</span></div>`;
      return;
    }
    const estimatedBytes = plan.estimate.estimatedMB * 1024 * 1024;
    const originalLabel = currentFile ? formatBytes(currentFile.size) : "selecione um vídeo";
    const estimateLabel = context.durationSeconds ? formatBytes(estimatedBytes) : "aguardando dura??o";
    const targetLabel = plan.estimate.targetMB ? formatMB(plan.estimate.targetMB) : "sem alvo fixo";
    const projectedReduction = currentFile && context.durationSeconds
      ? `${sizeReductionPercent(currentFile.size, estimatedBytes)}%`
      : "estimativa";
    const twoPass = plan.twoPass ? "2-pass ativo" : "1-pass";
    const warnings = plan.estimate.warnings.length
      ? plan.estimate.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "<li>Arquivos continuam locais. Resultado final pode variar conforme codec e conteudo.</li>";

    root.innerHTML = `
      <div>
        <strong>${escapeHtml(plan.modeLabel)} - ${escapeHtml(recommendation)}</strong>
        <span>${escapeHtml(warning)}</span>
      </div>
      <ul>
        <li><b>${escapeHtml(originalLabel)}</b><span>arquivo original</span></li>
        <li><b>${escapeHtml(estimateLabel)}</b><span>estimativa de saída</span></li>
        <li><b>${escapeHtml(targetLabel)}</b><span>tamanho alvo</span></li>
        <li><b>${escapeHtml(projectedReduction)}</b><span>reducao prevista</span></li>
        <li><b>${plan.settings.videoKbps}k</b><span>vídeo alvo</span></li>
        <li><b>${plan.settings.audioKbps ? `${plan.settings.audioKbps}k` : "sem áudio"}</b><span>áudio</span></li>
        <li><b>${escapeHtml(plan.settings.resolution)}</b><span>resolução máxima</span></li>
        <li><b>${escapeHtml(plan.settings.fps === "original" ? "original" : `${plan.settings.fps} fps`)}</b><span>FPS</span></li>
        <li><b>${escapeHtml(twoPass)}</b><span>passadas</span></li>
        <li><b>${effective.threads}</b><span>threads alvo</span></li>
        <li><b>${escapeHtml(memory)}</b><span>capacidade</span></li>
        <li><b>${escapeHtml(PROCESSING_MODES[effective.resolved].label)}</b><span>ritmo efetivo</span></li>
      </ul>
      <div class="tool-summary-warnings"><strong>Avisos</strong><ul>${warnings}</ul></div>
    `;
    return;
  }

  root.innerHTML = `
    <div>
      <strong>${escapeHtml(recommendation)}</strong>
      <span>${escapeHtml(warning)}</span>
    </div>
    <ul>
      <li><b>${effective.cores}</b><span>núcleos detectados</span></li>
      <li><b>${escapeHtml(memory)}</b><span>capacidade</span></li>
      <li><b>${effective.threads}</b><span>threads alvo</span></li>
      <li><b>${escapeHtml(PROCESSING_MODES[effective.resolved].label)}</b><span>ritmo efetivo</span></li>
    </ul>
  `;
}

function estimatedOutputBytes() {
  const mb = activePlan?.estimate?.estimatedMB;
  return Number.isFinite(Number(mb)) && Number(mb) > 0 ? Number(mb) * 1024 * 1024 : 0;
}

function knownSizeLabel(stats, percentValue) {
  if (stats && isKnownFfmpegValue(stats.size)) return stats.size;
  const estimate = estimatedOutputBytes();
  if (!estimate) return "--";
  let ratio = Number(percentValue) / 100;
  if ((!Number.isFinite(ratio) || ratio <= 0) && stats?.timeSeconds && currentDuration) {
    ratio = stats.timeSeconds / currentDuration;
  }
  if (!Number.isFinite(ratio) || ratio <= 0) return "--";
  const partial = Math.max(1, estimate * Math.min(0.99, ratio));
  return `${formatBytes(partial)} estimado`;
}

function knownBitrateLabel(stats) {
  if (stats && isKnownFfmpegValue(stats.bitrate)) return stats.bitrate;
  const video = Number(activePlan?.settings?.videoKbps) || 0;
  const audio = Number(activePlan?.settings?.audioKbps) || 0;
  if (video || audio) return `${Math.round(video + audio)}k estimado`;
  return "--";
}

function enrichProgressStats(stats, percentValue) {
  const enriched = stats ? { ...stats } : {};
  enriched.time ||= "--";
  enriched.speed ||= "--";
  enriched.bitrate = knownBitrateLabel(stats);
  enriched.size = knownSizeLabel(stats, percentValue);
  return enriched;
}

function updateFloatingProgress(value, message = "") {
  const root = $("#floatingProgress");
  if (!root) return;
  const visible = processingActive && Number(value) < 100;
  root.hidden = !visible;
  if (!visible) return;
  root.querySelector("[data-floating-percent]").textContent = `${Math.round(Number(value) || 0)}%`;
  root.querySelector("[data-floating-title]").textContent = currentFile?.name || "Processamento local";
  root.querySelector("[data-floating-subtitle]").textContent = message || "Clique para ver os detalhes.";
}

function updateVideoProgress(value, message = "", stats = null) {
  const root = $("#toolProgress");
  if (!root) return;
  root.hidden = false;
  const numeric = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : null;
  if (numeric !== null) latestProgressValue = numeric;
  const progress = root.querySelector("progress");
  const fill = root.querySelector("[data-progress-fill]");
  const percent = root.querySelector("[data-progress-percent]");
  const text = root.querySelector("[data-progress-text]");
  if (numeric !== null) {
    if (progress) progress.value = numeric;
    if (fill) fill.style.width = `${numeric}%`;
    if (percent) percent.textContent = `${Math.round(numeric)}%`;
  }
  if (text && message) text.textContent = message;
  const enriched = enrichProgressStats(stats, numeric ?? latestProgressValue);
  root.querySelector("[data-stat-time]").textContent = enriched.time || "--";
  root.querySelector("[data-stat-speed]").textContent = enriched.speed || "--";
  root.querySelector("[data-stat-bitrate]").textContent = enriched.bitrate || "--";
  root.querySelector("[data-stat-size]").textContent = enriched.size || "--";
  updateFloatingProgress(numeric ?? latestProgressValue, message);
  updateActiveJob({
    progress: Math.round(numeric ?? latestProgressValue),
    message: message || "Processando localmente.",
    status: processingActive ? "processing" : "idle",
  });
  if (stats) {
    if (stats.raw) {
      progressLog.push(stats.raw);
      progressLog = progressLog.slice(-8);
      root.querySelector("[data-progress-raw]").textContent = progressLog.join("\n");
    }
  }
}

function updateProgressFromMessage(message, value = null) {
  if (/^Executando ffmpeg\b/i.test(String(message || ""))) {
    progressLog.push(String(message).slice(0, 260));
    progressLog = progressLog.slice(-8);
    updateVideoProgress(value, "Executando processamento local no runner isolado.", null);
    const raw = $("#toolProgress")?.querySelector("[data-progress-raw]");
    if (raw) raw.textContent = progressLog.join("\n");
    return;
  }
  const stats = parseFfmpegLog(message);
  const computed = value ?? percentFromStats(stats, currentDuration);
  updateVideoProgress(computed, friendlyProgressMessage(stats, message || "Processando localmente."), stats);
}

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  const { FFmpeg, util } = await loadFFmpegKit();
  ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    const pct = Math.max(1, Math.min(99, Math.round((progress || 0) * 100)));
    updateVideoProgress(pct, "Processando com ffmpeg.wasm no navegador.");
  });
  ffmpeg.on("log", ({ message }) => {
    if (message) updateProgressFromMessage(message);
  });
  updateVideoProgress(5, "Carregando ffmpeg.wasm. O primeiro carregamento pode demorar.");
  await ffmpeg.load(await createFFmpegLoadOptions(util));
  return ffmpeg;
}

function inputName(file) {
  return `input.${fileExt(file.name) || "mp4"}`;
}

function resultButton(blob, name, plan = null) {
  const reduction = currentFile ? sizeReductionPercent(currentFile.size, blob.size) : 0;
  const delta = currentFile ? currentFile.size - blob.size : 0;
  const estimate = plan?.estimate?.estimatedMB ? formatBytes(plan.estimate.estimatedMB * 1024 * 1024) : "sem estimativa";
  const actual = formatBytes(blob.size);
  const original = currentFile ? formatBytes(currentFile.size) : "arquivo original";
  $("#toolOutput").innerHTML = `
    <div class="tool-result-card">
      <div>
        <strong>Download preparado</strong>
        <span>${escapeHtml(name)}</span>
      </div>
      <ul>
        <li><b>${escapeHtml(original)}</b><span>original</span></li>
        <li><b>${escapeHtml(actual)}</b><span>resultado</span></li>
        <li><b>${reduction}%</b><span>reducao real</span></li>
        <li><b>${escapeHtml(formatBytes(Math.abs(delta)))}</b><span>${delta >= 0 ? "economizados" : "maior que original"}</span></li>
        <li><b>${escapeHtml(estimate)}</b><span>estimativa</span></li>
        <li><b>${escapeHtml(plan?.modeLabel || "Processamento")}</b><span>modo usado</span></li>
      </ul>
    </div>
    <div class="tool-actions">
      <button class="btn btn--primary" id="downloadResult" type="button">${escapeHtml(downloadLabelForCurrentTool())}</button>
      ${currentToolId === "compress-video" ? '<button class="btn btn--ghost" id="trySmaller" type="button">Tentar menor</button>' : ""}
    </div>
  `;
  $("#downloadResult").addEventListener("click", () => downloadBlob(blob, name));
  $("#trySmaller")?.addEventListener("click", () => {
    const nextTarget = Math.max(1, (blob.size / (1024 * 1024)) * 0.86);
    $("#compressionMode").value = "target";
    $("#targetMB").value = nextTarget.toFixed(nextTarget >= 10 ? 1 : 2);
    $("#resolution").value = plan?.settings?.resolution === "360p" ? "360p" : "480p";
    $("#fps").value = "20";
    $("#audioBitrate").value = "48k";
    $("#processingMode").value = "compression";
    updateCompressionModeVisibility();
    updateProcessingSummary();
    setAlert("#toolAlert", "Ajustei um alvo menor. Revise os avisos e rode novamente se quiser testar.");
  });
}

function downloadLabelForCurrentTool() {
  return {
    "compress-video": "Baixar vídeo comprimido",
    "convert-video": "Baixar vídeo convertido",
    "cut-video": "Baixar vídeo cortado",
    "extract-audio": "Baixar áudio",
  }[currentToolId] || "Baixar arquivo";
}

function outputFor(type) {
  if (type === "extract-audio") return $("#audioFormat").value;
  if (type === "convert-video") return $("#outputFormat").value;
  if (type === "compress-video") return $("#outputFormat").value;
  return fileExt(currentFile?.name) === "webm" ? "webm" : "mp4";
}

function mimeForOutput(ext) {
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "gif") return "image/gif";
  return `video/${ext}`;
}

function codecArgs(format) {
  const speedArgs = processingArgsFor(format, selectedProcessingMode(), processingContext(), customProcessingSettings());
  if (format === "webm") return ["-c:v", "libvpx-vp9", "-c:a", "libopus", ...speedArgs];
  if (format === "gif") return ["-vf", `fps=${$("#fps")?.value || 12},scale=640:-1:flags=lanczos`];
  return ["-c:v", "libx264", "-c:a", "aac", ...speedArgs, "-movflags", "+faststart"];
}

function audioArgs(format) {
  const bitrate = $("#audioBitrate")?.value || "192k";
  if (format === "wav") return ["-vn", "-c:a", "pcm_s16le"];
  if (format === "ogg") return ["-vn", "-c:a", "libvorbis", "-b:a", bitrate];
  if (format === "m4a") return ["-vn", "-c:a", "aac", "-b:a", bitrate];
  return ["-vn", "-c:a", "libmp3lame", "-b:a", bitrate];
}

function buildCommand(input, output) {
  if (currentToolId === "compress-video") {
    return currentCompressPlan(input, output).commands[0];
  }
  if (currentToolId === "convert-video") {
    const format = outputFor(currentToolId);
    const args = ["-i", input, ...codecArgs(format)];
    if ($("#removeAudio")?.checked || format === "gif") args.push("-an");
    return [...args, output];
  }
  if (currentToolId === "cut-video") {
    const start = $("#startTime").value || "00:00:00";
    const end = $("#endTime").value || "";
    const fast = $("#cutMode").value === "fast";
    return ["-ss", start, ...(end ? ["-to", end] : []), "-i", input, ...(fast ? ["-c", "copy"] : codecArgs(outputFor(currentToolId))), output];
  }
  return ["-i", input, ...audioArgs(outputFor(currentToolId)), output];
}

function planForCurrentTool(input, output) {
  if (currentToolId === "compress-video") return currentCompressPlan(input, output);
  return {
    modeLabel: TOOL_CONFIG[currentToolId].title,
    outputName: output,
    outputFormat: outputFor(currentToolId),
    commands: [buildCommand(input, output)],
    fallbackCommands: [],
    cleanupNames: [],
    twoPass: false,
    estimate: { warnings: [] },
    settings: {},
  };
}

async function executeRunnerPlan({ plan, input, output, ext, downloadName, commands = null }) {
  const result = await runWasmTask({
    engine: "ffmpeg",
    action: currentToolId,
    file: currentFile,
    payload: {
      inputName: input,
      outputName: output,
      commands: commands || plan.commands,
      cleanupNames: plan.cleanupNames || [],
      outputType: mimeForOutput(ext),
      downloadName,
    },
    onProgress: (event) => updateProgressFromMessage(event.message || "Processando no runner WASM.", event.value ?? null),
  });
  return result.blob;
}

async function executeInPagePlan({ plan, input, output, ext, commands = null }) {
  const { util } = await loadFFmpegKit();
  const engine = await getFFmpeg();
  await engine.writeFile(input, await util.fetchFile(currentFile));
  const runCommands = commands || plan.commands;
  for (const [index, command] of runCommands.entries()) {
    updateVideoProgress(
      Math.round(10 + (index / runCommands.length) * 85),
      runCommands.length > 1 ? `Etapa ${index + 1} de ${runCommands.length} no modo compatível.` : "Executando processamento local no modo compatível.",
    );
    await engine.exec(command);
  }
  if (cancelled) throw new Error("Processamento cancelado.");
  const data = await engine.readFile(output);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const blob = new Blob([buffer], { type: mimeForOutput(ext) });
  try { await engine.deleteFile(input); } catch {}
  try { await engine.deleteFile(output); } catch {}
  for (const name of plan.cleanupNames || []) {
    try { await engine.deleteFile(name); } catch {}
  }
  return blob;
}

async function runCurrentTool() {
  if (!currentFile) {
    setAlert("#toolAlert", "Selecione um vídeo antes de continuar.", "error");
    return;
  }
  cancelled = false;
  setBusy(true);
  $("#toolOutput").innerHTML = "";
  progressLog = [];
  setAlert("#toolAlert", "Carregando engine local. Nada será enviado para servidor.");
  updateProcessingSummary();
  try {
    try { recordOpen(currentToolId); } catch {}
    const input = inputName(currentFile);
    const ext = outputFor(currentToolId);
    const output = `output.${ext}`;
    if (currentToolId === "compress-video") {
      const mode = $("#compressionMode")?.value || "profile";
      const risky = mode === "extreme" || selectedProcessingMode() === "maximum";
      if (risky && !$("#extremeAck")?.checked) {
        setAlert("#toolAlert", "Marque que entende o risco do modo agressivo/maximo antes de processar.", "error");
        return;
      }
    }
    const plan = planForCurrentTool(input, output);
    activePlan = plan;
    activeJobId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    latestProgressValue = 0;
    updateActiveJob({ status: "processing", progress: 0, message: "Preparando processamento local." });
    const downloadName = `${baseName(currentFile.name)}-${currentToolId.replace(/-/g, "-")}.${ext}`;
    let blob = null;
    try {
      updateVideoProgress(8, "Preparando runner isolado. Nada será enviado para servidores do ArqKit.");
      scrollProgressSoon();
      blob = await executeRunnerPlan({ plan, input, output, ext, downloadName });
    } catch (runnerError) {
      if (plan.twoPass && plan.fallbackCommands?.length) {
        try {
          setAlert("#toolAlert", `2-pass falhou (${runnerError.message}). Tentando 1-pass com o mesmo alvo.`);
          blob = await executeRunnerPlan({ plan, input, output, ext, downloadName, commands: plan.fallbackCommands });
        } catch (fallbackRunnerError) {
          setAlert("#toolAlert", `Runner isolado indisponível (${fallbackRunnerError.message}). Tentando modo compatível single-thread nesta página.`);
          blob = await executeInPagePlan({ plan, input, output, ext, commands: plan.fallbackCommands });
        }
      } else {
        setAlert("#toolAlert", `Runner isolado indisponível (${runnerError.message}). Tentando modo compatível single-thread nesta página.`);
        blob = await executeInPagePlan({ plan, input, output, ext });
      }
    }
    updateVideoProgress(100, "Resultado pronto para download.");
    resultButton(blob, downloadName, plan);
    try { recordComplete(currentToolId); } catch {}
    finishActiveJob("done", "Resultado pronto para download.", 100);
    setAlert("#toolAlert", "Pronto. Download preparado.", "success");
  } catch (error) {
    finishActiveJob("error", error?.message || "Falha ao processar vídeo.", latestProgressValue);
    setAlert("#toolAlert", error?.message || "Falha ao processar vídeo.", "error");
  } finally {
    setBusy(false);
  }
}

function route() {
  currentToolId = getToolFromHash();
  renderHeader();
  renderWorkspace();
}

bindStandardHeader();
window.addEventListener("beforeunload", (event) => {
  if (!processingActive) return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("pagehide", markInterruptedJob);
window.addEventListener("hashchange", route);
route();
