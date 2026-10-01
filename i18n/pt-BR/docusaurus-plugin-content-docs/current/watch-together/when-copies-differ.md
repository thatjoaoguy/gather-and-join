---
title: Quando as cópias são diferentes
---

# Quando as cópias são diferentes

Um serviço nem sempre entrega a mesma cópia de um episódio para todo mundo. Em
algumas regiões, uma chamada promocional ou um aviso de "fique ligado" passa antes
de o episódio começar, então essa cópia é mais longa. Se a sala mantivesse todos
alinhados segundo a segundo, quem está na cópia mais longa ficaria atrás de todos
os outros, durante o episódio inteiro, pela duração desses extras.

O Gather & Join consegue pular os extras na cópia mais longa, mas não consegue ver
onde eles terminam. Alguém na sala precisa informar isso, e acertar exatamente
pode levar algumas tentativas.

## O que você vê {/* #what-you-see */}

Quando as cópias da sala diferem em mais de 5 segundos, a faixa de participantes
avisa e mostra a duração de cada cópia. Todos na sala veem o aviso, e qualquer
pessoa pode ajustar o valor.

<img src="/img/copies-notice.webp" width="700" height="680" alt="A faixa de participantes ao lado do player, com um aviso que diz &quot;Copies differ by 0:52. One copy runs 58:14, another 57:22&quot;, um campo chamado &quot;Longer copy skips&quot; com o valor 0:52 e um botão Align." />

**Longer copy skips** começa com a diferença entre as duas durações. Isso está
exatamente certo quando todos os extras estão no começo, que é o caso mais comum.

## Definir o valor {/* #set-it */}

1. **Pressione Align** com o valor sugerido. Ele vai para a sala inteira, e o
   aviso sai da faixa. Até você pressionar Align, editar o campo muda só a sua
   própria sugestão; ninguém mais a vê.
2. **Confira na chamada.** Deem play na abertura e escolham um momento fácil de
   anunciar, como um corte para uma nova cena ou a primeira fala. Alguém em cada
   cópia diz "agora" quando vê o momento.
3. **Se vocês viram juntos, está pronto.** Se não, ajuste o valor.

## Ajustar o valor {/* #adjust-it */}

A diferença é só um ponto de partida. Se a cópia mais longa também tem alguns
segundos extras no fim, como um aviso depois dos créditos, a diferença exagera o
que vem antes do episódio, e a cópia mais longa acaba ficando à frente.

Abra a engrenagem no topo da faixa de participantes e altere **Longer copy
skips**:

<img src="/img/copies-settings.webp" width="700" height="680" alt="As configurações da sala abertas na faixa de participantes. Em Episode, a caixa &quot;Copies differ by 0:52&quot; mostra &quot;Longer copy skips&quot; definido como 0:46.25, com um botão Clear ao lado do campo." />

- **A cópia mais longa está à frente**, vendo o momento primeiro: ela pula demais.
  Diminua o valor em mais ou menos o quanto ela está adiantada.
- **A cópia mais longa está atrás**: ela não pula o suficiente. Aumente o valor.

Um novo valor vai para a sala quando você pressiona Enter ou sai do campo, e todo
mundo na cópia mais longa salta para a nova posição na hora. Assim, você pode
testar um valor, esperar o próximo corte e tentar de novo. Digite minutos e
segundos, até o centésimo (`0:46.25`), ou só os segundos (`46.25`).

Ajuste primeiro em segundos inteiros, depois em décimos. Pare quando as duas
cópias estiverem a cerca de um quarto de segundo uma da outra: essa é a diferença
que a sala já tolera entre as pessoas antes de corrigi-las, então uma mudança
menor pode não mexer em nada de forma visível.

Por exemplo, as cópias diferem em 0:52, então o campo começa em `0:52`. Depois do
Align, as pessoas na cópia mais longa anunciam cada corte cerca de seis segundos
antes: seis dos segundos extras dessa cópia estão no fim, não no começo. Com o
valor mudado para `0:46`, os cortes caem com menos de um segundo de diferença, e
`0:46.25` deixa tudo alinhado.

## Começar de novo {/* #start-over */}

**Clear** remove o valor, e o aviso volta para a faixa com a diferença
preenchida de novo.

Se as cópias estão alinhadas desde o começo e só os finais são diferentes, defina
o valor como `0:00` e pressione Align. A sala passa a saber que não há nada para
pular, e o aviso some.

## Bom saber {/* #good-to-know */}

- **Vale só para este episódio.** O próximo episódio começa sem pular nada, já
  que pode não ter extra nenhum. Se as cópias dele também forem diferentes, o
  aviso volta.
- **Só a cópia mais longa pula.** Com três ou mais durações diferentes na sala,
  uma cópia de duração intermediária fica como está.
- **Só extras antes do episódio podem ser pulados.** Intervalos comerciais no meio
  do episódio são outro problema; veja
  [planos com anúncios](/docs/watch-together#ad-supported-plans).
