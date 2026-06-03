import { test } from "node:test";
import assert from "node:assert/strict";
import { DPI_PRESETS, dpiLabel, presetFromValues, resolveDpiValue } from "../src/js/state.js";

test("DPI presets incluem automatico, 144 recomendado, sem reduzir e personalizado", () => {
  const values = DPI_PRESETS.map((p) => p.value);
  assert.ok(values.includes("auto"));
  assert.ok(values.includes("144"));
  assert.ok(values.includes("none"));
  assert.ok(values.includes("custom"));
});

test("resolveDpiValue normaliza presets e limites", () => {
  assert.equal(resolveDpiValue("none"), 0);
  assert.equal(resolveDpiValue("auto"), 144);
  assert.equal(resolveDpiValue("200"), 200);
  assert.equal(resolveDpiValue("custom", 12), 36);
  assert.equal(resolveDpiValue("custom", 999), 600);
});

test("presetFromValues considera DPI", () => {
  assert.equal(presetFromValues(60, 2, 144), "balanced");
  assert.equal(presetFromValues(60, 2, 200), "custom");
});

test("dpiLabel distingue sem reduzir DPI", () => {
  assert.equal(dpiLabel(0), "Sem reduzir DPI");
  assert.equal(dpiLabel(144), "144 DPI");
});
