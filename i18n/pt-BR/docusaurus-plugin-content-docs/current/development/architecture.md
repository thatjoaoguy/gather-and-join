---
title: Arquitetura
sidebar_position: 1
---

# Arquitetura

A chamada de voz precisa sobreviver às trocas de episódio, então nada de longa
duração pode viver num contexto que morre na navegação:

| Componente | Tempo de vida | Responsável por |
|---|---|---|
| Content script | morre a cada navegação | vínculo com o `<video>`, eventos locais do player, correção de desvio (drift), a barra lateral da sala |
| Service worker | encerrado pelo Chrome quando ele quiser | detecção de navegação, keep-alive do documento offscreen, proxy de armazenamento, o selo do ícone na barra de ferramentas |
| Documento offscreen | sobrevive a tudo | a `RoomSession` (estado da sala, lógica de reentrada), o WebSocket, cada `RTCPeerConnection`, o microfone, a reprodução do áudio remoto |
| Pop-up | abre e fecha a qualquer momento | criar/entrar, botões de microfone/câmera, lista de peers |
| Servidor | roda continuamente | registro de salas, estado de sincronia oficial, relay de sinalização |

Fatos descobertos durante a construção que dão forma ao código:

- **Particularidades do provedor** (o primeiro adapter, inspecionado ao vivo): o app é
  `play.hbomax.com`, as URLs de exibição são `/video/watch/<uuid>`, `currentTime`
  pula de ponto sem problemas, e o painel de próximo episódio avança sozinho 20 s
  *antes* de o episódio acabar, a menos que a pessoa que está assistindo pressione
  o próprio botão "Cancel autoplay" dele. Em quem não é líder, a extensão pressiona
  esse mesmo controle no lugar da pessoa e esconde o painel de contagem regressiva,
  então a sala fica num só episódio até o líder mudar.
- **A página pode ter mais de um player, e um deles pode ser um anúncio.** No
  YouTube, `querySelector('video')` erra duas vezes: a prévia ao passar o mouse no
  feed inicial é um segundo `.html5-main-video`, e sair de uma página de exibição
  deixa o player real no DOM, com o vídeo ainda anexado, dentro de um
  `ytd-watch-flexy` oculto. Os dois são excluídos restringindo a busca a uma página
  de exibição *visível*. Anúncios são mais difíceis, porque tocam pelo mesmíssimo
  elemento: o adapter informa que não há vídeo nenhum enquanto o player tem
  `ad-showing`, então nada é transmitido e nada é corrigido, e o fim do intervalo
  chega como um re-attach comum — o caminho que já ressincroniza um elemento novo
  com a sala. Nenhuma engrenagem nova, e o anúncio em si não é tocado.
- **A coluna de vídeos relacionados do YouTube fica cortada, e isso é aceito.** A
  barra lateral tira sua largura da página, e o cabeçalho, o player e a coluna do
  próprio vídeo se deslocam, mas a coluna de vídeos relacionados não, e fica
  cortada em cerca de 60px. O YouTube dimensiona essa coluna a partir de `100vh` e
  `window.innerWidth` em vez do contêiner dela —
  `--ytd-watch-flexy-sidebar-width` é um valor em pixels que o próprio script dele
  calcula para a janela inteira — e uma extensão não consegue mudar a largura da
  janela nem fazer o site recalcular para uma mais estreita (um `resize` sintético
  não resolve). Corrigir isso significaria escrever nas variáveis de layout
  privadas do YouTube, que o próximo relayout dele sobrescreve. Deixado de lado de
  propósito.
- **Nem todo player é um `<video>` que dá para alcançar.** O Google Drive não tem
  nenhum `<video>` na página: a reprodução roda num iframe de outra origem em
  `youtube.googleapis.com`, acessível só pelo protocolo postMessage do widget do
  YouTube. `lib/providers/yt-embed-media.ts` encapsula esse protocolo na fatia de
  `HTMLVideoElement` que o resto do código já fala, então o `SyncEngine` não
  precisou de mudança nenhuma. A posição chega como uma amostra enviada a cada
  ~266 ms e, entre uma e outra, é estimada por extrapolação (dead reckoning) a
  partir do relógio local; medida contra o elemento real, essa estimativa fica num
  p95 de ~2 ms (veja `tools/harness/src/embed-drift-probe.ts`), porque o erro vem
  da latência de cada amostra, não do espaçamento entre elas.
- **Um player pode ser um frame num site que a extensão não conhece.** O Wix Video
  é um iframe em `embed.wix.com` dentro de um site de qualquer domínio, então é
  impossível reconhecer o site, e o script do player é injetado em todo frame
  compatível. Depois, `adapterForDocument` só o mantém no documento principal ou,
  para um provedor embutido, num frame que seja ele mesmo uma página de exibição,
  de modo que os outros frames de uma página do YouTube ou da HBO Max ficam vazios.
  Tudo o que supunha que o player era a aba decorre disso: o observador de
  navegação do worker também aceita o frame do player, o pop-up encontra o player
  da aba entre os frames dela, e o frame de um convidado que a sala manda para um
  lugar aonde um frame não pode ir (HBO Max, YouTube) move a aba inteira.
