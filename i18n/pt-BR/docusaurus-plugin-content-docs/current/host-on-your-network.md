---
sidebar_label: Na sua rede local
title: Hospedar na sua rede local
---

# Hospedar na sua rede local

Se todo mundo que vai assistir estiver no mesmo Wi-Fi — uma casa, cada um em um
cômodo —, o servidor pode ficar inteiramente na sua rede. Nada é exposto à
internet, e não há túnel nem conta em lugar nenhum.

O endereço só funciona para quem está nessa rede. Quem entrar de outro lugar
precisa do [Render](./host-a-server.md) ou de
[um túnel](./host-on-your-machine.md).

## 1. Inicie o servidor {/* #1-start-the-server */}

Com Node 22.6 ou mais recente, usando
`gather-and-join-server-<version>.mjs` da
[versão mais recente](https://github.com/thatjoaoguy/gather-and-join/releases/latest):

```sh
node gather-and-join-server-0.3.1.mjs
```

Ou com Docker:

```sh
docker run -d --name gather-and-join -p 8080:8080 \
  ghcr.io/thatjoaoguy/gather-and-join-server:latest
```

Ele escuta na porta 8080. `PORT=9000` muda a porta se outra coisa já estiver
nela.

## 2. Descubra o endereço do seu computador na rede {/* #2-find-your-machines-address-on-the-network */}

| Sistema | Comando |
| --- | --- |
| macOS | `ipconfig getifaddr en0` |
| Linux | `hostname -I` |
| Windows | `ipconfig` — use o endereço IPv4 |

Você quer algo como `192.168.1.20`. Um endereço que começa com `127.` é o
computador falando consigo mesmo e não vai funcionar para mais ninguém.

## 3. Confira de outro dispositivo {/* #3-check-it-from-another-device */}

Em um segundo dispositivo no mesmo Wi-Fi, abra `http://192.168.1.20:8080/` em
um navegador, trocando pelo seu próprio endereço. Um servidor rodando responde
com todas as letras. Se nada carregar, veja
[quando não funciona](#when-it-does-not-work).

## 4. Compartilhe o endereço {/* #4-share-the-address */}

Envie para todo mundo o mesmo endereço, com `ws://` na frente:

```text
ws://192.168.1.20:8080
```

Aqui, `ws://` simples em vez de `wss://` não tem problema, porque o tráfego
nunca sai da sua rede. O Chrome permite isso para páginas de extensão.

O endereço do seu computador pode mudar quando ele se reconecta ao roteador. Se
a sala parar de funcionar entre uma sessão e outra, confira o endereço de novo
— ou reserve um endereço fixo para esse computador nas configurações do
roteador.

## Quando não funciona {/* #when-it-does-not-work */}

- **O seu firewall.** Na primeira vez que você inicia o servidor, o macOS e o
  Windows costumam perguntar se devem permitir conexões de entrada. Se você
  fechou esse aviso, permita nas configurações do firewall.
- **Uma rede de convidados.** O Wi-Fi de convidados normalmente impede que os
  dispositivos se enxerguem. Todo mundo precisa estar na rede principal.
- **Cabo e Wi-Fi em sub-redes diferentes.** Alguns roteadores separam as duas;
  coloque todo mundo na mesma.
