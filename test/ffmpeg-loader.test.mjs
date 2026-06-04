import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CDN, LOCAL_VENDOR, createFFmpegLoadOptions } from "../src/js/cdn-loader.js";

function mockUtil(calls) {
  return {
    toBlobURL: async (url, type) => {
      calls.push({ url, type });
      return `blob:mock-${calls.length}`;
    },
  };
}

test("ffmpeg loader usa core single-thread por padrao", async () => {
  const calls = [];
  const options = await createFFmpegLoadOptions(mockUtil(calls));

  assert.equal("classWorkerURL" in options, false);
  assert.equal(options.coreURL, "blob:mock-1");
  assert.equal(options.wasmURL, "blob:mock-2");
  assert.equal("workerURL" in options, false);
  assert.ok(calls.some((call) => call.url === CDN.ffmpegCore));
  assert.ok(calls.some((call) => call.url === CDN.ffmpegCoreWasm));
  assert.equal(calls.some((call) => call.url === CDN.ffmpegCoreMtWorker), false);
});

test("ffmpeg loader reserva workerURL apenas para core multi-thread", async () => {
  const calls = [];
  const options = await createFFmpegLoadOptions(mockUtil(calls), { multiThread: true });

  assert.equal("classWorkerURL" in options, false);
  assert.equal(options.coreURL, "blob:mock-1");
  assert.equal(options.wasmURL, "blob:mock-2");
  assert.equal(options.workerURL, "blob:mock-3");
  assert.ok(calls.some((call) => call.url === CDN.ffmpegCoreMt));
  assert.ok(calls.some((call) => call.url === CDN.ffmpegCoreMtWasm));
  assert.ok(calls.some((call) => call.url === CDN.ffmpegCoreMtWorker));
});

test("ffmpeg vendor local inclui worker interno do pacote wrapper", () => {
  assert.equal(LOCAL_VENDOR.ffmpegClassWorker.endsWith("/814.ffmpeg.js"), true);
  assert.equal(existsSync(new URL("../assets/vendor/ffmpeg/ffmpeg.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../assets/vendor/ffmpeg/814.ffmpeg.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../assets/vendor/ffmpeg/util/index.js", import.meta.url)), true);
});
