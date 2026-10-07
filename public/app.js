/*
 * SOM DA SEIS · DUELO 21
 * Só interface: o servidor continua decidindo cartas, turnos e triunfos.
 */
const socket = io();
const $ = selector => document.querySelector(selector);

const lobby = $('#lobby');
const game = $('#game');
const nameInput = $('#name');
const codeInput = $('#roomCode');
const createBtn = $('#createBtn');
const joinBtn = $('#joinBtn');
const errorBox = $('#error');
const codeLabel = $('#codeLabel');
const copyCode = $('#copyCode');
const soundToggle = $('#soundToggle');
const statusText = $('#statusText');
const myNewsStack = $('#myNewsStack');
const enemyNewsStack = $('#enemyNewsStack');
const playersEl = $('#players');
const triumphsEl = $('#triumphs');
const drawDeck = $('#drawDeck');
const deckHint = $('#deckHint');
const standBtn = $('#standBtn');
const restartBtn = $('#restartBtn');
const peekToast = $('#peekToast');
const triumphDialog = $('#triumphDialog');
const triumphTitle = $('#triumphTitle');
const triumphDescription = $('#triumphDescription');
const useTriumphBtn = $('#useTriumph');
const closeTriumphBtn = $('#closeTriumph');

const PLAYER_ID_KEY = 'somDaSeis21.playerId';
const ROOM_CODE_KEY = 'somDaSeis21.roomCode';
const PLAYER_NAME_KEY = 'somDaSeis21.playerName';
const SOUND_KEY = 'somDaSeis21.soundEnabled';

let state = null;
let newsMemory = emptyNewsMemory();
let newsSerial = 0;
const lastPaintedNews = { mine: 0, enemy: 0 };
let currentRoomCode = localStorage.getItem(ROOM_CODE_KEY) || '';
let playerId = localStorage.getItem(PLAYER_ID_KEY);
let soundEnabled = localStorage.getItem(SOUND_KEY) !== 'false';
let audioContext = null;
let toastTimer = null;
let selectedTriumphId = null;
let flightVersion = 0;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const touchInterface = window.matchMedia('(hover: none), (pointer: coarse)');

if (!playerId) {
  playerId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(PLAYER_ID_KEY, playerId);
}
nameInput.value = localStorage.getItem(PLAYER_NAME_KEY) || '';
updateSoundToggle();

/* Sons sintetizados localmente; nenhum arquivo de áudio é necessário. */
function unlockAudio() {
  if (!soundEnabled) return null;
  try {
    if (!audioContext) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return null;
      audioContext = new Audio();
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  } catch (_) { return null; }
}

function playCardSound() {
  const ctx = audioContext;
  if (!soundEnabled || !ctx || ctx.state !== 'running' || document.hidden) return;
  const now = ctx.currentTime;
  const length = Math.floor(ctx.sampleRate * .15);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const progress = i / length;
    samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 1.5);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1900, now);
  filter.frequency.exponentialRampToValueAtTime(850, now + .13);
  filter.Q.value = .66;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.19, now + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .14);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(now);
  source.stop(now + .15);

  const thud = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(210, now + .065);
  thud.frequency.exponentialRampToValueAtTime(95, now + .12);
  thudGain.gain.setValueAtTime(.0001, now + .065);
  thudGain.gain.exponentialRampToValueAtTime(.07, now + .075);
  thudGain.gain.exponentialRampToValueAtTime(.0001, now + .14);
  thud.connect(thudGain).connect(ctx.destination);
  thud.start(now + .065);
  thud.stop(now + .145);
}

function playCoinSound() {
  const ctx = audioContext;
  if (!soundEnabled || !ctx || ctx.state !== 'running' || document.hidden) return;
  const now = ctx.currentTime;
  // Três frequências não harmônicas criam o som de uma moeda metálica.
  [910, 1468, 2214].forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = index === 0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * .985, now + .28);
    const volume = [.09, .056, .028][index];
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, now + [.38, .28, .19][index]);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + .42);
  });
  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = 'triangle';
  click.frequency.setValueAtTime(510, now);
  click.frequency.exponentialRampToValueAtTime(195, now + .046);
  clickGain.gain.setValueAtTime(.06, now);
  clickGain.gain.exponentialRampToValueAtTime(.0001, now + .05);
  click.connect(clickGain).connect(ctx.destination);
  click.start(now);
  click.stop(now + .052);
}

