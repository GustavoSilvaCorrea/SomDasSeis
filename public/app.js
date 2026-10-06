const socket = io();

const lobby = document.querySelector('#lobby');
const game = document.querySelector('#game');
const nameInput = document.querySelector('#name');
const codeInput = document.querySelector('#roomCode');
const createBtn = document.querySelector('#createBtn');
const joinBtn = document.querySelector('#joinBtn');
const errorBox = document.querySelector('#error');
const codeLabel = document.querySelector('#codeLabel');
const copyCode = document.querySelector('#copyCode');
const statusText = document.querySelector('#statusText');
const playersEl = document.querySelector('#players');
const triumphsEl = document.querySelector('#triumphs');
const hitBtn = document.querySelector('#hitBtn');
const standBtn = document.querySelector('#standBtn');
const restartBtn = document.querySelector('#restartBtn');
const peekToast = document.querySelector('#peekToast');

let state = null;

createBtn.addEventListener('click', () => socket.emit('createRoom', { name: playerName() }));
joinBtn.addEventListener('click', () => socket.emit('joinRoom', { code: codeInput.value, name: playerName() }));
hitBtn.addEventListener('click', () => socket.emit('hit'));
standBtn.addEventListener('click', () => socket.emit('stand'));
restartBtn.addEventListener('click', () => socket.emit('restart'));
copyCode.addEventListener('click', async () => {
  if (!state?.code) return;
  try {
    await navigator.clipboard.writeText(state.code);
    copyCode.textContent = 'Código copiado!';
    setTimeout(() => copyCode.innerHTML = `Sala <span id="codeLabel">${state.code}</span>`, 1200);
  } catch {}
});

function playerName() {
  return nameInput.value.trim() || 'Jogador';
}

socket.on('errorMessage', msg => errorBox.textContent = msg);
socket.on('peekResult', card => {
  if (!card) return;
  peekToast.textContent = `A próxima carta é ${card.rank}${card.suit}`;
  peekToast.classList.remove('hidden');
  setTimeout(() => peekToast.classList.add('hidden'), 2600);
});

socket.on('state', next => {
  state = next;
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  render();
});

function render() {
  codeLabel.textContent = state.code;
  statusText.textContent = state.message || '';
  playersEl.innerHTML = '';

  state.players.forEach(player => {
    const card = document.createElement('article');
    const isMe = player.id === socket.id;
    const active = state.currentTurn === player.id && state.phase === 'playing';
    card.className = `player-card ${isMe ? 'me' : ''} ${active ? 'active' : ''}`;
    card.innerHTML = `
      <div class="player-head">
        <div>
          <div class="player-name">${escapeHtml(player.name)} ${isMe ? '(você)' : ''}</div>
          <div class="meta">Limite atual: ${player.target}</div>
        </div>
        <div class="score">${player.score}</div>
      </div>
      <div class="hand">${player.hand.map(renderCard).join('')}</div>
      ${player.busted ? '<span class="badge danger">Estourou</span>' : player.stood ? '<span class="badge">Parou</span>' : active ? '<span class="badge">Turno atual</span>' : ''}
    `;
    playersEl.appendChild(card);
  });

  const me = state.players.find(p => p.id === socket.id);
  triumphsEl.innerHTML = '';
  if (me) {
    me.triumphs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = `triumph ${t.used ? 'used' : ''}`;
      btn.disabled = t.used || state.phase !== 'playing' || state.currentTurn !== socket.id;
      btn.innerHTML = `<strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(t.description)}</span>`;
      btn.addEventListener('click', () => socket.emit('useTriumph', { triumphId: t.id }));
      triumphsEl.appendChild(btn);
    });
  }

  const canAct = state.phase === 'playing' && state.currentTurn === socket.id;
  hitBtn.disabled = !canAct;
  standBtn.disabled = !canAct;
  restartBtn.classList.toggle('hidden', state.phase !== 'finished');
  hitBtn.classList.toggle('hidden', state.phase === 'finished');
  standBtn.classList.toggle('hidden', state.phase === 'finished');

  if (state.phase === 'waiting') {
    hitBtn.disabled = true;
    standBtn.disabled = true;
  }
}

function renderCard(c) {
  const red = c.suit === '♥' || c.suit === '♦';
  return `<div class="card ${red ? 'red' : ''}"><span>${c.rank}</span><span class="suit">${c.suit}</span></div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
