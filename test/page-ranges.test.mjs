// Testes do parser de intervalos e do plano de divisão.  node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePageRanges, planSplit, parseRangeTokens } from "../src/js/pdf/page-ranges.js";

test("parsePageRanges: lista plana, única e ordenada", () => {
  assert.deepEqual(parsePageRanges("1-3, 5, 10-12", 20), [1, 2, 3, 5, 10, 11, 12]);
  assert.deepEqual(parsePageRanges("3,1,2", 5), [1, 2, 3]);
  assert.deepEqual(parsePageRanges("2-4, 3-5", 10), [2, 3, 4, 5]); // sem duplicatas
});

test("parsePageRanges: erros específicos", () => {
  assert.throws(() => parsePageRanges("", 10), /EMPTY/);
  assert.throws(() => parsePageRanges("abc", 10), /INVALID/);
  assert.throws(() => parsePageRanges("5-2", 10), /INVERTED/);
  assert.throws(() => parsePageRanges("1-99", 10), /OUT_OF_RANGE/);
  assert.throws(() => parsePageRanges("0", 10), /OUT_OF_RANGE/);
});

test("planSplit extract: um PDF com as páginas escolhidas", () => {
  const g = planSplit("extract", { pageCount: 12, rangesText: "1-3, 8" });
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].pages, [1, 2, 3, 8]);
});

test("planSplit ranges: um PDF por intervalo", () => {
  const g = planSplit("ranges", { pageCount: 12, rangesText: "1-3, 5, 8-10" });
  assert.equal(g.length, 3);
  assert.deepEqual(g[0].pages, [1, 2, 3]);
  assert.deepEqual(g[1].pages, [5]);
  assert.deepEqual(g[2].pages, [8, 9, 10]);
});

test("planSplit everyN: grupos de N páginas consecutivas", () => {
  const g = planSplit("everyN", { pageCount: 10, n: 4 });
  assert.equal(g.length, 3);
  assert.deepEqual(g[0].pages, [1, 2, 3, 4]);
  assert.deepEqual(g[1].pages, [5, 6, 7, 8]);
  assert.deepEqual(g[2].pages, [9, 10]);
});

test("planSplit all: um PDF por página", () => {
  const g = planSplit("all", { pageCount: 3 });
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((x) => x.pages), [[1], [2], [3]]);
});

test("planSplit oddEven: ímpares e pares", () => {
  const g = planSplit("oddEven", { pageCount: 5 });
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].pages, [1, 3, 5]);
  assert.deepEqual(g[1].pages, [2, 4]);
});

test("planSplit: total de páginas dos grupos = pageCount (modos que cobrem tudo)", () => {
  for (const mode of ["everyN", "all", "oddEven"]) {
    const g = planSplit(mode, { pageCount: 9, n: 2 });
    const total = g.reduce((s, x) => s + x.pages.length, 0);
    assert.equal(total, 9, `modo ${mode}`);
  }
});

test("planSplit: sem páginas lança NO_PAGES", () => {
  assert.throws(() => planSplit("all", { pageCount: 0 }), /NO_PAGES/);
});

test("parseRangeTokens aceita traço unicode e espaços", () => {
  const t = parseRangeTokens("1 – 3 , 5");
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].start, t[0].end], [1, 3]);
});
