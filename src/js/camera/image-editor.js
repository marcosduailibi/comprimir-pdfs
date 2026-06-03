// image-editor.js
// Operacoes simples e locais de imagem para a camera: rotacao e filtros.

export const IMAGE_PRESETS = [
  { id: "original", label: "Original" },
  { id: "document", label: "Documento" },
  { id: "grayscale", label: "Tons de cinza" },
  { id: "black-white", label: "Preto e branco" },
  { id: "photo", label: "Foto" },
];

export function normalizeRotation(degrees) {
  const n = Number(degrees) || 0;
  return ((Math.round(n / 90) * 90) % 360 + 360) % 360;
}

export function resolvePreset(id) {
  return IMAGE_PRESETS.some((p) => p.id === id) ? id : "document";
}

export function applyPixelPreset(imageData, presetId) {
  const preset = resolvePreset(presetId);
  const data = imageData.data;
  if (preset === "original" || preset === "photo") return imageData;

  const contrast = preset === "document" ? 1.12 : 1;
  const brightness = preset === "document" ? 8 : 0;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    let gray = (r * 0.299 + g * 0.587 + b * 0.114);
    gray = Math.max(0, Math.min(255, (gray - 128) * contrast + 128 + brightness));
    if (preset === "black-white") gray = gray > 170 ? 255 : 0;
    if (preset === "grayscale" || preset === "black-white") {
      data[i] = data[i + 1] = data[i + 2] = gray;
    } else {
      data[i] = Math.max(0, Math.min(255, (r - 128) * contrast + 128 + brightness));
      data[i + 1] = Math.max(0, Math.min(255, (g - 128) * contrast + 128 + brightness));
      data[i + 2] = Math.max(0, Math.min(255, (b - 128) * contrast + 128 + brightness));
    }
  }
  return imageData;
}
