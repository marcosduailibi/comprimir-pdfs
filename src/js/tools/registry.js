// tools/registry.js
// Registry central das ferramentas PDF (JS puro — módulo-folha, testável em Node).
// STATUS HONESTO: só é "ready" o que funciona de verdade hoje. O resto é
// "coming-soon" (viável 100% no navegador, planejado) ou "requires-desktop"
// (conversões de Office etc. que NÃO dá para fazer só com site estático).
//
// Cada ferramenta segue (adaptado do TS do spec para a nossa stack JS):
//   { id, name, shortName, description, tooltip, categoryIds, aliases,
//     inputExtensions, outputExtensions, route, icon, status,
//     supportsBatch, isLocalFirst, notes }

export const CATEGORIES = [
  { id: "main",            name: "Principais" },
  { id: "organize",        name: "Organizar PDF" },
  { id: "optimize",        name: "Otimizar PDF" },
  { id: "convert-to-pdf",  name: "Converter para PDF" },
  { id: "convert-from-pdf",name: "Converter um PDF" },
  { id: "convert-images",  name: "Converter imagens" },
  { id: "edit",            name: "Editar PDF" },
  { id: "security",        name: "Segurança" },
  { id: "ocr",             name: "OCR e digitalização" },
  { id: "web",             name: "Web e publicação" },
  { id: "forms",           name: "Formulários" },
  { id: "desktop",         name: "Área de trabalho" },
];

