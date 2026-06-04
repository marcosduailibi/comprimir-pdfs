export const INPUT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
]);

export const OUTPUT_FORMATS = [
  { id: "original", label: "Manter formato original", mime: "", extension: "" },
  { id: "jpeg", label: "JPG", mime: "image/jpeg", extension: "jpg", lossy: true, supportsAlpha: false },
  { id: "png", label: "PNG", mime: "image/png", extension: "png", lossy: false, supportsAlpha: true },
  { id: "webp", label: "WebP", mime: "image/webp", extension: "webp", lossy: true, supportsAlpha: true },
  { id: "avif", label: "AVIF", mime: "image/avif", extension: "avif", lossy: true, supportsAlpha: true },
];

const EXTENSION_TO_FORMAT = new Map([
  ["jpg", "jpeg"],
  ["jpeg", "jpeg"],
  ["png", "png"],
  ["webp", "webp"],
  ["avif", "avif"],
  ["gif", "gif"],
  ["bmp", "bmp"],
]);

const MIME_TO_FORMAT = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/bmp", "bmp"],
]);

export function extensionFromName(name = "") {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function formatFromFile(fileLike = {}) {
  const type = String(fileLike.type || "").toLowerCase();
  if (MIME_TO_FORMAT.has(type)) return MIME_TO_FORMAT.get(type);
  return EXTENSION_TO_FORMAT.get(extensionFromName(fileLike.name)) || "";
}

export function outputFormatById(formatId) {
  return OUTPUT_FORMATS.find((format) => format.id === formatId) || OUTPUT_FORMATS[0];
}

export function outputFormatForFile(fileLike, requestedFormat, supported = null) {
  if (requestedFormat && requestedFormat !== "original") return outputFormatById(requestedFormat);
  const original = formatFromFile(fileLike);
  const direct = outputFormatById(original);
  if (direct.mime && (!supported || supported.has(direct.id))) return direct;
  if (!supported || supported.has("webp")) return outputFormatById("webp");
  return outputFormatById("jpeg");
}

export function supportsCanvasMimeType(type, doc = globalThis.document) {
  if (type === "image/png") return true;
  if (!doc || typeof doc.createElement !== "function") return type === "image/jpeg" || type === "image/webp";
  try {
    const canvas = doc.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL(type).startsWith(`data:${type}`);
  } catch {
    return false;
  }
}

export function getSupportedOutputFormats(doc = globalThis.document) {
  return OUTPUT_FORMATS.filter((format) => {
    if (format.id === "original") return true;
    return supportsCanvasMimeType(format.mime, doc);
  });
}

export function outputFormatIds(doc = globalThis.document) {
  return new Set(getSupportedOutputFormats(doc).map((format) => format.id));
}

