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

test("registry nao contem faturas nem fluxos de IA simulada", () => {
  const all = TOOLS.map(normalizedText).join("\n");
  for (const forbidden of ["fatura", "invoice", "nota fiscal", "resumo com ia", "traducao com ia", "chat com pdf"]) {
    assert.equal(all.includes(forbidden), false, forbidden);
  }
});