- **Documentos offscreen não têm `chrome.storage`** (só `chrome.runtime`). Tudo o
  que o documento offscreen grava ou lê do armazenamento passa pelo service worker
  (`lib/kv.ts`). O selo da barra de ferramentas segue o mesmo caminho pelo mesmo
  motivo: `chrome.action` também está fora de alcance ali, então o documento
  offscreen informa um estado e o worker o desenha (`lib/badge.ts`).
- **Mídia não atravessa contextos da extensão.** Por isso o áudio remoto toca dentro
  do documento offscreen (é isso que permite à chamada sobreviver à navegação), e o
  *vídeo* remoto é retransmitido para os quadros da página por uma
  `RTCPeerConnection` local de loopback (`lib/loopback-sender.ts` no documento
  offscreen, `lib/sidebar/loopback-receiver.ts` na página).

## Módulos {/* #modules */}

Os entry points só fazem a ligação; o comportamento fica em `apps/extension/lib`,
em classes com colaboradores injetados, então cada uma roda no vitest com fakes
(`apps/extension/test/fakes.ts` tem os substitutos de `RTCPeerConnection`,
`WebSocket` e das trilhas de mídia):

| Módulo | Responsável por | Injetado |
|---|---|---|
| `room-session.ts` | o `Snapshot`, entrada/reentrada/recuperação de erros, ligação da malha, botões de mídia, persistência | cliente, fábrica da malha, mídia local/remota, armazenamento |
| `room-client.ts` | o WebSocket: reconexão/backoff, sincronização de relógio, reentrada | `WebSocket` global |
| `mesh.ts` + `perfect-peer.ts` | uma `RTCPeerConnection` negociada por peer | um callback de envio de sinalização |
| `loopback-sender.ts` / `sidebar/loopback-receiver.ts` | as duas pontas do loopback da página | callbacks de sinalização |
| `sidebar/party-sidebar.ts` | compõe `SidebarView` (DOM), `PageLayout` (abrir espaço), `LoopbackReceiver`, `EpisodeStartControl` | a porta, o localizador de vídeo do provedor |
| `sidebar/episode-start.ts` | o aviso de "cópias diferentes": a proposta, os lembretes, alinhar e limpar | um callback de envio |
| `sidebar/settings-panel.ts` + `settings-model.ts` | o popover de configurações da sala, aberto pela engrenagem, e o que ele mostra | as ações da barra lateral |
| `room-labels.ts` | como o estado da conexão, do servidor e da câmera é escrito, compartilhado pelo pop-up e pelo painel de configurações | — |
| `copy-tracker.ts` | a duração da cópia desta página, mantida entre trocas de elemento e trechos de anúncio | um callback de relatório |
| `participants.ts` | a única derivação de "quem está na sala", usada pelo pop-up e pela barra lateral | — |
| `badge.ts` | o ponto na barra de ferramentas: qual estado o snapshot representa e o círculo desenhado no ícone para ele | uma fatia de `chrome.action`, um canvas |
| `player-access.ts` | quais serviços o usuário autorizou, o script do player registrado exatamente para esses, e as páginas abertas quando uma autorização ou revogação acontece | `chrome.permissions`, `chrome.scripting`, buscas de abas e frames |
| `setup-state.ts` | a única derivação de "o que ainda falta configurar" — microfone, câmera, endereço — compartilhada pela primeira execução do pop-up e pela página de configuração | — |
| `sync-engine.ts`, `video-binding.ts`, `ducking.ts`, `up-next.ts` | comportamento de reprodução por página | um localizador de vídeo, callbacks |

## Provedores de streaming {/* #streaming-providers */}

O conhecimento sobre cada provedor é dividido em dois, ambos indexados pelo id do
provedor:

- `packages/shared/src/providers.ts` — nível de URL (hosts, extração do id do
  conteúdo, URLs de exibição). Também é importado pelo servidor, então não depende
  do DOM. As permissões de host opcionais do manifest, os `matches` do script do
  player e o filtro de navegação do service worker são todos derivados dele.
- `apps/extension/lib/providers/` — nível de DOM (`PlayerAdapter`: como encontrar o
  `<video>`, os seletores do painel de próximo episódio e se o player é `embedded`,
  um widget que outros sites colocam num iframe, como o Wix Video).

Adicionar um provedor significa uma entrada em cada um e um novo build; nenhuma
outra parte sabe em qual provedor está rodando. Cada serviço é uma permissão de
host opcional que o usuário concede pelo pop-up na primeira vez que assiste nele,
então o manifest não tem hosts obrigatórios nem entrada `content_scripts` para o
player: o service worker registra o script em tempo de execução para os serviços
autorizados (`lib/player-access.ts`). Por isso, adicionar um serviço não pede nada
aos usuários atuais até que eles o usem. O content script de um provedor embutido
roda no frame do widget dele, e um frame só recebe um player quando é ele mesmo
uma página de exibição de um provedor embutido (`adapterForDocument`).
