/* 单人闯关称号系统 —— 各游戏共享（纯原生 JS，无外部依赖） */
(function () {
  "use strict";

  var STORAGE_KEY = "techbitSoloTitles";

  var TITLES = [
    { key: "spot",  icon: "🦅", name: "火眼金睛", game: "图像找不同",       link: "../spot-difference/index.html?mode=solo",     how: "完成一场找不同挑战" },
    { key: "emoji", icon: "🕵️", name: "小侦探",    game: "Emoji 猜趣味句子", link: "../emoji-sentence-guess/index.html?mode=solo", how: "一次连续通关全部 10 关" },
    { key: "time",  icon: "⏰", name: "时间大师",  game: "猜时间闯关",       link: "../time-guess/index.html?mode=solo",          how: "完成猜 10 秒、最快点击、篮球落地三关" },
    { key: "robot", icon: "🤖", name: "指挥官",    game: "给机器人指路",     link: "../robot-path/index.html?mode=solo",          how: "先选年级，再完成该年级全部关卡" },
    { key: "color", icon: "🎨", name: "鹰眼大师",  game: "颜色大挑战",       link: "../color-challenge/index.html?mode=solo",     how: "闯过全部 8 关色差挑战" },
    { key: "poem",  icon: "📜", name: "古诗达人",  game: "看AI图猜古诗",     link: "../poem-guess/index.html?mode=solo",          how: "先选年级范围，再完成一轮全部题目" }
  ];

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : null;
      return data && typeof data === "object" ? data : {};
    } catch (e) { return {}; }
  }

  function save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ }
  }

  function findByKey(key) {
    for (var i = 0; i < TITLES.length; i++) {
      if (TITLES[i].key === key) return TITLES[i];
    }
    return null;
  }

  function isEarned(key) {
    return !!load()[key];
  }

  function earnedCount() {
    var data = load();
    var count = 0;
    TITLES.forEach(function (t) { if (data[t.key]) count++; });
    return count;
  }

  function getAll() {
    var data = load();
    return TITLES.map(function (t) {
      return {
        key: t.key, icon: t.icon, name: t.name, game: t.game, link: t.link, how: t.how,
        earned: !!data[t.key],
        earnedAt: data[t.key] ? data[t.key].earnedAt : null
      };
    });
  }

  /* ===== 游戏内徽标：根据 script 标签的 data-title-key 自动注入 ===== */
  var scriptTag = document.currentScript;
  var badgeKey = scriptTag ? scriptTag.getAttribute("data-title-key") : null;
  var BADGE_FONT = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

  function ensureBadge() {
    var badge = document.getElementById("solo-title-badge");
    if (badge) return badge;
    if (!findByKey(badgeKey)) return null;
    badge = document.createElement("div");
    badge.id = "solo-title-badge";
    badge.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:9999;display:inline-flex;align-items:center;gap:6px;" +
      "padding:8px 13px;border-radius:999px;font-size:12.5px;font-weight:700;font-family:" + BADGE_FONT + ";" +
      "box-shadow:0 8px 24px rgba(0,0,0,.16);white-space:nowrap;";
    document.body.appendChild(badge);
    return badge;
  }

  function renderBadge() {
    var badge = ensureBadge();
    if (!badge) return;
    var def = findByKey(badgeKey);
    if (isEarned(badgeKey)) {
      badge.textContent = "✅ " + def.icon + " 称号已获得 · " + def.name;
      badge.style.color = "#b45309";
      badge.style.border = "1px solid rgba(217,119,6,.35)";
      badge.style.background = "linear-gradient(120deg,#fffbeb,#fef3c7)";
    } else {
      badge.textContent = "🏅 待获得称号：" + def.icon + " " + def.name;
      badge.style.color = "#6b7280";
      badge.style.border = "1px dashed rgba(0,0,0,.18)";
      badge.style.background = "rgba(255,255,255,.94)";
    }
  }

  /* ===== 获得称号时的庆祝提示 ===== */
  function showToast(def) {
    var toast = document.createElement("div");
    toast.style.cssText =
      "position:fixed;top:-90px;left:50%;transform:translateX(-50%);z-index:10000;padding:14px 22px;" +
      "border-radius:16px;background:linear-gradient(120deg,#fffbeb,#fef3c7);border:1px solid rgba(217,119,6,.4);" +
      "box-shadow:0 16px 48px rgba(0,0,0,.22);font-size:16px;font-weight:800;color:#92400e;" +
      "transition:top .45s ease;font-family:" + BADGE_FONT + ";white-space:nowrap;";
    toast.textContent = "🎉 恭喜获得称号：" + def.icon + " 「" + def.name + "」";
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.style.top = "18px"; });
    setTimeout(function () {
      toast.style.top = "-90px";
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 500);
    }, 3800);
  }

  function grant(key) {
    var def = findByKey(key);
    if (!def) return false;
    var data = load();
    if (data[key]) return false;
    data[key] = { earnedAt: Date.now() };
    save(data);
    renderBadge();
    showToast(def);
    return true;
  }

  window.SoloTitles = {
    TITLES: TITLES,
    grant: grant,
    isEarned: isEarned,
    getAll: getAll,
    earnedCount: earnedCount
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBadge);
  } else {
    renderBadge();
  }
})();
