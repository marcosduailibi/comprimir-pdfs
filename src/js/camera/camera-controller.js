// camera-controller.js
// Controle de permissao e ciclo de vida da camera. Nao persiste imagens.

export const CAMERA_STATES = Object.freeze({
  idle: "idle",
  requestingPermission: "requesting-permission",
  cameraReady: "camera-ready",
  capturing: "capturing",
  processingCapture: "processing-capture",
  review: "review",
  editingPage: "editing-page",
  generatingPdf: "generating-pdf",
  done: "done",
  error: "error",
  cancelled: "cancelled",
  cleanup: "cleanup",
});

export function isLikelyMobile(nav = globalThis.navigator, win = globalThis) {
  const ua = nav?.userAgent || "";
  const coarse = win.matchMedia && win.matchMedia("(pointer: coarse)").matches;
  const narrow = win.innerWidth <= 820;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || narrow || (coarse && narrow);
}

export function stopCameraStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

export async function requestEnvironmentCamera({ deviceId = null } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error("Camera API unavailable");
    err.name = "NotSupportedError";
    throw err;
  }
  const video = deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

export function mapCameraError(err) {
  const name = err?.name || "UnknownError";
  const table = {
    NotAllowedError: ["A permissão da câmera foi negada.", "Permita a câmera nas configurações do navegador ou importe imagens."],
    PermissionDeniedError: ["A permissão da câmera foi negada.", "Permita a câmera nas configurações do navegador ou importe imagens."],
    NotFoundError: ["Nenhuma câmera foi encontrada.", "Use Importar imagens."],
    DevicesNotFoundError: ["Nenhuma câmera foi encontrada.", "Use Importar imagens."],
    NotReadableError: ["A câmera está em uso ou indisponível.", "Feche outros aplicativos e tente novamente."],
    TrackStartError: ["A câmera está em uso ou indisponível.", "Feche outros aplicativos e tente novamente."],
    OverconstrainedError: ["A câmera não suporta a configuração solicitada.", "Tente novamente ou importe imagens."],
    ConstraintNotSatisfiedError: ["A câmera não suporta a configuração solicitada.", "Tente novamente ou importe imagens."],
    SecurityError: ["O navegador bloqueou a câmera por segurança.", "Use HTTPS ou importe imagens."],
    AbortError: ["A captura foi interrompida.", "Tente novamente."],
    NotSupportedError: ["Este navegador não suporta câmera direta.", "Use Importar imagens."],
  };
  const [title, action] = table[name] || ["Não foi possível acessar a câmera.", "Tente novamente ou importe imagens."];
  return { code: name, title, action };
}
