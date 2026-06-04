# Cloudflare para WASM isolado do ArqKit

O ArqKit usa `wasm-runner.html` como pagina isolada para ferramentas pesadas. Nao aplique COOP/COEP no site inteiro sem testar, porque `Cross-Origin-Embedder-Policy: require-corp` pode bloquear scripts, iframes e CDNs.

## Antes de configurar

No Cloudflare, confirme que `arqkit.com.br` esta como `Proxied` em DNS. Response Header Transform Rules so afetam trafego HTTP/HTTPS que passa pela Cloudflare.

## Regra 1: isolamento do runner

Cloudflare -> Rules -> Transform Rules -> Modify Response Header.

Nome:

```txt
ArqKit - WASM runner isolation
```

Expressao:

```txt
http.host eq "arqkit.com.br" and http.request.uri.path eq "/wasm-runner.html"
```

Headers:

```txt
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

## Regra 2: assets WASM locais

Nome:

```txt
ArqKit - WASM vendor assets
```

Expressao:

```txt
http.host eq "arqkit.com.br" and (
  starts_with(http.request.uri.path, "/assets/vendor/ffmpeg/") or
  starts_with(http.request.uri.path, "/assets/vendor/qpdf/") or
  starts_with(http.request.uri.path, "/assets/vendor/tesseract/")
)
```

Headers:

```txt
Cross-Origin-Resource-Policy: same-origin
Access-Control-Allow-Origin: https://arqkit.com.br
```

Arquivos recomendados em `/assets/vendor/ffmpeg/` para producao:

```txt
ffmpeg.js
814.ffmpeg.js
util/index.js
ffmpeg-core.js
ffmpeg-core.wasm
```

O `ffmpeg.js`, `814.ffmpeg.js` e `util/index.js` ja ficam versionados no projeto para que o worker interno do wrapper nasca em mesma origem. O `ffmpeg-core.js` e `ffmpeg-core.wasm` podem ser publicados depois para reduzir dependencia de CDN. Enquanto eles nao existirem localmente, o ArqKit baixa o core da CDN via `toBlobURL()`.

Para uma variante multi-thread futura, publique tambem o `ffmpeg-core.worker.js` gerado por `@ffmpeg/core-mt`. No modo padrao atual, o ArqKit usa `@ffmpeg/core` single-thread e nao envia `workerURL` para esse core, porque esse arquivo nao existe no pacote single-thread.

## Como testar

Abra:

```txt
https://arqkit.com.br/wasm-runner.html
```

No console do navegador:

```js
window.crossOriginIsolated
typeof SharedArrayBuffer
```

Esperado para modo avancado:

```txt
true
"function"
```

No DevTools, aba Network, clique no documento `wasm-runner.html` e confirme os headers:

```txt
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

## Observacoes

- Nao crie CSP rigida agora se nao for necessario.
- Se criar CSP no futuro, WebAssembly pode exigir `wasm-unsafe-eval` em `script-src`.
- Workers precisam de algo como `worker-src 'self' blob:`.
- O worker interno do pacote `@ffmpeg/ffmpeg` precisa vir de mesma origem. Por isso o projeto versiona `/assets/vendor/ffmpeg/814.ffmpeg.js`; caso contrario, o navegador tenta abrir esse worker direto em `cdn.jsdelivr.net` e bloqueia por origem cruzada.
- Com COEP ativo, prefira hospedar engines pesadas localmente em `assets/vendor` em vez de depender de CDN.
- Se o runner nao ficar isolado, as ferramentas ainda tentam modo compativel single-thread na pagina principal.
