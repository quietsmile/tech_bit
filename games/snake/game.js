(function () {
  'use strict';

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var GRID = 20;                 // 格数
  var CELL = canvas.width / GRID;
  GRID = 24;
  CELL = canvas.width / GRID;
  var SPAWN_LENGTH = 3;
  var SPAWN_MARGIN = 3;
  var SPAWN_GRACE_TICKS = 2;
  var spawnGrace = 0;
  var MAX_FOODS = 7;
  var FOOD_INTERVAL = 3;
  var ONLINE_MAX_FOODS = 10;
  var ONLINE_FOOD_INTERVAL = 2;
  var BASE_MS = 320;             // 初始速度（放慢 2 倍）
  var MIN_MS = 60;               // 最快速度
  var SPEEDUP = 3;               // doubled from the previous tuning

  var foods = [];
  var foodClock = 0;
  var boostUntil = 0;
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var rankListEl = document.getElementById('rankList');
  var scoreboardEl = document.getElementById('scoreboard');
  var pauseBtn = document.getElementById('pauseBtn');
  var restartBtn = document.getElementById('restartBtn');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlayTitle');
  var overlayText = document.getElementById('overlayText');
  var overlayRestart = document.getElementById('overlayRestart');
  var menu = document.getElementById('menu');
  var menuStatus = document.getElementById('menuStatus');
  var playerIdInput = document.getElementById('playerIdInput');
  var exitBtn = document.getElementById('exitBtn');
  var playerId = '玩家1';

  var mode = 'menu'; // menu | local | host | guest
  var snake, dir, nextDir, food, score, speed, timer, state; // 单人模式
  var best = parseInt(localStorage.getItem('snake_best') || '0', 10) || 0;
  bestEl.textContent = best;

  /* ===== 联机状态 ===== */
  var online = {
    code: 'SNAKE', token: '',
    pollTimer: null,        // 客人拉状态 / 房主拉输入
    timer: null,            // 房主对局节拍
    version: -1,
    speed: BASE_MS,
    finished: false,
    guestSeen: false,
    foods: [],
    foodClock: 0,
    boostUntil: 0,
    pendingDir: null,
    guests: [],
    playerId: '',
    playerIds: [],
    lastGuestCount: -1
  };
  var seats = []; // 房主模式：所有蛇（座位 0=房主）

  function apiUrl(path) {
    if (path.indexOf('/api/relay/') !== 0) return path;
    if (location.protocol === 'http:' && location.port === '8100') return path;
    return 'http://localhost:8100' + path;
  }

  var SEAT_COLORS = [
    { body: '#7bd88f', head: '#a4f0b7' },
    { body: '#7ec8ff', head: '#b3e0ff' },
    { body: '#fbbf24', head: '#fde68a' },
    { body: '#f472b6', head: '#fbcfe8' }
  ];
  var SEAT_NAMES = ['绿蛇', '蓝蛇', '黄蛇', '粉蛇', '紫蛇', '橙蛇'];
  var SPAWNS = [
    { cells: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], dir: { x: 1, y: 0 } },
    { cells: [{ x: 10, y: 4 }, { x: 11, y: 4 }, { x: 12, y: 4 }], dir: { x: -1, y: 0 } },
    { cells: [{ x: 4, y: 10 }, { x: 4, y: 11 }, { x: 4, y: 12 }], dir: { x: 0, y: -1 } },
    { cells: [{ x: 16, y: 10 }, { x: 16, y: 11 }, { x: 16, y: 12 }], dir: { x: 0, y: 1 } },
    { cells: [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }], dir: { x: 1, y: 0 } },
    { cells: [{ x: 16, y: 4 }, { x: 17, y: 4 }, { x: 18, y: 4 }], dir: { x: -1, y: 0 } }
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function updateScoreboard(players) {
    if (!scoreboardEl) return;
    if (!players || !players.length) {
      scoreboardEl.innerHTML = '<div class="score-empty">等待开始</div>';
      return;
    }
    scoreboardEl.innerHTML = players.map(function (player, index) {
      var colors = SEAT_COLORS[player.seat == null ? index : player.seat] || SEAT_COLORS[0];
      var stateClass = player.alive === false ? ' dead' : '';
      return '<div class="score-row' + stateClass + '" style="--player-color:' + colors.body + '">' +
        '<span>' + escapeHtml(player.id || ('玩家' + (index + 1))) + '</span>' +
        '<span class="player-score">' + (player.score || 0) + '</span>' +
        '</div>';
    }).join('');
  }

  function drawCrown(x, y) {
    var width = CELL * 0.72;
    var height = CELL * 0.48;
    var left = x - width / 2;
    var top = Math.max(2, y - CELL * 0.94);
    ctx.save();
    ctx.fillStyle = '#ffd166';
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, top + height);
    ctx.lineTo(left + width * 0.08, top + height * 0.2);
    ctx.lineTo(left + width * 0.36, top + height * 0.58);
    ctx.lineTo(left + width * 0.5, top);
    ctx.lineTo(left + width * 0.64, top + height * 0.58);
    ctx.lineTo(left + width * 0.92, top + height * 0.2);
    ctx.lineTo(left + width, top + height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(left, top + height * 0.72, width, height * 0.22);
    ctx.strokeRect(left, top + height * 0.72, width, height * 0.22);
    ctx.restore();
  }

  function hideMenu() { menu.classList.add('hidden2'); }
  function showMenu() { mode = 'menu'; menu.classList.remove('hidden2'); }
  function showMenuStatus(text) { menuStatus.textContent = text; }


  /* ================= 单人模式（原有玩法） ================= */
  function copyDir(dir) {
    return { x: dir.x, y: dir.y };
  }

  function cellsOverlap(a, b) {
    return a.some(function (left) {
      return b.some(function (right) { return left.x === right.x && left.y === right.y; });
    });
  }

  function findSafeSpawn(occupied) {
    var directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 },
      { x: 0, y: 1 }, { x: 0, y: -1 }
    ];
    var min = SPAWN_MARGIN;
    var max = GRID - SPAWN_MARGIN - 1;
    var attempts = 120;
    while (attempts-- > 0) {
      var heading = directions[Math.floor(Math.random() * directions.length)];
      var head = {
        x: min + Math.floor(Math.random() * (max - min + 1)),
        y: min + Math.floor(Math.random() * (max - min + 1))
      };
      var body = [];
      for (var i = 0; i < SPAWN_LENGTH; i++) {
        body.push({ x: head.x - heading.x * i, y: head.y - heading.y * i });
      }
      if (!cellsOverlap(body, occupied)) return { body: body, dir: heading };
    }

    for (var y = min; y <= max; y++) {
      for (var x = min; x <= max; x++) {
        for (var d = 0; d < directions.length; d++) {
          var fallback = [];
          for (var j = 0; j < SPAWN_LENGTH; j++) {
            fallback.push({ x: x - directions[d].x * j, y: y - directions[d].y * j });
          }
          var inside = fallback.every(function (cell) {
            return cell.x >= 0 && cell.y >= 0 && cell.x < GRID && cell.y < GRID;
          });
          if (inside && !cellsOverlap(fallback, occupied)) {
            return { body: fallback, dir: directions[d] };
          }
        }
      }
    }
    return {
      body: [{ x: SPAWN_MARGIN, y: SPAWN_MARGIN },
        { x: SPAWN_MARGIN - 1, y: SPAWN_MARGIN },
        { x: SPAWN_MARGIN - 2, y: SPAWN_MARGIN }],
      dir: { x: 1, y: 0 }
    };
  }

  function foodOverlaps(item, list) {
    return list.some(function (cell) { return cell.x === item.x && cell.y === item.y; });
  }

  function createFood(occupied) {
    var p;
    var attempts = 160;
    do {
      p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
      attempts--;
    } while (attempts > 0 && (foodOverlaps(p, occupied) || foodOverlaps(p, foods)));
    if (foodOverlaps(p, occupied) || foodOverlaps(p, foods)) return null;
    var roll = Math.random();
    return {
      x: p.x,
      y: p.y,
      type: roll < 0.12 ? 'boost' : roll < 0.30 ? 'big' : 'small',
      value: roll < 0.12 ? 1 : roll < 0.30 ? 3 : 1
    };
  }

  function spawnFood() {
    var item = createFood(snake || []);
    if (item) foods.push(item);
    return item;
  }

  function resetFoods(count) {
    foods = [];
    foodClock = 0;
    while (foods.length < count) {
      if (!spawnFood()) break;
    }
  }

  function updateFoods(dt) {
    foodClock += dt;
    if (foodClock < FOOD_INTERVAL) return;
    foodClock = 0;
    if (foods.length < MAX_FOODS) spawnFood();
  }

  function currentSpeed() {
    var value = speed;
    if (boostUntil > Date.now()) value *= 0.68;
    return Math.max(MIN_MS, value);
  }

  function currentOnlineSpeed() {
    var value = online.speed;
    if (online.boostUntil > Date.now()) value *= 0.68;
    return Math.max(MIN_MS, value);
  }

  function start() {
    playerId = (playerIdInput.value || '').trim().slice(0, 3) || '玩家1';
    playerIdInput.value = playerId;
    var spawn = findSafeSpawn([]);
    snake = spawn.body;
    dir = spawn.dir;
    nextDir = copyDir(dir);
    spawnGrace = SPAWN_GRACE_TICKS;
    score = 0;
    speed = BASE_MS;
    boostUntil = 0;
    state = 'playing';
    scoreEl.textContent = '0';
    updateScoreboard([{ id: playerId, score: 0, seat: 0, alive: true }]);
    overlay.classList.add('hidden');
    pauseBtn.textContent = '暂停';
    resetFoods(MAX_FOODS);
    schedule();
    draw();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, currentSpeed());
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
    var hitSelf = spawnGrace <= 0 && snake.some(function (s) { return s.x === head.x && s.y === head.y; });
    if (hitWall || hitSelf) { gameOver(); return; }
    spawnGrace = Math.max(0, spawnGrace - 1);
    snake.unshift(head);
    var foodIndex = foods.findIndex(function (item) {
      return item.x === head.x && item.y === head.y;
    });
    if (foodIndex >= 0) {
      var eaten = foods.splice(foodIndex, 1)[0];
      score += eaten.value || 1;
      scoreEl.textContent = score;
      updateScoreboard([{ id: playerId, score: score, seat: 0, alive: true }]);
      speed = Math.max(MIN_MS, speed - SPEEDUP * (eaten.value || 1));
      if (eaten.type === 'boost') boostUntil = Math.max(boostUntil, Date.now() + 5000);
    } else {
      snake.pop();
    }
    updateFoods(currentSpeed() / 1000);
    draw();
    schedule();
  }

  function draw() {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#050505';
    ctx.lineWidth = 1;
    for (var grid = 0; grid <= GRID; grid++) {
      ctx.beginPath();
      ctx.moveTo(grid * CELL, 0); ctx.lineTo(grid * CELL, canvas.height); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, grid * CELL); ctx.lineTo(canvas.width, grid * CELL); ctx.stroke();
    }
    foods.forEach(function (item) {
      var foodColor = item.type === 'boost' ? '#60a5fa' : item.type === 'big' ? '#fbbf24' : '#f26d6d';
      ctx.beginPath();
      ctx.fillStyle = foodColor;
      ctx.arc((item.x + 0.5) * CELL, (item.y + 0.5) * CELL,
        CELL * (item.type === 'big' ? 0.42 : item.type === 'boost' ? 0.32 : 0.25), 0, Math.PI * 2);
      ctx.fill();
      if (item.type === 'boost') {
        ctx.fillStyle = '#e0f2fe';
        ctx.font = 'bold ' + Math.max(10, CELL * 0.65) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚡', (item.x + 0.5) * CELL, (item.y + 0.5) * CELL);
      }
    });
    snake.forEach(function (s, i) {
      if (i === 0) return;
      ctx.fillStyle = '#7bd88f';
      ctx.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4);
    });
    var headX = (snake[0].x + .5) * CELL;
    var headY = (snake[0].y + .5) * CELL;
    ctx.beginPath();
    ctx.arc(headX, headY, CELL * .43, 0, Math.PI * 2);
    ctx.fillStyle = '#a4f0b7';
    ctx.fill();
    ctx.strokeStyle = '#2f855a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold ' + Math.max(8, CELL * .42) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(playerId, headX, headY);
    drawCrown(headX, headY);
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
    return fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.text().then(function (text) {
        var data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          data = {};
        }
        if (!r.ok) {
          data.ok = false;
          data.error = data.error || ('服务器返回错误（' + r.status + '）');
        }
        return data;
      });
    });
  }

  /* ================= 联机·房主（权威端） ================= */
  function makeSnake(cells, dir, id, seat) {
    return {
      body: cells.map(function (cell) { return { x: cell.x, y: cell.y }; }),
      dir: copyDir(dir),
      nextDir: copyDir(dir),
      alive: true,
      score: 0,
      spawnGrace: SPAWN_GRACE_TICKS,
      id: id || ('玩家' + ((seat || 0) + 1)),
      seat: seat || 0
    };
  }

  function spawnFoodOnline() {
    var taken = [];
    seats.forEach(function (sn) { taken = taken.concat(sn.body); });
    taken = taken.concat(online.foods || []);
    var p;
    var attempts = 160;
    do {
      p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
      attempts--;
    } while (attempts > 0 && taken.some(function (s) { return s.x === p.x && s.y === p.y; }));
    if (taken.some(function (s) { return s.x === p.x && s.y === p.y; })) return null;
    var roll = Math.random();
    var item = { x: p.x, y: p.y, type: roll < 0.12 ? 'boost' : roll < 0.30 ? 'big' : 'small',
      value: roll < 0.12 ? 1 : roll < 0.30 ? 3 : 1 };
    online.foods.push(item);
    return item;
  }

  function deathLootPlan(scoreValue) {
    if (scoreValue >= 40) return { small: 4, big: 4 };
    if (scoreValue >= 25) return { small: 3, big: 3 };
    if (scoreValue >= 15) return { small: 3, big: 2 };
    if (scoreValue >= 8) return { small: 2, big: 2 };
    return { small: 2, big: 1 };
  }

  function spawnDeathLoot(sn) {
    var plan = deathLootPlan(sn.score || 0);
    var anchor = sn.body[0] || { x: Math.floor(GRID / 2), y: Math.floor(GRID / 2) };
    var offsets = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 },
      { x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 },
      { x: -1, y: 1 }, { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 },
      { x: 0, y: -2 }
    ];
    var occupied = [];
    seats.forEach(function (other) { occupied = occupied.concat(other.body || []); });
    occupied = occupied.concat(online.foods || []);
    var values = [];
    for (var big = 0; big < plan.big; big++) values.push(3);
    for (var small = 0; small < plan.small; small++) values.push(1);
    values.forEach(function (value, index) {
      var order = offsets.slice(index).concat(offsets.slice(0, index));
      var spot = order.find(function (offset) {
        var x = anchor.x + offset.x;
        var y = anchor.y + offset.y;
        return x >= 0 && y >= 0 && x < GRID && y < GRID &&
          !occupied.some(function (cell) { return cell.x === x && cell.y === y; });
      });
      if (!spot) return;
      var item = {
        x: anchor.x + spot.x,
        y: anchor.y + spot.y,
        type: value === 3 ? 'big' : 'small',
        value: value
      };
      online.foods.push(item);
      occupied.push(item);
    });
  }

  function killOnlineSnake(sn) {
    if (!sn.alive) return;
    sn.alive = false;
    spawnDeathLoot(sn);
  }

  function resetOnlineFoods(count) {
    online.foods = [];
    online.foodClock = 0;
    while (online.foods.length < count) {
      if (!spawnFoodOnline()) break;
    }
  }

  function updateOnlineFoods(dt) {
    online.foodClock += dt;
    while (online.foodClock >= ONLINE_FOOD_INTERVAL) {
      online.foodClock -= ONLINE_FOOD_INTERVAL;
      if (online.foods.length < ONLINE_MAX_FOODS) spawnFoodOnline();
      else break;
    }
  }

  function hostScene() {
    return {
      status: online.finished ? 'over' : 'playing',
      foods: online.foods,
      snakes: seats.map(function (sn, idx) {
        return { seat: idx, id: sn.id, body: sn.body, alive: sn.alive, score: sn.score };
      })
    };
  }

  function broadcast() {
    postJSON('/api/relay/state', { code: online.code, token: online.token, state: hostScene() })
      .catch(function () {});
  }

  function startHostRound() {
    var guestCount = Math.min(online.guests.length, 3);
    seats = [];
    var occupied = [];
    var seatIds = online.playerIds && online.playerIds.length
      ? online.playerIds.slice(0, guestCount + 1)
      : [online.playerId || playerId || '玩家1'].concat(
        online.guests.map(function (_, index) { return '玩家' + (index + 2); })
      );
    for (var g = 0; g <= guestCount; g++) {
      var spawn = findSafeSpawn(occupied);
      seats.push(makeSnake(spawn.body, spawn.dir, seatIds[g], g));
      occupied = occupied.concat(spawn.body);
    }
    online.speed = BASE_MS;
    online.boostUntil = 0;
    online.finished = false;
    resetOnlineFoods(Math.min(ONLINE_MAX_FOODS, 8));
    state = 'playing';
    overlay.classList.add('hidden');
    pauseBtn.textContent = '暂停';
    updateOnlineFoods(currentOnlineSpeed() / 1000);
    drawScene(hostScene());
    if (online.timer) clearTimeout(online.timer);
    online.timer = setTimeout(hostTick, currentOnlineSpeed());
    broadcast();
  }

  function headHitsBody(head, body) {
    return body.some(function (s) { return s.x === head.x && s.y === head.y; });
  }

  function hostTick() {
    if (online.finished) return;
    updateOnlineFoods(currentOnlineSpeed() / 1000);
    var i, j, sn;
    for (i = 0; i < seats.length; i++) { seats[i].dir = seats[i].nextDir; }

    var heads = seats.map(function (sn) {
      return sn.alive ? { x: sn.body[0].x + sn.dir.x, y: sn.body[0].y + sn.dir.y } : null;
    });
    var shielded = seats.map(function (sn) { return sn.spawnGrace > 0; });
    var hitWall = function (h) { return h.x < 0 || h.y < 0 || h.x >= GRID || h.y >= GRID; };

    for (i = 0; i < seats.length; i++) {
      if (!seats[i].alive) continue;
      var h = heads[i];
      if (hitWall(h) || (!shielded[i] && headHitsBody(h, seats[i].body))) { killOnlineSnake(seats[i]); continue; }
      for (j = 0; j < seats.length; j++) {
        if (j !== i && !shielded[i] && headHitsBody(h, seats[j].body)) { killOnlineSnake(seats[i]); break; }
      }
    }
    for (i = 0; i < seats.length; i++) {
      for (j = i + 1; j < seats.length; j++) {
        if (seats[i].alive && seats[j].alive && !shielded[i] && !shielded[j] && heads[i] && heads[j] &&
          heads[i].x === heads[j].x && heads[i].y === heads[j].y) {
          killOnlineSnake(seats[i]); killOnlineSnake(seats[j]);
        }
      }
    }

    for (i = 0; i < seats.length; i++) {
      sn = seats[i];
      if (!sn.alive) continue;
      sn.body.unshift(heads[i]);
      var eatenIndex = online.foods.findIndex(function (item) {
        return heads[i].x === item.x && heads[i].y === item.y;
      });
      if (eatenIndex >= 0) {
        var eaten = online.foods.splice(eatenIndex, 1)[0];
        sn.score += eaten.value || 1;
        online.speed = Math.max(MIN_MS, online.speed - SPEEDUP * (eaten.value || 1));
        if (eaten.type === 'boost') online.boostUntil = Math.max(online.boostUntil, Date.now() + 5000);
      } else {
        sn.body.pop();
      }
      if (sn.spawnGrace > 0) sn.spawnGrace--;
    }

    scoreEl.textContent = seats[0].score;
    updateScoreboard(seats);
    var bestOther = 0;
    for (i = 1; i < seats.length; i++) bestOther = Math.max(bestOther, seats[i].score);
    if (rankListEl) {
      rankListEl.classList.remove('hidden');
      rankListEl.textContent = '实时排名：' + seats
        .map(function (sn, idx) { return SEAT_NAMES[idx] + ' ' + sn.score + ' 分' + (sn.alive ? '' : '（淘汰）'); })
        .join(' · ');
    }

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
    online.timer = setTimeout(hostTick, currentOnlineSpeed());
  }

  function pollHostInputs() {
    fetch(apiUrl('/api/relay/inputs?code=' + online.code + '&token=' + online.token))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;
        online.guests = data.guests || [];
        online.playerIds = data.player_ids || online.playerIds || [];
        var guestCountChanged = online.guests.length !== online.lastGuestCount;
        if (guestCountChanged && online.guests.length > 0) {
          online.guestSeen = true;
        }
        if (guestCountChanged && online.guestSeen) {
          startHostRound();
        }
        online.lastGuestCount = online.guests.length;
        for (var i = 0; i < data.inputs.length; i++) {
          var wrapped = data.inputs[i];
          var input = wrapped && wrapped.input;
          if (!input || !input.dir || !wrapped.token) continue;
          var seatIdx = online.guests.indexOf(wrapped.token) + 1;
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
    overlayTitle.textContent = '🌐 正在进入联机大厅…';
    overlayText.textContent = '';
    overlay.classList.remove('hidden');
    var stored = sessionStorage.getItem('snake_relay_token') || '';
    localStorage.removeItem('snake_relay_token');
    playerId = (playerIdInput.value || '').trim().slice(0, 3) || '玩家1';
    playerIdInput.value = playerId;
    function enterLobby(token, retried) {
      return postJSON('/api/relay/auto', { game: 'snake', token: token, player_id: playerId }).then(function (data) {
        if (!data.ok && token && !retried) {
          sessionStorage.removeItem('snake_relay_token');
          return enterLobby('', true);
        }
        return data;
      });
    }
    enterLobby(stored, false).then(function (data) {
      if (!data.ok) {
        overlayTitle.textContent = '进入联机大厅失败';
        overlayText.textContent = data.error || '稍后再试';
        return;
      }
      sessionStorage.setItem('snake_relay_token', data.token);
      online.code = data.code;
      online.token = data.token;
      online.mySeat = data.seat || 0;
      online.playerId = data.player_id || playerId;
      online.playerIds = [];
      if (data.role === 'host') {
        mode = 'host';
        online.guestSeen = false;
        online.lastGuestCount = -1;
        overlayTitle.textContent = '🌐 已进入联机大厅';
        overlayText.textContent = '你是房主，等待其他玩家加入，最多 4 人';
        startHostRound();
        if (online.pollTimer) clearInterval(online.pollTimer);
        online.pollTimer = setInterval(pollHostInputs, 250);
      } else {
        mode = 'guest';
        online.mySeat = data.seat;
        overlayTitle.textContent = '🌐 已进入联机大厅';
        overlayText.textContent = '你控制 ' + data.seat + ' 号蛇（' + seatName(data.seat) + '）· 等待开局…';
        if (online.pollTimer) clearInterval(online.pollTimer);
        online.pollTimer = setInterval(pollGuestState, 250);
      }
    }).catch(function () {
      overlayTitle.textContent = '进入失败';
      overlayText.textContent = '服务器连接失败，请检查游戏服务器后重试';
    });
  }

  function seatName(seat) {
    var names = ['绿蛇（房主）', '蓝蛇', '黄蛇', '粉蛇', '紫蛇', '橙蛇'];
    return names[seat] || (seat + ' 号蛇');
  }

  /* ================= 联机·客人（观看 + 控制蓝蛇） ================= */
  function drawScene(scene) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!scene) return;
    ctx.strokeStyle = '#050505';
    ctx.lineWidth = 1;
    for (var grid = 0; grid <= GRID; grid++) {
      ctx.beginPath();
      ctx.moveTo(grid * CELL, 0); ctx.lineTo(grid * CELL, canvas.height); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, grid * CELL); ctx.lineTo(canvas.width, grid * CELL); ctx.stroke();
    }
    var sceneFoods = scene.foods || (scene.food ? [scene.food] : []);
    sceneFoods.forEach(function (item) {
      ctx.fillStyle = item.type === 'boost' ? '#60a5fa' : item.type === 'big' ? '#fbbf24' : '#f26d6d';
      ctx.beginPath();
      ctx.arc((item.x + 0.5) * CELL, (item.y + 0.5) * CELL,
        CELL * (item.type === 'big' ? 0.42 : item.type === 'boost' ? 0.32 : 0.25), 0, Math.PI * 2);
      ctx.fill();
      if (item.type === 'boost') {
        ctx.fillStyle = '#e0f2fe';
        ctx.font = 'bold ' + Math.max(10, CELL * 0.65) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚡', (item.x + 0.5) * CELL, (item.y + 0.5) * CELL);
      }
    });
    var leader = scene.snakes.reduce(function (bestSn, sn) {
      return sn.alive && (!bestSn || sn.score > bestSn.score) ? sn : bestSn;
    }, null);
    scene.snakes.forEach(function (sn) {
      if (!sn.alive) return;
      var colors = SEAT_COLORS[sn.seat] || SEAT_COLORS[0];
      sn.body.forEach(function (s, i) {
        if (i === 0) return;
        ctx.fillStyle = colors.body;
        ctx.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4);
      });
      var headX = (sn.body[0].x + .5) * CELL;
      var headY = (sn.body[0].y + .5) * CELL;
      ctx.beginPath();
      ctx.arc(headX, headY, CELL * .43, 0, Math.PI * 2);
      ctx.fillStyle = colors.head;
      ctx.fill();
      ctx.strokeStyle = colors.body;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold ' + Math.max(8, CELL * .42) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sn.id || ('玩家' + (sn.seat + 1)), headX, headY);
      if (leader && leader.seat === sn.seat) {
        drawCrown(headX, headY);
      }
    });
  }

  function pollGuestState() {
    fetch(apiUrl('/api/relay/state?code=' + online.code + '&token=' + online.token))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) {
          clearInterval(online.pollTimer);
          sessionStorage.removeItem('snake_relay_token');
          localStorage.removeItem('snake_relay_token');
          mode = 'menu';
          overlay.classList.add('hidden');
          showMenu();
          showMenuStatus('大厅连接已断开，请重新进入');
          return;
        }
        if (data.version === online.version) return;
        online.version = data.version;
        var scene = data.state;
        if (!scene) {
          if (data.version === 0) {
            overlayTitle.textContent = '🌐 已进入联机大厅';
            overlayText.textContent = '等待房主开始游戏…';
            overlay.classList.remove('hidden');
            return;
          }
          clearInterval(online.pollTimer);
          sessionStorage.removeItem('snake_relay_token');
          localStorage.removeItem('snake_relay_token');
          mode = 'menu';
          overlay.classList.add('hidden');
          showMenu();
          showMenuStatus('房主已退出，请重新进入联机大厅');
          return;
        }
        drawScene(scene);
        var mySeat = online.mySeat || 1;
        var mine = scene.snakes[mySeat] || scene.snakes[1];
        scoreEl.textContent = mine.score;
        updateScoreboard(scene.snakes);
        if (rankListEl) {
          rankListEl.classList.remove('hidden');
          rankListEl.textContent = '实时排名：' + scene.snakes
            .map(function (sn, idx) { return SEAT_NAMES[idx] + ' ' + sn.score + ' 分' + (sn.alive ? '' : '（淘汰）'); })
            .join(' · ');
        }
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
    if (!dir || !online.code || !online.token) return;
    postJSON('/api/relay/input', { code: online.code, token: online.token, input: { dir: dir } }).catch(function () {});
  }

  function controlDirection(direction) {
    if (!direction) return;
    if (mode === 'guest') {
      sendGuestInput(direction);
      return;
    }
    if (mode === 'host') {
      var hostSnake = seats[0];
      if (!hostSnake || !hostSnake.alive) return;
      if (direction[0] !== -hostSnake.dir.x || direction[1] !== -hostSnake.dir.y) {
        hostSnake.nextDir = { x: direction[0], y: direction[1] };
      }
      return;
    }
    setDir(direction[0], direction[1]);
  }

  function startGuest(code) {
    mode = 'guest';
    online.code = code;
    postJSON('/api/relay/join', { code: code }).then(function (data) {
      online.token = data.token;
      online.mySeat = data.seat || 1;
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
    pauseBtn.classList.remove('hidden2');
    if (online.pollTimer) clearInterval(online.pollTimer);
    if (rankListEl) rankListEl.classList.add('hidden');
    start();
  });
  document.getElementById('btnOnline').addEventListener('click', function () {
    pauseBtn.classList.add('hidden2');
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
    var key = typeof e.key === 'string' ? e.key.toLowerCase() : e.key;
    var d = KEY_DIRS[e.key] || KEY_DIRS[key];
    if (d) {
      e.preventDefault();
      controlDirection(d);
    }
  });

  document.querySelectorAll('.dpad button[data-dir]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      var d = map[btn.getAttribute('data-dir')];
      controlDirection(d);
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
    controlDirection(d);
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

  exitBtn.addEventListener('click', function () {
    clearTimeout(timer);
    clearTimeout(online.timer);
    if (online.pollTimer) clearInterval(online.pollTimer);
    if ((mode === 'host' || mode === 'guest') && online.code && online.token) {
      postJSON('/api/relay/leave', { code: online.code, token: online.token })
        .catch(function () {})
        .then(function () {
          sessionStorage.removeItem('snake_relay_token');
          localStorage.removeItem('snake_relay_token');
          window.location.href = '../index.html';
        });
      return;
    }
    window.location.href = '../index.html';
  });

  window.addEventListener('beforeunload', function () {
    if ((mode === 'host' || mode === 'guest') && online.code && online.token &&
        navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/relay/leave',
        new Blob([JSON.stringify({ code: online.code, token: online.token })],
          { type: 'application/json' })
      );
    }
  });

  showMenu();
})();
