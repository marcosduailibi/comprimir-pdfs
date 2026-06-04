import { processingArgsFor, processingSummary } from "./video-processing-options.js";
import {
  estimateBitratesForTargetSize,
  estimateOutputSizeMB,
  normalizeMB,
  parseKbps,
  targetCompressionWarning,
} from "./video-target-size.js";

export const COMPRESSION_MODES = {
  profile: {
    label: "Preset rapido",
    description: "Usa CRF e ajustes equilibrados sem prometer tamanho exato.",
  },
  target: {
    label: "Tamanho alvo",
    description: "Calcula bitrate pelo tamanho desejado. Em MP4 pode usar 2-pass para chegar mais perto.",
  },
  crf: {
    label: "Qualidade CRF",
    description: "Controla qualidade constante. CRF maior reduz mais, mas perde qualidade.",
  },
  bitrate: {
    label: "Bitrate manual",
    description: "Voce define bitrate de video e audio diretamente.",
  },
  extreme: {
    label: "Agressivo",
    description: "Combina CRF alto, resolucao/FPS menores e audio reduzido.",
  },
};

export const RESOLUTION_OPTIONS = {
  original: { label: "Original", height: null },
  "1080p": { label: "1080p", height: 1080 },
  "720p": { label: "720p", height: 720 },
  "540p": { label: "540p", height: 540 },
  "480p": { label: "480p", height: 480 },
  "360p": { label: "360p", height: 360 },
};

const PROFILE_DEFAULTS = {
  light: { crf: 26, resolution: "1080p", fps: "original", audioKbps: 128 },
  balanced: { crf: 29, resolution: "720p", fps: "30", audioKbps: 96 },
  strong: { crf: 32, resolution: "540p", fps: "24", audioKbps: 64 },
  extreme: { crf: 36, resolution: "480p", fps: "20", audioKbps: 48 },
};

