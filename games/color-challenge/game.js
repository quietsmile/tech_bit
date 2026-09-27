/* 颜色大挑战 —— 游戏逻辑（纯原生 JS，无外部依赖） */
(function () {
  "use strict";

  var TOTAL_LEVELS = 8;
  var MAX_HEARTS = 3;
  var TIME_BONUS_PER_SEC = 10;
  var BEST_KEY = "colorChallengeBest";

  var state = {
    level: 1,
    score: 0,
    hearts: MAX_HEARTS,
    timeLeft: 0,
    timerId: null,
    oddIndex: -1,
    locked: false,
    soundOn: true,
    audioCtx: null,
    best: loadBest()
  };

  var el = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    el.startScreen = document.getElementById("start-screen");
    el.gameScreen = document.getElementById("game-screen");
    el.resultScreen = document.getElementById("result-screen");
    el.startBtn = document.getElementById("start-btn");
    el.bestRecord = document.getElementById("best-record");
    el.levelValue = document.getElementById("level-value");
    el.score = document.getElementById("score");
    el.hearts = document.getElementById("hearts");
    el.timer = document.getElementById("timer");
    el.timerChip = document.getElementById("timer-chip");
    el.soundToggle = document.getElementById("sound-toggle");
    el.progressBar = document.getElementById("progress-bar");
    el.levelTip = document.getElementById("level-tip");
    el.board = document.getElementById("board");
    el.feedback = document.getElementById("feedback");
    el.ratingIcon = document.getElementById("rating-icon");
    el.ratingTitle = document.getElementById("rating-title");
    el.resultLevel = document.getElementById("result-level");
    el.ratingDesc = document.getElementById("rating-desc");
    el.statScore = document.getElementById("stat-score");
    el.statLevel = document.getElementById("stat-level");
    el.statBest = document.getElementById("stat-best");
    el.newRecord = document.getElementById("new-record");
    el.backBtn = document.getElementById("back-levels-btn");
    el.restartBtn = document.getElementById("restart-btn");

    el.startBtn.addEventListener("click", startGame);
    el.restartBtn.addEventListener("click", startGame);
    el.backBtn.addEventListener("click", showStart);
    el.soundToggle.addEventListener("click", toggleSound);

    renderBest();
  }

  /* ===== 记录 ===== */
  function loadBest() {
    try {
      var raw = localStorage.getItem(BEST_KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (data && typeof data.score === "number") {
        return { score: data.score, level: data.level || 0 };
      }
    } catch (e) { /* 忽略 */ }
    return { score: 0, level: 0 };
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(state.best));
    } catch (e) { /* 忽略 */ }
  }

  function renderBest() {
    if (state.best.score > 0) {
      el.bestRecord.textContent = "🏆 最高分 " + state.best.score + " · 到达第 " + state.best.level + " 关";
    } else {
      el.bestRecord.textContent = "暂无记录，快来创造！";
    }
  }

  /* ===== 关卡参数 ===== */
  function gridSize(level) {
    return level + 1; /* 2×2 → 9×9 */
  }

  function colorDelta(level) {
    return Math.max(5, Math.round(30 * Math.pow(0.82, level - 1)));
  }

  function timeLimit(level) {
    return Math.max(11, 21 - level);
  }

  /* ===== 流程 ===== */
  function showScreen(name) {
    el.startScreen.classList.toggle("hidden", name !== "start");
    el.gameScreen.classList.toggle("hidden", name !== "game");
    el.resultScreen.classList.toggle("hidden", name !== "result");
  }

  function showStart() {
    stopTimer();
    state.locked = false;
    renderBest();
    showScreen("start");
  }

  function startGame() {
    state.level = 1;
    state.score = 0;
    state.hearts = MAX_HEARTS;
    state.locked = false;
    showScreen("game");
    startLevel();
  }

  function startLevel() {
    stopTimer();
    state.locked = false;
    state.timeLeft = timeLimit(state.level);
    buildBoard();
    updateHUD();
    setFeedback("");
    startTimer();
  }

  function buildBoard() {
    var n = gridSize(state.level);
    var total = n * n;
    var delta = colorDelta(state.level);
    var hue = Math.floor(Math.random() * 360);
    var sat = Math.round(45 + Math.random() * 25);   /* 45%–70% */
    var light = Math.round(38 + Math.random() * 24); /* 38%–62% */
    var oddLight;

    if (Math.random() < 0.5) {
      oddLight = Math.min(92, light + delta);
    } else {
      oddLight = Math.max(8, light - delta);
    }

    state.oddIndex = Math.floor(Math.random() * total);

    var baseColor = "hsl(" + hue + ", " + sat + "%, " + light + "%)";
    var oddColor = "hsl(" + hue + ", " + sat + "%, " + oddLight + "%)";

    el.board.innerHTML = "";
    el.board.style.setProperty("--cols", n);
    el.board.style.setProperty("--gap", n > 8 ? "4px" : n > 5 ? "5px" : "7px");
    el.board.style.setProperty("--radius", n > 8 ? "6px" : n > 5 ? "9px" : "12px");

    for (var i = 0; i < total; i++) {
      var cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.dataset.index = i;
      if (i === state.oddIndex) {
        cell.style.background = oddColor;
      } else {
        cell.style.background = baseColor;
      }
      cell.addEventListener("click", onCellClick);
      el.board.appendChild(cell);
    }

    el.levelTip.textContent = "第 " + state.level + " 关 · " + n + "×" + n + " · 找出颜色不同的色块";
  }

  function getOddCell() {
    return el.board.querySelector('.cell[data-index="' + state.oddIndex + '"]');
  }

  /* ===== 交互 ===== */
  function onCellClick(event) {
    if (state.locked) return;
    var cell = event.currentTarget;
    if (Number(cell.dataset.index) === state.oddIndex) {
      handleCorrect(cell);
    } else {
      handleWrong(cell);
    }
  }

  function handleCorrect(cell) {
    state.locked = true;
    stopTimer();
    var gained = state.level * 100 + state.timeLeft * TIME_BONUS_PER_SEC;
    state.score += gained;
    updateHUD();
    cell.classList.add("odd-found");
    setFeedback("✅ 找对啦！ +" + gained + " 分", "ok");
    playCorrect();
    confetti();
    setTimeout(function () {
      if (state.level >= TOTAL_LEVELS) {
        endGame(true);
      } else {
        state.level++;
        startLevel();
      }
    }, 950);
  }

  function handleWrong(cell) {
    state.locked = true;
    state.hearts--;
    updateHUD();
    cell.classList.add("wrong");
    playWrong();
    if (state.hearts <= 0) {
      stopTimer();
      revealOdd();
      setFeedback("💔 心用完了！", "bad");
      setTimeout(function () { endGame(false); }, 1200);
    } else {
      setFeedback("❌ 不是它！还剩 " + state.hearts + " 颗心", "bad");
      (function (wrongCell) {
        setTimeout(function () {
          wrongCell.classList.remove("wrong");
          state.locked = false;
        }, 380);
      })(cell);
    }
  }

  function revealOdd() {
    var odd = getOddCell();
    if (odd) odd.classList.add("odd-reveal");
  }

  function onTimeout() {
    stopTimer();
    state.locked = true;
    state.hearts--;
    updateHUD();
    revealOdd();
    playWrong();
    if (state.hearts <= 0) {
      setFeedback("⏰ 超时，挑战结束！", "bad");
      setTimeout(function () { endGame(false); }, 1300);
    } else {
      setFeedback("⏰ 超时啦！还剩 " + state.hearts + " 颗心，换个颜色再试", "warn");
      setTimeout(startLevel, 1300);
    }
  }

  function endGame(completed) {
    stopTimer();
    var reachedLevel = completed ? TOTAL_LEVELS : state.level;
    var isNewRecord = state.score > state.best.score;
    if (isNewRecord) {
      state.best = { score: state.score, level: reachedLevel };
      saveBest();
    }

    var rating;
    if (completed && state.hearts === MAX_HEARTS) {
      rating = { icon: "🏆", title: "神级鹰眼", desc: "满心通关！色彩感知力惊人，你就是行走的取色器！" };
    } else if (completed) {
      rating = { icon: "🥇", title: "色彩大师", desc: "全部 8 关通关！任何色差都逃不过你的眼睛。" };
    } else if (state.level >= 7) {
      rating = { icon: "🥈", title: "色彩高手", desc: "已经闯到第 " + state.level + " 关，差一点点就通关啦！" };
    } else if (state.level >= 4) {
      rating = { icon: "🥉", title: "渐入佳境", desc: "闯到第 " + state.level + " 关，多练练眼力，下次更远！" };
    } else {
      rating = { icon: "🌈", title: "继续加油", desc: "眼力是需要热身的，再来一局突破自己！" };
    }

    el.ratingIcon.textContent = rating.icon;
    el.ratingTitle.textContent = rating.title;
    el.resultLevel.textContent = completed ? "通过全部 " + TOTAL_LEVELS + " 关" : "到达第 " + state.level + " 关";
    el.ratingDesc.textContent = rating.desc;
    el.statScore.textContent = state.score;
    el.statLevel.textContent = reachedLevel;
    el.statBest.textContent = state.best.score;
    el.newRecord.classList.toggle("hidden", !isNewRecord);

    if (completed) {
      if (window.SoloTitles) SoloTitles.grant("color");
      playWin();
      confetti();
      setTimeout(confetti, 350);
    } else {
      playLose();
    }
    showScreen("result");
  }

  /* ===== 计时 ===== */
  function startTimer() {
    stopTimer();
    updateTimerUI();
    state.timerId = setInterval(function () {
      state.timeLeft--;
      updateTimerUI();
      if (state.timeLeft <= 0) {
        onTimeout();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function updateTimerUI() {
    el.timer.textContent = state.timeLeft;
    el.timerChip.classList.toggle("danger", state.timeLeft <= 5);
  }

  /* ===== HUD ===== */
  function updateHUD() {
    el.levelValue.textContent = state.level;
    el.score.textContent = state.score;
    el.hearts.textContent = "♥".repeat(Math.max(0, state.hearts)) + "♡".repeat(Math.max(0, MAX_HEARTS - state.hearts));
    el.progressBar.style.width = ((state.level - 1) / TOTAL_LEVELS) * 100 + "%";
  }

  function setFeedback(text, cls) {
    el.feedback.textContent = text;
    el.feedback.className = "feedback" + (cls ? " " + cls : "");
  }

  /* ===== 彩纸 ===== */
  function confetti() {
    var layer = document.createElement("div");
    layer.className = "confetti-layer";
    var colors = ["#f5576c", "#ffd166", "#06d6a0", "#4facfe", "#a78bfa", "#fb7185"];
    for (var i = 0; i < 18; i++) {
      var piece = document.createElement("span");
      piece.className = "confetti";
      piece.style.background = colors[i % colors.length];
      piece.style.setProperty("--dx", Math.round((Math.random() * 2 - 1) * 180) + "px");
      piece.style.setProperty("--dy", Math.round(-(60 + Math.random() * 140)) + "px");
      piece.style.animationDelay = (Math.random() * 0.15) + "s";
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 1200);
  }

  /* ===== 音效 ===== */
  function ensureAudio() {
    if (!state.soundOn) return null;
    if (!state.audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) state.audioCtx = new Ctx();
    }
    if (state.audioCtx && state.audioCtx.state === "suspended") {
      state.audioCtx.resume();
    }
    return state.audioCtx;
  }

  function beep(freq, duration, type, delay, volume) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var start = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.12, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  }

  function playCorrect() {
    beep(660, 0.12, "sine", 0, 0.12);
    beep(880, 0.18, "sine", 0.1, 0.12);
  }

  function playWrong() {
    beep(180, 0.25, "sawtooth", 0, 0.08);
    beep(140, 0.3, "sawtooth", 0.12, 0.08);
  }

  function playWin() {
    beep(523, 0.15, "sine", 0, 0.12);
    beep(659, 0.15, "sine", 0.13, 0.12);
    beep(784, 0.15, "sine", 0.26, 0.12);
    beep(1047, 0.4, "sine", 0.39, 0.14);
  }

  function playLose() {
    beep(330, 0.2, "triangle", 0, 0.1);
    beep(262, 0.2, "triangle", 0.18, 0.1);
    beep(196, 0.4, "triangle", 0.36, 0.1);
  }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    el.soundToggle.textContent = state.soundOn ? "🔊" : "🔇";
    if (state.soundOn) beep(660, 0.1, "sine", 0, 0.1);
  }

  window.ChallengeArena = ChallengeArena.create({
    gameId: "color-challenge",
    gameName: "颜色大挑战",
    onBegin: function () { startGame(); },
    onRestart: function () { startGame(); },
    getProgress: function () {
      return {
        score: state.score,
        level: state.level,
        status: state.finished ? "finished" : "playing"
      };
    }
  });

})();
