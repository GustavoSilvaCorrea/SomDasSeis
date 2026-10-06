const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'som-da-seis-21' });
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return Number(rank);
}

function score(hand, target = 21) {
  let total = hand.reduce((sum, c) => sum + cardValue(c.rank), 0);
  let aces = hand.filter(c => c.rank === 'A').length;
  while (total > target && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function publicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    currentTurn: room.currentTurn,
    winnerId: room.winnerId,
    message: room.message,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      hand: p.hand,
      score: score(p.hand, p.target),
      stood: p.stood,
      busted: p.busted,
      target: p.target,
      triumphs: p.triumphs
    }))
  };
}

function defaultTriumphs() {
  return [
    { id: 'target24', name: 'Além do Limite', description: 'Seu limite vira 24 nesta rodada.', used: false },
    { id: 'drawPeek', name: 'Instinto', description: 'Olhe a próxima carta antes de decidir comprar.', used: false },
    { id: 'secondChance', name: 'Segunda Chance', description: 'Ao estourar, descarte a última carta comprada uma vez.', used: false }
  ];
}

function emitState(room) {
  io.to(room.code).emit('state', publicState(room));
}

function findPlayer(room, socketId) {
  return room.players.find(p => p.id === socketId);
}

function evaluate(room) {
  const active = room.players.filter(p => !p.busted && !p.stood);
  if (active.length > 0) return;

  room.phase = 'finished';
  const valid = room.players.filter(p => !p.busted);
  if (valid.length === 0) {
    room.winnerId = null;
    room.message = 'Os dois estouraram. Empate.';
    return;
  }

  valid.sort((a, b) => {
    const da = a.target - score(a.hand, a.target);
    const db = b.target - score(b.hand, b.target);
    if (da !== db) return da - db;
    return score(b.hand, b.target) - score(a.hand, a.target);
  });

  const best = valid[0];
  const tied = valid.filter(p => (p.target - score(p.hand, p.target)) === (best.target - score(best.hand, best.target)) && score(p.hand, p.target) === score(best.hand, best.target));
  if (tied.length > 1) {
    room.winnerId = null;
    room.message = 'Empate.';
  } else {
    room.winnerId = best.id;
    room.message = `${best.name} venceu o duelo.`;
  }
}

function advanceTurn(room) {
  const idx = room.players.findIndex(p => p.id === room.currentTurn);
  for (let i = 1; i <= room.players.length; i++) {
    const next = room.players[(idx + i) % room.players.length];
    if (!next.stood && !next.busted) {
      room.currentTurn = next.id;
      return;
    }
  }
  evaluate(room);
}

function startGame(room) {
  room.deck = makeDeck();
  room.phase = 'playing';
  room.winnerId = null;
  room.message = 'Partida iniciada.';
  room.players.forEach(p => {
    p.hand = [room.deck.pop(), room.deck.pop()];
    p.stood = false;
    p.busted = false;
    p.target = 21;
    p.triumphs = defaultTriumphs();
    p.peekedCard = null;
  });
  room.currentTurn = room.players[Math.floor(Math.random() * room.players.length)].id;
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name }) => {
    let code;
    do code = Math.random().toString(36).slice(2, 7).toUpperCase(); while (rooms.has(code));

    const room = {
      code,
      players: [{ id: socket.id, name: String(name || 'Jogador 1').slice(0, 20), hand: [], stood: false, busted: false, target: 21, triumphs: defaultTriumphs() }],
      deck: [],
      phase: 'waiting',
      currentTurn: null,
      winnerId: null,
      message: 'Aguardando o segundo jogador.'
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    emitState(room);
  });

  socket.on('joinRoom', ({ code, name }) => {
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return socket.emit('errorMessage', 'Sala não encontrada.');
    if (room.players.length >= 2) return socket.emit('errorMessage', 'A sala já está cheia.');

    room.players.push({ id: socket.id, name: String(name || 'Jogador 2').slice(0, 20), hand: [], stood: false, busted: false, target: 21, triumphs: defaultTriumphs() });
    socket.join(code);
    socket.data.roomCode = code;
    startGame(room);
    emitState(room);
  });

  socket.on('hit', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'playing' || room.currentTurn !== socket.id) return;
    const player = findPlayer(room, socket.id);
    if (!player || player.stood || player.busted) return;

    const card = room.deck.pop();
    player.hand.push(card);
    player.peekedCard = null;

    if (score(player.hand, player.target) > player.target) {
      const secondChance = player.triumphs.find(t => t.id === 'secondChance' && !t.used);
      if (secondChance) {
        player.hand.pop();
        secondChance.used = true;
        room.message = `${player.name} usou Segunda Chance automaticamente.`;
      } else {
        player.busted = true;
        room.message = `${player.name} estourou.`;
      }
    }
    advanceTurn(room);
    evaluate(room);
    emitState(room);
  });

  socket.on('stand', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'playing' || room.currentTurn !== socket.id) return;
    const player = findPlayer(room, socket.id);
    if (!player) return;
    player.stood = true;
    room.message = `${player.name} parou com ${score(player.hand, player.target)}.`;
    advanceTurn(room);
    evaluate(room);
    emitState(room);
  });

  socket.on('useTriumph', ({ triumphId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'playing' || room.currentTurn !== socket.id) return;
    const player = findPlayer(room, socket.id);
    if (!player) return;
    const triumph = player.triumphs.find(t => t.id === triumphId);
    if (!triumph || triumph.used) return;

    if (triumphId === 'target24') {
      player.target = 24;
      triumph.used = true;
      room.message = `${player.name} aumentou o próprio limite para 24.`;
    } else if (triumphId === 'drawPeek') {
      player.peekedCard = room.deck[room.deck.length - 1] || null;
      triumph.used = true;
      socket.emit('peekResult', player.peekedCard);
      room.message = `${player.name} usou Instinto.`;
    }
    emitState(room);
  });

  socket.on('restart', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.players.length !== 2) return;
    startGame(room);
    emitState(room);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
      rooms.delete(code);
      return;
    }
    room.phase = 'waiting';
    room.currentTurn = null;
    room.winnerId = null;
    room.message = 'O outro jogador saiu. Aguardando novo oponente.';
    emitState(room);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Som da Seis 21 rodando na porta ${PORT}`));
