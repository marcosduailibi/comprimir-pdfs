import { TOOLS, CATEGORIES, toolsInCategory } from "./tools/registry.js?v=12";
import { searchTools } from "./tools/search.js?v=12";
import { createToolCard, el, iconMarkup, makeIcon, isOpenable } from "./tools/render.js?v=12";
import { getRecent, recordOpen } from "./tools/stores.js?v=11";
import { bindThemeToggle, initTheme } from "./theme.js?v=10";
import { bindDonation } from "./donation.js?v=10";
import { bindToolDetails, openToolDetails } from "./tools/details.js?v=12";
import { bindStaticHashRoutes } from "./static-routes.js?v=12";

const $ = (selector, root = document) => root.querySelector(selector);

const QUICK_ACTIONS = ["compress", "merge", "images-to-pdf", "compress-image", "convert-image", "compress-video"];
const POPULAR_TOOLS = [
  "compress",
  "merge",
  "merge_then_compress",
  "camera-to-pdf",
  "images-to-pdf",
  "compress-image",
  "convert-image",
  "compress-video",
  "pdf-to-images",
];

let currentCategory = "all";
let currentResults = [];

const byId = (id) => TOOLS.find((tool) => tool.id === id);

function showNotice(tool) {
  const box = $("#toolNotice");
  if (!box || !tool) return;
  box.hidden = false;
  box.innerHTML = "";
  box.appendChild(makeIcon(tool, "is-small"));
  box.appendChild(el("span", { text: `${tool.name} ainda está em preparo. Ferramentas futuras ficam marcadas como Em breve para não abrir um fluxo falso.` }));
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => { box.hidden = true; }, 5400);
}

function openTool(tool) {
  try { recordOpen(tool.id); } catch { /* optional */ }
}

function renderQuickActions() {
  const root = $("#quickActions");
  if (!root) return;
  root.innerHTML = "";
  QUICK_ACTIONS.map(byId).filter(Boolean).forEach((tool) => {
    const node = createToolCard(tool, {
      className: "ak-quick-card",
      compact: true,
      showBadges: false,
      showAction: false,
      onOpen: openTool,
      onUnavailable: openToolDetails,
      onDetails: openToolDetails,
    });
    root.appendChild(node);
  });
}

function renderCategories() {
  const root = $("#homeCategories");
  if (!root) return;
  root.innerHTML = "";
  CATEGORIES.filter((category) => category.id !== "soon").forEach((category) => {
    const chip = el("button", {
      class: `ak-chip${currentCategory === category.id ? " is-active" : ""}`,
      type: "button",
      "aria-pressed": String(currentCategory === category.id),
      onclick: () => {
        currentCategory = category.id;
        renderCategories();
        renderTools();
      },
    }, [
      el("span", { html: iconMarkup(category.icon) }),
      el("span", { text: category.name }),
    ]);
    root.appendChild(chip);
  });
}

function filteredTools() {
  const query = $("#homeSearch")?.value || "";
  const base = query.trim() ? searchTools(query, TOOLS) : toolsInCategory(currentCategory, TOOLS);
  if (query.trim() && currentCategory !== "all") {
    const allowed = new Set(toolsInCategory(currentCategory, TOOLS).map((tool) => tool.id));
    return base.filter((tool) => allowed.has(tool.id));
  }
  if (!query.trim() && currentCategory === "all") {
    return POPULAR_TOOLS.map(byId).filter(Boolean);
  }
  return base;
}

function renderTools() {
  const root = $("#homeTools");
  const state = $("#searchState");
  if (!root) return;
  const query = $("#homeSearch")?.value || "";
  const tools = filteredTools();
  currentResults = tools;
  root.innerHTML = "";

  if (state) {
    state.textContent = query.trim()
      ? `${tools.length} resultado(s) para "${query.trim()}"`
      : currentCategory === "all"
        ? "Ferramentas populares"
        : `Categoria: ${CATEGORIES.find((category) => category.id === currentCategory)?.name || "Todas"}`;
  }

  if (!tools.length) {
    root.appendChild(el("div", { class: "ak-empty" }, [
      el("strong", { text: "Nenhuma ferramenta encontrada" }),
      el("span", { text: "Tente PDF, imagem, vídeo, OCR, senha, MP4 ou juntar." }),
    ]));
    return;
  }

  tools.slice(0, 12).forEach((tool) => {
    root.appendChild(createToolCard(tool, {
      onOpen: openTool,
      onUnavailable: openToolDetails,
      onDetails: openToolDetails,
    }));
  });
}

function renderRecent() {
  const root = $("#recentTools");
  if (!root) return;
  const recent = getRecent(5).map(byId).filter(Boolean);
  const tools = recent.length ? recent : ["compress", "merge", "camera-to-pdf", "images-to-pdf"].map(byId).filter(Boolean);
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

function bindSearch() {
  const input = $("#homeSearch");
  if (!input) return;
  input.addEventListener("input", renderTools);
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
      renderTools();
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      input.focus();
    }
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function init() {
  initTheme();
  bindHeader();
  renderQuickActions();
  renderCategories();
  renderTools();
  renderRecent();
  bindSearch();
  bindDonation();
  bindToolDetails();
  bindStaticHashRoutes();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
