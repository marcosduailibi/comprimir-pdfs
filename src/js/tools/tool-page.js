import { bindThemeToggle, initTheme } from "../theme.js?v=13";

export const $ = (selector, root = document) => root.querySelector(selector);

export function bindStandardHeader() {
  initTheme();
  bindThemeToggle($("#themeToggle"));
  const nav = $("#siteNav");
  const toggle = $("#navToggle");
  if (!nav || !toggle) return;
  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-open", open);
  };
  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value || "";
}

export function setAlert(selector, message, type = "info") {
  const node = $(selector);
  if (!node) return;
  node.hidden = !message;
  node.dataset.type = type;
  node.textContent = message || "";
}

export function setProgress(selector, value, message = "") {
  const root = $(selector);
  if (!root) return;
  const progress = root.querySelector("progress");
  const text = root.querySelector("[data-progress-text]");
  root.hidden = false;
  if (progress && Number.isFinite(Number(value))) {
    const next = Math.max(0, Math.min(100, Number(value)));
    const previous = Number(root.dataset.progressLast || 0);
    const safeValue = next < previous ? previous : next;
    root.dataset.progressLast = String(safeValue);
    progress.value = safeValue;
  }
  if (text) text.textContent = message;
}

export function resetProgress(selector) {
  const root = $(selector);
  if (!root) return;
  const progress = root.querySelector("progress");
  delete root.dataset.progressLast;
  if (progress) progress.value = 0;
  const text = root.querySelector("[data-progress-text]");
  if (text) text.textContent = "Preparando.";
}

export function scrollToElement(selectorOrElement, block = "center") {
  const element = typeof selectorOrElement === "string" ? $(selectorOrElement) : selectorOrElement;
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block });
}

export function scrollProgressSoon(selector = "#toolProgress") {
  window.requestAnimationFrame(() => window.setTimeout(() => scrollToElement(selector), 50));
}

export function showStartNotice({
  title = "Processamento iniciado",
  message = "Acompanhe o progresso abaixo.",
  targetSelector = "#toolProgress",
} = {}) {
  let notice = document.querySelector(".tool-start-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "tool-start-notice";
    notice.innerHTML = `
      <div>
        <strong data-start-title></strong>
        <span data-start-message></span>
      </div>
      <button class="btn btn--primary btn--sm" type="button">Ver progresso</button>
    `;
    document.body.appendChild(notice);
  }
  notice.querySelector("[data-start-title]").textContent = title;
  notice.querySelector("[data-start-message]").textContent = message;
  notice.querySelector("button").onclick = () => scrollToElement(targetSelector);
  notice.hidden = false;
  notice.classList.add("is-visible");
  window.clearTimeout(showStartNotice.timer);
  showStartNotice.timer = window.setTimeout(() => {
    notice.classList.remove("is-visible");
    window.setTimeout(() => { notice.hidden = true; }, 200);
  }, 5200);
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function fileExt(name = "") {
  const clean = String(name).split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

export function baseName(name = "arquivo") {
  return String(name || "arquivo")
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "arquivo";
}

export function pad(num, size = 3) {
  return String(num).padStart(size, "0");
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(blob);
  });
}

export function parsePageSelection(input, pageCount, mode = "all") {
  const all = Array.from({ length: pageCount }, (_, index) => index + 1);
  if (mode === "all") return all;
  if (mode === "odd") return all.filter((page) => page % 2 === 1);
  if (mode === "even") return all.filter((page) => page % 2 === 0);

  const raw = String(input || "").trim();
  if (!raw) return all;
  const selected = new Set();
  for (const token of raw.split(",")) {
    const part = token.trim().replace(/\u2013|\u2014/g, "-");
    if (!part) continue;
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`Intervalo invalido: ${part}`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > pageCount) {
      throw new Error(`Pagina fora do limite: ${part}`);
    }
    for (let page = start; page <= end; page += 1) selected.add(page);
  }
  return Array.from(selected).sort((a, b) => a - b);
}
