// tools/hub.js
// Renderiza o hub "Todas as ferramentas PDF" (JS puro). Consome o registry e a
// busca pura; persiste só favoritos/uso (IDs). Não toca em arquivos do usuário.

import { TOOLS, CATEGORIES } from "./registry.js?v=8";
import { searchTools } from "./search.js?v=8";
import {
  getFavorites, isFavorite, toggleFavorite,
  getRecent, getFrequent, recordOpen,
} from "./stores.js?v=8";

const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(kids)) if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}

const STATUS = {
  ready:             { label: "Pronto",       cls: "tool-badge--ready" },
  beta:              { label: "Beta",          cls: "tool-badge--soon" },
  "coming-soon":     { label: "Em breve",      cls: "tool-badge--soon" },
  "requires-desktop":{ label: "Requer desktop", cls: "tool-badge--desktop" },
};

let state = { query: "", category: "all" };

// ------------------------------ Popover info ------------------------------
let openPopover = null;
function closePopover() { if (openPopover) { openPopover.remove(); openPopover = null; } }
function showPopover(tool, anchor) {
  closePopover();
  const status = STATUS[tool.status] || STATUS["coming-soon"];
  const pop = el("div", { class: "tool-popover", role: "dialog", "aria-label": tool.name }, [
    el("button", { class: "tool-popover__close", "aria-label": "Fechar", type: "button", onclick: closePopover }, "✕"),
    el("h4", { text: tool.name }),
    el("p", { text: tool.tooltip || tool.description }),
    el("p", { class: "small", html: `<b>Status:</b> ${status.label}` }),
    ...(tool.notes || []).map((nt) => el("p", { class: "tool-popover__note", text: nt })),
  ]);
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = Math.min(300, window.innerWidth - 24);
  let left = Math.min(r.left, window.innerWidth - pw - 12);
  let top = r.bottom + 8;
  if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 8);
  pop.style.left = Math.max(12, left) + "px";
  pop.style.top = top + "px";
  pop.style.maxWidth = pw + "px";
  openPopover = pop;
}

// ------------------------------ Tile ------------------------------
function buildTile(tool) {
  const status = STATUS[tool.status] || STATUS["coming-soon"];
  const ready = tool.status === "ready";

  const icon = el("div", { class: "tool-tile__icon", "aria-hidden": "true", text: tool.icon || "📄" });
  const name = el("div", { class: "tool-tile__name", text: tool.name });
  const desc = el("div", { class: "tool-tile__desc", text: tool.description });
  const badge = el("span", { class: "tool-badge " + status.cls, text: status.label });

  const star = el("button", {
    class: "tool-tile__star" + (isFavorite(tool.id) ? " is-fav" : ""),
    type: "button",
    "aria-pressed": String(isFavorite(tool.id)),
    "aria-label": (isFavorite(tool.id) ? "Remover " : "Adicionar ") + tool.name + (isFavorite(tool.id) ? " dos favoritos" : " aos favoritos"),
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(tool.id); render(); },
  }, isFavorite(tool.id) ? "★" : "☆");

  const info = el("button", {
    class: "tool-tile__info", type: "button", "aria-label": "Sobre " + tool.name,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); showPopover(tool, info); },
  }, "ⓘ");

  const kids = [icon, name, desc, badge, star, info];

  if (ready) {
    return el("a", {
      class: "tool-tile", href: tool.route, "aria-describedby": "tt-" + tool.id,
      onclick: () => recordOpen(tool.id),
    }, kids);
  }
  // Não-pronta: não navega para um fluxo falso — abre o popover honesto.
  return el("div", {
    class: "tool-tile", role: "button", tabindex: "0", "aria-disabled": "true",
    onclick: () => showPopover(tool, info),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showPopover(tool, info); } },
  }, kids);
}

function grid(tools) {
  const g = el("div", { class: "hub-grid" });
  tools.forEach((t) => g.appendChild(buildTile(t)));
  return g;
}
function rail(tools) {
  const g = el("div", { class: "hub-rail" });
  tools.forEach((t) => g.appendChild(buildTile(t)));
  return g;
}
function section(title, node, extra = "") {
  return el("section", { class: "hub-section" }, [
    el("h2", { class: "hub-section__title", html: title + (extra ? ` <span class="small muted">${extra}</span>` : "") }),
    node,
  ]);
}

const byId = (id) => TOOLS.find((t) => t.id === id);

// ------------------------------ Render ------------------------------
function render() {
  const root = $("#hubSections");
  if (!root) return;
  root.innerHTML = "";

  // Busca ativa → resultados planos
  if (state.query.trim()) {
    const res = searchTools(state.query, TOOLS);
    if (res.length === 0) {
      root.appendChild(el("div", { class: "hub-empty" }, [
        el("p", { text: "Nenhuma ferramenta encontrada para “" + state.query + "”." }),
        el("p", { class: "small", text: "Tente outro termo, como “juntar”, “dividir”, “jpg” ou “senha”." }),
      ]));
    } else {
      root.appendChild(section(`Resultados`, grid(res), `${res.length} ferramenta(s)`));
    }
    return;
  }

  // Favoritos
  const favs = getFavorites().map(byId).filter(Boolean);
  if (favs.length) root.appendChild(section("⭐ Favoritos", grid(favs)));

  // Usado por último
  const recents = getRecent(6).map(byId).filter(Boolean);
  if (recents.length) root.appendChild(section("🕓 Usado por último", rail(recents)));

  // Frequentemente usadas
  const frequent = getFrequent(8).map(byId).filter(Boolean);
  if (frequent.length) root.appendChild(section("⚡ Frequentemente usadas", rail(frequent)));

  // Por categoria (ou categoria filtrada)
  const cats = state.category === "all"
    ? CATEGORIES
    : CATEGORIES.filter((c) => c.id === state.category);
  for (const c of cats) {
    const tools = TOOLS.filter((t) => (t.categoryIds || []).includes(c.id));
    if (tools.length) root.appendChild(section(c.name, grid(tools)));
  }
}

// ------------------------------ Chips / nav ------------------------------
function renderChips() {
  const nav = $("#hubNav");
  if (!nav) return;
  nav.innerHTML = "";
  const make = (id, label) => el("button", {
    class: "hub-chip" + (state.category === id ? " is-active" : ""),
    type: "button", "aria-pressed": String(state.category === id),
    onclick: () => { state.category = id; state.query = ""; const i = $("#hubSearch"); if (i) i.value = ""; renderChips(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
  }, label);
  nav.appendChild(make("all", "Todas"));
  for (const c of CATEGORIES) {
    if (TOOLS.some((t) => (t.categoryIds || []).includes(c.id))) nav.appendChild(make(c.id, c.name));
  }
}

// ------------------------------ Tema ------------------------------
function initTheme() {
  const btn = $("#themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("comprimirpdf-theme", next); } catch { /* ignore */ }
  });
}

// ------------------------------ Init ------------------------------
function init() {
  renderChips();
  render();
  initTheme();

  const input = $("#hubSearch");
  if (input) {
    input.addEventListener("input", () => { state.query = input.value; if (state.query.trim()) state.category = "all", renderChips(); render(); });
  }
  // Atalho Ctrl/Cmd+K foca a busca; Esc fecha popover / limpa busca.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); input && input.focus(); }
    if (e.key === "Escape") { if (openPopover) closePopover(); else if (input && document.activeElement === input) { input.value = ""; state.query = ""; render(); } }
  });
  document.addEventListener("click", (e) => {
    if (openPopover && !openPopover.contains(e.target) && !e.target.closest(".tool-tile__info")) closePopover();
  });
  window.addEventListener("resize", closePopover);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
