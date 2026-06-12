import { CATEGORIES, getTool } from "./registry.js?v=14";
import { el, getStatusBadges, iconMarkup, isOpenable } from "./render.js?v=13";

let overlay = null;
let activeToolId = null;

const GITHUB_URL = "https://github.com/marcosduailibi/comprimir-pdfs";

function textList(values, fallback = "Não informado") {
  return values && values.length ? values.map((item) => String(item).toUpperCase()).join(", ") : fallback;
}

function categoryNames(tool) {
  const names = (tool.categoryIds || [])
    .map((id) => CATEGORIES.find((category) => category.id === id)?.name)
    .filter(Boolean);
  return names.length ? names.join(" · ") : "Ferramenta";
}

function processingText(tool) {
  if (tool.mobileOnly) return "Navegador mobile, com importação quando disponível";
  if (tool.isLocalFirst) return "100% no navegador";
  return "Navegador";
}

function availabilityText(tool) {
  if (tool.status === "ready") return "Pronta para usar";
  if (tool.status === "beta") return "Beta";
  return "Em desenvolvimento";
}

function limitText(tool) {
  if (tool.status === "coming-soon") return "Em desenvolvimento. Ainda não aceita arquivos nesta versão.";
  if (tool.maxTotalSizeBytes) return "Até 1 GB no total, conforme memória disponível no navegador.";
  if (tool.categoryIds?.includes("video") || tool.categoryIds?.includes("audio")) {
    return "Arquivos grandes podem demorar e exigir mais memória.";
  }
  if (tool.categoryIds?.includes("pdf")) return "Sem limite fixo; arquivos grandes usam mais memória da aba.";
  return "Depende do formato e da memória disponível no navegador.";
}

function privacyText(tool) {
  if (tool.status === "coming-soon") {
    return "Quando pronta, será local por padrão. Hoje não aceita arquivos.";
  }
  return "Os arquivos escolhidos ficam na aba do navegador e não são enviados para servidores do ArqKit.";
}

function knownLimits(tool) {
  const limits = [];
  if (tool.status === "coming-soon") limits.push("Ainda não há fluxo de upload ou processamento para esta ferramenta.");
  if (tool.status === "beta") limits.push("Ferramenta em beta: valide o arquivo final antes de usar oficialmente.");
  if (tool.heavy) limits.push("Pode carregar bibliotecas maiores ou usar WASM/Web Workers, exigindo mais memória.");
  if (tool.requiresCamera) limits.push("Acesso à câmera exige HTTPS e permissão do navegador.");
  if (tool.requiresPassword) limits.push("Use apenas em arquivos para os quais você tem permissão e conhece a senha.");
  if (tool.notes?.length) limits.push(...tool.notes);
  return limits;
}

function primaryActionText(tool) {
  if (tool.heavy || tool.usesWasm) return "Carregar ferramenta";
  if (tool.status === "beta") return "Usar versão beta";
  return "Usar ferramenta";
}

function ensureModal() {
  if (overlay) return overlay;
  overlay = el("div", { class: "modal-overlay tool-detail-overlay", id: "toolDetailModal", hidden: true }, [
    el("div", { class: "modal tool-detail-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "toolDetailTitle" }, [
      el("div", { class: "modal__head" }, [
        el("span", { class: "ak-tool-icon", id: "toolDetailIcon", "aria-hidden": "true" }),
        el("div", { class: "modal__title" }, [
          el("p", { class: "modal__kicker", id: "toolDetailKicker" }),
          el("h2", { id: "toolDetailTitle", text: "Detalhes da ferramenta" }),
          el("p", { id: "toolDetailDesc" }),
        ]),
        el("button", { class: "modal__close", type: "button", "aria-label": "Fechar detalhes", html: iconMarkup("x") }),
      ]),
      el("div", { class: "modal__body", id: "toolDetailBody" }),
    ]),
  ]);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeToolDetails();
  });
  overlay.querySelector(".modal__close")?.addEventListener("click", closeToolDetails);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeToolDetails();
  });
  return overlay;
}

function spec(label, value) {
  return el("div", { class: "tool-detail-row" }, [
    el("span", { text: label }),
    el("strong", { text: value }),
  ]);
}

function callout(kind, icon, title, text) {
  return el("div", { class: `ak-callout ak-callout--${kind}` }, [
    el("span", { html: iconMarkup(icon), "aria-hidden": "true" }),
    el("div", {}, [
      el("b", { text: title }),
      el("p", { text: text }),
    ]),
  ]);
}

function renderBody(tool) {
  const badges = getStatusBadges(tool).map((badge) =>
    el("span", { class: `ak-status ${badge.className}`, text: badge.label })
  );
  const limits = knownLimits(tool);

  return [
    el("div", { class: "tool-detail-badges" }, badges),
    el("div", { class: "tool-detail-grid" }, [
      spec("Entrada", textList(tool.inputExtensions)),
      spec("Saída", textList(tool.outputExtensions)),
      spec("Processamento", processingText(tool)),
      spec("Disponibilidade", availabilityText(tool)),
    ]),
    callout("ok", "shield", "Privacidade", privacyText(tool)),
    callout("warn", "eye", "Limites", limitText(tool)),
    limits.length ? el("div", { class: "tool-detail-limits" }, [
      el("strong", { text: "Limitações conhecidas" }),
      el("ul", {}, limits.map((item) => el("li", { text: item }))),
    ]) : null,
    el("div", { class: "result__actions tool-detail-actions" }, [
      isOpenable(tool)
        ? el("a", { class: "btn btn--primary", href: tool.route, html: `${iconMarkup("arrow-right")}<span>${primaryActionText(tool)}</span>` })
        : el("button", { class: "btn btn--soft", type: "button", disabled: true, text: "Em desenvolvimento" }),
      el("a", {
        class: "btn btn--ghost",
        href: GITHUB_URL,
        target: "_blank",
        rel: "noopener noreferrer",
        html: `${iconMarkup("github")}<span>Ver código</span>`,
      }),
    ]),
  ];
}

export function openToolDetails(toolOrId, options = {}) {
  const tool = typeof toolOrId === "string" ? getTool(toolOrId) : toolOrId;
  if (!tool) return;
  ensureModal();
  activeToolId = tool.id;
  const icon = overlay.querySelector("#toolDetailIcon");
  icon.className = `ak-tool-icon ak-tool-icon--${tool.color || "blue"}`;
  icon.innerHTML = iconMarkup(tool.icon);
  overlay.querySelector("#toolDetailKicker").textContent = categoryNames(tool);
  overlay.querySelector("#toolDetailTitle").textContent = tool.name;
  overlay.querySelector("#toolDetailDesc").textContent = tool.tooltip || tool.description;
  const body = overlay.querySelector("#toolDetailBody");
  body.innerHTML = "";
  renderBody(tool).forEach((node) => { if (node) body.appendChild(node); });
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  overlay.querySelector(".modal__close")?.focus();

  if (options.updateHash !== false && window.location.hash !== `#/ferramenta/${tool.id}`) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/ferramenta/${tool.id}`);
  }
}

export function closeToolDetails() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
  if (activeToolId && window.location.hash === `#/ferramenta/${activeToolId}`) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  activeToolId = null;
}

function handleHashRoute() {
  const prefix = "#/ferramenta/";
  if (!window.location.hash.startsWith(prefix)) return;
  const id = window.location.hash.slice(prefix.length);
  if (id) openToolDetails(id, { updateHash: false });
}

export function bindToolDetails() {
  ensureModal();
  window.addEventListener("hashchange", handleHashRoute);
  handleHashRoute();
}
