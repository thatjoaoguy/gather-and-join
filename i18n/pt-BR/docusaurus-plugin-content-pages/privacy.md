---
title: Política de privacidade
description: Todos os dados que o Gather & Join trata, e quem tem acesso a eles.
---

# Política de privacidade do Gather & Join

Última atualização: 2026-09-30

Esta é uma tradução da [versão original em inglês](pathname:///privacy). Se houver qualquer diferença entre as duas, vale a versão em inglês.

O Gather & Join é uma extensão de navegador que mantém um grupo em sincronia
enquanto todos assistem juntos a um serviço de streaming, a um arquivo de vídeo
no Google Drive ou aos vídeos de um site Wix, e acrescenta uma chamada de voz
entre eles. Esta página descreve todos os dados que a extensão trata.

## Quem opera o quê {/* #who-operates-what */}

A extensão roda no seu computador. O **servidor de sinalização** com o qual ela
se comunica é de código aberto e é executado por você ou por alguém do seu
grupo, em um endereço que essa pessoa escolhe e compartilha com você. O
desenvolvedor desta extensão não opera nenhum servidor, não recebe nenhum dos
dados descritos abaixo e não tem acesso a eles. A pessoa que hospeda o servidor
é responsável por ele.

Essa pessoa pode executá-lo no próprio computador ou na infraestrutura de uma
empresa de hospedagem. Se ela usar uma empresa de hospedagem, a conexão
criptografada termina nessa empresa, e não em uma máquina que pertence a ela;
portanto, os dados abaixo passam pela empresa, e o log de eventos do servidor
fica visível no painel dessa empresa. Qual empresa, se houver alguma, é escolha
de quem hospeda — pergunte a essa pessoa se isso for importante para você. Este
projeto não é afiliado a nenhum provedor de hospedagem que ele mencione.

## Dados enviados ao servidor de sinalização {/* #data-sent-to-the-signaling-server */}

Quando você cria uma sala ou entra em uma, a extensão envia ao servidor:

- o **nome de exibição** que você digitou,
- o **código da sala**,
- um **identificador do episódio ou do arquivo** que a sala está assistindo
  (obtido do endereço da página, nunca o próprio vídeo),
- a duração da **sua cópia** dele, já que algumas regiões recebem uma cópia mais
  longa, com extras no início, e, quando as cópias são diferentes, **quanto da
  mais longa deve ser pulado**, conforme definido por alguém da sala,
- eventos de **play, pausa e posição**, e avisos de travamento,
- as mensagens de configuração de conexão necessárias para alcançar os outros
  participantes.

O servidor mantém esses dados apenas na memória, somente enquanto a sala
existir, e não grava nada em disco. Ele imprime um log de eventos, uma linha por
evento (sala criada, alguém entrou, alguém saiu), no terminal de quem o executa.
Esse log não contém eventos de play, pausa ou de avançar e voltar; ele registra
o episódio, o ponto em que a reprodução de alguém travou e quanto uma cópia
mais longa pula.

## Voz e vídeo {/* #voice-and-video */}

Seu **microfone** e, somente se você a ativar, sua **câmera** são enviados
**diretamente às outras pessoas da sua sala**. Eles nunca passam pelo servidor
de sinalização nem por qualquer outro servidor, e nada é gravado. O microfone
fica ligado por padrão quando você entra e pode ser silenciado; a câmera fica
desligada, a menos que você a ative.

## Endereços de rede {/* #network-addresses */}

Como a chamada é direta, **o endereço IP de cada participante fica visível para
os outros participantes** da sala, como em qualquer chamada peer-to-peer.

Para estabelecer essas conexões diretas, a extensão consulta um servidor STUN
para descobrir o seu endereço público. O padrão é o servidor STUN público do
Google (`stun.l.google.com`), que recebe o seu endereço IP e nada mais, nos
termos da [Política de Privacidade do Google](https://policies.google.com/privacy).
Nenhum servidor de retransmissão (TURN) é usado, então a mídia nunca é roteada
por terceiros.

## Dados armazenados no seu navegador {/* #data-stored-in-your-browser */}

O endereço do servidor, o seu nome de exibição e as suas configurações ficam
guardados no armazenamento local da extensão, no seu dispositivo. Nada é
sincronizado pela sua Conta do Google. Um pequeno log de diagnóstico (eventos de
conexão, correções de sincronia) é mantido no armazenamento da sessão para a
solução de problemas e é apagado quando o Chrome é fechado; ele só é
compartilhado se você pressionar **Copy diagnostics** na página de configuração
e colá-lo em algum lugar por conta própria.

## O que não é coletado {/* #what-is-not-collected */}

Nenhum histórico de navegação, nenhuma credencial de conta, nenhum dado de
pagamento, nenhuma análise de uso (analytics), nenhuma telemetria, nenhum
relatório de falhas, nenhuma gravação de áudio ou vídeo, nenhum conteúdo do
serviço de streaming. A extensão não carrega nenhum código remoto. Ela lê
apenas as páginas dos serviços compatíveis, e somente para controlar o player.

No Google Drive, especificamente: nenhum conteúdo de arquivo, nenhum nome de
arquivo, nenhuma listagem de pastas e nada mais do seu Drive. A única coisa que
a extensão obtém de uma página do Drive é o identificador do arquivo que já
aparece na barra de endereço, que ela compartilha com a sala para que todos
abram o mesmo arquivo.

Em sites Wix, especificamente: a extensão roda apenas dentro do player de vídeo
do site, que o Wix serve a partir de `embed.wix.com`, e nunca nas próprias
páginas do site. A única coisa que ela obtém desse player é o identificador do
vídeo no endereço do player, que ela compartilha com a sala junto com esse
endereço para que todos abram o mesmo vídeo.

## Permissões {/* #permissions */}

A extensão pede ao Chrome: acesso aos sites compatíveis (para controlar o
player e desenhar a faixa de participantes), URLs das abas (para saber qual
episódio ou arquivo está aberto e levar você ao da sala), eventos de navegação
(para acompanhar as mudanças de episódio), execução de scripts (para rodar
apenas nos serviços que você permitiu, inclusive em abas que já estavam abertas
quando você permitiu um deles), um documento offscreen (para manter a chamada
ativa durante as mudanças de página) e armazenamento local (para as suas
configurações).

O acesso a sites é concedido por serviço, e somente quando você permite: a
extensão não tem acesso a nenhum site quando é instalada, pede acesso a cada
serviço na primeira vez que você assiste nele e lista esses serviços na página
de configuração, onde você pode revogar qualquer um deles. No Drive, o acesso é
deliberadamente restrito: apenas o visualizador de arquivos em
`drive.google.com/file/...`. A extensão não roda no Meu Drive, nos Documentos
Google, nas Planilhas Google nem no seletor de arquivos, e não tem acesso a
eles. Em sites Wix, o acesso é somente ao player de vídeo em
`embed.wix.com/video`: a extensão não tem acesso ao site que o exibe, qualquer
que seja o endereço dele.

## Retenção e exclusão {/* #retention-and-deletion */}

Os dados no servidor desaparecem quando a sala é encerrada. As configurações
locais permanecem até que você as apague na página de configuração ou
desinstale a extensão, o que remove tudo.

## Alterações {/* #changes */}

Se essas práticas mudarem, esta página e a página da extensão na loja são
atualizadas antes de a mudança ser lançada, e a mudança é registrada no
changelog do projeto.

## Contato {/* #contact */}

Use o e-mail de contato exibido na página da extensão na Chrome Web Store ou
abra uma issue no repositório do projeto.
