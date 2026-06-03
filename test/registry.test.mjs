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

test("ferramentas futuras nao usam status ready", () => {
  for (const id of ["compress-image", "convert-image", "compress-video", "ocr"]) {
    const tool = TOOLS.find((item) => item.id === id);
    assert.ok(tool, id);
    assert.notEqual(tool.status, "ready", id);
    assert.equal(tool.route, "#", id);
  }
});

test("registry nao contem faturas nem fluxos de IA simulada", () => {
  const all = TOOLS.map(normalizedText).join("\n");
  for (const forbidden of ["fatura", "invoice", "nota fiscal", "resumo com ia", "traducao com ia", "chat com pdf"]) {
    assert.equal(all.includes(forbidden), false, forbidden);
  }
});
