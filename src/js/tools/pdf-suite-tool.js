import { CDN, loadMammoth, loadPdfLib, loadQpdf, loadTesseract } from "../cdn-loader.js";
import { createTextDocxBlob, createImageDocxBlob } from "../document/docx-basic.js";
import { createZipBlob } from "../image/zip.js";
import { copyPdfWithPdfLib, hexToRgb01, normalizePdfText, pdfImageName, readPdf, renderPageBlob } from "../pdf/pdf-tools.js";
import { runWasmTask } from "../wasm-runner-client.js";
import {
  $,
  baseName,
  bindStandardHeader,
  downloadBlob,
  escapeHtml,
  fileExt,
  formatBytes,
  parsePageSelection,
  resetProgress,
  setAlert,
  setProgress,
  setText,
  showStartNotice,
  scrollProgressSoon,
} from "./tool-page.js?v=2";
import { recordComplete, recordOpen } from "./stores.js?v=10";

const TOOL_CONFIG = {
  "pdf-to-images": {
    title: "PDF para imagens",
    description: "Renderize paginas de um PDF como JPG, PNG ou WebP usando PDF.js no navegador.",
    kicker: "PDF.js local",
    badges: ["Local", "Navegador", "Beta", "CDN"],
    accept: "application/pdf",
  },
  watermark: {
    title: "Marca d'agua",
    description: "Adicione marca d'agua de texto ou imagem em PDFs localmente com pdf-lib.",
    kicker: "pdf-lib local",
    badges: ["Local", "Navegador", "Pronta", "CDN"],
    accept: "application/pdf",
  },
  protect: {
    title: "Proteger PDF",
    description: "Adicione senha criptografica ao PDF usando qpdf.wasm quando a engine local estiver disponivel.",
    kicker: "qpdf.wasm beta",
    badges: ["Local", "Navegador", "Beta", "WASM", "CDN"],
    accept: "application/pdf",
  },
  unlock: {
    title: "Desbloquear PDF",
    description: "Remova senha apenas quando voce souber a senha correta. Nao quebramos senhas.",
    kicker: "qpdf.wasm beta",
    badges: ["Local", "Navegador", "Beta", "WASM", "CDN"],
    accept: "application/pdf",
  },
  ocr: {
    title: "OCR de PDF",
    description: "Reconheca texto em PDF escaneado ou imagem usando PDF.js e Tesseract.js no navegador.",
    kicker: "OCR pesado",
    badges: ["Local", "Navegador", "Beta", "Pesada", "CDN"],
    accept: "application/pdf,image/jpeg,image/png,image/webp",
  },
  "convert-to-pdf": {
    title: "Converter para PDF",
    description: "Converta imagens, TXT, Markdown, HTML e DOCX simples para PDF no navegador.",
    kicker: "Documentos para PDF",
    badges: ["Local", "Navegador", "Beta", "CDN"],
    accept: "image/jpeg,image/png,image/webp,image/avif,text/plain,text/markdown,text/html,.md,.markdown,.txt,.html,.htm,.docx",
    multiple: true,
  },
  "pdf-to-word": {
    title: "PDF para Word",
    description: "Gere DOCX basico em modo texto editavel ou modo visual por imagens renderizadas.",
    kicker: "DOCX local",
    badges: ["Local", "Navegador", "Beta", "Pesada", "CDN"],
    accept: "application/pdf",
  },
};

let currentToolId = "pdf-to-images";
let primaryFiles = [];
let auxFile = null;
let cancelled = false;
let activeWorker = null;

