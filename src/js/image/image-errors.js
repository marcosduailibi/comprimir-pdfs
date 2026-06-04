import { INPUT_MIME_TYPES, extensionFromName } from "./image-formats.js";

export class ImageToolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ImageToolError";
    this.code = code;
  }
}

export const IMAGE_ERROR_MESSAGES = {
  INVALID_FILE: "Este arquivo nao parece ser uma imagem suportada.",
  SVG_UNSUPPORTED: "SVG nao e aceito nesta versao porque precisa de sanitizacao segura.",
  UNSUPPORTED_FORMAT: "Este formato ainda nao e suportado pelo navegador.",
  CORRUPTED_IMAGE: "Nao foi possivel abrir esta imagem. O arquivo pode estar corrompido.",
  MEMORY: "O navegador nao conseguiu processar esta imagem por falta de memoria.",
  CANVAS_LIMIT: "A imagem e grande demais para o limite de canvas deste navegador.",
  WEBP_UNAVAILABLE: "Este navegador nao suporta saida em WebP. Escolha JPG ou PNG.",
  AVIF_UNAVAILABLE: "Este navegador nao suporta saida em AVIF. Escolha outro formato.",
  TOO_LARGE: "Este arquivo passa do limite permitido.",
};

export function validateImageFile(file, { maxBytes = 1024 * 1024 * 1024 } = {}) {
  if (!file || typeof file.size !== "number") {
    throw new ImageToolError("INVALID_FILE", IMAGE_ERROR_MESSAGES.INVALID_FILE);
  }
  const ext = extensionFromName(file.name);
  const type = String(file.type || "").toLowerCase();
  if (type === "image/svg+xml" || ext === "svg") {
    throw new ImageToolError("SVG_UNSUPPORTED", IMAGE_ERROR_MESSAGES.SVG_UNSUPPORTED);
  }
  if (!INPUT_MIME_TYPES.has(type) && !["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"].includes(ext)) {
    throw new ImageToolError("INVALID_FILE", IMAGE_ERROR_MESSAGES.INVALID_FILE);
  }
  if (file.size > maxBytes) {
    throw new ImageToolError("TOO_LARGE", IMAGE_ERROR_MESSAGES.TOO_LARGE);
  }
  return true;
}

export function friendlyImageError(error) {
  if (error instanceof ImageToolError) return error.message;
  if (error?.name === "AbortError") return "Compressao cancelada. Os temporarios foram limpos.";
  if (/memory|allocation|out of memory/i.test(String(error?.message || ""))) return IMAGE_ERROR_MESSAGES.MEMORY;
  return error?.message || IMAGE_ERROR_MESSAGES.CORRUPTED_IMAGE;
}

