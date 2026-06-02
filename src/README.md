# src — código-fonte do Comprimir PDF

Aplicação 100% no navegador (sem build). A entrada é `../index.html`.

```
src/
├── css/style.css        # estilos (tema claro/escuro via variáveis CSS)
├── assets/              # imagens/ícones locais (o QR Code Pix é externo, do imgbb)
└── js/
    ├── app.js           # bootstrap: liga estado + UI + Web Worker (com fallback)
    ├── ui.js            # render do DOM e binds de eventos
    ├── state.js         # estado, presets, limites por dispositivo, modos e etapas
    ├── utils.js         # formatBytes/formatTime/sleep/clipboard/toast/nomes
    ├── pdf-worker.js    # Web Worker: orquestra os 4 fluxos + protocolo de mensagens
    ├── pdf-compress.js  # engine de compressão (recompressão de imagens + reserialização)
    └── pdf-merge.js     # engine de junção (pdf-lib copyPages) + análise de páginas
```

## Por que CDN dentro da engine?

`pdf-compress.js`, `pdf-merge.js` e `pdf-worker.js` importam `pdf-lib`, `pako` e
`jpeg-js` por **URL completa de CDN jsDelivr (`/+esm`)**. Isso é necessário porque *import
maps não se aplicam a Web Workers*. Assim a mesma engine funciona tanto dentro do
Worker quanto no fallback de thread principal. A camada de UI (`app.js`, `ui.js`,
`state.js`, `utils.js`, `donation.js`) não importa bibliotecas de PDF.

## Privacidade

Os PDFs nunca saem do navegador. As únicas requisições externas são as
bibliotecas (CDN) e a imagem do QR Code Pix — nenhuma delas recebe o conteúdo dos
PDFs selecionados.
