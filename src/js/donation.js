// donation.js
// Apoio voluntario via Pix. Nunca bloqueia compressao, juncao ou download.
// Exibe e copia exatamente os dados informados; orienta o usuario a conferir o
// recebedor no app do banco antes de confirmar.

import { copyText, showToast } from "./utils.js";

export const PIX = {
  name: "Marcos Guimarães Duailibi Filho",
  bank: "Nubank",
  keyType: "Chave aleatória",
  key: "5d9c4bdd-8583-4fd8-858d-f9c18873ace5",
  payload:
    "00020101021226770014br.gov.bcb.pix01365d9c4bdd-8583-4fd8-858d-f9c18873ace50215Apoio cafezinho5204000053039865802BR5921MARCOS DUAILIBI FILHO6009BOA VISTA62130509CAFEZINHO6304B18C",
  qrUrl: "https://i.ibb.co/YFRDbTm9/qrcode.png",
};

export async function copyPixKey() {
  const ok = await copyText(PIX.key);
  showToast(ok ? "Chave Pix copiada!" : "Não foi possível copiar. Copie manualmente.", ok ? "success" : "error");
}

export async function copyPixPayload() {
  const ok = await copyText(PIX.payload);
  showToast(ok ? "Pix Copia e Cola copiado!" : "Não foi possível copiar. Copie manualmente.", ok ? "success" : "error");
}

export function showDonationModal() {
  const overlay = document.getElementById("modalDonation");
  if (!overlay) return;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  overlay.querySelector(".modal__close")?.focus();
}

export function closeDonationModal() {
  const overlay = document.getElementById("modalDonation");
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
}

/** Modal nao bloqueante exibido apos o inicio do download. */
export function showDownloadDonationPrompt() {
  const overlay = document.getElementById("modalDownloadDonation");
  if (!overlay) return;
  overlay.hidden = false;
}
function closeDownloadDonationPrompt() {
  const overlay = document.getElementById("modalDownloadDonation");
  if (overlay) overlay.hidden = true;
}

/** Liga todos os elementos de doacao da pagina. */
export function bindDonation() {
  // Preenche os dados Pix exibidos.
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("pixName", PIX.name);
  set("pixBank", PIX.bank);
  set("pixKeyType", PIX.keyType);
  document.querySelectorAll("[data-pix-key]").forEach((el) => (el.textContent = PIX.key));

  // Preenche os QR Codes (secao de doacao e modal "Apoie o projeto").
  const qrTargets = [
    ["pixQr", "pixQrError"],
    ["pixQrModal", "pixQrModalError"],
  ];
  for (const [imgId, errId] of qrTargets) {
    const qr = document.getElementById(imgId);
    if (!qr) continue;
    qr.src = PIX.qrUrl;
    qr.alt = "QR Code Pix para apoiar o projeto Comprimir PDF";
    qr.addEventListener("error", () => {
      const warn = document.getElementById(errId);
      if (warn) warn.hidden = false;
      qr.hidden = true;
    });
  }

  document.getElementById("copyPixKeyBtn")?.addEventListener("click", copyPixKey);
  document.getElementById("copyPixPayloadBtn")?.addEventListener("click", copyPixPayload);

  // Abrir/fechar a secao/modal de doacao a partir de qualquer gatilho.
  // Aceita tanto [data-donate] quanto [data-open-pix] (support-card / footer).
  document.querySelectorAll("[data-donate], [data-open-pix]").forEach((b) =>
    b.addEventListener("click", showDonationModal)
  );
  document.getElementById("modalDonation")?.addEventListener("click", (e) => {
    if (e.target.id === "modalDonation") closeDonationModal();
  });
  document.querySelector("#modalDonation .modal__close")?.addEventListener("click", closeDonationModal);

  // Prompt pos-download (nao bloqueante).
  document.getElementById("downloadDonationSupport")?.addEventListener("click", () => {
    closeDownloadDonationPrompt();
    showDonationModal();
  });
  document.getElementById("downloadDonationLater")?.addEventListener("click", closeDownloadDonationPrompt);
  document.getElementById("modalDownloadDonation")?.addEventListener("click", (e) => {
    if (e.target.id === "modalDownloadDonation") closeDownloadDonationPrompt();
  });
}
