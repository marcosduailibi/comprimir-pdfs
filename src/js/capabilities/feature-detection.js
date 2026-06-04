export function getRuntimeCapabilities(scope = globalThis) {
  return {
    secureContext: scope.isSecureContext === true,
    crossOriginIsolated: scope.crossOriginIsolated === true,
    sharedArrayBuffer: typeof scope.SharedArrayBuffer !== "undefined",
    webAssembly: typeof scope.WebAssembly !== "undefined",
    worker: typeof scope.Worker !== "undefined",
    webCodecs: "VideoEncoder" in scope && "VideoDecoder" in scope,
    mediaRecorder: "MediaRecorder" in scope,
    offscreenCanvas: "OffscreenCanvas" in scope,
    createImageBitmap: "createImageBitmap" in scope,
    fileApi: "File" in scope && "FileReader" in scope && "Blob" in scope,
    indexedDb: "indexedDB" in scope,
  };
}

export async function testWasmCompilation(scope = globalThis) {
  try {
    if (typeof scope.WebAssembly === "undefined") {
      return { ok: false, reason: "WebAssembly nao esta disponivel neste navegador." };
    }
    const moduleBytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d,
      0x01, 0x00, 0x00, 0x00,
    ]);
    await scope.WebAssembly.compile(moduleBytes);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "WebAssembly foi bloqueado pela politica do navegador.",
    };
  }
}

export async function testModuleWorker() {
  try {
    const blob = new Blob(['postMessage("ok")'], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const ok = await new Promise((resolve) => {
      const worker = new Worker(url, { type: "module" });
      const timeout = setTimeout(() => {
        worker.terminate();
        resolve(false);
      }, 3000);
      worker.onmessage = () => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(true);
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(false);
      };
    });
    URL.revokeObjectURL(url);
    return ok;
  } catch {
    return false;
  }
}

export function testLocalStorage() {
  try {
    const key = "__arqkit_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export async function runCompatibilityDiagnostics() {
  const capabilities = getRuntimeCapabilities();
  const wasm = await testWasmCompilation();
  const moduleWorker = await testModuleWorker();
  const diagnostics = {
    ...capabilities,
    javaScriptRunning: true,
    webAssemblyCompileWorks: wasm.ok,
    webAssemblyError: wasm.reason || "",
    moduleWorkerAvailable: moduleWorker,
    localStorageAvailable: testLocalStorage(),
    cspViolations: globalThis.__arqkitCspViolations || [],
  };
  diagnostics.probableCause = classifyCompatibilityIssue(diagnostics);
  return diagnostics;
}

export function canUseFfmpegSingleThread(caps = getRuntimeCapabilities()) {
  return caps.webAssembly && caps.worker;
}

export function canUseFfmpegMultithread(caps = getRuntimeCapabilities()) {
  return caps.webAssembly && caps.worker && caps.sharedArrayBuffer && caps.crossOriginIsolated;
}

export function canUseNativeVideoFallback(caps = getRuntimeCapabilities()) {
  return caps.mediaRecorder || caps.webCodecs;
}

export function classifyCompatibilityIssue(diagnostics) {
  const causes = [];
  if (!diagnostics.secureContext) causes.push("A pagina nao esta em contexto seguro HTTPS.");
  if (!diagnostics.webAssembly) causes.push("Este navegador nao expoe WebAssembly.");
  if (diagnostics.webAssembly && !diagnostics.webAssemblyCompileWorks) {
    causes.push("WebAssembly esta disponivel, mas a compilacao foi bloqueada por politica, extensao, CSP ou ambiente restrito.");
  }
  if (!diagnostics.worker) causes.push("Web Workers nao estao disponiveis.");
  if (!diagnostics.crossOriginIsolated) causes.push("Modo multi-thread indisponivel; usar modo compativel single-thread.");
  if (!diagnostics.sharedArrayBuffer) causes.push("SharedArrayBuffer indisponivel; ffmpeg multi-thread nao pode ser usado.");
  if (!diagnostics.webCodecs && !diagnostics.mediaRecorder) causes.push("Fallbacks nativos de video sao limitados neste navegador.");
  if (diagnostics.cspViolations?.length) causes.push("O navegador registrou violacoes de Content-Security-Policy.");
  return causes;
}

if (typeof window !== "undefined") {
  window.__arqkitCspViolations = window.__arqkitCspViolations || [];
  window.addEventListener("securitypolicyviolation", (event) => {
    window.__arqkitCspViolations.push({
      blockedURI: event.blockedURI,
      violatedDirective: event.violatedDirective,
      effectiveDirective: event.effectiveDirective,
      sourceFile: event.sourceFile,
      lineNumber: event.lineNumber,
    });
  });
}
