"use strict";
/* ===== SVG Level Data ===== */
const LEVELS=[
{name:"海底世界",svg:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#1a6bb8"/><rect y="0" width="800" height="120" fill="#2989d8" opacity=".3"/><ellipse cx="400" cy="650" rx="500" ry="100" fill="#c8a850" opacity=".4"/>
<!-- seaweed --><path d="M80 600 Q60 500 90 420 Q120 500 100 600Z" fill="#2d8659"/><path d="M110 600 Q95 530 125 460 Q150 540 135 600Z" fill="#3a9e6b"/>
<!-- orange fish (orig) --><g><ellipse cx="200" cy="200" rx="50" ry="30" fill="#ff8c00"/><polygon points="250,200 290,175 290,225" fill="#ff6600"/><circle cx="180" cy="190" r="8" fill="#fff"/><circle cx="180" cy="190" r="4" fill="#000"/><path d="M190 215 Q200 225 210 215" stroke="#000" fill="none" stroke-width="2"/></g>
<!-- yellow fish --><g><ellipse cx="600" cy="300" rx="45" ry="26" fill="#ffd700"/><polygon points="645,300 680,278 680,322" fill="#daa520"/><circle cx="585" cy="292" r="7" fill="#fff"/><circle cx="585" cy="292" r="3.5" fill="#000"/></g>
<!-- blue fish --><g><ellipse cx="350" cy="150" rx="40" ry="22" fill="#4169e1"/><polygon points="390,150 420,132 420,168" fill="#1e90ff"/><circle cx="338" cy="144" r="6" fill="#fff"/><circle cx="338" cy="144" r="3" fill="#000"/></g>
<!-- red shell --><g><path d="M520 480 Q540 440 560 480 Q540 500 520 480Z" fill="#ff4444"/><path d="M530 478 Q540 458 550 478" stroke="#cc0000" fill="none" stroke-width="2"/></g>
<!-- yellow star --><g><polygon points="500,400 512,425 540,428 520,447 525,475 500,460 475,475 480,447 460,428 488,425" fill="#ffd700"/></g>
<!-- bubbles --><circle cx="100" cy="100" r="15" fill="#fff" opacity=".2"/><circle cx="300" cy="80" r="10" fill="#fff" opacity=".15"/><circle cx="700" cy="180" r="12" fill="#fff" opacity=".18"/></svg>`,
svgB:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#1a6bb8"/><rect y="0" width="800" height="120" fill="#2989d8" opacity=".3"/><ellipse cx="400" cy="650" rx="500" ry="100" fill="#c8a850" opacity=".4"/>
<path d="M80 600 Q60 500 90 420 Q120 500 100 600Z" fill="#2d8659"/><path d="M110 600 Q95 530 125 460 Q150 540 135 600Z" fill="#3a9e6b"/>
<!-- D1: orange->purple --><g><ellipse cx="200" cy="200" rx="50" ry="30" fill="#8a2be2"/><polygon points="250,200 290,175 290,225" fill="#7b1fa2"/><circle cx="180" cy="190" r="8" fill="#fff"/><circle cx="180" cy="190" r="4" fill="#000"/><path d="M190 215 Q200 225 210 215" stroke="#000" fill="none" stroke-width="2"/></g>
<g><ellipse cx="600" cy="300" rx="45" ry="26" fill="#ffd700"/><polygon points="645,300 680,278 680,322" fill="#daa520"/><circle cx="585" cy="292" r="7" fill="#fff"/><circle cx="585" cy="292" r="3.5" fill="#000"/></g>
<!-- D3: blue fish moved right 50px --><g><ellipse cx="400" cy="150" rx="40" ry="22" fill="#4169e1"/><polygon points="440,150 470,132 470,168" fill="#1e90ff"/><circle cx="388" cy="144" r="6" fill="#fff"/><circle cx="388" cy="144" r="3" fill="#000"/></g>
<g><path d="M520 480 Q540 440 560 480 Q540 500 520 480Z" fill="#ff4444"/><path d="M530 478 Q540 458 550 478" stroke="#cc0000" fill="none" stroke-width="2"/></g>
<!-- D2: yellow->pink star --><g><polygon points="500,400 512,425 540,428 520,447 525,475 500,460 475,475 480,447 460,428 488,425" fill="#ff69b4"/></g>
<circle cx="100" cy="100" r="15" fill="#fff" opacity=".2"/><circle cx="300" cy="80" r="10" fill="#fff" opacity=".15"/><circle cx="700" cy="180" r="12" fill="#fff" opacity=".18"/></svg>`,
diffs:[{x:200,y:200,r:50,label:"橙鱼变紫"},{x:500,y:440,r:45,label:"星星变色"},{x:375,y:150,r:50,label:"蓝鱼移动"}]},

{name:"太空冒险",svg:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#0d1117"/>
<!-- stars --><circle cx="100" cy="80" r="3" fill="#fff"/><circle cx="300" cy="50" r="2" fill="#fff"/><circle cx="700" cy="200" r="3" fill="#fff"/><circle cx="150" cy="350" r="2" fill="#fff"/><circle cx="650" cy="450" r="2" fill="#fff"/><circle cx="450" cy="100" r="2" fill="#fff"/>
<!-- green planet D1 --><g><circle cx="150" cy="150" r="60" fill="#4caf50"/><circle cx="130" cy="135" r="15" fill="#66bb6a" opacity=".6"/><circle cx="170" cy="165" r="10" fill="#388e3c" opacity=".5"/></g>
<!-- yellow planet --><circle cx="600" cy="420" r="35" fill="#ffc107"/>
<!-- moon D2 --><g><circle cx="620" cy="100" r="40" fill="#e0e0e0"/><circle cx="605" cy="90" r="8" fill="#bdbdbd"/><circle cx="635" cy="115" r="6" fill="#bdbdbd"/></g>
<!-- rocket D3 --><g><polygon points="380,200 420,200 400,150" fill="#f44336"/><rect x="385" y="200" width="30" height="80" fill="#fafafa"/><circle cx="400" cy="225" r="12" fill="#2196f3"/><polygon points="385,280 365,310 385,310" fill="#f44336"/><polygon points="415,280 435,310 415,310" fill="#f44336"/><polygon points="395,280 405,280 400,310" fill="#ff9800"/></g>
<!-- shooting star --><line x1="700" y1="50" x2="750" y2="20" stroke="#fff" stroke-width="2" opacity=".5"/></svg>`,
svgB:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#0d1117"/>
<circle cx="100" cy="80" r="3" fill="#fff"/><circle cx="300" cy="50" r="2" fill="#fff"/><circle cx="700" cy="200" r="3" fill="#fff"/><circle cx="150" cy="350" r="2" fill="#fff"/><circle cx="650" cy="450" r="2" fill="#fff"/><circle cx="450" cy="100" r="2" fill="#fff"/>
<!-- D1 green->brown --><g><circle cx="150" cy="150" r="60" fill="#795548"/><circle cx="130" cy="135" r="15" fill="#8d6e63" opacity=".6"/><circle cx="170" cy="165" r="10" fill="#5d4037" opacity=".5"/></g>
<circle cx="600" cy="420" r="35" fill="#ffc107"/>
<!-- D2 moon->orange --><g><circle cx="620" cy="100" r="40" fill="#ff9800"/><circle cx="605" cy="90" r="8" fill="#f57c00"/><circle cx="635" cy="115" r="6" fill="#f57c00"/></g>
<!-- D3 window round->square --><g><polygon points="380,200 420,200 400,150" fill="#f44336"/><rect x="385" y="200" width="30" height="80" fill="#fafafa"/><rect x="390" y="215" width="20" height="20" fill="#2196f3"/><polygon points="385,280 365,310 385,310" fill="#f44336"/><polygon points="415,280 435,310 415,310" fill="#f44336"/><polygon points="395,280 405,280 400,310" fill="#ff9800"/></g>
<line x1="700" y1="50" x2="750" y2="20" stroke="#fff" stroke-width="2" opacity=".5"/></svg>`,
diffs:[{x:150,y:150,r:60,label:"行星变色"},{x:620,y:100,r:42,label:"月亮变色"},{x:400,y:225,r:30,label:"火箭窗户"}]},

{name:"农场乐园",svg:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#8bc34a"/><rect y="0" width="800" height="350" fill="#87ceeb" opacity=".5"/>
<!-- sun D1 --><circle cx="680" cy="80" r="45" fill="#ffd700"/><g stroke="#ffd700" stroke-width="4"><line x1="680" y1="20" x2="680" y2="35"/><line x1="680" y1="125" x2="680" y2="140"/><line x1="620" y1="80" x2="635" y2="80"/><line x1="725" y1="80" x2="740" y2="80"/><line x1="637" y1="37" x2="648" y2="48"/><line x1="712" y1="112" x2="723" y2="123"/><line x1="637" y1="123" x2="648" y2="112"/><line x1="712" y1="48" x2="723" y2="37"/></g>
<!-- barn --><g><rect x="80" y="250" width="140" height="100" fill="#d32f2f"/><polygon points="80,250 220,250 150,190" fill="#b71c1c"/><rect x="130" y="300" width="40" height="50" fill="#5d4037"/><rect x="90" y="260" width="20" height="20" fill="#fff"/><rect x="190" y="260" width="20" height="20" fill="#fff"/></g>
<!-- sheep D2 --><g><ellipse cx="280" cy="420" rx="45" ry="30" fill="#fafafa"/><circle cx="330" cy="410" r="15" fill="#333"/><circle cx="335" cy="405" r="3" fill="#fff"/><rect x="260" y="445" width="8" height="20" fill="#333"/><rect x="300" y="445" width="8" height="20" fill="#333"/></g>
<!-- apple tree D3 --><g><rect x="480" y="300" width="25" height="80" fill="#795548"/><circle cx="492" cy="260" r="60" fill="#388e3c"/><circle cx="465" cy="240" r="8" fill="#f44336"/><circle cx="515" cy="245" r="8" fill="#f44336"/><circle cx="492" cy="275" r="8" fill="#f44336"/><circle cx="470" cy="280" r="8" fill="#f44336"/><circle cx="518" cy="285" r="8" fill="#f44336"/></g>
<!-- fence --><g stroke="#8d6e63" stroke-width="6"><line x1="0" y1="500" x2="800" y2="500"/><line x1="0" y1="530" x2="800" y2="530"/><line x1="60" y1="480" x2="60" y2="550"/><line x1="160" y1="480" x2="160" y2="550"/><line x1="260" y1="480" x2="260" y2="550"/><line x1="360" y1="480" x2="360" y2="550"/><line x1="460" y1="480" x2="460" y2="550"/><line x1="560" y1="480" x2="560" y2="550"/><line x1="660" y1="480" x2="660" y2="550"/><line x1="760" y1="480" x2="760" y2="550"/></g></svg>`,
svgB:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#8bc34a"/><rect y="0" width="800" height="350" fill="#87ceeb" opacity=".5"/>
<!-- D1 sun yellow->orange --><circle cx="680" cy="80" r="45" fill="#ff9800"/><g stroke="#ff9800" stroke-width="4"><line x1="680" y1="20" x2="680" y2="35"/><line x1="680" y1="125" x2="680" y2="140"/><line x1="620" y1="80" x2="635" y2="80"/><line x1="725" y1="80" x2="740" y2="80"/><line x1="637" y1="37" x2="648" y2="48"/><line x1="712" y1="112" x2="723" y2="123"/><line x1="637" y1="123" x2="648" y2="112"/><line x1="712" y1="48" x2="723" y2="37"/></g>
<g><rect x="80" y="250" width="140" height="100" fill="#d32f2f"/><polygon points="80,250 220,250 150,190" fill="#b71c1c"/><rect x="130" y="300" width="40" height="50" fill="#5d4037"/><rect x="90" y="260" width="20" height="20" fill="#fff"/><rect x="190" y="260" width="20" height="20" fill="#fff"/></g>
<!-- D2 sheep white->pink --><g><ellipse cx="280" cy="420" rx="45" ry="30" fill="#f8bbd0"/><circle cx="330" cy="410" r="15" fill="#333"/><circle cx="335" cy="405" r="3" fill="#fff"/><rect x="260" y="445" width="8" height="20" fill="#333"/><rect x="300" y="445" width="8" height="20" fill="#333"/></g>
<!-- D3 apples red->yellow --><g><rect x="480" y="300" width="25" height="80" fill="#795548"/><circle cx="492" cy="260" r="60" fill="#388e3c"/><circle cx="465" cy="240" r="8" fill="#ffd700"/><circle cx="515" cy="245" r="8" fill="#ffd700"/><circle cx="492" cy="275" r="8" fill="#ffd700"/><circle cx="470" cy="280" r="8" fill="#ffd700"/><circle cx="518" cy="285" r="8" fill="#ffd700"/></g>
<g stroke="#8d6e63" stroke-width="6"><line x1="0" y1="500" x2="800" y2="500"/><line x1="0" y1="530" x2="800" y2="530"/><line x1="60" y1="480" x2="60" y2="550"/><line x1="160" y1="480" x2="160" y2="550"/><line x1="260" y1="480" x2="260" y2="550"/><line x1="360" y1="480" x2="360" y2="550"/><line x1="460" y1="480" x2="460" y2="550"/><line x1="560" y1="480" x2="560" y2="550"/><line x1="660" y1="480" x2="660" y2="550"/><line x1="760" y1="480" x2="760" y2="550"/></g></svg>`,
diffs:[{x:680,y:80,r:55,label:"太阳变色"},{x:280,y:420,r:50,label:"绵羊变色"},{x:492,y:260,r:55,label:"苹果变色"}]},

{name:"恐龙世界",svg:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#33691e"/><rect y="0" width="800" height="200" fill="#c8e6c9" opacity=".3"/>
<!-- cloud D1 --><g><ellipse cx="200" cy="80" rx="50" ry="25" fill="#fff"/><ellipse cx="240" cy="70" rx="40" ry="20" fill="#fff"/><ellipse cx="170" cy="75" rx="35" ry="18" fill="#fff"/></g>
<!-- volcano --><g><polygon points="550,300 680,300 615,180" fill="#8d6e63"/><polygon points="575,220 655,220 615,180" fill="#d84315"/><ellipse cx="615" cy="180" rx="40" ry="10" fill="#ff5722"/></g>
<!-- river --><path d="M0 450 Q200 420 400 460 Q600 500 800 470 L800 500 Q600 530 400 490 Q200 450 0 480Z" fill="#42a5f5"/>
<!-- dino D3 --><g><ellipse cx="350" cy="300" rx="70" ry="40" fill="#4caf50"/><circle cx="290" cy="260" r="28" fill="#4caf50"/><rect x="275" y="250" width="10" height="10" fill="#000"/><rect x="295" y="250" width="10" height="10" fill="#000"/><path d="M265 275 Q255 285 260 295" stroke="#000" fill="none" stroke-width="2"/><rect x="310" y="330" width="12" height="40" fill="#388e3c"/><rect x="360" y="330" width="12" height="40" fill="#388e3c"/><path d="M420 300 Q480 280 500 310 Q480 320 420 310" fill="#4caf50"/></g>
<!-- tree stump D2 --><g><rect x="540" y="400" width="30" height="50" fill="#795548"/><ellipse cx="555" cy="400" rx="15" ry="5" fill="#a1887f"/></g>
<!-- bushes --><ellipse cx="80" cy="560" rx="40" ry="20" fill="#2e7d32"/><ellipse cx="720" cy="560" rx="40" ry="20" fill="#2e7d32"/></svg>`,
svgB:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#33691e"/><rect y="0" width="800" height="200" fill="#c8e6c9" opacity=".3"/>
<!-- D1 cloud white->gray --><g><ellipse cx="200" cy="80" rx="50" ry="25" fill="#9e9e9e"/><ellipse cx="240" cy="70" rx="40" ry="20" fill="#9e9e9e"/><ellipse cx="170" cy="75" rx="35" ry="18" fill="#9e9e9e"/></g>
<g><polygon points="550,300 680,300 615,180" fill="#8d6e63"/><polygon points="575,220 655,220 615,180" fill="#d84315"/><ellipse cx="615" cy="180" rx="40" ry="10" fill="#ff5722"/></g>
<path d="M0 450 Q200 420 400 460 Q600 500 800 470 L800 500 Q600 530 400 490 Q200 450 0 480Z" fill="#42a5f5"/>
<!-- D3 dino eyes black->red --><g><ellipse cx="350" cy="300" rx="70" ry="40" fill="#4caf50"/><circle cx="290" cy="260" r="28" fill="#4caf50"/><rect x="275" y="250" width="10" height="10" fill="#f00"/><rect x="295" y="250" width="10" height="10" fill="#f00"/><path d="M265 275 Q255 285 260 295" stroke="#000" fill="none" stroke-width="2"/><rect x="310" y="330" width="12" height="40" fill="#388e3c"/><rect x="360" y="330" width="12" height="40" fill="#388e3c"/><path d="M420 300 Q480 280 500 310 Q480 320 420 310" fill="#4caf50"/></g>
<!-- D2 stump brown->purple --><g><rect x="540" y="400" width="30" height="50" fill="#7b1fa2"/><ellipse cx="555" cy="400" rx="15" ry="5" fill="#9c27b0"/></g>
<ellipse cx="80" cy="560" rx="40" ry="20" fill="#2e7d32"/><ellipse cx="720" cy="560" rx="40" ry="20" fill="#2e7d32"/></svg>`,
diffs:[{x:200,y:78,r:55,label:"云朵变色"},{x:555,y:420,r:35,label:"树桩变色"},{x:290,y:258,r:35,label:"恐龙眼睛"}]}
];

