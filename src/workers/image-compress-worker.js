import { compressImageFile } from "../js/image/image-compressor.js";

let cancelled = false;

self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type === "CANCEL") {
    cancelled = true;
    return;
  }
  if (data.type !== "COMPRESS_IMAGE") return;

  const { id, file, options } = data;
  try {
    if (cancelled) throw Object.assign(new Error("Compressao cancelada."), { name: "AbortError" });
    const result = await compressImageFile(file, options);
    if (cancelled) throw Object.assign(new Error("Compressao cancelada."), { name: "AbortError" });
    self.postMessage({ id, type: "DONE", result });
  } catch (error) {
    self.postMessage({
      id,
      type: "ERROR",
      error: { code: error?.code || error?.name || "ERROR", message: error?.message || "Falha ao comprimir imagem." },
    });
  }
});

