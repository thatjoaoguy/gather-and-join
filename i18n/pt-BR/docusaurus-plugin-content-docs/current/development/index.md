---
title: Desenvolvimento
slug: /development
---

# Desenvolvimento

Tudo nesta seção é para quem trabalha no código. O repositório é um workspace
pnpm: uma extensão Chrome MV3 feita com WXT e TypeScript, o servidor de
sinalização e o código que os dois compartilham. Não há framework de UI, e o
servidor não usa bundler em desenvolvimento.

[`CONTRIBUTING.md`](https://github.com/thatjoaoguy/gather-and-join/blob/main/CONTRIBUTING.md)
descreve o processo e as decisões de produto que uma mudança precisa preservar;
[`AGENTS.md`](https://github.com/thatjoaoguy/gather-and-join/blob/main/AGENTS.md)
indica qual código é dono de cada mudança.

- [Arquitetura](/docs/development/architecture): as cinco peças, quem é
  responsável pelo quê e os fatos do navegador que deram forma a elas.
- [Sincronia e protocolo de comunicação](/docs/development/sync-and-protocol): a
  política de desvio (drift), a supressão de eco, os intervalos comerciais e os
  frames que vale a pena conhecer.
- [Testes](/docs/development/testing): a suíte Playwright, a mídia falsa e a
  matriz de sabotagem.
- [Diagnóstico](/docs/development/diagnostics): o log de eventos do servidor e os
  ring buffers da extensão.

## Estrutura {/* #layout */}

| Caminho | O quê |
|---|---|
| `apps/extension` | Extensão em WXT + TypeScript: content script, service worker, documento offscreen, pop-up, opções |
| `apps/server` | Servidor de sinalização/sincronia em Node + `ws`. Um arquivo só. Sem banco de dados, sem autenticação. É distribuído como um `.mjs` empacotado e como uma imagem de contêiner — veja o [`Dockerfile`](https://github.com/thatjoaoguy/gather-and-join/blob/main/apps/server/Dockerfile) dele |
| `packages/shared` | Tipos do protocolo de comunicação, reducer da sala, política de relógio/desvio — importado pelos dois lados |
| `tools/harness` | Página com player falso, mídia falsa que se identifica, cliente observador, lançador de vários peers, suíte Playwright, matriz de sabotagem |

## Início rápido {/* #quick-start */}

```sh
pnpm install
npx skills install                  # opcional: skills de agente fixadas em skills-lock.json (extensão do Chrome + orientações de web moderna)
pnpm dev:server                     # ws://localhost:8080
pnpm dev:harness                    # player falso em http://localhost:4173
pnpm --filter @gj/extension build  # → apps/extension/.output/chrome-mv3
```

Carregue `apps/extension/.output/chrome-mv3` como extensão descompactada
(`chrome://extensions` → **Modo do desenvolvedor** (Developer mode) →
**Carregar sem compactação** (Load unpacked)). Abra a página de opções da
extensão uma vez para permitir o microfone e definir a URL do servidor.

Para ver tudo funcionando sem nenhuma assinatura:

```sh
pnpm --filter @gj/extension build:test      # build de teste com o hook na página
pnpm --filter @gj/harness launch 3          # 3 Chromes com janela visível, numa sala, no player falso
```

## Visual {/* #look-and-feel */}

A UI segue o design system aprovado em `docs/design-system` (Quicksand,
arredondado e divertido, roxo para Join e vermelho para Create, só tema escuro);
as telas que ela implementa estão em `docs/design-system/screens/index.html`. Os
ícones da barra de ferramentas ficam em `apps/extension/public`; as fontes e o
logotipo são copiados do design system no momento do build (`wxt.config.ts`). O
HUD de participantes declara a Quicksand no documento hospedeiro (uma shadow
root não consegue), e é por isso que `fonts/*` é web-accessible nos hosts dos
players. Os estilos compartilhados das páginas ficam em `apps/extension/lib/ui`.