function getToolFromHash() {
  const id = (window.location.hash || "").replace(/^#\/?/, "");
  return TOOL_CONFIG[id] ? id : "pdf-to-images";
}

function resetRuntime() {
  cancelled = false;
  auxFile = null;
  activeWorker = null;
  setAlert("#toolAlert", "");
}

function setBusy(isBusy) {
  document.querySelectorAll("[data-run-tool]").forEach((button) => {
    button.disabled = isBusy;
  });
  document.querySelectorAll("[data-cancel-tool]").forEach((button) => {
    button.hidden = !isBusy;
  });
}

function renderHeader() {
  const tool = TOOL_CONFIG[currentToolId];
  document.title = `${tool.title} | ArqKit`;
  setText("#breadcrumbTool", tool.title);
  setText("#toolKicker", tool.kicker);
  setText("#toolTitle", tool.title);
  setText("#toolDescription", tool.description);
  const badges = $("#toolBadges");
  badges.innerHTML = tool.badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("");
  $("#cdnText").textContent = tool.badges.includes("WASM")
    ? "Esta ferramenta pode carregar uma engine WebAssembly por CDN. O arquivo continua local, mas o processamento pode consumir mais memoria."
    : "Bibliotecas maiores sao carregadas por CDN apenas quando voce abre a ferramenta.";
}

function uploadMarkup({ multiple = false, accept = "application/pdf", label = "Arquivo" } = {}) {
  return `
    <div id="dropzone" class="tool-upload" role="button" tabindex="0">
      <div>
        <strong>Arraste o arquivo aqui ou clique para selecionar</strong>
        <span class="tool-note">${escapeHtml(label)}. Processamento local no navegador.</span>
        <div class="tool-actions"><button class="btn btn--primary" type="button" id="pickFile">Selecionar arquivo</button></div>
      </div>
      <input id="primaryFile" type="file" accept="${escapeHtml(accept)}" ${multiple ? "multiple" : ""} hidden />
    </div>
    <div id="fileInfo" class="tool-list"></div>
    <p id="toolAlert" class="tool-alert" role="alert" hidden></p>
    <div id="toolProgress" class="tool-progress" hidden>
      <progress max="100" value="0"></progress>
      <p data-progress-text>Preparando.</p>
    </div>
    <div id="toolOutput" class="tool-output"></div>
  `;
}

function renderFileInfo() {
  const root = $("#fileInfo");
  if (!root) return;
  if (!primaryFiles.length) {
    root.innerHTML = '<div class="tool-list-item">Nenhum arquivo selecionado.</div>';
    return;
  }
  root.innerHTML = primaryFiles.map((file) => `
    <div class="tool-list-item">
      <strong>${escapeHtml(file.name)}</strong>
      <small>${escapeHtml(file.type || fileExt(file.name).toUpperCase() || "arquivo")} - ${formatBytes(file.size)}</small>
    </div>
  `).join("");
}

function bindUpload() {
  const dropzone = $("#dropzone");
  const input = $("#primaryFile");
  const pick = $("#pickFile");
  if (!dropzone || !input || !pick) return;

  const setFiles = (files) => {
    primaryFiles = Array.from(files || []);
    renderFileInfo();
    setAlert("#toolAlert", primaryFiles.length ? "Arquivo recebido. Ele fica somente na aba do navegador." : "");
  };
  const openPicker = () => input.click();
  pick.addEventListener("click", (event) => {
    event.stopPropagation();
    openPicker();
  });
  dropzone.addEventListener("click", openPicker);
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  });
  input.addEventListener("change", () => setFiles(input.files));
  ["dragenter", "dragover"].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  }));
  ["dragleave", "drop"].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  }));
  dropzone.addEventListener("drop", (event) => setFiles(event.dataTransfer?.files));
  renderFileInfo();
}

function resultButton(blob, name, label = "Baixar arquivo") {
  const root = $("#toolOutput");
  root.innerHTML = `
    <div class="tool-list-item">
      <strong>Download preparado</strong>
      <small>${escapeHtml(name)} - ${formatBytes(blob.size)}</small>
    </div>
    <div class="tool-actions">
      <button class="btn btn--primary" type="button" id="downloadResult">${escapeHtml(label)}</button>
    </div>
  `;
  $("#downloadResult").addEventListener("click", () => downloadBlob(blob, name));
}

function requireFile() {
  const file = primaryFiles[0];
  if (!file) throw new Error("Selecione um arquivo antes de continuar.");
  return file;
}

function pageControls() {
  return `
    <div class="tool-row">
      <label>Paginas
        <select id="pageMode">
          <option value="all">Todas</option>
          <option value="custom">Intervalo/lista</option>
          <option value="odd">Impares</option>
          <option value="even">Pares</option>
        </select>
      </label>
      <label>Intervalo ou lista
        <input id="pageRange" type="text" placeholder="Ex. 1-3, 5, 8" />
      </label>
    </div>
  `;
}

