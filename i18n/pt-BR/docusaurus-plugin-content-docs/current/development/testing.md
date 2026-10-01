---
title: Testes
sidebar_position: 3
---

# Testes

Tudo abaixo roda sem nenhuma assinatura de streaming, em modo headless, sem
supervisão.

```sh
pnpm verify              # lint → typecheck → unit → e2e (limpo) → matriz de sabotagem e2e
pnpm test:unit           # reducer/política compartilhados + integração do servidor
pnpm test:e2e            # Playwright: N Chromes com o build de teste, player falso, mídia falsa
pnpm test:sabotage       # cada flag desativa um mecanismo; o teste que o protege deve falhar, o resto passar
GJ_SABOTAGE=drift pnpm test:e2e    # uma execução de sabotagem à mão
GJ_REUSE_SERVERS=1 TEST_SERVER_PORT=8080 TEST_PLAYER_PORT=4173 pnpm test:e2e   # contra os seus próprios servidores de desenvolvimento
```

A suíte do Playwright sobe o servidor em `:18080` e o player falso em `:14173`
(portas altas, para que um servidor de desenvolvimento na 8080 nunca colida), abre um
Chromium por par com fixtures de `--use-fake-device-for-media-stream` — uma senoide
diferente por par (440/554/659/784 Hz) e uma cor sólida diferente — e verifica
números: a dispersão de posição entre cada dupla de pares, tirada do log de frames de
referência (ground truth) de um observador headless, contadores de saltos forçados
(hard seeks) e de reanexações, o bin de frequência de pico de cada par, a cor de
pixels amostrados, `framesDecoded`, `video.volume`.

`make -C tools/harness fixtures` gera as fixtures completas com ffmpeg (rótulos
gravados no vídeo, uma fonte de padrão de teste de 5,5 minutos para o player falso).
Quando elas não existem, a suíte escreve equivalentes mínimos dentro do próprio
processo, então o ffmpeg é opcional.

As linhas de sabotagem rodam em paralelo, cada uma com suas próprias portas e seu
próprio diretório de saída do Playwright (`GJ_SABOTAGE_PARALLEL`, padrão 4; use 1 em
uma máquina pequena): cerca de 3,5 minutos para a matriz em um laptop de 14 núcleos,
7 em sequência. A saída completa do Playwright de cada linha fica em
`tools/harness/test-results/sabotage-logs/<flag>.log`. As execuções de sabotagem
limitam cada teste a 100 s (o mais lento que passa leva ~40 s) e pulam o dump de
falha dos testes que a matriz espera que falhem: sob `echo-suppress`, os pares
alimentam uns aos outros com uma tempestade ilimitada de seeks que trava as páginas,
e cada chamada do dump esperaria esgotar o próprio timeout contra ela.

## Flags de sabotagem {/* #sabotage-flags */}

| flag | desativa | deve falhar |
|---|---|---|
| `reattach` | a religação via `MutationObserver` de um `<video>` recriado | element re-attach, quality switch |
| `drift` | a zona morta / faixa de velocidade (tudo vira salto forçado) | small drift |
| `offscreen` | a persistência do documento offscreen entre navegações | navigation survival, leader authority (ambos verificam que a sala sobrevive a uma transição de episódio). O encerramento do service worker é pulado com esta flag: ele mata o worker logo antes dessa navegação, e se o worker que está reiniciando fecha o documento antes que o novo content script o alcance é uma condição de corrida |
| `echo-suppress` | a marcação de comandos remotos aplicados localmente | echo suppression, large drift, small drift, quality switch (os próprios seeks corretivos do seguidor movem a sala) |
| `episode-start` | o salto que uma cópia mais longa aplica a partir do início do episódio da sala | início do episódio |
