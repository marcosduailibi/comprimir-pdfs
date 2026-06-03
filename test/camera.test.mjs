import { test } from "node:test";
import assert from "node:assert/strict";
import { isLikelyMobile, mapCameraError, stopCameraStream } from "../src/js/camera/camera-controller.js";
import { normalizeRotation, resolvePreset } from "../src/js/camera/image-editor.js";
import { calculateImagePlacement, resolvePdfPageSize } from "../src/js/camera/pdf-generator.js";

test("stopCameraStream para todas as tracks", () => {
  const calls = [];
  const stream = { getTracks: () => [{ stop: () => calls.push("a") }, { stop: () => calls.push("b") }] };
  stopCameraStream(stream);
  assert.deepEqual(calls, ["a", "b"]);
});

test("isLikelyMobile considera viewport estreito como mobile", () => {
  const nav = { userAgent: "Desktop" };
  const win = { innerWidth: 390, matchMedia: () => ({ matches: false }) };
  assert.equal(isLikelyMobile(nav, win), true);
});

test("mapCameraError retorna mensagem especifica", () => {
  const denied = mapCameraError({ name: "NotAllowedError" });
  assert.match(denied.title, /permissão/i);
  assert.match(denied.action, /importe imagens/i);
});

test("normalizeRotation sempre retorna angulos quadrantes", () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
  assert.equal(normalizeRotation(44), 0);
});

test("resolvePreset cai para documento em valor invalido", () => {
  assert.equal(resolvePreset("grayscale"), "grayscale");
  assert.equal(resolvePreset("x"), "document");
});

test("resolvePdfPageSize respeita orientacao", () => {
  assert.deepEqual(resolvePdfPageSize("a4", 1000, 2000, "portrait"), [595.28, 841.89]);
  assert.deepEqual(resolvePdfPageSize("a4", 1000, 2000, "landscape"), [841.89, 595.28]);
});

test("calculateImagePlacement centraliza imagem em contain", () => {
  const p = calculateImagePlacement(600, 800, 1200, 800, 20, "contain");
  assert.equal(Math.round(p.width), 560);
  assert.equal(Math.round(p.height), 373);
  assert.equal(Math.round(p.x), 20);
  assert.equal(Math.round(p.y), 213);
});
