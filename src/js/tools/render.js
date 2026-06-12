import { STATUS_META } from "./registry.js";

export const OPENABLE_STATUSES = new Set(["ready", "beta"]);

const PATHS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  "file-text": '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  "file-zip": '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M10 5h2"/><path d="M12 7h2"/><path d="M10 9h2"/><path d="M12 11h2"/><path d="M10 16h4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  puzzle: '<path d="M8 2h5a2 2 0 0 1 2 2v2.1a2 2 0 1 1 0 3.8V12h2a2 2 0 1 1 0 4h-2v4a2 2 0 0 1-2 2H9v-2a2 2 0 1 0-4 0v2H4a2 2 0 0 1-2-2v-5h2a2 2 0 1 0 0-4H2V8a2 2 0 0 1 2-2h2V4a2 2 0 0 1 2-2Z"/>',
  split: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l6 6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="m21 15-5-5L5 21"/>',
  "image-file": '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><circle cx="10" cy="13" r="2"/><path d="m8 19 3-3 2 2 2-2 3 3"/>',
  "image-plus": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 11h4"/><path d="M10 9v4"/><path d="m21 15-4-4-4 4-2-2-6 6"/>',
  camera: '<path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z"/><circle cx="12" cy="14" r="3"/>',
  video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3Z"/>',
  "video-convert": '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3Z"/><path d="M7 10h4"/><path d="m9 8 2 2-2 2"/>',
  audio: '<path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 8v8"/><path d="M20 11v2"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-8h3v6Z"/><path d="M3 19a2 2 0 0 0 2 2h1v-8H3v6Z"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.4-2.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  jpg: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 17h1.5a1.5 1.5 0 0 0 0-3H8v5"/><path d="M13 14v5"/><path d="M16 14h2v5h-2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="m14 14 6 6"/><path d="M8.1 8.1 12 12"/>',
  stamp: '<path d="M7 21h10"/><path d="M5 17h14"/><path d="M9 17v-2.5A3.5 3.5 0 0 1 12.5 11h0a3.5 3.5 0 0 1 3.5 3.5V17"/><path d="M9 5a3 3 0 0 1 6 0c0 2-3 6-3 6S9 7 9 5Z"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 20 4.8a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C7 .9 5.9 1.2 5.9 1.2A4.9 4.9 0 0 0 5.8 4.8 5.2 5.2 0 0 0 4.4 8.5c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.6V22"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A4.5 4.5 0 0 0 12 5 4.5 4.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
};

