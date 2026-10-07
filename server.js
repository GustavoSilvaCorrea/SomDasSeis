// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'som-da-seis-21'
  });
});

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const RECONNECT_GRACE_MS = 2 * 60 * 1000;

const SUITS = ['♠', '♥', '♦', '♣'];

const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K'
];

function makeDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank
      });
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [
      deck[i],
      deck[j]
    ] = [
      deck[j],
      deck[i]
    ];
  }

  return deck;
}

function cardValue(rank) {
  if (rank === 'A') {
    return 11;
  }

  if (
    rank === 'J' ||
    rank === 'Q' ||
    rank === 'K'
  ) {
    return 10;
  }

  return Number(rank);
}

function score(hand, target = 21) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    total += cardValue(card.rank);

    if (card.rank === 'A') {
      aces++;
    }
  }

  while (
    total > target &&
    aces > 0
  ) {
    total -= 10;
    aces--;
  }

  return total;
}

function defaultTriumphs() {
  return [
    {
      id: 'target24',
      name: 'Além do Limite',
      description: 'Seu limite vira 24 nesta rodada.',
      used: false
    },

    {
      id: 'drawPeek',
      name: 'Instinto',
      description: 'Olhe a próxima carta antes de decidir comprar.',
      used: false
    },

    {
      id: 'secondChance',
      name: 'Segunda Chance',
      description: 'Ao estourar, descarte a última carta comprada uma vez.',
      used: false
    }
  ];
}

function createPlayer(
  playerId,
  socketId,
  name
) {
  return {
    id: playerId,
    socketId,

    name: String(
      name || 'Jogador'
    ).slice(0, 20),

    connected: true,

    disconnectTimer: null,

    hand: [],

    stood: false,

    busted: false,

    target: 21,

    triumphs: defaultTriumphs(),

    peekedCard: null
  };
}

function publicState(room) {
  return {
    code: room.code,

    phase: room.phase,

    currentTurn: room.currentTurn,

    winnerId: room.winnerId,

    message: room.message,

    allConnected:
      room.players.length === 2 &&
      room.players.every(
        player => player.connected
      ),

    players: room.players.map(
      player => ({
        id: player.id,

        name: player.name,

        connected: player.connected,

        hand: player.hand,

        score: score(
          player.hand,
          player.target
        ),

        stood: player.stood,

        busted: player.busted,

        target: player.target,

        triumphs: player.triumphs
      })
    )
  };
}

function emitState(room) {
  io
    .to(room.code)
    .emit(
      'state',
      publicState(room)
    );
}

function findPlayer(
  room,
  playerId
) {
  return room.players.find(
    player =>
      player.id === playerId
  );
}

function findSocketPlayer(
  room,
  socket
) {
  const player = findPlayer(
    room,
    socket.data.playerId
  );

  if (!player) {
    return null;
  }

  if (
    !player.connected ||
    player.socketId !== socket.id
  ) {
    return null;
  }

  return player;
}

function roomReady(room) {
  return (
    room.players.length === 2 &&
    room.players.every(
      player => player.connected
    )
  );
}

function evaluate(room) {
  const activePlayers =
    room.players.filter(
      player =>
        !player.busted &&
        !player.stood
    );

  if (
    activePlayers.length > 0
  ) {
    return false;
  }

  room.phase = 'finished';

  room.currentTurn = null;

  const validPlayers =
    room.players.filter(
      player => !player.busted
    );

  if (
    validPlayers.length === 0
  ) {
    room.winnerId = null;

    room.message =
      'Os dois estouraram. Empate.';

    return true;
  }

  validPlayers.sort(
    (a, b) => {
      const distanceA =
        a.target -
        score(
          a.hand,
          a.target
        );

      const distanceB =
        b.target -
        score(
          b.hand,
          b.target
        );

      if (
        distanceA !== distanceB
      ) {
        return (
          distanceA -
          distanceB
        );
      }

      return (
        score(
          b.hand,
          b.target
        ) -
        score(
          a.hand,
          a.target
        )
      );
    }
  );

  const best =
    validPlayers[0];

  const bestScore = score(
    best.hand,
    best.target
  );

  const bestDistance =
    best.target -
    bestScore;

  const tied =
    validPlayers.filter(
      player => {
        const playerScore =
          score(
            player.hand,
            player.target
          );

        const distance =
          player.target -
          playerScore;

        return (
          distance === bestDistance &&
          playerScore === bestScore
        );
      }
    );

  if (
    tied.length > 1
  ) {
    room.winnerId = null;

    room.message =
      'Empate.';
  } else {
    room.winnerId =
      best.id;

    room.message =
      `${best.name} venceu o duelo.`;
  }

  return true;
}

