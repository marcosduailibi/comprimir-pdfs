import { test } from "node:test";
import assert from "node:assert/strict";
import { searchTools, normalize } from "../src/js/tools/search.js";
import { TOOLS } from "../src/js/tools/registry.js";

const ids = (arr) => arr.map((tool) => tool.id);

test("query vazia retorna todas", () => {
  assert.equal(searchTools("", TOOLS).length, TOOLS.length);
  assert.equal(searchTools("   ", TOOLS).length, TOOLS.length);
});

test("normalize remove acentos e baixa caixa", () => {
  assert.equal(normalize("Compressão ÁÉÍ"), "compressao aei");
});

test("busca por nome", () => {
  assert.ok(ids(searchTools("comprimir", TOOLS)).includes("compress"));
});

test("busca por alias em portugues", () => {
  assert.ok(ids(searchTools("unir", TOOLS)).includes("merge"));
  assert.ok(ids(searchTools("mesclar", TOOLS)).includes("merge"));
  assert.ok(ids(searchTools("separar", TOOLS)).includes("split"));
});

test("busca por alias em ingles", () => {
  assert.ok(ids(searchTools("merge", TOOLS)).includes("merge"));
  assert.ok(ids(searchTools("split", TOOLS)).includes("split"));
  assert.ok(ids(searchTools("compress", TOOLS)).includes("compress"));
});

test("busca sem acento casa com nome acentuado", () => {
  assert.ok(ids(searchTools("agua", TOOLS)).includes("watermark"));
});

test("busca por extensao", () => {
  assert.ok(ids(searchTools("jpg", TOOLS)).includes("images-to-pdf"));
});

test("busca por categorias e keywords do ArqKit", () => {
  assert.ok(ids(searchTools("mp4", TOOLS)).includes("compress-video"));
  assert.ok(ids(searchTools("senha pdf", TOOLS)).includes("protect"));
  assert.ok(ids(searchTools("ocr", TOOLS)).includes("ocr"));
});

test("busca tolerante a maiusculas/minusculas", () => {
  assert.deepEqual(ids(searchTools("JUNTAR", TOOLS)), ids(searchTools("juntar", TOOLS)));
});

test("nome que comeca com o termo vem antes", () => {
  const result = searchTools("compri", TOOLS);
  assert.equal(result[0].id, "compress");
});

test("sem correspondencia retorna lista vazia", () => {
  assert.equal(searchTools("xyzqwk", TOOLS).length, 0);
});

test("todos os termos precisam casar (AND)", () => {
  assert.ok(ids(searchTools("juntar comprimir", TOOLS)).includes("merge_then_compress"));
});
