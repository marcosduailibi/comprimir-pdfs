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

A interface tem layout **responsivo** com tema **claro/escuro** (alternância
manual persistida em `localStorage` e respeito a `prefers-color-scheme`, sem flash
ao carregar). O header traz navegação, link para o GitHub e botão de apoio; a
primeira dobra tem um hero e a ferramenta em um card único com 3 etapas (modos,
upload e ajustes). Modos e presets menos usados ficam em **Configurações
avançadas**. O apoio via Pix fica centralizado em um modal (QR Code, chave e
copiar), acessível por qualquer botão "Apoiar".

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
index.html            # app principal (SEO, Open Graph, JSON-LD)
robots.txt            # liberação para buscadores + sitemap
sitemap.xml           # mapa do site
src/css/style.css     # estilos (tema claro/escuro)
src/assets/           # favicon.svg + (a criar) favicon.ico, apple-touch-icon.png, og-image.png
src/js/               # app.js, ui.js, state.js, utils.js, donation.js,
                      # pdf-worker.js, pdf-compress.js, pdf-merge.js
```

## SEO e publicação

- **Domínio:** `https://comprimirpdfs.com.br` (configurado via GitHub Pages →
  domínio custom; criar um arquivo `CNAME` na raiz com o domínio quando o DNS
  estiver apontado).
- **GitHub Pages:** publica os arquivos estáticos da branch `main` (raiz).
- **`robots.txt`** libera a indexação e aponta o `sitemap.xml`.
- **`sitemap.xml`** lista a URL principal.
- **Meta tags / Open Graph / Twitter Card** no `<head>` do `index.html` definem
  título, descrição, imagem de compartilhamento e URL canônica.
- **Dados estruturados (JSON-LD):** `WebApplication` + `FAQPage`.
- **CDN:** bibliotecas via jsDelivr com versões fixas (nenhum PDF é enviado).
- **Privacidade:** todo o processamento é local no navegador.
- **Testar localmente:** `npx --yes serve .` e abrir `http://localhost:3000/`.

### Imagens a criar (assets binários)

O `favicon.svg` já existe. Para completar o compartilhamento social e os ícones,
crie e coloque em `src/assets/`:

- `og-image.png` — **1200×630**, usada em Open Graph/Twitter. Deve comunicar
  "Comprimir PDFs Online", "Grátis, rápido e com privacidade" e "Nenhum arquivo
  enviado para servidor".
- `favicon.ico` — ícone clássico (fallback para navegadores antigos).
- `apple-touch-icon.png` — **180×180**, ícone para iOS.

As tags no `index.html` já referenciam esses arquivos; enquanto não existirem, o
SVG é usado como favicon e o `og:image` apenas não exibirá a prévia.

### Google Search Console

1. Adicione a propriedade do domínio e confirme a posse (DNS ou meta tag).
2. Envie `https://comprimirpdfs.com.br/sitemap.xml` em **Sitemaps**.
3. Use **Inspeção de URL** para solicitar indexação da página inicial.

## Verificação e confiança

Este projeto é aberto para consulta. O código pode ser verificado no GitHub:

https://github.com/marcosduailibi/comprimir-pdfs

A ferramenta roda no navegador do usuário. Nenhum PDF é enviado para servidor.

Como verificar no navegador:

1. Abra o site.
2. Pressione F12 ou clique com o botão direito e escolha "Inspecionar".
3. Vá até a aba "Network" ou "Rede".
4. Recarregue a página.
5. Selecione um PDF e execute a compressão.
6. Observe as requisições feitas pelo site.
7. Confira que o arquivo PDF não é enviado para um backend do projeto.

Também é possível abrir a aba "Sources" ou "Fontes" para verificar os arquivos
JavaScript carregados.

## Limitação de abas em segundo plano

A compressão acontece no navegador. Em alguns navegadores, quando a aba fica em
segundo plano, o sistema pode reduzir ou pausar tarefas pesadas para economizar
bateria e memória.

Para arquivos grandes, recomenda-se manter a aba aberta até a conclusão do
processamento. O site usa um Web Worker (thread separada) e avisa quando a aba vai
para segundo plano, mas não há garantia de continuidade absoluta em background —
isso é uma limitação dos navegadores, não do projeto.

## Apoie o projeto

O Comprimir PDFs é gratuito e mantido de forma independente.

Se a ferramenta te ajudou, você pode apoiar o projeto com qualquer valor via Pix. Até R$ 1 já ajuda a manter o site online, melhorar a ferramenta e continuar oferecendo uma opção simples, privada e gratuita para todos.

## Desenvolvedor

Desenvolvido por **Marcos Duailibi**.

## Licença

Este projeto é disponibilizado para consulta, estudo e verificação pública do código.

Verifique o arquivo de licença do repositório para mais detalhes.