function advanceTurn(room) {
  if (
    evaluate(room)
  ) {
    return;
  }

  const currentIndex =
    room.players.findIndex(
      player =>
        player.id ===
        room.currentTurn
    );

  for (
    let i = 1;
    i <= room.players.length;
    i++
  ) {
    const next =
      room.players[
        (
          currentIndex +
          i
        ) %
        room.players.length
      ];

    if (
      !next.stood &&
      !next.busted
    ) {
      room.currentTurn =
        next.id;

      room.message =
        `É a vez de ${next.name}.`;

      return;
    }
  }

  evaluate(room);
}

function startGame(room) {
  room.deck = makeDeck();

  room.phase =
    'playing';

  room.started =
    true;

  room.winnerId =
    null;

  for (
    const player
    of room.players
  ) {
    player.hand = [
      room.deck.pop(),
      room.deck.pop()
    ];

    player.stood =
      false;

    player.busted =
      false;

    player.target =
      21;

    player.triumphs =
      defaultTriumphs();

    player.peekedCard =
      null;
  }

  const randomIndex =
    Math.floor(
      Math.random() *
      room.players.length
    );

  room.currentTurn =
    room.players[
      randomIndex
    ].id;

  const starter =
    findPlayer(
      room,
      room.currentTurn
    );

  room.message =
    `Partida iniciada. É a vez de ${starter.name}.`;
}

function attachPlayerToSocket(
  room,
  player,
  socket
) {
  if (
    player.disconnectTimer
  ) {
    clearTimeout(
      player.disconnectTimer
    );

    player.disconnectTimer =
      null;
  }

  player.socketId =
    socket.id;

  player.connected =
    true;

  socket.data.roomCode =
    room.code;

  socket.data.playerId =
    player.id;

  socket.join(
    room.code
  );
}

function removePlayerAfterGrace(
  room,
  playerId
) {
  const player =
    findPlayer(
      room,
      playerId
    );

  if (
    !player ||
    player.connected
  ) {
    return;
  }

  room.players =
    room.players.filter(
      item =>
        item.id !== playerId
    );

  if (
    room.players.length === 0
  ) {
    rooms.delete(
      room.code
    );

    return;
  }

  const remaining =
    room.players[0];

  remaining.hand = [];

  remaining.stood =
    false;

  remaining.busted =
    false;

  remaining.target =
    21;

  remaining.triumphs =
    defaultTriumphs();

  remaining.peekedCard =
    null;

  room.deck = [];

  room.phase =
    'waiting';

  room.started =
    false;

  room.currentTurn =
    null;

  room.winnerId =
    null;

  room.message =
    'O outro jogador não voltou. Aguardando novo oponente.';

  emitState(room);
}

function normalizePlayerId(
  value
) {
  const id =
    String(
      value || ''
    ).trim();

  if (
    !id ||
    id.length > 100
  ) {
    return null;
  }

  return id;
}