/* ===== Audio ===== */
const AC=window.AudioContext||window.webkitAudioContext;
let ac=null;
function ensureAudio(){if(!ac)ac=new AC();}
function playTone(f,d,type,vol){try{ensureAudio();const o=ac.createOscillator(),g=ac.createGain();o.type=type||"sine";o.frequency.value=f;g.gain.setValueAtTime(vol||.3,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+d);}catch(e){}}
function sHit(){playTone(880,.15,"sine",.3);setTimeout(()=>playTone(1100,.2,"sine",.3),80);}
function sWrong(){playTone(220,.25,"square",.15);}
function sWin(){[523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,.25,"triangle",.3),i*150));}
function sTick(){playTone(1200,.05,"square",.08);}

/* ===== Online state ===== */
const API = "/api/spot-difference";
const state = {
  token: localStorage.getItem("spot-online-token") || "",
  seat: -1,
  name: "",
  state: null,
  levelLoaded: -1,
  foundKey: "",
  deadlineAt: 0,
  timerId: null,
  pollTimer: null,
  syncing: false,
  submitting: false,
  joined: false,
};

const el = {};
const seatColors = ["#38bdf8", "#f472b6", "#4ade80", "#fbbf24", "#c084fc", "#fb923c"];

document.addEventListener("DOMContentLoaded", () => {
  ["seat-list", "join-btn", "join-status", "online-players", "rename-input", "rename-btn",
   "target-controls", "target-buttons", "lobby-status",
   "cur-level", "total-levels", "timer", "found-count", "player-turn-banner",
   "frame-left", "frame-right", "feedback-bar", "result-subtitle", "leaderboard",
   "btn-replay", "btn-home"].forEach(id => el[id] = document.getElementById(id));

  el["join-btn"].addEventListener("click", joinRoom);
  el["rename-btn"].addEventListener("click", renameSelf);
  el["rename-input"].addEventListener("keydown", event => {
    if (event.key === "Enter") renameSelf();
  });
  el["btn-replay"].addEventListener("click", restartGame);
  el["btn-home"].addEventListener("click", () => location.href = "../index.html");
  renderSeats([]);
  if (soloMode()) {
    /* 单人直通：纯本地单机，不进联机房 */
    startSoloGame();
  } else if (state.token) joinRoom(true);
  else showScreen("start");
});

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
}

