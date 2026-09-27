/* 中国象棋 AI：negamax + alpha-beta + 迭代加深 + 吃子静态搜索（纯 JS，使用 rules.js） */

const AI_PIECE_VALUE = {
  general: 10000, chariot: 900, cannon: 450, horse: 400,
  elephant: 200, advisor: 200, pawn: 100
};

/* 位置粗评估（红方视角；黑方按行镜像使用） */
const AI_PAWN_PST = [
  [0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0],
  [30,35,40,45,45,45,40,35,30],
  [35,40,45,55,55,55,45,40,35],
  [30,30,30,35,35,35,30,30,30],
  [20,22,24,28,28,28,24,22,20],
  [18,20,22,25,25,25,22,20,18],
  [10,12,12,12,12,12,12,12,10],
  [0,0,0,0,0,0,0,0,0]
];
const AI_HORSE_PST = [
  [0,-4,0,0,0,0,0,-4,0],
  [0,2,4,4,4,4,4,2,0],
  [4,6,10,10,10,10,10,6,4],
  [4,10,14,14,14,14,14,10,4],
  [4,10,14,14,14,14,14,10,4],
  [4,8,12,12,12,12,12,8,4],
  [2,6,8,8,8,8,8,6,2],
  [0,2,4,4,4,4,4,2,0],
  [0,-4,0,4,4,4,0,-4,0],
  [0,0,0,0,0,0,0,0,0]
];

function aiEvaluate(board) {
  let score = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      let v = AI_PIECE_VALUE[p.type];
      if (p.type === 'pawn') v += p.side === 'red' ? AI_PAWN_PST[r][c] : AI_PAWN_PST[9 - r][c];
      if (p.type === 'horse') v += p.side === 'red' ? AI_HORSE_PST[r][c] : AI_HORSE_PST[9 - r][c];
      score += p.side === 'red' ? v : -v;
    }
  return score; // 红方视角：红正黑负
}

function aiAllMoves(board, side) {
  const moves = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || p.side !== side) continue;
      for (const [tr, tc] of legalMoves(board, r, c)) moves.push({ fr: r, fc: c, tr, tc });
    }
  return moves;
}

/* MVV-LVA：吃子价值排序（先吃大子、用小子吃） */
function aiVictimValue(board, m) {
  const v = board[m.tr][m.tc];
  if (!v) return 0;
  const attacker = board[m.fr][m.fc];
  return AI_PIECE_VALUE[v.type] * 10 - (attacker ? AI_PIECE_VALUE[attacker.type] : 0);
}

/* 行棋方视角评估（negamax 约定） */
function aiEvalSide(board, side) {
  const s = aiEvaluate(board);
  return side === 'red' ? s : -s;
}

let aiNodes = 0;
let aiDeadline = 0;
let aiTimeUp = false;
const AI_NODE_LIMIT = 600000;

/* negamax：返回「行棋方视角」的分值 */
function aiNegamax(board, depth, alpha, beta, side, qdepth) {
  aiNodes++;
  if (aiNodes > AI_NODE_LIMIT || Date.now() > aiDeadline) aiTimeUp = true;
  if (aiTimeUp) return aiEvalSide(board, side);

  if (!findGeneral(board, side)) return -(99000 + depth);   // 己方无将：必败
  const moves = aiAllMoves(board, side);
  if (!moves.length) return -(99000 + depth);               // 困毙：判负

  if (depth <= 0) {
    if (qdepth <= 0) return aiEvalSide(board, side);
    /* 静态搜索：估值打底，只延伸吃子，消除地平线效应 */
    let best = aiEvalSide(board, side);
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
    const caps = moves
      .filter(m => board[m.tr][m.tc])
      .sort((a, b) => aiVictimValue(board, b) - aiVictimValue(board, a));
    for (const m of caps) {
      const nb = applyMove(board, m.fr, m.fc, m.tr, m.tc);
      const v = -aiNegamax(nb, 0, -beta, -alpha, side === 'red' ? 'black' : 'red', qdepth - 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  /* 吃子优先排序，改善剪枝 */
  const order = moves
    .map((m, idx) => [idx, aiVictimValue(board, m)])
    .sort((a, b) => b[1] - a[1]);
  let best = -Infinity;
  for (const [idx] of order) {
    const m = moves[idx];
    const nb = applyMove(board, m.fr, m.fc, m.tr, m.tc);
    const v = -aiNegamax(nb, depth - 1, -beta, -alpha, side === 'red' ? 'black' : 'red', qdepth);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
    if (aiTimeUp) break;
  }
  return best;
}

/* 难度配置：搜索深度 / 时间预算 / 静态搜索层数 / 候选随机幅度 */
const AI_CONFIG = {
  easy:   { depth: 2, timeMs: 400,  qdepth: 0, noise: 250 },
  normal: { depth: 3, timeMs: 900,  qdepth: 4, noise: 40 },
  hard:   { depth: 6, timeMs: 1800, qdepth: 6, noise: 0 }
};

function aiChooseMove(board, difficulty) {
  const cfg = AI_CONFIG[difficulty] || AI_CONFIG.normal;
  aiNodes = 0; aiTimeUp = false;
  aiDeadline = Date.now() + cfg.timeMs;

  const moves = aiAllMoves(board, 'black');
  if (!moves.length) return null;

  /* 根节点吃子优先排序 */
  moves.sort((a, b) => aiVictimValue(board, b) - aiVictimValue(board, a));

  var bestMove = moves[0];
  /* 迭代加深：从浅到深，时间到就用上一轮完整结果 */
  for (var depth = 2; depth <= cfg.depth; depth++) {
    var alpha = -Infinity, beta = Infinity;
    var localBest = null, localBestV = -Infinity;
    var nearBest = [];
    var aborted = false;

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var nb = applyMove(board, m.fr, m.fc, m.tr, m.tc);
      var v = -aiNegamax(nb, depth - 1, -beta, -alpha, 'red', cfg.qdepth);
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
    if (aborted) break; /* 时间耗尽：用上一轮完整结果 */
  }
  return bestMove;
}
