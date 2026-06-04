// state.js
// Estado global da aplicacao + dados fixos (presets, limites, modos, etapas) e
// helpers de validacao. Sem dependencias de DOM ou de PDF.

import { detectDevice } from "./utils.js?v=10";
import { MB, MAX, calculateSelectedFilesSummary } from "./pdf-limits.js?v=10";

// Reexporta o resumo PURO para a UI consumir a partir de state.js.
export { MAX, calculateSelectedFilesSummary };

// ------------------------------ Estado ------------------------------
export const appState = {
  mode: "compress",          // compress | merge | merge_then_compress | compress_then_merge
  files: [],                 // [{ id, file, name, size, pages }]
  quality: 60,
  passes: 2,
  dpiPreset: "144",
  customDpi: 144,
  dpi: 144,                  // 0 = sem reduzir DPI
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
  quality: 60,
  passes: 2,
  dpi: 144,
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
  light:    { label: "Leve", quality: 80, passes: 1, dpi: 200, description: "Menor redução", primary: true },
  balanced: { label: "Equilibrado", quality: 60, passes: 2, dpi: 144, description: "Boa redução", primary: true },
  strong:   { label: "Forte", quality: 50, passes: 3, dpi: 120, description: "Maior redução", primary: true },
  max:      { label: "Máxima compressão", quality: 40, passes: 3, dpi: 96, description: "Menor tamanho possível, qualidade mais baixa.", primary: false },
  custom:   { label: "Personalizado", quality: null, passes: null, dpi: null, description: "Controle manual de qualidade, DPI e passadas.", primary: false },
};

export const DPI_PRESETS = [
  { value: "auto", label: "Automático" },
  { value: "72", label: "72 DPI" },
  { value: "96", label: "96 DPI" },
  { value: "120", label: "120 DPI" },
  { value: "144", label: "144 DPI (recomendado)" },
  { value: "150", label: "150 DPI" },
  { value: "180", label: "180 DPI" },
  { value: "200", label: "200 DPI" },
  { value: "240", label: "240 DPI" },
  { value: "300", label: "300 DPI" },
  { value: "none", label: "Sem reduzir DPI" },
  { value: "custom", label: "Personalizado" },
];

export function resolveDpiValue(preset, customDpi = 144) {
  if (preset === "none") return 0;
  if (preset === "custom") return Math.max(36, Math.min(600, Math.round(Number(customDpi) || 144)));
  if (preset === "auto") return 144;
  const n = Math.round(Number(preset));
  return Number.isFinite(n) && n > 0 ? Math.max(36, Math.min(600, n)) : 144;
}

export function dpiLabel(dpi) {
  return dpi === 0 ? "Sem reduzir DPI" : `${dpi} DPI`;
}

// ------------------------------- Modos -------------------------------
export const MODES = [
  { id: "compress", icon: "📉", title: "Comprimir",
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
// MAX e o resumo PURO vêm de pdf-limits.js (módulo-folha testável em Node).

// Pista de memória do dispositivo (em GB). Não existe em todos os navegadores;
// usada apenas como dica para apertar a "zona confortável".
export const DEVICE_MEMORY = (typeof navigator !== "undefined" && navigator.deviceMemory) || null;
const lowMemory = DEVICE_MEMORY != null && DEVICE_MEMORY <= 2;

// Zona "confortável" para a engine atual (carrega o PDF em memória). Acima
// disso a operação é permitida, mas avisamos que pode demorar/usar muita memória.
const COMFORT_BASE = {
  computer: { total: 250 * MB, perFile: 150 * MB, files: 25, pages: 2000 },
  mobile:  { total: 80 * MB,  perFile: 60 * MB,  files: 12, pages: 700 },
};
function comfortFor(device) {
  const base = COMFORT_BASE[device] || COMFORT_BASE.computer;
  if (!lowMemory) return base;
  return { total: base.total / 2, perFile: base.perFile / 2, files: base.files, pages: base.pages / 2 };
}
const fmtMB = (b) => Math.round(b / MB) + " MB";

/**
 * Valida a selecao. Limites rígidos => block (rejeição com motivo específico);
 * acima do confortável => warn (permite, mas alerta); senão ok.
 * @returns {{ level: 'ok'|'warn'|'block', messages: string[] }}
 */
export function validateSelection(files, device = appState.device) {
  const count = files.length;
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  const maxFile = files.reduce((m, f) => Math.max(m, f.size || 0), 0);
  const totalPages = files.reduce((s, f) => s + (f.pages || 0), 0);

  // --- Limites rígidos (rejeição com mensagem específica) ---
  if (count > MAX.files)
    return { level: "block", messages: [`Você selecionou ${count} PDFs. O limite é de ${MAX.files} arquivos por operação.`] };
  if (maxFile > MAX.perFile)
    return { level: "block", messages: ["Um dos PDFs tem mais de 1 GB. O limite é de 1 GB por arquivo."] };
  if (total > MAX.total)
    return { level: "block", messages: [`A soma dos PDFs (${fmtMB(total)}) passa de 1 GB. O limite total é de 1 GB por operação.`] };

  // --- Zona de atenção (permite, mas avisa) ---
  const c = comfortFor(device);
  if (total > c.total || maxFile > c.perFile || count > c.files || totalPages > c.pages) {
    return { level: "warn", messages: [
      "Arquivos grandes: o processamento acontece na memória do seu navegador e pode demorar ou usar bastante memória. Em dispositivos com pouca memória pode falhar — tente em um navegador de computador com mais memória e mantenha a aba aberta até concluir.",
    ] };
  }
  return { level: "ok", messages: [] };
}

/** Classificacao de risco textual para o resumo. */
export function riskLevel(files, device = appState.device) {
  const v = validateSelection(files, device);
  if (v.level === "block") return "Alto";
  if (v.level === "warn") return "Médio";
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  return total > (comfortFor(device).total / 2) ? "Médio" : "Baixo";
}

/**
 * Estima, de forma conservadora e SEM travar nada, se há armazenamento local
 * plausível para processar `totalBytes`. Usa navigator.storage.estimate()
 * quando disponível. Retorna { ok:boolean, reason?:string }.
 */
export async function estimateCapacity(totalBytes) {
  try {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const quota = est && typeof est.quota === "number" ? est.quota : null;
      const usage = est && typeof est.usage === "number" ? est.usage : 0;
      if (quota != null) {
        const free = quota - usage;
        // Folga conservadora: a engine atual mantém original + saída em memória.
        if (free > 0 && free < totalBytes * 2) return { ok: false, reason: "storage" };
      }
    }
  } catch { /* sem métricas: não bloqueia */ }
  return { ok: true };
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

export function dpiHint(dpi) {
  if (dpi === 0) return {
    text: "Sem redução de resolução. Mantém as dimensões das imagens embutidas quando possível.",
    warn: null,
  };

  let text;
  if (dpi <= 96) text = "Arquivo menor, mas scans e letras pequenas podem perder nitidez.";
  else if (dpi <= 150) text = "Equilíbrio para tela e documentos do dia a dia.";
  else if (dpi <= 240) text = "Mais nitidez, com redução menor.";
  else text = "Alta nitidez, geralmente com pouca redução por DPI.";

  const warn = dpi < 120 ? "DPI baixo pode prejudicar scans, fórmulas, gráficos e letras pequenas." : null;
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
export function presetFromValues(quality, passes, dpi = null) {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (key === "custom") continue;
    if (p.quality === quality && p.passes === passes && (dpi == null || p.dpi === dpi)) return key;
  }
  return "custom";
}