function pdfToImagesMarkup() {
  return `
    <h2>1. Adicione o PDF</h2>
    ${uploadMarkup({ accept: TOOL_CONFIG[currentToolId].accept, label: "PDF" })}
    <form class="tool-form" id="toolForm">
      <h2>2. Escolha a saida</h2>
      ${pageControls()}
      <div class="tool-row">
        <label>Formato
          <select id="imageFormat">
            <option value="jpeg">JPG</option>
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        <label>DPI
          <select id="dpi">
            <option value="96">96</option>
            <option value="144" selected>144</option>
            <option value="200">200</option>
            <option value="300">300</option>
          </select>
        </label>
      </div>
      <label>Qualidade JPG/WebP
        <input id="quality" type="range" min="40" max="100" value="86" aria-describedby="qualityHelp" />
      </label>
      <p class="tool-help" id="qualityHelp">Controla a compressão de JPG e WebP: valores altos preservam mais detalhes e geram arquivos maiores; valores baixos reduzem mais o tamanho com perda visual. PNG ignora esse controle porque usa compressão sem perdas.</p>
      <div class="tool-actions">
        <button class="btn btn--primary" type="button" data-run-tool>Gerar imagens</button>
        <button class="btn btn--ghost" type="button" data-cancel-tool hidden>Cancelar</button>
        <button class="btn btn--ghost" type="button" data-clear-tool>Limpar tudo</button>
      </div>
    </form>
  `;
}

async function runPdfToImages() {
  const file = requireFile();
  const format = $("#imageFormat").value;
  const extension = format === "jpeg" ? "jpg" : format;
  setBusy(true);
  setAlert("#toolAlert", "Processando localmente no navegador.");
  const pdf = await readPdf(file);
  const pages = parsePageSelection($("#pageRange").value, pdf.numPages, $("#pageMode").value);
  const entries = [];
  for (let index = 0; index < pages.length; index += 1) {
    if (cancelled) throw new Error("Processamento cancelado.");
    const pageNumber = pages[index];
    setProgress("#toolProgress", Math.round((index / pages.length) * 100), `Renderizando pagina ${pageNumber} de ${pdf.numPages}.`);
    const { blob } = await renderPageBlob(pdf, pageNumber, {
      format,
      dpi: Number($("#dpi").value),
      quality: Number($("#quality").value) / 100,
      background: "#ffffff",
    });
    entries.push({ name: pdfImageName(file.name, pageNumber, extension), blob });
  }
  setProgress("#toolProgress", 100, "Preparando download.");
  if (entries.length === 1) resultButton(entries[0].blob, entries[0].name, "Baixar imagem");
  else resultButton(await createZipBlob(entries), `${baseName(file.name)}-imagens.zip`, "Baixar ZIP");
  try { recordComplete("pdf-to-images"); } catch {}
}

function watermarkMarkup() {
  return `
    <h2>1. Adicione o PDF</h2>
    ${uploadMarkup({ accept: TOOL_CONFIG[currentToolId].accept, label: "PDF" })}
    <form class="tool-form" id="toolForm">
      <h2>2. Configure a marca</h2>
      <div class="tool-row">
        <label>Tipo
          <select id="watermarkType"><option value="text">Texto</option><option value="image">Imagem</option></select>
        </label>
        <label>Posicao
          <select id="position"><option value="center">Centro</option><option value="top-left">Topo esquerdo</option><option value="top-right">Topo direito</option><option value="bottom-left">Rodape esquerdo</option><option value="bottom-right">Rodape direito</option></select>
        </label>
      </div>
      <label>Texto
        <input id="watermarkText" type="text" value="CONFIDENCIAL" />
      </label>
      <label>Imagem da marca d'agua
        <input id="watermarkImage" type="file" accept="image/png,image/jpeg" />
      </label>
      <div class="tool-row">
        <label>Opacidade
          <input id="opacity" type="range" min="5" max="100" value="28" />
        </label>
        <label>Rotacao
          <input id="rotation" type="number" value="-35" />
        </label>
      </div>
      <div class="tool-row">
        <label>Tamanho do texto
          <input id="fontSize" type="number" value="56" min="8" />
        </label>
        <label>Cor
          <input id="color" type="color" value="#1d4ed8" />
        </label>
      </div>
      ${pageControls()}
      <div class="tool-actions">
        <button class="btn btn--primary" type="button" data-run-tool>Aplicar marca d'agua</button>
        <button class="btn btn--ghost" type="button" data-cancel-tool hidden>Cancelar</button>
        <button class="btn btn--ghost" type="button" data-clear-tool>Limpar tudo</button>
      </div>
    </form>
  `;
}

