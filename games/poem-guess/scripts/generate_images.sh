#!/usr/bin/env bash
# 断点续跑：从 data/poems.txt 读取清单，只为缺失的 assets/<id>.png 调用本机 codex CLI 生成插画。
# 已存在文件不会被覆盖。单张失败时写入 assets/placeholders/<id>.svg（CSS/SVG 占位兜底）并记录到 scripts/failed.txt。
# 用法: ./scripts/generate_images.sh [并行数，默认 4]
set -u
cd "$(dirname "$0")/.."
JOBS="${1:-2}"
LIST="data/poems.txt"
FAILED="scripts/failed.txt"
: > "$FAILED"
mkdir -p assets/placeholders

gen_one() {
  IFS='|' read -r grade id title author line hint <<< "$1"
  out="assets/${id}.png"
  [ -s "$out" ] && { echo "跳过（已存在）: $out"; return 0; }
  echo "生成: $out 《$title》"
  if codex exec --dangerously-bypass-approvals-and-sandbox -C "$(pwd)" \
      "请使用图片生成能力，生成一张横向儿童卡通插画并保存到 assets/${id}.png。主题：《${title}》（${author}）——“${line}”。画面要表现诗句意境：${hint}。要求色彩明亮、画面简洁、无文字。" >/dev/null 2>&1 && [ -s "$out" ]; then
    echo "✅ 成功: $out"
  else
    echo "❌ 失败: 《$title》 -> $out"
    cat > "assets/placeholders/${id}.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="100%" height="100%" fill="#ffe9b3"/><text x="50%" y="50%" text-anchor="middle" font-size="28" fill="#8a6d3b">《${title}》插画生成中…</text></svg>
SVG
    echo "$id|$title" >> "$FAILED"
  fi
}
export -f gen_one
export FAILED

grep -v '^$' "$LIST" | xargs -P "$JOBS" -I{} bash -c 'gen_one "$@"' _ {}

echo ""
echo "生成完成：成功 $(ls assets/*.png 2>/dev/null | wc -l | tr -d ' ') 张；失败 $(wc -l < "$FAILED" | tr -d ' ') 张（清单: $FAILED，占位图: assets/placeholders/）"
[ -s "$FAILED" ] && exit 1
echo "✅ 100 张插画全部就绪"
