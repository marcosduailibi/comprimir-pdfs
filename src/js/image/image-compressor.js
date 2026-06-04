import { outputFormatForFile } from "./image-formats.js";
import { calculateOutputSize } from "./image-resize.js";
import { normalizeQuality } from "./image-quality.js";
import { validateImageFile, ImageToolError, IMAGE_ERROR_MESSAGES } from "./image-errors.js";

export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "0 B";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(2).replace(".", ",")} GB`;
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(2).replace(".", ",")} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(1).replace(".", ",")} KB`;
  return `${bytes} B`;
}

export function sanitizeFileName(name = "imagem") {
  const withoutPath = String(name).split(/[/\\]/).pop() || "imagem";
  const withoutExt = withoutPath.replace(/\.[a-z0-9]+$/i, "");
  const normalized = withoutExt.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const safe = normalized.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (safe || "imagem").slice(0, 80);
}

export function buildOutputName(originalName, extension) {
  return `${sanitizeFileName(originalName)}-comprimida.${extension || "jpg"}`;
}

export function reductionPercent(originalBytes, outputBytes) {
  if (!originalBytes || !outputBytes) return 0;
  return Math.round((1 - outputBytes / originalBytes) * 100);
}

function isCanvasLimitError(error) {
  return /width|height|canvas|source image/i.test(String(error?.message || ""));
}

async function decodeWithImageElement(file) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new ImageToolError("UNSUPPORTED_FORMAT", IMAGE_ERROR_MESSAGES.UNSUPPORTED_FORMAT);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new ImageToolError("CORRUPTED_IMAGE", IMAGE_ERROR_MESSAGES.CORRUPTED_IMAGE));
      node.src = url;
    });
    img.close = () => {};
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeImage(file) {
  try {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        return await createImageBitmap(file);
      }
    }
    return await decodeWithImageElement(file);
  } catch (error) {
    if (error instanceof ImageToolError) throw error;
    throw new ImageToolError("CORRUPTED_IMAGE", IMAGE_ERROR_MESSAGES.CORRUPTED_IMAGE);
  }
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new ImageToolError("UNSUPPORTED_FORMAT", IMAGE_ERROR_MESSAGES.UNSUPPORTED_FORMAT);
}

export function canvasToBlob(canvas, options) {
  if (typeof canvas.convertToBlob === "function") return canvas.convertToBlob(options);
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new ImageToolError("UNSUPPORTED_FORMAT", IMAGE_ERROR_MESSAGES.UNSUPPORTED_FORMAT));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) reject(new ImageToolError("UNSUPPORTED_FORMAT", "Nao foi possivel gerar a imagem comprimida."));
      else resolve(blob);
    }, options.type, options.quality);
  });
}

function qualityFor(type, quality) {
  if (type === "image/png") return undefined;
  return normalizeQuality(quality);
}

export async function compressImageFile(file, options = {}) {
  validateImageFile(file, { maxBytes: options.maxSingleFileSizeBytes });
  const bitmap = await decodeImage(file);
  try {
    const outputFormat = outputFormatForFile(file, options.outputFormat, options.supportedFormats);
    const outputType = outputFormat.mime || "image/jpeg";
    const size = calculateOutputSize(bitmap.width, bitmap.height, options);
    const canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d", { alpha: outputType !== "image/jpeg" });
    if (!ctx) throw new ImageToolError("UNSUPPORTED_FORMAT", "Canvas indisponivel neste navegador.");

    if (outputType === "image/jpeg") {
      ctx.fillStyle = options.backgroundColor || "#ffffff";
      ctx.fillRect(0, 0, size.width, size.height);
    } else {
      ctx.clearRect(0, 0, size.width, size.height);
    }

    try {
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    } catch (error) {
      if (isCanvasLimitError(error)) throw new ImageToolError("CANVAS_LIMIT", IMAGE_ERROR_MESSAGES.CANVAS_LIMIT);
      throw error;
    }

    const encoded = await canvasToBlob(canvas, {
      type: outputType,
      quality: qualityFor(outputType, options.quality),
    });

    const shouldKeepOriginal = options.preventLarger !== false && encoded.size > file.size;
    const blob = shouldKeepOriginal ? file : encoded;
    const finalFormat = shouldKeepOriginal ? outputFormatForFile(file, "original", options.supportedFormats) : outputFormat;

    return {
      blob,
      keptOriginal: shouldKeepOriginal,
      originalBytes: file.size,
      outputBytes: blob.size,
      width: shouldKeepOriginal ? bitmap.width : size.width,
      height: shouldKeepOriginal ? bitmap.height : size.height,
      requestedWidth: size.width,
      requestedHeight: size.height,
      type: blob.type || finalFormat.mime || outputType,
      extension: finalFormat.extension || outputFormat.extension || "jpg",
      outputName: buildOutputName(file.name, finalFormat.extension || outputFormat.extension || "jpg"),
      reduction: reductionPercent(file.size, blob.size),
    };
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}

