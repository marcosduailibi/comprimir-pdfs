// camera-ui.js
// Helpers pequenos para a interface da camera.

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2).replace(".", ",") + " MB";
  if (n >= 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
}

export function safeImageName(name, fallback = "pagina") {
  return String(name || fallback)
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || fallback;
}

export function setLiveStatus(node, message) {
  if (node) node.textContent = message || "";
}
