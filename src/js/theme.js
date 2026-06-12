// theme.js
// Preferencia visual persistida localmente. Guarda somente o tema, nunca dados
// de arquivos do usuario.

export const THEME_KEY = "pdfTools.theme.v1";
export const LEGACY_THEME_KEY = "comprimirpdf-theme";
const JOB_STORE_KEY = "arqkit.activeJobs.v1";

// Ícones do header (SVG inline, herdam a cor via currentColor).
const THEME_ICON_MOON =
  '<svg class="theme-toggle-icon theme-toggle-icon--moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
const THEME_ICON_SUN =
  '<svg class="theme-toggle-icon theme-toggle-icon--sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MENU_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';

export function normalizeTheme(value) {
  return value === "dark" || value === "light" ? value : null;
}

export function getStoredTheme(storage = globalThis.localStorage) {
  try {
    const current = normalizeTheme(storage.getItem(THEME_KEY));
    if (current) return current;

    const legacy = normalizeTheme(storage.getItem(LEGACY_THEME_KEY));
    if (legacy) {
      storage.setItem(THEME_KEY, legacy);
      storage.removeItem(LEGACY_THEME_KEY);
      return legacy;
    }
  } catch {
    // private browsing/quota: fall through to system preference
  }
  return null;
}

export function getSystemTheme(win = globalThis) {
  try {
    return win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function getInitialTheme(win = globalThis, storage = globalThis.localStorage) {
  return getStoredTheme(storage) || getSystemTheme(win);
}

export function applyTheme(theme, { persist = true, doc = globalThis.document, storage = globalThis.localStorage } = {}) {
  const next = normalizeTheme(theme) || "light";
  doc.documentElement.setAttribute("data-theme", next);
  if (persist) {
    try { storage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  }
  return next;
}

export function toggleTheme(doc = globalThis.document, storage = globalThis.localStorage) {
  const current = normalizeTheme(doc.documentElement.getAttribute("data-theme")) || getInitialTheme(globalThis, storage);
  return applyTheme(current === "dark" ? "light" : "dark", { doc, storage });
}

export function initTheme(doc = globalThis.document, storage = globalThis.localStorage) {
  const theme = applyTheme(getInitialTheme(globalThis, storage), { persist: false, doc, storage });
  normalizeGlobalUi(doc);
  return theme;
}

export function bindThemeToggle(button, doc = globalThis.document, storage = globalThis.localStorage) {
  normalizeGlobalUi(doc);
  if (!button) return null;
  button.addEventListener("click", () => {
    toggleTheme(doc, storage);
    updateThemeToggleLabel(button, doc);
  });
  updateThemeToggleLabel(button, doc);
  return button;
}

function currentThemeIsDark(doc = globalThis.document) {
  return doc?.documentElement?.getAttribute("data-theme") === "dark";
}

// O ícone (lua/sol) é trocado por CSS conforme [data-theme]; aqui só mantemos
// o rótulo acessível coerente com a ação que o clique vai executar.
function updateThemeToggleLabel(button, doc = globalThis.document) {
  if (!button) return;
  const label = currentThemeIsDark(doc) ? "Ativar modo claro" : "Ativar modo escuro";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function normalizeGlobalUi(doc = globalThis.document) {
  normalizeHeader(doc);
  normalizeFooter(doc);
  ensureBreadcrumb(doc);
  ensureJobTray(doc);
}

function normalizeHeader(doc) {
  const header = doc.querySelector(".site-header");
  if (!header) return;
  header.querySelectorAll(".site-nav a").forEach((link) => {
    const text = link.textContent.trim().toLowerCase();
    if (text === "inicio") link.textContent = "Início";
    if (text === "video") link.textContent = "Vídeo";
  });
  header.querySelectorAll(".ak-brand").forEach((brand) => {
    brand.setAttribute("aria-label", "ArqKit - início");
  });

  const actions = header.querySelector(".header-actions");
  if (!actions) return;
  // O redesign trocou o pill "Apoiar" por um link na navegação; remove
  // resquícios do botão em markup antigo/cacheado.
  actions.querySelectorAll(".btn--support, .support-button").forEach((node) => node.remove());

  const themeButton = actions.querySelector("#themeToggle");
  if (themeButton) {
    themeButton.classList.add("theme-toggle");
    themeButton.innerHTML = `${THEME_ICON_MOON}${THEME_ICON_SUN}`;
    updateThemeToggleLabel(themeButton, doc);
  }

  const navButton = actions.querySelector("#navToggle");
  if (navButton) {
    navButton.innerHTML = MENU_ICON;
    navButton.setAttribute("aria-label", "Abrir menu");
  }
}

function normalizeFooter(doc) {
  doc.querySelectorAll(".footer-links").forEach((links) => {
    links.setAttribute("aria-label", "Links do rodapé");
    const hasGlossary = Array.from(links.querySelectorAll("a")).some((link) => /gloss[aá]rio/i.test(link.textContent));
    if (!hasGlossary) {
      const glossary = doc.createElement("a");
      glossary.href = "./glossario.html";
      glossary.textContent = "Glossário";
      const terms = Array.from(links.children).find((node) => /termos/i.test(node.textContent || ""));
      links.insertBefore(glossary, terms || links.lastElementChild || null);
    }
    links.querySelectorAll("a").forEach((link) => {
      const text = link.textContent.trim().toLowerCase();
      if (text === "inicio") link.textContent = "Início";
      if (text === "videos" || text === "video") link.textContent = "Vídeo";
    });
  });
}

function breadcrumbLabelForPath(pathname = globalThis.location?.pathname || "") {
  const file = pathname.split("/").pop() || "index.html";
  const labels = {
    "ferramentas.html": "Ferramentas",
    "comprimir-pdf.html": "Comprimir PDF",
    "dividir.html": "Dividir PDF",
    "camera.html": "Câmera para PDF",
    "comprimir-imagem.html": "Comprimir imagem",
    "pdf-ferramentas.html": "PDF",
    "video-ferramentas.html": "Vídeo",
    "privacidade.html": "Privacidade",
    "termos.html": "Termos",
    "glossario.html": "Glossário",
  };
  return labels[file] || docTitleFallback();
}

function docTitleFallback() {
  return String(globalThis.document?.title || "Página").split("|")[0].trim() || "Página";
}

function ensureBreadcrumb(doc) {
  if (doc.body?.classList.contains("ak-home")) return;
  const main = doc.querySelector("main");
  if (!main) return;
  let breadcrumb = main.querySelector(".ak-breadcrumb");
  if (!breadcrumb) {
    breadcrumb = doc.createElement("nav");
    breadcrumb.className = "ak-breadcrumb";
    breadcrumb.setAttribute("aria-label", "Breadcrumb");
    breadcrumb.innerHTML = `<a href="./">Início</a><span aria-hidden="true">&gt;</span><span>${breadcrumbLabelForPath()}</span>`;
    main.insertBefore(breadcrumb, main.firstElementChild);
  }
  breadcrumb.querySelectorAll("a, span").forEach((node) => {
    const text = node.textContent.trim().toLowerCase();
    if (text === "inicio") node.textContent = "Início";
    if (text === "video") node.textContent = "Vídeo";
    if (text === "camera") node.textContent = "Câmera";
    if (node.getAttribute("aria-hidden") === "true" && /â|›|>/.test(node.textContent)) node.textContent = ">";
  });
}

function readJobs() {
  try {
    const raw = globalThis.localStorage?.getItem(JOB_STORE_KEY);
    const jobs = raw ? JSON.parse(raw) : [];
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

function ensureJobTray(doc) {
  if (doc.querySelector(".ak-job-tray")) return;
  const tray = doc.createElement("aside");
  tray.className = "ak-job-tray";
  tray.hidden = true;
  tray.setAttribute("aria-live", "polite");
  doc.body?.appendChild(tray);
  const render = () => renderJobTray(doc, tray);
  render();
  globalThis.addEventListener?.("storage", render);
  globalThis.addEventListener?.("arqkit:jobs-updated", render);
  globalThis.setInterval?.(render, 1500);
}

function renderJobTray(doc, tray) {
  const now = Date.now();
  const jobs = readJobs().filter((job) => now - Number(job.updatedAt || 0) < 2 * 60 * 60 * 1000);
  const visible = jobs.some((job) => ["processing", "error", "interrupted"].includes(job.status));
  tray.hidden = !visible;
  if (!visible) return;
  tray.innerHTML = `
    <strong>${jobs.length} processamento${jobs.length === 1 ? "" : "s"}</strong>
    <div></div>
  `;
  const list = tray.querySelector("div");
  jobs.forEach((job) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "ak-job-tray__item";
    const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
    button.innerHTML = `
      <span>
        <b>${escapeText(job.title || "Processamento local")}</b>
        <small>${escapeText(job.message || job.fileName || "Clique para ver detalhes.")}</small>
      </span>
      <em>${Math.round(progress)}%</em>
    `;
    button.addEventListener("click", () => {
      const href = job.href || "./video-ferramentas.html#compress-video";
      if (globalThis.location?.href.endsWith(href.replace("./", ""))) {
        doc.querySelector("#toolProgress")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        globalThis.location.href = href;
      }
    });
    list.appendChild(button);
  });
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
