import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateOutputSize } from "../src/js/image/image-resize.js";
import { getPresetOptions, normalizeQuality } from "../src/js/image/image-quality.js";
import { buildOutputName, reductionPercent, sanitizeFileName } from "../src/js/image/image-compressor.js";
import { formatFromFile, outputFormatForFile } from "../src/js/image/image-formats.js";
import { validateImageFile } from "../src/js/image/image-errors.js";
import { createZipBlob } from "../src/js/image/zip.js";

test("calculateOutputSize nunca aumenta imagem menor", () => {
  assert.deepEqual(calculateOutputSize(800, 600, { resizeMode: "long-edge", longEdge: 2200 }), {
    width: 800,
    height: 600,
    scale: 1,
  });
});

test("calculateOutputSize reduz pelo lado maior mantendo proporcao", () => {
  assert.deepEqual(calculateOutputSize(4000, 3000, { resizeMode: "long-edge", longEdge: 2000 }), {
    width: 2000,
    height: 1500,
    scale: 0.5,
  });
});

test("calculateOutputSize reduz por percentual", () => {
  assert.deepEqual(calculateOutputSize(1200, 800, { resizeMode: "percent", scalePercent: 50 }), {
    width: 600,
    height: 400,
    scale: 0.5,
  });
});

test("presets e qualidade sao normalizados", () => {
  assert.equal(getPresetOptions("balanced").quality, 0.72);
  assert.equal(normalizeQuality(72), 0.72);
  assert.equal(normalizeQuality(0.58), 0.58);
  assert.equal(normalizeQuality(999), 1);
});

test("nomes de saida sao sanitizados", () => {
  assert.equal(sanitizeFileName("../Minha foto final!!.jpg"), "Minha-foto-final");
  assert.equal(buildOutputName("foto 01.png", "webp"), "foto-01-comprimida.webp");
});

test("formatos sao resolvidos por mime e extensao", () => {
  assert.equal(formatFromFile({ type: "image/jpeg", name: "x.bin" }), "jpeg");
  assert.equal(formatFromFile({ type: "", name: "x.webp" }), "webp");
  assert.equal(outputFormatForFile({ type: "image/gif", name: "animado.gif" }, "original", new Set(["jpeg"])).id, "jpeg");
});

test("validateImageFile rejeita svg e aceita png", () => {
  assert.equal(validateImageFile({ type: "image/png", name: "a.png", size: 10 }), true);
  assert.throws(() => validateImageFile({ type: "image/svg+xml", name: "a.svg", size: 10 }), /SVG/);
});

test("reductionPercent calcula economia", () => {
  assert.equal(reductionPercent(1000, 400), 60);
  assert.equal(reductionPercent(1000, 1200), -20);
});

test("createZipBlob gera arquivo zip valido", async () => {
  const zip = await createZipBlob([
    { name: "a.txt", blob: new Blob(["abc"], { type: "text/plain" }) },
    { name: "b.txt", blob: new Blob(["def"], { type: "text/plain" }) },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.equal(zip.type, "application/zip");
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);
});

