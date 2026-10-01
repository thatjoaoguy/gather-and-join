---
sidebar_label: No Render (recomendado)
title: Hospedar um servidor no Render
---

# Hospedar um servidor no Render

Uma pessoa do grupo roda o servidor de sinalização e compartilha o endereço
dele. Todos os outros colam esse endereço uma vez na página de configuração da
extensão. O servidor transmite os nomes de exibição, o código da sala, o
episódio em que a sala está e a posição de play/pausa — nunca vídeo nem áudio.

Esta página configura um servidor no **Render**, que o roda de graça em um
endereço que nunca muda. Leva uns cinco minutos e não pede cartão de crédito.
Você não precisa de uma cópia do código-fonte. O Render é uma empresa à parte,
sem nenhuma ligação com este projeto — leia [sobre o Render](#about-render)
antes de se decidir por ele.

Há duas outras formas, se esta não servir para você:

- [Hospedar no seu computador](./host-on-your-machine.md) — um túnel a partir
  do seu notebook, para uma noite.
- [Hospedar na sua rede local](./host-on-your-network.md) — todo mundo no mesmo
  Wi-Fi, nada exposto à internet.

## 1. Crie o serviço {/* #1-create-the-service */}

Entre em [dashboard.render.com](https://dashboard.render.com) e escolha
**New → Web Service**. Na etapa de origem, selecione a aba **Existing Image** e
cole isto em **Image URL**:

```text
ghcr.io/thatjoaoguy/gather-and-join-server:latest
```

![A página New Web Service com a aba Existing Image selecionada e a URL da imagem colada](/img/hosting/render-image-url.png)

Deixe **Credential** como "No credential" — a imagem é pública. Pressione
**Connect**.

## 2. Escolha o plano gratuito {/* #2-choose-the-free-plan */}

Dê um nome ao serviço. O nome vira o endereço web dele, então escolha algo que
só o seu grupo adivinharia — `movie-night-8f21` em vez de `gather-and-join`.
Qualquer pessoa que descobrir o endereço pode criar salas no seu servidor.

Escolha uma **region** perto de quem vai assistir. O servidor é o relógio da
sala, então a distância até ele custa um pouco de precisão para todo mundo.

Depois role até **Compute** — e leia esta parte com atenção:

![A seção Compute com o plano Free de $0/month selecionado](/img/hosting/render-free-plan.png)

**O Render já vem com o plano de $7/month selecionado.** O Free é a primeira
linha, mas não vem escolhido. Clique nele e confira se a barra no fim da página
mostra **$0 / month** antes de continuar.

O aviso que o Render mostra sobre instâncias gratuitas hibernarem é verdadeiro,
e inofensivo aqui — veja [o que significa hibernar](#what-sleeping-means) mais
abaixo.

Agora pressione **Deploy web service**. O primeiro deploy leva um ou dois
minutos.

Você pode ignorar tudo em **Advanced**. O Render monitora a porta em que o
servidor escuta, o que, para um único programa sem banco de dados, é o mesmo
que monitorar o servidor.

## 3. Confira se funciona {/* #3-check-it-works */}

O Render dá ao serviço um endereço como `https://movie-night-8f21.onrender.com`.
Abra-o em um navegador. Um servidor que está rodando diz isso com todas as
letras:

![A página do servidor em um navegador, com o texto "Gather and Join signaling server 0.3.1, running."](/img/hosting/server-running.png)

Acrescente `/health` ao endereço para ter a mesma resposta com detalhes — a
versão, há quanto tempo ele está no ar e quantas salas e pessoas estão nele
agora:

```json
{"status":"ok","version":"0.3.1","uptimeSec":412,"rooms":1,"peers":3}
```

Essas duas são as únicas coisas servidas pela web comum. A extensão em si se
conecta com `wss://`, e é por isso que o endereço que você compartilha não é o
de `https://`.

## 4. Compartilhe o endereço {/* #4-share-the-address */}

Pegue o endereço que o Render deu, troque `https://` por `wss://` e envie isso
para todo mundo:

```text
wss://movie-night-8f21.onrender.com
```

Cada pessoa cola o endereço uma vez na página de configuração da extensão, e
nunca mais — ele não muda de uma sessão para outra. Veja [Instalar](./install.md)
para a parte delas.

## O que significa hibernar {/* #what-sleeping-means */}

Um serviço gratuito hiberna depois de 15 minutos sem tráfego e acorda quando
alguém se conecta. Na prática:

- **Ele não consegue hibernar durante uma sessão.** Cada extensão conectada
  confere o relógio uma vez por minuto, e isso conta como tráfego.
- **A primeira pessoa a chegar espera uns 12 segundos** enquanto ele acorda.
  Ela vê uma página de espera do Render em vez do servidor, o que é normal:

![A página de espera do Render, com o logotipo dele e uma linha dizendo "incoming HTTP request detected"](/img/hosting/render-waking-up.png)

- Se você preferir que ninguém espere, abra você mesmo o endereço `/health` um
  minuto antes de a sessão começar.

Hibernar também é o que mantém o serviço gratuito: um workspace gratuito tem
750 horas de execução por mês, e o relógio só corre enquanto o serviço está
acordado.

## Atualizando o servidor {/* #updating-the-server */}

Para esse tipo de serviço, o Render não pega versões novas sozinho. Quando sair
uma versão nova, abra o serviço no dashboard e escolha **Manual
Deploy → Deploy latest reference**. Depois, confira a versão em `/health`.

## Outros lugares onde ele roda {/* #other-places-it-can-run */}

Nada aqui é específico do Render. O servidor é um pequeno programa Node, sem
banco de dados e sem nada guardado em disco, publicado tanto como imagem de
contêiner quanto como um único arquivo. Então ele roda em qualquer lugar que
rode **Docker** ou **Node 22.6 ou mais recente** — uma máquina sobrando, um
servidor caseiro, outro provedor de hospedagem.

Três coisas importam onde quer que você o coloque:

| Configuração | Valor |
| --- | --- |
| Porta | `8080`, ou defina `PORT` para bater com o que o provedor espera |
| Caminho de verificação de saúde (health check) | `/health`, se o provedor exigir um |
| Número de cópias | exatamente **uma** |

A última importa mais do que parece. O servidor guarda as salas na própria
memória, então **duas cópias significam duas sessões separadas**: quem digita o
mesmo código da sala cai em cópias diferentes e as pessoas nunca se veem. Nada
avisa sobre isso — simplesmente parece que seus amigos nunca chegaram. Desative
qualquer coisa que adicione cópias automaticamente.

Nenhuma configuração do servidor precisa ser alterada, mas estas são as que
quem hospeda pode definir como variáveis de ambiente:

| Variável | Padrão | O que faz |
| --- | --- | --- |
| `PORT` | `8080` | A porta em que ele escuta |
| `ROOM_TTL_MS` | 6 horas | Por quanto tempo uma sala é mantida depois que a última pessoa sai |
| `LEADER_GRACE_MS` | 60 segundos | Por quanto tempo um líder desconectado continua na liderança, para que uma falha rápida da rede não passe a sala para outra pessoa |
| `HEARTBEAT_MS` | 30 segundos | Com que frequência ele confere se cada conexão continua viva; uma que para de responder é derrubada |
| `GJ_LOG` | ligado | Defina como `0` para silenciar o log de eventos |

## Sobre o Render {/* #about-render */}

O Render é uma empresa terceira, sem vínculo com o projeto. O Gather & Join não
é associado a ele, nem endossado ou patrocinado por ele; o Render é sugerido
aqui porque o plano gratuito dele por acaso serve bem para este servidor, e
nada é recebido por dizer isso. Os preços, os limites do plano gratuito e os
termos são dele e podem mudar, e as capturas de tela acima mostram o produto
como era quando esta página foi escrita — espere que fiquem desatualizadas.

Escolher qualquer provedor de hospedagem tem uma consequência que vale pesar. A
conexão criptografada de cada participante termina na infraestrutura dele, e
não em uma máquina que você controla. Então os nomes de exibição e o código da
sala passam por ela, e o log de eventos do servidor fica no dashboard dele.
Isso não é específico do Render; vale para hospedar qualquer coisa em qualquer
lugar.

Se você preferir que nada fora do seu grupo transporte esses dados, rode o
servidor [no seu computador](./host-on-your-machine.md) ou
[na sua rede local](./host-on-your-network.md), onde eles nunca saem de casa.

## Notas de privacidade para quem hospeda {/* #privacy-notes-for-hosts */}

O servidor imprime no log uma linha por evento de sala (criada, entrou, saiu),
com os nomes de exibição — no Render, na aba **Logs**. Ele não grava nada em
disco. Defina a variável de ambiente `GJ_LOG` como `0` para silenciar o log.
Veja a [política de privacidade](/privacy) para o quadro completo.
