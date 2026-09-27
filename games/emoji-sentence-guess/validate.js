#!/usr/bin/env node
"use strict";

const bank = require("./questions.js");
const errors = [];

function validateQuestion(question, level, round, index) {
  const id = `第${level}关 第${round}轮 第${index + 1}题`;

  if (!question || !Array.isArray(question.emojis) || question.emojis.length !== level) {
    errors.push(`${id}: Emoji 数量必须是 ${level}`);
  }

  if (!Array.isArray(question.options) || question.options.length !== 4) {
    errors.push(`${id}: 选项必须是 4 个`);
  } else if (new Set(question.options).size !== question.options.length) {
    errors.push(`${id}: 选项不能重复`);
  }

  if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) {
    errors.push(`${id}: answer 无效`);
  } else if (!question.options || question.options[question.answer] === undefined) {
    errors.push(`${id}: answer 超出选项范围`);
  }

  if (typeof question.category !== "string" || !question.category.trim()) {
    errors.push(`${id}: category 无效`);
  }
  if (typeof question.explain !== "string" || !question.explain.trim()) {
    errors.push(`${id}: explain 无效`);
  }
}

for (let level = 1; level <= bank.LEVEL_COUNT; level++) {
  for (let round = 1; round <= 10; round++) {
    let questions;
    try {
      questions = bank.buildLevelQuestions(level);
    } catch (error) {
      errors.push(`第${level}关 第${round}轮生成失败: ${error.message}`);
      continue;
    }

    if (questions.length !== bank.QUESTIONS_PER_LEVEL) {
      errors.push(`第${level}关 第${round}轮: 应生成 ${bank.QUESTIONS_PER_LEVEL} 题，实际 ${questions.length} 题`);
    }
    questions.forEach((question, index) => validateQuestion(question, level, round, index));
  }
}

console.log("Emoji 20 关题库生成校验");
console.log(`关卡：${bank.LEVEL_COUNT} 关`);
console.log(`每关：${bank.QUESTIONS_PER_LEVEL} 题（已随机生成 10 轮校验）`);

if (errors.length) {
  console.error("❌ 校验失败：");
  errors.forEach(error => console.error("  - " + error));
  process.exit(1);
}

console.log("✅ 校验通过！");
