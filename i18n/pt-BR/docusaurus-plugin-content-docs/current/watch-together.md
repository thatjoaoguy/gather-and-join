---
sidebar_position: 5
title: Assistir juntos
---

# Assistir juntos

A extensão está em inglês. Nesta página, os nomes de botões e opções aparecem em inglês, exatamente como você os vê na tela.

## Criar ou entrar {/* #create-or-join */}

Uma pessoa abre um episódio ou um vídeo, clica na extensão e pressiona
**Create a room**. O pop-up mostra um código de seis caracteres. Todos os outros
clicam na extensão, digitam o código e pressionam **Join room**. Se alguém estiver
em outro episódio, o pop-up oferece um botão que leva direto ao episódio certo.

Na primeira vez que você usa a extensão em um serviço, o pop-up pede que você
clique em **Allow** para liberá-la ali. A extensão não tem acesso a nenhum site até
você fazer isso, e o pedido vale só para aquele serviço. A página de configuração
lista todos os serviços, cada um com um botão de ativar, para você ver o que
liberou e poder revogar.

Antes de entrar, o pop-up mostra se o seu microfone, a sua câmera e o servidor
estão prontos. O ícone de olho ao lado do endereço do servidor esconde o
endereço, para quando você estiver compartilhando a tela.

## Durante o programa {/* #during-the-show */}

- **Qualquer pessoa pode dar play, pausar ou pular para outro ponto.** Todo mundo
  acompanha.
- **Só o líder da sala troca de episódio.** O líder é quem criou a sala; se ele
  sair, a pessoa que está na sala há mais tempo assume.
- **Se o vídeo de alguém travar carregando (buffering), a sala pausa** e o pop-up
  diz de quem é. Retomar é sempre manual, e qualquer pessoa pode fazer isso: é de
  propósito, porque retomar automaticamente faz a sala ficar pausando e
  retomando o tempo todo.
- **A faixa de participantes** fica ao lado do player, inclusive em tela cheia.
  Quem está com a câmera ligada aparece em vídeo ao vivo; os demais aparecem com
  as iniciais.
- **O microfone** já vem ligado quando você entra. **A câmera** fica desligada até
  você ligá-la.
- **A redução automática do volume do programa (ducking)** abaixa o som do
  programa enquanto você fala. Ela vem desligada e fica na página de
  configuração; com caixas de som, o próprio programa fica acionando o ducking.
- **A engrenagem** no topo da faixa de participantes abre as configurações da
  sala sem sair do player: o código da sala, o seu microfone e a sua câmera, o
  serviço e o episódio (com um link para ir até lá se você estiver em outro
  lugar), quanto a cópia mais longa pula
  ([quando as cópias são diferentes](/docs/watch-together/when-copies-differ))
  e o servidor.
- **O ícone na barra de ferramentas** ganha um ponto enquanto você está em uma
  sala: verde quando você está conectado, âmbar enquanto uma entrada ou uma
  reconexão está em andamento. Sem ponto, você não está em nenhuma sala.

## Serviços {/* #services */}

Cada serviço tem suas particularidades, então cada um tem sua página:

- [HBO Max](/docs/watch-together/hbo-max)
- [YouTube](/docs/watch-together/youtube)
- [Google Drive](/docs/watch-together/google-drive)
- [Wix Video](/docs/watch-together/wix-video)

Se a sala avisar que as cópias de um episódio são diferentes, veja
[quando as cópias são diferentes](/docs/watch-together/when-copies-differ).

## Quantas pessoas? {/* #how-many-people */}

Não há um limite fixo. O que limita é a chamada: cada pessoa envia a própria voz,
e a câmera se estiver ligada, diretamente para cada uma das outras, então o
upload de cada pessoa cresce com o tamanho da sala.

| Pessoas | Upload por pessoa, só voz | Upload por pessoa, todas as câmeras ligadas |
|---|---|---|
| 2 | 0,03 Mbps | 0,6 Mbps |
| 4 | 0,1 Mbps | 1,9 Mbps |
| 6 | 0,16 Mbps | 3,2 Mbps |
| 8 | 0,22 Mbps | 4,4 Mbps |
| 10 | 0,29 Mbps | 5,5 Mbps |

O download é mais ou menos o mesmo. Cada câmera ligada custa a cada uma das
outras pessoas cerca de 0,6 Mbps em cada sentido.

- **Até 6 pessoas com câmeras ligadas** funciona bem na maioria das conexões
  domésticas.
- **Grupos maiores:** deixem as câmeras desligadas. Só a voz continua leve mesmo
  com 10 pessoas.
- **O upload é o limite.** Muitos planos de internet residencial têm upload bem
  menor que o download, então confira o seu antes de uma noite grande com
  câmeras ligadas. Notebooks mais antigos também sentem isso antes: cada
  transmissão é codificada separadamente para cada pessoa.

Esses números vêm de um teste com até 10 pessoas, todas com a câmera ligada e sem
limites de rede, então mostram o que a chamada exige, não o que uma conexão lenta
consegue entregar.

## Sair {/* #leaving */}

Pressione **Leave room**. Seu microfone e sua câmera são liberados na hora.
Fechar a aba tem o mesmo efeito.

## Planos com anúncios {/* #ad-supported-plans */}

Os intervalos comerciais caem em momentos diferentes para cada pessoa, e a
extensão não pula, esconde, silencia nem encurta os anúncios. A sala sai de
sincronia durante o intervalo e volta a se alinhar depois dele. Isso é esperado.
