const PRESET_LONG_EDGES = {
  "preset-web": 1920,
  "preset-email": 1600,
  thumbnail: 640,
};

function positiveInt(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fitWithin(width, height, maxWidth, maxHeight) {
  const ratios = [];
  if (maxWidth > 0 && width > maxWidth) ratios.push(maxWidth / width);
  if (maxHeight > 0 && height > maxHeight) ratios.push(maxHeight / height);
  const ratio = ratios.length ? Math.min(...ratios) : 1;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scale: ratio,
  };
}

export function calculateOutputSize(width, height, options = {}) {
  const sourceWidth = positiveInt(width);
  const sourceHeight = positiveInt(height);
  if (!sourceWidth || !sourceHeight) throw new Error("Dimensoes da imagem invalidas.");

  const mode = options.resizeMode || "none";
  if (mode === "none") return { width: sourceWidth, height: sourceHeight, scale: 1 };

  if (mode === "width") return fitWithin(sourceWidth, sourceHeight, positiveInt(options.maxWidth), 0);
  if (mode === "height") return fitWithin(sourceWidth, sourceHeight, 0, positiveInt(options.maxHeight));
  if (mode === "custom") return fitWithin(sourceWidth, sourceHeight, positiveInt(options.maxWidth), positiveInt(options.maxHeight));

  if (mode === "percent") {
    const pct = Math.min(100, Math.max(1, Number(options.scalePercent) || 100));
    const scale = Math.min(1, pct / 100);
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
      scale,
    };
  }

  const edge = PRESET_LONG_EDGES[mode] || positiveInt(options.longEdge);
  if (!edge) return { width: sourceWidth, height: sourceHeight, scale: 1 };
  if (sourceWidth >= sourceHeight) return fitWithin(sourceWidth, sourceHeight, edge, 0);
  return fitWithin(sourceWidth, sourceHeight, 0, edge);
}

export function resizeSummary(size) {
  if (!size) return "Dimensoes nao detectadas";
  const pct = Math.round((size.scale || 1) * 100);
  return `${size.width}x${size.height} (${pct}%)`;
}

