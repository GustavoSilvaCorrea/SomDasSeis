# Som da Seis - Duelo 21

Protótipo multiplayer online para o RPG Som da Seis.

## O que já existe
- 2 jogadores por sala
- Código de sala
- Turnos sincronizados em tempo real via Socket.IO
- Baralho e regras processados no servidor
- Comprar carta e parar
- Ás valendo 11 ou 1 automaticamente considerando o limite atual do jogador
- Vitória/empate
- Reiniciar partida
- Layout responsivo para celular
- Triunfos locais temporários:
  - Além do Limite: limite 24
  - Instinto: olha a próxima carta
  - Segunda Chance: desfaz automaticamente uma compra que estouraria

## Rodar localmente
```bash
npm install
npm start
```
Abra `http://localhost:3000`.

## Publicar no Render
O projeto inclui `render.yaml` e endpoint `/health`.

1. Crie um repositório no GitHub e envie estes arquivos.
2. No Render, escolha **New > Blueprint** (ou Web Service) e conecte o repositório.
3. Se usar Blueprint, o `render.yaml` configura build e start automaticamente.
4. Aguarde o deploy. O Render fornece uma URL pública `https://...onrender.com`.
5. Qualquer celular ou computador pode abrir a URL, criar uma sala e compartilhar o código.

Se configurar manualmente como Web Service:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/health`

## Arquitetura atual
As salas ficam na memória do processo Node.js. É suficiente para o protótipo e para um único servidor, mas reiniciar/reimplantar o serviço encerra as salas abertas. Para produção e escala com várias instâncias, migre estado de salas/sessões para Redis ou outro armazenamento compartilhado.

## Próxima integração com ficha
Substituir `defaultTriumphs()` por uma busca do personagem autenticado no banco de dados, retornando apenas os triunfos possuídos pela ficha.
