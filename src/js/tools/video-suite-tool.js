import { CDN, loadFFmpegKit } from "../cdn-loader.js";
import { runWasmTask } from "../wasm-runner-client.js";
import {
  $,
  baseName,
  bindStandardHeader,
  downloadBlob,
  escapeHtml,
  fileExt,
  formatBytes,
  setAlert,
  setProgress,
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
    <div id="toolProgress" class="tool-progress" hidden>
      <progress max="100" value="0"></progress>
      <p data-progress-text>Preparando.</p>
    </div>
    <div id="toolOutput" class="tool-output"></div>
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
  `;
}

function renderWorkspace() {
  $("#toolWorkspace").innerHTML = `
    ${uploadMarkup()}
    <form id="toolForm" class="tool-form">
      ${controlsMarkup()}
      <div class="tool-actions">
        <button class="btn btn--primary" type="button" data-run-tool>Carregar ferramenta</button>
        <button class="btn btn--ghost" type="button" data-cancel-tool hidden>Cancelar</button>
        <button class="btn btn--ghost" type="button" data-clear-tool>Limpar tudo</button>
      </div>
    </form>
  `;
  bindUpload();
  bindControls();
  currentFile = null;
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
    preview.onloadedmetadata = () => setAlert("#toolAlert", `Video recebido. Duracao aproximada: ${formatTime(preview.duration)}.`, "info");
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
  setAlert("#toolAlert", "Temporarios limpos.");
  renderFileInfo();
}

function cancelTool() {
  cancelled = true;
  try { ffmpeg?.terminate?.(); } catch {}
  ffmpeg = null;
  setAlert("#toolAlert", "Processamento cancelado. A engine sera recarregada se voce tentar novamente.");
  setBusy(false);
}

function formatTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  const { FFmpeg, util } = await loadFFmpegKit();
  ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    const pct = Math.max(1, Math.min(99, Math.round((progress || 0) * 100)));
    setProgress("#toolProgress", pct, "Processando com ffmpeg.wasm.");
  });
  ffmpeg.on("log", ({ message }) => {
    if (message) setProgress("#toolProgress", undefined, message.slice(0, 180));
  });
  setProgress("#toolProgress", 5, "Carregando ffmpeg.wasm. O primeiro carregamento pode demorar.");
  await ffmpeg.load({
    coreURL: await util.toBlobURL(CDN.ffmpegCore, "text/javascript"),
    wasmURL: await util.toBlobURL(CDN.ffmpegCoreWasm, "application/wasm"),
    workerURL: await util.toBlobURL(CDN.ffmpegCoreWorker, "text/javascript"),
  });
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
  if (format === "webm") return ["-c:v", "libvpx-vp9", "-c:a", "libopus"];
  if (format === "gif") return ["-vf", `fps=${$("#fps")?.value || 12},scale=640:-1:flags=lanczos`];
  return ["-c:v", "libx264", "-c:a", "aac"];
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
  setAlert("#toolAlert", "Carregando engine local. Nada sera enviado para servidor.");
  try {
    try { recordOpen(currentToolId); } catch {}
    const input = inputName(currentFile);
    const ext = outputFor(currentToolId);
    const output = `output.${ext}`;
    const command = buildCommand(input, output);
    const downloadName = `${baseName(currentFile.name)}-${currentToolId.replace(/-/g, "-")}.${ext}`;
    let blob = null;
    try {
      setProgress("#toolProgress", 8, "Enviando tarefa para wasm-runner.html.");
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
        onProgress: (event) => setProgress("#toolProgress", event.value ?? undefined, event.message || "Processando no runner WASM."),
      });
      blob = result.blob;
    } catch (runnerError) {
      setAlert("#toolAlert", `Runner isolado indisponivel (${runnerError.message}). Tentando modo compativel single-thread nesta pagina.`);
      const { util } = await loadFFmpegKit();
      const engine = await getFFmpeg();
      await engine.writeFile(input, await util.fetchFile(currentFile));
      setProgress("#toolProgress", 10, `Executando: ffmpeg ${command.join(" ")}`);
      await engine.exec(command);
      if (cancelled) throw new Error("Processamento cancelado.");
      const data = await engine.readFile(output);
      blob = new Blob([data.buffer], { type: mimeForOutput(ext) });
      try { await engine.deleteFile(input); } catch {}
      try { await engine.deleteFile(output); } catch {}
    }
    setProgress("#toolProgress", 100, "Resultado pronto.");
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
