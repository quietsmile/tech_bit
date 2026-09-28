/* 国际象棋界面与对局控制 */
const GLYPH = {
  w: { k:'♔', q:'♕', r:'♖', b:'♗', n:'♘', p:'♙' },
  b: { k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟' }
};
const NAME_CN = { k:'王', q:'后', r:'车', b:'象', n:'马', p:'兵' };

let pos, turn, selected, history, gameOver;
let mode = null; // 'ai' | 'pvp'
let difficulty = 'normal';
let aiThinking = false;
let aiToken = 0;
let lastMove = null;
let evaluationOverride = null;

const CELL = 64;
const SIZE = CELL * 8;

function showStart() {
  mode = null;
  document.getElementById('start-screen').classList.remove('hidden');
  document.getElementById('result').classList.add('hidden');
  document.getElementById('difficulty-row').classList.add('hidden');
}

function hideStart() { document.getElementById('start-screen').classList.add('hidden'); }

function newGame() {
  aiToken++;
  pos = initialPosition();
  turn = 'w';
  selected = null;
  history = [];
  lastMove = null;
  gameOver = false;
  aiThinking = false;
  evaluationOverride = null;
  clearMarks();
  updateStatus();
  updateEvaluation();
  render();
}

function other(side) { return side === 'w' ? 'b' : 'w'; }
function sideName(side) { return side === 'w' ? '白方' : '黑方'; }

function updateStatus(extra) {
  const el = document.getElementById('status');
  if (extra) {
    el.textContent = extra;
    updateEvaluation();
    return;
  }
  let text = sideName(turn) + '行棋';
  if (isInCheck(pos, turn)) text += '（将军！）';
  el.textContent = text;
  updateEvaluation();
}

function formatEvaluation(score) {
  return score > 0 ? `+${score}` : String(score);
}

function updateEvaluation() {
  const el = document.getElementById('evalInfo');
  const whiteScore = evaluationOverride === null
    ? Math.round(Math.tanh(aiEvaluate(pos) / 2400) * 9800)
    : evaluationOverride;
  const score = turn === 'w' ? whiteScore : -whiteScore;
  el.textContent = `系统评估（${turn === 'w' ? '白方' : '黑方'}）：${formatEvaluation(score)} / ±10000`;
}

function scheduleAiMove() {
  if (mode !== 'ai' || gameOver || turn !== 'b') return;
  aiThinking = true;
  updateStatus('电脑思考中…');
  const token = ++aiToken;
  setTimeout(() => {
    if (token !== aiToken) return;
    const move = aiChooseMove(pos, difficulty);
    const wait = Math.max(0, 500 - (Date.now() - (move ? move.started || Date.now() : Date.now())));
    setTimeout(() => {
      if (token !== aiToken) return;
      aiThinking = false;
      if (!move || gameOver) return;
      applyAndContinue(move.fr, move.fc, move.tr, move.tc);
    }, wait);
  }, 60);
}

function applyAndContinue(fr, fc, tr, tc) {
  history.push({ pos, turn, from: [fr, fc], to: [tr, tc] });
  pos = applyMove(pos, fr, fc, tr, tc);
  lastMove = { from: [fr, fc], to: [tr, tc] };
  turn = other(turn);
  selected = null;
  clearMarks();
  render();
  checkEnd();
}

function checkEnd() {
  if (hasAnyLegalMove(pos, turn)) { updateStatus(); return; }
  gameOver = true;
  if (isInCheck(pos, turn)) {
    const winner = turn === 'w' ? '黑方' : '白方';
    evaluationOverride = -10000;
    updateStatus(`将杀！${winner}获胜 🎉`);
    updateEvaluation();
    showResult(winner);
  } else {
    evaluationOverride = 0;
    updateStatus('逼和（无子可动）');
    updateEvaluation();
    showResult(null);
  }
}

function showResult(winner) {
  const title = document.getElementById('result-title');
  const text = document.getElementById('result-text');
  const badge = document.getElementById('badge-box');
  if (mode === 'ai' && winner === '白方') {
    title.textContent = '🎉 胜利！';
    text.textContent = '你击败了电脑！';
    try { localStorage.setItem('intl-chess-badge', '1'); } catch (e) {}
    badge.classList.remove('hidden');
  } else if (mode === 'ai') {
    title.textContent = '😅 挑战失败';
    text.textContent = `${winner}获胜，再来一局！`;
    badge.classList.add('hidden');
  } else {
    title.textContent = `${winner}获胜 🎉`;
    text.textContent = '本局结束！';
    badge.classList.add('hidden');
  }
  document.getElementById('result').classList.remove('hidden');
}

function undo() {
  if (!history.length) return;
  let last = history.pop();
  if (mode === 'ai' && history.length) last = history.pop();
  pos = last.pos; turn = last.turn; selected = null; gameOver = false; aiThinking = false;
  lastMove = last.from ? { from: last.from, to: last.to } : null;
  evaluationOverride = null;
  aiToken++;
  clearMarks(); render(); updateStatus();
  updateEvaluation();
}

/* ---- 绘制 ---- */
function setup() {
  const svg = document.getElementById('board');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.addEventListener('click', onBoardClick);
  drawSquares();
  newGame();
}

function drawSquares() {
  const svg = document.getElementById('board');
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', c * CELL); rect.setAttribute('y', r * CELL);
      rect.setAttribute('width', CELL); rect.setAttribute('height', CELL);
      rect.setAttribute('class', (r + c) % 2 === 0 ? 'sq-light' : 'sq-dark');
      g.appendChild(rect);
    }
  svg.appendChild(g);
}

