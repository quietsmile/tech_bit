/* 国际象棋 AI：negamax + alpha-beta + 迭代加深 + 吃子静态搜索（纯 JS） */

const AI_PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

/* 位置表（白方视角，r=0 为黑方底线；黑方按行镜像） */
const PST = {
  p: [
    [0,0,0,0,0,0,0,0],
    [50,50,50,50,50,50,50,50],
    [10,10,20,30,30,20,10,10],
    [5,5,10,25,25,10,5,5],
    [0,0,0,20,20,0,0,0],
    [5,-5,-10,0,0,-10,-5,5],
    [5,10,10,-20,-20,10,10,5],
    [0,0,0,0,0,0,0,0]
  ],
  n: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,0,0,0,0,-20,-40],
    [-30,0,10,15,15,10,0,-30],
    [-30,5,15,20,20,15,5,-30],
    [-30,0,15,20,20,15,0,-30],
    [-30,5,10,15,15,10,5,-30],
    [-40,-20,0,5,5,0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  b: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,5,10,10,5,0,-10],
    [-10,5,5,10,10,5,5,-10],
    [-10,0,10,10,10,10,0,-10],
    [-10,10,10,10,10,10,10,-10],
    [-10,5,0,0,0,0,5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  r: [
    [0,0,0,0,0,0,0,0],
    [5,10,10,10,10,10,10,5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [0,0,0,5,5,0,0,0]
  ],
  q: [
    [-20,-10,-10,-5,-5,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,5,5,5,5,0,-10],
    [-5,0,5,5,5,5,0,-5],
    [0,0,5,5,5,5,0,-5],
    [-10,5,5,5,5,5,0,-10],
    [-10,0,5,0,0,0,0,-10],
    [-20,-10,-10,-5,-5,-10,-10,-20]
  ],
  k: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-30],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20,20,0,0,0,0,20,20],
    [20,30,10,0,0,10,30,20]
  ]
};

/* 白方视角评估：子力 + 位置表 */
function aiEvaluate(pos) {
  let s = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = pos.board[r][c];
      if (!p) continue;
      const row = p.side === 'w' ? r : 7 - r;
      s += (p.side === 'w' ? 1 : -1) * (AI_PIECE_VALUE[p.type] + (PST[p.type][row][c] || 0));
    }
  return s;
}

function aiEvalSide(pos, side) {
  const s = aiEvaluate(pos);
  return side === 'w' ? s : -s;
}

function aiVictimValue(pos, m) {
  const v = pos.board[m.tr][m.tc];
  if (!v) return 0;
  const a = pos.board[m.fr][m.fc];
  let val = AI_PIECE_VALUE[v.type] * 10 - (a ? AI_PIECE_VALUE[a.type] : 0);
  if (v.type === 'k') val = 100000;
  return val;
}

function aiAllMoves(pos, side) {
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = pos.board[r][c];
      if (!p || p.side !== side) continue;
      for (const [tr, tc] of legalMoves(pos, r, c)) moves.push({ fr: r, fc: c, tr, tc });
    }
  return moves;
}

let aiNodes = 0;
let aiDeadline = 0;
let aiTimeUp = false;
const AI_NODE_LIMIT = 600000;

/* negamax：返回「行棋方视角」分值；qdepth>0 时只延伸吃子/升变 */
function aiNegamax(pos, depth, alpha, beta, side, qdepth) {
  aiNodes++;
  if (aiNodes > AI_NODE_LIMIT || Date.now() > aiDeadline) aiTimeUp = true;
  if (aiTimeUp) return aiEvalSide(pos, side);

  const moves = aiAllMoves(pos, side);
  if (!moves.length) {
    /* 无合法走法：被将死（-大分）或逼和（0） */
    return isInCheck(pos, side) ? -(99000 + depth) : 0;
  }

  if (depth <= 0) {
    if (qdepth <= 0) return aiEvalSide(pos, side);
    let best = aiEvalSide(pos, side);
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
    const caps = moves
      .filter(m => aiVictimValue(pos, m) > 0)
      .sort((a, b) => aiVictimValue(pos, b) - aiVictimValue(pos, a));
    for (const m of caps) {
      const np = applyMove(pos, m.fr, m.fc, m.tr, m.tc);
      const v = -aiNegamax(np, 0, -beta, -alpha, side === 'w' ? 'b' : 'w', qdepth - 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  const order = moves
    .map((m, idx) => [idx, aiVictimValue(pos, m)])
    .sort((a, b) => b[1] - a[1]);
  let best = -Infinity;
  for (const [idx] of order) {
    const m = moves[idx];
    const np = applyMove(pos, m.fr, m.fc, m.tr, m.tc);
    const v = -aiNegamax(np, depth - 1, -beta, -alpha, side === 'w' ? 'b' : 'w', qdepth);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
    if (aiTimeUp) break;
  }
  return best;
}

/* 难度配置 */
const AI_CONFIG = {
  easy:   { depth: 2, timeMs: 400,  qdepth: 0, noise: 250 },
  normal: { depth: 3, timeMs: 900,  qdepth: 4, noise: 40 },
  hard:   { depth: 5, timeMs: 1800, qdepth: 6, noise: 0 }
};

function aiChooseMove(pos, difficulty) {
  const cfg = AI_CONFIG[difficulty] || AI_CONFIG.normal;
  aiNodes = 0; aiTimeUp = false;
  aiDeadline = Date.now() + cfg.timeMs;

  const moves = aiAllMoves(pos, 'b'); // AI 执黑
  if (!moves.length) return null;
  moves.sort((a, b) => aiVictimValue(pos, b) - aiVictimValue(pos, a));

  var bestMove = moves[0];
  for (var depth = 2; depth <= cfg.depth; depth++) {
    var alpha = -Infinity, beta = Infinity;
    var localBest = null, localBestV = -Infinity;
    var nearBest = [];
    var aborted = false;

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var np = applyMove(pos, m.fr, m.fc, m.tr, m.tc);
      var v = -aiNegamax(np, depth - 1, -beta, -alpha, 'w', cfg.qdepth);
      if (aiTimeUp) { aborted = true; break; }
      if (v > localBestV) { localBestV = v; localBest = m; nearBest = [m]; }
      else if (v === localBestV) nearBest.push(m);
      else if (localBestV - v <= cfg.noise) nearBest.push(m);
      if (v > alpha) alpha = v;
    }

    if (localBest) {
      bestMove = nearBest.length
        ? nearBest[Math.floor(Math.random() * nearBest.length)]
        : localBest;
    }
    if (aborted) break;
  }
  return bestMove;
}
