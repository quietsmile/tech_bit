/* 中国象棋界面与对局控制 */
const CHAR = {
  red: {chariot:'俥', horse:'傌', elephant:'相', advisor:'仕', general:'帅', cannon:'炮', pawn:'兵'},
  black: {chariot:'車', horse:'馬', elephant:'象', advisor:'士', general:'將', cannon:'砲', pawn:'卒'}
};

let board, turn, selected, history, gameOver;
let lastMove = null; // 对方上一步：{from, to}
let mode = null; // 'ai' | 'pvp'
let difficulty = 'normal';
let aiThinking = false;
let aiToken = 0;
let evaluationOverride = null;

function showStart() {
  mode = null;
  document.getElementById('start-screen').classList.remove('hidden');
  document.getElementById('honor-screen').classList.add('hidden');
  document.getElementById('difficulty-row').classList.add('hidden');
}

function hideStart() {
  document.getElementById('start-screen').classList.add('hidden');
}

function newGame() {
  aiToken++;
  board = initialBoard();
  turn = 'red';
  selected = null;
  history = [];
  lastMove = null;
  gameOver = false;
  evaluationOverride = null;
  clearHints();
  updateStatus();
  updateEvaluation();
  render();
}

function updateStatus(extra) {
  const el = document.getElementById('status');
  if (extra) {
    el.textContent = extra;
    updateEvaluation();
    return;
  }
  const name = turn === 'red' ? '红方' : '黑方';
  let text = `${name}行棋`;
  if (isAttacked(board, turn)) text += '（将军！）';
  el.textContent = text;
  updateEvaluation();
}

function formatEvaluation(score) {
  return score > 0 ? `+${score}` : String(score);
}

function updateEvaluation() {
  const el = document.getElementById('evalInfo');
  const redScore = evaluationOverride === null
    ? Math.round(Math.tanh(aiEvaluate(board) / 2400) * 9800)
    : evaluationOverride;
  const score = turn === 'red' ? redScore : -redScore;
  el.textContent = `系统评估（${turn === 'red' ? '红方' : '黑方'}）：${formatEvaluation(score)} / ±10000`;
}

function scheduleAiMove() {
  if (mode !== 'ai' || gameOver || turn !== 'black') return;
  aiThinking = true;
  updateStatus('电脑思考中…');
  const started = Date.now();
  const token = ++aiToken;
  setTimeout(() => {
    if (token !== aiToken) return;
    const move = aiChooseMove(board, difficulty);
    const wait = Math.max(0, 500 - (Date.now() - started)); // 保证可感知延迟
    setTimeout(() => {
      if (token !== aiToken) return;
      aiThinking = false;
      if (!move || gameOver) return;
      history.push({ board, turn, from: [move.fr, move.fc], to: [move.tr, move.tc], ai: true });
      board = applyMove(board, move.fr, move.fc, move.tr, move.tc);
      lastMove = { from: [move.fr, move.fc], to: [move.tr, move.tc] };
      turn = 'red';
      clearHints();
      render();
      checkEnd();
    }, wait);
  }, 60); // 先让浏览器完成渲染
}

function boardCoords(evt) {
  const rect = document.getElementById('board').getBoundingClientRect();
  /* 棋盘会被 CSS 缩放（width: min(92vw, 500px)），点击坐标必须先换算回 SVG 坐标系 */
  const scaleX = rect.width / W, scaleY = rect.height / H;
  const x = (evt.clientX - rect.left) / scaleX, y = (evt.clientY - rect.top) / scaleY;
  const c = Math.round((x - MARGIN) / CELL), r = Math.round((y - MARGIN) / CELL);
  return inBoard(r, c) ? [r, c] : null;
}

