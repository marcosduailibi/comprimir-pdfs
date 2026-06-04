const loadedScripts = new Map();
let pdfJsPromise = null;

export const CDN = {
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs",
  pdfjsWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs",
  pdfLib: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
  ffmpeg: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js",
  ffmpegUtil: "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js",
  ffmpegCore: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js",
  ffmpegCoreWasm: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm",
  ffmpegCoreWorker: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.worker.js",
  qpdf: "https://cdn.jsdelivr.net/npm/qpdf-wasm@0.1.0/qpdf.js",
  qpdfWasm: "https://cdn.jsdelivr.net/npm/qpdf-wasm@0.1.0/qpdf.wasm",
};

export function loadScript(src, { globalName, test } = {}) {
  if (typeof test === "function" && test()) return Promise.resolve(globalName ? window[globalName] : true);
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (loadedScripts.has(src)) return loadedScripts.get(src);

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(globalName ? window[globalName] : true), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Nao foi possivel carregar ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => reject(new Error(`Nao foi possivel carregar ${src}`));
    document.head.appendChild(script);
  });
  loadedScripts.set(src, promise);
  return promise;
}

export async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import(CDN.pdfjs).then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
      return pdfjsLib;
    });
  }
  return pdfJsPromise;
}

export async function loadPdfLib() {
  const lib = await loadScript(CDN.pdfLib, { globalName: "PDFLib" });
  if (!lib) throw new Error("pdf-lib indisponivel.");
  return lib;
}

export async function loadTesseract() {
  const lib = await loadScript(CDN.tesseract, { globalName: "Tesseract" });
  if (!lib) throw new Error("Tesseract.js indisponivel.");
  return lib;
}

export async function loadMammoth() {
  const lib = await loadScript(CDN.mammoth, { globalName: "mammoth" });
  if (!lib) throw new Error("Mammoth.js indisponivel.");
  return lib;
}

export async function loadFFmpegKit() {
  await loadScript(CDN.ffmpeg, { globalName: "FFmpegWASM" });
  await loadScript(CDN.ffmpegUtil, { globalName: "FFmpegUtil" });
  if (!window.FFmpegWASM?.FFmpeg || !window.FFmpegUtil?.fetchFile) {
    throw new Error("ffmpeg.wasm indisponivel.");
  }
  return { FFmpeg: window.FFmpegWASM.FFmpeg, util: window.FFmpegUtil };
}

export async function loadQpdf() {
  const mod = await import(CDN.qpdf);
  const init = mod.default || mod;
  return init({
    locateFile: (file) => (file.endsWith(".wasm") ? CDN.qpdfWasm : file),
    print: () => {},
    printErr: () => {},
  });
}
