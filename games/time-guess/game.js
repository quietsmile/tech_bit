/* 猜时间闯关：三关挑战，支持多人轮流和综合排名 */
(function () {
  "use strict";

  var STAGE_COUNT = 3;
  var FIRST_BOUNCE_MS = 750;

  var el = {};
  var state = {
    targetSeconds: 10,
    players: [],
    playerIndex: 0,
    stageIndex: 0,
    running: false,
    stageStart: 0,
    ballFrame: 0,
    autoFinishTimer: 0,
    autoTurnTimer: 0,
    ballStart: 0,
    fallMs: 1500,
    landingAt: 0,
    landingFlashed: false
  };

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("keydown", handleKeydown);

  function init() {
    el.setupScreen = document.getElementById("setup-screen");
    el.setupForm = document.getElementById("setup-form");
    el.targetTime = document.getElementById("target-time");
    el.playerList = document.getElementById("player-list");
    el.addPlayer = document.getElementById("add-player");
    el.setupError = document.getElementById("setup-error");

    el.gameScreen = document.getElementById("game-screen");
    el.stageBadge = document.getElementById("stage-badge");
    el.turnPlayer = document.getElementById("turn-player");
    el.turnTip = document.getElementById("turn-tip");
    el.quitGame = document.getElementById("quit-game");
    el.guessArea = document.getElementById("guess-area");
    el.ballStage = document.getElementById("ball-stage");
    el.ballTrack = document.getElementById("ball-track");
    el.ball = document.getElementById("ball");
    el.timerButton = document.getElementById("timer-button");
    el.timerIcon = document.getElementById("timer-icon");
    el.timerLabel = document.getElementById("timer-label");
    el.timerTip = document.getElementById("timer-tip");
    el.resultArea = document.getElementById("result-area");
    el.resultEmoji = document.getElementById("result-emoji");
    el.resultTitle = document.getElementById("result-title");
    el.actualTime = document.getElementById("actual-time");
    el.actualLabel = document.getElementById("actual-label");
    el.targetDisplay = document.getElementById("target-display");
    el.targetLabel = document.getElementById("target-label");
    el.timeError = document.getElementById("time-error");
    el.errorLabel = document.getElementById("error-label");
    el.scoreLine = document.getElementById("score-line");
    el.nextTurn = document.getElementById("next-turn");
    el.progressText = document.getElementById("progress-text");
    el.progressBar = document.getElementById("progress-bar");

    el.resultScreen = document.getElementById("result-screen");
    el.resultSubtitle = document.getElementById("result-subtitle");
    el.ranking = document.getElementById("ranking");
    el.playAgain = document.getElementById("play-again");
    el.backSetup = document.getElementById("back-setup");

    el.addPlayer.addEventListener("click", function () {
      if (state.players.length >= 8) return;
      state.players.push("玩家 " + (state.players.length + 1));
      renderPlayerInputs();
    });

    el.playerList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-remove]");
      if (!button || state.players.length <= 1) return;
      state.players.splice(Number(button.dataset.remove), 1);
      renderPlayerInputs();
    });

    el.playerList.addEventListener("input", function (event) {
      var input = event.target.closest("[data-player]");
      if (input) state.players[Number(input.dataset.player)] = input.value;
    });

    el.setupForm.addEventListener("submit", function (event) {
      event.preventDefault();
      startGame();
    });

    el.timerButton.addEventListener("click", function (event) {
      event.currentTarget.blur();
      toggleTimer();
    });
    el.nextTurn.addEventListener("click", nextTurn);
    el.quitGame.addEventListener("click", showSetup);
    el.playAgain.addEventListener("click", startGame);
    el.backSetup.addEventListener("click", showSetup);

    state.players = ["玩家 1", "玩家 2"];
    renderPlayerInputs();
  }

  function handleKeydown(event) {
    if (event.code !== "Space" || event.repeat) return;
    if (!el.gameScreen || el.gameScreen.classList.contains("hidden")) return;
    if (!el.resultArea.classList.contains("hidden")) return;
    event.preventDefault();
    el.timerButton.blur();
    toggleTimer();
  }

  function renderPlayerInputs() {
    el.playerList.innerHTML = "";
    state.players.forEach(function (name, index) {
      var row = document.createElement("div");
      row.className = "player-row";

      var badge = document.createElement("div");
      badge.className = "player-index";
      badge.textContent = index + 1;

      var input = document.createElement("input");
      input.type = "text";
      input.maxLength = 14;
      input.value = name;
      input.placeholder = "玩家 " + (index + 1);
      input.dataset.player = String(index);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-player";
      remove.textContent = "✕";
      remove.dataset.remove = String(index);
      remove.title = "删除玩家";

      row.appendChild(badge);
      row.appendChild(input);
      row.appendChild(remove);
      el.playerList.appendChild(row);
    });
  }

  function startGame() {
    var target = Number(el.targetTime.value);
    var names = state.players.map(function (name, index) {
      return String(name || "").trim() || ("玩家 " + (index + 1));
    });

    if (!Number.isFinite(target) || target < 1 || target > 120) {
      showSetupError("目标时间必须在 1 到 120 秒之间");
      return;
    }
    if (names.length < 1) {
      showSetupError("至少需要 1 名玩家");
      return;
    }
    if (names.some(function (name, index) { return names.indexOf(name) !== index; })) {
      showSetupError("玩家名字不能重复");
      return;
    }

    hideSetupError();
    state.targetSeconds = target;
    state.playerIndex = 0;
    state.stageIndex = 0;
    state.players = names.map(function (name) {
      return {
        name: name,
        stageResults: [null, null, null],
        totalScore: 0
      };
    });

    el.setupScreen.classList.add("hidden");
    el.resultScreen.classList.add("hidden");
    el.gameScreen.classList.remove("hidden");
    renderTurn();
  }

  function showSetupError(message) {
    el.setupError.textContent = message;
  }

  function hideSetupError() {
    el.setupError.textContent = "";
  }

  function currentPlayer() {
    return state.players[state.playerIndex];
  }

  function renderTurn() {
    var stage = state.stageIndex + 1;
    var player = currentPlayer();
    var totalTurns = state.players.length * STAGE_COUNT;
    var turnNumber = state.playerIndex * STAGE_COUNT + stage;

    el.stageBadge.textContent = "第 " + stage + " / 3 关";
    el.turnPlayer.textContent = player.name;

    if (stage === 1) {
      el.turnTip.innerHTML = "目标：<b>" + state.targetSeconds.toFixed(1) + "</b> 秒，误差越小越好";
      el.timerTip.textContent = "点击按钮开始，凭感觉在目标时间点击停止。";
    } else if (stage === 2) {
      el.turnTip.innerHTML = "最快点击：<b>结束 − 开始</b> 的用时最短者更强";
      el.timerTip.textContent = "点击开始后，用最快速度再点一次停止。";
    } else {
      el.turnTip.innerHTML = "篮球落地瞬间<b>点击按钮或按空格</b>";
      el.timerTip.textContent = "点击开始后，盯着篮球，在它碰到地面的瞬间停止。";
    }

    el.progressText.textContent = turnNumber + " / " + totalTurns + " 轮";
    el.progressBar.style.width = ((turnNumber - 1) / totalTurns * 100) + "%";
    resetStageUI();
  }

  function resetStageUI() {
    stopBallAnimation();
    state.running = false;
    el.ballStage.classList.toggle("hidden", state.stageIndex !== 2);
    resetBallPosition();

    el.guessArea.classList.remove("hidden");
    el.resultArea.classList.add("hidden");
    el.timerButton.classList.remove("running");
    el.timerButton.disabled = false;
    el.timerIcon.textContent = "▶️";

    if (state.stageIndex === 0) el.timerLabel.textContent = "开始";
    else if (state.stageIndex === 1) el.timerLabel.textContent = "开始";
    else el.timerLabel.textContent = "球落下";

    el.timerTip.textContent = state.stageIndex === 2
      ? "点击开始后，在球碰地的一瞬间点击或按空格。"
      : "点击按钮开始。";
  }

  function resetBallPosition() {
    el.ballTrack.classList.remove("landing");
    el.ball.style.top = "10px";
  }

  function toggleTimer() {
    if (el.resultArea && !el.resultArea.classList.contains("hidden")) return;

    if (!state.running) {
      state.running = true;
      state.stageStart = performance.now();
      el.timerButton.classList.add("running");
      el.timerIcon.textContent = "✋";
      el.timerLabel.textContent = "停止";

      if (state.stageIndex === 0) {
        el.timerTip.textContent = "别看表！凭感觉停在第 " + state.targetSeconds.toFixed(1) + " 秒。";
      } else if (state.stageIndex === 1) {
        el.timerTip.textContent = "现在！用最快速度点击停止。";
      } else {
        el.timerTip.textContent = "在篮球碰到地面的瞬间点击或按空格！";
        beginBallAnimation();
      }
      return;
    }

    finishStage(performance.now());
  }

  function beginBallAnimation() {
    var trackHeight = el.ballTrack.clientHeight || 260;
    var usableHeight = Math.max(80, trackHeight - 48);

    state.ballStart = state.stageStart;
    state.fallMs = 1250 + Math.random() * 700;
    state.landingAt = state.ballStart + state.fallMs;
    state.landingFlashed = false;

    clearTimeout(state.autoFinishTimer);
    state.autoFinishTimer = setTimeout(function () {
      if (state.running) finishStage(performance.now());
    }, state.fallMs + FIRST_BOUNCE_MS + 900);

    function frame(now) {
      if (!state.running) return;
      var elapsed = now - state.ballStart;
      var position;

      if (elapsed <= state.fallMs) {
        var ratio = elapsed / state.fallMs;
        position = usableHeight * ratio * ratio;
      } else {
        var bounceElapsed = elapsed - state.fallMs;
        var bounceRatio = bounceElapsed / FIRST_BOUNCE_MS;
        if (bounceRatio > 1) {
          position = usableHeight;
        } else {
          position = usableHeight - usableHeight * 0.38 * 4 * bounceRatio * (1 - bounceRatio);
        }
      }

      el.ball.style.top = (10 + position) + "px";

      if (!state.landingFlashed && now >= state.landingAt) {
        state.landingFlashed = true;
        el.ballTrack.classList.add("landing");
        setTimeout(function () {
          el.ballTrack.classList.remove("landing");
        }, 180);
      }

      state.ballFrame = requestAnimationFrame(frame);
    }

    state.ballFrame = requestAnimationFrame(frame);
  }

  function stopBallAnimation() {
    if (state.ballFrame) cancelAnimationFrame(state.ballFrame);
    clearTimeout(state.autoFinishTimer);
    state.ballFrame = 0;
    state.autoFinishTimer = 0;
  }

  function quality(stage, value) {
    if (stage === 1) {
      if (value < 0.05) return { emoji: "🎯", title: "神级手感！" };
      if (value < 0.2) return { emoji: "🔥", title: "超级准！" };
      if (value < 0.5) return { emoji: "👏", title: "很不错！" };
      if (value < 1.5) return { emoji: "🙂", title: "接近目标" };
      return { emoji: "😅", title: "感觉跑偏了" };
    }
    if (stage === 2) {
      if (value < 0.12) return { emoji: "⚡", title: "手速惊人！" };
      if (value < 0.18) return { emoji: "🔥", title: "非常快！" };
      if (value < 0.28) return { emoji: "👏", title: "反应不错" };
      if (value < 0.5) return { emoji: "🙂", title: "还有空间" };
      return { emoji: "🐢", title: "这次慢了一些" };
    }
    if (value < 0.04) return { emoji: "🎯", title: "完美落地！" };
    if (value < 0.09) return { emoji: "🔥", title: "眼疾手快！" };
    if (value < 0.18) return { emoji: "👏", title: "时机很好" };
    if (value < 0.4) return { emoji: "🙂", title: "接近落地" };
    return { emoji: "😅", title: "错过了落点" };
  }

  function finishStage(now) {
    if (!state.running) return;
    stopBallAnimation();
    state.running = false;

    var stage = state.stageIndex + 1;
    var elapsed = (now - state.stageStart) / 1000;
    var target = null;
    var error = null;
    var value;

    if (stage === 1) {
      target = state.targetSeconds;
      error = Math.abs(elapsed - target);
      value = error;
    } else if (stage === 2) {
      value = elapsed;
    } else {
      target = state.fallMs / 1000;
      error = Math.abs(elapsed - target);
      value = error;
    }

    var player = currentPlayer();
    var result = {
      stage: stage,
      elapsed: elapsed,
      target: target,
      error: error,
      value: value
    };
    player.stageResults[state.stageIndex] = result;
    player.totalScore += value;

    showStageResult(result);
  }

  function showStageResult(result) {
    var stage = result.stage;
    var qualityInfo = quality(stage, result.value);
    var player = currentPlayer();

    el.guessArea.classList.add("hidden");
    el.resultArea.classList.remove("hidden");
    el.resultEmoji.textContent = qualityInfo.emoji;
    el.resultTitle.textContent = qualityInfo.title;

    if (stage === 1) {
      el.actualLabel.textContent = "实际秒数";
      el.targetLabel.textContent = "目标秒数";
      el.errorLabel.textContent = "误差（秒）";
      el.targetDisplay.textContent = result.target.toFixed(2);
      el.timeError.textContent = result.error.toFixed(3);
    } else if (stage === 2) {
      el.actualLabel.textContent = "点击用时";
      el.targetLabel.textContent = "挑战目标";
      el.errorLabel.textContent = "计入成绩";
      el.targetDisplay.textContent = "越短越好";
      el.timeError.textContent = result.value.toFixed(3);
    } else {
      el.actualLabel.textContent = "按键时间";
      el.targetLabel.textContent = "落地时间";
      el.errorLabel.textContent = "时机误差";
      el.targetDisplay.textContent = result.target.toFixed(3);
      el.timeError.textContent = result.error.toFixed(3);
    }

    el.actualTime.textContent = result.elapsed.toFixed(3);
    el.scoreLine.textContent = player.name + " 当前综合成绩：" + player.totalScore.toFixed(3) + " 秒";

    var isLastTurn = state.playerIndex === state.players.length - 1 && state.stageIndex === STAGE_COUNT - 1;
    var isNextPlayer = state.stageIndex === STAGE_COUNT - 1;
    el.nextTurn.textContent = isLastTurn
      ? "🏁 查看排名"
      : (isNextPlayer ? "下一位玩家 ⏭️" : "进入第 " + (stage + 1) + " 关 ⏭️");

    var totalTurns = state.players.length * STAGE_COUNT;
    var turnNumber = state.playerIndex * STAGE_COUNT + stage;
    el.progressText.textContent = turnNumber + " / " + totalTurns + " 轮";
    el.progressBar.style.width = (turnNumber / totalTurns * 100) + "%";

    /* 单轮结果展示后自动进入下一轮（按钮保留，可立即点击跳过等待） */
    var turnKey = state.playerIndex + ":" + state.stageIndex;
    clearTimeout(state.autoTurnTimer);
    state.autoTurnTimer = setTimeout(function () {
      if (state.playerIndex + ":" + state.stageIndex === turnKey &&
          !el.resultArea.classList.contains("hidden")) {
        nextTurn();
      }
    }, 1800);
  }

  function nextTurn() {
    if (state.stageIndex < STAGE_COUNT - 1) {
      state.stageIndex++;
      renderTurn();
      return;
    }

    if (state.playerIndex < state.players.length - 1) {
      state.playerIndex++;
      state.stageIndex = 0;
      renderTurn();
      return;
    }

    showRanking();
  }

  function stageShortText(result) {
    if (!result) return "—";
    if (result.stage === 1) return "误差 " + result.error.toFixed(2) + "s";
    if (result.stage === 2) return result.value.toFixed(2) + "s";
    return "误差 " + result.error.toFixed(2) + "s";
  }

  function showRanking() {
    state.completed = true;
    if (window.SoloTitles) SoloTitles.grant("time");
    var ranked = state.players.slice().sort(function (a, b) {
      return a.totalScore - b.totalScore;
    });
    var medals = ["🥇", "🥈", "🥉"];

    el.resultSubtitle.textContent =
      "第1关目标 " + state.targetSeconds.toFixed(1) + " 秒 · 第2关最快点击 · 第3关篮球落地";

    el.ranking.innerHTML = "";
    ranked.forEach(function (player, index) {
      var row = document.createElement("div");
      row.className = "rank-row";

      var medal = document.createElement("div");
      medal.className = "rank-medal";
      medal.textContent = medals[index] || (index + 1);

      var info = document.createElement("div");
      info.innerHTML = '<div class="rank-name"></div><div class="rank-detail"></div>';
      info.querySelector(".rank-name").textContent = player.name;
      info.querySelector(".rank-detail").textContent = [
        "猜时间 " + stageShortText(player.stageResults[0]),
        "最快点击 " + stageShortText(player.stageResults[1]),
        "篮球落地 " + stageShortText(player.stageResults[2])
      ].join(" · ");

      var score = document.createElement("div");
      score.className = "rank-score";
      score.innerHTML = "<span></span><small>综合成绩</small>";
      score.querySelector("span").textContent = player.totalScore.toFixed(2) + "s";

      row.appendChild(medal);
      row.appendChild(info);
      row.appendChild(score);
      el.ranking.appendChild(row);
    });

    el.gameScreen.classList.add("hidden");
    el.resultScreen.classList.remove("hidden");
  }

  function showSetup() {
    stopBallAnimation();
    state.running = false;
    el.gameScreen.classList.add("hidden");
    el.resultScreen.classList.add("hidden");
    el.setupScreen.classList.remove("hidden");
  }

  function startArenaGame(player) {
    state.targetSeconds = Number(el.targetTime.value) || 10;
    state.players = [{
      name: player.name || "我",
      stageResults: [null, null, null],
      totalScore: 0
    }];
    state.playerIndex = 0;
    state.stageIndex = 0;
    state.completed = false;
    el.setupScreen.classList.add("hidden");
    el.resultScreen.classList.add("hidden");
    el.gameScreen.classList.remove("hidden");
    renderTurn();
  }

  window.ChallengeArena = ChallengeArena.create({
    gameId: "time-guess",
    gameName: "猜时间闯关",
    onBegin: function (player) { startArenaGame(player); },
    onRestart: function (player) { startArenaGame(player); },
    getProgress: function () {
      var player = state.players[state.playerIndex] || state.players[0];
      return {
        score: player ? player.totalScore : 0,
        level: state.stageIndex + 1,
        status: state.completed ? "finished" : "playing"
      };
    }
  });

})();
