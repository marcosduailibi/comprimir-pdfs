import { CDN, LOCAL_VENDOR, createFFmpegLoadOptions, isReachable, localOrCdn, vendorUrl } from "./cdn-loader.js?v=2";
import { runCompatibilityDiagnostics } from "./capabilities/feature-detection.js?v=1";

const RUNNER_SOURCE = "arqkit-wasm-runner";
const APP_SOURCE = "arqkit";

let diagnostics = null;
let ffmpeg = null;
let qpdf = null;
let activeFfmpegTask = null;

function post(message, transfer = []) {
  const target = window.parent && window.parent !== window ? window.parent : window.opener;
  target?.postMessage({ source: RUNNER_SOURCE, ...message }, "*", transfer);
}

function progress(id, message, value = null) {
  post({ type: "progress", id, message, value });
  setUiMessage(message);
}

function setUiMessage(message) {
  const pre = document.querySelector("#diagnosticsJson");
  if (pre && message) {
    pre.hidden = false;
    pre.textContent = message;
  }
}

function renderDiagnostics(data) {
  const grid = document.querySelector("#statusGrid");
  const pre = document.querySelector("#diagnosticsJson");
  if (!grid || !pre) return;
  const items = [
    ["Contexto seguro", data.secureContext],
    ["crossOriginIsolated", data.crossOriginIsolated],
    ["SharedArrayBuffer", data.sharedArrayBuffer],
    ["WebAssembly", data.webAssembly],
    ["WASM compile", data.webAssemblyCompileWorks],
    ["Worker", data.worker],
    ["Module Worker", data.moduleWorkerAvailable],
    ["WebCodecs", data.webCodecs],
    ["MediaRecorder", data.mediaRecorder],
  ];
  grid.innerHTML = items.map(([label, ok]) => `
    <div class="item">
      <span>${label}</span>
      <strong data-ok="${ok ? "true" : "false"}">${ok ? "Disponivel" : "Indisponivel"}</strong>
    </div>
  `).join("");
  pre.hidden = false;
  pre.textContent = JSON.stringify(data, null, 2);
}

async function runDiagnostics() {
  diagnostics = await runCompatibilityDiagnostics();
  diagnostics.assets = {
    ffmpegLocal: await isReachable(vendorUrl(LOCAL_VENDOR.ffmpegCoreWasm)),
    ffmpegClassWorkerLocal: await isReachable(vendorUrl(LOCAL_VENDOR.ffmpegClassWorker)),
    qpdfLocal: await isReachable(vendorUrl(LOCAL_VENDOR.qpdfWasm)),
  };
  renderDiagnostics(diagnostics);
  return diagnostics;
}

