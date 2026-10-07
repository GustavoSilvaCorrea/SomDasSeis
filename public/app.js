// public/app.js

const socket = io();

const lobby =
  document.querySelector(
    '#lobby'
  );

const game =
  document.querySelector(
    '#game'
  );

const nameInput =
  document.querySelector(
    '#name'
  );

const codeInput =
  document.querySelector(
    '#roomCode'
  );

const createBtn =
  document.querySelector(
    '#createBtn'
  );

const joinBtn =
  document.querySelector(
    '#joinBtn'
  );

const errorBox =
  document.querySelector(
    '#error'
  );

const codeLabel =
  document.querySelector(
    '#codeLabel'
  );

const copyCode =
  document.querySelector(
    '#copyCode'
  );

const statusText =
  document.querySelector(
    '#statusText'
  );

const playersEl =
  document.querySelector(
    '#players'
  );

const triumphsEl =
  document.querySelector(
    '#triumphs'
  );

const hitBtn =
  document.querySelector(
    '#hitBtn'
  );

const standBtn =
  document.querySelector(
    '#standBtn'
  );

const restartBtn =
  document.querySelector(
    '#restartBtn'
  );

const peekToast =
  document.querySelector(
    '#peekToast'
  );

const PLAYER_ID_KEY =
  'somDaSeis21.playerId';

const ROOM_CODE_KEY =
  'somDaSeis21.roomCode';

const PLAYER_NAME_KEY =
  'somDaSeis21.playerName';

let state = null;

let currentRoomCode =
  localStorage.getItem(
    ROOM_CODE_KEY
  ) || '';

let playerId =
  localStorage.getItem(
    PLAYER_ID_KEY
  );