function onBoardClick(evt) {
  if (gameOver || aiThinking || (mode === 'ai' && turn !== 'red')) return;
  const pos = boardCoords(evt);
  if (!pos) return;
  const [r, c] = pos, p = board[r][c];

  if (selected) {
    const [sr, sc] = selected;
    if (r === sr && c === sc) { selected = null; clearHints(); render(); return; }
    if (legalMoves(board, sr, sc).some(([mr, mc]) => mr === r && mc === c)) {
      history.push({board, turn, from:[sr,sc], to:[r,c]});
      board = applyMove(board, sr, sc, r, c);
      lastMove = { from: [sr, sc], to: [r, c] };
      turn = turn === 'red' ? 'black' : 'red';
      selected = null;
      clearHints();
      render();
      checkEnd();
      if (!gameOver) scheduleAiMove();
      return;
    }
  }
  if (p && p.side === turn) {
    selected = [r, c];
    showHints(legalMoves(board, r, c));
  } else {
    selected = null;
    clearHints();
  }
  render();
}

function checkEnd() {
  const next = turn;
  if (!hasAnyLegalMove(board, next)) {
    const winner = next === 'red' ? '黑方' : '红方';
    gameOver = true;
    evaluationOverride = -10000;
    updateStatus(`将死！${winner}获胜 🎉`);
    updateEvaluation();
    showResult(winner);
  } else if (!findGeneral(board, next)) {
    gameOver = true;
    evaluationOverride = -10000;
    updateStatus(`${next === 'red' ? '红方' : '黑方'}将被吃，对方获胜`);
    updateEvaluation();
    showResult(next === 'red' ? '黑方' : '红方');
  } else {
    updateStatus();
  }
}

function showResult(winner) {
  const honorTitle = document.getElementById('honor-title');
  const honorText = document.getElementById('honor-text');
  const badgeBox = document.getElementById('badge-box');
  if (mode === 'ai' && winner === '红方') {
    honorTitle.textContent = '🎉 胜利！';
    honorText.textContent = '你击败了电脑！';
    try {
      localStorage.setItem('chess-badge-xiangqi-little-general', '1');
    } catch (e) { /* 隐私模式下忽略 */ }
    badgeBox.classList.remove('hidden');
  } else if (mode === 'ai') {
    honorTitle.textContent = '😅 挑战失败';
    honorText.textContent = `${winner}获胜，再来一局！`;
    badgeBox.classList.add('hidden');
  } else {
    honorTitle.textContent = `${winner}获胜 🎉`;
    honorText.textContent = '当局荣誉：本局胜者！';
    badgeBox.classList.add('hidden'); // 双人荣誉仅当局展示，不长期保存
  }
  setTimeout(() => {
    document.getElementById('honor-screen').classList.remove('hidden');
  }, 700);
}

function undo() {
  if (!history.length) return;
  let last = history.pop();
  if (mode === 'ai' && history.length) {
    // 人机模式：同时撤销电脑一步与玩家一步
    last = history.pop();
  }
  board = last.board; turn = last.turn; selected = null; gameOver = false; aiThinking = false;
  lastMove = last.from ? { from: last.from, to: last.to } : null;
  evaluationOverride = null;
  aiToken++; // 取消尚未执行的电脑走子
  clearHints(); render(); updateStatus();
  updateEvaluation();
}

/* ---- 绘制 ---- */
const CELL = 56, MARGIN = 44, PIECE_R = 24;
const W = MARGIN * 2 + CELL * 8, H = MARGIN * 2 + CELL * 9;

function setup() {
  const svg = document.getElementById('board');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.addEventListener('click', onBoardClick);
  drawStatic();
  newGame();
}