function renderLobby(stateData) {
  stopTimer();
  showScreen("start");
  const me = stateData.players.find(player => player.seat === state.seat);
  const isHost = Boolean(me?.isHost);
  const activeCount = stateData.activeCount;

  el["join-btn"].disabled = Boolean(state.seat >= 0);
  el["join-btn"].textContent = state.seat >= 0 ? "✅ 已进入联机房" : "🚀 自动进入联机房";
  el["target-controls"].classList.toggle("hidden", !(state.seat >= 0 && stateData.hostSeat === state.seat));
  el["target-buttons"].innerHTML = [1, 2, 3, 4, 5, 6].map(count => `
    <button class="target-btn ${stateData.targetPlayers === count ? "active" : ""}" data-count="${count}">
      ${count}人
    </button>
  `).join("");

  if (state.seat < 0) {
    el["lobby-status"].textContent = "点击上方按钮加入联机房。";
  } else if (isHost && stateData.targetPlayers === 0) {
    el["lobby-status"].textContent = "你是第一位玩家，请选择总人数。";
  } else if (stateData.targetPlayers === 0) {
    el["lobby-status"].textContent = "等待第一位玩家选择总人数…";
  } else {
    el["lobby-status"].textContent = `等待玩家加入：${activeCount} / ${stateData.targetPlayers}`;
  }

  el["target-buttons"].querySelectorAll("button").forEach(button => {
    button.addEventListener("click", async () => {
      const count = Number(button.dataset.count);
      try {
        const data = await api("/set-target", { token: state.token, targetPlayers: count });
        applyState(data.state);
      } catch (error) {
        el["lobby-status"].textContent = error.message || "设置失败";
      }
    });
  });
}

