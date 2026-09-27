/* 国际象棋规则引擎（纯数据与逻辑，无 DOM）
 * 棋盘 8×8：r=0 顶行（黑方底线），r=7 底行（白方底线）。
 * 棋子 { side:'w'|'b', type:'k'|'q'|'r'|'b'|'n'|'p' }
 * 局面 { board, ep, rights }：ep=吃过路兵目标格，rights=王车易位权利
 */
const ROWS = 8, COLS = 8;

function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

function initialPosition() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  back.forEach((t, c) => {
    board[0][c] = { side: 'b', type: t };
    board[7][c] = { side: 'w', type: t };
  });
  for (let c = 0; c < 8; c++) {
    board[1][c] = { side: 'b', type: 'p' };
    board[6][c] = { side: 'w', type: 'p' };
  }
  return { board, ep: null, rights: { wK: true, wQ: true, bK: true, bQ: true } };
}

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];

/* 某格是否被 bySide 攻击（不含吃过路兵；用于将军/易位判定） */
function squareAttacked(pos, r, c, bySide) {
  const board = pos.board;
  // 兵
  const pr = bySide === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const pc = c + dc;
    if (inBoard(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.side === bySide && p.type === 'p') return true;
    }
  }
  // 马
  for (const [dr, dc] of KNIGHT) {
    const nr = r + dr, nc = c + dc;
    if (inBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.side === bySide && p.type === 'n') return true;
    }
  }
  // 王
  for (const [dr, dc] of [...ORTHO, ...DIAG]) {
    const nr = r + dr, nc = c + dc;
    if (inBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.side === bySide && p.type === 'k') return true;
    }
  }
  // 直线：车/后
  for (const [dr, dc] of ORTHO) {
    let nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.side === bySide && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // 斜线：象/后
  for (const [dr, dc] of DIAG) {
    let nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.side === bySide && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return false;
}

function findKing(pos, side) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = pos.board[r][c];
      if (p && p.side === side && p.type === 'k') return [r, c];
    }
  return null;
}

function isInCheck(pos, side) {
  const k = findKing(pos, side);
  if (!k) return true;
  const other = side === 'w' ? 'b' : 'w';
  return squareAttacked(pos, k[0], k[1], other);
}

/* 伪合法走法（不含易位；含吃过路兵） */
function pseudoMoves(pos, r, c) {
  const p = pos.board[r][c];
  if (!p) return [];
  const out = [];
  const board = pos.board;
  const push = (rr, cc) => {
    if (!inBoard(rr, cc)) return false;
    const t = board[rr][cc];
    if (!t) { out.push([rr, cc]); return true; }
    if (t.side !== p.side) out.push([rr, cc]);
    return false;
  };
  const slide = (dirs) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (push(rr, cc)) { rr += dr; cc += dc; }
    }
  };
  switch (p.type) {
    case 'r': slide(ORTHO); break;
    case 'b': slide(DIAG); break;
    case 'q': slide(ORTHO); slide(DIAG); break;
    case 'n':
      for (const [dr, dc] of KNIGHT) push(r + dr, c + dc);
      break;
    case 'k':
      for (const [dr, dc] of [...ORTHO, ...DIAG]) push(r + dr, c + dc);
      break;
    case 'p': {
      const dir = p.side === 'w' ? -1 : 1;
      const start = p.side === 'w' ? 6 : 1;
      const last = p.side === 'w' ? 0 : 7;
      if (inBoard(r + dir, c) && !board[r + dir][c]) {
        out.push([r + dir, c]);
        if (r === start && !board[r + 2 * dir][c]) out.push([r + 2 * dir, c]);
      }
      for (const dc of [-1, 1]) {
        const rr = r + dir, cc = c + dc;
        if (!inBoard(rr, cc)) continue;
        const t = board[rr][cc];
        if (t && t.side !== p.side) out.push([rr, cc]);
        else if (pos.ep && pos.ep[0] === rr && pos.ep[1] === cc) out.push([rr, cc]); // 吃过路兵
      }
      void last;
      break;
    }
  }
  return out;
}

