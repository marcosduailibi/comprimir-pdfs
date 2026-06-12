// tools/split-tool.js
// Controlador da página "Dividir PDF". JS puro; processa no navegador.

import { executeSplit, getPageCount } from "../pdf/split.js?v=10";
import { planSplit, parsePageRanges, describeRangeError } from "../pdf/page-ranges.js?v=10";
import { zipSync } from "https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm";
import { recordOpen, recordComplete } from "./stores.js?v=10";
import { bindThemeToggle } from "../theme.js?v=14";

const $ = (id) => document.getElementById(id);
const fmt = (b) => {
  if (!b) return "0 KB";
  const mb = b / 1048576;
  if (mb >= 1) return mb.toFixed(2).replace(".", ",") + " MB";
  return (b / 1024).toFixed(0) + " KB";
};
const safeBase = (name) => String(name || "documento").replace(/\.pdf$/i, "").replace(/[^\w.\- ]+/g, "_").trim() || "documento";

const st = { bytes: null, pageCount: 0, baseName: "documento", urls: [] };

function setError(msg) { const e = $("splitRangeError"); if (e) { e.textContent = msg || ""; e.hidden = !msg; } }
function revokeAll() { st.urls.forEach((u) => URL.revokeObjectURL(u)); st.urls = []; }

function currentMode() { return $("splitMode").value; }

function toggleOptionInputs() {
  const mode = currentMode();
  $("splitRangesWrap").hidden = !(mode === "extract" || mode === "ranges");
  $("splitNWrap").hidden = mode !== "everyN";
  validate();
}

/** Tenta montar o plano com os valores atuais; retorna grupos ou null (com erro na UI). */
function buildPlan() {
  const mode = currentMode();
  try {
    if (mode === "extract" || mode === "ranges") {
      const txt = $("splitRanges").value;
      parsePageRanges(txt, st.pageCount); // valida cedo (lança em erro)
      return planSplit(mode, { pageCount: st.pageCount, rangesText: txt });
    }
    if (mode === "everyN") {
      const n = parseInt($("splitN").value, 10);
      if (!n || n < 1) throw new RangeError("INVALID:N");
      return planSplit("everyN", { pageCount: st.pageCount, n });
    }
    return planSplit(mode, { pageCount: st.pageCount });
  } catch (err) {
    setError(err.message && err.message.startsWith("INVALID:N")
      ? "Informe um número de páginas por arquivo (1 ou mais)."
      : describeRangeError(err, st.pageCount));
    return null;
  }
}

function validate() {
  const ready = !!st.bytes && st.pageCount > 0;
  const plan = ready ? buildPlan() : null;
  if (ready && plan) setError("");
  const btn = $("splitRun");
  btn.disabled = !(ready && plan && plan.length > 0);
  const hint = $("splitRunHint");
  if (ready && plan) hint.textContent = `Serão gerados ${plan.length} arquivo(s) PDF.`;
  else if (ready) hint.textContent = "";
  else hint.textContent = "Selecione um PDF para começar.";
}

async function onFile(file) {
  if (!file) return;
  if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
    setError("Selecione um arquivo PDF válido.");
    return;
  }
  setError("");
  $("splitResults").innerHTML = "";
  revokeAll();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pages = await getPageCount(bytes);
    st.bytes = bytes; st.pageCount = pages; st.baseName = safeBase(file.name);
    $("splitFileInfo").hidden = false;
    $("splitFileInfo").innerHTML = `<strong>${file.name}</strong><span class="muted small"> · ${fmt(file.size)} · ${pages} página(s)</span>`;
    $("splitOptions").hidden = false;
    $("splitRanges").placeholder = `ex.: 1-3, 5, 10-${pages}`;
    validate();
  } catch {
    st.bytes = null; st.pageCount = 0;
    setError("Não foi possível ler este PDF. Ele pode estar protegido por senha ou corrompido.");
  }
}

function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  st.urls.push(url);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

function renderResults(parts) {
  const box = $("splitResults");
  box.innerHTML = "";
  box.appendChild(Object.assign(document.createElement("h2"), { className: "card__title", textContent: `Pronto! ${parts.length} arquivo(s) gerado(s)` }));

  if (parts.length > 1) {
    const zipBtn = document.createElement("button");
    zipBtn.className = "btn btn--primary"; zipBtn.type = "button";
    zipBtn.textContent = "Baixar todos (.zip)";
    zipBtn.addEventListener("click", () => {
      const map = {}; parts.forEach((p) => { map[p.name] = p.bytes; });
      const zipped = zipSync(map, { level: 0 }); // PDFs ja comprimidos: store
      const url = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
      st.urls.push(url);
      const a = document.createElement("a"); a.href = url; a.download = `${st.baseName}-dividido.zip`;
      document.body.appendChild(a); a.click(); a.remove();
    });
    box.appendChild(zipBtn);
  }

  const list = document.createElement("ul"); list.className = "file-list"; list.style.marginTop = "12px";
  for (const p of parts) {
    const li = document.createElement("li"); li.className = "file-item";
    li.innerHTML = `<span class="file-item__info"><strong>${p.name}</strong><span class="file-item__meta">${p.pages} página(s) · ${fmt(p.bytes.length)}</span></span>`;
    const btn = document.createElement("button"); btn.className = "btn btn--ghost btn--sm"; btn.type = "button"; btn.textContent = "Baixar";
    btn.addEventListener("click", () => download(p.name, p.bytes));
    li.appendChild(btn); list.appendChild(li);
  }
  box.appendChild(list);
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function run() {
  const plan = buildPlan();
  if (!plan || !st.bytes) return;
  const btn = $("splitRun");
  btn.disabled = true;
  $("splitProgress").hidden = false;
  $("splitProgress").textContent = "Dividindo o PDF no seu navegador...";
  try {
    const parts = await executeSplit(st.bytes, plan, st.baseName, ({ index, total }) => {
      $("splitProgress").textContent = `Gerando parte ${index} de ${total}...`;
    });
    $("splitProgress").hidden = true;
    renderResults(parts);
    try { recordComplete("split"); } catch { /* uso é opcional */ }
  } catch (err) {
    $("splitProgress").hidden = true;
    setError("Não foi possível dividir este PDF. " + (String(err && err.message).includes("encrypt") ? "Ele parece protegido por senha." : "Tente outro arquivo ou intervalos diferentes."));
  } finally {
    btn.disabled = false;
  }
}

function init() {
  try { recordOpen("split"); } catch { /* ignore */ }
  const drop = $("splitDrop"), input = $("splitInput");
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", (e) => { if (e.target.files[0]) onFile(e.target.files[0]); input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-dragover"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-dragover"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });

  $("splitMode").addEventListener("change", toggleOptionInputs);
  $("splitRanges").addEventListener("input", validate);
  $("splitN").addEventListener("input", validate);
  $("splitRun").addEventListener("click", run);

  bindThemeToggle($("themeToggle"));

  toggleOptionInputs();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
