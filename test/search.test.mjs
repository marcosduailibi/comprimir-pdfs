// Testes da busca pura de ferramentas.  Rode com:  node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchTools, normalize } from "../src/js/tools/search.js";
import { TOOLS } from "../src/js/tools/registry.js";

const ids = (arr) => arr.map((t) => t.id);

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

test("busca por alias em português", () => {
  assert.ok(ids(searchTools("unir", TOOLS)).includes("merge"));
  assert.ok(ids(searchTools("mesclar", TOOLS)).includes("merge"));
  assert.ok(ids(searchTools("separar", TOOLS)).includes("split"));
});

test("busca por alias em inglês", () => {
  assert.ok(ids(searchTools("merge", TOOLS)).includes("merge"));
  assert.ok(ids(searchTools("split", TOOLS)).includes("split"));
  assert.ok(ids(searchTools("compress", TOOLS)).includes("compress"));
});

test("busca sem acento casa com nome acentuado", () => {
  // "Marca d’água" deve ser encontrada por "agua"
  assert.ok(ids(searchTools("agua", TOOLS)).includes("watermark"));
});

test("busca por extensão", () => {
  assert.ok(ids(searchTools("jpg", TOOLS)).includes("images-to-pdf"));
});

test("busca tolerante a maiúsculas/minúsculas", () => {
  assert.deepEqual(ids(searchTools("JUNTAR", TOOLS)), ids(searchTools("juntar", TOOLS)));
});

test("nome que começa com o termo vem antes", () => {
  const r = searchTools("compri", TOOLS);
  assert.equal(r[0].id, "compress");
});

test("sem correspondência retorna lista vazia", () => {
  assert.equal(searchTools("xyzqwk", TOOLS).length, 0);
});

test("todos os termos precisam casar (AND)", () => {
  // "juntar comprimir" deve achar a ferramenta combinada
  assert.ok(ids(searchTools("juntar comprimir", TOOLS)).includes("merge_then_compress"));
});
