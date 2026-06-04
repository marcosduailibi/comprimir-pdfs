import { createFFmpegLoadOptions, loadFFmpegKit } from "../cdn-loader.js?v=2";
import { friendlyProgressMessage, parseFfmpegLog, percentFromStats } from "../video/ffmpeg-progress.js?v=1";
import {
  PROCESSING_MODES,
  detectBrowserCapabilities,
  processingArgsFor,
  processingSummary,
} from "../video/video-processing-options.js?v=1";
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
} from "./tool-page.js";
import { recordComplete, recordOpen } from "./stores.js?v=10";

const TOOL_CONFIG = {
  "compress-video": {
    title: "Comprimir video",
    description: "Reduza o tamanho de MP4, WebM e MOV localmente usando ffmpeg.wasm.",
    badges: ["Local", "Navegador", "Beta", "Pesada", "WASM", "CDN"],
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.avi,.mkv",
  },
  "convert-video": {
    title: "Converter video",
    description: "Converta videos para MP4 ou WebM com processamento local no navegador.",
    badges: ["Local", "Navegador", "Beta", "Pesada", "WASM", "CDN"],
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.avi,.mkv,.m4v",
  },
  "cut-video": {
    title: "Cortar video",
    description: "Corte um trecho do video informando inicio e fim, sem enviar o arquivo.",
    badges: ["Local", "Navegador", "Beta", "Pesada", "WASM", "CDN"],
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
  },
  "extract-audio": {
    title: "Extrair audio",
    description: "Extraia audio de videos para MP3, WAV, OGG ou M4A no navegador.",
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
    <h2>1. Adicione o video</h2>
    <div id="dropzone" class="tool-upload" role="button" tabindex="0">
      <div>
        <strong>Arraste o arquivo aqui ou clique para selecionar</strong>
        <span class="tool-note">Processamento local no navegador. Arquivos grandes podem demorar.</span>
        <div class="tool-actions"><button class="btn btn--primary" type="button" id="pickFile">Selecionar video</button></div>
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
          <span data-progress-subtitle>Nada sera enviado para servidores do ArqKit.</span>
        </div>
        <strong data-progress-percent>0%</strong>
      </div>
      <progress max="100" value="0" aria-hidden="true"></progress>
      <div class="tool-progress__track" aria-hidden="true"><span data-progress-fill></span></div>
      <p data-progress-text>Preparando.</p>
      <div class="tool-progress__stats" aria-label="Metricas do processamento">
        <span><strong data-stat-time>--</strong><small>Tempo processado</small></span>
        <span><strong data-stat-speed>--</strong><small>Velocidade</small></span>
        <span><strong data-stat-bitrate>--</strong><small>Bitrate</small></span>
        <span><strong data-stat-size>--</strong><small>Tamanho parcial</small></span>
      </div>
      <details class="tool-progress__log">
        <summary>Detalhes tecnicos</summary>
        <code data-progress-raw>Sem logs ainda.</code>
      </details>
    </div>
    <div id="toolOutput" class="tool-output"></div>
  `;
}

function processingControlMarkup() {
  return `
    <label>Ritmo de processamento
      <select id="processingMode">
        <option value="auto" selected>Automatico recomendado</option>
        <option value="gentle">Mais leve para o navegador</option>
        <option value="balanced">Equilibrado</option>
        <option value="fast">Mais rapido</option>
        <option value="quality">Mais qualidade, mais lento</option>
      </select>
    </label>
  `;
}

function controlsMarkup() {
  if (currentToolId === "compress-video") {
    return `
      <h2>2. Compressao</h2>
      <div class="tool-row">
        <label>Perfil
          <select id="profile"><option value="light">Leve</option><option value="balanced" selected>Equilibrado</option><option value="strong">Forte</option><option value="custom">Personalizado</option></select>
        </label>
        <label>Formato
          <select id="outputFormat"><option value="mp4" selected>MP4</option><option value="webm">WebM</option></select>
        </label>
      </div>
      <div class="tool-row">
        <label>Bitrate de video
          <input id="videoBitrate" type="text" value="1200k" />
        </label>
        <label>Bitrate de audio
          <input id="audioBitrate" type="text" value="128k" />
        </label>
      </div>
      ${processingControlMarkup()}
      <label class="tool-check"><input id="removeAudio" type="checkbox" /> Remover audio</label>
    `;
  }
  if (currentToolId === "convert-video") {
    return `
      <h2>2. Conversao</h2>
      <div class="tool-row">
        <label>Formato de saida
          <select id="outputFormat"><option value="mp4" selected>MP4</option><option value="webm">WebM</option><option value="gif">GIF beta</option></select>
        </label>
        <label>FPS
          <input id="fps" type="number" min="1" max="60" value="30" />
        </label>
      </div>
      ${processingControlMarkup()}
      <label class="tool-check"><input id="removeAudio" type="checkbox" /> Remover audio</label>
    `;
  }
  if (currentToolId === "cut-video") {
    return `
      <h2>2. Corte</h2>
      <div class="tool-row">
        <label>Inicio
          <input id="startTime" type="text" value="00:00:00" placeholder="00:00:05" />
        </label>
        <label>Fim
          <input id="endTime" type="text" value="00:00:10" placeholder="00:00:20" />
        </label>
      </div>
      <div class="tool-row">
        <button class="btn btn--ghost" id="useStart" type="button">Usar tempo atual como inicio</button>
        <button class="btn btn--ghost" id="useEnd" type="button">Usar tempo atual como fim</button>
      </div>
      <label>Modo
        <select id="cutMode"><option value="fast" selected>Corte rapido</option><option value="precise">Corte preciso</option></select>
      </label>
      ${processingControlMarkup()}
      <p class="tool-note">Corte rapido pode ser menos preciso por causa dos keyframes. Corte preciso pode demorar mais.</p>
    `;
  }
  return `
    <h2>2. Audio</h2>
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
        <button class="btn btn--primary" type="button" data-run-tool>Carregar ferramenta</button>
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
    root.innerHTML = '<div class="tool-list-item">Nenhum video selecionado.</div>';
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
      setAlert("#toolAlert", `Video recebido. Duracao aproximada: ${formatTime(currentDuration)}.`, "info");
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
  ["profile", "outputFormat", "audioFormat", "processingMode", "videoBitrate", "audioBitrate", "removeAudio", "cutMode"].forEach((id) => {
    $(`#${id}`)?.addEventListener("change", updateProcessingSummary);
    $(`#${id}`)?.addEventListener("input", updateProcessingSummary);
  });
  document.querySelector("[data-run-tool]").addEventListener("click", runCurrentTool);
  document.querySelector("[data-cancel-tool]").addEventListener("click", cancelTool);
  document.querySelector("[data-clear-tool]").addEventListener("click", clearTool);
}

function setBusy(isBusy) {
  document.querySelector("[data-run-tool]").disabled = isBusy;
  document.querySelector("[data-cancel-tool]").hidden = !isBusy;
}

function clearTool() {
  currentFile = null;
  $("#primaryFile").value = "";
  $("#toolOutput").innerHTML = "";
  $("#toolProgress").hidden = true;
  currentDuration = 0;
  progressLog = [];
  setAlert("#toolAlert", "Temporarios limpos.");
  renderFileInfo();
  updateProcessingSummary();
}

function cancelTool() {
  cancelled = true;
  try { ffmpeg?.terminate?.(); } catch {}
  ffmpeg = null;
  setAlert("#toolAlert", "Processamento cancelado. A engine sera recarregada se voce tentar novamente.");
  updateVideoProgress(null, "Processamento cancelado. Temporarios limpos.", null);
  setBusy(false);
}

function formatTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
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

function updateProcessingSummary() {
  const root = $("#processingSummary");
  if (!root) return;
  const context = processingContext();
  const summary = processingSummary(selectedProcessingMode(), context);
  const qualityOption = $("#processingMode option[value='quality']");
  if (qualityOption) {
    qualityOption.disabled = summary.lowPower || summary.largeJob;
    if (qualityOption.disabled && selectedProcessingMode() === "quality") $("#processingMode").value = "auto";
  }
  const effective = processingSummary(selectedProcessingMode(), context);
  const memory = effective.memory ? `${effective.memory} GB RAM aprox.` : "memoria nao informada";
  const recommendation = effective.selected === "auto"
    ? `Automatico escolheu ${effective.label.toLowerCase()}.`
    : `Modo escolhido: ${effective.label.toLowerCase()}.`;
  const warning = effective.qualityBlocked
    ? "Modo de qualidade alta foi evitado neste navegador/arquivo para reduzir risco de travamento."
    : effective.lowPower || effective.largeJob
      ? "Recomendacao conservadora para manter a aba responsiva."
      : "Configuracao adequada para este navegador.";

  root.innerHTML = `
    <div>
      <strong>${escapeHtml(recommendation)}</strong>
      <span>${escapeHtml(warning)}</span>
    </div>
    <ul>
      <li><b>${effective.cores}</b><span>nucleos detectados</span></li>
      <li><b>${escapeHtml(memory)}</b><span>capacidade</span></li>
      <li><b>${effective.threads}</b><span>threads alvo</span></li>
      <li><b>${escapeHtml(PROCESSING_MODES[effective.resolved].label)}</b><span>ritmo efetivo</span></li>
    </ul>
  `;
}

function updateVideoProgress(value, message = "", stats = null) {
  const root = $("#toolProgress");
  if (!root) return;
  root.hidden = false;
  const numeric = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : null;
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
  if (stats) {
    root.querySelector("[data-stat-time]").textContent = stats.time || "--";
    root.querySelector("[data-stat-speed]").textContent = stats.speed || "--";
    root.querySelector("[data-stat-bitrate]").textContent = stats.bitrate && stats.bitrate !== "N/A" ? stats.bitrate : "--";
    root.querySelector("[data-stat-size]").textContent = stats.size || "--";
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

function resultButton(blob, name) {
  $("#toolOutput").innerHTML = `
    <div class="tool-list-item">
      <strong>Download preparado</strong>
      <small>${escapeHtml(name)} - ${formatBytes(blob.size)}</small>
    </div>
    <button class="btn btn--primary" id="downloadResult" type="button">Baixar resultado</button>
  `;
  $("#downloadResult").addEventListener("click", () => downloadBlob(blob, name));
}

function profileArgs() {
  const profile = $("#profile")?.value || "balanced";
  const customVideo = $("#videoBitrate")?.value || "1200k";
  const customAudio = $("#audioBitrate")?.value || "128k";
  const presets = {
    light: ["-b:v", "1800k", "-b:a", "160k"],
    balanced: ["-vf", "scale='min(1280,iw)':-2", "-b:v", "1200k", "-b:a", "128k"],
    strong: ["-vf", "scale='min(854,iw)':-2", "-b:v", "700k", "-b:a", "96k"],
    custom: ["-b:v", customVideo, "-b:a", customAudio],
  };
  return presets[profile] || presets.balanced;
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
  const speedArgs = processingArgsFor(format, selectedProcessingMode(), processingContext());
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
    const args = ["-i", input, ...profileArgs(), ...codecArgs(outputFor(currentToolId))];
    if ($("#removeAudio")?.checked) args.push("-an");
    return [...args, output];
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

async function runCurrentTool() {
  if (!currentFile) {
    setAlert("#toolAlert", "Selecione um video antes de continuar.", "error");
    return;
  }
  cancelled = false;
  setBusy(true);
  $("#toolOutput").innerHTML = "";
  progressLog = [];
  setAlert("#toolAlert", "Carregando engine local. Nada sera enviado para servidor.");
  updateProcessingSummary();
  try {
    try { recordOpen(currentToolId); } catch {}
    const input = inputName(currentFile);
    const ext = outputFor(currentToolId);
    const output = `output.${ext}`;
    const command = buildCommand(input, output);
    const downloadName = `${baseName(currentFile.name)}-${currentToolId.replace(/-/g, "-")}.${ext}`;
    let blob = null;
    try {
      updateVideoProgress(8, "Preparando runner isolado. Nada sera enviado para servidores do ArqKit.");
      const result = await runWasmTask({
        engine: "ffmpeg",
        action: currentToolId,
        file: currentFile,
        payload: {
          inputName: input,
          outputName: output,
          command,
          outputType: mimeForOutput(ext),
          downloadName,
        },
        onProgress: (event) => updateProgressFromMessage(event.message || "Processando no runner WASM.", event.value ?? null),
      });
      blob = result.blob;
    } catch (runnerError) {
      setAlert("#toolAlert", `Runner isolado indisponivel (${runnerError.message}). Tentando modo compativel single-thread nesta pagina.`);
      const { util } = await loadFFmpegKit();
      const engine = await getFFmpeg();
      await engine.writeFile(input, await util.fetchFile(currentFile));
      updateVideoProgress(10, "Executando compressao local no modo compativel.");
      await engine.exec(command);
      if (cancelled) throw new Error("Processamento cancelado.");
      const data = await engine.readFile(output);
      blob = new Blob([data.buffer], { type: mimeForOutput(ext) });
      try { await engine.deleteFile(input); } catch {}
      try { await engine.deleteFile(output); } catch {}
    }
    updateVideoProgress(100, "Resultado pronto para download.");
    resultButton(blob, downloadName);
    try { recordComplete(currentToolId); } catch {}
    setAlert("#toolAlert", "Pronto. Download preparado.", "success");
  } catch (error) {
    setAlert("#toolAlert", error?.message || "Falha ao processar video.", "error");
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
window.addEventListener("hashchange", route);
route();
