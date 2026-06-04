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
- Com COEP ativo, prefira hospedar engines pesadas localmente em `assets/vendor` em vez de depender de CDN.
- Se o runner nao ficar isolado, as ferramentas ainda tentam modo compativel single-thread na pagina principal.
