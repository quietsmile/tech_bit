(function () {
  "use strict";

  var SIZE = 15;
  var WIN_COUNT = 5;
  var DIRECTIONS = [[0,1],[1,0],[1,1],[1,-1]];
  var BADGE_KEY = "gomoku_badge_zhuge";

  var board, moves, currentPlayer, gameOver, aiThinking;
  var mode = null; // pve / pvp
  var difficulty = "normal";
  var stats = { win: 0, lose: 0, draw: 0 };
  var aiTimer = null;

  var startScreen = document.getElementById("startScreen");
  var gameScreen = document.getElementById("gameScreen");
  var difficultyBox = document.getElementById("difficultyBox");
  var boardEl = document.getElementById("board");
  var statusEl = document.getElementById("status");
  var resultEl = document.getElementById("result");
  var badgeBox = document.getElementById("badgeBox");
  var modeInfoEl = document.getElementById("modeInfo");
  var statsEl = document.getElementById("stats");
  var undoBtn = document.getElementById("undoBtn");
  var restartBtn = document.getElementById("restartBtn");
  var menuBtn = document.getElementById("menuBtn");
  var cells = [];

  function createBoardState() {
    board = [];
    moves = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(0);
      board.push(row);
    }
    currentPlayer = 1;
    gameOver = false;
    aiThinking = false;
  }

  function createBoardElement() {
    boardEl.innerHTML = "";
    cells = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.style.left = ((c + 0.5) * 100 / SIZE) + "%";
        cell.style.top = ((r + 0.5) * 100 / SIZE) + "%";
        cell.setAttribute("data-row", String(r));
        cell.setAttribute("data-col", String(c));
        cell.addEventListener("click", onCellClick);
        boardEl.appendChild(cell);
        row.push(cell);
      }
      cells.push(row);
    }
  }

  function onCellClick(event) {
    var target = event.currentTarget;
    var r = Number(target.getAttribute("data-row"));
    var c = Number(target.getAttribute("data-col"));
    if (gameOver || aiThinking || board[r][c] !== 0) return;
    if (mode === "pve" && currentPlayer !== 1) return;
    placeStone(r, c);
  }

  function inBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

  function findWinLine(r, c, player) {
    for (var i = 0; i < DIRECTIONS.length; i++) {
      var dr = DIRECTIONS[i][0], dc = DIRECTIONS[i][1];
      var line = [[r, c]];
      collectLine(r, c, dr, dc, player, line);
      collectLine(r, c, -dr, -dc, player, line);
      if (line.length >= WIN_COUNT) return line;
    }
    return null;
  }

  function collectLine(r, c, dr, dc, player, line) {
    var nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc) && board[nr][nc] === player) {
      line.push([nr, nc]);
      nr += dr; nc += dc;
    }
  }

  function placeStone(r, c) {
    board[r][c] = currentPlayer;
    moves.push([r, c]);
    renderStone(r, c, currentPlayer);
    var winLine = findWinLine(r, c, currentPlayer);
    if (winLine) {
      gameOver = true;
      highlightWin(winLine);
      finishGame(currentPlayer);
    } else if (moves.length === SIZE * SIZE) {
      gameOver = true;
      finishGame(0);
    } else {
      currentPlayer = currentPlayer === 1 ? 2 : 1;
      updateStatus();
      if (mode === "pve" && currentPlayer === 2) scheduleAi();
    }
    updateButtons();
  }

  function finishGame(winner) {
    statusEl.textContent = "游戏结束";
    if (mode === "pve") {
      if (winner === 1) {
        stats.win += 1;
        resultEl.textContent = "🎉 你获胜！获得称号“棋盘小诸葛”";
        unlockBadge();
        badgeBox.hidden = false;
      } else if (winner === 2) {
        stats.lose += 1;
        resultEl.textContent = "电脑获胜，再试一次！";
        badgeBox.hidden = true;
      } else {
        stats.draw += 1;
        resultEl.textContent = "平局，棋盘已下满。";
        badgeBox.hidden = true;
      }
      saveStats();
      renderStats();
    } else {
      badgeBox.hidden = true;
      resultEl.textContent = winner === 0 ? "平局，棋盘已下满。" : (winner === 1 ? "黑棋获胜！" : "白棋获胜！");
    }
    resultEl.hidden = false;
  }

  function saveStats() {
    try { localStorage.setItem("gomoku_pve_stats", JSON.stringify(stats)); } catch (e) {}
  }

  function loadStats() {
    try {
      var raw = localStorage.getItem("gomoku_pve_stats");
      if (raw) {
        var value = JSON.parse(raw);
        stats.win = Number(value.win) || 0;
        stats.lose = Number(value.lose) || 0;
        stats.draw = Number(value.draw) || 0;
      }
    } catch (e) {}
  }

  function renderStats() {
    if (mode !== "pve") { statsEl.textContent = ""; return; }
    statsEl.textContent = "单人战绩：胜 " + stats.win + " · 负 " + stats.lose + " · 平 " + stats.draw;
  }

  function unlockBadge() {
    try {
      localStorage.setItem(BADGE_KEY, JSON.stringify({ earnedAt: new Date().toISOString() }));
    } catch (e) {}
  }

  function renderSavedBadge() {
    var earned = false;
    try { earned = Boolean(localStorage.getItem(BADGE_KEY)); } catch (e) {}
    badgeBox.hidden = !earned || mode !== "pve";
  }

  function renderStone(r, c, player) {
    var stone = document.createElement("div");
    stone.className = "stone " + (player === 1 ? "black" : "white");
    cells[r][c].appendChild(stone);
  }

  function highlightWin(line) {
    for (var i = 0; i < line.length; i++) {
      cells[line[i][0]][line[i][1]].firstChild.classList.add("win");
    }
  }

  function updateStatus() {
    statusEl.textContent = mode === "pve"
      ? (currentPlayer === 1 ? "当前回合：你（黑棋）" : "电脑思考中…")
      : "当前回合：" + (currentPlayer === 1 ? "黑棋" : "白棋");
  }

  function updateButtons() {
    undoBtn.disabled = moves.length === 0 || gameOver || aiThinking;
    restartBtn.disabled = moves.length === 0 && !gameOver;
  }

  function undo() {
    if (moves.length === 0 || gameOver || aiThinking) return;
    if (mode === "pve") {
      if (moves.length < 2) return;
      removeLastStone();
      removeLastStone();
      currentPlayer = 1;
    } else {
      removeLastStone();
      currentPlayer = currentPlayer === 1 ? 2 : 1;
    }
    clearResult();
    updateStatus();
    updateButtons();
  }

  function removeLastStone() {
    var last = moves.pop();
    if (!last) return;
    board[last[0]][last[1]] = 0;
    cells[last[0]][last[1]].innerHTML = "";
  }

  function clearResult() {
    resultEl.textContent = "";
    resultEl.hidden = true;
  }

  function restart() {
    if (aiTimer) clearTimeout(aiTimer);
    createBoardState();
    clearResult();
    createBoardElement();
    renderSavedBadge();
    renderStats();
    updateStatus();
    updateButtons();
  }

  function startPve() {
    difficultyBox.hidden = false;
  }

  function startGame(selectedMode, selectedDifficulty) {
    mode = selectedMode;
    difficulty = selectedDifficulty || "normal";
    difficultyBox.hidden = true;
    startScreen.hidden = true;
    gameScreen.hidden = false;
    modeInfoEl.textContent = mode === "pve"
      ? "模式：单人挑战（人机）· 强度：" + ({ easy:"简单", normal:"普通", hard:"困难" })[difficulty]
      : "模式：双人对战";
    restart();
  }

  function backToMenu() {
    if (aiTimer) clearTimeout(aiTimer);
    mode = null;
    gameScreen.hidden = true;
    startScreen.hidden = false;
    difficultyBox.hidden = true;
  }

  function scheduleAi() {
    aiThinking = true;
    updateButtons();
    updateStatus();
    var delay = difficulty === "easy" ? 220 : difficulty === "normal" ? 360 : 500;
    aiTimer = setTimeout(function () {
      var move = chooseAiMove();
      aiThinking = false;
      aiTimer = null;
      if (move) placeStone(move[0], move[1]);
    }, delay);
  }

  function lineCount(r, c, dr, dc, player) {
    var n = 0;
    var nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc) && board[nr][nc] === player) { n++; nr += dr; nc += dc; }
    return n;
  }

  function openEnds(r, c, dr, dc, player) {
    var opens = 0;
    if (inBoard(r - dr, c - dc) && board[r - dr][c - dc] === 0) opens++;
    if (inBoard(r + dr * (lineCount(r,c,dr,dc,player) + 1), c + dc * (lineCount(r,c,dr,dc,player) + 1)) && board[r + dr * (lineCount(r,c,dr,dc,player) + 1)][c + dc * (lineCount(r,c,dr,dc,player) + 1)] === 0) opens++;
    return opens;
  }

  function moveScore(r, c, player) {
    if (board[r][c] !== 0) return -1;
    board[r][c] = player;
    var score = 0;
    if (findWinLine(r, c, player)) {
      board[r][c] = 0;
      return 1000000;
    }
    for (var i = 0; i < DIRECTIONS.length; i++) {
      var dr = DIRECTIONS[i][0], dc = DIRECTIONS[i][1];
      var count = lineCount(r, c, dr, dc, player) + 1;
      var open = openEnds(r, c, dr, dc, player);
      if (count >= 5) score += 1000000;
      else if (count === 4) score += open >= 2 ? 50000 : 10000;
      else if (count === 3) score += open >= 2 ? 5000 : 1000;
      else if (count === 2) score += open >= 2 ? 400 : 100;
      score += open * 20;
    }
    board[r][c] = 0;
    return score;
  }

  function candidateMoves(radius) {
    var seen = {};
    var list = [];
    if (moves.length === 0) return [[7, 7]];
    for (var i = 0; i < moves.length; i++) {
      for (var dr = -radius; dr <= radius; dr++) {
        for (var dc = -radius; dc <= radius; dc++) {
          var r = moves[i][0] + dr, c = moves[i][1] + dc;
          if (!inBoard(r, c) || board[r][c] !== 0) continue;
          var key = r * SIZE + c;
          if (seen[key]) continue;
          seen[key] = true;
          list.push([r, c]);
        }
      }
    }
    return list;
  }

  function chooseAiMove() {
    var radius = difficulty === "easy" ? 1 : difficulty === "normal" ? 2 : 3;
    var candidates = candidateMoves(radius);
    if (candidates.length === 0) candidates = candidateMoves(SIZE);
    var ai = 2, human = 1;
    var scored = [];
    for (var i = 0; i < candidates.length; i++) {
      var r = candidates[i][0], c = candidates[i][1];
      var attack = moveScore(r, c, ai);
      if (attack >= 1000000) return [r, c];
      var block = moveScore(r, c, human);
      if (block >= 1000000) return [r, c];
      scored.push({
        r: r, c: c,
        attack: attack,
        block: block,
        score: attack + block * (difficulty === "easy" ? .35 : difficulty === "normal" ? .85 : 1)
      });
    }
    scored.sort(function (a, b) { return b.score - a.score; });

    if (difficulty !== "hard") {
      var noise = difficulty === "easy" ? 1200 : 150;
      var pick = scored[0];
      for (var j = 0; j < scored.length; j++) {
        if (scored[j].score + Math.random() * noise > pick.score + Math.random() * noise) pick = scored[j];
      }
      return [pick.r, pick.c];
    }

    /* 困难：两步预判——我方落子后，推演对手最强反击，综合打分 */
    var top = scored.slice(0, 12);
    var best = null, bestFinal = -Infinity;
    for (var k = 0; k < top.length; k++) {
      var myScore = top[k].attack + top[k].block * 0.4;
      var oppBest = bestOpponentReply(top[k].r, top[k].c);
      var finalScore = myScore - oppBest * 0.95 + Math.random() * 30;
      if (finalScore > bestFinal) { bestFinal = finalScore; best = [top[k].r, top[k].c]; }
    }
    return best || [scored[0].r, scored[0].c];
  }

  /* 假设 AI 落在 (r,c)，计算对手下一步的最高得分（用于削弱对手最强反击） */
  function bestOpponentReply(r, c) {
    var ai = 2, human = 1;
    board[r][c] = ai;
    var best = -Infinity;
    var replies = candidateMoves(2);
    for (var i = 0; i < replies.length; i++) {
      var s = moveScore(replies[i][0], replies[i][1], human);
      if (s > best) best = s;
    }
    board[r][c] = 0;
    return best;
  }

  document.getElementById("modePve").addEventListener("click", startPve);
  document.getElementById("modePvp").addEventListener("click", function () { startGame("pvp"); });
  Array.prototype.forEach.call(document.querySelectorAll(".difficulty"), function (button) {
    button.addEventListener("click", function () { startGame("pve", button.getAttribute("data-level")); });
  });
  menuBtn.addEventListener("click", backToMenu);
  undoBtn.addEventListener("click", undo);
  restartBtn.addEventListener("click", restart);

  loadStats();
})();
