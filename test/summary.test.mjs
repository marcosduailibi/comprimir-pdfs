// Testes unitários da função pura de resumo da seleção.
// Rode com:  node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSelectedFilesSummary, MAX, MB } from "../src/js/pdf-limits.js";

const mk = (sizes, pages) => sizes.map((s, i) => ({ size: s, pages: pages ? pages[i] : null }));

test("soma de 2 PDFs", () => {
  const r = calculateSelectedFilesSummary(mk([100, 250]));
  assert.equal(r.totalBytes, 350);
  assert.equal(r.largestFileBytes, 250);
  assert.equal(r.fileCount, 2);
});

test("soma de 3 PDFs (com páginas)", () => {
  const r = calculateSelectedFilesSummary(mk([10, 20, 30], [1, 2, 3]));
  assert.equal(r.totalBytes, 60);
  assert.equal(r.totalPages, 6);
  assert.equal(r.largestFileBytes, 30);
});

test("soma de 10 PDFs", () => {
  const r = calculateSelectedFilesSummary(mk(Array(10).fill(MB)));
  assert.equal(r.totalBytes, 10 * MB);
  assert.equal(r.fileCount, 10);
});

test("soma de 500 PDFs e limite restante", () => {
  const r = calculateSelectedFilesSummary(mk(Array(500).fill(2 * MB)));
  assert.equal(r.totalBytes, 500 * 2 * MB);
  assert.equal(r.fileCount, 500);
  assert.equal(r.remainingBytes, Math.max(0, MAX.total - 1000 * MB));
});

test("nunca deriva o total de apenas 1 arquivo", () => {
  const r = calculateSelectedFilesSummary(mk([5, 5, 5, 5]));
  assert.equal(r.totalBytes, 20); // e não 5
});

test("remover um PDF reduz o total", () => {
  const files = mk([100, 200, 300]);
  const before = calculateSelectedFilesSummary(files).totalBytes;
  const after = calculateSelectedFilesSummary(files.filter((_, i) => i !== 1)).totalBytes;
  assert.equal(before, 600);
  assert.equal(after, 400);
  assert.ok(after < before);
});

test("reordenar NÃO muda o total", () => {
  const files = mk([100, 200, 300]);
  const a = calculateSelectedFilesSummary(files).totalBytes;
  const b = calculateSelectedFilesSummary([files[2], files[0], files[1]]).totalBytes;
  assert.equal(a, b);
});

test("limpar lista zera o total", () => {
  const r = calculateSelectedFilesSummary([]);
  assert.equal(r.totalBytes, 0);
  assert.equal(r.fileCount, 0);
  assert.equal(r.largestFileBytes, 0);
  assert.equal(r.remainingBytes, MAX.total);
});
