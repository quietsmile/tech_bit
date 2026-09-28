/* 密室逃脱 · 解谜大师（单文件逻辑，无依赖） */
(function () {
  'use strict';

  var TOTAL_TIME = 300;
  var S = {
    level: 1, timeLeft: TOTAL_TIME, timer: null, startTime: 0,
    code: [0, 0, 0, 0], cluePos: [1, 2, 3, 4], found: [false, false, false, false],
    simon: { seq: [], idx: 0, playing: false },
    riddles: [], ri: 0,
    clock: { h: 12, m: 0, th: 3, tm: 25 },
    done: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {};
  ['intro', 'game', 'failScreen', 'winScreen', 'levelTag', 'timer', 'progBar',
   'pz1', 'pz2', 'pz3', 'pz4', 'clueList', 'codeRow', 'codeInput', 'codeOk',
   'simonTip', 'simonReplay', 'riddleQ', 'riddleChoices', 'clockTip', 'clockText',
   'clockOk', 'msg', 'failInfo', 'failRetry', 'winInfo', 'winRetry', 'confetti',
   'startBtn'].forEach(function (id) { els[id] = $(id); });

  /* ===== 音效 ===== */
  var AC = null;
  function tone(f, d, type, vol, delay) {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      var t = AC.currentTime + (delay || 0);
      g.gain.setValueAtTime(vol || .18, t);
      g.gain.exponentialRampToValueAtTime(.001, t + d);
      o.connect(g); g.connect(AC.destination);
      o.start(t); o.stop(t + d);
    } catch (e) {}
  }
  function sfx(name) {
    if (name === 'click') tone(500, .06, 'sine', .12);
    if (name === 'ok') { tone(660, .1); tone(880, .16, 'sine', .18, .09); }
    if (name === 'bad') tone(180, .3, 'sawtooth', .12);
    if (name === 'lamp') tone(420 + arguments[1] * 90, .18, 'sine', .16);
    if (name === 'key') { [523, 659, 784].forEach(function (f, i) { tone(f, .14, 'triangle', .2, i * .09); }); }
    if (name === 'win') { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, .3, 'triangle', .22, i * .13); }); }
  }

  /* ===== 通用 ===== */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function ri(n) { return Math.floor(Math.random() * n); }
  function show(id) {
    ['intro', 'game', 'failScreen', 'winScreen'].forEach(function (s) {
      els[s].classList.toggle('hidden', s !== id);
    });
  }
  function msg(text, sticky) {
    els.msg.textContent = text;
    if (!sticky) setTimeout(function () { if (els.msg.textContent === text) els.msg.textContent = ''; }, 2200);
  }
  function confettiBurst() {
    var colors = ['#a78bfa', '#f472b6', '#ffd166', '#4ade80', '#38bdf8', '#fb923c'];
    for (var i = 0; i < 90; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[ri(colors.length)];
      p.style.animationDuration = (2 + Math.random() * 2) + 's';
      p.style.animationDelay = Math.random() * .8 + 's';
      p.style.width = (6 + ri(10)) + 'px';
      p.style.height = (10 + ri(12)) + 'px';
      els.confetti.appendChild(p);
    }
    setTimeout(function () { els.confetti.innerHTML = ''; }, 5000);
  }

  /* ===== 计时 ===== */
  function startTimer() {
    S.timeLeft = TOTAL_TIME;
    S.startTime = Date.now();
    paintTimer();
    clearInterval(S.timer);
    S.timer = setInterval(function () {
      S.timeLeft--;
      paintTimer();
      if (S.timeLeft <= 0) {
        clearInterval(S.timer);
        fail();
      }
    }, 1000);
  }
  function paintTimer() {
    var m = Math.floor(S.timeLeft / 60), s = S.timeLeft % 60;
    els.timer.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    els.timer.classList.toggle('low', S.timeLeft <= 30);
  }

  /* ===== 流程 ===== */
  function start() {
    S.level = 1;
    S.done = false;
    show('game');
    startTimer();
    enterLevel(1);
  }
  function enterLevel(n) {
    S.level = n;
    els.levelTag.textContent = '第 ' + n + ' 关 · ' + ['密码箱', '记忆灯光', '谜语门', '时钟密码'][n - 1];
    for (var i = 1; i <= 4; i++) els['pz' + i].classList.toggle('hidden', i !== n);
    els.progBar.style.width = ((n - 1) / 4 * 100) + '%';
    els.msg.textContent = '';
    if (n === 1) setupL1();
    if (n === 2) setupL2();
    if (n === 3) setupL3();
    if (n === 4) setupL4();
  }
  function nextLevel() {
    sfx('key');
    confettiBurst();
    enterLevel(S.level + 1);
  }
  function win() {
    S.done = true;
    clearInterval(S.timer);
    sfx('win');
    confettiBurst();
    var used = TOTAL_TIME - S.timeLeft;
    var um = Math.floor(used / 60), us = used % 60;
    try {
      var store = JSON.parse(localStorage.getItem('techbitSoloTitles') || '{}');
      store.puzzle = { earnedAt: Date.now() };
      localStorage.setItem('techbitSoloTitles', JSON.stringify(store));
      localStorage.setItem('escape_room_best', String(TOTAL_TIME - S.timeLeft));
    } catch (e) {}
    els.winInfo.textContent = '用时 ' + um + ' 分 ' + us + ' 秒 · 四道谜题全部破解';
    show('winScreen');
  }
  function fail() {
    show('failScreen');
    els.failInfo.textContent = '进度停在第 ' + S.level + ' 关「' + ['密码箱', '记忆灯光', '谜语门', '时钟密码'][S.level - 1] + '」——下次更快一点！';
  }

  /* ===== 关1 · 密码箱 ===== */
  function setupL1() {
    for (var i = 0; i < 4; i++) S.code[i] = 1 + ri(9);   // 1-9，避开 0
    S.cluePos = shuffle([1, 2, 3, 4]);
    S.found = [false, false, false, false];
    els.clueList.innerHTML = '';
    els.codeRow.classList.add('hidden');
    Array.prototype.forEach.call(document.querySelectorAll('.obj'), function (b) {
      b.disabled = false;
      b.classList.remove('opened');
    });
  }
  document.querySelectorAll('.obj').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = Number(btn.dataset.i);
      if (S.found[i]) return;
      S.found[i] = true;
      btn.disabled = true;
      btn.classList.add('opened');
      sfx('click');
      var line = document.createElement('div');
      line.className = 'clue-line';
      line.textContent = '🔍 ' + ['台灯', '挂画', '地球仪', '抽屉'][i] + '：密码第 ' + S.cluePos[i] + ' 位是 ' + S.code[S.cluePos[i] - 1];
      els.clueList.appendChild(line);
      if (S.found.every(function (f) { return f; })) {
        els.codeRow.classList.remove('hidden');
        els.codeInput.focus();
        sfx('key');
        msg('线索齐了！输入 4 位密码打开密码箱');
      }
    });
  });
  function tryCode() {
    var v = els.codeInput.value.replace(/\D/g, '');
    if (v.length !== 4) { msg('请输入 4 位数字'); return; }
    if (v === S.code.join('')) {
      sfx('key');
      els.codeInput.value = '';
      nextLevel();
    } else {
      sfx('bad');
      els.codeRow.classList.add('shake');
      setTimeout(function () { els.codeRow.classList.remove('shake'); }, 450);
      msg('密码不对，再想想……');
    }
  }
  els.codeOk.addEventListener('click', tryCode);
  els.codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryCode(); });

  /* ===== 关2 · 记忆灯光 ===== */
  function setupL2() {
    S.simon.seq = [];
    for (var i = 0; i < 5; i++) S.simon.seq.push(ri(4));
    S.simon.idx = 0;
    S.simon.playing = false;
    els.simonTip.textContent = '仔细看灯光亮起的顺序，然后按同样顺序点一遍！';
    setTimeout(playSimon, 700);
  }
  function playSimon() {
    S.simon.playing = true;
    S.simon.idx = 0;
    var lamps = document.querySelectorAll('.lamp');
    lamps.forEach(function (l) { l.classList.remove('lit'); });
    S.simon.seq.forEach(function (v, i) {
      setTimeout(function () {
        lamps[v].classList.add('lit');
        sfx('lamp', v);
        setTimeout(function () { lamps[v].classList.remove('lit'); }, 380);
      }, 500 + i * 640);
    });
    setTimeout(function () {
      S.simon.playing = false;
      els.simonTip.textContent = '轮到你了！按顺序点亮灯光';
    }, 500 + S.simon.seq.length * 640);
  }
  document.querySelectorAll('.lamp').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (S.simon.playing || S.level !== 2 || els.pz2.classList.contains('hidden')) return;
      var i = Number(btn.dataset.i);
      btn.classList.add('lit');
      sfx('lamp', i);
      setTimeout(function () { btn.classList.remove('lit'); }, 260);
      if (i === S.simon.seq[S.simon.idx]) {
        S.simon.idx++;
        if (S.simon.idx >= S.simon.seq.length) {
          S.simon.playing = true;
          sfx('ok');
          msg('✅ 记忆完美！门开了……', true);
          setTimeout(nextLevel, 900);
        }
      } else {
        sfx('bad');
        btn.classList.add('wrong');
        setTimeout(function () { btn.classList.remove('wrong'); }, 450);
        msg('❌ 顺序不对，再看一遍灯光演示');
        setTimeout(playSimon, 900);
      }
    });
  });
  els.simonReplay.addEventListener('click', function () {
    if (S.level === 2 && !S.simon.playing) playSimon();
  });

  /* ===== 关3 · 谜语门 ===== */
  var RIDDLES = [
    { q: '什么瓜不能吃？', a: ['西瓜', '傻瓜', '冬瓜', '南瓜'], c: 1 },
    { q: '什么包不能背？', a: ['书包', '面包', '背包', '钱包'], c: 1 },
    { q: '什么牛不会吃草？', a: ['黄牛', '水牛', '蜗牛', '奶牛'], c: 2 },
    { q: '什么马不能骑？', a: ['骏马', '木马', '汗血宝马', '小马驹'], c: 1 },
    { q: '什么花不能摸？', a: ['玫瑰', '雪花', '火花', '棉花'], c: 2 },
    { q: '什么鱼不会游泳？', a: ['鲤鱼', '金鱼', '木鱼', '鲨鱼'], c: 2 },
    { q: '什么车没有轮子？', a: ['风车', '自行车', '火车', '马车'], c: 0 },
    { q: '什么杯不能喝水？', a: ['水杯', '茶杯', '奖杯', '保温杯'], c: 2 },
    { q: '什么蛋不能吃？', a: ['鸡蛋', '脸蛋', '恐龙蛋', '鸭蛋'], c: 1 },
    { q: '什么伞不能挡雨？', a: ['雨伞', '降落伞', '太阳伞', '油纸伞'], c: 1 },
    { q: '什么路不能走？', a: ['公路', '电路', '铁路', '小路'], c: 1 },
    { q: '什么池不能游泳？', a: ['泳池', '电池', '池塘', '澡池'], c: 1 }
  ];
  function setupL3() {
    S.riddles = shuffle(RIDDLES).slice(0, 2);
    S.ri = 0;
    showRiddle();
  }
  function showRiddle() {
    var r = S.riddles[S.ri];
    els.riddleQ.textContent = '谜语 ' + (S.ri + 1) + ' / 2：' + r.q;
    els.riddleChoices.innerHTML = '';
    r.a.forEach(function (text, idx) {
      var btn = document.createElement('button');
      btn.textContent = text;
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(els.riddleChoices.children, function (b) { b.disabled = true; });
        if (idx === r.c) {
          btn.classList.add('ok');
          sfx('ok');
          setTimeout(function () {
            S.ri++;
            if (S.ri >= S.riddles.length) {
              msg('✅ 两道谜语全部答对！大门缓缓打开……', true);
              setTimeout(nextLevel, 900);
            } else showRiddle();
          }, 650);
        } else {
          btn.classList.add('bad');
          sfx('bad');
          msg('❌ 不对哦，再想想……');
          setTimeout(function () {
            Array.prototype.forEach.call(els.riddleChoices.children, function (b) { b.disabled = false; });
          }, 500);
        }
      });
      els.riddleChoices.appendChild(btn);
    });
  }

  /* ===== 关4 · 时钟密码 ===== */
  function setupL4() {
    S.clock.h = 12; S.clock.m = 0;
    S.clock.th = 1 + ri(12);
    S.clock.tm = ri(12) * 5;
    els.clockTip.innerHTML = '⏰ 大门上的密码锁：把时钟拨到 <b>' + S.clock.th + ' 点 ' + (S.clock.tm < 10 ? '0' : '') + S.clock.tm + ' 分</b>，门就会打开！';
    paintClock();
  }
  function paintClock() {
    var hAngle = (S.clock.h % 12) * 30 + S.clock.m * 0.5;
    var mAngle = S.clock.m * 6;
    document.getElementById('handH').setAttribute('transform', 'rotate(' + hAngle + ' 100 100)');
    document.getElementById('handM').setAttribute('transform', 'rotate(' + mAngle + ' 100 100)');
    els.clockText.textContent = S.clock.h + ' 点 ' + (S.clock.m < 10 ? '0' : '') + S.clock.m + ' 分';
  }
  document.querySelectorAll('.clock-btns button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (S.level !== 4 || gameOverNow()) return;
      sfx('click');
      var act = btn.dataset.act;
      if (act === 'h+1') S.clock.h = S.clock.h % 12 + 1;
      if (act === 'h-1') {
        S.clock.h = S.clock.h - 1 < 1 ? 12 : S.clock.h - 1;
      }
      if (act === 'm+5') S.clock.m = (S.clock.m + 5) % 60;
      if (act === 'm-5') S.clock.m = (S.clock.m + 55) % 60;
      paintClock();
    });
  });
  function gameOverNow() { return S.done; }
  document.getElementById('clockOk').addEventListener('click', function () {
    if (S.level !== 4) return;
    if (S.clock.h === S.clock.th && S.clock.m === S.clock.tm) {
      sfx('key');
      win();
    } else {
      sfx('bad');
      msg('时间不对，密码箱上刻着提示……再对一对');
    }
  });

  /* ===== 测试钩子（自动验收用，不影响游戏） ===== */
  window.EscapeDebug = {
    code: function () { return S.code.join(''); },
    clueAllFound: function () { return S.found.every(function (f) { return f; }); },
    simonSeq: function () { return S.simon.seq.join(','); },
    simonIdx: function () { return S.simon.idx; },
    riddleAnswer: function () { return S.riddles[S.ri] ? S.riddles[S.ri].a[S.riddles[S.ri].c] : ''; },
    clockTarget: function () { return S.clock.th + ':' + (S.clock.tm < 10 ? '0' : '') + S.clock.tm; },
    state: function () { return { level: S.level, timeLeft: S.timeLeft }; }
  };

  /* ===== 启动 ===== */
  els.startBtn.addEventListener('click', start);
  els.failRetry.addEventListener('click', start);
  els.winRetry.addEventListener('click', start);
})();
