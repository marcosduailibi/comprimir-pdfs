import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyProgressMessage, parseFfmpegLog, percentFromStats } from "../src/js/video/ffmpeg-progress.js";
import { buildCompressPlan } from "../src/js/video/video-commands.js";
import {
  detectBrowserCapabilities,
  isProcessingModeAllowed,
  processingArgsFor,
  processingSummary,
  recommendedProcessingMode,
  resolveProcessingMode,
} from "../src/js/video/video-processing-options.js";
import {
  estimateBitratesForTargetSize,
  estimateOutputSizeMB,
  sizeReductionPercent,
} from "../src/js/video/video-target-size.js";

test("parseFfmpegLog transforma log tecnico em metricas", () => {
  const stats = parseFfmpegLog("frame= 976 fps=7.0 q=38.0 size= 3072kB time=00:00:32.48 bitrate= 774.6kbits/s speed=0.231x");
  assert.equal(stats.frame, 976);
  assert.equal(stats.fps, 7);
  assert.equal(stats.quality, "38.0");
  assert.equal(stats.size, "3072kB");
  assert.equal(stats.time, "00:00:32.48");
  assert.equal(Math.round(stats.timeSeconds * 100), 3248);
  assert.equal(stats.bitrate, "774.6kbits/s");
  assert.equal(stats.speed, "0.231x");
});

test("percentFromStats usa duracao real quando disponivel", () => {
  const stats = parseFfmpegLog("frame= 52 fps=21 q=45.0 size= 0kB time=00:00:01.68 bitrate= 0.2kbits/s speed=0.674x");
  assert.equal(percentFromStats(stats, 10), 17);
  assert.equal(percentFromStats(stats, 0), null);
});

test("friendlyProgressMessage esconde formato bruto do ffmpeg", () => {
  const stats = parseFfmpegLog("frame= 10 fps=5 q=30.0 size= 200kB time=00:00:05.00 bitrate= 320kbits/s speed=0.5x");
  const message = friendlyProgressMessage(stats);
  assert.equal(message.includes("frame="), false);
  assert.equal(message.includes("tempo 00:00:05.00"), true);
  assert.equal(message.includes("velocidade 0.5x"), true);
});

test("recomendacao fica conservadora em mobile ou arquivo grande", () => {
  const mobile = { cores: 4, memory: 4, mobile: true, lowPower: true };
  assert.equal(recommendedProcessingMode({ capabilities: mobile, fileSize: 20 * 1024 * 1024 }), "compatible");
  assert.equal(resolveProcessingMode("maximum", { capabilities: mobile }), "maximum");
  assert.equal(isProcessingModeAllowed("maximum", { capabilities: mobile }), true);
});

test("modo automatico aproveita navegador mais forte sem liberar qualidade por padrao", () => {
  const strong = { cores: 8, memory: 8, mobile: false, lowPower: false };
  assert.equal(recommendedProcessingMode({ capabilities: strong, fileSize: 30 * 1024 * 1024 }), "speed");
  const summary = processingSummary("auto", { capabilities: strong, fileSize: 30 * 1024 * 1024 });
  assert.equal(summary.resolved, "speed");
  assert.equal(summary.threads, 3);
});

test("args de processamento refletem codec e capacidade", () => {
  const caps = { cores: 2, memory: 4, mobile: false, lowPower: false };
  assert.deepEqual(processingArgsFor("mp4", "balanced", { capabilities: caps }), ["-preset", "fast", "-threads", "2"]);
  assert.deepEqual(processingArgsFor("webm", "compatible", { capabilities: caps }), ["-deadline", "good", "-cpu-used", "8", "-threads", "1"]);
  assert.deepEqual(processingArgsFor("mp4", "custom", { capabilities: caps }, { x264Preset: "slow", threads: 2 }), ["-preset", "slow", "-threads", "2"]);
});

test("detectBrowserCapabilities aceita mocks de navegador", () => {
  const caps = detectBrowserCapabilities(
    { hardwareConcurrency: 6, deviceMemory: 8 },
    { innerWidth: 1280, matchMedia: () => ({ matches: false }) },
  );
  assert.deepEqual(caps, { cores: 6, memory: 8, mobile: false, lowPower: false });
});

test("tamanho alvo calcula bitrate com margem de seguranca", () => {
  const estimate = estimateBitratesForTargetSize({
    targetMB: 26,
    durationSeconds: 60,
    audioKbps: 64,
    safetyFactor: 0.92,
  });
  assert.equal(estimate.totalKbps, 3549);
  assert.equal(estimate.safeTotalKbps, 3265);
  assert.equal(estimate.videoKbps, 3201);
  assert.equal(Math.round(estimateOutputSizeMB({ durationSeconds: 60, videoKbps: 3201, audioKbps: 64 })), 26);
  assert.equal(sizeReductionPercent(48 * 1024 * 1024, 26 * 1024 * 1024), 46);
});

test("plano de tamanho alvo em MP4 usa 2-pass com fallback 1-pass", () => {
  const plan = buildCompressPlan({
    inputName: "in.mp4",
    outputName: "out.mp4",
    outputFormat: "mp4",
    compressionMode: "target",
    targetMB: 26,
    audioBitrate: "64k",
    resolution: "720p",
    fps: "30",
    twoPass: true,
    processingMode: "compression",
    context: {
      durationSeconds: 60,
      fileSize: 48 * 1024 * 1024,
      capabilities: { cores: 8, memory: 8, mobile: false, lowPower: false },
    },
  });
  assert.equal(plan.twoPass, true);
  assert.equal(plan.commands.length, 2);
  assert.equal(plan.fallbackCommands.length, 1);
  assert.ok(plan.commands[0].includes("-pass"));
  assert.ok(plan.commands[0].includes("1"));
  assert.ok(plan.commands[1].includes("2"));
  assert.ok(plan.commands[1].includes("-b:v"));
});

test("plano agressivo combina CRF alto com resolucao e FPS menores", () => {
  const plan = buildCompressPlan({
    inputName: "in.mp4",
    outputName: "out.mp4",
    outputFormat: "mp4",
    compressionMode: "extreme",
    removeAudio: true,
    processingMode: "maximum",
    context: {
      durationSeconds: 60,
      fileSize: 48 * 1024 * 1024,
      capabilities: { cores: 8, memory: 8, mobile: false, lowPower: false },
    },
  });
  assert.equal(plan.settings.crf, 36);
  assert.equal(plan.settings.resolution, "480p");
  assert.equal(plan.settings.fps, "20");
  assert.equal(plan.settings.audioKbps, 0);
  assert.ok(plan.commands[0].includes("-an"));
  assert.equal(plan.commands[0].includes("0:a?"), false);
  assert.ok(plan.commands[0].includes("-crf"));
});