function drawStatic() {
  const svg = document.getElementById('board');
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', 'static');
  const L = (x1,y1,x2,y2) => {
    const l = document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1',x1); l.setAttribute('y1',y1);
    l.setAttribute('x2',x2); l.setAttribute('y2',y2);
    l.setAttribute('class','grid');
    g.appendChild(l);
  };
  const px = c => MARGIN + c * CELL, py = r => MARGIN + r * CELL;
  // 横线
  for (let r = 0; r < 10; r++) L(px(0), py(r), px(8), py(r));
  // 纵线（中间断开为河界）
  for (let c = 0; c < 9; c++) {
    if (c === 0 || c === 8) L(px(c), py(0), px(c), py(9));
    else { L(px(c), py(0), px(c), py(4)); L(px(c), py(5), px(c), py(9)); }
  }
  // 九宫
  L(px(3), py(0), px(5), py(2)); L(px(5), py(0), px(3), py(2));
  L(px(3), py(7), px(5), py(9)); L(px(5), py(7), px(3), py(9));
  // 外框加粗
  const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
  rect.setAttribute('x', px(0)-6); rect.setAttribute('y', py(0)-6);
  rect.setAttribute('width', CELL*8+12); rect.setAttribute('height', CELL*9+12);
  rect.setAttribute('class','frame');
  g.appendChild(rect);
  // 河界文字
  const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
  txt.setAttribute('x', px(4)); txt.setAttribute('y', py(4.5));
  txt.setAttribute('class','river');
  txt.textContent = '楚 河        汉 界';
  g.appendChild(txt);
  // 兵/卒位与炮位小标记（简化十字）
  const marks = [[2,1],[2,7],[3,0],[3,2],[3,4],[3,6],[3,8],[6,0],[6,2],[6,4],[6,6],[6,8],[7,1],[7,7]];
  marks.forEach(([r,c]) => {
    const mk = document.createElementNS('http://www.w3.org/2000/svg','path');
    const x = px(c), y = py(r), d = 5, o = 7;
    let s = '';
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy]) => {
      s += `M ${x+sx*o} ${y+sy*(o-d)} L ${x+sx*o} ${y+sy*o} L ${x+sx*(o-d)} ${y+sy*o} `;
    });
    mk.setAttribute('d', s);
    mk.setAttribute('class','mark');
    g.appendChild(mk);
  });
  svg.appendChild(g);
}

function clearHints() {
  document.querySelectorAll('.hint, .sel').forEach(e => e.remove());
}

function showHints(moves) {
  clearHints();
  const svg = document.getElementById('board');
  moves.forEach(([r, c]) => {
    const h = document.createElementNS('http://www.w3.org/2000/svg','circle');
    h.setAttribute('cx', MARGIN + c*CELL); h.setAttribute('cy', MARGIN + r*CELL);
    h.setAttribute('r', 7);
    h.setAttribute('class','hint');
    svg.appendChild(h);
  });
}

function render() {
  const svg = document.getElementById('board');
  document.querySelectorAll('.piece').forEach(e => e.remove());
    document.querySelectorAll('.last-from, .last-to').forEach(e => e.remove());
    if (lastMove) {
    [['from', lastMove.from], ['to', lastMove.to]].forEach(function (item) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', MARGIN + item[1][1] * CELL - (CELL - 6) / 2);
      rect.setAttribute('y', MARGIN + item[1][0] * CELL - (CELL - 6) / 2);
      rect.setAttribute('width', CELL - 6);
      rect.setAttribute('height', CELL - 6);
      rect.setAttribute('rx', 10);
      rect.setAttribute('class', item[0] === 'from' ? 'last-from' : 'last-to');
      svg.appendChild(rect);
    });
  }
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = board[r][c];
    if (!p) continue;
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class', `piece ${p.side}`);
    g.setAttribute('transform', `translate(${MARGIN + c*CELL}, ${MARGIN + r*CELL})`);
    const circ = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circ.setAttribute('r', PIECE_R);
    circ.setAttribute('class','pc');
    g.appendChild(circ);
    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.textContent = CHAR[p.side][p.type];
    t.setAttribute('class','pt');
    g.appendChild(t);
    if (selected && selected[0] === r && selected[1] === c) {
      const s = document.createElementNS('http://www.w3.org/2000/svg','circle');
      s.setAttribute('r', PIECE_R + 4);
      s.setAttribute('class','sel');
      g.appendChild(s);
    }
    svg.appendChild(g);
  }
  /* 提示点重新放到最上层，保证吃子目标上的提示不被棋子挡住 */
  document.querySelectorAll('#board > .hint').forEach(h => svg.appendChild(h));
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
document.getElementById('honor-back').addEventListener('click', showStart);

setup();
showStart();
