/* 迷宫竞速在线客户端：连续移动 + 状态插值。 */
(function () {
  'use strict';

  const API_BASE = location.port === '8400' ? '' : `${location.protocol}//${location.hostname}:8400`;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const connectCard = document.getElementById('connectCard');
  const gameCard = document.getElementById('gameCard');
  const nameInput = document.getElementById('nameInput');
  const joinBtn = document.getElementById('joinBtn');
 const soloBtn = document.getElementById('soloBtn');
  const connectMsg = document.getElementById('connectMsg');
  const roomCodeEl = document.getElementById('roomCode');
  const playerPills = document.getElementById('playerPills');
  const statusEl = document.getElementById('status');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const overlayBtn = document.getElementById('overlayBtn');

  let room = localStorage.getItem('maze_race_room') || '';
  let token = localStorage.getItem('maze_race_token_' + room) || '';
  let latest = null;
  let currentPlayers = [];
  let previousPlayers = [];
  let stateAt = performance.now();
  let connected = false;
  let lastOverlay = '';
  const input = [false, false, false, false];
  const keyMap = {
    KeyW: 0, ArrowUp: 0,
    KeyD: 1, ArrowRight: 1,
    KeyS: 2, ArrowDown: 2,
    KeyA: 3, ArrowLeft: 3
  };

  async function api(path, body) {
    const options = body === undefined ? { method: 'GET' } : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
    const res = await fetch(API_BASE + path, options);
    return res.json();
  }

  function setConnected(ok) {
    connected = ok;
    statusEl.textContent = ok ? statusEl.textContent : '连接断开，正在重试…';
  }

  function showConnect(msg) {
    gameCard.classList.add('hidden');
    connectCard.classList.remove('hidden');
    connectMsg.textContent = msg || '';
  }

  function showGame() {
    connectCard.classList.add('hidden');
    gameCard.classList.remove('hidden');
    roomCodeEl.textContent = room;
  }

  async function startSolo() {
    const name = nameInput.value.trim() || '单人选手';
    try {
      const result = await api('/api/solo', { name });
      if (!result.ok) throw new Error(result.error);
      room = result.code; token = result.player;
      localStorage.setItem('maze_race_room', room);
      localStorage.setItem('maze_race_token_' + room, token);
      showGame(); poll();
    } catch (error) {
      connectMsg.textContent = error.message || '单人模式启动失败';
    }
  }

  async function autoJoin() {
    const name = nameInput.value.trim() || ('小选手' + Math.floor(Math.random() * 90 + 10));
    try {
      const result = await api('/api/auto', { name });
      if (!result.ok) throw new Error(result.error);
      room = result.code; token = result.player;
      localStorage.setItem('maze_race_room', room);
      localStorage.setItem('maze_race_token_' + room, token);
      showGame();
      poll();
    } catch (error) {
      connectMsg.textContent = error.message || '进入失败，请稍后再试';
    }
  }

  function applyState(state) {
    const old = latest;
    latest = state;
    if (old && old.level === state.level) {
      previousPlayers = currentPlayers;
      currentPlayers = state.players;
    } else {
      previousPlayers = state.players;
      currentPlayers = state.players;
    }
    stateAt = performance.now();

    const waiting = state.phase === 'lobby' || (state.mode !== 'solo' && state.players.length < 2);
    if (waiting) {
      overlayTitle.textContent = state.mode === 'solo' ? '单人挑战已就绪' : '等待玩家加入（2–6 人）';
      overlayDesc.textContent = state.mode === 'solo' ? '按方向键连续移动，先到 🏁 就完成。' : '把房间码发给小伙伴，人齐后点「开始比赛」。';
      overlayBtn.textContent = '▶ 开始比赛';
      overlayBtn.classList.remove('hidden');
      overlay.classList.remove('hidden');
    } else if (state.phase === 'countdown') {
      overlayTitle.textContent = Math.ceil(state.countdown) || '出发！';
      overlayDesc.textContent = '连续按住方向键移动，吃到 👟 会加速。';
      overlayBtn.classList.add('hidden');
      overlay.classList.remove('hidden');
    } else if (state.phase === 'racing') {
      overlay.classList.add('hidden');
    } else if (state.phase === 'level_done') {
      const sorted = [...state.players].sort((a, b) => b.score - a.score);
      overlayTitle.textContent = `第 ${state.level + 1} 关完成！`;
      overlayDesc.textContent = sorted.map(p => `${p.emoji} ${p.name}：${p.score}分${p.finished ? '（用时' + p.finish_time.toFixed(2) + 's）' : ''}`).join('　');
      overlayBtn.textContent = state.level + 1 < state.total_levels ? '进入下一关' : '查看总冠军';
      overlayBtn.classList.remove('hidden');
      overlay.classList.remove('hidden');
    } else if (state.phase === 'finished') {
      const sorted = [...state.players].sort((a, b) => b.score - a.score);
      const champion = sorted[0];
      overlayTitle.textContent = `🏆 ${champion.name} 获得总冠军！`;
      overlayDesc.textContent = `${champion.name} 获得“迷宫飞毛腿”称号　|　比分 ${sorted.map(p => p.score).join(' : ')}`;
      overlayBtn.textContent = '再来一局';
      overlay.classList.remove('hidden');
    }

    if (overlayBtn.dataset.lastPhase !== state.phase) {
      overlayBtn.dataset.lastPhase = state.phase;
      overlayBtn.onclick = async function () {
        if (state.phase === 'lobby') await api('/api/start', { code: room, player: token });
        if (state.phase === 'level_done') await api('/api/next', { code: room, player: token });
        if (state.phase === 'finished') await api('/api/restart', { code: room, player: token });
      };
    }

    playerPills.innerHTML = state.players.map(p =>
      `<span class="pill">${p.emoji} ${p.name} · ${p.score}分${p.speed_stacks ? ' · 👟x' + p.speed_stacks : ''}</span>`
    ).join('');
    const me = state.me;
    if (me) {
      const extras = [];
      if (me.speed_until) extras.push(`👟加速 ${me.speed_until.toFixed(1)}s`);
      if (me.ghost_until) extras.push(`👻穿墙 ${me.ghost_until.toFixed(1)}s`);
      if (me.slowed_until) extras.push(`🐌减速 ${me.slowed_until.toFixed(1)}s`);
      statusEl.textContent = `${me.emoji} ${me.name} · ${me.score}分` + (extras.length ? ' · ' + extras.join(' · ') : '');
    }
  }

  async function poll() {
    if (!room || !token) return;
    const requestRoom = room;
    const requestToken = token;
    try {
      const res = await fetch(`${API_BASE}/api/state?code=${encodeURIComponent(requestRoom)}&player=${encodeURIComponent(requestToken)}`);
      if (res.status === 404) {
        if (requestRoom === room) {
          localStorage.removeItem('maze_race_room');
          localStorage.removeItem('maze_race_token_' + room);
          room = ''; token = ''; latest = null; connected = false;
          showConnect('旧房间已失效，请点「🧍 单人挑战」重新开始。');
        }
        return;
      }
      const state = await res.json();
      if (!state.ok) throw new Error(state.error);
      if (requestRoom !== room) return;
      connected = true;
      applyState(state);
    } catch (_) {
      if (requestRoom === room) {
        connected = false;
        statusEl.textContent = '连接断开，正在重试…';
      }
    }
  }

  async function sendInput() {
    if (!room || !token) return;
    try { await api(`${API_BASE}/api/input`, { code: room, player: token, input }); } catch (_) {}
  }

  function fitCanvas() {
    if (!latest) return;
    const width = Math.min(innerWidth - 30, 920);
    const ratio = canvas.height / canvas.width;
    canvas.style.width = width + 'px';
    canvas.style.height = Math.round(width * ratio) + 'px';
  }
  addEventListener('resize', fitCanvas);

  function drawMaze(maze) {
    const cell = 40;
    const ox = (canvas.width - maze.cols * cell) / 2;
    const oy = (canvas.height - maze.rows * cell) / 2;
    ctx.strokeStyle = '#5b6b8f';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    maze.cells.forEach(cellData => {
      const x = ox + cellData.x * cell;
      const y = oy + cellData.y * cell;
      ctx.beginPath();
      if (cellData.walls[0]) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
      if (cellData.walls[1]) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      if (cellData.walls[2]) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
      if (cellData.walls[3]) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
      ctx.stroke();
    });
    const gx = ox + (maze.cols - 1) * cell;
    const gy = oy + (maze.rows - 1) * cell;
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(gx + 8, gy + 8, cell - 16, cell - 16);
    ctx.fillStyle = '#052e16';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏁', gx + cell / 2, gy + cell / 2 + 6);
    return { ox, oy, cell };
  }

  function render(now) {
    if (latest && latest.maze) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const view = drawMaze(latest.maze);
      latest.items.forEach(item => {
        ctx.font = '18px sans-serif';
        const icon = { speed: '👟', ghost: '👻', slow: '🐌', coin: '🪙' }[item.kind];
        ctx.fillText(icon, view.ox + item.x * view.cell + view.cell / 2, view.oy + item.y * view.cell + view.cell / 2 + 6);
      });

      const alpha = Math.min(1, (now - stateAt) / 75);
      currentPlayers.forEach(target => {
        const prev = previousPlayers.find(p => p.slot === target.slot) || target;
        const px = prev.px + (target.px - prev.px) * alpha;
        const py = prev.py + (target.py - prev.py) * alpha;
        ctx.beginPath();
        ctx.arc(view.ox + px, view.oy + py, 11, 0, Math.PI * 2);
        ctx.fillStyle = target.color;
        if (target.ghost_until) { ctx.globalAlpha = .6; ctx.fill(); ctx.globalAlpha = 1; }
        else ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#e6f2ff'; ctx.font = '700 12px sans-serif';
        ctx.fillText(target.name, view.ox + px, view.oy + py - 20);
      });
    }
    requestAnimationFrame(render);
  }

  joinBtn.addEventListener('click', autoJoin);
 soloBtn.addEventListener('click', startSolo);
  addEventListener('keydown', event => {
    if (keyMap[event.code] === undefined) return;
    event.preventDefault();
    input[keyMap[event.code]] = true;
  });
  addEventListener('keyup', event => {
    if (keyMap[event.code] === undefined) return;
    input[keyMap[event.code]] = false;
  });
  addEventListener('blur', () => { input.fill(false); });

  if (room) {
    token ? showGame() : showConnect('');
    poll();
  }
  setInterval(poll, 50);
  setInterval(sendInput, 50);
  requestAnimationFrame(render);
})();
