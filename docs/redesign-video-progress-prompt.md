# Prompt complementar de redesign do ArqKit

Aja como um agente senior de frontend vanilla, UI/UX, acessibilidade, design system, HTML, CSS e JavaScript puro. O ArqKit deve continuar funcionando em GitHub Pages, sem backend e sem frameworks obrigatorios.

## Objetivo

Melhorar o redesign do ArqKit preservando todas as funcionalidades atuais. A interface deve parecer uma ferramenta real de produtividade: clara, calma, responsiva, acessivel e confiavel.

## Contraste e acessibilidade

- Exigir contraste WCAG AA.
- Textos normais precisam atingir no minimo 4.5:1 contra o fundo.
- Textos grandes precisam atingir no minimo 3:1.
- Nao usar texto cinza claro em fundo claro, nem texto escuro em fundo escuro.
- Estados de foco precisam ser visiveis por teclado.
- Modais devem fechar com Escape e manter botoes acessiveis.
- Mensagens de progresso e erro devem usar `aria-live` quando fizer sentido.

## QR Code Pix

O Pix e opcional e discreto, mas o QR Code precisa ser escaneavel.

Regras:

- Card visivel: QR Code com minimo de 148 x 148 px.
- Modal ampliado: QR Code entre 260 x 260 px e 320 x 320 px.
- Manter fundo branco e area limpa ao redor do QR.
- Usar `object-fit: contain`.
- Usar `image-rendering: crisp-edges` quando adequado.
- Nunca reduzir o QR para 60, 70, 80 ou 100 px.
- Sempre oferecer botao "Mostrar Pix" para abrir visualizacao ampliada.
- Sempre oferecer "Copiar chave".
- Nunca bloquear ferramenta por falta de doacao.

Texto recomendado:

```txt
ArqKit gratis. Pix opcional.
Qualquer valor ajuda a manter o projeto. Se puder, ate R$ 1 ja faz diferenca.
```

## Compressao de video

A tela de compressao de video nao deve exibir logs crus do FFmpeg como conteudo principal. Logs como `frame=`, `fps=`, `q=`, `size=`, `time=`, `bitrate=` e `speed=` devem ser tratados como dados tecnicos.

Interface esperada:

- Barra de progresso visual, espessa, com preenchimento suave.
- Porcentagem visivel.
- Mensagem humana, por exemplo: "Processando no navegador: tempo 00:00:32.48, velocidade 0.23x."
- Cards pequenos de metricas:
  - tempo processado;
  - velocidade;
  - bitrate;
  - tamanho parcial.
- Log tecnico recolhido em `<details>`, nao aberto por padrao.
- Estado de carregamento da engine separado do estado de processamento.
- Estado final claro: "Resultado pronto para download."
- Estado de cancelamento claro e sem parecer erro fatal.

## Ritmo de processamento

Adicionar uma escolha de ritmo de processamento com parametros realistas para navegador:

- Automatico recomendado.
- Mais leve para o navegador.
- Equilibrado.
- Mais rapido.
- Mais qualidade, mais lento.

O modo automatico deve considerar:

- `navigator.hardwareConcurrency`;
- `navigator.deviceMemory`, quando disponivel;
- largura/tipo de dispositivo;
- tamanho do arquivo;
- duracao do video, quando disponivel.

Regras:

- Celulares, poucos nucleos, pouca memoria, videos acima de 250 MB ou acima de 10 minutos devem receber recomendacao conservadora.
- Nao habilitar qualidade alta em dispositivos de baixa capacidade ou trabalhos grandes.
- Evitar prometer processamento rapido quando o browser nao indica capacidade.
- Explicar a recomendacao em uma frase curta.

Mapeamento recomendado para FFmpeg:

- Mais leve: `-preset ultrafast`, `-threads 1`.
- Equilibrado: `-preset veryfast`, `-threads` ate 2.
- Mais rapido: `-preset ultrafast`, `-threads` ate 3.
- Mais qualidade: `-preset medium`, `-threads` ate 2, apenas em navegadores adequados.
- WebM/VP9 deve usar `-deadline` e `-cpu-used` equivalentes, sem assumir que o navegador aguenta multi-thread.

## Criterios de aceite

- O site continua HTML, CSS e JavaScript puro.
- A marca principal continua ArqKit.
- O QR Pix e escaneavel no card e no modal.
- O contraste passa WCAG AA para texto normal.
- A compressao de video mostra progresso bonito e legivel.
- Logs tecnicos nao poluem a tela principal.
- O usuario pode escolher ritmo de processamento.
- O modo automatico se adapta ao navegador e ao arquivo.
- Mobile nao tem overflow horizontal.
- Tema escuro nao tem texto ilegivel.
- Testes automatizados passam.
