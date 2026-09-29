/* 看AI图猜古诗 —— 游戏逻辑 */
(function () {
  "use strict";

  var TIME_LIMIT = 15;          // 每题秒数
  var TOTAL_LEVELS = 10;        // 每局 10 关
  var NEXT_DELAY = 1400;        // 判定后自动进入下一关
  var state = {
    nextTimerId: null,
    order: [],        // 打乱后的题目
    seed: 0,
    config: {},
    maxGrade: 0,      // 年级上限（0 = 全部）
    index: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    answered: false,
    timerId: null,
    timeLeft: TIME_LIMIT
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    stage: $("stage"), quiz: $("quiz"), result: $("result"),
    score: $("score"), combo: $("combo"), comboWrap: $("comboWrap"),
    timer: $("timer"), timerWrap: $("timerWrap"),
    progress: $("progress"), total: $("total"), pkMode: $("pk-mode"), pkSeed: $("pk-seed"),
    pic: $("pic"), picFallback: $("picFallback"),
    options: $("options"), feedback: $("feedback"),
    startBtn: $("startBtn"),
    restartBtn: $("restartBtn"), resultRestart: $("resultRestart"),
    resultChangeGrade: $("resultChangeGrade"),
    resultText: $("resultText"), resultStars: $("resultStars")
  };

  /* ---------- 音效（Web Audio，无外部文件） ---------- */
  var audioCtx = null;
  function beep(freq, duration, type, when) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var t = audioCtx.currentTime + (when || 0);
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duration);
    } catch (e) { /* 音频不可用时静默 */ }
  }
  var sfx = {
    correct: function () { beep(660, .12); beep(880, .18, "sine", .1); },
    wrong:   function () { beep(220, .25, "sawtooth"); },
    tick:    function () { beep(1200, .05, "square", 0); },
    finish:  function () { [523, 659, 784, 1047].forEach(function (f, i) { beep(f, .18, "sine", i * .13); }); },
    click:   function () { beep(500, .06, "triangle"); }
  };

  /* ---------- 工具 ---------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function mulberry32(seed) {
    var value = Number(seed) >>> 0;
    return function () {
      value = (value + 0x6D2B79F5) >>> 0;
      var t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(text) {
    var value = 2166136261;
    for (var i = 0; i < text.length; i++) {
      value ^= text.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function seededShuffle(arr, seed) {
    var a = arr.slice();
    var random = mulberry32(Number(seed) >>> 0);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function updateHud() {
    els.score.textContent = state.score;
    els.combo.textContent = state.combo;
    els.progress.textContent = state.index + 1;
    if (window.ChallengeArena) ChallengeArena.pushProgress();
  }

  /* ---------- 流程 ---------- */
  function poolForGrade(maxGrade) {
    return maxGrade > 0
      ? window.QUESTIONS.filter(function (q) { return q.grade <= maxGrade; })
      : window.QUESTIONS.slice();
  }

  function updateStartLabel() {
    var n = poolForGrade(state.maxGrade).length;
    els.total.textContent = n;
    els.startBtn.textContent = "开始游戏 · " + (state.maxGrade === 0 ? "全部题库" : state.maxGrade + " 年级及以内") + "（" + n + " 题）";
  }

  function startGame(config) {
    config = config && typeof config === "object" ? config : {};
    var onlinePK = Number.isFinite(config.seed) && config.seed > 0;
    state.seed = onlinePK ? config.seed >>> 0 : 0;
    state.config = config;
    state.maxGrade = onlinePK ? (Number(config.maxGrade) || 0) : state.maxGrade;
    var pool = poolForGrade(state.maxGrade);
    if (!pool.length) pool = window.QUESTIONS.slice(); // 兜底：题库为空时不阻断游戏
    state.order = (onlinePK ? seededShuffle(pool, state.seed) : shuffle(pool)).slice(0, TOTAL_LEVELS);
    state.index = 0;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    els.total.textContent = TOTAL_LEVELS;
    els.pkMode.classList.toggle("hidden", !onlinePK);
    els.pkSeed.textContent = onlinePK ? state.seed : 0;
    console.log("[Poem PK] seed=", state.seed, "grade=", state.maxGrade, "order=", state.order.map(function(q){return q.title;}));
    els.stage.classList.add("hidden");
    els.result.classList.add("hidden");
    els.quiz.classList.remove("hidden");
    showQuestion();
  }

  function showQuestion() {
    var q = state.order[state.index];
    state.answered = false;
    state.timeLeft = TIME_LIMIT;
    updateHud();
    els.feedback.classList.add("hidden");

    /* 图片：加载失败时展示占位图 */
    els.pic.style.display = "";
    els.picFallback.classList.add("hidden");
    els.pic.onerror = function () {
      els.pic.style.display = "none";
      els.picFallback.classList.remove("hidden");
    };
    els.pic.src = q.image + "?t=" + Date.now(); // 防缓存，确保 onerror 触发

    /* 选项：每题随机洗牌，正确位置随机 */
    els.options.innerHTML = "";
    /* 单人模式用真随机；联机 PK 用同一 seed 给两端生成一致且随机的选项顺序。 */
    var optionSeed = state.seed
      ? (state.seed ^ hashString(q.image + "|" + q.title + "|" + state.index)) >>> 0
      : (Math.random() * 4294967296) >>> 0;
    seededShuffle(q.options, optionSeed).forEach(function (text) {
      var btn = document.createElement("button");
      btn.className = "option";
      btn.textContent = text;
      btn.dataset.text = text;
      btn.addEventListener("click", function () { onAnswer(btn, q); });
      els.options.appendChild(btn);
    });

    startTimer();
  }

  function startTimer() {
    stopTimer();
    renderTimer();
    state.timerId = setInterval(function () {
      state.timeLeft--;
      renderTimer();
      if (state.timeLeft <= 3 && state.timeLeft > 0) sfx.tick();
      if (state.timeLeft <= 0) {
        stopTimer();
        if (!state.answered) onTimeout();
      }
    }, 1000);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }
  function renderTimer() {
    els.timer.textContent = state.timeLeft;
    els.timerWrap.classList.toggle("low", state.timeLeft <= 5);
  }

  function onAnswer(btn, q) {
    if (state.answered) return;
    state.answered = true;
    stopTimer();
    sfx.click();

    var buttons = els.options.querySelectorAll(".option");
    buttons.forEach(function (b) {
      b.disabled = true;
      if (b.dataset.text === q.correct) b.classList.add("correct");
    });

    var isRight = btn && btn.dataset.text === q.correct;
    showFeedback(isRight, q, false);
  }

  function onTimeout() {
    state.answered = true;
    els.options.querySelectorAll(".option").forEach(function (b) {
      b.disabled = true;
      if (b.dataset.text === q_correct()) b.classList.add("correct");
    });
    function q_correct() { return state.order[state.index].correct; }
    showFeedback(false, state.order[state.index], true);
  }

  function showFeedback(isRight, q, timedOut) {
    els.feedback.classList.remove("hidden", "ok", "no");
    if (isRight) {
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      var bonus = 10 + (state.combo - 1) * 5 + state.timeLeft; // 基础分 + 连击加成 + 剩余时间奖励
      state.score += bonus;
      sfx.correct();
      els.comboWrap.classList.remove("active");
      void els.comboWrap.offsetWidth; // 重启动画
      els.comboWrap.classList.add("active");
      els.feedback.classList.add("ok");
      els.feedback.innerHTML = "<strong>✅ 答对啦！ +" + bonus + " 分（连击 ×" + state.combo + "）</strong><br>" +
        "《" + q.title + "》 " + q.author + "（" + q.grade + "年级）<br>💡 " + q.hint;
    } else {
      state.combo = 0;
      sfx.wrong();
      els.feedback.classList.add("no");
      els.feedback.innerHTML = "<strong>" + (timedOut ? "⏰ 时间到！" : "❌ 再想想～") + "</strong> 正确答案是：<br>" +
        "《" + q.title + "》 " + q.author + "（" + q.grade + "年级）：" + q.correct + "<br>💡 " + q.hint;
    }
    updateHud();
    if (window.ChallengeArena) ChallengeArena.pushProgress();

    clearTimeout(state.nextTimerId);
    state.nextTimerId = setTimeout(function () {
      state.nextTimerId = null;
      if (state.index < state.order.length - 1) {
        state.index++;
        showQuestion();
      } else {
        showResult();
      }
    }, NEXT_DELAY);
  }

  function showResult() {
    stopTimer();
    if (window.SoloTitles) SoloTitles.grant("poem");
    sfx.finish();
    els.quiz.classList.add("hidden");
    els.result.classList.remove("hidden");
    var total = state.order.length;
    var ratio = state.score / (total * 40);
    var stars = ratio >= 0.9 ? "⭐⭐⭐" : ratio >= 0.6 ? "⭐⭐" : ratio >= 0.3 ? "⭐" : "💪";
    els.resultText.innerHTML = "总得分：<strong>" + state.score + "</strong> 分<br>最高连击：×" + state.maxCombo;
    els.resultStars.textContent = stars;
  }

  /* ---------- 事件 ---------- */
  els.startBtn.addEventListener("click", startGame);
  els.restartBtn.addEventListener("click", startGame);
  els.resultRestart.addEventListener("click", startGame);
  els.resultChangeGrade.addEventListener("click", function () {
    sfx.click();
    els.result.classList.add("hidden");
    els.stage.classList.remove("hidden");
  });

  var gradeBtns = Array.prototype.slice.call(document.querySelectorAll(".grade-btn"));
  gradeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      gradeBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      state.maxGrade = Number(btn.dataset.grade) || 0;
      sfx.click();
      updateStartLabel();
    });
  });
  updateStartLabel();

  /* 可复用联机壳：联机开始后调用本游戏的原有单人闯关流程。 */
  window.ChallengeArena = ChallengeArena.create({
    gameId: "poem-guess",
    gameName: "看AI图猜古诗",
    onBegin: function (beginInfo) { startGame(beginInfo && beginInfo.state); },
    onRestart: function (beginInfo) { startGame(beginInfo && beginInfo.state); },
    onSoloMenu: function () {
      /* 单人模式：先显示年级选择，由玩家自己点「开始游戏」 */
      els.quiz.classList.add("hidden");
      els.result.classList.add("hidden");
      els.stage.classList.remove("hidden");
      updateStartLabel();
    },
    getTargetConfig: function () {
      return { maxGrade: state.maxGrade };
    },
    renderLobbySettings: function (container, stateData, isHost) {
      container.innerHTML = `
        <div class="arena-setting">
          <label>古诗年级范围</label>
          <select id="arena-poem-grade">
            <option value="0">全部年级</option>
            <option value="1">一年级及以内</option>
            <option value="2">二年级及以内</option>
            <option value="3">三年级及以内</option>
            <option value="4">四年级及以内</option>
            <option value="5">五年级及以内</option>
            <option value="6">六年级及以内</option>
          </select>
          <div class="arena-setting-note">由第一位玩家设置，所有玩家使用同一范围。</div>
        </div>
      `;
      var select = container.querySelector("#arena-poem-grade");
      select.value = String(state.maxGrade || 0);
      select.disabled = !isHost;
      select.addEventListener("change", function () {
        state.maxGrade = Number(select.value) || 0;
      });
    },
    getProgress: function () {
      return {
        score: state.score,
        level: Math.min(state.order.length, state.index + 1),
        status: state.order.length && state.index >= state.order.length ? "finished" : "playing"
      };
    }
  });

})();
