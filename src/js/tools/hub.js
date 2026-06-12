import { TOOLS, CATEGORIES, toolsInCategory } from "./registry.js?v=14";
import { searchTools } from "./search.js?v=12";
import { createToolCard, el, iconMarkup, isOpenable, makeIcon } from "./render.js?v=13";
import { bindToolDetails, openToolDetails } from "./details.js?v=14";
import {
  getFavorites,
  isFavorite,
  toggleFavorite,
  getRecent,
  recordOpen,
} from "./stores.js?v=10";
import { bindThemeToggle, initTheme } from "../theme.js?v=14";
import { bindStaticHashRoutes } from "../static-routes.js?v=12";

const $ = (selector, root = document) => root.querySelector(selector);

let state = { query: "", category: "all" };

function showNotice(tool) {
  const box = $("#toolNotice");
  if (!box || !tool) return;
  box.hidden = false;
  box.innerHTML = "";
  box.appendChild(makeIcon(tool, "is-small"));
  box.appendChild(el("span", { text: `${tool.name} ainda não está pronto. Mantemos ferramentas futuras marcadas como Em breve para não abrir uma ação falsa.` }));
}

function openTool(tool) {
  try { recordOpen(tool.id); } catch { /* optional */ }
}

function favoriteButton(tool) {
  return el("button", {
    class: `ak-favorite${isFavorite(tool.id) ? " is-active" : ""}`,
    type: "button",
    "aria-label": `${isFavorite(tool.id) ? "Remover" : "Adicionar"} ${tool.name} dos favoritos`,
    "aria-pressed": String(isFavorite(tool.id)),
    onclick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(tool.id);
      render();
    },
    html: iconMarkup("star"),
  });
}

function card(tool) {
  const node = createToolCard(tool, {
    className: "ak-catalog-card",
    onOpen: openTool,
    onUnavailable: openToolDetails,
    onDetails: openToolDetails,
  });
  node.appendChild(favoriteButton(tool));
  return node;
}

function grid(tools) {
  const node = el("div", { class: "ak-catalog-grid" });
  tools.forEach((tool) => node.appendChild(card(tool)));
  return node;
}

function group(title, icon, tools, id) {
  if (!tools.length) return null;
  return el("section", { class: "ak-catalog-section", id: id || null }, [
    el("div", { class: "ak-section-title" }, [
      el("span", { html: iconMarkup(icon) }),
      el("h2", { text: title }),
      el("small", { text: String(tools.length) }),
    ]),
    grid(tools),
  ]);
}

function renderChips() {
  const root = $("#hubNav");
  if (!root) return;
  root.innerHTML = "";
  CATEGORIES.forEach((category) => {
    const chip = el("button", {
      class: `ak-chip${state.category === category.id ? " is-active" : ""}`,
      type: "button",
      "aria-pressed": String(state.category === category.id),
      onclick: () => {
        state.category = category.id;
        state.query = "";
        const input = $("#hubSearch");
        if (input) input.value = "";
        renderChips();
        render();
      },
    }, [
      el("span", { html: iconMarkup(category.icon) }),
      el("span", { text: category.name }),
      el("span", { class: "count", text: String(toolsInCategory(category.id, TOOLS).length) }),
    ]);
    root.appendChild(chip);
  });
}

function renderRecent() {
  const root = $("#recentTools");
  if (!root) return;
  const recentIds = getRecent(4);
  const fallback = ["compress", "merge", "images-to-pdf", "compress-image"];
  const tools = (recentIds.length ? recentIds : fallback)
    .map((id) => TOOLS.find((tool) => tool.id === id))
    .filter(Boolean);
  root.innerHTML = "";
  tools.forEach((tool) => {
    root.appendChild(createToolCard(tool, {
      className: "ak-mini-tool",
      compact: true,
      showBadges: false,
      showAction: false,
      onOpen: openTool,
      onUnavailable: openToolDetails,
      onDetails: openToolDetails,
    }));
  });
}

function render() {
  const root = $("#hubSections");
  if (!root) return;
  root.innerHTML = "";
  $("#toolNotice")?.setAttribute("hidden", "");

  const query = state.query.trim();
  let activeTools;

  if (query) {
    activeTools = searchTools(query, TOOLS);
    if (state.category !== "all") {
      const allowed = new Set(toolsInCategory(state.category, TOOLS).map((tool) => tool.id));
      activeTools = activeTools.filter((tool) => allowed.has(tool.id));
    }
  } else {
    activeTools = toolsInCategory(state.category, TOOLS);
  }

  if (!activeTools.length) {
    root.appendChild(el("div", { class: "ak-empty" }, [
      el("span", { html: iconMarkup("search") }),
      el("strong", { text: "Nenhuma ferramenta encontrada" }),
      el("span", { text: "Tente termos como PDF, imagem, vídeo, senha, OCR, JPG ou MP4." }),
    ]));
    currentResults = [];
    return;
  }

  if (!query && state.category === "all") {
    const favs = getFavorites().map((id) => TOOLS.find((tool) => tool.id === id)).filter(Boolean);
    const favGroup = group("Favoritas", "star", favs, "favoritas");
    if (favGroup) root.appendChild(favGroup);
  }

  const ready = activeTools.filter(isOpenable);
  const soon = activeTools.filter((tool) => !isOpenable(tool));
  const readyGroup = group("Prontas para usar", "check-circle", ready, "prontas");
  const soonGroup = group("No roadmap", "clock", soon, "roadmap");
  if (readyGroup) root.appendChild(readyGroup);
  if (soonGroup) root.appendChild(soonGroup);

  currentResults = activeTools;
}

let currentResults = [];

function bindSearch() {
  const input = $("#hubSearch");
  if (!input) return;
  input.addEventListener("input", () => {
    state.query = input.value;
    render();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = currentResults[0];
      if (!first) return;
      if (isOpenable(first)) {
        openTool(first);
        window.location.href = first.route;
      } else {
        openToolDetails(first);
      }
    }
    if (event.key === "Escape") {
      input.value = "";
      state.query = "";
      render();
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      input.focus();
    }
    if (event.key === "Escape") $("#toolNotice")?.setAttribute("hidden", "");
  });
}

function bindHeader() {
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
}

function init() {
  initTheme();
  bindHeader();
  renderChips();
  renderRecent();
  render();
  bindSearch();
  bindToolDetails();
  bindStaticHashRoutes();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
