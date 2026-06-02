// state.js
// Estado global da aplicacao + dados fixos (presets, limites, modos, etapas) e
// helpers de validacao. Sem dependencias de DOM ou de PDF.

import { detectDevice } from "./utils.js";

const MB = 1024 * 1024;

// ------------------------------ Estado ------------------------------
export const appState = {
  mode: "compress",          // compress | merge | merge_then_compress | compress_then_merge
  files: [],                 // [{ id, file, name, size, pages }]
  quality: 50,
  passes: 2,
  preset: "balanced",
  device: detectDevice(),
  status: "idle",            // idle|files_selected|ready|processing|paused|cancelled|done|error
  result: null,              // { blob, url, name, stats }
};

// Estado da tarefa em processamento (espelha o spec).
export const taskState = {
  mode: "merge_then_compress",
  files: [],
  currentFileIndex: 0,
  currentFileName: "",
  currentPass: 0,
  currentPage: 0,
  totalFiles: 0,
  totalPages: 0,
  quality: 50,
  passes: 2,
  progress: 0,
  status: "idle",
  isPaused: false,
  isCancelled: false,
  startedAt: null,
  pausedAt: null,
  elapsedBeforePause: 0,
  resultBlob: null,
};

// ------------------------------ Presets ------------------------------
export const PRESETS = {
  light:    { label: "Leve", quality: 75, passes: 1, description: "Menor redução", primary: true },
  balanced: { label: "Equilibrado", quality: 50, passes: 2, description: "Boa redução", primary: true },
  strong:   { label: "Forte", quality: 30, passes: 3, description: "Maior redução", primary: true },
  max:      { label: "Máxima compressão", quality: 15, passes: 3, description: "Menor tamanho possível, qualidade mais baixa.", primary: false },
  custom:   { label: "Personalizado", quality: null, passes: null, description: "Controle manual da qualidade e das passadas.", primary: false },
};

// ------------------------------- Modos -------------------------------
export const MODES = [
  { id: "compress", icon: "🗜️", title: "Comprimir",
    text: "Reduzir o tamanho do PDF", multi: false, primary: true },
  { id: "merge", icon: "🔗", title: "Juntar PDFs",
    text: "Unir vários PDFs em um só", multi: true, primary: true },
  { id: "merge_then_compress", icon: "🧩", title: "Juntar e comprimir",
    text: "Unir e reduzir o tamanho", multi: true, recommended: true, primary: true },
  { id: "compress_then_merge", icon: "📚", title: "Comprimir cada PDF e depois juntar",
    text: "Comprime cada arquivo individualmente e depois junta todos em um único PDF.", multi: true, primary: false },
];

export const modeAllowsMultiple = (mode) => MODES.find((m) => m.id === mode)?.multi ?? false;
export const modeNeedsCompression = (mode) => mode !== "merge";

// Etapas visuais por modo (ids batem com os emitidos pelo worker).
export const STEPS = {
  compress: [
    ["loaded", "Arquivo carregado"], ["analyzed", "PDF analisado"],
    ["images", "Imagens recomprimidas"], ["passes", "Passadas aplicadas"],
    ["generated", "PDF final gerado"], ["download", "Download preparado"],
  ],
  merge: [
    ["loaded", "Arquivos carregados"], ["order", "Ordem confirmada"],
    ["copied", "Páginas copiadas"], ["generated", "PDF único gerado"],
    ["download", "Download preparado"],
  ],
  merge_then_compress: [
    ["loaded", "Arquivos carregados"], ["merged", "PDFs unidos"],
    ["images", "Imagens recomprimidas"], ["passes", "Passadas aplicadas"],
    ["generated", "PDF final gerado"], ["download", "Download preparado"],
  ],
  compress_then_merge: [
    ["loaded", "Arquivos carregados"], ["compressed", "PDFs comprimidos individualmente"],
    ["merged", "PDFs comprimidos unidos"], ["generated", "PDF final gerado"],
    ["download", "Download preparado"],
  ],
};

// ------------------------------ Limites ------------------------------
export const LIMITS = {
  desktop: {
    recommended: { files: 10, total: 200 * MB, perFile: 80 * MB, pages: 800 },
    absolute:    { files: 20, total: 300 * MB, perFile: 120 * MB, pages: 1500 },
  },
  mobile: {
    recommended: { files: 5, total: 80 * MB, perFile: 30 * MB, pages: 300 },
    absolute:    { files: 10, total: 150 * MB, perFile: 80 * MB, pages: 800 },
  },
};

/**
 * Valida a selecao contra os limites do dispositivo.
 * @returns {{ level: 'ok'|'warn'|'block', messages: string[] }}
 */
export function validateSelection(files, device = appState.device) {
  const lim = LIMITS[device] || LIMITS.desktop;
  const count = files.length;
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  const maxFile = files.reduce((m, f) => Math.max(m, f.size || 0), 0);
  const totalPages = files.reduce((s, f) => s + (f.pages || 0), 0);

  const a = lim.absolute, r = lim.recommended;
  const messages = [];

  if (count > a.files || total > a.total || maxFile > a.perFile || totalPages > a.pages) {
    return {
      level: "block",
      messages: ["Esta seleção é muito grande para processar com segurança no navegador. Reduza a quantidade de PDFs ou divida a operação em partes."],
    };
  }
  if (count > r.files || total > r.total || maxFile > r.perFile || totalPages > r.pages) {
    messages.push("Essa operação pode demorar ou consumir muita memória do navegador. Para melhor desempenho, recomendamos reduzir a quantidade ou o tamanho dos PDFs.");
    return { level: "warn", messages };
  }
  return { level: "ok", messages };
}

/** Classificacao de risco textual para o resumo. */
export function riskLevel(files, device = appState.device) {
  const v = validateSelection(files, device);
  if (v.level === "block") return "Alto";
  if (v.level === "warn") return "Médio";
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  return total > (LIMITS[device].recommended.total / 2) ? "Médio" : "Baixo";
}

// ----------------------- Textos dinamicos de UI -----------------------
export function qualityHint(v) {
  let text;
  if (v >= 80) text = "Alta qualidade visual, menor compressão.";
  else if (v >= 60) text = "Boa qualidade, compressão leve.";
  else if (v >= 40) text = "Equilíbrio entre tamanho menor e qualidade aceitável.";
  else if (v >= 25) text = "Compressão forte, pode reduzir nitidez.";
  else text = "Compressão máxima, maior perda visual.";

  let warn = null;
  if (v < 15) warn = "Compressão muito agressiva. Verifique o PDF final antes de usar ou compartilhar.";
  else if (v < 25) warn = "Essa configuração prioriza tamanho menor e pode causar perda visível de qualidade nas imagens.";
  return { text, warn };
}

export function passesInfo(n) {
  let text, warn = null;
  if (n <= 1) text = "Rápida — menor tempo.";
  else if (n === 2) text = "Recomendada — equilíbrio.";
  else if (n === 3) text = "Forte — pode demorar mais.";
  else { text = "Avançada — ganhos menores e mais tempo."; warn = "Mais passadas podem demorar bastante e nem sempre reduzem muito o tamanho final. Para maior compressão, ajuste principalmente a qualidade das imagens."; }
  return { text, warn };
}

/** Detecta qual preset corresponde aos valores atuais (ou 'custom'). */
export function presetFromValues(quality, passes) {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (key === "custom") continue;
    if (p.quality === quality && p.passes === passes) return key;
  }
  return "custom";
}
