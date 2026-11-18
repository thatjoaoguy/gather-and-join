---
sidebar_position: 1
title: Instalar
---

# Instalar a extensão

O Gather & Join é uma extensão para o Chrome e o Firefox. Ela precisa do Chrome
(ou de outro navegador baseado no Chromium que instale extensões pela Chrome Web
Store) ou do Firefox 140 ou mais recente e, para a chamada, de um microfone. A
câmera é opcional. Cada pessoa da sala pode usar qualquer um dos dois navegadores.

A extensão está em inglês. Neste guia, os nomes de botões e opções aparecem em inglês, exatamente como você os vê na tela.

## Pela Chrome Web Store {/* #from-the-chrome-web-store */}

Por enquanto, a extensão não aparece nas buscas da loja: instale pelo link que
a pessoa que hospeda o seu servidor compartilhar com você. O Chrome mantém a
extensão atualizada automaticamente, normalmente em poucas horas depois de um
lançamento; para atualizar agora, ative o modo de desenvolvedor em
`chrome://extensions` e pressione **Update**. A página de configuração mostra
no rodapé a versão que você tem, e avisa quando ela está atrás da do servidor.

## No Firefox {/* #in-firefox */}

O Gather & Join ainda não está no addons.mozilla.org. Até estar, cada lançamento
traz um pacote para o Firefox, que o Firefox carrega como extensão temporária:

1. Baixe `gather-and-join-<versão>-firefox.zip` do
   [lançamento mais recente](https://github.com/thatjoaoguy/gather-and-join/releases/latest).
2. Abra `about:debugging#/runtime/this-firefox` e pressione **Carregar extensão temporária…**
   (Load Temporary Add-on…).
3. Escolha o ZIP que você baixou. A página de configuração abre sozinha.

O Firefox remove uma extensão temporária quando é fechado, então você a carrega de
novo na próxima vez, e com isso permite o microfone e cola o endereço de novo.
Ela também não se atualiza sozinha: baixe o pacote novo quando sair um lançamento.

Numa sala, o Firefox mantém o seu microfone e a sua câmera numa aba fixada do
Gather & Join, porque só deixa uma aba usá-los. A aba vem para a frente por um
instante quando você entra e quando liga a câmera, e depois volta para o
episódio. Deixe-a aberta: fechá-la deixa você no mudo, e ela se fecha sozinha
quando você sai da sala.

## Configuração inicial {/* #first-time-setup */}

1. Clique no ícone da extensão e abra **Connection & device setup**. No Firefox,
   o ícone fica no botão de extensões (a peça de quebra-cabeça) até você fixá-lo.
2. Pressione **Allow microphone**. Permita a câmera também, se quiser usá-la.
3. Em **Connection address**, cole o endereço que o anfitrião compartilhou com
   você (normalmente ele começa com `wss://`) e pressione **Save address**.

Você só faz isso uma vez, a não ser que o endereço do anfitrião mude.

## Compilando você mesmo {/* #building-it-yourself */}

O repositório compila a extensão para os dois navegadores com um único comando; o
[início rápido](/docs/development#quick-start) tem os detalhes. Carregue a versão
do Chrome como extensão sem compactação em `chrome://extensions`, com o
**Modo do desenvolvedor** (Developer mode) ativado, ou a do Firefox pelo
`about:debugging`, como acima.
