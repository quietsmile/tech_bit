/* 俄罗斯方块 · 双人同屏对战（本地，无网络依赖）
 * 消 2 行以上给对方加干扰行；先把对方顶到顶部的一方获胜。
 */
(function () {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const CELL = 24;
  const BASE_MS = 620;
  const MIN_MS = 110;
  const SPEED_STEP = 35;

  const PIECES = {
    I: { color: '#4dd0e1', shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
    O: { color: '#ffd54f', shape: [[1, 1], [1, 1]] },
    T: { color: '#ba68c8', shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
    S: { color: '#81c784', shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
    Z: { color: '#e57373', shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
    J: { color: '#64b5f6', shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
    L: { color: '#ffb74d', shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] }
  };
  const TYPES = Object.keys(PIECES);
  const GARBAGE_COLOR = '#6b7280';

  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovText = document.getElementById('ovText');
  const ovBtn = document.getElementById('ovBtn');

  function newBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function makeSide(canvasId, label) {
    const num = label === '1P' ? 1 : 2;
    const canvas = document.getElementById(canvasId);
    return {
      label,
      canvas,
      ctx: canvas.getContext('2d'),
      scoreEl: document.getElementById(`score${num}`),
      linesEl: document.getElementById(`lines${num}`),
      levelEl: document.getElementById(`level${num}`),
      board: newBoard(),
      cur: null,
      bag: [],
      score: 0,
      lines: 0,
      level: 1,
      interval: BASE_MS,
      acc: 0,
      over: false
    };
  }

  const P1 = makeSide('board1', '1P');
  const P2 = makeSide('board2', '2P');

  let started = false;
  let roundOver = false;
  let lastTs = null;

  function opponent(side) {
    return side === P1 ? P2 : P1;
  }

  function takeFromBag(side) {
    if (!side.bag.length) {
      side.bag = TYPES.slice();
      for (let i = side.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [side.bag[i], side.bag[j]] = [side.bag[j], side.bag[i]];
      }
    }
    return side.bag.shift();
  }

  function collide(board, shape, offsetX, offsetY) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = offsetX + c;
        const y = offsetY + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && board[y][x]) return true;
      }
    }
    return false;
  }

  function rotated(shape) {
    const size = shape.length;
    return shape.map((row, r) => row.map((_cell, c) => shape[size - 1 - c][r]));
  }

  function makePiece(side) {
    const type = takeFromBag(side);
    const source = PIECES[type].shape;
    return {
      type,
      shape: source.map(row => row.slice()),
      color: PIECES[type].color,
      x: Math.floor((COLS - source[0].length) / 2),
      y: type === 'I' ? -1 : 0
    };
  }

  function spawn(side) {
    side.cur = makePiece(side);
    if (collide(side.board, side.cur.shape, side.cur.x, side.cur.y)) {
      endRound(opponent(side));
    }
    draw(side);
  }

  function active(side) {
    return started && !roundOver && !side.over && !!side.cur;
  }

  function move(side, dx) {
    if (!active(side)) return;
    if (!collide(side.board, side.cur.shape, side.cur.x + dx, side.cur.y)) side.cur.x += dx;
    draw(side);
  }

  function rotate(side) {
    if (!active(side) || side.cur.type === 'O') return;
    const shape = rotated(side.cur.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collide(side.board, shape, side.cur.x + kick, side.cur.y)) {
        side.cur.shape = shape;
        side.cur.x += kick;
        break;
      }
    }
    draw(side);
  }

  function softDrop(side) {
    if (!active(side)) return;
    if (!collide(side.board, side.cur.shape, side.cur.x, side.cur.y + 1)) {
      side.cur.y++;
      side.score++;
      updateStats(side);
    }
    draw(side);
  }

  function hardDrop(side) {
    if (!active(side)) return;
    while (!collide(side.board, side.cur.shape, side.cur.x, side.cur.y + 1)) {
      side.cur.y++;
      side.score += 2;
    }
    lock(side);
  }

  function lock(side) {
    const shape = side.cur.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const y = side.cur.y + r;
        const x = side.cur.x + c;
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) side.board[y][x] = side.cur.color;
      }
    }
    clearLines(side);
    if (!roundOver) spawn(side);
    updateStats(side);
    draw(side);
  }

  function clearLines(side) {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (side.board[r].every(Boolean)) {
        side.board.splice(r, 1);
        side.board.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    if (!cleared) return;

    side.lines += cleared;
    side.score += [0, 100, 300, 500, 800][cleared] * side.level;
    side.level = Math.floor(side.lines / 10) + 1;
    side.interval = Math.max(MIN_MS, BASE_MS - (side.level - 1) * SPEED_STEP);
    if (cleared >= 2 && !opponent(side).over) addGarbage(opponent(side), cleared - 1);
    updateStats(side);
  }

  function addGarbage(side, count) {
    for (let i = 0; i < count; i++) {
      side.board.shift();
      const row = Array(COLS).fill(GARBAGE_COLOR);
      row[Math.floor(Math.random() * COLS)] = null;
      side.board.push(row);
    }
    if (side.cur && collide(side.board, side.cur.shape, side.cur.x, side.cur.y)) {
      side.cur.y--;
      if (collide(side.board, side.cur.shape, side.cur.x, side.cur.y)) {
        side.over = true;
        endRound(opponent(side));
      }
    }
  }

  function updateStats(side) {
    side.scoreEl.textContent = side.score;
    side.linesEl.textContent = side.lines;
    side.levelEl.textContent = side.level;
  }

  function drawGrid(ctx) {
    ctx.fillStyle = '#10131b';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    ctx.strokeStyle = 'rgba(148, 184, 220, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(c * CELL + .5, 0);
      ctx.lineTo(c * CELL + .5, ROWS * CELL);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.moveTo(0, r * CELL + .5);
      ctx.lineTo(COLS * CELL, r * CELL + .5);
    }
    ctx.stroke();
  }

  function drawCell(ctx, x, y, color) {
    if (x < 0 || x >= COLS || y < 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 4);
  }

  function draw(side) {
    drawGrid(side.ctx);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (side.board[r][c]) drawCell(side.ctx, c, r, side.board[r][c]);
      }
    }
    if (!side.cur) return;

    let ghostY = side.cur.y;
    while (!collide(side.board, side.cur.shape, side.cur.x, ghostY + 1)) ghostY++;
    side.ctx.globalAlpha = .18;
    side.cur.shape.forEach((row, r) => row.forEach((value, c) => {
      if (value) drawCell(side.ctx, side.cur.x + c, ghostY + r, side.cur.color);
    }));
    side.ctx.globalAlpha = 1;

    side.cur.shape.forEach((row, r) => row.forEach((value, c) => {
      if (value) drawCell(side.ctx, side.cur.x + c, side.cur.y + r, side.cur.color);
    }));
  }

  function stepDown(side) {
    if (!active(side)) return;
    if (!collide(side.board, side.cur.shape, side.cur.x, side.cur.y + 1)) {
      side.cur.y++;
    } else {
      lock(side);
    }
    draw(side);
  }

  function loop(ts) {
    if (lastTs == null) lastTs = ts;
    const delta = Math.min(ts - lastTs, 100);
    lastTs = ts;
    if (started && !roundOver) {
      [P1, P2].forEach(side => {
        side.acc += delta;
        while (side.acc >= side.interval && !roundOver && !side.over) {
          side.acc -= side.interval;
          stepDown(side);
        }
      });
      draw(P1);
      draw(P2);
    }
    requestAnimationFrame(loop);
  }

  function resetSide(side) {
    side.board = newBoard();
    side.cur = null;
    side.bag = [];
    side.score = 0;
    side.lines = 0;
    side.level = 1;
    side.interval = BASE_MS;
    side.acc = 0;
    side.over = false;
    updateStats(side);
    draw(side);
  }

  function startMatch() {
    started = true;
    roundOver = false;
    resetSide(P1);
    resetSide(P2);
    spawn(P1);
    spawn(P2);
    draw(P1);
    draw(P2);
    overlay.classList.add('hidden');
    ovBtn.blur();
  }

  function endRound(winner) {
    if (roundOver) return;
    roundOver = true;
    ovTitle.textContent = winner ? `🏆 ${winner.label} 获胜！` : '对局结束';
    ovTitle.className = winner ? winner.label.toLowerCase() + 'win' : '';
    ovText.textContent = '按 R 或点击按钮再来一局';
    ovBtn.textContent = '再来一局 (R)';
    overlay.classList.remove('hidden');
    [P1, P2].forEach(side => {
      draw(side);
      side.ctx.fillStyle = 'rgba(6, 10, 18, .72)';
      side.ctx.fillRect(0, 0, side.canvas.width, side.canvas.height);
    });
  }

  function showStartOverlay() {
    ovTitle.textContent = '🧱 俄罗斯方块';
    ovTitle.className = '';
    ovText.innerHTML = '1P：A/D 移动 · W 旋转 · S 软降 · Space 硬降<br>2P：←/→ 移动 · ↑ 旋转 · ↓ 软降 · Enter 硬降';
    ovBtn.textContent = '开始对局';
    overlay.classList.remove('hidden');
  }

  const handledKeys = new Set([
    'KeyA', 'KeyD', 'KeyS', 'KeyW', 'Space', 'KeyR',
    'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Enter'
  ]);

  window.addEventListener('keydown', event => {
    if (!handledKeys.has(event.code)) return;
    event.preventDefault();
    if (event.code === 'KeyR') {
      if (started) startMatch();
      return;
    }
    if (!started || roundOver) {
      if (event.code === 'Enter' || event.code === 'Space') startMatch();
      return;
    }
    if (event.repeat && ['Space', 'Enter'].includes(event.code)) return;
    switch (event.code) {
      case 'KeyA': move(P1, -1); break;
      case 'KeyD': move(P1, 1); break;
      case 'KeyW': rotate(P1); break;
      case 'KeyS': softDrop(P1); break;
      case 'Space': hardDrop(P1); break;
      case 'ArrowLeft': move(P2, -1); break;
      case 'ArrowRight': move(P2, 1); break;
      case 'ArrowUp': rotate(P2); break;
      case 'ArrowDown': softDrop(P2); break;
      case 'Enter': hardDrop(P2); break;
    }
  });

  ovBtn.addEventListener('click', () => {
    if (!started || roundOver) startMatch();
  });

  showStartOverlay();
  resetSide(P1);
  resetSide(P2);
  requestAnimationFrame(loop);
}());
