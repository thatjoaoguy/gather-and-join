---
title: Sincronia e o protocolo de comunicação
sidebar_position: 2
---

# Sincronia e o protocolo de comunicação

A versão para usuários é [Como a sincronia funciona](/docs/how-it-stays-in-sync).
Aqui está a política por trás dela, com os números.

## Sincronia {/* #sync */}

- O servidor é o relógio. Cada cliente estima o próprio deslocamento (offset) com 5
  idas e voltas de ping/pong (vence o menor RTT), repetidas a cada 60 s e sempre que
  uma conexão peer-to-peer é estabelecida.
- O líder envia um heartbeat com a posição a cada 5 s enquanto o vídeo está tocando.
- Cada cliente compara a posição local com a posição esperada da sala a cada 250 ms:

  | desvio (drift) | ação |
  |---|---|
  | < 250 ms | nada |
  | 250–1500 ms | ajuste de `playbackRate`, mantido até < 100 ms |
  | ≥ 1500 ms | salto forçado (hard seek) |

  O ajuste cresce com o desvio (`|drift|/4000`, limitado entre 3 % e 20 %) em vez de
  ser fixo em 3 %: 3 % não conseguem corrigir 800 ms dentro dos 8 s que os testes
  permitem (levaria ~22 s). Abaixo de ~200 ms de desvio, é um suave 3 %.
- As posições ficam na linha do tempo do próprio episódio. Uma cópia com extras antes
  do episódio os pula: o `episodeStart` da sala diz onde o episódio começa em uma
  cópia de determinada duração, e uma cópia que corresponde a ela (com margem de 5 s)
  soma esse valor na entrada e o subtrai na saída, sem nunca transmitir uma posição
  antes de 0.
- Os comandos que aplicamos vindos da sala são marcados para que os ecos de
  `play`/`pause`/`seeking` que eles mesmos geram não sejam retransmitidos (500 ms, por
  tipo de evento — uma ação genuína do usuário de outro tipo dentro dessa janela
  ainda se propaga). Um frame chega à página duas vezes, como ele mesmo e no
  snapshot que vem logo depois; um estado da sala idêntico ao que acabou de ser
  aplicado é ignorado, senão uma fachada receberia um segundo play ou pause.

## Buffering {/* #buffering */}

- Um player cujo buffer esvazia (`waiting`, e ainda sem dados 750 ms depois) pausa a
  sala **na própria posição**. Não na última âncora da sala: ela pode ter até um
  heartbeat (5 s) de idade, e pausar ali faz todo mundo voltar, inclusive o player
  travado, para fora do buffer que ele estava esperando.
- Por um segundo depois que essa pausa volta do servidor (no máximo 10 s esperando
  por ela), os eventos `play` e `seeking` do próprio player travado são retidos, e
  um play é devolvido à pausa da sala. Os players se retomam sozinhos assim que os
  dados voltam, e, se isso fosse repassado, retomaria a sala para todo mundo: o
  HBO Max foi visto fazendo isso 33 ms depois que o travamento dele chegou aos
  outros. Se outra pessoa retomar, a retenção acaba na hora. Retomar continua manual.
- Enquanto a sala está pausada pelo travamento dele, esse player se declara pronto
  quando tem 5 s carregados além de onde parou (`READY_AHEAD_MS`). Ele se guia por
  `buffered`, nunca por `readyState`, que o HBO Max informou como 4 com 1 s
  carregado e 2 com 12 s. A fachada do Disney+ leva os intervalos do elemento para o
  relógio do programa, e a fachada do Drive lê o `videoLoadedFraction` do embed; um
  player que não sabe dizer fica em Buffering. Pronto muda a etiqueta e o pop-up;
  não retoma nada.

## Intervalos comerciais {/* #ad-breaks */}

Nos planos com anúncios, os intervalos caem em pontos diferentes para cada pessoa,
então `currentTime` não é comparável entre os membros da sala durante um intervalo.
A extensão não pula, esconde, silencia nem encurta anúncios — eles tocam exatamente
como o serviço os entrega —, então não há correção; a sala volta a convergir depois
do intervalo. Três pequenas proteções impedem que um intervalo cause algo pior que
perder a sincronia: um elemento cuja duração termina muito antes da posição da sala
(um clipe de anúncio) nunca pausa a sala quando termina; um `ended` só é
transmitido se o elemento ainda for o atual um segundo depois (os players trocam o
elemento logo após um anúncio); e, depois que a duração de uma cópia é conhecida,
um elemento muito mais curto que ela é tratado como anúncio, por mais longo que
seja, então um intervalo nunca muda a duração pela qual a sala distingue as cópias
(anúncios podem passar dos 60 s que descartam clipes curtos).

Anúncios costurados na própria linha do tempo do episódio, em vez de tocados em um
elemento separado, o alongariam de vez a cada intervalo. O [início do episódio](/docs/watch-together/when-copies-differ) não ajuda: ele descreve extras antes do episódio, não dentro dele.

## Protocolo de comunicação {/* #wire-protocol */}

Veja `packages/shared/src/protocol.ts`. Oito frames que vale a pena conhecer além dos
óbvios: `welcome` é o primeiro frame do servidor em todo socket e leva a versão dele
(a extensão a compara com a própria, já que os dois são lançados sob um único
número, e diz ao usuário qual lado atualizar; nada é negociado), `join` leva `create: true` quando o cliente está criando a sala (o servidor
rejeita colisões com `ROOM_EXISTS` e o cliente tenta de novo com um código novo),
`playback` pode levar `reason: 'stall'`, na posição do próprio player travado, para que
a barra lateral e o pop-up digam quem travou carregando (buffering), um frame
`bufferReady` depois diz que esse player se recuperou (repassado aos outros e nunca
guardado: quem entra depois nunca viu o travamento), um frame `media` leva o estado de microfone/câmera informado pelo
próprio par (repassado aos outros e guardado para quem entra depois, para que os
quadros mostrem quem está mudo), um frame `duration` faz o mesmo com a duração da
cópia que um par tem do episódio da sala, `episodeStart` define ou limpa onde o
episódio começa na cópia mais longa (estado da sala, descartado se citar um conteúdo
que a sala já deixou, limpo por uma troca de conteúdo), e um frame `leader` anuncia
uma reatribuição depois do período de tolerância de 60 s concedido a um líder
desconectado (quem volta com o mesmo peer id dentro desse período mantém a
liderança; o servidor despeja o socket antigo).
Peer ids que começam com `obs:` são observadores sem mídia (o harness) e nunca entram
em negociação.
