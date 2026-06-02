# Comprimir PDFs

Ferramenta gratuita para comprimir, organizar e juntar PDFs diretamente no navegador, sem enviar arquivos para servidores.

Acesse: https://comprimirpdfs.com.br

## Sobre o projeto

O **Comprimir PDFs** foi criado para oferecer uma forma simples, rápida e privada de reduzir o tamanho de arquivos PDF.

Todo o processamento acontece localmente, no próprio navegador do usuário. Isso significa que os arquivos selecionados não são enviados para servidores, não são armazenados e não são acessados por terceiros.

## Funcionalidades

- Comprimir um PDF
- Juntar vários PDFs
- Juntar PDFs e depois comprimir
- Comprimir cada PDF e depois juntar
- Diferentes níveis de compressão
- Processamento local no navegador
- Interface responsiva
- Modo claro e escuro

## Privacidade

A ferramenta foi desenvolvida com foco em privacidade.

Nenhum PDF é enviado para servidores. Os arquivos são processados diretamente no navegador do usuário.

Mesmo assim, recomenda-se conferir o resultado final antes de compartilhar ou arquivar documentos importantes.

## Tecnologia

Site **100% estático** (HTML, CSS e JavaScript puro), **sem build** e **sem
`node_modules` em produção**, pronto para **GitHub Pages**. A entrada é
[`index.html`](index.html) na raiz do repositório, com caminhos relativos
(`./src/...`).

As bibliotecas `pdf-lib`, `pako` e `jpeg-js` são carregadas em tempo de execução
por **CDN jsDelivr** com **versões fixas** (sufixo `/+esm`), sem dependência de
`node_modules`. O processamento pesado roda em um **Web Worker** (com fallback
para a thread principal), com pausar / retomar / parar.

> Se o CDN (jsDelivr) for bloqueado por rede ou proxy, as bibliotecas externas
> podem não carregar.

## Como rodar localmente

```bash
npm run start        # equivale a: npx --yes serve .
```

Abra a URL indicada pelo `serve` (geralmente **http://localhost:3000/**). Requer
internet no navegador para baixar as bibliotecas via CDN. Nenhum `npm install` é
necessário para o site funcionar.

## Publicação no GitHub Pages

Em **Settings → Pages → Source: Deploy from a branch → `main` → `/(root)`**. O
site abre diretamente por `index.html` na raiz do repositório. A pasta
`node_modules/` está no `.gitignore` e não é enviada ao GitHub.

## Estrutura

```
index.html            # app principal
src/css/style.css     # estilos (tema claro/escuro)
src/js/               # app.js, ui.js, state.js, utils.js, donation.js,
                      # pdf-worker.js, pdf-compress.js, pdf-merge.js
```

## Apoie o projeto

O Comprimir PDFs é gratuito e mantido de forma independente.

Se a ferramenta te ajudou, você pode apoiar o projeto com qualquer valor via Pix. Até R$ 1 já ajuda a manter o site online, melhorar a ferramenta e continuar oferecendo uma opção simples, privada e gratuita para todos.

## Desenvolvedor

Desenvolvido por **Marcos Duailibi**.

## Licença

Este projeto é disponibilizado para consulta, estudo e verificação pública do código.

Verifique o arquivo de licença do repositório para mais detalhes.
