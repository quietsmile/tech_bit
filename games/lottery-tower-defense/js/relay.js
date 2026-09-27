/* 抽奖塔防 —— 联机比赛（各守各的 · 比分数），基于游戏中心房间中继 */
(function () {
  'use strict';

  var code = '';
  var token = '';
  var active = false;
  var board = null;
  var statusEl = null;

  function $(id) { return document.getElementById(id); }
  function setStatus(text) { if (statusEl) statusEl.textContent = text || ''; }

  function api(path, payload) {
    return fetch('/api/relay/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  function myName() {
    try {
      var players = window.LotteryTD && window.LotteryTD.players;
      return (players && players[0] && players[0].name) || '我';
    } catch (e) { return '我'; }
  }

  function myScore() {
    try {
      var players = window.LotteryTD && window.LotteryTD.players;
      return (players && players[0] && Math.round(players[0].score)) || 0;
    } catch (e) { return 0; }
  }

  function renderBoard(scores) {
    if (!board) return;
    if (active) board.style.display = 'block';
    var rows = scores.slice(0, 6).map(function (s, i) {
      return '<div class="mrow"><span>' + (i + 1) + '. ' + s.name + '</span><span>' + s.score + ' 分</span></div>';
    }).join('');
    board.innerHTML = '<b>🌐 联机比赛 ' + code + '</b>' + (rows || '<div class="mrow">暂无比分</div>');
  }

  function pollScores() {
    if (!active) return;
    fetch('/api/relay/scores?code=' + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data.ok) renderBoard(data.scores || []); })
      .catch(function () {});
  }

  function reportLoop() {
    if (active && window.LotteryTD) {
      api('score', { code: code, token: token, name: myName(), score: myScore() })
        .then(function () { pollScores(); })
        .catch(function () {});
    }
    setTimeout(reportLoop, 3000);
  }

  function autoJoin() {
    var stored = localStorage.getItem('td_relay_token') || '';
    api('auto', { game: 'td-match', token: stored }).then(function (data) {
      if (!data.ok) { setStatus(data.error || '进入联机房间失败'); return; }
      code = data.code;
      token = data.token;
      active = true;
      try { localStorage.setItem('td_relay_token', token); } catch (e) {}
      setStatus('✅ 已进入联机比赛房间，开始战斗后自动上报比分');
    }).catch(function () { setStatus('进入联机房间失败，请稍后再试'); });
  }


  document.addEventListener('DOMContentLoaded', function () {
    board = document.getElementById('matchBoard');
    statusEl = document.getElementById('matchStatus');
    autoJoin();
    reportLoop();
  });
})();
