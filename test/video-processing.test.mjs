import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyProgressMessage, parseFfmpegLog, percentFromStats } from "../src/js/video/ffmpeg-progress.js";
import {
  detectBrowserCapabilities,
  isProcessingModeAllowed,
  processingArgsFor,
  processingSummary,
  recommendedProcessingMode,
  resolveProcessingMode,
} from "../src/js/video/video-processing-options.js";

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
  assert.equal(recommendedProcessingMode({ capabilities: mobile, fileSize: 20 * 1024 * 1024 }), "gentle");
  assert.equal(resolveProcessingMode("quality", { capabilities: mobile }), "gentle");
  assert.equal(isProcessingModeAllowed("quality", { capabilities: mobile }), false);
});

test("modo automatico aproveita navegador mais forte sem liberar qualidade por padrao", () => {
  const strong = { cores: 8, memory: 8, mobile: false, lowPower: false };
  assert.equal(recommendedProcessingMode({ capabilities: strong, fileSize: 30 * 1024 * 1024 }), "fast");
  const summary = processingSummary("auto", { capabilities: strong, fileSize: 30 * 1024 * 1024 });
  assert.equal(summary.resolved, "fast");
  assert.equal(summary.threads, 3);
});

test("args de processamento refletem codec e capacidade", () => {
  const caps = { cores: 2, memory: 4, mobile: false, lowPower: false };
  assert.deepEqual(processingArgsFor("mp4", "balanced", { capabilities: caps }), ["-preset", "veryfast", "-threads", "2"]);
  assert.deepEqual(processingArgsFor("webm", "gentle", { capabilities: caps }), ["-deadline", "good", "-cpu-used", "8", "-threads", "1"]);
});

test("detectBrowserCapabilities aceita mocks de navegador", () => {
  const caps = detectBrowserCapabilities(
    { hardwareConcurrency: 6, deviceMemory: 8 },
    { innerWidth: 1280, matchMedia: () => ({ matches: false }) },
  );
  assert.deepEqual(caps, { cores: 6, memory: 8, mobile: false, lowPower: false });
});
