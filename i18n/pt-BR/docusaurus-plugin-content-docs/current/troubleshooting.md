---
sidebar_position: 7
title: Solução de problemas
---

# Solução de problemas

## "Can't reach the server" {/* #cant-reach-the-server */}

- Pergunte a quem hospeda se o servidor ainda está rodando e, no caso de um
  túnel a partir de um notebook, se o endereço mudou. O endereço de um túnel é
  novo a cada execução.
- Quem hospeda pode conferir no navegador: o mesmo endereço, com `https://` no
  lugar de `wss://`, responde "running" e mostra quantas pessoas estão
  conectadas. Se nada aparecer, o problema é o próprio servidor, não a extensão.
- O endereço deve começar com `wss://`. Um endereço `ws://` com um IP local só
  funciona para quem está na mesma rede de quem hospeda; os demais precisam de
  um servidor [no Render](/docs/host-a-server) ou [atrás de um
  túnel](/docs/host-on-your-machine).
- Em uma configuração na mesma rede, confira se quem hospeda liberou o servidor
  no firewall e se ninguém está em uma rede de convidados.

## Ninguém me ouve {/* #nobody-can-hear-me */}

- Abra a página de configuração e confira se o microfone aparece como
  permitido. Tanto as configurações de site do próprio Chrome para a extensão
  quanto as configurações de privacidade do sistema podem bloqueá-lo.
- Use fones de ouvido. Com alto-falantes, o cancelamento de eco remove a sua
  voz junto com o som do programa.

## A voz de uma pessoa nunca conecta {/* #one-persons-voice-never-connects */}

Dois participantes atrás de NATs muito restritivos podem não encontrar um
caminho direto, porque a extensão não usa servidor de retransmissão (relay).
Uma VPN ou uma rede overlay entre os dois costuma resolver. O restante da sala
não é afetado.

## A sala fica pausando {/* #the-room-keeps-pausing */}

Alguém está com o vídeo carregando (buffering). O pop-up mostra quem é. O
problema é a conexão dessa pessoa com o serviço de streaming, não a sala.

## O Google Drive diz "Unable to load video" {/* #google-drive-says-unable-to-load-video */}

Você está conectado a várias contas do Google e o link abriu na conta errada —
um link do Drive que não indica a conta sempre abre na primeira. Abra
diretamente a URL do próprio arquivo ou troque de conta na página do Drive.
É também por isso que o botão **Go to episode** do pop-up pode errar no Drive:
a ordem das contas é diferente em cada computador, então nenhum link único
serve para todo mundo da sala.

Se trocar de conta não resolver, talvez o arquivo simplesmente não tenha sido
compartilhado com você. Peça a quem criou a sala para compartilhá-lo; acesso
de leitor já basta.

## "You can't view or download this file at this time" {/* #you-cant-view-or-download-this-file-at-this-time */}

Esse é o limite do próprio Google Drive para quantas pessoas podem assistir a
um mesmo arquivo ao mesmo tempo; não é a extensão nem a sua conexão. Ele passa
sozinho. Câmeras, voz e a própria sala não são afetadas — só o vídeo.

## Perdemos a sincronia durante os anúncios {/* #we-drift-during-ads */}

É esperado em planos com anúncios. A sala volta a se sincronizar depois do
intervalo.

## Como relatar um bug {/* #reporting-a-bug */}

Abra a página de configuração, expanda **Diagnostics** e pressione
**Copy diagnostics**. Cole isso em um relato de bug. O conteúdo inclui os nomes
de exibição e o host do servidor, mas nenhuma mídia, nada do serviço de
streaming e nada do seu Drive além do identificador do arquivo que já está no
endereço da página.
