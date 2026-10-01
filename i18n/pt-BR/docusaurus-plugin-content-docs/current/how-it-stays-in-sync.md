---
sidebar_position: 6
title: Como a sincronia funciona
---

# Como a sincronia funciona

O servidor é o relógio. Cada cliente estima a diferença entre o próprio relógio e
o do servidor com cinco idas e voltas de ping/pong, fica com a amostra de menor
latência e repete isso a cada minuto e sempre que uma conexão peer-to-peer é
estabelecida. O líder informa a sua posição a cada cinco segundos enquanto o
vídeo está tocando.

A cada 250 ms, cada cliente compara a própria posição com onde a sala deveria
estar:

| Desvio (drift) | Ação |
|---|---|
| menos de 250 ms | nada |
| de 250 a 1500 ms | um pequeno ajuste na velocidade de reprodução, mantido até o desvio ficar abaixo de 100 ms |
| 1500 ms ou mais | um salto direto para a posição certa |

O ajuste é proporcional ao desvio, entre 3% e 20%, então uma diferença grande se
fecha em segundos, enquanto uma pequena é corrigida sem ninguém perceber.

Os comandos que a sala aplica no seu player são marcados para que os ecos deles
não sejam retransmitidos, e uma ação genuína de outro tipo dentro dessa janela
ainda é propagada.

## Players que a extensão não consegue acessar diretamente {/* #players-the-extension-cannot-touch-directly */}

Na maioria dos sites, a extensão segura o elemento de vídeo da página e lê a
posição dele diretamente. O Google Drive não é assim: ele reproduz o vídeo dentro
de um player incorporado no qual a extensão não tem permissão para entrar, então
ela o controla pela própria interface de mensagens desse player, que informa a
posição cerca de quatro vezes por segundo, e não continuamente.

Entre esses informes, a extensão avança a posição pelo próprio relógio, o que
custa bem menos precisão do que o intervalo sugere. Uma sala no Drive continua
bem dentro das tolerâncias acima, mas fica um pouco mais solta do que uma sala em
um site cujo player pode ser lido diretamente.

Voz e vídeo usam uma malha completa: cada participante se conecta diretamente a
cada um dos outros. Só STUN é usado para encontrar um caminho; não há relay, o que
mantém a mídia fora de qualquer servidor, mas também significa que dois
participantes atrás de NATs muito restritivos podem não conseguir se conectar.
Veja [solução de problemas](/docs/troubleshooting). Uma malha completa também
significa que o upload de cada pessoa cresce com a sala; veja
[quantas pessoas](/docs/watch-together#how-many-people).
