// theme.js
// Preferencia visual persistida localmente. Guarda somente o tema, nunca dados
// de arquivos do usuario.

export const THEME_KEY = "pdfTools.theme.v1";
export const LEGACY_THEME_KEY = "comprimirpdf-theme";

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
  return applyTheme(getInitialTheme(globalThis, storage), { persist: false, doc, storage });
}

export function bindThemeToggle(button, doc = globalThis.document, storage = globalThis.localStorage) {
  if (!button) return null;
  button.addEventListener("click", () => toggleTheme(doc, storage));
  return button;
}
