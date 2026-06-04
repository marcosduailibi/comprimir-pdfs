export const IMAGE_PRESETS = {
  light: {
    id: "light",
    label: "Leve",
    quality: 0.85,
    resizeMode: "none",
    longEdge: 0,
    description: "Preserva mais qualidade.",
  },
  balanced: {
    id: "balanced",
    label: "Equilibrado",
    quality: 0.72,
    resizeMode: "long-edge",
    longEdge: 2200,
    description: "Padrao recomendado.",
  },
  strong: {
    id: "strong",
    label: "Forte",
    quality: 0.58,
    resizeMode: "long-edge",
    longEdge: 1600,
    description: "Reduz bastante.",
  },
  maximum: {
    id: "maximum",
    label: "Maxima",
    quality: 0.42,
    resizeMode: "long-edge",
    longEdge: 1280,
    description: "Pode gerar perda visivel.",
  },
  custom: {
    id: "custom",
    label: "Personalizado",
    quality: 0.72,
    resizeMode: "none",
    longEdge: 0,
    description: "Controle manual.",
  },
};

export const DEFAULT_IMAGE_OPTIONS = {
  preset: "balanced",
  outputFormat: "original",
  quality: 0.72,
  resizeMode: "long-edge",
  maxWidth: 0,
  maxHeight: 0,
  longEdge: 2200,
  scalePercent: 100,
  backgroundColor: "#ffffff",
  removeMetadata: true,
  preventLarger: true,
};

export function normalizeQuality(value, fallback = 0.72) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) return Math.min(1, Math.max(0.01, n / 100));
  return Math.min(1, Math.max(0.01, n));
}

export function getPresetOptions(presetId) {
  const preset = IMAGE_PRESETS[presetId] || IMAGE_PRESETS.balanced;
  return {
    quality: preset.quality,
    resizeMode: preset.resizeMode,
    longEdge: preset.longEdge,
  };
}

export function mergePresetOptions(baseOptions, presetId) {
  if (presetId === "custom") return { ...baseOptions, preset: "custom" };
  return { ...baseOptions, preset: presetId, ...getPresetOptions(presetId) };
}

