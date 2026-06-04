const RUNNER_SOURCE = "arqkit-wasm-runner";
const APP_SOURCE = "arqkit";
const DEFAULT_TIMEOUT = 45000;

let runnerFrame = null;
let runnerReady = null;
const pending = new Map();

function runnerUrl() {
  return new URL("../../wasm-runner.html", import.meta.url).href;
}

function ensureListener() {
  if (ensureListener.bound) return;
  ensureListener.bound = true;
  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source !== RUNNER_SOURCE) return;
    if (message.type === "ready" && runnerReady) {
      runnerReady.resolve(message);
      return;
    }
    const task = pending.get(message.id);
    if (!task) return;
    if (message.type === "progress") {
      task.onProgress?.(message);
      return;
    }
    pending.delete(message.id);
    clearTimeout(task.timeout);
    if (message.type === "result") task.resolve(message);
    else task.reject(new Error(message.error || "Falha no runner WASM."));
  });
}

export async function ensureWasmRunner({ timeoutMs = DEFAULT_TIMEOUT } = {}) {
  ensureListener();
  if (runnerFrame?.contentWindow && runnerReady?.resolved) return runnerFrame;
  if (runnerReady?.promise) return runnerReady.promise.then(() => runnerFrame);

  runnerReady = {};
  runnerReady.promise = new Promise((resolve, reject) => {
    runnerReady.resolve = (message) => {
      runnerReady.resolved = true;
      resolve(message);
    };
    runnerReady.reject = reject;
  });

  runnerFrame = document.createElement("iframe");
  runnerFrame.src = runnerUrl();
  runnerFrame.title = "ArqKit WASM runner";
  runnerFrame.hidden = true;
  runnerFrame.setAttribute("aria-hidden", "true");
  runnerFrame.style.display = "none";
  document.body.appendChild(runnerFrame);

  const timer = setTimeout(() => {
    runnerReady.reject(new Error("wasm-runner.html nao respondeu."));
    runnerReady = null;
  }, timeoutMs);

  try {
    await runnerReady.promise;
    clearTimeout(timer);
    return runnerFrame;
  } catch (error) {
    clearTimeout(timer);
    destroyWasmRunner();
    throw error;
  }
}

export function destroyWasmRunner() {
  for (const task of pending.values()) {
    clearTimeout(task.timeout);
    task.reject(new Error("Runner WASM encerrado."));
  }
  pending.clear();
  runnerFrame?.remove();
  runnerFrame = null;
  runnerReady = null;
}

export async function runWasmTask({ engine, action, file, payload = {}, onProgress, timeoutMs = 30 * 60 * 1000 }) {
  if (!file) throw new Error("Arquivo ausente para o runner WASM.");
  const frame = await ensureWasmRunner();
  const buffer = await file.arrayBuffer();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Tempo limite ao processar no runner WASM."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, onProgress, timeout });
    frame.contentWindow.postMessage({
      source: APP_SOURCE,
      type: "run",
      id,
      engine,
      action,
      file: {
        name: file.name || "arquivo",
        type: file.type || "",
        size: file.size || buffer.byteLength,
        buffer,
      },
      payload,
    }, new URL(frame.src).origin, [buffer]);
  });

  if (!response.result?.buffer) throw new Error("Runner nao devolveu arquivo.");
  return {
    blob: new Blob([response.result.buffer], { type: response.result.type || "application/octet-stream" }),
    name: response.result.name || payload.downloadName || "resultado.bin",
    diagnostics: response.diagnostics || null,
    mode: response.mode || "wasm-runner",
  };
}

export async function getRunnerDiagnostics() {
  const frame = await ensureWasmRunner();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Tempo limite ao diagnosticar runner."));
    }, DEFAULT_TIMEOUT);
    pending.set(id, { resolve, reject, timeout });
    frame.contentWindow.postMessage({
      source: APP_SOURCE,
      type: "diagnostics",
      id,
    }, new URL(frame.src).origin);
  });
}