function renderSeats(players = []) {
  el["seat-list"].innerHTML = Array.from({ length: 6 }, (_, seat) => {
    const player = players.find(item => item.seat === seat);
    const online = Boolean(player?.connected);
    const name = player?.name || ["小A", "小B", "小C", "小D", "小E", "小F"][seat];
    const label = online ? `${name} · 在线` : `${name} · 等待加入`;
    return `<div class="seat ${online ? "online" : ""}"><span>${seat + 1}</span>${label}</div>`;
  }).join("");
}

async function api(path, body) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || "请求失败");
    error.code = data.error;
    error.data = data;
    throw error;
  }
  return data;
}

function createClientId() {
  if (window.crypto && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }

  if (window.crypto && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function joinRoom(silent = false) {
  if (state.syncing) return;
  state.syncing = true;
  el["join-btn"].disabled = true;
  if (!silent) el["join-status"].textContent = "正在自动同步联机房…";
  try {
    let clientId = localStorage.getItem("spot-online-client");
    if (!clientId) {
      clientId = createClientId();
      localStorage.setItem("spot-online-client", clientId);
    }
    const data = await api("/join", { clientId });
    state.token = data.token;
    state.seat = data.seat;
    state.name = data.name;
    localStorage.setItem("spot-online-token", data.token);
    el["join-status"].textContent = "";
    applyState(data.state);
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(pollState, 700);
  } catch (error) {
    localStorage.removeItem("spot-online-token");
    el["join-status"].textContent = error.message || "进入失败，请稍后重试";
    renderSeats([]);
  } finally {
    state.syncing = false;
    el["join-btn"].disabled = false;
  }
}

async function pollState() {
  if (!state.token) return;
  try {
    const response = await fetch(`${API}/state?token=${encodeURIComponent(state.token)}&t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      localStorage.removeItem("spot-online-token");
      state.token = "";
      clearInterval(state.pollTimer);
      showScreen("start");
      el["join-status"].textContent = "连接已失效，请重新进入联机房";
      return;
    }
    state.seat = data.seat;
    state.name = data.name;
    applyState(data.state);
  } catch (_) {
    /* temporary network errors are handled by the next poll */
  }
}

function applyState(stateData) {
  if (solo.active) return; /* 单机模式不处理联机状态 */
  state.state = stateData;
  renderSeats(stateData.players);
  renderPlayers(stateData);

  if (stateData.status === "finished" || stateData.status === "finishedIdle") {
    stopTimer();
    if (window.SoloTitles) SoloTitles.grant("spot");
    showResult(stateData);
    return;
  }

  if (stateData.status === "lobby") {
    renderLobby(stateData);
    return;
  }

  showScreen("game");
  const levelChanged = state.levelLoaded !== stateData.level || state.foundKey === "";
  if (levelChanged) loadLevel(stateData);
  else if (state.foundKey !== stateData.found.join(",")) renderFound(stateData.found);

  state.deadlineAt = Date.now() + stateData.remaining * 1000;
  updateTimer();
  if (!state.timerId) state.timerId = setInterval(updateTimer, 250);
  renderFeedback(stateData);
}

function loadLevel(stateData) {
  const level = LEVELS[stateData.level];
  state.levelLoaded = stateData.level;
  state.foundKey = stateData.found.join(",");
  el["cur-level"].textContent = stateData.level + 1;
  el["total-levels"].textContent = stateData.levelCount;
  el["found-count"].textContent = stateData.found.length;
  el["frame-left"].innerHTML = level.svg();
  el["frame-right"].innerHTML = level.svgB();
  el["frame-left"].onclick = event => handleClick(event, el["frame-left"]);
  el["frame-right"].onclick = event => handleClick(event, el["frame-right"]);
  renderFound(stateData.found);
  if (stateData.status === "playing") {
    el["feedback-bar"].textContent = "找找看，两幅图有什么不同？";
    el["feedback-bar"].className = "feedback-bar";
  }
}

function renderFound(found) {
  state.foundKey = found.join(",");
  el["found-count"].textContent = found.length;
  ["frame-left", "frame-right"].forEach(frameId => {
    const frame = document.getElementById(frameId);
    frame.querySelectorAll(".hit-circle:not(.wrong)").forEach(item => item.remove());
  });
  const lv = LEVELS[state.state.level];
  found.forEach(index => {
    const diff = lv.diffs[index];
    ["frame-left", "frame-right"].forEach(frameId => {
      const marker = document.createElement("div");
      marker.className = "hit-circle";
      marker.style.left = `${diff.x / 800 * 100}%`;
      marker.style.top = `${diff.y / 600 * 100}%`;
      document.getElementById(frameId).appendChild(marker);
    });
  });
}

function renderPlayers(stateData) {
  el["online-players"].innerHTML = stateData.players.map((player, index) => `
    <span class="player-chip ${player.connected ? "online" : ""} ${player.seat === state.seat ? "me" : ""}">
      ${seatColors[index]} ${escapeHtml(player.name)} · ${player.score}
    </span>
  `).join("");
  el["rename-input"].value = state.name;
}

function renderFeedback(stateData) {
  const event = stateData.lastEvent;
  if (!event) return;
  const key = `${stateData.revision}`;
  if (el["player-turn-banner"].dataset.eventKey === key) return;
  el["player-turn-banner"].dataset.eventKey = key;
  el["player-turn-banner"].textContent = event.message || "🌐 联机房同步中…";
  el["feedback-bar"].textContent = event.message || "";
  el["feedback-bar"].className = "feedback-bar " + (event.kind === "found" ? "ok" : "");
}

function updateTimer() {
  const remaining = Math.max(0, Math.ceil((state.deadlineAt - Date.now()) / 1000));
  el.timer.textContent = remaining;
  el.timer.parentElement.classList.toggle("warning", remaining <= 10);
}

async function handleClick(event, frame) {
  if (!state.state || state.state.status !== "playing" || state.submitting) return;
  const svg = frame.querySelector("svg");
  if (!svg) return;
  const svgRect = svg.getBoundingClientRect();
  const cx = (event.clientX - svgRect.left) * 800 / svgRect.width;
  const cy = (event.clientY - svgRect.top) * 600 / svgRect.height;
  const level = LEVELS[state.state.level];
  let matched = -1;
  level.diffs.forEach((diff, index) => {
    if (matched >= 0 || state.state.found.includes(index)) return;
    const dx = cx - diff.x, dy = cy - diff.y;
    if (dx * dx + dy * dy <= diff.r * diff.r) matched = index;
  });

  const marker = document.createElement("div");
  marker.className = "hit-circle" + (matched >= 0 ? "" : " wrong");
  const frameRect = frame.getBoundingClientRect();
  marker.style.left = `${(event.clientX - frameRect.left) / frameRect.width * 100}%`;
  marker.style.top = `${(event.clientY - frameRect.top) / frameRect.height * 100}%`;
  frame.appendChild(marker);
  setTimeout(() => marker.remove(), 800);

  if (matched < 0) {
    sWrong();
    el["feedback-bar"].textContent = "❌ 这里不是差异点";
    el["feedback-bar"].className = "feedback-bar bad";
    return;
  }

  state.submitting = true;
  try {
    const result = await api("/click", {
      token: state.token,
      level: state.state.level,
      diffIndex: matched,
    });
    sHit();
    applyState(result.state);
  } catch (error) {
    if (error.code !== "already-found") {
      sWrong();
      el["feedback-bar"].textContent = "❌ 同步失败，请再点一次";
      el["feedback-bar"].className = "feedback-bar bad";
    }
  } finally {
    state.submitting = false;
  }
}

async function renameSelf() {
  const name = el["rename-input"].value.trim();
  if (!name) return;
  try {
    const data = await api("/rename", { token: state.token, name });
    state.name = data.name;
    applyState(data.state);
    el["feedback-bar"].textContent = `✏️ 名字已改为 ${data.name}`;
    el["feedback-bar"].className = "feedback-bar ok";
  } catch (error) {
    el["feedback-bar"].textContent = error.message || "改名失败";
    el["feedback-bar"].className = "feedback-bar bad";
  }
}

async function restartGame() {
  if (solo.active) { startSoloGame(); return; }
  if (!state.token) return;
  try {
    const data = await api("/restart", { token: state.token });
    applyState(data.state);
  } catch (_) {}
}

/* ===== 单机模式（?mode=solo）：本地计关、计时、计分，不走联机房 ===== */
const solo = {
  active: false,
  level: 0,
  found: [],
  score: 0,
  deadlineAt: 0,
  timerId: null,
  finished: false,
  levelSeconds: 60
};

function soloMode() {
  return new URLSearchParams(location.search).get("mode") === "solo";
}

function startSoloGame() {
  solo.active = true;
  solo.level = 0;
  solo.found = [];
  solo.score = 0;
  solo.finished = false;
  clearInterval(solo.timerId);
  solo.timerId = null;
  showScreen("game");
  loadSoloLevel(0);
}

function loadSoloLevel(idx) {
  solo.level = idx;
  solo.found = [];
  const level = LEVELS[idx];
  el["cur-level"].textContent = idx + 1;
  el["total-levels"].textContent = LEVELS.length;
  el["found-count"].textContent = "0";
  el["frame-left"].innerHTML = level.svg();
  el["frame-right"].innerHTML = level.svgB();
  ["frame-left", "frame-right"].forEach(frameId => {
    document.getElementById(frameId).querySelectorAll(".hit-circle").forEach(node => node.remove());
    document.getElementById(frameId).onclick = event => soloClick(event, document.getElementById(frameId));
  });
  el["player-turn-banner"].textContent = "🧑‍🚀 单人挑战 · 第 " + (idx + 1) + " / " + LEVELS.length + " 关";
  el["feedback-bar"].textContent = "找找看，两幅图有什么不同？";
  el["feedback-bar"].className = "feedback-bar";
  solo.deadlineAt = Date.now() + solo.levelSeconds * 1000;
  if (!solo.timerId) solo.timerId = setInterval(soloTick, 250);
  soloTick();
}

function soloTick() {
  if (solo.finished) return;
  const remaining = Math.max(0, Math.ceil((solo.deadlineAt - Date.now()) / 1000));
  el.timer.textContent = remaining;
  el.timer.parentElement.classList.toggle("warning", remaining <= 10);
  if (remaining <= 0) {
    el["feedback-bar"].textContent = "⏰ 时间到，进入下一关";
    el["feedback-bar"].className = "feedback-bar bad";
    soloNext();
  }
}

function soloRenderFound() {
  el["found-count"].textContent = solo.found.length;
  const diff = LEVELS[solo.level].diffs[solo.found[solo.found.length - 1]];
  ["frame-left", "frame-right"].forEach(frameId => {
    const marker = document.createElement("div");
    marker.className = "hit-circle";
    marker.style.left = `${diff.x / 800 * 100}%`;
    marker.style.top = `${diff.y / 600 * 100}%`;
    document.getElementById(frameId).appendChild(marker);
  });
}

function soloClick(event, frame) {
  if (solo.finished) return;
  const svg = frame.querySelector("svg");
  if (!svg) return;
  const svgRect = svg.getBoundingClientRect();
  const cx = (event.clientX - svgRect.left) * 800 / svgRect.width;
  const cy = (event.clientY - svgRect.top) * 600 / svgRect.height;
  const level = LEVELS[solo.level];
  let matched = -1;
  level.diffs.forEach((diff, index) => {
    if (matched >= 0 || solo.found.includes(index)) return;
    const dx = cx - diff.x, dy = cy - diff.y;
    if (dx * dx + dy * dy <= diff.r * diff.r) matched = index;
  });

  const marker = document.createElement("div");
  marker.className = "hit-circle" + (matched >= 0 ? "" : " wrong");
  const frameRect = frame.getBoundingClientRect();
  marker.style.left = `${(event.clientX - frameRect.left) / frameRect.width * 100}%`;
  marker.style.top = `${(event.clientY - frameRect.top) / frameRect.height * 100}%`;
  frame.appendChild(marker);
  setTimeout(() => marker.remove(), 800);

  if (matched < 0) {
    sWrong();
    el["feedback-bar"].textContent = "❌ 这里不是差异点";
    el["feedback-bar"].className = "feedback-bar bad";
    return;
  }

  solo.found.push(matched);
  solo.score += 10;
  sHit();
  soloRenderFound();
  el["feedback-bar"].textContent = "✅ 找到一个不同！" + level.diffs[matched].label;
  el["feedback-bar"].className = "feedback-bar ok";

  if (solo.found.length >= level.diffs.length) {
    solo.score += 20;
    if (solo.level + 1 >= LEVELS.length) {
      el["feedback-bar"].textContent = "🎉 最后一关完成！";
      soloFinish();
    } else {
      el["feedback-bar"].textContent = "🎉 完成第 " + (solo.level + 1) + " 关！马上进入下一关…";
      el["feedback-bar"].className = "feedback-bar ok";
      setTimeout(() => {
        if (!solo.finished && solo.found.length >= LEVELS[solo.level].diffs.length) soloNext();
      }, 1200);
    }
  }
}

function soloNext() {
  if (solo.finished) return;
  if (solo.level + 1 >= LEVELS.length) {
    soloFinish();
    return;
  }
  loadSoloLevel(solo.level + 1);
}

function soloFinish() {
  if (solo.finished) return;
  solo.finished = true;
  clearInterval(solo.timerId);
  solo.timerId = null;
  sWin();
  if (window.SoloTitles) SoloTitles.grant("spot");
  showScreen("result");
  el["result-subtitle"].textContent = "单人挑战完成！4 关全部找齐，观察力超强！";
  el.leaderboard.innerHTML = `
    <div class="lb-row winner">
      <span>🥇 我（单人挑战）</span>
      <span>${solo.score} 分</span>
    </div>
  `;
}

function showResult(stateData) {
  showScreen("result");
  const players = [...stateData.players].sort((a, b) => b.score - a.score);
  el["result-subtitle"].textContent = players[0]?.score
    ? `${players[0].name} 获得冠军！`
    : "本局没有人得分，再试一次吧！";
  el.leaderboard.innerHTML = players.map((player, index) => `
    <div class="lb-row ${index === 0 && player.score ? "winner" : ""}">
      <span>${["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣"][index]} ${escapeHtml(player.name)}${player.seat === state.seat ? "（我）" : ""}</span>
      <span>${player.score} 分</span>
    </div>
  `).join("");
}

function stopTimer() {
  clearInterval(state.timerId);
  state.timerId = null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
}
