export function parseTimestamp(value = "") {
  const match = String(value).trim().match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!match) return null;
  const [, h, m, s, fraction = "0"] = match;
  return (Number(h) * 3600) + (Number(m) * 60) + Number(s) + Number(`0.${fraction}`);
}

export function parseFfmpegLog(message = "") {
  const raw = String(message || "").trim();
  if (!raw || !/(frame|time|speed|bitrate|size)=/.test(raw)) return null;

  const data = {};
  for (const match of raw.matchAll(/([a-zA-Z]+)=\s*([^\s]+)/g)) {
    data[match[1]] = match[2];
  }

  const stats = { raw };
  if (data.frame) stats.frame = Number(data.frame);
  if (data.fps) stats.fps = Number(data.fps);
  if (data.q) stats.quality = data.q;
  if (data.size) stats.size = data.size;
  if (data.time) {
    stats.time = data.time;
    stats.timeSeconds = parseTimestamp(data.time);
  }
  if (data.bitrate) stats.bitrate = data.bitrate;
  if (data.speed) stats.speed = data.speed;
  return stats;
}

export function isKnownFfmpegValue(value) {
  const text = String(value ?? "").trim();
  return !!text && text !== "N/A" && text !== "--";
}

export function percentFromStats(stats, durationSeconds) {
  if (!stats || !Number.isFinite(stats.timeSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  return Math.max(1, Math.min(99, Math.round((stats.timeSeconds / durationSeconds) * 100)));
}

export function friendlyProgressMessage(stats, fallback = "Processando vídeo localmente.") {
  if (!stats) return fallback;
  const parts = [];
  if (stats.time) parts.push(`tempo ${stats.time}`);
  if (stats.speed) parts.push(`velocidade ${stats.speed}`);
  if (isKnownFfmpegValue(stats.bitrate)) parts.push(`bitrate ${stats.bitrate}`);
  return parts.length ? `Processando no navegador: ${parts.join(" - ")}.` : fallback;
}