const VALID_X264_PRESETS = new Set(["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

function clampCrf(value, fallback = 29) {
  return Math.round(clamp(value || fallback, 18, 42));
}

function normalizeResolution(value, fallback = "720p") {
  return RESOLUTION_OPTIONS[value] ? value : fallback;
}

function normalizeFps(value, fallback = "original") {
  if (value === "original") return "original";
  const numeric = Math.round(Number(value) || 0);
  return [15, 20, 24, 30].includes(numeric) ? String(numeric) : fallback;
}

function videoFilterArgs({ resolution = "original", fps = "original" } = {}) {
  const filters = [];
  const resolutionInfo = RESOLUTION_OPTIONS[normalizeResolution(resolution, "original")];
  if (resolutionInfo?.height) filters.push(`scale=-2:'min(${resolutionInfo.height},ih)'`);
  if (fps !== "original") filters.push(`fps=${normalizeFps(fps)}`);
  return filters.length ? ["-vf", filters.join(",")] : [];
}

function streamMapArgs(removeAudio) {
  return removeAudio ? ["-map", "0:v:0"] : ["-map", "0:v:0", "-map", "0:a?"];
}

function codecBaseArgs(format, speedArgs) {
  if (format === "webm") return ["-c:v", "libvpx-vp9", "-c:a", "libopus", ...speedArgs];
  return ["-c:v", "libx264", "-c:a", "aac", ...speedArgs, "-movflags", "+faststart"];
}

function audioBitrateArgs(removeAudio, audioKbps) {
  if (removeAudio) return ["-an"];
  return ["-b:a", `${Math.max(16, Math.round(audioKbps || 96))}k`];
}

function formatAudioKbps(value, fallback = 96) {
  return Math.max(0, parseKbps(value, fallback));
}

function customProcessingOptions(options) {
  const custom = {};
  if (options.processingMode === "custom") {
    if (VALID_X264_PRESETS.has(options.customPreset)) custom.x264Preset = options.customPreset;
    if (options.customThreads) custom.threads = Math.max(1, Math.min(8, Number(options.customThreads) || 1));
    if (options.customWebmCpuUsed) custom.webmCpuUsed = Math.max(0, Math.min(8, Number(options.customWebmCpuUsed) || 4));
  }
  return custom;
}

function effectiveProfileOptions(options) {
  const mode = options.compressionMode || "profile";
  const profile = mode === "extreme" ? "extreme" : (options.profile || "balanced");
  const defaults = PROFILE_DEFAULTS[profile] || PROFILE_DEFAULTS.balanced;
  return {
    crf: clampCrf(mode === "crf" ? options.crf : defaults.crf, defaults.crf),
    resolution: normalizeResolution(options.resolution || defaults.resolution, defaults.resolution),
    fps: normalizeFps(options.fps || defaults.fps, defaults.fps),
    audioKbps: options.removeAudio ? 0 : formatAudioKbps(options.audioBitrate, defaults.audioKbps),
  };
}

function buildCommon({
  inputName,
  outputName,
  format,
  removeAudio,
  resolution,
  fps,
  audioKbps,
  speedArgs,
}) {
  return [
    "-y",
    "-i", inputName,
    ...streamMapArgs(removeAudio),
    ...videoFilterArgs({ resolution, fps }),
    ...codecBaseArgs(format, speedArgs),
    ...audioBitrateArgs(removeAudio, audioKbps),
    outputName,
  ];
}

function commandWithVideoBitrate(base, videoKbps) {
  const output = base[base.length - 1];
  return [...base.slice(0, -1), "-b:v", `${Math.max(80, Math.round(videoKbps))}k`, output];
}

function commandWithCrf(base, format, crf) {
  const output = base[base.length - 1];
  if (format === "webm") return [...base.slice(0, -1), "-b:v", "0", "-crf", String(clampCrf(crf)), output];
  return [...base.slice(0, -1), "-crf", String(clampCrf(crf)), output];
}

function commandWithPass(base, pass, videoKbps, passLogName, passOutput) {
  const withoutOutput = base.slice(0, -1).filter((part, index, arr) => {
    if (part === "-movflags" && arr[index + 1] === "+faststart") return false;
    if (arr[index - 1] === "-movflags") return false;
    return true;
  });
  const passArgs = [
    ...withoutOutput,
    "-b:v", `${Math.max(80, Math.round(videoKbps))}k`,
    "-pass", String(pass),
    "-passlogfile", passLogName,
  ];
  if (pass === 1) return [...passArgs, "-an", "-f", "null", passOutput];
  return [...passArgs, "-movflags", "+faststart", base[base.length - 1]];
}

export function buildCompressPlan(options) {
  const format = options.outputFormat === "webm" ? "webm" : "mp4";
  const mode = COMPRESSION_MODES[options.compressionMode] ? options.compressionMode : "profile";
  const context = options.context || {};
  const processingMode = mode === "extreme" && options.processingMode === "auto" ? "compression" : (options.processingMode || "auto");
  const speedArgs = processingArgsFor(format, processingMode, context, customProcessingOptions({ ...options, processingMode }));
  const speedSummary = processingSummary(processingMode, context);
  const profileOptions = effectiveProfileOptions({ ...options, compressionMode: mode });
  const removeAudio = !!options.removeAudio;
  const inputName = options.inputName || "input.mp4";
  const outputName = options.outputName || `output.${format}`;
  let resolution = profileOptions.resolution;
  let fps = profileOptions.fps;
  let audioKbps = removeAudio ? 0 : profileOptions.audioKbps;
  let videoKbps = parseKbps(options.videoBitrate, 1200);
  let crf = profileOptions.crf;
  let targetMB = null;
  let estimate = null;
  const commands = [];
  const fallbackCommands = [];
  const cleanupNames = [];

  if (mode === "bitrate") {
    resolution = normalizeResolution(options.resolution || "720p", "720p");
    fps = normalizeFps(options.fps || "original", "original");
    audioKbps = removeAudio ? 0 : formatAudioKbps(options.audioBitrate, 96);
    videoKbps = Math.max(80, parseKbps(options.videoBitrate, 900));
  } else if (mode === "target") {
    resolution = normalizeResolution(options.resolution || "720p", "720p");
    fps = normalizeFps(options.fps || "30", "30");
    targetMB = normalizeMB(options.targetMB, 25);
    audioKbps = removeAudio ? 0 : formatAudioKbps(options.audioBitrate, 64);
    const bitrate = estimateBitratesForTargetSize({
      targetMB,
      durationSeconds: context.durationSeconds,
      audioKbps,
      safetyFactor: Number(options.safetyFactor) || 0.92,
    });
    videoKbps = bitrate.videoKbps;
  } else if (mode === "crf") {
    resolution = normalizeResolution(options.resolution || "720p", "720p");
    fps = normalizeFps(options.fps || "original", "original");
    crf = clampCrf(options.crf, 30);
    audioKbps = removeAudio ? 0 : formatAudioKbps(options.audioBitrate, 96);
  } else if (mode === "extreme") {
    crf = clampCrf(options.crf || 36, 36);
    resolution = normalizeResolution(options.resolution || "480p", "480p");
    fps = normalizeFps(options.fps || "20", "20");
    audioKbps = removeAudio ? 0 : formatAudioKbps(options.audioBitrate, 48);
  }

  const base = buildCommon({
    inputName,
    outputName,
    format,
    removeAudio,
    resolution,
    fps,
    audioKbps,
    speedArgs,
  });

  if (mode === "target") {
    const onePass = commandWithVideoBitrate(base, videoKbps);
    const canTwoPass = format === "mp4" && options.twoPass !== false;
    if (canTwoPass) {
      const passLogName = "arqkit-ffmpeg-pass";
      commands.push(commandWithPass(base, 1, videoKbps, passLogName, "-"));
      commands.push(commandWithPass(base, 2, videoKbps, passLogName, null));
      fallbackCommands.push(onePass);
      cleanupNames.push(`${passLogName}-0.log`, `${passLogName}-0.log.mbtree`);
    } else {
      commands.push(onePass);
    }
  } else if (mode === "bitrate") {
    commands.push(commandWithVideoBitrate(base, videoKbps));
  } else {
    commands.push(commandWithCrf(base, format, crf));
  }

  const estimatedMB = estimateOutputSizeMB({
    durationSeconds: context.durationSeconds,
    videoKbps: mode === "target" || mode === "bitrate" ? videoKbps : crfToRoughBitrate(crf, resolution),
    audioKbps,
    overheadPercent: format === "mp4" ? 6 : 8,
  });
  estimate = {
    targetMB,
    estimatedMB,
    videoKbps,
    audioKbps,
    warnings: targetCompressionWarning({
      targetMB,
      durationSeconds: context.durationSeconds,
      videoKbps,
      resolution,
      fps,
    }),
  };

  if (mode === "target" && targetMB && estimatedMB > targetMB * 1.2) {
    estimate.warnings.push("O alvo parece apertado para a duracao. Ative 2-pass e considere reduzir resolucao/FPS.");
  }
  if (mode === "extreme") {
    estimate.warnings.push("Modo agressivo pode consumir muita CPU/RAM e deixar a aba lenta.");
  }
  if (speedSummary.riskMessage) estimate.warnings.push(speedSummary.riskMessage);

  return {
    mode,
    modeLabel: COMPRESSION_MODES[mode].label,
    outputFormat: format,
    outputName,
    commands,
    fallbackCommands,
    twoPass: commands.length > 1,
    cleanupNames,
    estimate,
    settings: {
      crf,
      videoKbps,
      audioKbps,
      resolution,
      fps,
      processingMode,
      processingLabel: speedSummary.label,
      processingRisk: speedSummary.risk,
    },
  };
}

function crfToRoughBitrate(crf, resolution) {
  const height = RESOLUTION_OPTIONS[resolution]?.height || 720;
  const baseline = height >= 1080 ? 1800 : height >= 720 ? 1100 : height >= 540 ? 750 : height >= 480 ? 520 : 360;
  const multiplier = Math.max(0.25, Math.min(1.6, (36 - clampCrf(crf)) / 8));
  return Math.max(120, Math.round(baseline * multiplier));
}