function updateSoundToggle() {
  soundToggle.classList.toggle('is-muted', !soundEnabled);
  soundToggle.setAttribute('aria-pressed', String(soundEnabled));
  soundToggle.setAttribute('aria-label', soundEnabled ? 'Silenciar sons' : 'Ativar sons');
  soundToggle.innerHTML = soundEnabled
    ? '<span aria-hidden="true">♫</span> <span>Som ligado</span>'
    : '<span aria-hidden="true">♪</span> <span>Som desligado</span>';
}
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem(SOUND_KEY, String(soundEnabled));
  updateSoundToggle();
  if (soundEnabled) { unlockAudio(); playCoinSound(); }
});

function playerName() {
  return nameInput.value.trim() || localStorage.getItem(PLAYER_NAME_KEY) || 'Jogador';
}
function rememberName() { localStorage.setItem(PLAYER_NAME_KEY, playerName()); }
createBtn.addEventListener('click', () => {
  unlockAudio(); rememberName(); errorBox.textContent = '';
  socket.emit('createRoom', { name: playerName(), playerId });
});
joinBtn.addEventListener('click', () => {
  unlockAudio(); rememberName(); errorBox.textContent = '';
  socket.emit('joinRoom', { code: codeInput.value, name: playerName(), playerId });
});
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
});
drawDeck.addEventListener('click', () => {
  if (!canAct()) return;
  unlockAudio();
  socket.emit('hit');
});
standBtn.addEventListener('click', () => {
  if (!canAct()) return;
  unlockAudio(); socket.emit('stand');
});
restartBtn.addEventListener('click', () => {
  unlockAudio(); socket.emit('restart');
});
copyCode.addEventListener('click', async () => {
  if (!state?.code) return;
  try {
    await navigator.clipboard.writeText(state.code);
    showToast(`Código ${state.code} copiado!`);
  } catch (_) { showToast(`Código da mesa: ${state.code}`); }
});

socket.on('connect', () => {
  if (currentRoomCode) socket.emit('reconnectRoom', { code: currentRoomCode, playerId, name: playerName() });
});
socket.on('disconnect', () => {
  drawDeck.disabled = true;
  standBtn.disabled = true;
  if (state) statusText.textContent = 'Conexão perdida. Reconectando à mesa...';
});
socket.on('roomError', payload => {
  const message = typeof payload === 'string' ? payload : payload?.message;
  errorBox.textContent = message || 'Não foi possível entrar nessa mesa.';
  if (state) showToast(errorBox.textContent);
  if (payload?.forgetRoom) {
    currentRoomCode = '';
    localStorage.removeItem(ROOM_CODE_KEY);
    state = null;
    resetNewsStacks();
    game.classList.add('hidden');
    lobby.classList.remove('hidden');
  }
});
socket.on('errorMessage', message => {
  errorBox.textContent = message;
  if (state) showToast(message);
});
socket.on('peekResult', card => {
  if (card) showToast(`Instinto: a próxima carta é ${card.rank}${card.suit}`);
});

/* Detecta as cartas novas, sem duplicar animação ao trocar de turno ou usar um triunfo. */
function detectNewCards(previous, next) {
  const result = new Map();
  const oldById = new Map((previous?.players || []).map(p => [p.id, p]));
  const newRound = !previous || previous.code !== next.code ||
    (previous.phase !== 'playing' && next.phase === 'playing');
  for (const player of next.players) {
    const oldHand = oldById.get(player.id)?.hand || [];
    const hand = player.hand || [];
    const replaced = oldHand.length === hand.length && hand.length > 0 &&
      hand.some((card, i) => card.rank !== oldHand[i]?.rank || card.suit !== oldHand[i]?.suit);
    const start = newRound || replaced || hand.length < oldHand.length ? 0 : oldHand.length;
    const added = new Set();
    if (next.phase === 'playing' || next.phase === 'finished') {
      for (let i = start; i < hand.length; i++) added.add(i);
    }
    result.set(player.id, added);
  }
  return result;
}

function detectSpentCoins(previous, next) {
  if (!previous || previous.code !== next.code) return [];
  const old = previous.players.find(p => p.id === playerId);
  const fresh = next.players.find(p => p.id === playerId);
  if (!old || !fresh) return [];
  return fresh.triumphs
    .filter(t => t.used && old.triumphs.some(t0 => t0.id === t.id && !t0.used))
    .map(t => t.id);
}

