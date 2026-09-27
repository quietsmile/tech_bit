// 从 data/poems.txt 生成 data/questions.js（100 题，按年级分组，选项唯一、运行时打乱）。
// 用法: node scripts/build_questions.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const poems = readFileSync(join(here, "..", "data", "poems.txt"), "utf8")
  .split("\n").filter(Boolean).map((line) => {
    const [grade, id, title, author, correct, hint] = line.split("|");
    return { grade: +grade, id, title, author, correct, hint };
  });

if (poems.length !== 100) { console.error(`❌ 题目数量 ${poems.length} ≠ 100`); process.exit(1); }
if (new Set(poems.map(p => p.correct)).size !== 100) { console.error("❌ 存在重复诗句"); process.exit(1); }
if (new Set(poems.map(p => p.id)).size !== 100) { console.error("❌ 存在重复文件名"); process.exit(1); }

const questions = poems.map((p, i) => {
  const pool = poems.filter(x => x.id !== p.id).map(x => x.correct);
  // 用确定性轮转从池中取 3 个干扰项（生成期稳定；游戏运行时随机打乱选项）
  const distractors = [1, 2, 3].map(k => pool[(i * 37 + k * 29) % pool.length]);
  if (new Set([p.correct, ...distractors]).size !== 4) { console.error(`❌ 选项不唯一: ${p.title}`); process.exit(1); }
  return {
    grade: p.grade,
    image: `assets/${p.id}.png`,
    title: p.title,
    author: p.author,
    correct: p.correct,
    options: [p.correct, ...distractors],
    hint: p.hint,
  };
});

const js = `// 题目清单（共 ${questions.length} 题，按小学 1–6 年级分组）。
// 清单源文件: data/poems.txt；图片由 scripts/generate_images.sh 生成，缺失时游戏端使用 CSS/SVG 占位图。
// 选项由 game.js 在每次展示时随机打乱，正确答案位置随机。
window.QUESTIONS = ${JSON.stringify(questions, null, 2)};
`;
writeFileSync(join(here, "..", "data", "questions.js"), js);
const byGrade = {};
questions.forEach(q => (byGrade[q.grade] = (byGrade[q.grade] || 0) + 1));
console.log(`✅ 已生成 ${questions.length} 题`, byGrade);