// Status possíveis: 'ready' | 'beta' | 'coming-soon' | 'requires-desktop'
export const TOOLS = [
  // ---------------------------- READY (funcionam hoje) ----------------------------
  {
    id: "merge", name: "Juntar PDF", shortName: "Juntar",
    description: "Una vários PDFs em um único arquivo, na ordem que você escolher.",
    tooltip: "Una vários PDFs em um único arquivo, mantendo a ordem que você definir.",
    categoryIds: ["main", "organize"],
    aliases: ["juntar", "unir", "mesclar", "merge", "combinar", "combine"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "./index.html#tool=merge", icon: "🔗", status: "ready",
    supportsBatch: true, isLocalFirst: true, notes: [],
  },
  {
    id: "compress", name: "Comprimir PDF", shortName: "Comprimir",
    description: "Reduza o tamanho do PDF ajustando a qualidade das imagens.",
    tooltip: "Reduza o tamanho do PDF ajustando imagens e qualidade — tudo no navegador.",
    categoryIds: ["main", "optimize"],
    aliases: ["comprimir", "compactar", "reduzir", "compressao", "compress", "diminuir"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "./index.html#tool=compress", icon: "🗜️", status: "ready",
    supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "merge_then_compress", name: "Juntar e comprimir PDF", shortName: "Juntar + comprimir",
    description: "Una vários PDFs e comprima o resultado em uma só operação.",
    tooltip: "Una vários PDFs e comprima o arquivo final numa única operação local.",
    categoryIds: ["main", "organize", "optimize"],
    aliases: ["juntar e comprimir", "unir e comprimir", "merge and compress"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "./index.html#tool=merge_then_compress", icon: "🧩", status: "ready",
    supportsBatch: true, isLocalFirst: true, notes: [],
  },

  // ------------------- COMING-SOON (viável 100% no navegador) -------------------
  {
    id: "split", name: "Dividir PDF", shortName: "Dividir",
    description: "Separe páginas, intervalos ou partes de um PDF em novos arquivos.",
    tooltip: "Separe páginas, intervalos ou partes de um PDF em novos arquivos.",
    categoryIds: ["organize"],
    aliases: ["dividir", "separar", "split", "partir", "fatiar"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf", "zip"],
    route: "./dividir.html", icon: "✂️", status: "ready",
    supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "remove-pages", name: "Remover páginas", shortName: "Remover páginas",
    description: "Apague páginas específicas de um PDF.",
    tooltip: "Apague páginas específicas de um PDF, escolhendo quais manter.",
    categoryIds: ["organize"], aliases: ["remover", "apagar", "excluir paginas", "delete pages"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "🗑️", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "extract-pages", name: "Extrair páginas", shortName: "Extrair páginas",
    description: "Gere um novo PDF apenas com as páginas escolhidas.",
    tooltip: "Gere um novo PDF apenas com as páginas que você escolher.",
    categoryIds: ["organize"], aliases: ["extrair", "extract", "selecionar paginas"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "📑", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "reorder-pages", name: "Reorganizar páginas", shortName: "Reorganizar",
    description: "Mude a ordem das páginas arrastando.",
    tooltip: "Reordene as páginas do PDF arrastando-as para a sequência desejada.",
    categoryIds: ["organize"], aliases: ["reorganizar", "ordenar paginas", "reorder", "reordenar"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "🔀", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "rotate", name: "Rotacionar páginas", shortName: "Rotacionar",
    description: "Gire páginas em 90°, 180° ou 270°.",
    tooltip: "Gire páginas do PDF em 90°, 180° ou 270° e salve a nova versão.",
    categoryIds: ["organize", "edit"], aliases: ["rotacionar", "girar", "rodar", "rotate"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "🔄", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "n-up", name: "Páginas por folha", shortName: "Páginas por folha",
    description: "Coloque 2, 4 ou mais páginas por folha.",
    tooltip: "Combine várias páginas em uma só folha (2-up, 4-up) para economizar papel.",
    categoryIds: ["organize"], aliases: ["n-up", "paginas por folha", "n up", "multiplas por folha"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "🗂️", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "page-numbers", name: "Números de página", shortName: "Numerar",
    description: "Adicione numeração às páginas do PDF.",
    tooltip: "Adicione números de página ao PDF, escolhendo posição e estilo.",
    categoryIds: ["edit"], aliases: ["numero de pagina", "numeracao", "page numbers", "numerar"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "#️⃣", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "watermark", name: "Marca d’água", shortName: "Marca d’água",
    description: "Aplique texto ou imagem como marca d’água.",
    tooltip: "Adicione uma marca d’água de texto ou imagem sobre as páginas do PDF.",
    categoryIds: ["edit"], aliases: ["marca d agua", "watermark", "marca dagua", "carimbo"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "💧", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "crop", name: "Cortar PDF", shortName: "Cortar",
    description: "Ajuste as margens recortando as páginas.",
    tooltip: "Recorte as margens das páginas do PDF para focar no conteúdo.",
    categoryIds: ["edit", "organize"], aliases: ["cortar", "recortar", "crop", "margens"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "🪚", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "images-to-pdf", name: "Imagens para PDF", shortName: "Imagens → PDF",
    description: "Junte JPG, PNG ou WEBP em um único PDF.",
    tooltip: "Transforme suas imagens (JPG, PNG, WEBP) em um único PDF, na ordem escolhida.",
    categoryIds: ["convert-to-pdf"], aliases: ["imagem", "imagens", "foto", "jpg", "png", "webp", "image to pdf"],
    inputExtensions: ["jpg", "jpeg", "png", "webp"], outputExtensions: ["pdf"],
    route: "#", icon: "🖼️", status: "coming-soon", supportsBatch: true, isLocalFirst: true, notes: [],
  },
  {
    id: "pdf-to-images", name: "PDF para imagens", shortName: "PDF → imagens",
    description: "Exporte cada página como JPG ou PNG.",
    tooltip: "Converta cada página do PDF em imagem (JPG/PNG). Usa renderização local.",
    categoryIds: ["convert-from-pdf"], aliases: ["pdf para imagem", "pdf to image", "pdf para jpg", "pdf para png"],
    inputExtensions: ["pdf"], outputExtensions: ["jpg", "png", "zip"],
    route: "#", icon: "📸", status: "coming-soon", supportsBatch: false, isLocalFirst: true,
    notes: ["Renderiza páginas localmente com pdf.js (sem servidor)."],
  },
  {
    id: "extract-images", name: "Extrair imagens do PDF", shortName: "Extrair imagens",
    description: "Salve as imagens contidas em um PDF.",
    tooltip: "Extraia as imagens embutidas em um PDF e baixe-as localmente.",
    categoryIds: ["convert-from-pdf"], aliases: ["extrair imagens", "extract images"],
    inputExtensions: ["pdf"], outputExtensions: ["jpg", "png", "zip"],
    route: "#", icon: "🏞️", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "metadata", name: "Editar metadados", shortName: "Metadados",
    description: "Altere título, autor e informações do documento.",
    tooltip: "Edite título, autor e informações do documento PDF (metadados).",
    categoryIds: ["optimize"], aliases: ["metadados", "metadata", "autor", "titulo", "informacoes"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "🏷️", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "qr", name: "Gerar código QR", shortName: "QR Code",
    description: "Crie um QR Code a partir de um texto ou link.",
    tooltip: "Gere um QR Code a partir de um texto ou link, direto no navegador.",
    categoryIds: ["web"], aliases: ["qr", "qrcode", "codigo qr"],
    inputExtensions: [], outputExtensions: ["png", "svg"],
    route: "#", icon: "🔳", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "unlock", name: "Desbloquear PDF", shortName: "Desbloquear",
    description: "Remova a senha de um PDF quando você souber a senha.",
    tooltip: "Remova a senha de um PDF quando você souber a senha correta.",
    categoryIds: ["security"], aliases: ["desbloquear", "remover senha", "unlock", "tirar senha"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "🔓", status: "coming-soon", supportsBatch: false, isLocalFirst: true,
    requiresPassword: true, notes: [],
  },
  {
    id: "protect", name: "Proteger PDF", shortName: "Proteger",
    description: "Adicione senha ao PDF.",
    tooltip: "Adicione senha ao PDF para controlar quem pode abri-lo.",
    categoryIds: ["security"], aliases: ["proteger", "senha", "seguro", "security", "criptografar"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "🔒", status: "coming-soon", supportsBatch: false, isLocalFirst: true,
    notes: ["Criptografia de PDF no navegador tem limitações; em estudo."],
  },
  {
    id: "sign", name: "Assinar PDF", shortName: "Assinar",
    description: "Desenhe ou aplique uma assinatura no PDF.",
    tooltip: "Desenhe ou carregue uma assinatura e posicione-a sobre o PDF.",
    categoryIds: ["edit"], aliases: ["assinar", "assinatura", "sign", "rubrica"],
    inputExtensions: ["pdf"], outputExtensions: ["pdf"],
    route: "#", icon: "✍️", status: "coming-soon", supportsBatch: false, isLocalFirst: true, notes: [],
  },
  {
    id: "camera-to-pdf", name: "Câmera para PDF", shortName: "Câmera PDF",
    description: "Fotografe documentos no celular e gere um PDF localmente no navegador.",
    tooltip: "Fotografe documentos no celular ou importe imagens e gere um PDF localmente.",
    categoryIds: ["ocr", "convert-to-pdf", "main"],
    aliases: ["camera", "câmera", "foto para pdf", "scan", "scanner", "digitalizar", "digitalizar para pdf", "criar pdf com câmera", "documento para pdf", "camera to pdf", "scan to pdf"],
    inputExtensions: ["jpg", "jpeg", "png", "webp", "heic"], outputExtensions: ["pdf"],
    route: "./camera.html", icon: "📷", status: "ready", supportsBatch: true, isLocalFirst: true,
    maxFiles: 200, maxTotalSizeBytes: 1073741824, requiresCamera: true, mobileOnly: true,
    notes: ["A captura direta é mobile-first. No desktop, use importação de imagens."],
  },
  {
    id: "ocr", name: "OCR de PDF", shortName: "OCR",
    description: "Reconheça texto em PDFs escaneados e gere um PDF pesquisável.",
    tooltip: "Reconheça texto em PDFs escaneados e gere um PDF pesquisável (local).",
    categoryIds: ["ocr"], aliases: ["ocr", "texto pesquisavel", "reconhecer texto", "scan texto"],
    inputExtensions: ["pdf", "jpg", "png"], outputExtensions: ["pdf", "txt"],
    route: "#", icon: "🔎", status: "coming-soon", supportsBatch: false, isLocalFirst: true,
    notes: ["Requer baixar o motor de OCR (WASM) — download grande na primeira vez."],
  },

  // ------------- REQUIRES-DESKTOP (NÃO dá só com site estático) -------------
  {
    id: "word-to-pdf", name: "Word para PDF", shortName: "Word → PDF",
    description: "Converta documentos do Word em PDF.",
    tooltip: "Conversão fiel de Word→PDF exige um conversor de Office (app/desktop).",
    categoryIds: ["convert-to-pdf"], aliases: ["word", "docx", "doc", "word to pdf"],
    inputExtensions: ["doc", "docx"], outputExtensions: ["pdf"],
    route: "#", icon: "📝", status: "requires-desktop", supportsBatch: false, isLocalFirst: false,
    requiresDesktopApp: true,
    notes: ["Conversão fiel de Office não roda só no navegador — precisa de app desktop."],
  },
  {
    id: "pdf-to-word", name: "PDF para Word", shortName: "PDF → Word",
    description: "Converta um PDF em documento editável do Word.",
    tooltip: "PDF→Word editável é complexo e foge do escopo 100% no navegador.",
    categoryIds: ["convert-from-pdf"], aliases: ["pdf para word", "pdf to word", "pdf to docx"],
    inputExtensions: ["pdf"], outputExtensions: ["docx"],
    route: "#", icon: "📄", status: "requires-desktop", supportsBatch: false, isLocalFirst: false,
    requiresDesktopApp: true,
    notes: ["Reconstruir layout editável a partir de PDF não é confiável só no navegador."],
  },
];

/** Conta por status (útil para a UI e relatórios). */
export function countByStatus(tools = TOOLS) {
  return tools.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
}

/** Ferramentas de uma categoria. */
export function toolsInCategory(categoryId, tools = TOOLS) {
  return tools.filter((t) => (t.categoryIds || []).includes(categoryId));
}
