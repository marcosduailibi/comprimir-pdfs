import { test } from "node:test";
import assert from "node:assert/strict";
import { getInitialTheme, getStoredTheme, normalizeTheme, THEME_KEY, LEGACY_THEME_KEY } from "../src/js/theme.js";

function storage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    dump: () => Object.fromEntries(data.entries()),
  };
}

test("normalizeTheme aceita somente light/dark", () => {
  assert.equal(normalizeTheme("light"), "light");
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(normalizeTheme("blue"), null);
});

test("getStoredTheme migra chave antiga para pdfTools.theme.v1", () => {
  const s = storage({ [LEGACY_THEME_KEY]: "dark" });
  assert.equal(getStoredTheme(s), "dark");
  assert.equal(s.dump()[THEME_KEY], "dark");
  assert.equal(s.dump()[LEGACY_THEME_KEY], undefined);
});

test("getInitialTheme usa preferencia do sistema quando nao ha storage", () => {
  const s = storage();
  const win = { matchMedia: () => ({ matches: true }) };
  assert.equal(getInitialTheme(win, s), "dark");
});