export function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value != null && value !== false) node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of [].concat(kids)) {
    if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function iconMarkup(icon, className = "ak-icon") {
  const body = PATHS[icon] || PATHS["file-text"];
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function makeIcon(tool, extraClass = "") {
  return el("span", {
    class: `ak-tool-icon ak-tool-icon--${tool.color || "blue"} ${extraClass}`.trim(),
    html: iconMarkup(tool.icon),
    "aria-hidden": "true",
  });
}

export function isOpenable(tool) {
  return !!tool && OPENABLE_STATUSES.has(tool.status) && tool.route && tool.route !== "#";
}

export function statusBadge(tool, extraClass = "") {
  const meta = STATUS_META[tool.status] || STATUS_META["coming-soon"];
  return el("span", {
    class: `ak-status ${meta.className} ${extraClass}`.trim(),
    text: meta.badge,
  });
}

export function getStatusBadges(tool) {
  const badges = [];
  if (tool.status === "ready") badges.push({ label: "Pronta", className: "is-ready" });
  if (tool.isLocalFirst) badges.push({ label: "Local", className: "is-local" });
  else badges.push({ label: "Navegador", className: "is-browser" });
  if (tool.mobileOnly) badges.push({ label: "Mobile", className: "is-mobile" });
  if (tool.status === "beta") badges.push({ label: "Beta", className: "is-beta" });
  if (tool.status === "coming-soon") badges.push({ label: "Em breve", className: "is-soon" });
  if (tool.heavy) badges.push({ label: "Pesada", className: "is-heavy" });
  if (tool.usesCdn) badges.push({ label: "CDN", className: "is-cdn" });
  if (tool.usesWasm) badges.push({ label: "WASM", className: "is-wasm" });
  return badges;
}

export function createToolCard(tool, options = {}) {
  const {
    className = "ak-tool-card",
    compact = false,
    showBadges = true,
    showAction = true,
    onOpen = null,
    onUnavailable = null,
    onDetails = null,
    favorite = false,
    onFavorite = null,
  } = options;
  const openable = isOpenable(tool);
  const cardIsAction = !showAction;
  const tag = cardIsAction ? (openable ? "a" : "button") : "article";
  const openToolRoute = () => {
    if (onOpen) onOpen(tool);
    if (!cardIsAction && openable) window.location.href = tool.route;
  };
  const node = el(tag, {
    class: `${className}${compact ? " is-compact" : ""}${openable ? "" : " is-disabled"}`,
    href: cardIsAction && openable ? tool.route : null,
    type: cardIsAction && !openable ? "button" : null,
    title: tool.tooltip || tool.description,
    role: !cardIsAction && openable ? "link" : null,
    tabindex: !cardIsAction && openable ? "0" : null,
    "aria-disabled": !openable && cardIsAction ? "true" : null,
    onclick: cardIsAction ? ((event) => {
      if (openable) {
        openToolRoute();
        return;
      }
      event.preventDefault();
      if (onDetails) onDetails(tool);
      else if (onUnavailable) onUnavailable(tool);
    }) : null,
  });

  if (!cardIsAction && openable) {
    node.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, textarea, label")) return;
      openToolRoute();
    });
    node.addEventListener("keydown", (event) => {
      if (event.target !== node) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openToolRoute();
    });
  }

  const content = el("span", { class: "ak-tool-card__content" }, [
    makeIcon(tool),
    el("span", { class: "ak-tool-card__copy" }, [
      el("strong", { text: tool.name }),
      el("span", { text: tool.description }),
    ]),
  ]);
  node.appendChild(content);

  if (showBadges) {
    node.appendChild(el("span", { class: "ak-tool-card__badges" },
      getStatusBadges(tool).map((badge) => el("span", { class: `ak-status ${badge.className}`, text: badge.label }))
    ));
  }

  if (showAction) {
    const actions = el("span", { class: "ak-tool-card__actions" });
    if (openable) {
      actions.appendChild(el("a", {
        class: "ak-tool-card__action",
        href: tool.route,
        title: `Abrir ${tool.name}`,
        onclick: () => { if (onOpen) onOpen(tool); },
        text: "Abrir",
      }));
    } else {
      actions.appendChild(el("button", {
        class: "ak-tool-card__action ak-tool-card__action--soft",
        type: "button",
        title: "Em desenvolvimento — veja status e limites.",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (onDetails) onDetails(tool);
          else if (onUnavailable) onUnavailable(tool);
        },
        text: "Em breve",
      }));
    }
    actions.appendChild(el("button", {
      class: "ak-tool-card__action ak-tool-card__action--ghost",
      type: "button",
      title: "Veja formatos aceitos, limites e como a ferramenta funciona.",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (onDetails) onDetails(tool);
        else if (!openable && onUnavailable) onUnavailable(tool);
      },
      text: "Detalhes",
    }));
    node.appendChild(actions);
  }

  if (onFavorite) {
    const star = el("button", {
      class: `ak-favorite${favorite ? " is-active" : ""}`,
      type: "button",
      "aria-label": `${favorite ? "Remover" : "Adicionar"} ${tool.name} dos favoritos`,
      "aria-pressed": String(favorite),
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        onFavorite(tool);
      },
      html: iconMarkup("star"),
    });
    node.appendChild(star);
  }

  return node;
}
