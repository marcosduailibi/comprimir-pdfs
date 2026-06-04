const MB = 1024 * 1024;

export const PROCESSING_MODES = {
  compatible: {
    label: "Compativel",
    description: "Usa poucos recursos. Melhor para celular, notebook simples e arquivos grandes.",
    x264Preset: "veryfast",
    webm: ["-deadline", "good", "-cpu-used", "8"],
    maxThreads: 1,
    risk: "low",
  },
  gentle: {
    label: "Mais leve",
    description: "Reduz pressao de CPU e memoria. Melhor para celular, notebook simples e arquivos grandes.",
    x264Preset: "ultrafast",
    webm: ["-deadline", "good", "-cpu-used", "8"],
    maxThreads: 1,
    aliasOf: "compatible",
    risk: "low",
  },
  speed: {
    label: "Alta velocidade",
    description: "Prioriza terminar antes. O arquivo final pode ficar maior.",
    x264Preset: "ultrafast",
    webm: ["-deadline", "realtime", "-cpu-used", "8"],
    maxThreads: 3,
    risk: "medium",
  },
  fast: {
    label: "Alta velocidade",
    description: "Prioriza terminar antes. O arquivo final pode ficar maior.",
    x264Preset: "ultrafast",
    webm: ["-deadline", "realtime", "-cpu-used", "8"],
    maxThreads: 3,
    aliasOf: "speed",
    risk: "medium",
  },
  balanced: {
    label: "Equilibrado",
    description: "Boa relacao entre tempo, tamanho final e estabilidade.",
    x264Preset: "fast",
    webm: ["-deadline", "good", "-cpu-used", "5"],
    maxThreads: 2,
    risk: "medium",
  },
  compression: {
    label: "Mais compressao",
    description: "Gasta mais CPU para tentar gerar arquivo menor.",
    x264Preset: "slow",
    webm: ["-deadline", "good", "-cpu-used", "2"],
    maxThreads: 3,
    risk: "high",
  },
  maximum: {
    label: "Maxima compressao",
    description: "Usa preset lento e mais memoria. Pode travar navegadores fracos.",
    x264Preset: "slower",
    webm: ["-deadline", "best", "-cpu-used", "1"],
    maxThreads: 4,
    risk: "extreme",
  },
  custom: {
    label: "Personalizado",
    description: "Permite escolher preset e threads manualmente.",
    x264Preset: "medium",
    webm: ["-deadline", "good", "-cpu-used", "4"],
    maxThreads: 2,
    risk: "high",
  },
  quality: {
    label: "Mais qualidade",
    description: "Preserva mais qualidade, mas exige mais do navegador e pode demorar bastante.",
    x264Preset: "medium",
    webm: ["-deadline", "good", "-cpu-used", "2"],
    maxThreads: 2,
    aliasOf: "compression",
    risk: "high",
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
  if (capabilities.lowPower || largeJob) return "compatible";
  if (capabilities.cores >= 8 && (capabilities.memory === null || capabilities.memory >= 8)) return "speed";
  return "balanced";
}

export function isProcessingModeAllowed(modeId, context = {}) {
  return !!PROCESSING_MODES[modeId];
}

export function resolveProcessingMode(selected = "auto", context = {}) {
  const requested = PROCESSING_MODES[selected] ? selected : "auto";
  if (requested === "auto") return recommendedProcessingMode(context);
  return requested;
}

export function processingThreadCount(modeId, capabilities = detectBrowserCapabilities()) {
  const mode = PROCESSING_MODES[modeId] || PROCESSING_MODES.balanced;
  return Math.max(1, Math.min(mode.maxThreads, capabilities.cores || 1));
}

export function processingArgsFor(format, selected = "auto", context = {}, custom = {}) {
  const capabilities = context.capabilities || detectBrowserCapabilities();
  const modeId = resolveProcessingMode(selected, { ...context, capabilities });
  const mode = PROCESSING_MODES[modeId] || PROCESSING_MODES.balanced;
  if (format === "gif") return [];
  const threads = custom.threads
    ? Math.max(1, Math.min(Number(custom.threads) || 1, capabilities.cores || 1))
    : processingThreadCount(modeId, capabilities);
  if (format === "webm") {
    const cpuUsed = custom.webmCpuUsed ? ["-deadline", "good", "-cpu-used", String(custom.webmCpuUsed)] : mode.webm;
    return [...cpuUsed, "-threads", String(threads)];
  }
  const preset = custom.x264Preset || mode.x264Preset;
  return ["-preset", preset, "-threads", String(threads)];
}

export function processingSummary(selected = "auto", context = {}) {
  const capabilities = context.capabilities || detectBrowserCapabilities();
  const recommended = recommendedProcessingMode({ ...context, capabilities });
  const resolved = resolveProcessingMode(selected, { ...context, capabilities });
  const mode = PROCESSING_MODES[resolved];
  const riskyChoice = ["compression", "maximum", "custom"].includes(resolved);
  const riskMessage = riskyChoice && (capabilities.lowPower || isLargeVideoJob(context))
    ? "Este modo pode deixar a aba lenta ou sem memoria neste dispositivo."
    : riskyChoice
      ? "Este modo usa mais CPU/RAM para tentar reduzir mais o tamanho."
      : "";
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
    qualityBlocked: false,
    risk: mode.risk || "medium",
    riskMessage,
  };
}