socket.on('state', next => {
  const previous = state;
  const freshCards = detectNewCards(state, next);
  const spentCoins = detectSpentCoins(state, next);
  const secondChance = Boolean(state && state.message !== next.message &&
    /Segunda Chance automaticamente/.test(next.message || ''));
  updateNewsBoard(previous, next);
  state = next;
  currentRoomCode = next.code;
  localStorage.setItem(ROOM_CODE_KEY, next.code);
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  render(spentCoins);
  animateNewCards(freshCards);
  if (secondChance) playCardSound();
  if (spentCoins.length) playCoinSound();
});

function canAct() {
  return Boolean(state && socket.connected && state.allConnected &&
    state.phase === 'playing' && state.currentTurn === playerId);
}

function render(spentCoins = []) {
  if (!state) return;
  codeLabel.textContent = state.code;
  statusText.textContent = newsBannerText(state);
  const myself = state.players.find(p => p.id === playerId);
  const opponent = state.players.find(p => p.id !== playerId);
  playersEl.innerHTML =
    renderSeat(opponent || null, 'opponent') +
    renderSeat(myself || null, 'self');
  renderCoins(myself, spentCoins);

  const available = canAct();
  drawDeck.disabled = !available;
  drawDeck.classList.toggle('is-active', available);
  drawDeck.setAttribute('aria-label', available ? 'Comprar carta do baralho' : 'Baralho: aguarde sua vez');
  deckHint.textContent = available ? 'COMPRAR CARTA' : state.phase === 'finished' ? 'RODADA ENCERRADA' : 'AGUARDE SUA VEZ';
  standBtn.disabled = !available;
  standBtn.classList.toggle('hidden', state.phase === 'finished');
  restartBtn.classList.toggle('hidden', state.phase !== 'finished');
  restartBtn.disabled = !state.allConnected || !socket.connected;
}

function renderSeat(player, position) {
  const isSelf = position === 'self';
  const active = player && state.phase === 'playing' && state.currentTurn === player.id;
  const name = player ? player.name : isSelf ? 'Você' : 'Esperando oponente...';
  const status = !player ? 'AGUARDANDO' :
    !player.connected ? 'DESCONECTADO' :
    player.busted ? 'ESTOUROU' : player.stood ? 'PAROU' :
    active ? 'SUA VEZ' : state.phase === 'waiting' ? 'AGUARDANDO' :
    state.phase === 'finished' ? 'FIM DE RODADA' : 'NA MESA';
  const statusClass = player && (!player.connected || player.busted) ? 'is-danger' : active ? 'is-active' : '';
  const cards = player?.hand || [];
  return `<section class="seat seat--${position}${active ? ' seat--active' : ''}${player ? '' : ' seat--empty'}"
    data-player-id="${escapeHtml(player?.id || '')}" aria-label="${isSelf ? 'Sua mão' : 'Adversário'}: ${escapeHtml(name)}">
      <div class="seat-label">${isSelf ? 'SUA MÃO' : 'ADVERSÁRIO'}${player ? ` · LIMITE ${player.target}` : ''}</div>
      <div class="seat-nameplate">
        <div class="seat-main"><div class="seat-name">${escapeHtml(name)}</div></div>
        <div class="score-token" title="Pontuação atual">${player ? player.score : '—'}</div>
      </div>
      <div class="hand" aria-label="Cartas de ${escapeHtml(name)}">${cards.map((card, index) => renderCard(card, index, cards.length)).join('')}</div>
      <div class="seat-status ${statusClass}">${status}</div>
    </section>`;
}

function renderCard(card, index, count) {
  const red = card.suit === '♥' || card.suit === '♦';
  const relative = index - (count - 1) / 2;
  const angle = Math.max(-17, Math.min(17, relative * 4.5));
  const arc = Math.min(17, Math.abs(relative) * 5);
  return `<div class="card ${red ? 'card--red' : ''}" data-card-index="${index}"
     style="--angle:${angle}deg;--arc:${arc}px"
     aria-label="${escapeHtml(card.rank)} de ${suitName(card.suit)}">
    <span class="card-corner">${escapeHtml(card.rank)}<small>${card.suit}</small></span>
    <span class="card-pip" aria-hidden="true">${card.suit}</span>
    <span class="card-corner card-corner--bottom" aria-hidden="true">${escapeHtml(card.rank)}<small>${card.suit}</small></span>
  </div>`;
}

function suitName(suit) {
  return ({ '♠': 'espadas', '♣': 'paus', '♥': 'copas', '♦': 'ouros' })[suit] || 'naipe';
}

