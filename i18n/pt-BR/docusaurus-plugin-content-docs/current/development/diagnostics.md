---
title: Diagnóstico
sidebar_position: 4
---

# Diagnóstico

Não há analytics nem telemetria: cinco pessoas numa mesma casa não precisam de um
funil, e a promessa de privacidade (o servidor só vê metadados da sala e frames de
sinalização) vale mais do que números de uso. O que existe no lugar:

- **Log de eventos do servidor.** Uma linha `key=value` por evento de sala no stdout,
  nada para frames de reprodução ou de sinalização (travamentos, os stalls, são a
  exceção):

  ```
  2026-09-18T20:01:02.345Z room_created room=RM0001 peer=a3f9 name=Ana rooms=1
  2026-09-18T20:01:09.010Z peer_joined room=RM0001 peer=7c21 name=Ben peers=2 leader=a3f9
  2026-09-18T20:14:31.877Z stall room=RM0001 peer=7c21 name=Ben positionMs=812340
  2026-09-18T20:40:02.101Z peer_left room=RM0001 peer=7c21 name=Ben reason=heartbeat peers=1 leader=a3f9
  ```

  Eventos: `listening`, `room_created`, `peer_joined`, `peer_left` (com
  `reason=leave|close|error|heartbeat`), `peer_evicted`, `leader_changed`,
  `join_rejected`, `content_set`, `navigate`, `navigate_rejected`, `episode_start`, `stall`,
  `signal_dropped`, `bad_message`, `room_expired`. `GJ_LOG=0` desliga o log.
- **Diagnóstico da extensão.** Cada realm da extensão (service worker, documento
  offscreen e cada página de player, por meio do documento offscreen) mantém um
  buffer circular com seus últimos 400 eventos em `chrome.storage.session`: frames da
  sala que entram e saem, status do socket, mudanças de estado das conexões
  peer-to-peer, resultados de microfone/câmera, (re)anexações de vídeo, cada salto
  forçado (hard seek) e cada ajuste de velocidade, e um resumo do desvio (drift) a
  cada 30 s enquanto o vídeo toca (`drift 30s: n=118 p50=32ms max=410ms seeks=0 nudges=1`).
  Os buffers sobrevivem ao Chrome reiniciar o worker ou o documento offscreen (um
  marcador `--- restarted ---` separa as encarnações) e são apagados quando o Chrome
  fecha. A seção **Diagnostics** da página de configuração mostra a sala atual e os
  estados dos pares, e tem um botão **Copy diagnostics** que junta tudo isso, com as
  contagens de bytes de cada par, em um único texto para colar. Nada é enviado a
  lugar nenhum por conta própria.

## Ambiente do servidor {/* #server-environment */}

As variáveis que quem hospeda o servidor pode definir estão listadas em
[Outros lugares onde ele pode rodar](/docs/host-a-server#other-places-it-can-run).
Existem mais duas para desenvolvimento: `WATCH_URL_TEMPLATE` monta uma URL de
exibição a partir de um content id quando nem o cliente nem `watchUrlFor` em
`packages/shared` conhecem uma (o harness a aponta para o player falso, por exemplo
`http://localhost:4173/watch/{contentId}`), e `GJ_VERSION` é a versão que `/` e
`/health` informam em uma execução de desenvolvimento; os builds empacotados já a
trazem embutida. O comentário de cabeçalho em `apps/server/src/index.ts` é a lista
completa.
