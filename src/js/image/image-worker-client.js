const WORKER_URL = new URL("../../workers/image-compress-worker.js", import.meta.url);

export function canUseImageWorker() {
  return typeof Worker === "function" && typeof OffscreenCanvas === "function" && typeof createImageBitmap === "function";
}

export function createImageCompressionWorker() {
  if (!canUseImageWorker()) return null;
  let seq = 0;
  let worker = new Worker(WORKER_URL, { type: "module" });
  const pending = new Map();

  worker.addEventListener("message", (event) => {
    const { id, type, result, error } = event.data || {};
    const task = pending.get(id);
    if (!task) return;
    if (type === "DONE") {
      pending.delete(id);
      task.resolve(result);
    } else if (type === "ERROR") {
      pending.delete(id);
      task.reject(Object.assign(new Error(error?.message || "Falha ao comprimir imagem."), { code: error?.code }));
    }
  });

  worker.addEventListener("error", (event) => {
    for (const task of pending.values()) task.reject(event.error || new Error(event.message));
    pending.clear();
  });

  return {
    compress(file, options) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type: "COMPRESS_IMAGE", file, options });
      });
    },
    cancel() {
      try { worker.postMessage({ type: "CANCEL" }); } catch {}
      worker.terminate();
      for (const task of pending.values()) task.reject(Object.assign(new Error("Compressao cancelada."), { name: "AbortError" }));
      pending.clear();
    },
    close() {
      worker.terminate();
      pending.clear();
    },
  };
}
