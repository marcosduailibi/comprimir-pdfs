# Comprimir PDF

Aplicação **100% no navegador** para **comprimir** e **juntar** PDFs, com
privacidade: nenhum arquivo é enviado para servidores. Escrita em **HTML, CSS e
JavaScript puro**, sem back-end e sem etapa de build. Pronta para **GitHub Pages**.

A entrada é [`index.html`](index.html) na raiz desta pasta.

## Recursos

- **4 modos**: comprimir um PDF · juntar vários · juntar e depois comprimir ·
  comprimir cada um e depois juntar.
- **Reordenar** PDFs (arrastar e soltar, subir/descer, ordenar por nome/tamanho).
- **Compressão** por presets (Leve/Equilibrado/Forte/Máxima) ou personalizada
  (qualidade das imagens 1–100 e passadas 1–5), com textos de ajuda e avisos.
- **Web Worker**: o processamento pesado roda em outra thread (a UI não trava),
  com **pausar / retomar / parar** cooperativos. Fallback automático para a thread
  principal quando o Worker não está disponível.
- **Limites de segurança** por dispositivo (desktop/mobile) com aviso ou bloqueio.
- **Progresso detalhado**, etapas visuais por modo e **logs técnicos** recolhíveis.
- **Apoio via Pix** (voluntário, nunca bloqueia nada): QR Code, chave e Pix
  Copia e Cola, com avisos de conferência do recebedor.
- **Privacidade** comunicada em toda a interface + Política de Privacidade,
  Termos de Uso, "Como verificar" e "Transparência técnica".

## Como rodar

```bash
cd libjs/pdfcompress
npm run start        # servidor estático na raiz do pacote
```

Abra **http://localhost:3000/**. (As bibliotecas `pdf-lib`, `pako` e `jpeg-js`
são carregadas via **CDN jsDelivr** com versões fixas — `/+esm` — em tempo de
execução, sem build e sem `node_modules`. Requer internet no navegador; se o CDN
for bloqueado por rede/proxy, as libs externas podem não carregar.)

### GitHub Pages

Publique a pasta `libjs/pdfcompress/` (ou copie-a para a raiz do site). Os
caminhos são relativos (`./src/...`), então o app funciona ao acessar
`.../pdfcompress/`.

## Estrutura

Veja [`src/README.md`](src/README.md). Resumo:

```
index.html            # app principal
src/css/style.css     # estilos (tema claro/escuro)
src/js/               # app.js, ui.js, state.js, utils.js, donation.js,
                      # pdf-worker.js, pdf-compress.js, pdf-merge.js
demo/README.md        # referência (app antigo foi substituído)
```

## Privacidade

Os PDFs são processados na memória local do navegador e nunca enviados a
servidores. As únicas requisições externas são as bibliotecas (CDN jsDelivr) e a
imagem do QR Code Pix — nenhuma recebe o conteúdo dos PDFs. Você pode confirmar na
aba **Rede/Network** das ferramentas de desenvolvedor.

## Limitações conhecidas

- Não é byte-idêntico a ferramentas de servidor; a maior redução vem da qualidade
  das imagens. Imagens CCITT/JBIG2/indexadas/com transparência são preservadas.
- A pausa ocorre entre etapas (arquivos/páginas/imagens/passadas); o `save()` do
  pdf-lib é indivisível, então a pausa não é instantânea.

## Licença

MIT.
