# ArqKit

Suite estatica de ferramentas para PDF, imagens, video, audio e documentos, com foco em privacidade e processamento local no navegador.

Acesse: https://comprimirpdfs.com.br

## Ferramentas prontas

- Comprimir PDF
- Juntar PDF
- Juntar e comprimir PDF
- Dividir PDF
- Camera para PDF
- Imagens para PDF via importacao de imagens na Camera para PDF
- Comprimir imagem
- Converter imagem
- PDF para imagens (beta)
- Marca d'agua em PDF
- Proteger PDF (beta, qpdf.wasm)
- Desbloquear PDF (beta, qpdf.wasm, somente com senha correta)
- OCR de PDF/imagem (beta, Tesseract.js)
- Converter para PDF (beta)
- PDF para Word (beta)
- Comprimir video (beta, ffmpeg.wasm)
- Converter video (beta, ffmpeg.wasm)
- Cortar video (beta, ffmpeg.wasm)
- Extrair audio (beta, ffmpeg.wasm)

Ferramentas beta e pesadas abrem fluxos reais, com aviso de limitacao e carregamento sob demanda. Elas nao exigem aplicativo fora do navegador.

## Privacidade

As ferramentas processam arquivos no proprio navegador. Nenhum PDF, imagem, video, audio, texto, senha ou resultado selecionado e enviado para servidores do projeto. Bibliotecas grandes podem ser baixadas por CDN, mas os arquivos escolhidos continuam no dispositivo.

## Desenvolvimento

```bash
npm test
npm run start
```

O site e HTML, CSS e JavaScript puro, sem build obrigatorio para publicar no GitHub Pages.

## Estrutura publica

- `index.html`: home do ArqKit, leve e sem bibliotecas pesadas de PDF.
- `ferramentas.html`: catalogo centralizado a partir de `src/js/tools/registry.js`.
- `comprimir-pdf.html`: ferramenta real de compressao/uniao de PDF.
- `dividir.html`: ferramenta real de divisao de PDF.
- `camera.html`: captura/importacao de imagens para gerar PDF.
- `comprimir-imagem.html`: compressao e conversao de imagens via Canvas/Worker.
- `pdf-ferramentas.html`: suite de PDF, OCR e documentos com PDF.js, pdf-lib, Tesseract.js, Mammoth.js e qpdf.wasm sob demanda.
- `video-ferramentas.html`: suite de video/audio com ffmpeg.wasm sob demanda.
- `wasm-runner.html`: pagina isolada para engines pesadas via `postMessage`. Use COOP/COEP somente nesta rota quando configurar a Cloudflare.
- `docs/cloudflare-wasm.md`: regras recomendadas de headers para liberar `crossOriginIsolated` e `SharedArrayBuffer` no runner.

## Testes

Os testes unitarios ficam em `test/*.test.mjs` e cobrem registry, busca, tema, limites e logica das ferramentas prontas.
