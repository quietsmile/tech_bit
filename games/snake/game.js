(function () {
  'use strict';

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var GRID = 20;                 // 格数
  var CELL = canvas.width / GRID;
  var BASE_MS = 320;             // 初始速度（放慢 2 倍）
  var MIN_MS = 60;               // 最快速度
  var SPEEDUP = 6;               // 每吃一个食物加速的毫秒数

  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var oppWrap = document.getElementById('oppWrap');
  var oppScoreEl = document.getElementById('oppScore');
  var roomChip = document.getElementById('roomChip');
  var roomChipCode = document.getElementById('roomChipCode');
  var pauseBtn = document.getElementById('pauseBtn');
  var restartBtn = document.getElementById('restartBtn');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlayTitle');
  var overlayText = document.getElementById('overlayText');
  var overlayRestart = document.getElementById('overlayRestart');
  var menu = document.getElementById('menu');
  var menuStatus = document.getElementById('menuStatus');

  var mode = 'menu'; // menu | local | host | guest
  var snake, dir, nextDir, food, score, speed, timer, state; // 单人模式
  var best = parseInt(localStorage.getItem('snake_best') || '0', 10) || 0;
  bestEl.textContent = best;

  /* ===== 联机状态 ===== */
  var online = {
    code: '', token: '',
    pollTimer: null,        // 客人拉状态 / 房主拉输入
    timer: null,            // 房主对局节拍
    version: -1,
    speed: BASE_MS,
    finished: false,
    guestSeen: false,
    food: null
  };
  var seats = []; // 房主模式：所有蛇（座位 0=房主）

  var SEAT_COLORS = [
    { body: '#7bd88f', head: '#a4f0b7' },
    { body: '#7ec8ff', head: '#b3e0ff' },
    { body: '#fbbf24', head: '#fde68a' },
    { body: '#f472b6', head: '#fbcfe8' },
    { body: '#c084fc', head: '#e9d5ff' },
    { body: '#fb923c', head: '#fed7aa' }
  ];
  var SPAWNS = [
    { cells: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], dir: { x: 1, y: 0 } },
    { cells: [{ x: 10, y: 4 }, { x: 11, y: 4 }, { x: 12, y: 4 }], dir: { x: -1, y: 0 } },
    { cells: [{ x: 4, y: 10 }, { x: 4, y: 11 }, { x: 4, y: 12 }], dir: { x: 0, y: -1 } },
    { cells: [{ x: 16, y: 10 }, { x: 16, y: 11 }, { x: 16, y: 12 }], dir: { x: 0, y: 1 } },
    { cells: [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }], dir: { x: 1, y: 0 } },
    { cells: [{ x: 16, y: 4 }, { x: 17, y: 4 }, { x: 18, y: 4 }], dir: { x: -1, y: 0 } }
  ];

  function hideMenu() { menu.classList.add('hidden2'); }
  function showMenu() { mode = 'menu'; menu.classList.remove('hidden2'); }
  function showMenuStatus(text) { menuStatus.textContent = text; }


  /* ================= 单人模式（原有玩法） ================= */
  function spawnFood() {
    var p;
    do {
      p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some(function (s) { return s.x === p.x && s.y === p.y; }));
    food = p;
  }

  function start() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    speed = BASE_MS;
    state = 'playing';
    scoreEl.textContent = '0';
    oppWrap.classList.add('hidden');
    roomChip.classList.add('hidden');
    overlay.classList.add('hidden');
    pauseBtn.textContent = '暂停';
    spawnFood();
    schedule();
    draw();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, speed);
  }

  function setDir(x, y) {
    if (state === 'playing' && (x !== -dir.x || y !== -dir.y)) {
      nextDir = { x: x, y: y };
    }
  }

  function tick() {
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    var hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
    var hitSelf = snake.some(function (s) { return s.x === head.x && s.y === head.y; });
    if (hitWall || hitSelf) { gameOver(); return; }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      scoreEl.textContent = score;
      speed = Math.max(MIN_MS, speed - SPEEDUP);
      spawnFood();
    } else {
      snake.pop();
    }
    draw();
    schedule();
  }

  function draw() {
    ctx.fillStyle = '#10131b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f26d6d';
    ctx.beginPath();
    ctx.arc((food.x + 0.5) * CELL, (food.y + 0.5) * CELL, CELL * 0.35, 0, Math.PI * 2);
    ctx.fill();
    snake.forEach(function (s, i) {
      ctx.fillStyle = i === 0 ? '#a4f0b7' : '#7bd88f';
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }

  function togglePause() {
    if (mode === 'guest') return;
    if (state === 'playing') {
      state = 'paused';
      clearTimeout(timer);
      pauseBtn.textContent = '继续';
    } else if (state === 'paused') {
      state = 'playing';
      pauseBtn.textContent = '暂停';
      schedule();
    }
  }

  function gameOver() {
    state = 'over';
    clearTimeout(timer);
    if (score > best) {
      best = score;
      localStorage.setItem('snake_best', String(best));
      bestEl.textContent = best;
    }
    overlayTitle.textContent = '游戏结束';
    overlayText.textContent = '本局得分：' + score + '　最高分：' + best;
    overlayRestart.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }

  /* ================= 联机中继 API ================= */
  function postJSON(path, payload) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  /* ================= 联机·房主（权威端） ================= */
  function makeSnake(cells, dir) {
    return { body: cells, dir: dir, nextDir: dir, alive: true, score: 0 };
  }

  function spawnFoodOnline() {
    var taken = [];
    seats.forEach(function (sn) { taken = taken.concat(sn.body); });
    var p;
    do {
      p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (taken.some(function (s) { return s.x === p.x && s.y === p.y; }));
    online.food = p;
  }

  function hostScene() {
    return {
      status: online.finished ? 'over' : 'playing',
      food: online.food,
      snakes: seats.map(function (sn, idx) {
        return { seat: idx, body: sn.body, alive: sn.alive, score: sn.score };
      })
    };
  }

  function broadcast() {
    postJSON('/api/relay/state', { code: online.code, token: online.token, state: hostScene() })
      .catch(function () {});
  }

  function startHostRound() {
    var guestCount = Math.min(online.guests.length, SPAWNS.length - 1);
    seats = [makeSnake(SPAWNS[0].cells, SPAWNS[0].dir)];
    for (var g = 0; g < guestCount; g++) {
      seats.push(makeSnake(SPAWNS[g + 1].cells, SPAWNS[g + 1].dir));
    }
    online.speed = BASE_MS;
    online.finished = false;
    spawnFoodOnline();
    overlay.classList.add('hidden');
    pauseBtn.textContent = '暂停';
    drawScene(hostScene());
    if (online.timer) clearTimeout(online.timer);
    online.timer = setTimeout(hostTick, online.speed);
    broadcast();
  }

  function headHitsBody(head, body) {
    return body.some(function (s) { return s.x === head.x && s.y === head.y; });
  }

  function hostTick() {
    if (online.finished) return;
    var i, j, sn;
    for (i = 0; i < seats.length; i++) { seats[i].dir = seats[i].nextDir; }

    var heads = seats.map(function (sn) {
      return sn.alive ? { x: sn.body[0].x + sn.dir.x, y: sn.body[0].y + sn.dir.y } : null;
    });
    var hitWall = function (h) { return h.x < 0 || h.y < 0 || h.x >= GRID || h.y >= GRID; };

    for (i = 0; i < seats.length; i++) {
      if (!seats[i].alive) continue;
      var h = heads[i];
      if (hitWall(h) || headHitsBody(h, seats[i].body)) { seats[i].alive = false; continue; }
      for (j = 0; j < seats.length; j++) {
        if (j !== i && headHitsBody(h, seats[j].body)) { seats[i].alive = false; break; }
      }
    }
    for (i = 0; i < seats.length; i++) {
      for (j = i + 1; j < seats.length; j++) {
        if (seats[i].alive && seats[j].alive && heads[i] && heads[j] &&
            heads[i].x === heads[j].x && heads[i].y === heads[j].y) {
          seats[i].alive = false; seats[j].alive = false;
        }
      }
    }

    for (i = 0; i < seats.length; i++) {
      sn = seats[i];
      if (!sn.alive) continue;
      sn.body.unshift(heads[i]);
      if (heads[i].x === online.food.x && heads[i].y === online.food.y) {
        sn.score++;
        online.speed = Math.max(MIN_MS, online.speed - SPEEDUP);
        spawnFoodOnline();
      } else {
        sn.body.pop();
      }
    }

    scoreEl.textContent = seats[0].score;
    var bestOther = 0;
    for (i = 1; i < seats.length; i++) bestOther = Math.max(bestOther, seats[i].score);
    oppScoreEl.textContent = bestOther;

    var anyAlive = seats.some(function (s) { return s.alive; });
    if (!anyAlive) {
      online.finished = true;
      broadcast();
      drawScene(hostScene());
      var ranking = seats.map(function (s, idx) {
        return (idx + 1) + '号 ' + s.score + ' 分';
      }).join(' · ');
      overlayTitle.textContent = '比赛结束！';
      overlayText.textContent = '排名：' + ranking;
      overlayRestart.textContent = '再来一局';
      overlayRestart.classList.remove('hidden');
      overlay.classList.remove('hidden');
      return;
    }

    drawScene(hostScene());
    broadcast();
    if (online.timer) clearTimeout(online.timer);
    online.timer = setTimeout(hostTick, online.speed);
  }

  function pollHostInputs() {
    fetch('/api/relay/inputs?code=' + online.code + '&token=' + online.token)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;
        online.guests = data.guests || [];
        if (online.guests.length >= 1 && !online.guestSeen) {
          online.guestSeen = true;
          startHostRound();
        }
        for (var i = 0; i < data.inputs.length; i++) {
          var input = data.inputs[i];
          if (!input || !input.dir || !input.token) continue;
          var seatIdx = online.guests.indexOf(input.token) + 1;
          var sn = seats[seatIdx];
          if (!sn || !sn.alive) continue;
          if (input.dir[0] !== -sn.dir.x || input.dir[1] !== -sn.dir.y) sn.nextDir = { x: input.dir[0], y: input.dir[1] };
        }
      })
      .catch(function () {});
  }

  function joinOnline() {
    hideMenu();
    overlayRestart.classList.add('hidden');
    overlayTitle.textContent = '🌐 正在进入联机房间…';
    overlayText.textContent = '';
    overlay.classList.remove('hidden');
    var stored = localStorage.getItem('snake_relay_token') || '';
    postJSON('/api/relay/auto', { game: 'snake', token: stored }).then(function (data) {
      if (!data.ok) {
        overlayTitle.textContent = '暂时无法进入联机';
        overlayText.textContent = data.error || '稍后再试';
        return;
      }
      localStorage.setItem('snake_relay_token', data.token);
      online.code = data.code;
      online.token = data.token;
      online.mySeat = data.seat || 0;
      roomChip.classList.remove('hidden');
      roomChipCode.textContent = data.code;
      oppWrap.classList.remove('hidden');
      oppScoreEl.textContent = '0';
      if (data.role === 'host') {
        mode = 'host';
        online.guestSeen = false;
        overlayTitle.textContent = '🌐 联机房间 ' + data.code;
        overlayText.textContent = '你是房主（绿蛇）· 等待其他玩家加入，人齐自动开始！（最多 6 人）';
        if (online.pollTimer) clearInterval(online.pollTimer);
        online.pollTimer = setInterval(pollHostInputs, 250);
      } else {
        mode = 'guest';
        online.mySeat = data.seat;
        overlayTitle.textContent = '🌐 已进入房间 ' + data.code;
        overlayText.textContent = '你控制 ' + data.seat + ' 号蛇（' + seatName(data.seat) + '）· 等待开局…';
        if (online.pollTimer) clearInterval(online.pollTimer);
        online.pollTimer = setInterval(pollGuestState, 250);
      }
    }).catch(function () {
      overlayTitle.textContent = '进入失败';
      overlayText.textContent = '请稍后再试';
    });
  }

  function seatName(seat) {
    var names = ['绿蛇（房主）', '蓝蛇', '黄蛇', '粉蛇', '紫蛇', '橙蛇'];
    return names[seat] || (seat + ' 号蛇');
  }

  /* ================= 联机·客人（观看 + 控制蓝蛇） ================= */
  function drawScene(scene) {
    ctx.fillStyle = '#10131b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!scene || !scene.food) return;
    ctx.fillStyle = '#f26d6d';
    ctx.beginPath();
    ctx.arc((scene.food.x + 0.5) * CELL, (scene.food.y + 0.5) * CELL, CELL * 0.35, 0, Math.PI * 2);
    ctx.fill();
    scene.snakes.forEach(function (sn) {
      if (!sn.alive) return;
      var colors = SEAT_COLORS[sn.seat] || SEAT_COLORS[0];
      sn.body.forEach(function (s, i) {
        ctx.fillStyle = i === 0 ? colors.head : colors.body;
        ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      });
    });
  }

  function pollGuestState() {
    fetch('/api/relay/state?code=' + online.code)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || data.version === online.version) return;
        online.version = data.version;
        var scene = data.state;
        if (!scene) return;
        drawScene(scene);
        var mySeat = online.mySeat || 1;
        var mine = scene.snakes[mySeat] || scene.snakes[1];
        var bestOther = 0;
        scene.snakes.forEach(function (sn, idx) {
          if (idx !== mySeat) bestOther = Math.max(bestOther, sn.score);
        });
        scoreEl.textContent = mine.score;
        oppScoreEl.textContent = bestOther;
        if (scene.status === 'over') {
          var ranking = scene.snakes.map(function (sn, idx) {
            return (idx + 1) + '号 ' + sn.score + ' 分';
          }).join(' · ');
          overlayTitle.textContent = '比赛结束！';
          overlayText.textContent = '你（' + mySeat + '号蛇）：' + mine.score + ' 分　' + ranking;
          overlayRestart.classList.add('hidden');
          overlayText.textContent += '　等待房主开新局…';
          overlay.classList.remove('hidden');
        } else {
          overlay.classList.add('hidden');
        }
      })
      .catch(function () {});
  }

  function sendGuestInput(dir) {
    postJSON('/api/relay/input', { code: online.code, token: online.token, input: { dir: dir } }).catch(function () {});
  }

  function startGuest(code) {
    mode = 'guest';
    online.code = code;
    postJSON('/api/relay/join', { code: code }).then(function (data) {
      online.token = data.token;
      online.mySeat = data.seat || 1;
      roomChip.classList.remove('hidden');
      roomChipCode.textContent = code;
      oppWrap.classList.remove('hidden');
      oppScoreEl.textContent = '0';
      overlayTitle.textContent = '🌐 已加入房间 ' + code;
      overlayText.textContent = '你控制蓝蛇（方向键 / WASD）· 等待房主开始…';
      overlayRestart.classList.add('hidden');
      overlay.classList.remove('hidden');
      if (online.pollTimer) clearInterval(online.pollTimer);
      online.pollTimer = setInterval(pollGuestState, 250);
    }).catch(function (error) {
      showMenuStatus(error.message || '加入失败');
    });
  }

  /* ================= 菜单与按钮 ================= */
  document.getElementById('btnSolo').addEventListener('click', function () {
    hideMenu();
    mode = 'local';
    oppWrap.classList.add('hidden');
    roomChip.classList.add('hidden');
    if (online.pollTimer) clearInterval(online.pollTimer);
    start();
  });
  document.getElementById('btnOnline').addEventListener('click', function () {
    joinOnline();
  });

  var KEY_DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (mode !== 'guest' && mode !== 'menu' && state !== 'over') togglePause();
      return;
    }
    var d = KEY_DIRS[e.key];
    if (d) {
      e.preventDefault();
      if (mode === 'guest') sendGuestInput(d);
      else setDir(d[0], d[1]);
    }
  });

  document.querySelectorAll('.dpad button[data-dir]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      var d = map[btn.getAttribute('data-dir')];
      if (mode === 'guest') sendGuestInput(d);
      else setDir(d[0], d[1]);
    });
  });

  var touchStart = null;
  canvas.addEventListener('touchstart', function (e) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    var d = Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 1 : -1, 0] : [0, dy > 0 ? 1 : -1];
    if (mode === 'guest') sendGuestInput(d);
    else setDir(d[0], d[1]);
  });

  pauseBtn.addEventListener('click', function () {
    if (mode === 'guest' || mode === 'menu') return;
    if (state !== 'over') togglePause();
  });
  restartBtn.addEventListener('click', function () {
    if (mode === 'host') { startHostRound(); return; }
    if (mode === 'guest') return;
    start();
  });
  overlayRestart.addEventListener('click', function () {
    if (mode === 'host') startHostRound();
    else start();
  });

  showMenu();
})();
