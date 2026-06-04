export const BYTES_PER_MB = 1024 * 1024;

export function parseKbps(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = String(value ?? "").trim().toLowerCase().replace(",", ".");
  if (!text) return fallback;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(k|kb|kbps|m|mb|mbps)?$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;
  const unit = match[2] || "k";
  if (unit.startsWith("m")) return Math.max(0, Math.round(amount * 1000));
  return Math.max(0, Math.round(amount));
}

export function normalizeMB(value, fallback = 25) {
  const numeric = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function estimateBitratesForTargetSize({
  targetMB,
  durationSeconds,
  audioKbps = 96,
  safetyFactor = 0.92,
}) {
  const seconds = Math.max(1, Number(durationSeconds) || 1);
  const totalKbps = (Math.max(0.1, Number(targetMB) || 0.1) * 8192) / seconds;
  const safeTotalKbps = totalKbps * Math.max(0.55, Math.min(0.98, Number(safetyFactor) || 0.92));
  const safeAudioKbps = Math.max(0, Number(audioKbps) || 0);
  const videoKbps = Math.max(80, Math.floor(safeTotalKbps - safeAudioKbps));
  return {
    totalKbps: Math.floor(totalKbps),
    safeTotalKbps: Math.floor(safeTotalKbps),
    videoKbps,
    audioKbps: safeAudioKbps,
  };
}

export function estimateOutputSizeMB({
  durationSeconds,
  videoKbps,
  audioKbps = 0,
  overheadPercent = 6,
}) {
  const seconds = Math.max(1, Number(durationSeconds) || 1);
  const totalKbps = Math.max(0, Number(videoKbps) || 0) + Math.max(0, Number(audioKbps) || 0);
  const megabits = (totalKbps * seconds) / 1000;
  const megabytes = megabits / 8;
  return megabytes * (1 + (Number(overheadPercent) || 0) / 100);
}

export function sizeReductionPercent(originalBytes, outputBytes) {
  const original = Number(originalBytes) || 0;
  const output = Number(outputBytes) || 0;
  if (original <= 0 || output <= 0) return 0;
  return Math.max(-999, Math.round((1 - output / original) * 100));
}

export function targetCompressionWarning({ targetMB, durationSeconds, videoKbps, resolution, fps }) {
  const warnings = [];
  if (!durationSeconds) warnings.push("Sem duração detectada, a estimativa pode variar bastante.");
  if (videoKbps < 250) warnings.push("O bitrate de vídeo ficou muito baixo; a imagem pode perder bastante detalhe.");
  if (targetMB && targetMB < 5) warnings.push("Tamanho alvo muito pequeno costuma exigir cortes fortes em resolução, FPS ou áudio.");
  if (resolution === "360p") warnings.push("Resolução 360p prioriza tamanho mínimo e reduz nitidez.");
  if (fps && fps !== "original" && Number(fps) <= 20) warnings.push("FPS baixo deixa movimentos menos fluidos.");
  return warnings;
}
