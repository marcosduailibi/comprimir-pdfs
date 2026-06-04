import { loadPdfJs, loadPdfLib } from "../cdn-loader.js";
import { baseName, pad } from "../tools/tool-page.js";

export async function readPdf(file, password = "") {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjsLib.getDocument({
    data,
    password: password || undefined,
    useWorkerFetch: true,
    isEvalSupported: false,
  }).promise;
}

export function dpiToScale(dpi) {
  return Math.max(0.5, Math.min(5, (Number(dpi) || 144) / 72));
}

export async function renderPageBlob(pdf, pageNumber, options = {}) {
  const page = await pdf.getPage(pageNumber);
  const scale = dpiToScale(options.dpi || 144);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: options.format !== "jpeg" });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  if (options.format === "jpeg") {
    context.fillStyle = options.background || "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  await page.render({ canvasContext: context, viewport }).promise;
  const mime = options.format === "png" ? "image/png" : options.format === "webp" ? "image/webp" : "image/jpeg";
  const quality = Math.max(0.01, Math.min(1, Number(options.quality || 0.86)));
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Falha ao gerar imagem.")), mime, quality);
  });
  canvas.width = 1;
  canvas.height = 1;
  return { blob, width: viewport.width, height: viewport.height };
}

export function pdfImageName(fileName, pageNumber, extension) {
  return `${baseName(fileName)}-pagina-${pad(pageNumber)}.${extension}`;
}

export async function copyPdfWithPdfLib(file, options = {}) {
  const PDFLib = await loadPdfLib();
  return PDFLib.PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: !!options.ignoreEncryption,
  });
}

export function hexToRgb01(hex = "#000000") {
  const clean = String(hex).replace("#", "").padEnd(6, "0").slice(0, 6);
  const value = parseInt(clean, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

export function normalizePdfText(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}