function positionFor(page, width, height, itemWidth, itemHeight) {
  const margin = 40;
  const map = {
    center: [(width - itemWidth) / 2, (height - itemHeight) / 2],
    "top-left": [margin, height - itemHeight - margin],
    "top-right": [width - itemWidth - margin, height - itemHeight - margin],
    "bottom-left": [margin, margin],
    "bottom-right": [width - itemWidth - margin, margin],
  };
  return map[$("#position").value] || map.center;
}

async function embedWatermarkImage(PDFLib, pdfDoc, file) {
  const bytes = await file.arrayBuffer();
  const ext = fileExt(file.name);
  return ext === "jpg" || ext === "jpeg" ? pdfDoc.embedJpg(bytes) : pdfDoc.embedPng(bytes);
}

async function runWatermark() {
  const file = requireFile();
  const PDFLib = await loadPdfLib();
  const pdfDoc = await copyPdfWithPdfLib(file);
  const pages = pdfDoc.getPages();
  const selected = parsePageSelection($("#pageRange").value, pages.length, $("#pageMode").value);
  const opacity = Number($("#opacity").value) / 100;
  const rotation = PDFLib.degrees(Number($("#rotation").value) || 0);
  const fontSize = Number($("#fontSize").value) || 56;
  const rgb = hexToRgb01($("#color").value);
  const color = PDFLib.rgb(rgb.r, rgb.g, rgb.b);
  const type = $("#watermarkType").value;
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const imageFile = $("#watermarkImage").files?.[0] || null;
  const image = type === "image" && imageFile ? await embedWatermarkImage(PDFLib, pdfDoc, imageFile) : null;

  selected.forEach((pageNumber, index) => {
    if (cancelled) throw new Error("Processamento cancelado.");
    const page = pages[pageNumber - 1];
    const { width, height } = page.getSize();
    setProgress("#toolProgress", Math.round((index / selected.length) * 100), `Processando pagina ${pageNumber}.`);
    if (image) {
      const itemWidth = Math.min(width * 0.55, 360);
      const itemHeight = itemWidth * (image.height / image.width);
      const [x, y] = positionFor(page, width, height, itemWidth, itemHeight);
      page.drawImage(image, { x, y, width: itemWidth, height: itemHeight, opacity, rotate: rotation });
    } else {
      const text = $("#watermarkText").value || "CONFIDENCIAL";
      const itemWidth = font.widthOfTextAtSize(text, fontSize);
      const [x, y] = positionFor(page, width, height, itemWidth, fontSize);
      page.drawText(text, { x, y, size: fontSize, font, color, opacity, rotate: rotation });
    }
  });

  const blob = new Blob([await pdfDoc.save()], { type: "application/pdf" });
  setProgress("#toolProgress", 100, "Marca d'agua aplicada.");
  resultButton(blob, `${baseName(file.name)}-marca-dagua.pdf`, "Baixar PDF");
  try { recordComplete("watermark"); } catch {}
}

