// utils.js
// Utilidades de interface (thread principal). Sem dependencias de PDF.

/** Formata bytes em texto legivel (KB/MB/GB), estilo "49,24 MB". */
export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "0 MB";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return gb.toFixed(2).replace(".", ",") + " GB";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return mb.toFixed(2).replace(".", ",") + " MB";
  return (bytes / 1024).toFixed(1).replace(".", ",") + " KB";
}

/** Formata ms como "HH:MM:SS". */
export function formatTime(ms) {
  let s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}

/** Promessa que resolve apos `ms` milissegundos. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Limita um numero ao intervalo [min, max]. */
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** Detecta o tipo de dispositivo (limites diferentes para mobile/computador). */
export function detectDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "computer";
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth <= 820;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return (coarse && narrow) || uaMobile ? "mobile" : "computer";
}

/** Copia texto para a area de transferencia (com fallback para navegadores antigos). */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* cai no fallback abaixo */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Exibe uma notificacao breve (toast). Evita o alert() padrao do navegador. */
let toastTimer = null;
export function showToast(message, type = "info") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = "toast toast--" + type + " is-visible";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 2600);
}

/** Remove a extensao .pdf e normaliza um nome base. */
function baseName(name) {
  return String(name || "documento").replace(/\.pdf$/i, "").trim() || "documento";
}

/**
 * Gera um nome de arquivo final amigavel conforme o modo.
 * Usa a base do primeiro arquivo quando faz sentido, evitando nomes enormes.
 */
export function buildFinalName(mode, files) {
  const first = files && files[0] ? baseName(files[0].name) : "documento";
  const shortFirst = first.length > 40 ? first.slice(0, 40) : first;
  switch (mode) {
    case "compress":
      return `${shortFirst}-comprimido.pdf`;
    case "merge":
      return files && files.length > 1 ? "pdfs-unidos.pdf" : `${shortFirst}-unido.pdf`;
    case "merge_then_compress":
      return "pdfs-unidos-comprimido.pdf";
    case "compress_then_merge":
      return "pdfs-comprimidos-unidos.pdf";
    default:
      return "documento.pdf";
  }
}

/** Rotulo legivel para cada modo. */
export function prettyMode(mode) {
  return {
    compress: "Comprimir um PDF",
    merge: "Juntar vários PDFs",
    merge_then_compress: "Juntar e depois comprimir",
    compress_then_merge: "Comprimir cada PDF e depois juntar",
  }[mode] || mode;
}
