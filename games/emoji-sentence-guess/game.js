/* Emoji 猜趣味句子 —— 游戏逻辑（纯原生 JS，无外部依赖） */
(function () {
  "use strict";

  var TIME_PER_QUESTION = 20;
  var BASE_SCORE = 100;
  var COMBO_BONUS = 20;
  var TIME_BONUS_PER_SEC = 5;

  var state = {
    level: 1,
    order: [],
    index: 0,
    failed: false,
    completed: false,
    score: 0,
    combo: 0,
    maxCombo: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    answered: false,
    timerId: null,
    autoNextTimer: null,
    timeLeft: 0,
    soundOn: true,
    audioCtx: null
  };

  var el = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    el.levelValue = document.getElementById("level-value");
    el.resultLevel = document.getElementById("result-level");
    el.backToStartButton = document.getElementById("back-levels-btn");
    el.startBtn = document.getElementById("start-btn");
    el.startScreen = document.getElementById("start-screen");
    el.quizScreen = document.getElementById("quiz-screen");
    el.resultScreen = document.getElementById("result-screen");
    el.score = document.getElementById("score");
    el.combo = document.getElementById("combo");
    el.timer = document.getElementById("timer");
    el.timerChip = document.getElementById("timer-chip");
    el.soundToggle = document.getElementById("sound-toggle");
    el.progressBar = document.getElementById("progress-bar");
    el.qIndex = document.getElementById("q-index");
    el.qCategory = document.getElementById("q-category");
    el.emojiDisplay = document.getElementById("emoji-display");
    el.options = document.getElementById("options");
    el.feedback = document.getElementById("feedback");
    el.nextBtn = document.getElementById("next-btn");
    el.restartBtn = document.getElementById("restart-btn");
    el.ratingIcon = document.getElementById("rating-icon");
    el.ratingTitle = document.getElementById("rating-title");
    el.ratingDesc = document.getElementById("rating-desc");
    el.statScore = document.getElementById("stat-score");
    el.statMaxCombo = document.getElementById("stat-max-combo");
    el.statCorrect = document.getElementById("stat-correct");
    el.statWrong = document.getElementById("stat-wrong");
    el.statSkip = document.getElementById("stat-skip");

    el.restartBtn.addEventListener("click", function () {
      startGame();
    });
    el.nextBtn.addEventListener("click", onNext);
    el.soundToggle.addEventListener("click", toggleSound);

    el.startBtn.addEventListener("click", startGame);
    el.backToStartButton.addEventListener("click", showStart);
  }

  function showStart() {
    stopTimer();
    el.quizScreen.classList.add("hidden");
    el.resultScreen.classList.add("hidden");
    el.startScreen.classList.remove("hidden");
  }

  function startGame() {
    clearTimeout(state.autoNextTimer);
    startLevel(1);
  }

  function startLevel(level) {
    state.level = level;
    state.order = [EmojiQuestionBank.buildLevelQuestions(level)[0]];
    state.index = 0;
    state.failed = false;
    state.completed = false;
    if (level === 1) {
      state.score = 0;
      state.combo = 0;
      state.maxCombo = 0;
      state.correct = 0;
      state.wrong = 0;
      state.skipped = 0;
    }

    el.startScreen.classList.add("hidden");
    el.resultScreen.classList.add("hidden");
    el.quizScreen.classList.remove("hidden");

    el.levelValue.textContent = level;
    updateHud();
    updateProgress(false);
    showQuestion();
  }

  function advance() {
    clearTimeout(state.autoNextTimer);
    if (state.failed) {
      showResult();
      return;
    }
    if (state.level >= EmojiQuestionBank.LEVEL_COUNT) {
      state.completed = true;
      if (window.SoloTitles) SoloTitles.grant("emoji");
      showResult();
      return;
    }
    startLevel(state.level + 1);
  }

  function showLevelSelect() {
    showStart();
  }

  /* ---------- 工具 ---------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* ---------- 音效（Web Audio API 合成，无音频文件） ---------- */
  function ensureAudio() {
    if (!state.audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return null; }
      state.audioCtx = new AC();
    }
    if (state.audioCtx.state === "suspended") {
      state.audioCtx.resume();
    }
    return state.audioCtx;
  }

  function tone(freq, startDelay, duration, type, volume) {
    if (!state.soundOn) { return; }
    try {
      var ctx = ensureAudio();
      if (!ctx) { return; }
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var t0 = ctx.currentTime + (startDelay || 0);
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume || 0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch (e) { /* 音效失败不影响游戏 */ }
  }

  function playCorrect() {
    tone(523, 0, 0.12, "sine", 0.18);
    tone(659, 0.1, 0.12, "sine", 0.18);
    tone(784, 0.2, 0.2, "sine", 0.18);
  }

  function playWrong() {
    tone(220, 0, 0.2, "sawtooth", 0.12);
    tone(160, 0.15, 0.3, "sawtooth", 0.12);
  }

  function playTick() {
    tone(1000, 0, 0.04, "square", 0.05);
  }

  function playSkip() {
    tone(600, 0, 0.08, "triangle", 0.1);
    tone(400, 0.09, 0.12, "triangle", 0.1);
  }

  function playFinish() {
    tone(523, 0, 0.15, "sine", 0.16);
    tone(659, 0.15, 0.15, "sine", 0.16);
    tone(784, 0.3, 0.15, "sine", 0.16);
    tone(1047, 0.45, 0.35, "sine", 0.16);
  }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    el.soundToggle.textContent = state.soundOn ? "🔊" : "🔇";
  }

  function currentQuestion() {
    return state.order[state.index];
  }

  function showQuestion() {
    state.answered = false;
    state.timeLeft = TIME_PER_QUESTION;

    var q = currentQuestion();
    el.qIndex.textContent = "第 " + state.level + " / " + EmojiQuestionBank.LEVEL_COUNT + " 关";
    el.qCategory.textContent = "第 " + state.level + " 关 · " + q.emojis.length + " 个 Emoji";
    el.emojiDisplay.textContent = "";
    q.emojis.forEach(function (e, i) {
      if (i > 0) { el.emojiDisplay.appendChild(document.createTextNode(" ")); }
      el.emojiDisplay.appendChild(document.createTextNode(e));
    });

    renderOptions(q);

    el.feedback.className = "feedback";
    el.feedback.textContent = "";
    el.nextBtn.disabled = true;
    el.nextBtn.textContent = "下一关 ⏭";
    el.emojiDisplay.classList.toggle("long-emoji", state.level >= 6);
    el.emojiDisplay.classList.toggle("ultra-emoji", state.level >= 9);

    updateTimerDisplay();
    startTimer();
  }

  function renderOptions(q) {
    el.options.innerHTML = "";
    var order = shuffle([0, 1, 2, 3]);
    order.forEach(function (originalIdx, displayIdx) {
      var btn = document.createElement("button");
      btn.className = "option-btn";
      btn.dataset.correct = originalIdx === q.answer ? "true" : "false";
      btn.textContent = String.fromCharCode(65 + displayIdx) + ". " + q.options[originalIdx];
      btn.addEventListener("click", function () {
        onAnswer(btn, originalIdx === q.answer);
      });
      el.options.appendChild(btn);
    });
  }

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(function () {
      state.timeLeft--;
      updateTimerDisplay();
      if (state.timeLeft <= 5 && state.timeLeft > 0) {
        playTick();
      }
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

  function updateTimerDisplay() {
    el.timer.textContent = Math.max(state.timeLeft, 0);
    if (state.timeLeft <= 5) {
      el.timerChip.classList.add("danger");
    } else {
      el.timerChip.classList.remove("danger");
    }
  }

  function updateHud() {
    el.score.textContent = state.score;
    el.combo.textContent = "x" + state.combo;
  }

  function updateProgress(done) {
    var completedLevels = done ? state.level : state.level - 1;
    var pct = Math.round((completedLevels / EmojiQuestionBank.LEVEL_COUNT) * 100);
    el.progressBar.style.width = pct + "%";
  }

  function lockOptions() {
    var btns = el.options.querySelectorAll(".option-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].disabled = true;
    }
  }

  function revealCorrect() {
    var correctBtn = el.options.querySelector('.option-btn[data-correct="true"]');
    if (correctBtn) {
      correctBtn.classList.add("correct");
    }
  }

  function finishQuestion(msg, isGood, explain) {
    state.answered = true;
    stopTimer();
    lockOptions();
    revealCorrect();

    el.feedback.className = "feedback show " + (isGood ? "good" : "bad");
    el.feedback.textContent = msg + " " + explain;

    el.nextBtn.disabled = false;
    if (isGood && state.level >= EmojiQuestionBank.LEVEL_COUNT) {
      el.nextBtn.textContent = "查看结果 🏁";
    } else if (isGood) {
      el.nextBtn.textContent = "进入第 " + (state.level + 1) + " 关 ⏭";
    } else {
      el.nextBtn.textContent = "查看结果 🏁";
    }
    updateProgress(isGood);
    if (isGood) {
      /* 答对后自动进入下一关（按钮保留，可立即点击跳过等待） */
      clearTimeout(state.autoNextTimer);
      state.autoNextTimer = setTimeout(onNext, 1400);
    }
  }

  function onAnswer(btn, isCorrect) {
    if (state.answered) { return; }

    if (isCorrect) {
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.correct++;
      var gained = BASE_SCORE + (state.combo - 1) * COMBO_BONUS + state.timeLeft * TIME_BONUS_PER_SEC;
      state.score += gained;
      updateHud();
      el.combo.classList.remove("bump");
      void el.combo.offsetWidth; // 重新触发动画
      el.combo.classList.add("bump");
      playCorrect();
      finishQuestion(
        "✅ 答对了！+" + gained + " 分（连击 x" + state.combo + "）",
        true,
        currentQuestion().explain
      );
    } else {
      state.combo = 0;
      state.wrong++;
      state.failed = true;
      btn.classList.add("wrong");
      updateHud();
      playWrong();
      finishQuestion(
        "❌ 答错了！正确答案是：" + currentQuestion().options[currentQuestion().answer],
        false,
        currentQuestion().explain
      );
    }
  }

  function onTimeout() {
    if (state.answered) { return; }
    state.combo = 0;
    state.wrong++;
    state.failed = true;
    state.timeLeft = 0;
    updateHud();
    updateTimerDisplay();
    playWrong();
    finishQuestion(
      "⏰ 时间到！正确答案是：" + currentQuestion().options[currentQuestion().answer],
      false,
      currentQuestion().explain
    );
  }

  function onSkip() {
    if (state.answered) { return; }
    state.skipped++;
    state.combo = 0;
    updateHud();
    playSkip();
    finishQuestion(
      "⏭ 已跳过，正确答案是：" + currentQuestion().options[currentQuestion().answer],
      false,
      currentQuestion().explain
    );
  }

  function onNext() {
    advance();
  }

  /* ---------- 结果 ---------- */
  function getRating(pct) {
    if (pct >= 90) {
      return { icon: "🏆", title: "Emoji 侦探大师", desc: "你简直是 Emoji 界的天选之子，谁都难不倒你！" };
    }
    if (pct >= 70) {
      return { icon: "🥇", title: "猜句小达人", desc: "眼力超群！再冲一冲就能拿满分啦。" };
    }
    if (pct >= 50) {
      return { icon: "🌟", title: "潜力股选手", desc: "已经有模有样了，多玩几次会更厉害！" };
    }
    if (pct >= 30) {
      return { icon: "🌱", title: "萌芽玩家", desc: "别灰心，每一局都是新的开始！" };
    }
    return { icon: "🐣", title: "萌新加油", desc: "Emoji 的世界等你探索，再来一局吧！" };
  }

  function showResult() {
    stopTimer();
    playFinish();

    var total = EmojiQuestionBank.LEVEL_COUNT;
    var pct = Math.round((state.correct / total) * 100);
    var rating = getRating(pct);

    el.resultLevel.textContent = state.completed
      ? "🎉 通关成功！完成第 " + state.level + " 关"
      : "🏁 挑战结束，到达第 " + state.level + " 关";

    el.ratingIcon.textContent = rating.icon;
    el.ratingTitle.textContent = rating.title;
    el.ratingDesc.textContent = rating.desc + "（正确率 " + pct + "%）";
    el.statScore.textContent = state.score;
    el.statMaxCombo.textContent = "x" + state.maxCombo;
    el.statCorrect.textContent = state.correct;
    el.statWrong.textContent = state.wrong;
    el.statSkip.textContent = state.skipped;

    el.quizScreen.classList.add("hidden");
    el.resultScreen.classList.remove("hidden");
  }

  /* 可复用联机壳：每位玩家独立完成 20 关。 */
  window.ChallengeArena = ChallengeArena.create({
    gameId: "emoji-sentence-guess",
    gameName: "Emoji 猜趣味句子",
    onBegin: function () { startGame(); },
    onRestart: function () { startGame(); },
    getProgress: function () {
      return {
        score: state.score,
        level: state.level,
        status: state.completed ? "finished" : "playing"
      };
    }
  });

})();
