#!/bin/bash
# 用 codex CLI 生成找不同游戏的图片资产
# 用法: bash scripts/generate-images.sh
# 前提: 已安装 codex CLI 并已登录 (codex login)
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$DIR/assets"
mkdir -p "$ASSETS"

PROMPT='请在 '"$ASSETS"'/ 目录下生成4组SVG图片文件（共8个），每组原图和修改图有且只有3处明显差异。卡通风格，800x600，适合小学生。文件名格式 level{1-4}-a.svg（原图）和 level{1-4}-b.svg（修改图）。直接创建文件。'

echo "正在调用 codex CLI 生成图片..."
codex exec --dangerously-bypass-approvals-and-sandbox "$PROMPT"
echo "完成！请检查 $ASSETS 目录。"
echo "生成后请更新 game.js 中的 LEVELS 数组，用 img 标签替代内嵌 SVG。"
