// 校验关卡：可通关（BFS）、起点/终点/宝箱位置合法、无重叠。
// 用法: node scripts/verify_levels.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "data", "levels.js"), "utf8");
const window = {};
eval(src.replace("window.", "window."));
const LEVELS = window.LEVELS;

const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const key = (x, y) => x + "," + y;

const errs = [];
LEVELS.forEach((lv, li) => {
  const tag = `关${li + 1}「${lv.name}」`;
  const walls = new Set(lv.walls.map(([x, y]) => key(x, y)));
  const traps = new Set(lv.traps.map(([x, y]) => key(x, y)));
  const blocked = (x, y) =>
    x < 0 || y < 0 || x >= lv.cols || y >= lv.rows || walls.has(key(x, y)) || traps.has(key(x, y));

  // 结构检查
  const seen = new Set();
  for (const [x, y] of [...lv.walls, ...lv.traps, ...lv.chests]) {
    if (seen.has(key(x, y))) errs.push(`${tag}: 坐标 (${x},${y}) 重叠定义`);
    seen.add(key(x, y));
  }
  if (walls.has(key(lv.start.x, lv.start.y)) || traps.has(key(lv.start.x, lv.start.y)))
    errs.push(`${tag}: 起点 (${lv.start.x},${lv.start.y}) 落在墙/陷阱上`);
  if (walls.has(key(lv.goal.x, lv.goal.y)) || traps.has(key(lv.goal.x, lv.goal.y)))
    errs.push(`${tag}: 终点 (${lv.goal.x},${lv.goal.y}) 落在墙/陷阱上`);
  if (lv.par < 1) errs.push(`${tag}: par 异常`);

  // BFS：基础指令 F/L/R 状态空间搜索（宝箱视为可走）
  const start = { x: lv.start.x, y: lv.start.y, d: lv.start.d };
  const goal = lv.goal;
  const visited = new Set([key(start.x, start.y) + "," + start.d]);
  const queue = [start];
  let goalSteps = -1;
  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === goal.x && cur.y === goal.y) { goalSteps = cur.steps; break; }
    for (const move of ["F", "L", "R"]) {
      let { x, y, d } = cur;
      if (move === "L") d = (d + 3) % 4;
      else if (move === "R") d = (d + 1) % 4;
      else { x += DIRS[d].x; y += DIRS[d].y; }
      if (blocked(x, y)) continue;
      const k = key(x, y) + "," + d;
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push({ x, y, d, steps: (cur.steps ?? 0) + 1 });
    }
  }
  const reachGoal = goalSteps >= 0;
  if (!reachGoal) errs.push(`${tag}: BFS 无法到达终点（关卡无解！）`);

  // 每个宝箱必须可达（BFS 到宝箱相邻或所在格）
  for (const [cx, cy] of lv.chests) {
    const v2 = new Set([key(start.x, start.y) + "," + start.d]);
    const q2 = [start];
    let ok = false;
    while (q2.length && !ok) {
      const cur = q2.shift();
      if (cur.x === cx && cur.y === cy) { ok = true; break; }
      for (const move of ["F", "L", "R"]) {
        let { x, y, d } = cur;
        if (move === "L") d = (d + 3) % 4;
        else if (move === "R") d = (d + 1) % 4;
        else { x += DIRS[d].x; y += DIRS[d].y; }
        if (blocked(x, y)) continue;
        const k = key(x, y) + "," + d;
        if (v2.has(k)) continue;
        v2.add(k);
        q2.push({ x, y, d });
      }
    }
    if (!ok) errs.push(`${tag}: 宝箱 (${cx},${cy}) 不可达`);
  }

  console.log(`${reachGoal ? "✅" : "❌"} ${tag}: tier${lv.tier} ${lv.cols}x${lv.rows} 宝箱×${lv.chests.length} 陷阱×${lv.traps.length} par=${lv.par}${goalSteps >= 0 ? ` BFS最短 ${goalSteps} 步` : ""}`);
});

if (errs.length) {
  console.error("\n❌ 问题清单:");
  errs.forEach((e) => console.error(" -", e));
  process.exit(1);
}
console.log(`\n✅ 全部 ${LEVELS.length} 关校验通过`);
