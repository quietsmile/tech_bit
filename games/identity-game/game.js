/* 身份推理 · 谁是卧底 —— 纯原生 JS，无任何外部依赖 */
(function () {
  "use strict";

  /* ---------- 词库 ---------- */
  var WORD_PAIRS = [
    ["苹果", "梨"], ["奶茶", "咖啡"], ["火锅", "麻辣烫"],
    ["地铁", "公交"], ["微信", "QQ"], ["猫", "狗"],
    ["篮球", "足球"], ["暑假", "寒假"], ["工资", "奖学金"],
    ["微博", "抖音"], ["火车", "高铁"], ["米饭", "面条"],
    [" sunscreen", "雨伞"].map(function(s){return s.trim();}),
    ["老师", "教练"], ["医生", "护士"], ["口琴", "笛子"]
  ];
  var SPECIAL_WORD = "白板";

  /* ---------- 存档 ---------- */
  var SAVE_KEY = "identity-game-settings";
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (e) { /* 忽略隐私模式 */ }
    return null;
  }
  function saveSettings() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        undercoverCount: state.undercoverCount,
        specialEnabled: state.specialEnabled,
        wordPairIndex: state.wordPairIndex,
        saveNames: state.saveNames
      }));
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 状态 ---------- */
  var state = {
    phase: "setup",           // setup | pass | passReveal | discussion | voteIntro | vote | voteResult | gameover
    players: [],              // {name, role, word, alive}
    undercoverCount: 1,
    specialEnabled: false,
    wordPairIndex: -1,        // -1 = 每局随机
    saveNames: false,
    savedNames: [],           // 上局玩家名，便于复用
    passIndex: 0,
    revealShown: false,
    voteIndex: 0,
    votes: [],                // 每个存活玩家的投票目标（索引）
    eliminated: null,         // 本轮被淘汰玩家
    tie: false,
    winner: null              // "civilian" | "undercover"
  };

  var $main = document.getElementById("main");
  var $modal = document.getElementById("modal");
  var $modalBody = document.getElementById("modal-body");
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("btn-rules-top").addEventListener("click", showRules);

  function closeModal() { $modal.classList.add("hidden"); }
  function showRules() {
    $modalBody.innerHTML =
      '<div class="rules">' +
      "<h2>📖 规则说明</h2>" +
      "<h3>1. 分配身份</h3>" +
      "<p>每位玩家轮流拿同一台设备查看自己的身份后立即隐藏并交给下一位。多数人为<b>平民</b>（拿到相同词语），系统随机指定若干名<b>卧底</b>（拿到相近但不同的词语），可选设置一名<b>白板</b>（看不到任何词语）。</p>" +
      "<h3>2. 讨论阶段</h3>" +
      "<p>大家轮流用一句话描述自己的词语（不能直接说出词语本身），白板玩家需随意编造并伪装。每轮描述结束后进行讨论。</p>" +
      "<h3>3. 提名投票</h3>" +
      "<p>所有存活玩家轮流在同一设备上秘密投票提名一名疑似卧底（互相不能看到对方选了谁）。得票最多者被淘汰；平票则本轮无人淘汰。</p>" +
      "<h3>4. 胜负判定</h3>" +
      "<ul>" +
      "<li>所有卧底被淘汰 → <b>平民阵营获胜</b></li>" +
      "<li>存活卧底人数 ≥ 存活其他玩家人数 → <b>卧底获胜</b></li>" +
      "<li>否则淘汰者亮明身份，进入下一轮讨论。</li>" +
      "</ul></div>";
    $modal.classList.remove("hidden");
  }

  /* ---------- 渲染工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function render(html) {
    $main.innerHTML = html;
    window.scrollTo(0, 0);
  }

  /* ---------- 设置页 ---------- */
  function renderSetup() {
    var s = state;
    var namesHtml = "";
    if (s.savedNames.length && s.saveNames) {
      namesHtml = '<div class="name-list">' +
        s.savedNames.map(function (n) { return "<span>" + esc(n) + "</span>"; }).join("") +
        "</div>";
    }
    var options = '<option value="-1"' + (s.wordPairIndex === -1 ? " selected" : "") + ">每局随机</option>";
    for (var i = 0; i < WORD_PAIRS.length; i++) {
      options += '<option value="' + i + '"' + (i === s.wordPairIndex ? " selected" : "") + ">" +
        esc(WORD_PAIRS[i][0] + " / " + WORD_PAIRS[i][1]) + "</option>";
    }
    var maxUC = Math.max(1, Math.floor((s.players.length || 4) / 3));
    var ucOptions = "";
    for (var u = 1; u <= maxUC; u++) {
      ucOptions += '<option value="' + u + '"' + (u === s.undercoverCount ? " selected" : "") + ">" + u + " 名</option>";
    }

    render(
      '<div class="card">' +
      "<h2>🎮 开新一局</h2>" +
      '<label>玩家列表（4–12 人，用逗号或换行分隔）</label>' +
      '<textarea id="in-names" rows="4" placeholder="例如：小明, 小红, 小刚, 小丽">' +
      esc(s.savedNames.join(", ")) + "</textarea>" +
      namesHtml +
      '<label>卧底数量</label><select id="in-uc">' + ucOptions + "</select>" +
      '<label>加入「白板」特殊身份</label><select id="in-special">' +
        '<option value="0"' + (!s.specialEnabled ? " selected" : "") + ">不加入</option>" +
        '<option value="1"' + (s.specialEnabled ? " selected" : "") + ">加入 1 名白板</option></select>" +
      '<label>词语对</label><select id="in-pair">' + options + "</select>" +
      '<label><input type="checkbox" id="in-save" style="width:auto;margin-right:8px"' +
        (s.saveNames ? " checked" : "") + '>本地保存玩家名（仅存此浏览器）</label>' +
      '<button id="btn-start" class="btn">开始发牌</button>' +
      '<button id="btn-rules" class="btn secondary">📖 查看规则</button>' +
      "</div>"
    );

    document.getElementById("btn-start").addEventListener("click", startGame);
    document.getElementById("btn-rules").addEventListener("click", showRules);
  }

  function startGame() {
    var raw = document.getElementById("in-names").value.trim();
    var names = raw.split(/[,，\n]+/).map(function (n) { return n.trim(); })
      .filter(function (n) { return n.length > 0; });
    if (names.length < 4 || names.length > 12) {
      alert("请输入 4–12 名玩家（当前 " + names.length + " 人）");
      return;
    }
    var seen = {};
    for (var i = 0; i < names.length; i++) {
      var key = names[i];
      if (seen[key]) { alert("玩家名重复：" + key); return; }
      seen[key] = true;
    }

    state.undercoverCount = parseInt(document.getElementById("in-uc").value, 10);
    state.specialEnabled = document.getElementById("in-special").value === "1";
    state.wordPairIndex = parseInt(document.getElementById("in-pair").value, 10);
    state.saveNames = document.getElementById("in-save").checked;
    state.savedNames = names.slice();

    /* 校验卧底数量 */
    var others = names.length - state.undercoverCount - (state.specialEnabled ? 1 : 0);
    if (others < 2) {
      alert("人数太少：平民至少需要 2 人，请减少卧底或关闭白板");
      return;
    }

    /* 分配角色 */
    var idx = [];
    for (var j = 0; j < names.length; j++) idx.push(j);
    for (var k = idx.length - 1; k > 0; k--) {
      var r = Math.floor(Math.random() * (k + 1));
      var t = idx[k]; idx[k] = idx[r]; idx[r] = t;
    }
    var pairIdx = state.wordPairIndex >= 0 ? state.wordPairIndex
      : Math.floor(Math.random() * WORD_PAIRS.length);
    var pair = WORD_PAIRS[pairIdx];
    /* 随机决定平民/卧底哪方拿哪个词 */
    var civWord = pair[0], ucWord = pair[1];
    if (Math.random() < 0.5) { civWord = pair[1]; ucWord = pair[0]; }

    state.players = names.map(function (n) {
      return { name: n, role: "civilian", word: civWord, alive: true };
    });
    for (var a = 0; a < state.undercoverCount; a++) {
      state.players[idx[a]].role = "undercover";
      state.players[idx[a]].word = ucWord;
    }
    if (state.specialEnabled) {
      state.players[idx[state.undercoverCount]].role = "special";
      state.players[idx[state.undercoverCount]].word = SPECIAL_WORD;
    }

    state.passIndex = 0;
    state.revealShown = false;
    state.votes = [];
    state.voteIndex = 0;
    state.eliminated = null;
    state.tie = false;
    state.winner = null;
    state.phase = "pass";
    saveSettings();
    renderPassIntro();
  }

  /* ---------- 传阅阶段 ---------- */
  function renderPassIntro() {
    var p = state.players[state.passIndex];
    render(
      '<div class="card pass-box">' +
      "<h2>🙈 传阅身份</h2>" +
      '<p class="pass-big">' + esc(p.name) + "</p>" +
      "<p>请确认设备只在你手中，再点击查看。其他人请勿偷看！</p>" +
      '<button id="btn-show" class="btn">查看我的身份</button>' +
      "</div>"
    );
    document.getElementById("btn-show").addEventListener("click", function () {
      state.revealShown = true;
      renderReveal();
    });
  }

  function renderReveal() {
    var p = state.players[state.passIndex];
    var cls = p.role === "undercover" ? "undercover" : p.role === "special" ? "special" : "civilian";
    var roleName = p.role === "undercover" ? "你可能是卧底" :
                   p.role === "special" ? "你是白板（特殊身份）" : "你是平民";
    var wordHtml = p.role === "special"
      ? '<div style="font-size:.9rem;color:#bbb;margin-top:8px">你拿不到任何词语，请随机应变、混入讨论</div>'
      : "<div style='margin-top:8px'>词语：" + esc(p.word) + "</div>";

    render(
      '<div class="card pass-box">' +
      "<h2>👀 你的身份</h2>" +
      '<div class="identity-card ' + cls + '">' +
      '<span class="role">' + roleName + "</span>" +
      esc(p.name) +
      wordHtml +
      "</div>" +
      '<button id="btn-hide" class="btn danger">记住后立即隐藏</button>' +
      "</div>"
    );
    document.getElementById("btn-hide").addEventListener("click", function () {
      state.revealShown = false;
      state.passIndex++;
      if (state.passIndex >= state.players.length) {
        state.phase = "discussion";
        renderDiscussion();
      } else {
        renderPassIntro();
      }
    });
  }

  /* ---------- 讨论阶段 ---------- */
  function alivePlayers() {
    return state.players.filter(function (p) { return p.alive; });
  }
  function renderDiscussion() {
    var names = alivePlayers().map(function (p) { return esc(p.name); }).join("、");
    render(
      '<div class="card">' +
      "<h2>💬 第 " + roundNumber() + " 轮 · 讨论</h2>" +
      '<p class="count-badge">存活 ' + alivePlayers().length + " 人</p>" +
      "<p>请按顺序描述你的词语（不能直接说出来）：</p>" +
      "<p><b>" + names + "</b></p>" +
      "<p style='color:#9aa;margin-top:10px'>描述完成后，进入秘密投票。</p>" +
      '<button id="btn-vote" class="btn">开始投票</button>' +
      '<button id="btn-rules2" class="btn secondary">📖 规则</button>' +
      "</div>"
    );
    document.getElementById("btn-vote").addEventListener("click", function () {
      state.voteIndex = 0;
      state.votes = [];
      state.phase = "voteIntro";
      renderVoteIntro();
    });
    document.getElementById("btn-rules2").addEventListener("click", showRules);
  }
  function roundNumber() {
    return state.votes.length === 0 ? 1 : 1;
  }

  /* ---------- 投票阶段 ---------- */
  function renderVoteIntro() {
    var voters = alivePlayers();
    if (state.voteIndex >= voters.length) { tallyVotes(); return; }
    var v = voters[state.voteIndex];
    render(
      '<div class="card pass-box">' +
      "<h2>🗳️ 秘密投票</h2>" +
      '<p class="pass-big">' + esc(v.name) + "</p>" +
      "<p>轮到你提名一名疑似卧底，其他人请勿偷看。</p>" +
      '<button id="btn-go" class="btn">我要投票</button>' +
      "</div>"
    );
    document.getElementById("btn-go").addEventListener("click", renderVote);
  }

  function renderVote() {
    var voters = alivePlayers();
    var me = voters[state.voteIndex];
    var listHtml = "";
    state.players.forEach(function (p, i) {
      if (!p.alive || p.name === me.name) { return; }
      listHtml += '<button data-i="' + i + '">' + esc(p.name) + "</button>";
    });
    render(
      '<div class="card">' +
      "<h2>🗳️ " + esc(me.name) + " 的提名</h2>" +
      '<div class="vote-list">' + listHtml + "</div>" +
      "</div>"
    );
    var btns = document.querySelectorAll(".vote-list button");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        state.votes.push(parseInt(b.getAttribute("data-i"), 10));
        state.voteIndex++;
        renderVoteIntro();
      });
    });
  }

  function tallyVotes() {
    var count = {};
    state.votes.forEach(function (targetIdx) {
      count[targetIdx] = (count[targetIdx] || 0) + 1;
    });
    var max = 0, maxIdx = [], voters = alivePlayers();
    Object.keys(count).forEach(function (k) {
      var c = count[k];
      if (c > max) { max = c; maxIdx = [parseInt(k, 10)]; }
      else if (c === max) { maxIdx.push(parseInt(k, 10)); }
    });
    state.tie = maxIdx.length !== 1;
    if (!state.tie) {
      state.eliminated = state.players[maxIdx[0]];
      state.eliminated.alive = false;
    } else {
      state.eliminated = null;
    }
    state.phase = "voteResult";
    checkWinner();
    renderVoteResult();
  }

  /* ---------- 结果 ---------- */
  function checkWinner() {
    var uc = 0, civ = 0;
    alivePlayers().forEach(function (p) {
      if (p.role === "undercover") { uc++; } else { civ++; }
    });
    if (uc === 0) { state.winner = "civilian"; }
    else if (uc >= civ) { state.winner = "undercover"; }
    else { state.winner = null; }
  }

  function renderVoteResult() {
    var banner = "", detail = "";
    if (state.winner === "civilian") {
      banner = '<div class="result-banner civilian-win">🎉 平民阵营获胜！所有卧底已被找出</div>';
    } else if (state.winner === "undercover") {
      banner = '<div class="result-banner undercover-win">😈 卧底阵营获胜！潜伏成功</div>';
    } else if (state.tie) {
      banner = '<div class="result-banner continue">⚖️ 平票！本轮无人淘汰</div>';
    } else {
      var e = state.eliminated;
      var roleTxt = e.role === "undercover" ? "🔴 卧底" : e.role === "special" ? "🟣 白板" : "🟢 平民";
      banner = '<div class="result-banner continue">☠️ ' + esc(e.name) + " 被淘汰（" + roleTxt + "）</div>";
    }

    if (state.winner) {
      detail = "<h3>全部身份揭晓</h3><div class='id-grid'>" +
        state.players.map(function (p) {
          var cls = p.role === "undercover" ? "undercover" : p.role === "special" ? "special" : "";
          var dot = p.role === "undercover" ? "🔴卧底" : p.role === "special" ? "🟣白板" : "🟢平民";
          var dead = p.alive ? "" : "（已出局）";
          return "<span class='chip " + cls + "'>" + esc(p.name) + " · " + dot + dead + "</span>";
        }).join("") + "</div>";
    }

    render(
      '<div class="card">' +
      "<h2>📊 投票结果</h2>" +
      banner + detail +
      '<button id="btn-next" class="btn">' + (state.winner ? "再来一局" : "进入下一轮讨论") + "</button>" +
      '<button id="btn-reset" class="btn secondary">重新开始（回到设置）</button>' +
      "</div>"
    );
    document.getElementById("btn-next").addEventListener("click", function () {
      if (state.winner) {
        state.phase = "gameover";
        renderSetup();
      } else {
        state.phase = "discussion";
        renderDiscussion();
      }
    });
    document.getElementById("btn-reset").addEventListener("click", function () {
      state.phase = "setup";
      state.players = [];
      state.winner = null;
      renderSetup();
    });
  }

  /* ---------- 启动 ---------- */
  var saved = loadSettings();
  if (saved) {
    state.undercoverCount = saved.undercoverCount || 1;
    state.specialEnabled = !!saved.specialEnabled;
    state.wordPairIndex = typeof saved.wordPairIndex === "number" ? saved.wordPairIndex : -1;
    state.saveNames = !!saved.saveNames;
    state.savedNames = Array.isArray(saved.savedNames) ? saved.savedNames : [];
  }
  renderSetup();
})();
