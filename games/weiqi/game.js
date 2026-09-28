/* 围棋 9 路规则 + 简单人机（纯 JS，无依赖）
 * 0 空 / 1 黑 / 2 白；区域计分（子+围空），白贴 5.5 目。
 */
(function () {
  'use strict';

  var N = 9;
  var KOMI = 5.5;
  var aiLevel = document.getElementById('aiLevel').value || 'normal';
  var board, current, passes, captures, history, koStr, gameOver, mode;
  var lastMove = null; // {r,c} 或 'pass'
  var evaluationOverride = null;

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var M = 25, C = 50;

  function resizeCanvas() {
    C = N <= 9 ? 50 : N <= 13 ? 38 : 30;
    var size = M * 2 + C * (N - 1);
    canvas.width = size;
    canvas.height = size;
  }

  function starPoints(n) {
    if (n === 9) return [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]];
    if (n === 13) return [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6]];
    var e = 3, m = n - 4, mid = n >> 1;
    var pts = [[e, e], [e, m], [m, e], [m, m], [e, mid], [mid, e], [mid, m], [m, mid], [mid, mid]];
    var seen = {}, out = [];
    pts.forEach(function (p2) {
      var k = p2[0] + ',' + p2[1];
      if (!seen[k]) { seen[k] = 1; out.push(p2); }
    });
    return out;
  }
  var scoreEl = document.getElementById('scoreInfo');
  var turnEl = document.getElementById('turnInfo');
  var capEl = document.getElementById('capInfo');
  var msgEl = document.getElementById('msg');
  var resultEl = document.getElementById('result');
  var boardEl = document.getElementById('boardWrap');

  function neighbors(r, c) {
    var out = [];
    if (r > 0) out.push([r - 1, c]);
    if (r < N - 1) out.push([r + 1, c]);
    if (c > 0) out.push([r, c - 1]);
    if (c < N - 1) out.push([r, c + 1]);
    return out;
  }

  function groupInfo(bd, r, c) {
    var color = bd[r][c];
    var stones = [], libs = {}, seen = {};
    var stack = [[r, c]];
    seen[r + ',' + c] = 1;
    stones.push([r, c]);
    while (stack.length) {
      var cur = stack.pop();
      neighbors(cur[0], cur[1]).forEach(function (n) {
        var v = bd[n[0]][n[1]];
        var k = n[0] + ',' + n[1];
        if (!v && !libs[k]) { libs[k] = 1; }
        if (v === color && !seen[k]) { seen[k] = 1; stones.push([n[0], n[1]]); stack.push([n[0], n[1]]); }
      });
    }
    return { stones: stones, libs: Object.keys(libs).length };
  }

  function keyOf(bd) { return bd.map(function (row) { return row.join(''); }).join('|'); }

  /* 落子尝试：返回 {legal, board, captured} */
  function tryPlace(bd, r, c, side, koStr) {
    if (bd[r][c] !== 0) return { legal: false, reason: '此处已有棋子' };
    var nb = bd.map(function (row) { return row.slice(); });
    nb[r][c] = side;
    var opp = side === 1 ? 2 : 1;
    var captured = 0;
    neighbors(r, c).forEach(function (n) {
      if (nb[n[0]][n[1]] === opp) {
        var g = groupInfo(nb, n[0], n[1]);
        if (g.libs === 0) {
          g.stones.forEach(function (s) { nb[s[0]][s[1]] = 0; captured++; });
        }
      }
    });
    var own = groupInfo(nb, r, c);
    if (own.libs === 0) return { legal: false, reason: '禁着点（落子后无气）' };
    if (koStr && keyOf(nb) === koStr) return { legal: false, reason: '打劫：不能立即回提' };
    return { legal: true, board: nb, captured: captured };
  }

  /* ---------- 游戏状态 ---------- */
  function newGame(m) {
    mode = m;
    N = Number(document.getElementById('boardSize').value) || 9;
    aiLevel = document.getElementById('aiLevel').value || 'normal';
    resizeCanvas();
    board = Array.from({ length: N }, function () { return Array(N).fill(0); });
    current = 1;
    passes = 0;
    captures = { 1: 0, 2: 0 };
    history = [keyOf(board)];
    koStr = '';
    gameOver = false;
    evaluationOverride = null;
    lastMove = null;
    resultEl.classList.add('hidden');
    boardEl.classList.remove('hidden');
    document.getElementById('controls').classList.remove('hidden');
    updateInfo();
    draw();
  }

  function place(r, c) {
    if (gameOver) return;
    var res = tryPlace(board, r, c, current, koStr);
    if (!res.legal) { flash(res.reason); return; }
    koStr = keyOf(board);           // 下一手不能重现当前局面
    captures[current] += res.captured;
    board = res.board;
    history.push(keyOf(board));
    passes = 0;
    lastMove = { r: r, c: c };
    current = current === 1 ? 2 : 1;
    updateInfo();
    updateEvaluation();
    draw();
    if (mode === 'ai' && current === 2 && !gameOver) setTimeout(aiMove, 500);
  }

  function doPass() {
    if (gameOver) return;
    passes++;
    lastMove = 'pass';
    if (passes >= 2) { endGame(); return; }
    current = current === 1 ? 2 : 1;
    koStr = '';
    updateInfo();
    draw();
    if (mode === 'ai' && current === 2 && !gameOver) setTimeout(aiMove, 500);
  }

  function flash(text) {
    msgEl.textContent = text;
    setTimeout(function () { if (msgEl.textContent === text) msgEl.textContent = ''; }, 1600);
  }

  /* ---------- 简单人机（白） ---------- */
  var AI_LEVELS = {
    easy:   { capW: 60,  atariW: 15, escapeW: 30, nearW: 10, starW: 3, noise: 70, lookahead: false },
    normal: { capW: 130, atariW: 40, escapeW: 70, nearW: 14, starW: 6, noise: 14, lookahead: false },
    hard:   { capW: 150, atariW: 60, escapeW: 110, nearW: 16, starW: 8, noise: 0, lookahead: true }
  };

  /* 困难 AI 防守预判：对手在局面上的最强一手提子数 */
  function bestOppCapture(bd) {
    var best = 0;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      if (bd[r][c] !== 0) continue;
      var res = tryPlace(bd, r, c, 1, koStr);
      if (res.legal && res.captured > best) best = res.captured;
    }
    return best;
  }

  function aiMove() {
    if (gameOver) return;
    var cfg = AI_LEVELS[aiLevel] || AI_LEVELS.normal;
    var best = null, bestScore = -Infinity;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      if (board[r][c] !== 0) continue;
      var res = tryPlace(board, r, c, 2, koStr);
      if (!res.legal) continue;
      var score = res.captured * cfg.capW;
      // 打吃：让黑群只剩 1 气
      var oppAtari = 0;
      neighbors(r, c).forEach(function (n) {
        if (board[n[0]][n[1]] === 1) {
          var nb = board.map(function (row) { return row.slice(); });
          nb[r][c] = 2;
          neighbors(n[0], n[1]).forEach(function (nn) {
            if (nb[nn[0]][nn[1]] === 1) {
              var g = groupInfo(nb, nn[0], nn[1]);
              if (g.libs === 1) oppAtari++;
            }
          });
        }
      });
      score += oppAtari * cfg.atariW;
      var nearAny = 0;
      neighbors(r, c).forEach(function (n) {
        if (board[n[0]][n[1]] !== 0) nearAny++;
      });
      score += nearAny * 6;
      score += (r === 2 || r === 4 || r === 6) && (c === 2 || c === 4 || c === 6) ? cfg.starW : 0; // 星位附近
      score += Math.random() * cfg.noise;
      // 困难：两层推演——再算对手最强一手回应（提子/打吃），净收益高者胜出
      if (cfg.lookahead) {
        var oppBest = 0;
        for (var rr = 0; rr < N; rr++) for (var cc = 0; cc < N; cc++) {
          if (res.board[rr][cc] !== 0) continue;
          var r2 = tryPlace(res.board, rr, cc, 1, koStr);
          if (!r2.legal) continue;
          var g2 = r2.captured * 130;
          neighbors(rr, cc).forEach(function (n) {
            if (r2.board[n[0]][n[1]] === 1) {
              var og = groupInfo(r2.board, n[0], n[1]);
              if (og.libs === 1) g2 += 45;
              else if (og.libs === 2) g2 += 12;
            }
          });
          if (g2 > oppBest) oppBest = g2;
        }
        score -= oppBest * 0.95;
      }
      if (score > bestScore) { bestScore = score; best = { r: r, c: c }; }
    }
    if (!best) { doPass(); return; }
    place(best.r, best.c);
  }

  /* ---------- 终局计分（区域法） ---------- */
  function endGame() {
    gameOver = true;
    var stones = { 1: 0, 2: 0 };
    var visited = {};
    var terr = { 1: 0, 2: 0 };
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) stones[board[r][c]]++;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      if (board[r][c] === 0 && !visited[r + ',' + c]) {
        var region = [], stack = [[r, c]];
        visited[r + ',' + c] = 1;
        var touch = {};
        while (stack.length) {
          var cur = stack.pop();
          region.push(cur);
          neighbors(cur[0], cur[1]).forEach(function (n) {
            var v = board[n[0]][n[1]], k = n[0] + ',' + n[1];
            if (v === 0) { if (!visited[k]) { visited[k] = 1; stack.push([n[0], n[1]]); } }
            else touch[v] = 1;
          });
        }
        if (touch[1] && !touch[2]) terr[1] += region.length;
        else if (touch[2] && !touch[1]) terr[2] += region.length;
      }
    }
    var blackScore = stones[1] + terr[1];
    var whiteScore = stones[2] + terr[2] + KOMI;
    var winner = blackScore > whiteScore ? '黑棋胜' : '白棋胜';
    evaluationOverride = blackScore > whiteScore ? 10000 : -10000;
    var diff = Math.abs(blackScore - whiteScore).toFixed(1);
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = '<h2>🏁 终局</h2>' +
      '<p>黑 ' + blackScore + ' 目 · 白 ' + whiteScore + ' 目（含贴目 ' + KOMI + '）</p>' +
      '<p class="win">' + winner + '（领先 ' + diff + '）</p>' +
      '<button onclick="location.reload()">再来一局</button>';
    boardEl.classList.add('hidden');
    document.getElementById('controls').classList.add('hidden');
    updateEvaluation();
  }

  /* ---------- 绘制 ---------- */
  function updateInfo() {
    turnEl.textContent = gameOver ? '对局结束' : (current === 1 ? '黑方行棋' : '白方行棋');
    capEl.textContent = '黑提 ' + captures[1] + ' · 白提 ' + captures[2];
  }

  function formatEvaluation(score) {
    return score > 0 ? '+' + score : String(score);
  }

  function updateEvaluation() {
    var score = evaluationOverride === null
      ? Math.round(Math.tanh(estimateScore() / (N * N / 3)) * 9800)
      : evaluationOverride;
    scoreEl.textContent = '系统评估（黑棋）：' + formatEvaluation(score) + ' / ±10000';
  }

  function estimateScore() {
    var stones = { 1: 0, 2: 0 };
    var territory = { 1: 0, 2: 0 };
    var liberties = { 1: 0, 2: 0 };
    var visited = {};
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) stones[board[r][c]]++;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      if (board[r][c]) {
        var own = groupInfo(board, r, c);
        liberties[board[r][c]] += Math.min(own.libs, 4);
      } else if (!visited[r + ',' + c]) {
        var region = [], stack = [[r, c]], touch = {};
        visited[r + ',' + c] = 1;
        while (stack.length) {
          var cur = stack.pop();
          region.push(cur);
          neighbors(cur[0], cur[1]).forEach(function (n) {
            var v = board[n[0]][n[1]], k = n[0] + ',' + n[1];
            if (!v) {
              if (!visited[k]) {
                visited[k] = 1;
                stack.push([n[0], n[1]]);
              }
            } else touch[v] = 1;
          });
        }
        if (touch[1] && !touch[2]) territory[1] += region.length;
        else if (touch[2] && !touch[1]) territory[2] += region.length;
      }
    }
    var raw = stones[1] - stones[2] + territory[1] - territory[2] +
      (liberties[1] - liberties[2]) * .18 + captures[1] - captures[2] - KOMI;
    return raw;
  }

  function draw() {
    ctx.fillStyle = '#dcb35c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#5a3c1a';
    for (var i = 0; i < N; i++) {
      ctx.beginPath();
      ctx.moveTo(M, M + i * C); ctx.lineTo(M + (N - 1) * C, M + i * C);
      ctx.moveTo(M + i * C, M); ctx.lineTo(M + i * C, M + (N - 1) * C);
      ctx.stroke();
    }
    // 星位
    starPoints(N).forEach(function (p) {
      ctx.beginPath();
      ctx.arc(M + p[0] * C, M + p[1] * C, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#5a3c1a';
      ctx.fill();
    });
    // 落子
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var v = board[r][c];
      if (!v) continue;
      var x = M + c * C, y = M + r * C;
      ctx.beginPath();
      ctx.arc(x, y, C * 0.44, 0, Math.PI * 2);
      ctx.fillStyle = v === 1 ? '#111' : '#f5f5f5';
      ctx.fill();
      ctx.strokeStyle = v === 1 ? '#000' : '#999';
      ctx.stroke();
      if (lastMove && lastMove.r === r && lastMove.c === c) {
        ctx.beginPath();
        ctx.arc(x, y, C * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = v === 1 ? '#f5f5f5' : '#e03131';
        ctx.fill();
      }
    }
  }

  /* ---------- 事件 ---------- */
  canvas.addEventListener('click', function (e) {
    if (gameOver) return;
    if (mode === 'ai' && current === 2) return;
    var rect = canvas.getBoundingClientRect();
    var sx = rect.width / canvas.width, sy = rect.height / canvas.height;
    var x = (e.clientX - rect.left) / sx, y = (e.clientY - rect.top) / sy;
    var c = Math.round((x - M) / C), r = Math.round((y - M) / C);
    if (r < 0 || r >= N || c < 0 || c >= N) return;
    if (Math.abs(x - (M + c * C)) > C * 0.42 || Math.abs(y - (M + r * C)) > C * 0.42) return;
    place(r, c);
  });
  /* 供单元测试使用 */
  if (typeof window !== 'undefined') window.WeiqiRules = { tryPlace, groupInfo, keyOf, N: N };

  document.getElementById('boardSize').addEventListener('change', function () { newGame(mode); });
  document.getElementById('aiLevel').addEventListener('change', function () { aiLevel = document.getElementById('aiLevel').value; });
  document.getElementById('passBtn').addEventListener('click', doPass);
  document.getElementById('restartBtn').addEventListener('click', function () { newGame(mode); });
  document.getElementById('modeAi').addEventListener('click', function () { setMode('ai'); });
  document.getElementById('modePvp').addEventListener('click', function () { setMode('pvp'); });
  function setMode(m) {
    document.getElementById('modeAi').classList.toggle('active', m === 'ai');
    document.getElementById('modePvp').classList.toggle('active', m === 'pvp');
    newGame(m);
  }

  newGame('ai');
})();
