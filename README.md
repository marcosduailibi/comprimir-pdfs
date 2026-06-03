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

Ferramentas futuras aparecem no catalogo como `Em breve` ou `Requer desktop`. Elas nao abrem fluxos falsos.

## Privacidade

As ferramentas prontas processam arquivos no proprio navegador. Nenhum PDF ou imagem selecionado e enviado para servidores do projeto.

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

## Testes

Os testes unitarios ficam em `test/*.test.mjs` e cobrem registry, busca, tema, limites e logica das ferramentas prontas.
