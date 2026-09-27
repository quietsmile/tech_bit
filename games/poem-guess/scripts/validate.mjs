// 校验：100 题、100 个图片路径、每题 4 选项且唯一、仅一个正确、资源存在、年级分布。
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "data", "questions.js"), "utf8");
const QUESTIONS = (function(){ const window={}; eval(src.replace("window.","globalThis.")); return globalThis.QUESTIONS; })();
const errs = [];
if (QUESTIONS.length !== 100) errs.push(`题目数 ${QUESTIONS.length} ≠ 100`);
const grades = {};
const lines = new Set();
QUESTIONS.forEach((q, i) => {
  grades[q.grade] = (grades[q.grade] || 0) + 1;
  if (!q.image || !/^assets\/[\w-]+\.png$/.test(q.image)) errs.push(`题 ${i + 1} 图片路径异常`);
  if (!existsSync(join(root, q.image))) errs.push(`缺图片: ${q.image}`);
  if (q.options?.length !== 4) errs.push(`题 ${i + 1} 选项数 ≠ 4`);
  else if (new Set(q.options).size !== 4) errs.push(`题 ${i + 1} 选项重复`);
  if (q.options && !q.options.includes(q.correct)) errs.push(`题 ${i + 1} 正确答案不在选项中`);
  if (lines.has(q.correct)) errs.push(`重复正确诗句: ${q.correct}`);
  lines.add(q.correct);
  if (!q.title || !q.author || !q.hint) errs.push(`题 ${i + 1} 缺字段`);
});
console.log(`题目: ${QUESTIONS.length}`);
console.log(`图片路径: ${QUESTIONS.filter(q => /^assets\/[\w-]+\.png$/.test(q.image)).length}`);
console.log("年级分布:", JSON.stringify(grades));
console.log(`已存在图片: ${QUESTIONS.filter(q => existsSync(join(root, q.image))).length}/100`);
if (errs.length) { console.log("\n❌ 问题清单:"); errs.forEach(e => console.log(" -", e)); process.exit(1); }
console.log("\n✅ 全部校验通过");
