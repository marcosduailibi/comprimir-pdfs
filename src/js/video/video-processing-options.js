const MB = 1024 * 1024;

export const PROCESSING_MODES = {
  gentle: {
    label: "Mais leve",
    description: "Reduz pressao de CPU e memoria. Melhor para celular, notebook simples e arquivos grandes.",
    x264Preset: "ultrafast",
    webm: ["-deadline", "good", "-cpu-used", "8"],
    maxThreads: 1,
  },
  balanced: {
    label: "Equilibrado",
    description: "Boa relacao entre tempo, tamanho final e estabilidade.",
    x264Preset: "veryfast",
    webm: ["-deadline", "good", "-cpu-used", "5"],
    maxThreads: 2,
  },
  fast: {
    label: "Mais rapido",
    description: "Prioriza terminar antes. Pode gerar arquivo um pouco maior.",
    x264Preset: "ultrafast",
    webm: ["-deadline", "realtime", "-cpu-used", "8"],
    maxThreads: 3,
  },
  quality: {
    label: "Mais qualidade",
    description: "Preserva mais qualidade, mas exige mais do navegador e pode demorar bastante.",
    x264Preset: "medium",
    webm: ["-deadline", "good", "-cpu-used", "2"],
    maxThreads: 2,
  },
};

export function detectBrowserCapabilities(nav = globalThis.navigator, win = globalThis) {
  const cores = Math.max(1, Math.min(16, Number(nav?.hardwareConcurrency) || 2));
  const memory = Number(nav?.deviceMemory) > 0 ? Number(nav.deviceMemory) : null;
  const coarsePointer = !!win?.matchMedia?.("(pointer: coarse)")?.matches;
  const narrow = Number(win?.innerWidth) > 0 && Number(win.innerWidth) <= 760;
  const mobile = coarsePointer || narrow;
  const lowPower = mobile || cores <= 4 || (memory !== null && memory <= 4);
  return { cores, memory, mobile, lowPower };
}

export function isLargeVideoJob({ fileSize = 0, durationSeconds = 0 } = {}) {
  return fileSize >= 250 * MB || durationSeconds >= 10 * 60;
}

export function recommendedProcessingMode(context = {}) {
  const capabilities = context.capabilities || detectBrowserCapabilities();
  const largeJob = isLargeVideoJob(context);
  if (capabilities.lowPower || largeJob) return "gentle";
  if (capabilities.cores >= 8 && (capabilities.memory === null || capabilities.memory >= 8)) return "fast";
  return "balanced";
}

export function isProcessingModeAllowed(modeId, context = {}) {
  if (!PROCESSING_MODES[modeId]) return false;
  if (modeId !== "quality") return true;
  const capabilities = context.capabilities || detectBrowserCapabilities();
  return !capabilities.lowPower && !isLargeVideoJob(context);
}

export function resolveProcessingMode(selected = "auto", context = {}) {
  const requested = PROCESSING_MODES[selected] ? selected : "auto";
  if (requested === "auto") return recommendedProcessingMode(context);
  return isProcessingModeAllowed(requested, context) ? requested : recommendedProcessingMode(context);
}

export function processingThreadCount(modeId, capabilities = detectBrowserCapabilities()) {
  const mode = PROCESSING_MODES[modeId] || PROCESSING_MODES.balanced;
  return Math.max(1, Math.min(mode.maxThreads, capabilities.cores || 1));
}

export function processingArgsFor(format, selected = "auto", context = {}) {
  const capabilities = context.capabilities || detectBrowserCapabilities();
  const modeId = resolveProcessingMode(selected, { ...context, capabilities });
  const mode = PROCESSING_MODES[modeId] || PROCESSING_MODES.balanced;
  if (format === "gif") return [];
  if (format === "webm") return [...mode.webm, "-threads", String(processingThreadCount(modeId, capabilities))];
  return ["-preset", mode.x264Preset, "-threads", String(processingThreadCount(modeId, capabilities))];
}

export function processingSummary(selected = "auto", context = {}) {
  const capabilities = context.capabilities || detectBrowserCapabilities();
  const recommended = recommendedProcessingMode({ ...context, capabilities });
  const resolved = resolveProcessingMode(selected, { ...context, capabilities });
  const mode = PROCESSING_MODES[resolved];
  return {
    selected,
    recommended,
    resolved,
    label: mode.label,
    description: mode.description,
    threads: processingThreadCount(resolved, capabilities),
    cores: capabilities.cores,
    memory: capabilities.memory,
    lowPower: capabilities.lowPower,
    largeJob: isLargeVideoJob(context),
    qualityBlocked: selected === "quality" && resolved !== "quality",
  };
}