function clearMarks() {
  document.querySelectorAll('.hint, .sel, .last-from, .last-to, .in-check').forEach(e => e.remove());
}

function showHints(moves) {
  clearMarks();
  const svg = document.getElementById('board');
  moves.forEach(([r, c]) => {
    const h = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    h.setAttribute('cx', c * CELL + CELL / 2); h.setAttribute('cy', r * CELL + CELL / 2);
    h.setAttribute('r', 9);
    h.setAttribute('class', 'hint');
    svg.appendChild(h);
  });
}

function showCheck() {
  const k = findKing(pos, turn);
  if (!k) return;
  const svg = document.getElementById('board');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', k[1] * CELL + 3); rect.setAttribute('y', k[0] * CELL + 3);
  rect.setAttribute('width', CELL - 6); rect.setAttribute('height', CELL - 6);
  rect.setAttribute('rx', 8);
  rect.setAttribute('class', 'in-check');
  svg.appendChild(rect);
}

function render() {
  const svg = document.getElementById('board');
  document.querySelectorAll('.piece').forEach(e => e.remove());
  document.querySelectorAll('.last-from, .last-to, .in-check').forEach(e => e.remove());
  if (lastMove) {
    [[lastMove.from, 'last-from'], [lastMove.to, 'last-to']].forEach(([sq, cls]) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', sq[1] * CELL + 2); rect.setAttribute('y', sq[0] * CELL + 2);
      rect.setAttribute('width', CELL - 4); rect.setAttribute('height', CELL - 4);
      rect.setAttribute('rx', 8);
      rect.setAttribute('class', cls);
      svg.appendChild(rect);
    });
  }
  if (isInCheck(pos, turn)) showCheck();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = pos.board[r][c];
    if (!p) continue;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', c * CELL + CELL / 2); t.setAttribute('y', r * CELL + CELL / 2);
    t.setAttribute('class', `piece glyph-${p.side}`);
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('text-anchor', 'middle');
    t.textContent = GLYPH[p.side][p.type];
    if (selected && selected[0] === r && selected[1] === c) {
      t.setAttribute('class', `piece glyph-${p.side} sel`);
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', c * CELL + CELL / 2); ring.setAttribute('cy', r * CELL + CELL / 2);
      ring.setAttribute('r', CELL / 2 - 3);
      ring.setAttribute('class', 'sel');
      svg.appendChild(ring);
    }
    svg.appendChild(t);
  }
}

function boardCoords(evt) {
  const rect = document.getElementById('board').getBoundingClientRect();
  const sx = rect.width / SIZE, sy = rect.height / SIZE;
  const x = (evt.clientX - rect.left) / sx, y = (evt.clientY - rect.top) / sy;
  const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
  return (inBoard(r, c) && r >= 0 && c >= 0) ? [r, c] : null;
}

function onBoardClick(evt) {
  if (gameOver || aiThinking || (mode === 'ai' && turn !== 'w')) return;
  const square = boardCoords(evt);
  if (!square) return;
  const [r, c] = square, p = pos.board[r][c];

  if (selected) {
    const [sr, sc] = selected;
    if (r === sr && c === sc) { selected = null; clearMarks(); render(); return; }
    if (legalMoves(pos, sr, sc).some(([mr, mc]) => mr === r && mc === c)) {
      history.push({ pos, turn, from: [sr, sc], to: [r, c] });
      pos = applyMove(pos, sr, sc, r, c);
      lastMove = { from: [sr, sc], to: [r, c] };
      turn = other(turn);
      selected = null;
      clearMarks();
      render();
      checkEnd();
      if (!gameOver) scheduleAiMove();
      return;
    }
  }
  if (p && p.side === turn) {
    selected = [r, c];
    showHints(legalMoves(pos, r, c));
  } else {
    selected = null;
    clearMarks();
  }
  render();
}

function undo() {
  if (!history.length) return;
  let last = history.pop();
  if (mode === 'ai' && history.length) last = history.pop();
  pos = last.pos; turn = last.turn; selected = null; gameOver = false; aiThinking = false;
  lastMove = last.from ? { from: last.from, to: last.to } : null;
  aiToken++;
  clearMarks(); render(); updateStatus();
}

document.getElementById('restart').addEventListener('click', newGame);
document.getElementById('undo').addEventListener('click', undo);
document.getElementById('mode-ai').addEventListener('click', () => {
  document.getElementById('difficulty-row').classList.remove('hidden');
});
document.getElementById('mode-pvp').addEventListener('click', () => {
  mode = 'pvp';
  hideStart();
  newGame();
});
document.getElementById('start-ai').addEventListener('click', () => {
  mode = 'ai';
  difficulty = document.getElementById('difficulty').value;
  hideStart();
  newGame();
});
document.getElementById('result-back').addEventListener('click', showStart);

setup();
showStart();