const coinSymbols = { target24: '24', drawPeek: '✥', secondChance: '↶' };
function renderCoins(myself, spentCoins) {
  triumphsEl.replaceChildren();
  for (const triumph of myself?.triumphs || []) {
    const coin = document.createElement('button');
    coin.type = 'button';
    coin.className = `triumph-coin${triumph.used ? ' used' : ''}${spentCoins.includes(triumph.id) ? ' freshly-spent' : ''}`;
    coin.setAttribute('aria-label', `${triumph.name}. ${triumph.description}${triumph.used ? ' Já usado.' : ''}`);
    coin.setAttribute('aria-disabled', String(triumph.used || !canAct()));
    coin.innerHTML = `
      <span class="coin-inner" aria-hidden="true"><span class="coin-mark">${coinSymbols[triumph.id] || '✦'}</span></span>
      <span class="coin-tooltip" role="tooltip"><strong>${escapeHtml(triumph.name)}</strong><span>${escapeHtml(triumph.description)}</span>${triumph.used ? '<em>JÁ UTILIZADO</em>' : triumph.id === 'secondChance' ? '<em>ATIVA AUTOMATICAMENTE AO ESTOURAR</em>' : '<em>CLIQUE PARA USAR</em>'}</span>`;
    coin.addEventListener('click', event => {
      unlockAudio();
      if (event.pointerType === 'touch' || touchInterface.matches || navigator.maxTouchPoints > 0 || triumph.used || !canAct() || triumph.id === 'secondChance') {
        showTriumphDetails(triumph);
      } else {
        activateTriumph(triumph.id);
      }
    });
    triumphsEl.appendChild(coin);
  }
}
function activateTriumph(id) {
  const mine = state?.players.find(p => p.id === playerId);
  const selected = mine?.triumphs.find(t => t.id === id);
  if (!canAct() || !selected || selected.used) return;
  unlockAudio();
  socket.emit('useTriumph', { triumphId: id });
  if (triumphDialog.open) triumphDialog.close();
}
function showTriumphDetails(triumph) {
  selectedTriumphId = triumph.id;
  triumphTitle.textContent = triumph.name;
  triumphDescription.textContent = triumph.description;
  useTriumphBtn.disabled = triumph.used || !canAct() || triumph.id === 'secondChance';
  useTriumphBtn.textContent = triumph.used ? 'JÁ UTILIZADO' : triumph.id === 'secondChance' ? 'ATIVA AUTOMATICAMENTE' : !canAct() ? 'AGUARDE SUA VEZ' : 'USAR MOEDA';
  if (!triumphDialog.open) triumphDialog.showModal();
}
useTriumphBtn.addEventListener('click', () => {
  if (selectedTriumphId) activateTriumph(selectedTriumphId);
});
closeTriumphBtn.addEventListener('click', () => triumphDialog.close());
triumphDialog.addEventListener('click', event => {
  if (event.target === triumphDialog) triumphDialog.close();
});


/* =============================================================
   JORNAIS FÍSICOS NO FELTRO
   Cada alteração relevante cria uma NOVA edição. As edições ficam
   guardadas durante a rodada e são renderizadas como uma pilha.
   ============================================================= */
function emptyNewsMemory() {
  return { mine: [], enemy: [] };
}

function resetNewsStacks() {
  newsMemory = emptyNewsMemory();
  newsSerial = 0;
  lastPaintedNews.mine = 0;
  lastPaintedNews.enemy = 0;
  paintNewsBoard(new Set());
}

function writeNews(player, title, body) {
  const side = player.id === playerId ? 'mine' : 'enemy';
  const story = {
    id: ++newsSerial,
    edition: newsSerial,
    title,
    body,
    playerName: player.name,
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };
  newsMemory[side].push(story);
  // Mantém o histórico da rodada sem deixar o DOM crescer sem limite.
  if (newsMemory[side].length > 24) newsMemory[side].shift();
  return side;
}