function securityMarkup() {
  const isUnlock = currentToolId === "unlock";
  return `
    <h2>1. Adicione o PDF</h2>
    ${uploadMarkup({ accept: TOOL_CONFIG[currentToolId].accept, label: "PDF" })}
    <form class="tool-form" id="toolForm">
      <h2>2. ${isUnlock ? "Informe a senha correta" : "Defina a senha"}</h2>
      <p class="tool-note">${isUnlock ? "So conseguimos desbloquear PDFs quando voce informa a senha correta. Nao quebramos senhas nem burlamos protecao." : "A protecao precisa ser criptografica. Esta ferramenta usa qpdf.wasm quando a engine local consegue carregar no navegador."}</p>
      <label>Senha
        <input id="password" type="password" autocomplete="new-password" />
      </label>
      ${isUnlock ? "" : '<label>Confirmar senha<input id="passwordConfirm" type="password" autocomplete="new-password" /></label>'}
      <div class="tool-actions">
        <button class="btn btn--primary" type="button" data-run-tool>${isUnlock ? "Desbloquear com senha" : "Proteger PDF"}</button>
        <button class="btn btn--ghost" type="button" data-cancel-tool hidden>Cancelar</button>
        <button class="btn btn--ghost" type="button" data-clear-tool>Limpar tudo</button>
      </div>
    </form>
  `;
}

async function runQpdf(args, file, outputName) {
  try {
    setProgress("#toolProgress", 8, "Enviando tarefa para wasm-runner.html.");
    const result = await runWasmTask({
      engine: "qpdf",
      action: currentToolId,
      file,
      payload: {
        args,
        inputName: "input.pdf",
        outputName: "output.pdf",
        downloadName: outputName,
      },
      onProgress: (event) => setProgress("#toolProgress", event.value ?? undefined, event.message || "Processando no runner WASM."),
    });
    setProgress("#toolProgress", 100, "PDF pronto no runner isolado.");
    return result.blob;
  } catch (runnerError) {
    setAlert("#toolAlert", `Runner isolado indisponivel (${runnerError.message}). Tentando modo compativel na pagina atual.`);
  }
  setProgress("#toolProgress", 10, "Carregando qpdf.wasm.");
  const qpdf = await loadQpdf();
  const input = "input.pdf";
  const output = "output.pdf";
  qpdf.FS.writeFile(input, new Uint8Array(await file.arrayBuffer()));
  setProgress("#toolProgress", 50, "Executando engine local.");
  const code = qpdf.callMain([...args, input, output]);
  if (code && code !== 0) throw new Error(`qpdf retornou codigo ${code}.`);
  const out = qpdf.FS.readFile(output);
  setProgress("#toolProgress", 100, "PDF pronto.");
  return new Blob([out], { type: "application/pdf" });
}

async function runSecurity() {
  const file = requireFile();
  const password = $("#password").value;
  if (!password) throw new Error("Informe a senha.");
  if (currentToolId === "protect") {
    const confirm = $("#passwordConfirm").value;
    if (password !== confirm) throw new Error("As senhas nao conferem.");
    if (password.length < 6) throw new Error("Use uma senha com pelo menos 6 caracteres.");
    const blob = await runQpdf(["--encrypt", password, password, "256", "--"], file, "output.pdf");
    resultButton(blob, `${baseName(file.name)}-protegido.pdf`, "Baixar PDF protegido");
  } else {
    const blob = await runQpdf([`--password=${password}`, "--decrypt"], file, "output.pdf");
    resultButton(blob, `${baseName(file.name)}-desbloqueado.pdf`, "Baixar PDF sem senha");
  }
  try { recordComplete(currentToolId); } catch {}
}

function ocrMarkup() {
  return `
    <h2>1. Adicione PDF ou imagem</h2>
    ${uploadMarkup({ accept: TOOL_CONFIG[currentToolId].accept, label: "PDF, JPG ou PNG" })}
    <form class="tool-form" id="toolForm">
      <h2>2. OCR local</h2>
      <label>Idioma
        <select id="ocrLang"><option value="por" selected>Portugues</option><option value="eng">Ingles</option><option value="spa">Espanhol</option></select>
      </label>
      ${pageControls()}
      <p class="tool-note">OCR pode demorar em documentos escaneados. Quanto melhor a imagem, melhor o resultado.</p>
      <div class="tool-actions">
        <button class="btn btn--primary" type="button" data-run-tool>Reconhecer texto</button>
        <button class="btn btn--ghost" type="button" data-cancel-tool hidden>Cancelar</button>
        <button class="btn btn--ghost" type="button" data-clear-tool>Limpar tudo</button>
      </div>
    </form>
  `;
}

