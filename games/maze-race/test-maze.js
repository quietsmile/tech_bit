// 迷宫连通性自动测试：node test-maze.js
'use strict';
const { generateMaze, isReachable, LEVELS } = require('./game.js');

let pass = 0, fail = 0;
LEVELS.forEach((cfg, li) => {
  for (let t = 0; t < 200; t++) {
    const maze = generateMaze(cfg.cols, cfg.rows);
    const ok = isReachable(maze, 0, 0, cfg.cols - 1, cfg.rows - 1);
    if (ok) pass++; else { fail++; console.error(`第 ${li + 1} 关 第 ${t + 1} 次生成不连通`); }
  }
});
console.log(`连通性测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
