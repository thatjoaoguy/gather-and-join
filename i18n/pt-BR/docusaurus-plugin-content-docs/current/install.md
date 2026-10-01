---
sidebar_position: 1
title: Instalar
---

# Instalar a extensão

O Gather & Join é uma extensão do Chrome. Ela precisa do Chrome (ou de outro
navegador baseado no Chromium que instale extensões pela Chrome Web Store) e,
para a chamada, de um microfone. A câmera é opcional.

A extensão está em inglês. Neste guia, os nomes de botões e opções aparecem em inglês, exatamente como você os vê na tela.

## Pela Chrome Web Store {/* #from-the-chrome-web-store */}

Por enquanto, a extensão não aparece nas buscas da loja: instale pelo link que
a pessoa que hospeda o seu servidor compartilhar com você. O Chrome mantém a
extensão atualizada automaticamente.

## Configuração inicial {/* #first-time-setup */}

1. Clique no ícone da extensão e abra **Connection & device setup**.
2. Pressione **Allow microphone**. Permita a câmera também, se quiser usá-la.
3. Em **Connection address**, cole o endereço que o anfitrião compartilhou com
   você (normalmente ele começa com `wss://`) e pressione **Save address**.

Você só faz isso uma vez, a não ser que o endereço do anfitrião mude.

## Compilando você mesmo {/* #building-it-yourself */}

O repositório compila a extensão com um único comando; o
[início rápido](/docs/development#quick-start) tem os detalhes. Carregue a pasta
gerada como extensão sem compactação em `chrome://extensions`, com o
**Modo do desenvolvedor** (Developer mode) ativado.
