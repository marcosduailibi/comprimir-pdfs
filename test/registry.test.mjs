import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../src/js/tools/registry.js";

function normalizedText(tool) {
  return JSON.stringify(tool)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

test("camera-to-pdf esta pronta e aponta para rota real", () => {
  const tool = TOOLS.find((item) => item.id === "camera-to-pdf");
  assert.ok(tool);
  assert.equal(tool.status, "ready");
  assert.equal(tool.route, "./camera.html");
  assert.equal(tool.isLocalFirst, true);
  assert.equal(tool.mobileOnly, true);
  assert.equal(tool.requiresCamera, true);
});

test("ferramentas ready nao usam rota placeholder", () => {
  const ready = TOOLS.filter((tool) => tool.status === "ready");
  assert.ok(ready.length >= 4);
  for (const tool of ready) assert.notEqual(tool.route, "#", tool.id);
});

test("compressor principal aponta para pagina de ferramenta ArqKit", () => {
  const tool = TOOLS.find((item) => item.id === "compress");
  assert.ok(tool);
  assert.equal(tool.status, "ready");
  assert.equal(tool.route, "./comprimir-pdf.html#tool=compress");
  assert.ok(tool.categoryIds.includes("pdf"));
});

test("compress-image esta pronta e aponta para rota real", () => {
  const tool = TOOLS.find((item) => item.id === "compress-image");
  assert.ok(tool);
  assert.equal(tool.status, "ready");
  assert.equal(tool.route, "./comprimir-imagem.html");
  assert.equal(tool.isLocalFirst, true);
  assert.equal(tool.browser, true);
  assert.equal(tool.supportsBatch, true);
  assert.ok(tool.inputExtensions.includes("webp"));
  assert.ok(tool.outputExtensions.includes("zip"));
});

test("ferramentas implementadas em lote usam rotas reais e status honesto", () => {
  const expected = {
    "convert-image": "ready",
    "pdf-to-images": "beta",
    protect: "beta",
    unlock: "beta",
    ocr: "beta",
    "compress-video": "beta",
    "convert-video": "beta",
    "cut-video": "beta",
    "extract-audio": "beta",
    "convert-to-pdf": "beta",
    "pdf-to-word": "beta",
    watermark: "ready",
  };
  for (const [id, status] of Object.entries(expected)) {
    const tool = TOOLS.find((item) => item.id === id);
    assert.ok(tool, id);
    assert.equal(tool.status, status, id);
    assert.notEqual(tool.route, "#", id);
    assert.equal(tool.isLocalFirst, true, id);
  }
});

test("registry nao contem faturas nem fluxos de IA simulada", () => {
  const all = TOOLS.map(normalizedText).join("\n");
  for (const forbidden of ["fatura", "invoice", "nota fiscal", "resumo com ia", "traducao com ia", "chat com pdf"]) {
    assert.equal(all.includes(forbidden), false, forbidden);
  }
});

test("registry nao usa placeholders nem badge desktop", () => {
  for (const tool of TOOLS) {
    assert.notEqual(tool.route, "#", tool.id);
    assert.notEqual(tool.status, "coming-soon", tool.id);
    assert.equal(normalizedText(tool).includes("desktop"), false, tool.id);
  }
});
