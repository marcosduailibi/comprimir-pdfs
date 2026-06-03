import { TOOLS, CATEGORIES, toolsInCategory } from "./registry.js?v=12";
import { searchTools } from "./search.js?v=12";
import { createToolCard, el, iconMarkup, isOpenable, makeIcon } from "./render.js?v=12";
import {
  getFavorites,
  isFavorite,
  toggleFavorite,
  getRecent,
  recordOpen,
} from "./stores.js?v=10";
import { bindThemeToggle, initTheme } from "../theme.js?v=10";

const $ = (selector, root = document) => root.querySelector(selector);

const SECTION_ORDER = ["popular", "pdf", "images", "video", "documents", "security", "ocr", "audio", "soon"];
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
    onUnavailable: showNotice,
  });
  node.appendChild(favoriteButton(tool));
  return node;
}

function grid(tools) {
  const node = el("div", { class: "ak-catalog-grid" });
  tools.forEach((tool) => node.appendChild(card(tool)));
  return node;
}

function section(categoryId, tools) {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  if (!category || !tools.length) return null;
  return el("section", { class: "ak-catalog-section", id: category.id }, [
    el("div", { class: "ak-section-title" }, [
      el("span", { html: iconMarkup(category.icon) }),
      el("h2", { text: category.name }),
      el("small", { text: `${tools.length} ferramenta(s)` }),
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
      onUnavailable: showNotice,
    }));
  });
}

function renderSearchResults(root) {
  let tools = searchTools(state.query, TOOLS);
  if (state.category !== "all") {
    const allowed = new Set(toolsInCategory(state.category, TOOLS).map((tool) => tool.id));
    tools = tools.filter((tool) => allowed.has(tool.id));
  }

  if (!tools.length) {
    root.appendChild(el("div", { class: "ak-empty" }, [
      el("strong", { text: "Nenhuma ferramenta encontrada" }),
      el("span", { text: "Tente termos como PDF, imagem, vídeo, senha, OCR, JPG ou MP4." }),
    ]));
    return tools;
  }

  root.appendChild(section("all", tools) || grid(tools));
  return tools;
}

function render() {
  const root = $("#hubSections");
  if (!root) return;
  root.innerHTML = "";
  $("#toolNotice")?.setAttribute("hidden", "");

  const query = state.query.trim();
  let activeTools = [];

  if (query) {
    activeTools = renderSearchResults(root);
  } else if (state.category !== "all") {
    activeTools = toolsInCategory(state.category, TOOLS);
    root.appendChild(section(state.category, activeTools) || grid(activeTools));
  } else {
    const favs = getFavorites().map((id) => TOOLS.find((tool) => tool.id === id)).filter(Boolean);
    if (favs.length) root.appendChild(section("star", favs) || grid(favs));
    for (const categoryId of SECTION_ORDER) {
      const tools = toolsInCategory(categoryId, TOOLS);
      const node = section(categoryId, tools);
      if (node) root.appendChild(node);
      activeTools = activeTools.concat(tools);
    }
  }

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
        showNotice(first);
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
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