/* 易位走法（含路径/当前被将检查） */
function castlingMoves(pos, side) {
  const out = [];
  const r = side === 'w' ? 7 : 0;
  const k = pos.board[r][4];
  if (!k || k.type !== 'k' || k.side !== side) return out;
  if (squareAttacked(pos, r, 4, side === 'w' ? 'b' : 'w')) return out; // 正被将军
  const other = side === 'w' ? 'b' : 'w';
  // 王翼
  if (pos.rights[side + 'K']) {
    const rook = pos.board[r][7];
    if (rook && rook.type === 'r' && rook.side === side &&
        !pos.board[r][5] && !pos.board[r][6] &&
        !squareAttacked(pos, r, 5, other) && !squareAttacked(pos, r, 6, other)) {
      out.push([r, 6]);
    }
  }
  // 后翼
  if (pos.rights[side + 'Q']) {
    const rook = pos.board[r][0];
    if (rook && rook.type === 'r' && rook.side === side &&
        !pos.board[r][1] && !pos.board[r][2] && !pos.board[r][3] &&
        !squareAttacked(pos, r, 3, other) && !squareAttacked(pos, r, 2, other)) {
      out.push([r, 2]);
    }
  }
  return out;
}

/* 走子并返回新局面：处理升变（自动升后）、吃过路兵、易位移车、权利维护 */
function applyMove(pos, fr, fc, tr, tc) {
  const board = pos.board.map(row => row.slice());
  const rights = Object.assign({}, pos.rights);
  const p = board[fr][fc];
  let ep = null;

  board[fr][fc] = null;
  // 吃过路兵：被吃兵在出发行
  if (p.type === 'p' && fc !== tc && !board[tr][tc]) {
    board[fr][tc] = null;
  }
  // 易位：王横移两格时顺便移车
  if (p.type === 'k' && Math.abs(tc - fc) === 2) {
    if (tc === 6) { board[tr][5] = board[tr][7]; board[tr][7] = null; }
    else { board[tr][3] = board[tr][0]; board[tr][0] = null; }
  }
  // 升变：到底线自动升后
  if (p.type === 'p' && (tr === 0 || tr === 7)) {
    board[tr][tc] = { side: p.side, type: 'q' };
  } else {
    board[tr][tc] = p;
  }
  // 双步兵 → 吃过路兵目标格
  if (p.type === 'p' && Math.abs(tr - fr) === 2) {
    ep = [(fr + tr) / 2, fc];
  }
  // 权利维护
  if (p.type === 'k') { rights[sideK(p.side)] = false; rights[sideQ(p.side)] = false; }
  const corners = [[7, 0, 'wQ'], [7, 7, 'wK'], [0, 0, 'bQ'], [0, 7, 'bK']];
  for (const [cr, cc, key] of corners) {
    if (cr === fr && cc === fc) rights[key] = false;
    if (cr === tr && cc === tc) rights[key] = false;
  }
  return { board, ep, rights };
}
function sideK(side) { return side + 'K'; }
function sideQ(side) { return side + 'Q'; }

/* 完全合法走法（过滤走后被将军 + 附易位） */
function legalMoves(pos, r, c) {
  const p = pos.board[r][c];
  if (!p) return [];
  const out = pseudoMoves(pos, r, c).filter(([tr, tc]) => {
    const np = applyMove(pos, r, c, tr, tc);
    return !isInCheck(np, p.side);
  });
  if (p.type === 'k') {
    for (const [tr, tc] of castlingMoves(pos, p.side)) out.push([tr, tc]);
  }
  return out;
}

function hasAnyLegalMove(pos, side) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = pos.board[r][c];
      if (p && p.side === side && legalMoves(pos, r, c).length) return true;
    }
  return false;
}

function boardText(pos) {
  const CN = {
    w: { k: ' 王', q: ' 后', r: ' 车', b: ' 象', n: ' 马', p: ' 兵' },
    b: { k: ' 黑王', q: ' 黑后', r: ' 黑车', b: ' 黑象', n: ' 黑马', p: ' 黑卒' }
  };
  return pos.board.map((row, r) =>
    (8 - r) + ' ' + row.map(p => p ? CN[p.side][p.type] : ' ·').join(' ')
  ).join('\n');
}

if (typeof module !== 'undefined') module.exports = {
  ROWS, COLS, initialPosition, pseudoMoves, legalMoves, applyMove,
  isInCheck, findKing, hasAnyLegalMove, inBoard, squareAttacked, castlingMoves, boardText
};
