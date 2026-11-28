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

Toda página falsa também aceita `?copy=starved`: o servidor do player para de enviar
aos 13 s do episódio e mantém a conexão aberta, então o player trava carregando de
verdade (`waiting`, `readyState` caindo), e não por algo que a extensão conseguiria
distinguir de uma rede lenta. `/media/starved/release` devolve os dados às páginas
que estão esperando, e a com formato de HBO então se retoma sozinha, como os
players reais fazem. Isso não reproduz o `readyState` do Media Source de um serviço
real, que não diz nada sobre o que está carregado.

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
| `drift` | a zona morta / faixa de velocidade (tudo vira salto forçado) | small drift. Os testes de travamento por buffering são pulados: a flag faz um convidado sem dados saltar para além do fim deles assim que fica 250 ms atrás, um travamento causado por um salto, que eles não protegem |
| `offscreen` | a persistência do documento offscreen entre navegações | navigation survival, leader authority (ambos verificam que a sala sobrevive a uma transição de episódio). O encerramento do service worker é pulado com esta flag: ele mata o worker logo antes dessa navegação, e se o worker que está reiniciando fecha o documento antes que o novo content script o alcance é uma condição de corrida |
| `echo-suppress` | a marcação de comandos remotos aplicados localmente | echo suppression, large drift (os próprios seeks corretivos do seguidor movem a sala), disney-shaped seek (a rajada do seek aplicado pelo seguidor chega à sala como pausas), e os dois testes de travamento por buffering com formato de Drive (a pausa do travamento chega ao embed uma mensagem depois do seek de volta, que sai como um play). Small drift e quality switch são pulados: sem marcação, se o seek do seguidor que vai e volta se acomoda dentro das janelas deles é questão de tempo |
| `episode-start` | o salto que uma cópia mais longa aplica a partir do início do episódio da sala | início do episódio |
| `ad-pod` | manter a duração de uma cópia durante um anúncio mais curto que o episódio | ad pod |
| `stall-position` | pausar a sala na posição do próprio player travado (ela informa a última âncora da sala no lugar) | the room pauses where the stalled player stopped, em todos os formatos. O teste de pronto com formato de Disney é pulado: depois de voltar com a mídia pausada, o arquivo simples do fake carrega só ~4 s à frente, abaixo do limite de pronto |
| `stall-guard` | reter o play e os seeks do próprio player travado depois do travamento | a player that resumes itself when data returns does not resume the room, e os testes de pronto com formato de HBO e de Wix (a página deles se retoma sozinha quando os dados voltam) |

## Firefox {/* #firefox */}

O Playwright não consegue carregar uma extensão no Firefox, então a suíte e a
matriz só dirigem o Chrome. A versão para Firefox tem a sua própria verificação:

```sh
pnpm --filter @gj/harness smoke:firefox
```

Ela dirige um Firefox headless pelo WebDriver BiDi (`webExtension.install`), põe
esse Firefox numa sala com um peer Chrome do harness e verifica a chamada nos
dois sentidos (cada lado ouve o tom do outro), o play e o pause nos dois sentidos,
as câmeras nos quadros da página, a sala sobrevivendo a um recarregamento, a uma
rota no cliente e à troca de episódio feita pelo líder, e o play e o pause do
próprio Firefox chegando ao Chrome na página no formato do Drive, onde o player é
uma fachada sobre um embed de outra origem, e, na página no formato do Disney+, o
script do mundo da página chegando à fachada, os dois relógios do programa
concordando e um seek pelos controles do player do Firefox chegando ao Chrome. Ela precisa de um Firefox
instalado (`FIREFOX_BIN` aponta para outro) e roda o servidor em `:8080`, o padrão
da extensão, porque não dá para apontar um peer Firefox para um servidor de teste:
a automação não consegue abrir as páginas `moz-extension://` dele.

Ela mantém as verificações de permissão ligadas, com o microfone e a câmera já
permitidos do jeito que a página de configuração os deixa. Com elas desligadas,
ela já passou enquanto ninguém num Firefox de verdade conseguia ouvir você: o
Firefox recusa `getUserMedia` numa background page, diga a permissão o que disser,
e isso só aparece com as verificações ligadas.
