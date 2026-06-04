import { STATUS_META, getTool } from "./registry.js?v=13";
import { el, getStatusBadges, iconMarkup, isOpenable } from "./render.js?v=12";

let overlay = null;
let activeToolId = null;

const GITHUB_URL = "https://github.com/marcosduailibi/comprimir-pdfs";

function textList(values, fallback = "Nao informado") {
  return values && values.length ? values.map((item) => String(item).toUpperCase()).join(", ") : fallback;
}

function processingText(tool) {
  if (tool.mobileOnly) return "Navegador mobile, com alternativa por importacao quando disponivel.";
  if (tool.isLocalFirst) return "Local no navegador.";
  return "Navegador.";
}

function statusText(tool) {
  if (tool.status === "ready") return "Pronta para uso.";
  if (tool.status === "beta") return "Beta. Confira o resultado antes de usar em documentos importantes.";
  return "Em breve. Esta ferramenta ainda nao aceita arquivos nesta versao.";
}

function limitText(tool) {
  if (tool.maxTotalSizeBytes) return "Ate 1 GB no total, conforme memoria disponivel no navegador.";
  if (tool.categoryIds?.includes("video") || tool.categoryIds?.includes("audio")) {
    return "Arquivos grandes podem demorar e exigir mais memoria.";
  }
  if (tool.categoryIds?.includes("pdf")) return "Ate 1 GB quando o fluxo estiver disponivel, processando por partes quando necessario.";
  return "Depende do formato e da memoria disponivel no navegador.";
}

function privacyText(tool) {
  if (tool.status === "coming-soon") {
    return "Esta ferramenta ainda esta em desenvolvimento e nao aceita arquivos nesta versao.";
  }
  return "Os arquivos escolhidos ficam na aba do navegador e nao sao enviados para servidores do ArqKit.";
}

function knownLimits(tool) {
  const limits = [];
  if (tool.status === "coming-soon") limits.push("Ainda nao ha fluxo de upload ou processamento para esta ferramenta.");
  if (tool.status === "beta") limits.push("Ferramenta em beta: valide o arquivo final antes de usar oficialmente.");
  if (tool.heavy) limits.push("Pode carregar bibliotecas maiores ou usar WASM/Web Workers, exigindo mais memoria.");
  if (tool.requiresCamera) limits.push("Acesso a camera exige HTTPS e permissao do navegador.");
  if (tool.requiresPassword) limits.push("Use apenas em arquivos para os quais voce tem permissao e conhece a senha.");
  if (tool.notes?.length) limits.push(...tool.notes);
  return limits;
}

function primaryActionText(tool) {
  if (tool.heavy || tool.usesWasm) return "Carregar ferramenta";
  if (tool.status === "beta") return "Usar versao beta";
  return "Usar ferramenta";
}

function ensureModal() {
  if (overlay) return overlay;
  overlay = el("div", { class: "modal-overlay tool-detail-overlay", id: "toolDetailModal", hidden: true }, [
    el("div", { class: "modal tool-detail-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "toolDetailTitle" }, [
      el("div", { class: "modal__head" }, [
        el("h2", { id: "toolDetailTitle", text: "Detalhes da ferramenta" }),
        el("button", { class: "modal__close", type: "button", "aria-label": "Fechar detalhes", text: "x" }),
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

function row(label, value) {
  return el("div", { class: "tool-detail-row" }, [
    el("span", { text: label }),
    el("strong", { text: value }),
  ]);
}

function renderBody(tool) {
  const meta = STATUS_META[tool.status] || STATUS_META["coming-soon"];
  const badges = getStatusBadges(tool).map((badge) =>
    el("span", { class: `ak-status ${badge.className}`, text: badge.label })
  );
  const limits = knownLimits(tool);

  return [
    el("div", { class: "tool-detail-hero" }, [
      el("span", {
        class: `ak-tool-icon ak-tool-icon--${tool.color || "blue"}`,
        html: iconMarkup(tool.icon),
        "aria-hidden": "true",
      }),
      el("div", {}, [
        el("p", { class: "tool-detail-kicker", text: meta.label }),
        el("h3", { text: tool.name }),
        el("p", { text: tool.tooltip || tool.description }),
      ]),
    ]),
    el("div", { class: "ak-tool-card__badges tool-detail-badges" }, badges),
    el("div", { class: "tool-detail-grid" }, [
      row("Processamento", processingText(tool)),
      row("Entrada", textList(tool.inputExtensions)),
      row("Saida", textList(tool.outputExtensions)),
      row("Limite", limitText(tool)),
      row("Web Worker", tool.usesWorker ? "Usado quando disponivel" : tool.heavy || tool.categoryIds?.includes("pdf") ? "Quando necessario" : "Nao necessario"),
      row("WASM", tool.usesWasm || tool.heavy ? "Pode usar" : "Nao necessario para o fluxo principal"),
      row("CDN", tool.usesCdn ? "Pode carregar biblioteca externa" : "Nao necessario para o fluxo principal"),
    ]),
    el("div", { class: "tool-detail-privacy" }, [
      el("strong", { text: "Privacidade" }),
      el("p", { text: privacyText(tool) }),
    ]),
    limits.length ? el("div", { class: "tool-detail-limits" }, [
      el("strong", { text: "Limitacoes conhecidas" }),
      el("ul", {}, limits.map((item) => el("li", { text: item }))),
    ]) : null,
    el("div", { class: "result__actions tool-detail-actions" }, [
      isOpenable(tool)
        ? el("a", { class: "btn btn--primary", href: tool.route, text: primaryActionText(tool) })
        : el("button", { class: "btn btn--primary", type: "button", disabled: true, text: "Ainda em desenvolvimento" }),
      el("a", {
        class: "btn btn--ghost",
        href: GITHUB_URL,
        target: "_blank",
        rel: "noopener noreferrer",
        text: "Ver codigo no GitHub",
      }),
    ]),
  ];
}

export function openToolDetails(toolOrId, options = {}) {
  const tool = typeof toolOrId === "string" ? getTool(toolOrId) : toolOrId;
  if (!tool) return;
  ensureModal();
  activeToolId = tool.id;
  const title = overlay.querySelector("#toolDetailTitle");
  const body = overlay.querySelector("#toolDetailBody");
  title.textContent = `Detalhes: ${tool.name}`;
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