io.on(
  'connection',
  socket => {

    socket.on(
      'createRoom',
      ({
        name,
        playerId
      }) => {

        playerId =
          normalizePlayerId(
            playerId
          );

        if (!playerId) {
          return socket.emit(
            'roomError',
            {
              message:
                'Identificação do jogador inválida.'
            }
          );
        }

        let code;

        do {
          code =
            Math
              .random()
              .toString(36)
              .slice(2, 7)
              .toUpperCase();
        } while (
          rooms.has(code)
        );

        const player =
          createPlayer(
            playerId,
            socket.id,
            name
          );

        const room = {
          code,

          players: [
            player
          ],

          deck: [],

          phase:
            'waiting',

          started:
            false,

          currentTurn:
            null,

          winnerId:
            null,

          message:
            'Aguardando o segundo jogador.'
        };

        rooms.set(
          code,
          room
        );

        attachPlayerToSocket(
          room,
          player,
          socket
        );

        emitState(room);
      }
    );

    socket.on(
      'joinRoom',
      ({
        code,
        name,
        playerId
      }) => {

        code =
          String(
            code || ''
          )
            .toUpperCase()
            .trim();

        playerId =
          normalizePlayerId(
            playerId
          );

        if (!playerId) {
          return socket.emit(
            'roomError',
            {
              message:
                'Identificação do jogador inválida.'
            }
          );
        }

        const room =
          rooms.get(code);

        if (!room) {
          return socket.emit(
            'roomError',
            {
              message:
                'Sala não encontrada. Confira o código ou peça um novo ao anfitrião.'
            }
          );
        }

        const existing =
          findPlayer(
            room,
            playerId
          );

        if (existing) {
          existing.name =
            String(
              name ||
              existing.name ||
              'Jogador'
            ).slice(
              0,
              20
            );

          attachPlayerToSocket(
            room,
            existing,
            socket
          );

          if (
            !room.started &&
            roomReady(room)
          ) {
            startGame(room);
          } else if (
            room.started &&
            room.phase ===
              'playing'
          ) {
            room.message =
              `${existing.name} reconectou. A partida continua.`;
          }

          emitState(room);

          return;
        }

        if (
          room.players.length >= 2
        ) {
          return socket.emit(
            'roomError',
            {
              message:
                'A sala já está cheia.'
            }
          );
        }

        const player =
          createPlayer(
            playerId,
            socket.id,
            name
          );

        room.players.push(
          player
        );

        attachPlayerToSocket(
          room,
          player,
          socket
        );

        if (
          roomReady(room)
        ) {
          startGame(room);
        } else {
          room.message =
            'Oponente entrou. Aguardando o anfitrião reconectar.';
        }

        emitState(room);
      }
    );

    socket.on(
      'reconnectRoom',
      ({
        code,
        playerId,
        name
      }) => {

        code =
          String(
            code || ''
          )
            .toUpperCase()
            .trim();

        playerId =
          normalizePlayerId(
            playerId
          );

        const room =
          rooms.get(code);

        if (
          !room ||
          !playerId
        ) {
          return socket.emit(
            'roomError',
            {
              message:
                'Sua sala anterior não existe mais.',

              forgetRoom:
                true
            }
          );
        }

        const player =
          findPlayer(
            room,
            playerId
          );

        if (!player) {
          return socket.emit(
            'roomError',
            {
              message:
                'Você não faz mais parte dessa sala.',

              forgetRoom:
                true
            }
          );
        }

        if (name) {
          player.name =
            String(
              name
            ).slice(
              0,
              20
            );
        }

        attachPlayerToSocket(
          room,
          player,
          socket
        );

        if (
          !room.started &&
          roomReady(room)
        ) {
          startGame(room);
        } else if (
          room.started &&
          room.phase ===
            'playing' &&
          roomReady(room)
        ) {
          room.message =
            `${player.name} reconectou. A partida continua.`;
        }

        emitState(room);
      }
    );

    socket.on(
      'hit',
      () => {

        const room =
          rooms.get(
            socket.data.roomCode
          );

        if (
          !room ||
          room.phase !==
            'playing' ||
          !roomReady(room)
        ) {
          return;
        }

        if (
          room.currentTurn !==
          socket.data.playerId
        ) {
          return;
        }

        const player =
          findSocketPlayer(
            room,
            socket
          );

        if (
          !player ||
          player.stood ||
          player.busted
        ) {
          return;
        }

        const card =
          room.deck.pop();

        if (!card) {
          return;
        }

        player.hand.push(
          card
        );

        player.peekedCard =
          null;

        const currentScore =
          score(
            player.hand,
            player.target
          );

        if (
          currentScore >
          player.target
        ) {
          const secondChance =
            player.triumphs.find(
              triumph =>
                triumph.id ===
                  'secondChance' &&
                !triumph.used
            );

          if (secondChance) {
            player.hand.pop();

            secondChance.used =
              true;

            room.message =
              `${player.name} usou Segunda Chance automaticamente e continua no turno.`;
          } else {
            player.busted =
              true;

            room.message =
              `${player.name} estourou.`;

            advanceTurn(room);
          }
        } else if (
          currentScore ===
          player.target
        ) {
          player.stood =
            true;

          room.message =
            `${player.name} chegou exatamente a ${player.target}.`;

          advanceTurn(room);
        } else {
          room.message =
            `${player.name} comprou uma carta e continua jogando.`;
        }

        emitState(room);
      }
    );

    socket.on(
      'stand',
      () => {

        const room =
          rooms.get(
            socket.data.roomCode
          );

        if (
          !room ||
          room.phase !==
            'playing' ||
          !roomReady(room)
        ) {
          return;
        }

        if (
          room.currentTurn !==
          socket.data.playerId
        ) {
          return;
        }

        const player =
          findSocketPlayer(
            room,
            socket
          );

        if (
          !player ||
          player.stood ||
          player.busted
        ) {
          return;
        }

        player.stood =
          true;

        room.message =
          `${player.name} parou com ${score(
            player.hand,
            player.target
          )}.`;

        advanceTurn(room);

        emitState(room);
      }
    );

    socket.on(
      'useTriumph',
      ({
        triumphId
      }) => {

        const room =
          rooms.get(
            socket.data.roomCode
          );

        if (
          !room ||
          room.phase !==
            'playing' ||
          !roomReady(room)
        ) {
          return;
        }

        if (
          room.currentTurn !==
          socket.data.playerId
        ) {
          return;
        }

        const player =
          findSocketPlayer(
            room,
            socket
          );

        if (!player) {
          return;
        }

        const triumph =
          player.triumphs.find(
            item =>
              item.id ===
              triumphId
          );

        if (
          !triumph ||
          triumph.used
        ) {
          return;
        }

        if (
          triumphId ===
          'target24'
        ) {
          player.target =
            24;

          triumph.used =
            true;

          room.message =
            `${player.name} aumentou o próprio limite para 24.`;
        }

        if (
          triumphId ===
          'drawPeek'
        ) {
          player.peekedCard =
            room.deck[
              room.deck.length -
              1
            ] || null;

          triumph.used =
            true;

          socket.emit(
            'peekResult',
            player.peekedCard
          );

          room.message =
            `${player.name} usou Instinto.`;
        }

        emitState(room);
      }
    );

    socket.on(
      'restart',
      () => {

        const room =
          rooms.get(
            socket.data.roomCode
          );

        if (
          !room ||
          !roomReady(room) ||
          room.players.length !==
            2
        ) {
          return;
        }

        if (
          !findSocketPlayer(
            room,
            socket
          )
        ) {
          return;
        }

        startGame(room);

        emitState(room);
      }
    );

    socket.on(
      'disconnect',
      () => {

        const room =
          rooms.get(
            socket.data.roomCode
          );

        if (!room) {
          return;
        }

        const player =
          findPlayer(
            room,
            socket.data.playerId
          );

        if (
          !player ||
          player.socketId !==
            socket.id
        ) {
          return;
        }

        player.connected =
          false;

        player.socketId =
          null;

        room.message =
          `${player.name} perdeu a conexão. Aguardando reconexão por até 2 minutos.`;

        emitState(room);

        player.disconnectTimer =
          setTimeout(
            () => {
              removePlayerAfterGrace(
                room,
                player.id
              );
            },
            RECONNECT_GRACE_MS
          );
      }
    );
  }
);

server.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `Som da Seis 21 rodando na porta ${PORT}`
    );
  }
);
