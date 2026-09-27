/* 称号墙渲染逻辑 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var grid = document.getElementById("title-grid");
    var countEl = document.getElementById("earned-count");
    var fillEl = document.getElementById("progress-fill");
    var allDoneEl = document.getElementById("all-done");

    function formatDate(ts) {
      var d = new Date(ts);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " 获得";
    }

    function render() {
      var items = window.SoloTitles.getAll();
      var earned = items.filter(function (t) { return t.earned; }).length;

      countEl.textContent = earned;
      fillEl.style.width = (earned / items.length) * 100 + "%";
      allDoneEl.classList.toggle("hidden", earned < items.length);

      grid.innerHTML = "";
      items.forEach(function (t) {
        var card = document.createElement("article");
        card.className = "title-card" + (t.earned ? " earned" : "");

        var icon = document.createElement("div");
        icon.className = "title-icon";
        icon.textContent = t.earned ? t.icon : "🔒";

        var name = document.createElement("div");
        name.className = "title-name";
        name.textContent = t.name;

        var game = document.createElement("div");
        game.className = "title-game";
        game.textContent = "🎮 " + t.game;

        var how = document.createElement("div");
        how.className = "title-how";
        how.textContent = "获得条件：" + t.how;

        var status = document.createElement("span");
        status.className = "title-status";
        if (t.earned) {
          status.textContent = "✨ 已获得";
        } else {
          status.textContent = "🔒 待获得称号";
        }

        var go = document.createElement("a");
        go.className = "go-btn";
        go.href = t.link;
        go.textContent = t.earned ? "再玩一次" : "去挑战";

        card.appendChild(icon);
        card.appendChild(name);
        card.appendChild(game);
        card.appendChild(how);
        card.appendChild(status);
        card.appendChild(go);
        grid.appendChild(card);
      });
    }

    render();
    window.addEventListener("storage", render);
    window.addEventListener("focus", render);
  });
})();