function updateNewsBoard(previous, next) {
  const changedRoom = !previous || previous.code !== next.code;
  const started = next.phase === 'playing' && previous?.phase !== 'playing';
  const restarted = previous?.phase === 'finished' && next.phase === 'playing';
  const returnedToLobby = previous?.phase !== 'waiting' && next.phase === 'waiting';

  if (changedRoom || restarted || returnedToLobby) {
    resetNewsStacks();
  }

  const changedSides = new Set();
  const oldPlayers = new Map((changedRoom || restarted ? [] : previous?.players || []).map(p => [p.id, p]));

  for (const player of next.players || []) {
    const old = oldPlayers.get(player.id);
    const story = findPlayerNews(old, player, started || changedRoom || restarted);
    if (story) changedSides.add(writeNews(player, story.title, story.body));
  }

  // Resultado final também vira uma edição e entra em cima da pilha.
  if (next.phase === 'finished' && (changedRoom || previous?.phase !== 'finished')) {
    for (const player of next.players || []) {
      if (next.winnerId === null || next.winnerId === undefined) {
        changedSides.add(writeNews(player, 'EMPATE NA MESA!', 'O duelo terminou sem vencedor.'));
      } else if (next.winnerId === player.id) {
        changedSides.add(writeNews(player, 'VENCEU O DUELO!', `${player.name} levou a melhor nesta rodada.`));
      } else {
        changedSides.add(writeNews(player, 'PERDEU O DUELO', `${player.name} não conseguiu superar o adversário.`));
      }
    }
  }

  paintNewsBoard(changedSides);
}

function findPlayerNews(old, player, openingHand) {
  if (openingHand && player.hand.length) {
    return { title: 'CARTAS NA MESA!', body: `${player.name} recebeu a mão inicial com ${player.score} pontos.` };
  }
  if (!old) {
    return player.hand.length ? { title: 'ENTROU NA MESA', body: `${player.name} está pronto para o duelo.` } : null;
  }
  if (!old.connected && player.connected) {
    return { title: 'VOLTOU À MESA', body: `${player.name} retomou seu lugar na partida.` };
  }
  if (old.connected && !player.connected) {
    return { title: 'SAIU DA MESA', body: `${player.name} perdeu a conexão.` };
  }

  const spent = id => player.triumphs?.some(t => t.id === id && t.used &&
    old.triumphs?.some(prev => prev.id === id && !prev.used));

  if (spent('secondChance')) {
    return { title: 'SEGUNDA CHANCE!', body: `${player.name} escapou do estouro e descartou a última carta.` };
  }
  if (spent('target24') || player.target > old.target) {
    return { title: 'LIMITE AUMENTADO!', body: `${player.name} usou Além do Limite e agora pode chegar a ${player.target} pontos.` };
  }
  if (spent('drawPeek')) {
    return { title: 'INSTINTO EM AÇÃO!', body: `${player.name} espiou a próxima carta do baralho.` };
  }
  if (!old.busted && player.busted) {
    return { title: 'ESTOUROU!', body: `${player.name} passou do limite de ${player.target} pontos.` };
  }
  if (!old.stood && player.stood) {
    return player.score === player.target
      ? { title: `CRAVOU ${player.target}!`, body: `${player.name} atingiu exatamente o limite da rodada.` }
      : { title: `PAROU EM ${player.score}`, body: `${player.name} decidiu não comprar mais cartas.` };
  }
  if (player.hand.length > old.hand.length) {
    return { title: 'COMPROU UMA CARTA!', body: `${player.name} pediu outra carta e agora soma ${player.score} pontos.` };
  }
  return null;
}

function paintNewsBoard(changedSides = new Set()) {
  renderNewspaperStack(myNewsStack, newsMemory.mine, 'mine', changedSides.has('mine'));
  renderNewspaperStack(enemyNewsStack, newsMemory.enemy, 'enemy', changedSides.has('enemy'));
}

function renderNewspaperStack(container, stories, side, animateNewest) {
  if (!container) return;

  if (!stories.length) {
    container.innerHTML = `
      <div class="newspaper-empty">
        <span>SEM EDIÇÕES</span>
        <small>A próxima jogada cai aqui.</small>
      </div>`;
    return;
  }

  // Visualmente mostramos as 6 últimas folhas. O histórico continua em memória.
  const visible = stories.slice(-6);
  const newestId = visible[visible.length - 1]?.id || 0;
  const previousNewest = lastPaintedNews[side];

  container.innerHTML = visible.map((story, index) => {
    const depthFromTop = visible.length - 1 - index;
    const direction = side === 'mine' ? -1 : 1;
    const rotationPattern = side === 'mine' ? [-4, 3, -2, 4, -3, 1] : [4, -3, 2, -4, 3, -1];
    const rotation = rotationPattern[index % rotationPattern.length];
    const offsetX = direction * depthFromTop * 3;
    const offsetY = -depthFromTop * 4;
    const isNewest = story.id === newestId;
    const shouldDrop = isNewest && animateNewest && story.id !== previousNewest;
    const hiddenCount = stories.length - visible.length;

    return `
      <article
        class="newspaper-sheet ${isNewest ? 'newspaper-sheet--top' : ''} ${shouldDrop ? 'newspaper-sheet--drop' : ''}"
        style="--paper-layer:${index};--paper-x:${offsetX}px;--paper-y:${offsetY}px;--paper-turn:${rotation}deg"
        aria-label="${escapeHtml(story.title)}"
      >
        <header class="paper-masthead">
          <span>SOM DA SEIS</span>
          <b>GAZETTE</b>
          <small>EDIÇÃO ${String(story.edition).padStart(2, '0')} · 1887 · ${story.time}</small>
        </header>
        <div class="paper-rule"></div>
        <p class="paper-kicker">${side === 'mine' ? 'DA SUA PARTE DA MESA' : 'DO OUTRO LADO DA MESA'}</p>
        <h3>${escapeHtml(story.title)}</h3>
        <p class="paper-copy">${escapeHtml(story.body)}</p>
        <div class="paper-columns" aria-hidden="true"><span></span><span></span><span></span></div>
        <footer><span>♠</span><em>${escapeHtml(story.playerName)}</em><span>♠</span></footer>
        ${isNewest && hiddenCount > 0 ? `<i class="paper-count">+${hiddenCount} antigas</i>` : ''}
      </article>`;
  }).join('');

  lastPaintedNews[side] = newestId;
}

