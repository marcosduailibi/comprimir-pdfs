// pdf-generator.js
// Gera PDF localmente no navegador a partir de fotos/importacoes de imagem.

import { applyPixelPreset, normalizeRotation, resolvePreset } from "./image-editor.js";

export const PDF_PAGE_SIZES = Object.freeze({
  auto: null,
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
});

export const MARGINS = Object.freeze({
  none: 0,
  small: 18,
  medium: 36,
  large: 54,
});

export function resolvePdfPageSize(pageSize, imageWidth, imageHeight, orientation = "auto") {
  let size = PDF_PAGE_SIZES[pageSize] || null;
  if (!size) {
    const w = Math.max(1, Number(imageWidth) || 595.28);
    const h = Math.max(1, Number(imageHeight) || 841.89);
    const ratio = w / h;
    size = ratio >= 1 ? [841.89, 595.28] : [595.28, 841.89];
  }
  let [width, height] = size;
  const landscape = width > height;
  if (orientation === "portrait" && landscape) [width, height] = [height, width];
  if (orientation === "landscape" && !landscape) [width, height] = [height, width];
  return [width, height];
}

export function calculateImagePlacement(pageWidth, pageHeight, imageWidth, imageHeight, margin = 0, fit = "contain") {
  const boxWidth = Math.max(1, pageWidth - margin * 2);
  const boxHeight = Math.max(1, pageHeight - margin * 2);
  const scale = fit === "cover"
    ? Math.max(boxWidth / imageWidth, boxHeight / imageHeight)
    : Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: margin + (boxWidth - width) / 2,
    y: margin + (boxHeight - height) / 2,
    width,
    height,
  };
}

function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("CANVAS_TO_BLOB_FAILED")), "image/jpeg", quality);
  });
}

function targetLongEdge(dpi, pageWidth, pageHeight) {
  const n = Math.round(Number(dpi) || 144);
  const inches = Math.max(pageWidth, pageHeight) / 72;
  return Math.max(320, Math.round(n * inches));
}

async function pageToJpegBytes(page, { quality = 0.84, dpi = 144, pageWidth, pageHeight } = {}) {
  const img = await loadImage(page.blob);
  const rotation = normalizeRotation(page.rotation);
  const swapped = rotation === 90 || rotation === 270;
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const maxLong = targetLongEdge(dpi, pageWidth, pageHeight);
  const long = Math.max(sourceWidth, sourceHeight);
  const scale = long > maxLong ? maxLong / long : 1;
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvasWidth = swapped ? drawHeight : drawWidth;
  const canvasHeight = swapped ? drawWidth : drawHeight;
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(canvasWidth, canvasHeight)
    : Object.assign(document.createElement("canvas"), { width: canvasWidth, height: canvasHeight });
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  if (rotation === 90) { ctx.translate(canvasWidth, 0); ctx.rotate(Math.PI / 2); }
  else if (rotation === 180) { ctx.translate(canvasWidth, canvasHeight); ctx.rotate(Math.PI); }
  else if (rotation === 270) { ctx.translate(0, canvasHeight); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  ctx.putImageData(applyPixelPreset(imageData, resolvePreset(page.preset)), 0, 0);
  const blob = await canvasToBlob(canvas, quality);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width: canvasWidth,
    height: canvasHeight,
    size: blob.size,
  };
}

export async function generatePdfFromImagePages(pages, options = {}, onProgress = null) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error("NO_PAGES");
  const { PDFDocument } = await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm");
  const pdfDoc = await PDFDocument.create();
  const margin = MARGINS[options.margin || "small"] ?? MARGINS.small;
  const fit = options.fit || "contain";
  const quality = options.quality || 0.84;
  const dpi = options.dpi || 144;
  let imageBytes = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const [pageWidth, pageHeight] = resolvePdfPageSize(options.pageSize || "a4", page.width, page.height, options.orientation || "auto");
    const jpeg = await pageToJpegBytes(page, { quality, dpi, pageWidth, pageHeight });
    imageBytes += jpeg.size;
    const embedded = await pdfDoc.embedJpg(jpeg.bytes);
    const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
    const placement = calculateImagePlacement(pageWidth, pageHeight, jpeg.width, jpeg.height, margin, fit);
    pdfPage.drawImage(embedded, placement);
    onProgress?.({ index: i + 1, total: pages.length, pageName: page.name });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  return {
    bytes,
    blob: new Blob([bytes], { type: "application/pdf" }),
    stats: { pages: pages.length, imageBytes, finalBytes: bytes.length, dpi },
  };
}