if (!playerId) {
  if (
    typeof crypto !==
      'undefined' &&
    crypto.randomUUID
  ) {
    playerId =
      crypto.randomUUID();
  } else {
    playerId =
      `player-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
  }

  localStorage.setItem(
    PLAYER_ID_KEY,
    playerId
  );
}

const savedName =
  localStorage.getItem(
    PLAYER_NAME_KEY
  );

if (savedName) {
  nameInput.value =
    savedName;
}

createBtn.addEventListener(
  'click',
  () => {
    rememberName();

    errorBox.textContent =
      '';

    socket.emit(
      'createRoom',
      {
        name:
          playerName(),

        playerId
      }
    );
  }
);

joinBtn.addEventListener(
  'click',
  () => {
    rememberName();

    errorBox.textContent =
      '';

    socket.emit(
      'joinRoom',
      {
        code:
          codeInput.value,

        name:
          playerName(),

        playerId
      }
    );
  }
);

hitBtn.addEventListener(
  'click',
  () => {
    socket.emit('hit');
  }
);

standBtn.addEventListener(
  'click',
  () => {
    socket.emit('stand');
  }
);

restartBtn.addEventListener(
  'click',
  () => {
    socket.emit(
      'restart'
    );
  }
);

codeInput.addEventListener(
  'input',
  () => {
    codeInput.value =
      codeInput.value
        .toUpperCase()
        .replace(
          /[^A-Z0-9]/g,
          ''
        )
        .slice(
          0,
          5
        );
  }
);

copyCode.addEventListener(
  'click',
  async () => {
    if (
      !state?.code
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        state.code
      );

      showToast(
        `Código ${state.code} copiado.`
      );
    } catch {
      showToast(
        `Código da sala: ${state.code}`
      );
    }
  }
);

socket.on(
  'connect',
  () => {
    if (
      currentRoomCode
    ) {
      socket.emit(
        'reconnectRoom',
        {
          code:
            currentRoomCode,

          playerId,

          name:
            playerName()
        }
      );
    }
  }
);

socket.on(
  'disconnect',
  () => {
    hitBtn.disabled =
      true;

    standBtn.disabled =
      true;

    if (state) {
      statusText.textContent =
        'Conexão perdida. Reconectando...';
    }
  }
);

socket.on(
  'roomError',
  payload => {
    const message =
      typeof payload ===
      'string'
        ? payload
        : payload?.message;

    errorBox.textContent =
      message ||
      'Não foi possível entrar na sala.';

    if (
      payload?.forgetRoom
    ) {
      currentRoomCode =
        '';

      localStorage.removeItem(
        ROOM_CODE_KEY
      );

      state =
        null;

      game.classList.add(
        'hidden'
      );

      lobby.classList.remove(
        'hidden'
      );
    }
  }
);

socket.on(
  'errorMessage',
  message => {
    errorBox.textContent =
      message;
  }
);

socket.on(
  'peekResult',
  card => {
    if (!card) {
      return;
    }

    showToast(
      `A próxima carta é ${card.rank}${card.suit}`
    );
  }
);

socket.on(
  'state',
  next => {
    state =
      next;

    currentRoomCode =
      next.code;

    localStorage.setItem(
      ROOM_CODE_KEY,
      next.code
    );

    lobby.classList.add(
      'hidden'
    );

    game.classList.remove(
      'hidden'
    );

    render();
  }
);

function playerName() {
  return (
    nameInput.value.trim() ||
    localStorage.getItem(
      PLAYER_NAME_KEY
    ) ||
    'Jogador'
  );
}

function rememberName() {
  localStorage.setItem(
    PLAYER_NAME_KEY,
    playerName()
  );
}

function render() {
  if (!state) {
    return;
  }

  codeLabel.textContent =
    state.code;

  statusText.textContent =
    state.message || '';

  playersEl.innerHTML =
    '';

  state.players.forEach(
    player => {
      const card =
        document.createElement(
          'article'
        );

      const isMe =
        player.id ===
        playerId;

      const active =
        state.currentTurn ===
          player.id &&
        state.phase ===
          'playing';

      card.className =
        `player-card ${isMe ? 'me' : ''} ${active ? 'active' : ''}`;

      card.innerHTML = `
        <div class="player-head">

          <div>

            <div class="player-name">
              ${escapeHtml(player.name)}
              ${isMe ? '(você)' : ''}
            </div>

            <div class="meta">
              Limite atual:
              ${player.target}
            </div>

          </div>

          <div class="score">
            ${player.score}
          </div>

        </div>

        <div class="hand">

          ${player.hand
            .map(
              renderCard
            )
            .join('')}

        </div>

        ${statusBadge(
          player,
          active
        )}
      `;

      playersEl.appendChild(
        card
      );
    }
  );

  const me =
    state.players.find(
      player =>
        player.id ===
        playerId
    );

  triumphsEl.innerHTML =
    '';

  if (me) {
    me.triumphs.forEach(
      triumph => {
        const button =
          document.createElement(
            'button'
          );

        button.className =
          `triumph ${triumph.used ? 'used' : ''}`;

        button.disabled =
          triumph.used ||
          !canAct();

        button.innerHTML = `
          <strong>
            ${escapeHtml(
              triumph.name
            )}
          </strong>

          <span>
            ${escapeHtml(
              triumph.description
            )}
          </span>
        `;

        button.addEventListener(
          'click',
          () => {
            socket.emit(
              'useTriumph',
              {
                triumphId:
                  triumph.id
              }
            );
          }
        );

        triumphsEl.appendChild(
          button
        );
      }
    );
  }

  const actionAllowed =
    canAct();

  hitBtn.disabled =
    !actionAllowed;

  standBtn.disabled =
    !actionAllowed;

  restartBtn.classList.toggle(
    'hidden',
    state.phase !==
      'finished'
  );

  restartBtn.disabled =
    !state.allConnected ||
    !socket.connected;

  hitBtn.classList.toggle(
    'hidden',
    state.phase ===
      'finished'
  );

  standBtn.classList.toggle(
    'hidden',
    state.phase ===
      'finished'
  );
}

function canAct() {
  return Boolean(
    state &&
    socket.connected &&
    state.allConnected &&
    state.phase ===
      'playing' &&
    state.currentTurn ===
      playerId
  );
}

function statusBadge(
  player,
  active
) {
  if (
    !player.connected
  ) {
    return `
      <span class="badge danger">
        Desconectado
      </span>
    `;
  }

  if (
    player.busted
  ) {
    return `
      <span class="badge danger">
        Estourou
      </span>
    `;
  }

  if (
    player.stood
  ) {
    return `
      <span class="badge">
        Parou
      </span>
    `;
  }

  if (active) {
    return `
      <span class="badge">
        Turno atual
      </span>
    `;
  }

  return '';
}

function renderCard(
  card
) {
  const red =
    card.suit === '♥' ||
    card.suit === '♦';

  return `
    <div class="card ${red ? 'red' : ''}">

      <span>
        ${card.rank}
      </span>

      <span class="suit">
        ${card.suit}
      </span>

    </div>
  `;
}

function showToast(
  message
) {
  peekToast.textContent =
    message;

  peekToast.classList.remove(
    'hidden'
  );

  setTimeout(
    () => {
      peekToast.classList.add(
        'hidden'
      );
    },
    2600
  );
}

function escapeHtml(
  value
) {
  return String(
    value
  ).replace(
    /[&<>'"]/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char])
  );
}
