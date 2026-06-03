// capture.js
// Captura frames da camera e importa imagens como Blob/ObjectURL. Evita base64.

let pageId = 0;

export function nextPageId() {
  pageId += 1;
  return "page-" + pageId;
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.88) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("CANVAS_TO_BLOB_FAILED")), type, quality);
  });
}

export async function captureFrame(video, { quality = 0.88 } = {}) {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(video, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return { blob, width, height };
}

export async function readImageDimensions(blob) {
  if (typeof createImageBitmap !== "undefined") {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = reject;
      node.src = url;
    });
    return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createPageFromBlob(blob, name = "pagina.jpg") {
  const { width, height } = await readImageDimensions(blob);
  const url = URL.createObjectURL(blob);
  return {
    id: nextPageId(),
    blob,
    url,
    name,
    width,
    height,
    rotation: 0,
    preset: "document",
  };
}

export async function createPagesFromFiles(files) {
  const accepted = Array.from(files || []).filter((file) => /^image\//i.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name));
  const pages = [];
  for (const file of accepted) pages.push(await createPageFromBlob(file, file.name || "imagem.jpg"));
  return pages;
}