function newsBannerText(current) {
  if (!socket.connected) return 'SEM CONEXÃO · TENTANDO VOLTAR';
  if (current.phase === 'finished') return 'RODADA ENCERRADA';
  if (current.phase === 'waiting') return 'AGUARDANDO SEGUNDO JOGADOR';
  const currentPlayer = current.players?.find(p => p.id === current.currentTurn);
  return currentPlayer?.id === playerId ? 'SUA VEZ DE JOGAR' :
    currentPlayer ? `VEZ DE ${currentPlayer.name.toUpperCase()}` : 'DUAS MÃOS · UM DUELO';
}

/* Carta fantasma percorre o caminho real: pilha -> lugar na mão. */
function animateNewCards(freshMap) {
  const version = ++flightVersion;
  document.querySelectorAll('.flying-card').forEach(el => el.remove());
  if (reducedMotion.matches || document.hidden) return;
  const flights = [];
  for (const [id, indices] of freshMap) {
    const seat = [...playersEl.querySelectorAll('.seat')].find(el => el.dataset.playerId === id);
    if (!seat) continue;
    for (const index of indices) {
      const card = [...seat.querySelectorAll('.card')].find(el => Number(el.dataset.cardIndex) === index);
      if (card) { card.classList.add('card-awaiting'); flights.push(card); }
    }
  }
  if (!flights.length) return;
  const stagger = flights.length > 3 ? 105 : 135;
  flights.forEach((card, index) => {
    setTimeout(() => {
      if (version !== flightVersion || !card.isConnected) return;
      const origin = drawDeck.getBoundingClientRect();
      const target = card.getBoundingClientRect();
      if (!origin.width || !target.width) { card.classList.remove('card-awaiting'); return; }
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const startX = origin.left + origin.width / 2 - width / 2;
      const startY = origin.top + origin.height / 2 - height / 2;
      const endX = target.left + target.width / 2 - width / 2;
      const endY = target.top + target.height / 2 - height / 2;
      const dx = endX - startX;
      const dy = endY - startY;
      const ghost = card.cloneNode(true);
      ghost.classList.remove('card-awaiting');
      ghost.classList.add('flying-card');
      ghost.style.left = `${startX}px`;
      ghost.style.top = `${startY}px`;
      ghost.style.width = `${width}px`;
      ghost.style.height = `${height}px`;
      document.body.appendChild(ghost);
      const anim = ghost.animate([
        { transform: 'translate3d(0,0,0) rotate(-10deg) scale(.86)', opacity: .75 },
        { offset: .55, transform: `translate3d(${dx * .55}px,${dy * .55 - 32}px,0) rotate(2deg) scale(1.07)`, opacity: 1 },
        { transform: `translate3d(${dx}px,${dy}px,0) rotate(${card.style.getPropertyValue('--angle') || '0deg'}) scale(1)`, opacity: 1 }
      ], { duration: 480, easing: 'cubic-bezier(.22,.62,.12,1)', fill: 'forwards' });
      playCardSound();
      const finish = () => { ghost.remove(); card.classList.remove('card-awaiting'); };
      anim.onfinish = finish;
      anim.oncancel = finish;
    }, index * stagger);
  });
}

function showToast(message) {
  peekToast.textContent = message;
  peekToast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => peekToast.classList.add('hidden'), 3000);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