async function runOcr() {
  const file = requireFile();
  setProgress("#toolProgress", 4, "Preparando OCR local.");
  const Tesseract = await loadTesseract();
  const lang = $("#ocrLang").value;
  const blobs = [];
  if (file.type === "application/pdf" || fileExt(file.name) === "pdf") {
    const pdf = await readPdf(file);
    const pages = parsePageSelection($("#pageRange").value, pdf.numPages, $("#pageMode").value);
    for (let index = 0; index < pages.length; index += 1) {
      const pageNumber = pages[index];
      const renderPct = 5 + Math.round(((index + 1) / pages.length) * 30);
      setProgress("#toolProgress", renderPct, `Renderizando página ${pageNumber} de ${pdf.numPages}.`);
      const { blob } = await renderPageBlob(pdf, pageNumber, { format: "png", dpi: 180 });
      blobs.push({ blob, label: `Pagina ${pageNumber}` });
    }
  } else {
    blobs.push({ blob: file, label: file.name });
  }

  let currentOcrIndex = 0;
  const worker = await Tesseract.createWorker(lang, 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        const itemShare = 60 / Math.max(1, blobs.length);
        const pct = 35 + Math.round((currentOcrIndex + (message.progress || 0)) * itemShare);
        setProgress("#toolProgress", pct, `Reconhecendo texto: ${blobs[currentOcrIndex]?.label || "arquivo"}.`);
      }
    },
  });
  activeWorker = worker;
  const output = [];
  for (let index = 0; index < blobs.length; index += 1) {
    if (cancelled) throw new Error("OCR cancelado.");
    currentOcrIndex = index;
    const basePct = 35 + Math.round((index / Math.max(1, blobs.length)) * 60);
    setProgress("#toolProgress", basePct, `OCR em ${blobs[index].label} (${index + 1} de ${blobs.length}).`);
    const result = await worker.recognize(blobs[index].blob);
    output.push(`--- ${blobs[index].label} ---\n${normalizePdfText(result.data.text || "")}`);
  }
  await worker.terminate();
  activeWorker = null;
  const blob = new Blob([output.join("\n\n")], { type: "text/plain;charset=utf-8" });
  setProgress("#toolProgress", 100, "TXT pronto.");
  resultButton(blob, `${baseName(file.name)}-ocr.txt`, "Baixar TXT");
  try { recordComplete("ocr"); } catch {}
}

function convertToPdfMarkup() {
  return `
    <h2>1. Adicione arquivos</h2>
    ${uploadMarkup({ accept: TOOL_CONFIG[currentToolId].accept, multiple: true, label: "Imagens, TXT, Markdown, HTML ou DOCX simples" })}
    <form class="tool-form" id="toolForm">
      <h2>2. Opcoes</h2>
      <div class="tool-row">
        <label>Pagina
          <select id="pageSize"><option value="a4" selected>A4</option><option value="letter">Carta</option></select>
        </label>
        <label>Orientacao
          <select id="orientation"><option value="portrait" selected>Retrato</option><option value="landscape">Paisagem</option></select>
        </label>
      </div>
      <p class="tool-note">DOCX complexo pode mudar de layout. Para Office pesado, confira o resultado antes de usar.</p>
      <div class="tool-actions">
        <button class="btn btn--primary" type="button" data-run-tool>Gerar PDF</button>
        <button class="btn btn--ghost" type="button" data-cancel-tool hidden>Cancelar</button>
        <button class="btn btn--ghost" type="button" data-clear-tool>Limpar tudo</button>
      </div>
    </form>
  `;
}

function pageSize() {
  const size = $("#pageSize")?.value || "a4";
  const portrait = ($("#orientation")?.value || "portrait") === "portrait";
  const dims = size === "letter" ? [612, 792] : [595.28, 841.89];
  return portrait ? dims : [dims[1], dims[0]];
}

function wrapText(text, maxChars = 82) {
  const lines = [];
  for (const sourceLine of String(text || "").split("\n")) {
    let line = "";
    for (const word of sourceLine.split(/\s+/)) {
      if (!word) continue;
      if ((line + " " + word).trim().length > maxChars) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = `${line} ${word}`.trim();
      }
    }
    lines.push(line);
  }
  return lines;
}

