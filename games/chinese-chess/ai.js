/* 中国象棋简易 AI：minimax + alpha-beta，纯 JS，使用 rules.js 的合法走法 */

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
  return score; // 黑方 AI 希望分数越小越好
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

function aiSearch(board, depth, alpha, beta, side /*将要行棋的一方*/) {
  aiNodes++;
  if (aiNodes > AI_NODE_LIMIT) return aiEvaluate(board);
  if (!findGeneral(board, side)) return side === 'black' ? 99999 : -99999;
  if (depth === 0) return aiEvaluate(board);
  const maximizing = side === 'black';
  let best = maximizing ? -Infinity : Infinity;
  const moves = aiAllMoves(board, side);
  if (!moves.length) return maximizing ? -99999 : 99999;
  // 吃子优先，改善剪枝
  moves.sort((a, b) => {
    const va = board[a.tr][a.tc] ? AI_PIECE_VALUE[board[a.tr][a.tc].type] : 0;
    const vb = board[b.tr][b.tc] ? AI_PIECE_VALUE[board[b.tr][b.tc].type] : 0;
    return vb - va;
  });
  for (const m of moves) {
    const nb = applyMove(board, m.fr, m.fc, m.tr, m.tc);
    const v = aiSearch(nb, depth - 1, alpha, beta, side === 'red' ? 'black' : 'red');
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

let aiNodes = 0;
const AI_NODE_LIMIT = 400000; // 节点上限，避免深层搜索卡顿
const AI_DEPTH = { easy: 2, normal: 3, hard: 4 };

function aiChooseMove(board, difficulty) {
  aiNodes = 0;
  const moves = aiAllMoves(board, 'black');
  if (!moves.length) return null;
  const depth = AI_DEPTH[difficulty] || 2;
  const scored = moves.map(m => ({
    move: m,
    score: aiSearch(applyMove(board, m.fr, m.fc, m.tr, m.tc), depth - 1, -Infinity, Infinity, 'red')
  })).sort((a, b) => a.score - b.score); // 黑方最小化红方视角分数
  if (difficulty === 'easy') {
    // 从前三优中随机，降低强度
    const pool = scored.slice(0, Math.min(3, scored.length));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  const best = scored[0].score;
  const top = scored.filter(s => s.score <= best + (difficulty === 'normal' ? 15 : 0));
  return top[Math.floor(Math.random() * top.length)].move;
}
