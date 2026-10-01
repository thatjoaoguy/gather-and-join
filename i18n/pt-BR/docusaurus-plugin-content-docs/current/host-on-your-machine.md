---
sidebar_label: No seu computador
title: Hospedar no seu computador
---

# Hospedar no seu computador

Assim, o servidor roda no seu próprio computador, com um endereço público
temporário na frente dele, para que pessoas de fora da sua rede possam entrar.
Serve bem para uma noite avulsa.

Para algo frequente, [hospedar no Render](./host-a-server.md) dá menos
trabalho: o endereço nunca muda, ninguém precisa deixar um notebook aberto, e
também é de graça.

Duas coisas para saber antes de começar. O endereço é diferente a cada vez,
então todo mundo precisa digitá-lo de novo a cada sessão. E a sala vive no seu
computador, então ela acaba se o notebook entrar em repouso, perder o Wi-Fi ou
se você fechar o terminal.

## O que você precisa {/* #what-you-need */}

- **Node 22.6 ou mais recente**, ou Docker. Nada mais é instalado.
- **[cloudflared](https://github.com/cloudflare/cloudflared/releases)**, que
  cria o endereço temporário. No macOS: `brew install cloudflared`.

## 1. Inicie o servidor {/* #1-start-the-server */}

Baixe `gather-and-join-server-<version>.mjs` da
[versão mais recente](https://github.com/thatjoaoguy/gather-and-join/releases/latest)
e rode:

```sh
node gather-and-join-server-0.3.1.mjs
```

Ou, se você preferir usar Docker:

```sh
docker run -d --name gather-and-join -p 8080:8080 \
  ghcr.io/thatjoaoguy/gather-and-join-server:latest
```

De um jeito ou de outro, ele escuta na porta 8080. Confira abrindo
`http://localhost:8080/` — um servidor rodando responde com todas as letras.

## 2. Abra o túnel {/* #2-open-the-tunnel */}

Em um segundo terminal:

```sh
cloudflared tunnel --protocol http2 --url http://localhost:8080
```

Ele imprime um endereço como `https://some-random-words.trycloudflare.com`.

## 3. Compartilhe o endereço {/* #3-share-the-address */}

Troque `https://` por `wss://` e envie isso para todo mundo:

```text
wss://some-random-words.trycloudflare.com
```

Cada pessoa cola o endereço na página de configuração da extensão. Elas vão ter
que fazer isso de novo na próxima vez — este endereço é novo a cada execução.

## Durante a sessão {/* #while-the-party-runs */}

Mantenha o servidor e o túnel rodando, e mantenha o computador acordado — em um
Mac, `caffeinate -d` em outro terminal resolve. Tudo para quando você pressiona
`Ctrl-C`.

Se o túnel cair e você o reiniciar, o endereço muda e todo mundo precisa colar
o novo.

## Se você já tem o código-fonte {/* #if-you-already-have-the-source-code */}

Você não precisa dele — os passos acima são o trabalho todo. Mas, se você já
tem o repositório clonado, um único comando substitui os dois:

```sh
pnpm host
```

Ele inicia o servidor, abre o túnel e imprime o endereço pronto:

```text
  Server URL for everyone's setup page:   wss://some-random-words.trycloudflare.com
```

`Ctrl-C` para as duas metades juntas.

## Por que um túnel {/* #why-the-tunnel-at-all */}

O endereço precisa começar com `wss://`, o que significa que ele precisa de um
certificado. A Cloudflare fornece um para o endereço temporário que ela te dá.
Sem um túnel, outras pessoas não conseguem chegar ao seu computador de jeito
nenhum, a não ser que você abra portas no roteador — e, mesmo assim, a conexão
não seria criptografada.

Se todo mundo estiver no mesmo Wi-Fi que você, nada disso se aplica: veja
[hospedar na sua rede local](./host-on-your-network.md).
