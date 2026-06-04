import { bindThemeToggle, initTheme } from "./theme.js?v=13";
import { bindStaticHashRoutes } from "./static-routes.js?v=12";

const $ = (selector, root = document) => root.querySelector(selector);

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
  bindStaticHashRoutes();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