function loadScript(src, globalTest) {
  if (globalTest?.()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error(`Falha ao carregar ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

async function loadFFmpeg(id) {
  if (ffmpeg) return ffmpeg;
  const ffmpegUrl = await localOrCdn(LOCAL_VENDOR.ffmpeg, CDN.ffmpeg);
  const utilUrl = await localOrCdn(LOCAL_VENDOR.ffmpegUtil, CDN.ffmpegUtil);
  await loadScript(ffmpegUrl, () => !!window.FFmpegWASM?.FFmpeg);
  await loadScript(utilUrl, () => !!window.FFmpegUtil?.fetchFile);
  const { FFmpeg } = window.FFmpegWASM || {};
  const util = window.FFmpegUtil;
  if (!FFmpeg || !util?.toBlobURL) throw new Error("ffmpeg.wasm indisponivel neste runner.");

  ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress: pct }) => {
    const task = activeFfmpegTask || { id, stageIndex: 0, stageCount: 1 };
    const stageCount = Math.max(1, task.stageCount || 1);
    const stagePct = Math.max(0, Math.min(1, pct || 0));
    const overall = Math.round(10 + (((task.stageIndex || 0) + stagePct) / stageCount) * 85);
    progress(task.id, task.stageLabel || "Processando com ffmpeg.wasm no runner isolado.", overall);
  });
  ffmpeg.on("log", ({ message }) => {
    const task = activeFfmpegTask || { id };
    if (message) progress(task.id, message.slice(0, 180));
  });
  progress(id, "Carregando ffmpeg.wasm sob demanda.", 5);
  await ffmpeg.load(await createFFmpegLoadOptions(util));
  return ffmpeg;
}

async function loadQpdf(id) {
  if (qpdf) return qpdf;
  progress(id, "Carregando qpdf.wasm sob demanda.", 10);
  const qpdfUrl = await localOrCdn(LOCAL_VENDOR.qpdf, CDN.qpdf);
  const wasmUrl = await localOrCdn(LOCAL_VENDOR.qpdfWasm, CDN.qpdfWasm);
  const mod = await import(qpdfUrl);
  const init = mod.default || mod;
  qpdf = await init({
    locateFile: (file) => file.endsWith(".wasm") ? wasmUrl : file,
    print: () => {},
    printErr: () => {},
  });
  return qpdf;
}

async function runQpdfTask(message) {
  const engine = await loadQpdf(message.id);
  const { payload, file } = message;
  const inputName = payload.inputName || "input.pdf";
  const outputName = payload.outputName || "output.pdf";
  engine.FS.writeFile(inputName, new Uint8Array(file.buffer));
  progress(message.id, "Executando qpdf.wasm localmente.", 45);
  const code = engine.callMain([...(payload.args || []), inputName, outputName]);
  if (code && code !== 0) throw new Error(`qpdf retornou codigo ${code}.`);
  const output = engine.FS.readFile(outputName);
  try { engine.FS.unlink(inputName); } catch {}
  try { engine.FS.unlink(outputName); } catch {}
  const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
  post({
    type: "result",
    id: message.id,
    mode: "wasm-runner:qpdf",
    diagnostics,
    result: {
      name: payload.downloadName || outputName,
      type: "application/pdf",
      buffer,
    },
  }, [buffer]);
}

async function runFfmpegTask(message) {
  const engine = await loadFFmpeg(message.id);
  const { payload, file } = message;
  const inputName = payload.inputName || "input.bin";
  const outputName = payload.outputName || "output.bin";
  const commands = Array.isArray(payload.commands) && payload.commands.length ? payload.commands : [payload.command || []];
  if (!commands.every((command) => Array.isArray(command) && command.length)) throw new Error("Comando ffmpeg ausente.");
  await engine.writeFile(inputName, new Uint8Array(file.buffer));
  try {
    for (const [index, command] of commands.entries()) {
      activeFfmpegTask = {
        id: message.id,
        stageIndex: index,
        stageCount: commands.length,
        stageLabel: commands.length > 1
          ? `Etapa ${index + 1} de ${commands.length}: processando localmente.`
          : "Processando com ffmpeg.wasm no runner isolado.",
      };
      progress(message.id, `Executando ffmpeg etapa ${index + 1}/${commands.length}: ${command.join(" ")}`, Math.round(10 + (index / commands.length) * 85));
      await engine.exec(command);
    }
  } finally {
    activeFfmpegTask = null;
  }
  const output = await engine.readFile(outputName);
  try { await engine.deleteFile(inputName); } catch {}
  try { await engine.deleteFile(outputName); } catch {}
  for (const name of payload.cleanupNames || []) {
    try { await engine.deleteFile(name); } catch {}
  }
  const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
  post({
    type: "result",
    id: message.id,
    mode: "wasm-runner:ffmpeg",
    diagnostics,
    result: {
      name: payload.downloadName || outputName,
      type: payload.outputType || "application/octet-stream",
      buffer,
    },
  }, [buffer]);
}

async function handleRun(message) {
  try {
    diagnostics ||= await runDiagnostics();
    if (!diagnostics.webAssemblyCompileWorks) {
      throw new Error(diagnostics.webAssemblyError || "WebAssembly bloqueado neste navegador.");
    }
    if (message.engine === "qpdf") await runQpdfTask(message);
    else if (message.engine === "ffmpeg") await runFfmpegTask(message);
    else throw new Error("Engine desconhecida no runner WASM.");
  } catch (error) {
    post({
      type: "error",
      id: message.id,
      error: error?.message || "Falha no runner WASM.",
      diagnostics,
    });
  }
}

window.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.source !== APP_SOURCE) return;
  if (message.type === "diagnostics") {
    const data = await runDiagnostics();
    post({ type: "result", id: message.id, diagnostics: data, result: { buffer: new ArrayBuffer(0), type: "application/json", name: "diagnostics.json" } });
    return;
  }
  if (message.type === "run") handleRun(message);
});

document.querySelector("#runDiagnostics")?.addEventListener("click", runDiagnostics);

runDiagnostics().then((data) => {
  post({ type: "ready", diagnostics: data });
}).catch((error) => {
  post({ type: "ready", diagnostics: { error: error?.message || "Diagnostico indisponivel." } });
});
