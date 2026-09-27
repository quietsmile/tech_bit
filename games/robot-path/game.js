/* 给机器人指路 —— 编程启蒙游戏 */
(function () {
  "use strict";

  var DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]; // N E S W
  var STEP_MS = 420;
  var TURN_MS = 340;
  var MAX_NODES = 40;
  var BEST_KEY = "robot_path_v1";

  var state = {
    grade: 1,          // 1 低年级 / 2 中年级 / 3 高年级
    visible: [],       // 当前年级可见的关卡（LEVELS 的下标）
    levelIdx: -1,      // 当前关卡在 LEVELS 中的下标
    program: [],       // 顶层指令节点
    buildStack: [],    // 打开中的重复块（嵌套写入用）
    score: 0,
    chestsGot: 0,
    running: false,
    timers: [],
    best: {},          // levelIdx -> stars
    autoNextTimer: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    setup: $("setup"), game: $("game"),
    startBtn: $("startBtn"), gradeNote: $("gradeNote"),
    score: $("score"), levelNo: $("levelNo"), levelTotal: $("levelTotal"),
    chestCount: $("chestCount"), menuBtn: $("menuBtn"),
    board: $("board"), levelName: $("levelName"), missionText: $("missionText"),
    program: $("program"), programEmpty: $("programEmpty"),
    closeRepeatBtn: $("closeRepeatBtn"),
    undoBtn: $("undoBtn"), clearBtn: $("clearBtn"),
    runBtn: $("runBtn"), stopBtn: $("stopBtn"),
    feedback: $("feedback"), levelDots: $("levelDots"),
    retryBtn: $("retryBtn"), nextBtn: $("nextBtn")
  };

  /* ---------- 音效 ---------- */
  var audioCtx = null;
  function beep(freq, duration, type, when) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var t = audioCtx.currentTime + (when || 0);
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duration);
    } catch (e) { /* 静默 */ }
  }
  var sfx = {
    click: function () { beep(520, .06, "triangle"); },
    step: function () { beep(300, .05, "sine"); },
    turn: function () { beep(430, .06, "triangle"); },
    chest: function () { beep(660, .1); beep(990, .14, "sine", .09); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { beep(f, .16, "sine", i * .12); }); },
    bump: function () { beep(160, .22, "sawtooth"); },
    fall: function () { beep(320, .3, "sawtooth"); beep(180, .3, "sawtooth", .12); }
  };

  /* ---------- 存档 ---------- */
  function loadSave() {
    try {
      var raw = localStorage.getItem(BEST_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        state.best = data.best || {};
      }
    } catch (e) { /* 忽略 */ }
  }
  function saveSave() {
    try { localStorage.setItem(BEST_KEY, JSON.stringify({ best: state.best })); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 年级与关卡 ---------- */
  function tierOf(grade) { return grade; }
  function refreshVisible() {
    var tier = tierOf(state.grade);
    state.visible = [];
    /* 关卡不跨年级累积：1-2 年级 3 关、3-4 年级 5 关、5-6 年级 8 关 */
    window.LEVELS.forEach(function (lv, i) { if (lv.tier === tier) state.visible.push(i); });
  }
  function level() { return window.LEVELS[state.levelIdx]; }

  /* ---------- 地图运行时 ---------- */
  var rt = null; // 当前关运行时：{walls:Set("x,y"), traps, chests(Map), robot:{x,y,d,rot}, collected:Set}
  function key(x, y) { return x + "," + y; }

  function loadLevel(idx) {
    clearTimeout(state.autoNextTimer);
    var lv = window.LEVELS[idx];
    state.levelIdx = idx;
    rt = {
      walls: new Set(lv.walls.map(function (w) { return key(w[0], w[1]); })),
      traps: new Set(lv.traps.map(function (t) { return key(t[0], t[1]); })),
      chests: new Map(lv.chests.map(function (c) { return [key(c[0], c[1]), true]; })),
      collected: new Set(),
      robot: { x: lv.start.x, y: lv.start.y, d: lv.start.d, rot: lv.start.d * 90 }
    };
    state.program = [];
    state.buildStack = [];
    state.chestsGot = 0;
    stopRun();
    hideFeedback();
    els.levelName.textContent = "🏁 " + lv.name;
    els.missionText.textContent = lv.hint + "（最佳纪录：" + lv.par + " 个指令块 ⭐⭐⭐）";
    els.levelNo.textContent = state.visible.indexOf(idx) + 1;
    els.levelTotal.textContent = state.visible.length;
    els.chestCount.textContent = "0";
    buildBoard();
    renderProgram();
    renderDots();
    updateControls();
  }

  function buildBoard() {
    var lv = level();
    var b = els.board;
    b.innerHTML = "";
    b.style.setProperty("--cols", lv.cols);
    b.style.setProperty("--rows", lv.rows);

    for (var y = 0; y < lv.rows; y++) {
      for (var x = 0; x < lv.cols; x++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        var k = key(x, y);
        cell.dataset.x = x;
        cell.dataset.y = y;
        if (rt.walls.has(k)) { cell.classList.add("wall"); cell.textContent = "🧱"; }
        else if (rt.traps.has(k)) { cell.classList.add("trap"); cell.textContent = "🕳️"; }
        else if (lv.goal.x === x && lv.goal.y === y) { cell.classList.add("goal"); cell.textContent = "🏁"; }
        else if (rt.chests.has(k)) { cell.classList.add("chest"); cell.textContent = "🎁"; }
        else if (lv.start.x === x && lv.start.y === y) { cell.classList.add("start"); }
        cell.style.left = (x * 100 / lv.cols) + "%";
        cell.style.top = (y * 100 / lv.rows) + "%";
        b.appendChild(cell);
      }
    }
    var robot = document.createElement("div");
    robot.className = "robot no-anim";
    robot.innerHTML = '<span class="robot-body">🤖</span>';
    b.appendChild(robot);
    placeRobot(true);
  }

  function robotEl() { return els.board.querySelector(".robot"); }

  function placeRobot(instant) {
    var r = robotEl();
    if (!r) return;
    if (instant) {
      r.classList.add("no-anim");
      r.style.transform = robotTransform();
      void r.offsetWidth;
      r.classList.remove("no-anim");
    } else {
      r.style.transform = robotTransform();
    }
    r.querySelector(".robot-body").style.transform = "rotate(" + rt.robot.rot + "deg)";
  }
  function robotTransform() {
    var lv = level();
    return "translate(" + (rt.robot.x * 100) + "%, " + (rt.robot.y * 100) + "%)";
  }

  /* ---------- 程序编辑 ---------- */
  function targetList() {
    return state.buildStack.length
      ? state.buildStack[state.buildStack.length - 1].body
      : state.program;
  }
  function countNodes() {
    var n = 0;
    function walk(list) { list.forEach(function (nd) { n++; if (nd.type === "repeat") walk(nd.body); }); }
    walk(state.program);
    return n;
  }
  function addCommand(cmd) {
    if (state.running) return;
    if (countNodes() >= MAX_NODES) return;
    if (cmd === "repeat") {
      var node = { type: "repeat", body: [] };
      targetList().push(node);
      state.buildStack.push(node);
    } else {
      targetList().push({ type: "cmd", cmd: cmd });
    }
    sfx.click();
    renderProgram();
    updateControls();
  }
  function closeRepeat() {
    if (state.running || !state.buildStack.length) return;
    state.buildStack.pop();
    sfx.click();
    renderProgram();
    updateControls();
  }
  function undo() {
    if (state.running) return;
    var parent = targetList();
    if (parent.length) parent.pop();
    else if (state.buildStack.length) state.buildStack.pop();
    sfx.click();
    renderProgram();
    updateControls();
  }
  function clearProgram() {
    if (state.running) return;
    state.program = [];
    state.buildStack = [];
    sfx.click();
    renderProgram();
    updateControls();
  }

  var CMD_LABEL = { forward: "⬆️ 前进", left: "↰ 左转", right: "↱ 右转", cond: "🧱 墙→右转" };

  function renderProgram() {
    var box = els.program;
    box.innerHTML = "";
    if (!state.program.length) {
      var p = document.createElement("p");
      p.className = "program-empty";
      p.textContent = "还没有指令，先从「前进」开始吧！";
      box.appendChild(p);
      return;
    }
    renderNodes(state.program, box, 0);
  }
  function renderNodes(nodes, box, depth) {
    nodes.forEach(function (nd) {
      if (nd.type === "cmd") {
        var chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = CMD_LABEL[nd.cmd];
        box.appendChild(chip);
      } else if (nd.type === "repeat") {
        var rep = document.createElement("div");
        rep.className = "repeat-block";
        rep.innerHTML = "<span class='repeat-head'>🔁 重复3次</span>";
        var inner = document.createElement("div");
        inner.className = "repeat-body";
        rep.appendChild(inner);
        if (nd.body.length) renderNodes(nd.body, inner, depth + 1);
        else inner.innerHTML = "<span class='repeat-hint'>（空）</span>";
        box.appendChild(rep);
      }
    });
  }

  function updateControls() {
    var tier = tierOf(state.grade);
    document.querySelectorAll(".cmd-btn.tier2").forEach(function (b) {
      b.classList.toggle("locked", tier < 2);
      b.disabled = tier < 2;
    });
    document.querySelectorAll(".cmd-btn.tier3").forEach(function (b) {
      b.classList.toggle("locked", tier < 3);
      b.disabled = tier < 3;
    });
    els.closeRepeatBtn.classList.toggle("hidden", !state.buildStack.length);
    els.runBtn.disabled = state.running;
    els.undoBtn.disabled = state.running;
    els.clearBtn.disabled = state.running;
  }

  /* ---------- 运行程序 ---------- */
  function flatten(nodes, out) {
    nodes.forEach(function (nd) {
      if (nd.type === "cmd") out.push(nd.cmd);
      else if (nd.type === "repeat") {
        for (var i = 0; i < 3; i++) flatten(nd.body, out);
      } else if (nd.type === "cond") out.push("cond");
    });
    return out;
  }

  function isBlocked(x, y) {
    var lv = level();
    if (x < 0 || y < 0 || x >= lv.cols || y >= lv.rows) return true;
    return rt.walls.has(key(x, y));
  }

  function startRun() {
    if (state.running) return;
    if (state.buildStack.length) state.buildStack = []; // 自动闭合未结束的重复块
    renderProgram();
    var steps = flatten(state.program, []);
    if (!steps.length) {
      showFeedback("no", "🤖 机器人说：你还没给我任何指令呢！");
      return;
    }
    state.running = true;
    state.steps = steps.slice(0, 200);
    state.stepIdx = 0;
    hideFeedback();
    els.nextBtn.classList.add("hidden");
    updateControls();
    els.runBtn.classList.add("hidden");
    els.stopBtn.classList.remove("hidden");
    schedule(stepOnce, 250);
  }

  function schedule(fn, delay) {
    state.timers.push(setTimeout(fn, delay == null ? STEP_MS : delay));
  }
  function clearTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
  }
  function stopRun() {
    state.running = false;
    clearTimers();
    els.runBtn.classList.remove("hidden");
    els.stopBtn.classList.add("hidden");
    updateControls();
  }

  function stepOnce() {
    if (!state.running) return;
    if (state.stepIdx >= state.steps.length) {
      return failRun("😵 指令跑完了，还没到终点。看看哪里还差几步？");
    }
    var cmd = state.steps[state.stepIdx++];
    var lv = level();
    var r = rt.robot;

    if (cmd === "forward") {
      var dd = DIRS[r.d];
      var nx = r.x + dd.x, ny = r.y + dd.y;
      if (isBlocked(nx, ny)) return bumpFail();
      if (rt.traps.has(key(nx, ny))) return trapFail();
      sfx.step();
      r.x = nx; r.y = ny;
      placeRobot(false);
      schedule(function () {
        if (!state.running) return;
        collectChest(nx, ny);
        if (lv.goal.x === nx && lv.goal.y === ny) return winLevel();
        schedule(stepOnce, 60);
      }, STEP_MS);
    } else if (cmd === "left" || cmd === "right") {
      var delta = cmd === "left" ? -1 : 1;
      r.d = (r.d + delta + 4) % 4;
      r.rot += delta * 90;
      sfx.turn();
      placeRobot(false);
      schedule(stepOnce, TURN_MS);
    } else if (cmd === "cond") {
      var d2 = DIRS[r.d];
      if (isBlocked(r.x + d2.x, r.y + d2.y)) {
        r.d = (r.d + 1) % 4;
        r.rot += 90;
        sfx.turn();
        placeRobot(false);
        schedule(stepOnce, TURN_MS);
      } else {
        schedule(stepOnce, 180);
      }
    }
  }

  function collectChest(x, y) {
    var k = key(x, y);
    if (rt.chests.has(k) && !rt.collected.has(k)) {
      rt.collected.add(k);
      state.chestsGot++;
      state.score += 50;
      els.score.textContent = state.score;
      els.chestCount.textContent = state.chestsGot;
      sfx.chest();
      var cell = els.board.querySelector('.cell.chest[data-x="' + x + '"][data-y="' + y + '"]');
      if (cell) {
        /* 吃到宝箱：先闪一下 ✨，然后让宝箱消失 */
        cell.classList.add("opened");
        cell.textContent = "✨";
        setTimeout(function () {
          cell.textContent = "";
          cell.classList.remove("opened");
        }, 450);
      }
    }
  }

  function bumpFail() {
    sfx.bump();
    var body = robotEl() && robotEl().querySelector(".robot-body");
    if (body) body.classList.add("bump");
    failRun("🚧 哎呀，撞墙啦！机器人说：撞墙前要记得转弯哦。");
    setTimeout(function () { if (body) body.classList.remove("bump"); }, 500);
  }
  function trapFail() {
    sfx.fall();
    var body = robotEl() && robotEl().querySelector(".robot-body");
    if (body) body.classList.add("fall");
    failRun("🕳️ 掉进陷阱啦！下次绕开黑洞洞走吧。");
  }
  function failRun(msg) {
    stopRun();
    showFeedback("no", msg);
  }

  function winLevel() {
    stopRun();
    var lv = level();
    var blocks = state.program.length;
    var stars = blocks <= lv.par ? 3 : (blocks <= lv.par + 3 ? 2 : 1);
    var bonus = stars === 3 ? 100 : stars === 2 ? 60 : 30;
    state.score += bonus;
    els.score.textContent = state.score;
    var starsTxt = "⭐".repeat(stars) + "☆".repeat(3 - stars);
    if (stars > (state.best[state.levelIdx] || 0)) state.best[state.levelIdx] = stars;
    saveSave();
    renderDots();
    sfx.win();
    var isLast = state.visible.indexOf(state.levelIdx) === state.visible.length - 1;
    if (isLast && window.SoloTitles) SoloTitles.grant("robot");
    showFeedback("ok",
      "🎉 到达终点！" + starsTxt + "　＋" + bonus + " 分" +
      (state.chestsGot ? "（含宝箱 🎁×" + state.chestsGot + "）" : "") +
      "<br>" + (isLast ? "🏆 你完成了全部关卡，是指令小天才！" : "准备进入下一关吧！"));
    if (!isLast) {
      els.nextBtn.classList.remove("hidden");
      /* 过关后自动进入下一关（按钮保留，可立即点击跳过等待） */
      var fromIdx = state.levelIdx;
      clearTimeout(state.autoNextTimer);
      state.autoNextTimer = setTimeout(function () {
        if (state.levelIdx === fromIdx) nextLevel();
      }, 1600);
    } else {
      els.nextBtn.textContent = " ↻ 再玩一遍";
    }
  }

  /* ---------- 反馈 ---------- */
  function showFeedback(kind, html) {
    els.feedback.classList.remove("hidden", "ok", "no");
    els.feedback.classList.add(kind);
    els.feedback.innerHTML = html;
  }
  function hideFeedback() {
    els.feedback.classList.add("hidden");
    els.nextBtn.classList.add("hidden");
    els.nextBtn.textContent = "下一关 ▶";
  }

  /* ---------- 关卡圆点 ---------- */
  function renderDots() {
    var box = els.levelDots;
    box.innerHTML = "";
    state.visible.forEach(function (idx, i) {
      var b = document.createElement("button");
      b.className = "dot" + (idx === state.levelIdx ? " cur" : "");
      var stars = state.best[idx];
      b.textContent = stars ? "⭐".repeat(stars) : String(i + 1);
      b.title = window.LEVELS[idx].name;
      b.addEventListener("click", function () { sfx.click(); loadLevel(idx); });
      box.appendChild(b);
    });
  }

  /* ---------- 流程 ---------- */
  function startAdventure() {
    refreshVisible();
    state.score = 0;
    els.score.textContent = "0";
    els.setup.classList.add("hidden");
    els.game.classList.remove("hidden");
    loadLevel(state.visible[0]);
  }
  function nextLevel() {
    var pos = state.visible.indexOf(state.levelIdx);
    if (pos < state.visible.length - 1) loadLevel(state.visible[pos + 1]);
    else startAdventure();
  }

  /* ---------- 事件 ---------- */
  var GRADE_NOTES = { 1: "共 3 关 · 指令：前进 / 左转 / 右转", 2: "共 5 关 · 解锁「重复3次」", 3: "共 7 关 · 解锁「有墙？右转」" };
  els.gradeNote.textContent = GRADE_NOTES[state.grade];
  document.querySelectorAll(".grade-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".grade-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      state.grade = Number(btn.dataset.grade);
      refreshVisible();
      els.gradeNote.textContent = GRADE_NOTES[state.grade];
      sfx.click();
    });
  });
  els.startBtn.addEventListener("click", function () { sfx.click(); startAdventure(); });
  els.menuBtn.addEventListener("click", function () { stopRun(); clearTimeout(state.autoNextTimer); sfx.click(); els.game.classList.add("hidden"); els.setup.classList.remove("hidden"); });
  document.querySelectorAll(".cmd-btn[data-cmd]").forEach(function (btn) {
    btn.addEventListener("click", function () { addCommand(btn.dataset.cmd); });
  });
  els.closeRepeatBtn.addEventListener("click", closeRepeat);
  els.undoBtn.addEventListener("click", undo);
  els.clearBtn.addEventListener("click", clearProgram);
  els.runBtn.addEventListener("click", startRun);
  els.stopBtn.addEventListener("click", function () { stopRun(); showFeedback("no", "⏹ 已停止。修改指令后再运行吧！"); });
  els.retryBtn.addEventListener("click", function () { sfx.click(); loadLevel(state.levelIdx); });
  els.nextBtn.addEventListener("click", function () { sfx.click(); nextLevel(); });

  /* ---------- 测试钩子（自动化验证用） ---------- */
  window.RobotTest = {
    pickGrade: function (g) { var b = document.querySelector('.grade-btn[data-grade="' + g + '"]'); b.click(); },
    start: startAdventure,
    add: addCommand,
    closeRep: closeRepeat,
    clear: clearProgram,
    run: startRun,
    state: function () {
      return {
        levelIdx: state.levelIdx, running: state.running, score: state.score,
        robot: rt && { x: rt.robot.x, y: rt.robot.y, d: rt.robot.d },
        feedback: els.feedback.classList.contains("hidden") ? null : els.feedback.textContent,
        program: JSON.parse(JSON.stringify(state.program))
      };
    },
    jump: function (idx) { loadLevel(idx); }
  };

  loadSave();
  refreshVisible();

  window.ChallengeArena = ChallengeArena.create({
    gameId: "robot-path",
    gameName: "给机器人指路",
    onBegin: function () { startAdventure(); },
    onRestart: function () { startAdventure(); },
    onSoloMenu: function () {
      /* 单人模式：先显示年级选择，由玩家自己点「开始」 */
      els.game.classList.add("hidden");
      els.setup.classList.remove("hidden");
    },
    getProgress: function () {
      return {
        score: state.score,
        level: state.levelIdx + 1,
        status: "playing"
      };
    }
  });

})();
