/* ChallengeArena —— 闯关游戏通用联机壳。
 * 统一小A—小F座位、第一位玩家选总人数、人数满足后自动开始。
 * 玩法本身仍由各个游戏实现；这里只同步座位和独立进度。
 */
window.ChallengeArena = (function () {
  "use strict";

  function makeClientId() {
    if (window.crypto && typeof crypto.randomUUID === "function") {
      try { return crypto.randomUUID(); } catch (_) {}
    }
    if (window.crypto && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function create(config) {
    const cfg = Object.assign({
      gameId: "",
      gameName: "闯关游戏",
      onBegin: () => {},
      onRestart: () => {},
      allowRename: true,
      randomName: null,
      autoJoin: false,
      homeHref: "/games/index.html",
      getProgress: () => ({ status: "playing", score: 0, level: 1 }),
      getTargetConfig: () => ({}),
      onSoloMenu: null,
    }, config);

    if (!cfg.gameId) throw new Error("ChallengeArena: gameId is required");

    /* ?mode=solo —— 单人直通：跳过联机大厅，直接开始游戏（不同步联机进度） */
    if (new URLSearchParams(location.search).get("mode") === "solo") {
      const beginSolo = () => {
        if (typeof cfg.onSoloMenu === "function") {
          /* 游戏需要先出本地菜单（如选年级），由游戏自己决定何时开始 */
          Promise.resolve(cfg.onSoloMenu()).catch(console.error);
          return;
        }
        Promise.resolve(cfg.onBegin({ name: "我", seat: 0, state: null })).catch(console.error);
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", beginSolo);
      } else {
        beginSolo();
      }
      return {
        pushProgress() {},
        restart() {},
        player: () => ({ name: "我", seat: 0 }),
      };
    }

    const storageKey = `arena-${cfg.gameId}-token`;
    const clientKey = `arena-${cfg.gameId}-client`;
    const api = `/api/arena/${encodeURIComponent(cfg.gameId)}`;
    const names = ["小A", "小B", "小C", "小D", "小E", "小F"];
    const state = {
      token: localStorage.getItem(storageKey) || "",
      seat: -1,
      name: "",
      stateData: null,
      syncing: false,
      pushing: false,
      stateData: null,
      lastProgress: "",
      started: false,
      pollTimer: null,
      pushTimer: null,
      leaving: false,
    };

    let root, seatsEl, settingsEl, targetControls, targetButtons, lobbyStatus, queueEl, joinBtn, statusEl, renameBox, renameInput, renameBtn, boardPanel, boardBtn, statusText;

    function inject() {
      root = document.createElement("div");
      root.className = "challenge-arena-root";
      root.innerHTML = `
        <div class="arena-card">
          <a class="arena-home" href="${escapeHtml(cfg.homeHref)}">🏠 回到游戏中心</a>
          <div class="arena-title">🌐 ${escapeHtml(cfg.gameName)} · 联机</div>
          <div class="arena-note">
            不需要房间号，也不支持多个房间。<br>
            第一位玩家选择总人数；人数满足后游戏自动开始。
          </div>

          <div class="arena-section-label">房间座位</div>
          <div class="arena-seat-list"></div>

          <div class="arena-lobby-settings hidden"></div>

          <div class="arena-target-controls hidden">
            <div class="arena-section-label">总人数（第一个人选择）</div>
            <div class="arena-target-buttons"></div>
          </div>

          <div class="arena-lobby-status"></div>
          <div class="arena-queue hidden">当前排队：0 人</div>
          <button class="arena-primary">🚀 自动进入联机房</button>
          <div class="arena-error"></div>

          <div class="arena-rename hidden">
            <input maxlength="16" placeholder="修改我的名字">
            <button>保存</button>
          </div>
        </div>

        <div class="arena-statusbar hidden">
          <span class="arena-status-text">联机同步中…</span>
          <button class="arena-board-btn">👥</button>
        </div>
        <div class="arena-board hidden"></div>
      `;
      document.body.appendChild(root);

      seatsEl = root.querySelector(".arena-seat-list");
      settingsEl = root.querySelector(".arena-lobby-settings");
      targetControls = root.querySelector(".arena-target-controls");
      targetButtons = root.querySelector(".arena-target-buttons");
      lobbyStatus = root.querySelector(".arena-lobby-status");
      queueEl = root.querySelector(".arena-queue");
      joinBtn = root.querySelector(".arena-primary");
      statusEl = root.querySelector(".arena-error");
      renameBox = root.querySelector(".arena-rename");
      renameInput = root.querySelector(".arena-rename input");
      renameBtn = root.querySelector(".arena-rename button");
      boardPanel = root.querySelector(".arena-board");
      boardBtn = root.querySelector(".arena-board-btn");
      statusText = root.querySelector(".arena-status-text");

      joinBtn.addEventListener("click", join);
      targetButtons.addEventListener("click", event => {
        const button = event.target.closest("[data-count]");
        if (button) setTarget(Number(button.dataset.count));
      });
      renameBtn.addEventListener("click", rename);
      renameInput.addEventListener("keydown", event => { if (event.key === "Enter") rename(); });
      boardBtn.addEventListener("click", () => boardPanel.classList.toggle("hidden"));
    }

    function style() {
      if (document.getElementById("challenge-arena-style")) return;
      const style = document.createElement("style");
      style.id = "challenge-arena-style";
      style.textContent = `
.challenge-arena-root{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;background:radial-gradient(circle at 20% 10%, #1c3550, #07101d 58%)}
.challenge-arena-root.hidden{display:none}
.arena-card{width:min(480px,94vw);background:#16213e;border:1px solid rgba(125,211,252,.22);border-radius:16px;padding:24px;box-shadow:0 4px 20px rgba(0,0,0,.35);color:#eee;font-family:"PingFang SC","Microsoft YaHei",sans-serif}
.arena-home{position:absolute;top:14px;left:14px;z-index:1;padding:8px 13px;border:1px solid rgba(125,211,252,.32);border-radius:999px;background:rgba(9,20,34,.88);color:#dbeafe;font-size:12px;font-weight:800;text-decoration:none;backdrop-filter:blur(8px)}
.arena-home:hover{background:rgba(56,189,248,.24);border-color:#7dd3fc;color:#fff}
.arena-title{font-size:20px;font-weight:800;color:#ffd700;margin-bottom:14px}
.arena-note{color:#a9c3d8;font-size:13px;line-height:1.6;margin:0 0 16px}
.arena-section-label{display:block;margin:16px 0 8px;color:#ccc;font-size:14px}
.arena-seat-list{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.arena-lobby-settings{margin:16px 0;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.035)}
.arena-lobby-settings.hidden{display:none}
.arena-setting{margin:10px 0}
.arena-setting label{display:block;margin-bottom:5px;color:#a9c3d8;font-size:13px}
.arena-setting select,.arena-setting input{width:100%;padding:8px 10px;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:#07111d;color:#e8f6ff}
.arena-setting-note{margin-top:6px;color:#8fa9bf;font-size:12px}
.arena-seat{padding:8px 10px;border:1px solid #444;border-radius:10px;background:rgba(15,52,96,.5);color:#a9c3d8;font-size:12px}
.arena-seat.online{border-color:rgba(74,222,128,.45);background:rgba(74,222,128,.10);color:#dcfce7}
.arena-seat.online .arena-seat-mark{background:#4ade80;color:#052e16}
.arena-seat-mark{display:inline-block;width:22px;height:22px;margin-right:7px;border-radius:50%;background:#333;color:#ddd;text-align:center;line-height:22px;font-weight:800}
.arena-target-controls{margin:16px 0}
.arena-target-buttons{display:flex;gap:7px;flex-wrap:wrap}
.arena-target-buttons button{padding:8px 16px;border:2px solid #444;border-radius:10px;background:transparent;color:#ccc;font-weight:800;cursor:pointer;transition:.15s}
.arena-target-buttons button:hover{border-color:#7dd3fc;color:#e2f6ff}
.arena-target-buttons button.active{border-color:#4ade80;background:rgba(74,222,128,.12);color:#4ade80}
.arena-lobby-status{min-height:22px;margin:12px 0;color:#a5f3fc;font-size:14px}
.arena-primary{display:block;width:100%;padding:14px;border:0;border-radius:12px;background:linear-gradient(120deg,#38bdf8,#4ade80);color:#04131f;font-size:16px;font-weight:800;cursor:pointer}
.arena-primary:disabled{opacity:.55;cursor:not-allowed}
.arena-error{min-height:20px;margin-top:10px;color:#fca5a5;font-size:13px}
.arena-rename{display:flex;gap:6px;margin-top:16px}
.arena-rename input{flex:1;padding:9px 11px;border:1px solid #444;border-radius:10px;background:#0f3460;color:#fff}
.arena-rename button{padding:9px 13px;border:0;border-radius:10px;background:#38bdf8;color:#04131f;font-weight:800;cursor:pointer}
.arena-danger{display:block;width:100%;margin-top:10px;padding:10px;border:1px solid rgba(248,113,113,.4);border-radius:10px;background:rgba(248,113,113,.08);color:#fecaca;font-size:13px;font-weight:700;cursor:pointer}
.arena-danger:hover{background:rgba(248,113,113,.16);color:#fff}
.arena-danger:disabled{opacity:.5;cursor:not-allowed}
.arena-statusbar{position:fixed;left:12px;bottom:12px;z-index:9000;display:flex;gap:8px;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid rgba(125,211,252,.2);background:rgba(7,17,29,.82);color:#d9f0ff;font-size:11px;font-weight:700}
.arena-board-btn{width:22px;height:22px;border:0;border-radius:50%;background:#38bdf8;color:#04131f;font-weight:900;cursor:pointer}
.arena-board{position:fixed;left:12px;bottom:48px;z-index:9000;width:min(280px,90vw);padding:10px;border-radius:14px;border:1px solid rgba(125,211,252,.2);background:rgba(7,17,29,.92);color:#e8f6ff;font-size:12px}
.arena-board.hidden{display:none}
.arena-board-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:#c4d9ea}
.arena-debug{margin-top:4px;color:#8fa9bf;font-size:10px;line-height:1.3}
@media(max-width:600px){.arena-seat-list{grid-template-columns:1fr}}
`;
      document.head.appendChild(style);
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[ch]);
    }

    function renderLobby(stateData) {
      const connectedPlayers = stateData.players.filter(player => player.connected);
      seatsEl.innerHTML = stateData.players.map(player => {
        const connectedIndex = connectedPlayers.indexOf(player);
        const playerNumber = player.connected ? connectedIndex + 1 : null;
        const debug = player.connected
          ? `<div class="arena-debug">debug · 第 ${playerNumber} 位玩家${player.isHost ? " · 房主" : ""}</div>`
          : `<div class="arena-debug">debug · 空位</div>`;
        return `
          <div class="arena-seat ${player.connected ? "online" : ""}">
            <span class="arena-seat-mark">${player.seat + 1}</span>
            ${escapeHtml(player.name)} · ${player.connected ? "在线" : "等待加入"}
            ${debug}
          </div>
        `;
      }).join("");

      const isHost = state.seat >= 0 && stateData.hostSeat === state.seat;
      settingsEl.classList.toggle("hidden", !isHost);
      targetControls.classList.toggle("hidden", !isHost);
      targetButtons.innerHTML = [1, 2, 3, 4, 5, 6].map(count => `
        <button class="${stateData.targetPlayers === count ? "active" : ""}" data-count="${count}">
          ${count}人
        </button>
      `).join("");

      joinBtn.disabled = state.seat >= 0;
      joinBtn.textContent = state.seat >= 0 ? "✅ 已进入联机房" : "🚀 自动进入联机房";
      renameBox.classList.toggle("hidden", state.seat < 0 || !cfg.allowRename);

      if (typeof cfg.renderLobbySettings === "function") {
        const settingsKey = `${isHost ? "host" : "guest"}:${stateData.targetPlayers}:${stateData.started}:${stateData.config?.mode || "pk"}`;
        if (settingsEl.dataset.settingsKey !== settingsKey) {
          settingsEl.dataset.settingsKey = settingsKey;
          cfg.renderLobbySettings(settingsEl, stateData, isHost);
        }
      }

      const activeCount = stateData.activeCount;
      const myOrder = connectedPlayers.findIndex(player => player.seat === state.seat) + 1;
      const debugTag = stateData.serverId ? `[debug server=${stateData.serverId} · 我第${myOrder || "-"}位] ` : "";
      if (state.seat < 0) {
        lobbyStatus.textContent = "点击上方按钮加入联机房。";
      } else if (isHost && stateData.targetPlayers === 0) {
        lobbyStatus.textContent = "你是第一位玩家，请完成房间设置。";
      } else if (stateData.targetPlayers === 0) {
        lobbyStatus.textContent = "等待第一位玩家设置总人数…";
      } else {
        lobbyStatus.textContent = `等待玩家加入：${activeCount} / ${stateData.targetPlayers} · Seed ${stateData.seed || 0}`;
      }
    }

    function renderBoard(stateData) {
      const rows = stateData.players.slice().sort((a,b)=>(b.progress?.damage||0)-(a.progress?.damage||0));
      boardPanel.innerHTML = rows.map((player,index) => `
        <div class="arena-board-row">
          <span>${index+1}. ${escapeHtml(player.name)}${player.seat === state.seat ? "（我）" : ""}</span>
          <span>${Number(player.progress?.damage || 0)}伤 / ${Number(player.progress?.score || 0)}分</span>
        </div>
      `).join("");
    }

    function applyState(stateData) {
      // Multiple devices opening 127.0.0.1 would accidentally create separate
      // rooms. The server tells us the canonical shared origin; redirect once.
      if (stateData.canonicalOrigin && location.origin !== stateData.canonicalOrigin) {
        const target = stateData.canonicalOrigin + location.pathname + location.search + location.hash;
        if (localStorage.getItem("arena-redirect-attempt") !== target) {
          localStorage.setItem("arena-redirect-attempt", target);
          location.replace(target);
          return;
        }
      }
      if (location.origin === stateData.canonicalOrigin) {
        localStorage.removeItem("arena-redirect-attempt");
      }

      renderLobby(stateData);
      renderBoard(stateData);
      state.stateData = stateData;

      const me = stateData.players.find(player => player.seat === state.seat);
      const shouldBegin = stateData.started && state.seat >= 0 && !state.begun &&
                          me && me.progress && me.progress.status !== "waiting";
      if (shouldBegin) {
        state.begun = true;
        begin(stateData);
      }
    }

    async function request(path, body) {
      const response = await fetch(api + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || data.error || "同步失败");
        error.code = data.error;
        throw error;
      }
      return data;
    }

    async function join(silent) {
      if (state.syncing) return;
      state.syncing = true;
      joinBtn.disabled = true;
      if (!silent) statusEl.textContent = "正在自动同步房间…";
      try {
        let clientId = localStorage.getItem(clientKey);
        if (!clientId) {
          clientId = makeClientId();
          localStorage.setItem(clientKey, clientId);
        }
        const data = await request("/join", {
          clientId,
          name: typeof cfg.randomName === "function" ? cfg.randomName() : "",
        });
        state.token = data.token;
        state.seat = data.seat;
        state.name = data.name;
        localStorage.setItem(storageKey, data.token);
        sessionStorage.setItem(`arena-${cfg.gameId}-rejoin`, "1");
        statusEl.textContent = "";
        applyState(data.state);
      } catch (error) {
        localStorage.removeItem(storageKey);
        statusEl.textContent = error.message || "进入失败，请稍后重试";
        joinBtn.disabled = false;
      } finally {
        state.syncing = false;
      }
    }

    async function setTarget(count) {
      try {
        const data = await request("/target", {
          token: state.token,
          targetPlayers: count,
          config: cfg.getTargetConfig(),
        });
        applyState(data.state);
      } catch (error) {
        lobbyStatus.textContent = error.message || "设置失败";
      }
    }

    async function rename() {
      const name = renameInput.value.trim();
      if (!name) return;
      try {
        const data = await request("/rename", { token: state.token, name });
        state.name = data.name;
        applyState(data.state);
        lobbyStatus.textContent = `✏️ 名字已改为 ${name}`;
      } catch (error) {
        lobbyStatus.textContent = error.message || "改名失败";
      }
    }

    async function poll() {
      if (!state.token) return;
      try {
        const response = await fetch(`${api}/state?token=${encodeURIComponent(state.token)}&t=${Date.now()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || data.ok === false) {
          localStorage.removeItem(storageKey);
          sessionStorage.removeItem(`arena-${cfg.gameId}-rejoin`);
          state.token = "";
          root.classList.remove("hidden");
          renderLobby({ players: [], targetPlayers: 0, hostSeat: null });
          joinBtn.disabled = false;
          joinBtn.textContent = "🚀 自动进入联机房";
          statusEl.textContent = "连接已失效，请重新进入联机房";
          return;
        }
        state.seat = data.seat;
        state.name = data.name;
        applyState(data.state);
        return data.state;
      } catch (_) {}
    }

    function begin(stateData) {
      state.started = true;
      root.classList.add("hidden");
      root.querySelector(".arena-statusbar").classList.remove("hidden");
      statusText.textContent = `${state.name} · Seed ${stateData.seed || 0}`;
      Promise.resolve(cfg.onBegin({
        name: state.name,
        seat: state.seat,
        state: stateData,
      })).catch(console.error);
    }

    async function pushProgress() {
      if (!state.started || state.pushing) return;
      const progress = cfg.getProgress();
      const serialized = JSON.stringify(progress);
      if (serialized === state.lastProgress) return;
      state.pushing = true;
      try {
        const data = await request("/progress", { token: state.token, progress });
        state.lastProgress = serialized;
        renderBoard(data.state);
      } catch (_) {} finally {
        state.pushing = false;
      }
    }

    async function restart() {
      if (!state.started) return;
      await request("/restart", { token: state.token });
      state.lastProgress = "";
      Promise.resolve(cfg.onRestart()).catch(console.error);
    }

    async function refresh() {
      await poll();
      return state.stateData;
    }

    async function refreshQueue() {
      try {
        const response = await fetch(`${api}/queue?t=${Date.now()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || data.ok === false) return;
        const count = data.activeCount || 0;
        const target = data.targetPlayers || 0;
        queueEl.textContent = target > 0
          ? `当前排队：${count} / ${target} 人`
          : `当前排队：${count} 人`;
        queueEl.classList.remove("hidden");
      } catch (_) {}
    }

    async function queueLoop() {
      await refreshQueue();
      setTimeout(queueLoop, 2000);
    }

    async function loop() {
      await poll();
      await pushProgress();
      setTimeout(loop, 800);
    }

    function init() {
      style();
      inject();
      refreshQueue();
      setInterval(refreshQueue, 2000);
      if (state.token || sessionStorage.getItem(`arena-${cfg.gameId}-rejoin`) === "1" || cfg.autoJoin) join(true);
      setTimeout(loop, 800);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return {
      pushProgress, restart,
      refresh,
      player: () => ({ name: state.name, seat: state.seat }),
      players: () => state.stateData ? state.stateData.players.slice() : [],
    };
  }

  return { create };
})();