async function addTextToPdf(PDFLib, pdfDoc, text, title = "") {
  const [width, height] = pageSize();
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([width, height]);
  let y = height - 54;
  if (title) {
    page.drawText(title, { x: 42, y, size: 15, font: bold, color: PDFLib.rgb(0.05, 0.09, 0.18) });
    y -= 28;
  }
  for (const line of wrapText(text, Math.max(46, Math.floor((width - 84) / 6.2)))) {
    if (y < 48) {
      page = pdfDoc.addPage([width, height]);
      y = height - 54;
    }
    page.drawText(line || " ", { x: 42, y, size: 11, font, color: PDFLib.rgb(0.05, 0.09, 0.18) });
    y -= 16;
  }
}

async function imageFileToPngBytes(file) {
  if (file.type === "image/png") return file.arrayBuffer();
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Falha ao converter imagem.")), "image/png"));
  return blob.arrayBuffer();
}

async function addImageToPdf(PDFLib, pdfDoc, file) {
  const bytes = await imageFileToPngBytes(file);
  const image = await pdfDoc.embedPng(bytes);
  const [pageWidth, pageHeight] = pageSize();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const maxWidth = pageWidth - 72;
  const maxHeight = pageHeight - 72;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
}

async function textFromFile(file) {
  const ext = fileExt(file.name);
  if (ext === "docx") {
    const mammoth = await loadMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value || "";
  }
  const text = await file.text();
  if (ext === "html" || ext === "htm" || file.type === "text/html") {
    return new DOMParser().parseFromString(text, "text/html").body.textContent || "";
  }
  if (ext === "md" || ext === "markdown") {
    return text.replace(/```[\s\S]*?```/g, "").replace(/[#*_>`~-]/g, "");
  }
  return text;
}

async function runConvertToPdf() {
  if (!primaryFiles.length) throw new Error("Selecione ao menos um arquivo.");
  const PDFLib = await loadPdfLib();
  const pdfDoc = await PDFLib.PDFDocument.create();
  for (let index = 0; index < primaryFiles.length; index += 1) {
    if (cancelled) throw new Error("Processamento cancelado.");
    const file = primaryFiles[index];
    setProgress("#toolProgress", Math.round((index / primaryFiles.length) * 100), `Convertendo ${file.name}.`);
    if (file.type.startsWith("image/")) await addImageToPdf(PDFLib, pdfDoc, file);
    else await addTextToPdf(PDFLib, pdfDoc, normalizePdfText(await textFromFile(file)), file.name);
  }
  const blob = new Blob([await pdfDoc.save()], { type: "application/pdf" });
  setProgress("#toolProgress", 100, "PDF gerado.");
  resultButton(blob, primaryFiles.length === 1 ? `${baseName(primaryFiles[0].name)}.pdf` : "arquivos-convertidos.pdf", "Baixar PDF");
  try { recordComplete("convert-to-pdf"); } catch {}
}

function pdfToWordMarkup() {
  return `
    <h2>1. Adicione o PDF</h2>
    ${uploadMarkup({ accept: TOOL_CONFIG[currentToolId].accept, label: "PDF" })}
    <form class="tool-form" id="toolForm">
      <h2>2. Escolha o modo</h2>
      <label>Modo
        <select id="wordMode"><option value="text" selected>Texto editavel</option><option value="visual">Visual fiel por imagens</option></select>
      </label>
      ${pageControls()}
      <p class="tool-note">Layouts complexos podem mudar. PDFs escaneados sem OCR podem sair vazios no modo texto.</p>
      <div class="tool-actions">
        <button class="btn btn--primary" type="button" data-run-tool>Gerar DOCX</button>
        <button class="btn btn--ghost" type="button" data-cancel-tool hidden>Cancelar</button>
        <button class="btn btn--ghost" type="button" data-clear-tool>Limpar tudo</button>
      </div>
    </form>
  `;
}

async function runPdfToWord() {
  const file = requireFile();
  const pdf = await readPdf(file);
  const pages = parsePageSelection($("#pageRange").value, pdf.numPages, $("#pageMode").value);
  let blob;
  if ($("#wordMode").value === "visual") {
    const images = [];
    for (let index = 0; index < pages.length; index += 1) {
      const pageNumber = pages[index];
      setProgress("#toolProgress", Math.round((index / pages.length) * 100), `Renderizando pagina ${pageNumber}.`);
      const image = await renderPageBlob(pdf, pageNumber, { format: "png", dpi: 144 });
      images.push(image);
    }
    blob = await createImageDocxBlob(images);
  } else {
    const texts = [];
    for (let index = 0; index < pages.length; index += 1) {
      const pageNumber = pages[index];
      setProgress("#toolProgress", Math.round((index / pages.length) * 100), `Extraindo texto da pagina ${pageNumber}.`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      texts.push(normalizePdfText(content.items.map((item) => item.str || "").join(" ")));
    }
    blob = await createTextDocxBlob(texts);
  }
  setProgress("#toolProgress", 100, "DOCX gerado.");
  resultButton(blob, `${baseName(file.name)}.docx`, "Baixar DOCX");
  try { recordComplete("pdf-to-word"); } catch {}
}

function renderWorkspace() {
  const templates = {
    "pdf-to-images": pdfToImagesMarkup,
    watermark: watermarkMarkup,
    protect: securityMarkup,
    unlock: securityMarkup,
    ocr: ocrMarkup,
    "convert-to-pdf": convertToPdfMarkup,
    "pdf-to-word": pdfToWordMarkup,
  };
  $("#toolWorkspace").innerHTML = templates[currentToolId]();
  primaryFiles = [];
  resetRuntime();
  bindUpload();
  $("#watermarkImage")?.addEventListener("change", (event) => { auxFile = event.target.files?.[0] || null; });
  document.querySelector("[data-run-tool]")?.addEventListener("click", runCurrentTool);
  document.querySelector("[data-cancel-tool]")?.addEventListener("click", cancelCurrentTool);
  document.querySelector("[data-clear-tool]")?.addEventListener("click", () => {
    primaryFiles = [];
    auxFile = null;
    $("#primaryFile").value = "";
    $("#toolOutput").innerHTML = "";
    $("#toolProgress").hidden = true;
    setAlert("#toolAlert", "Temporarios limpos.");
    renderFileInfo();
  });
}

async function runCurrentTool() {
  if (!primaryFiles.length) {
    setAlert("#toolAlert", "Selecione um arquivo antes de continuar.", "error");
    return;
  }
  cancelled = false;
  setBusy(true);
  $("#toolOutput").innerHTML = "";
  resetProgress("#toolProgress");
  setAlert("#toolAlert", "Processando localmente no navegador.");
  setProgress("#toolProgress", 1, "Processamento iniciado.");
  showStartNotice({
    title: `${TOOL_CONFIG[currentToolId]?.title || "Ferramenta"} iniciada`,
    message: "Acompanhe o progresso desta tarefa abaixo.",
  });
  scrollProgressSoon("#toolProgress");
  try {
    try { recordOpen(currentToolId); } catch {}
    const map = {
      "pdf-to-images": runPdfToImages,
      watermark: runWatermark,
      protect: runSecurity,
      unlock: runSecurity,
      ocr: runOcr,
      "convert-to-pdf": runConvertToPdf,
      "pdf-to-word": runPdfToWord,
    };
    await map[currentToolId]();
    setAlert("#toolAlert", "Pronto. Download preparado.", "success");
  } catch (error) {
    setAlert("#toolAlert", error?.message || "Falha ao processar arquivo.", cancelled ? "info" : "error");
  } finally {
    if (activeWorker?.terminate) {
      try { await activeWorker.terminate(); } catch {}
      activeWorker = null;
    }
    setBusy(false);
  }
}

function cancelCurrentTool() {
  cancelled = true;
  if (activeWorker?.terminate) {
    activeWorker.terminate();
    activeWorker = null;
  }
  setAlert("#toolAlert", "Cancelamento solicitado. Se a engine estiver finalizando uma etapa, aguarde alguns segundos.");
}

function route() {
  currentToolId = getToolFromHash();
  renderHeader();
  renderWorkspace();
}

bindStandardHeader();
window.addEventListener("hashchange", route);
route();
