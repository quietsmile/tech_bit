/* 中国象棋规则引擎（纯数据与逻辑，无 DOM） */
const ROWS = 10, COLS = 9;

function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function inPalace(r, c, side) {
  if (c < 3 || c > 5) return false;
  return side === 'red' ? r >= 7 : r >= 0 && r <= 2;
}
function sameSide(a, b) { return a && b && a.side === b.side; }

/* 初始局面：board[r][c] 为 null 或 {side:'red'|'black', type} */
function initialBoard() {
  const board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  const back = ['chariot', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'chariot'];
  back.forEach((t, c) => { board[0][c] = {side:'black', type:t}; board[9][c] = {side:'red', type:t}; });
  [1,7].forEach(c => { board[2][c] = {side:'black', type:'cannon'}; board[7][c] = {side:'red', type:'cannon'}; });
  for (let c = 0; c < 9; c += 2) { board[3][c] = {side:'black', type:'pawn'}; board[6][c] = {side:'red', type:'pawn'}; }
  return board;
}

/* 伪合法走法（不考虑走后被将军，将帅照面在 isAttacked 中处理） */
function pseudoMoves(board, r, c) {
  const p = board[r][c];
  if (!p) return [];
  const out = [];
  const push = (rr, cc) => {
    if (!inBoard(rr, cc)) return false;
    const t = board[rr][cc];
    if (!t) { out.push([rr, cc]); return true; }      // 可继续
    if (!sameSide(p, t)) out.push([rr, cc]);          // 吃子即止
    return false;
  };

  switch (p.type) {
    case 'chariot':
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        let rr = r + dr, cc = c + dc;
        while (push(rr, cc)) { rr += dr; cc += dc; }
      }
      break;
    case 'cannon': {
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        let rr = r + dr, cc = c + dc, jumped = false;
        while (inBoard(rr, cc)) {
          const t = board[rr][cc];
          if (!jumped) {
            if (!t) out.push([rr, cc]); else jumped = true;
          } else if (t) {
            if (t.side !== p.side) out.push([rr, cc]);
            break;
          }
          rr += dr; cc += dc;
        }
      }
      break;
    }
    case 'horse':
      for (const [dr, dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
        const legR = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
        const legC = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
        if (inBoard(legR, legC) && board[legR][legC]) continue; // 蹩马腿
        push(r + dr, c + dc);
      }
      break;
    case 'elephant': {
      const drs = [2,2,-2,-2], dcs = [2,-2,2,-2];
      for (let i = 0; i < 4; i++) {
        const rr = r + drs[i], cc = c + dcs[i];
        const eyeR = r + drs[i] / 2, eyeC = c + dcs[i] / 2;
        if (!inBoard(rr, cc) || board[eyeR][eyeC]) continue; // 塞象眼
        const crossed = (rr <= 4) !== (r <= 4);
        if (p.side === 'red' && rr < 5) continue;  // 红不能过河
        if (p.side === 'black' && rr > 4) continue;
        void crossed;
        push(rr, cc);
      }
      break;
    }
    case 'advisor':
      for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const rr = r + dr, cc = c + dc;
        if (inPalace(rr, cc, p.side)) push(rr, cc);
      }
      break;
    case 'general':
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const rr = r + dr, cc = c + dc;
        if (inPalace(rr, cc, p.side)) push(rr, cc);
      }
      break;
    case 'pawn': {
      const fwd = p.side === 'red' ? -1 : 1;
      push(r + fwd, c);
      const crossed = p.side === 'red' ? r <= 4 : r >= 5;
      if (crossed) { push(r, c - 1); push(r, c + 1); }
      break;
    }
  }
  return out;
}

function findGeneral(board, side) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.type === 'general') return [r, c];
    }
  return null;
}

/* 指定方将军是否正被攻击（含将帅照面：对方"将"视为可攻击本方将） */
function isAttacked(board, side) {
  const gpos = findGeneral(board, side);
  if (!gpos) return true; // 无将视为被攻击
  const [gr, gc] = gpos;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || p.side === side) continue;
      if (pseudoMoves(board, r, c).some(([mr, mc]) => mr === gr && mc === gc)) return true;
    }
  // 照面：两将同列且中间无子
  const og = findGeneral(board, side === 'red' ? 'black' : 'red');
  if (og && og[1] === gc) {
    let clear = true;
    for (let r = Math.min(gr, og[0]) + 1; r < Math.max(gr, og[0]); r++)
      if (board[r][gc]) { clear = false; break; }
    if (clear) return true;
  }
  return false;
}

/* 走一步并返回新局面（不修改原局面） */
function applyMove(board, fr, fc, tr, tc) {
  const nb = board.map(row => row.slice());
  nb[tr][tc] = nb[fr][fc];
  nb[fr][fc] = null;
  return nb;
}

/* 完全合法走法 */
function legalMoves(board, r, c) {
  const p = board[r][c];
  if (!p) return [];
  return pseudoMoves(board, r, c).filter(([tr, tc]) => {
    const nb = applyMove(board, r, c, tr, tc);
    return !isAttacked(nb, p.side);
  });
}

/* side 是否无路可走（被将死/困毙） */
function hasAnyLegalMove(board, side) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] && board[r][c].side === side)
        if (legalMoves(board, r, c).length) return true;
  return false;
}

function boardText(board) {
  const CN = {
    red: {chariot:'车', horse:'马', elephant:'相', advisor:'仕', general:'帅', cannon:'炮', pawn:'兵'},
    black: {chariot:'车', horse:'马', elephant:'象', advisor:'士', general:'将', cannon:'炮', pawn:'卒'}
  };
  return board.map((row, r) =>
    (9 - r) + ' ' + row.map(p => p ? CN[p.side][p.type] : '·').join(' ')
  ).join('\n');
}

if (typeof module !== 'undefined') module.exports = {
  ROWS, COLS, initialBoard, pseudoMoves, legalMoves, applyMove,
  isAttacked, findGeneral, hasAnyLegalMove, inPalace, inBoard, boardText
};
