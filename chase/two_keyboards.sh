#!/usr/bin/env bash
# 两块蓝牙键盘、四人同屏玩 CHASE：按“设备”重映射按键。
#
# 背景：同一台电脑接多块键盘时，浏览器只拿得到合并后的一路按键事件，
# 分不出按键来自哪块键盘。macOS 自带的 hidutil 可以按 vendor/product
# 精确匹配某一块键盘，把它的按键改写成别的键码 —— 于是两块键盘可以用
# 同一套 WASD / IJKL 手感，只是落到的键码不同。
#
# 约定：
#   苹果键盘（内置或 Magic Keyboard，vendor 0x5ac）= 1 号键盘 → 玩家 1、2
#       W A S D  → 玩家1      I J K L → 玩家2
#   Logitech 键盘（K380 / Pebble K380s，vendor 0x46d）= 2 号键盘 → 玩家 3、4
#       W A S D  → F13 F14 F15 F16 → 玩家3
#       I J K L  → F17 F18 F19 F20 → 玩家4
#
# 用法：
#   ./two_keyboards.sh --list      # 列出当前插着的 Logitech 键盘
#   ./two_keyboards.sh --status    # 看当前映射
#   sudo ./two_keyboards.sh --on   # 开启重映射（需要管理员密码）
#   sudo ./two_keyboards.sh --off  # 复原
#
# 注意：重映射在“设备断开/重连或重启”后会失效，重连键盘后重新跑一次 --on。
set -uo pipefail

VENDOR="0x46d"
PRODUCTS=("0xb342" "0xb377")     # Logitech K380 / Pebble K380s；可自己加型号

# HID usage（键盘页 0x07）：值 = 0x700000000 | usage
HID="0x700000000"
# 输出十进制（合法 JSON 数字；hidutil 的解析器同样接受十进制）
u(){ printf '%d' $(( HID | $1 )); }

# 源 -> 目标：
#   W A S D      -> F13 F14 F15 F16
#   I J K L      -> F17 F18 F19 F20
declare -a SRC=(0x1A 0x04 0x16 0x07  0x0C 0x0D 0x0E 0x0F)
declare -a DST=(0x68 0x69 0x6A 0x6B  0x6C 0x6D 0x6E 0x6F)
NAMES=("W→F13" "A→F14" "S→F15" "D→F16" "I→F17" "J→F18" "K→F19" "L→F20")

build_map_json(){
  local out="" i
  for i in "${!SRC[@]}"; do
    [ -n "$out" ] && out+=","
    out+="{\"HIDKeyboardModifierMappingSrc\":$(u "${SRC[$i]}"),\"HIDKeyboardModifierMappingDst\":$(u "${DST[$i]}")}"
  done
  printf '[%s]' "$out"
}

connected_products(){
  # hidutil list 的列：VendorID ProductID LocationID UsagePage Usage RegistryID ...
  hidutil list 2>/dev/null | awk -v v="$VENDOR" '
    $1==v && $4==1 && $5==6 {print $2}' | sort -u
}

cmd_list(){
  # 注意：bash 允许多字节变量名，所以中文标点前必须用 ${} 界定变量
  echo "当前连接的 Logitech 键盘（vendor ${VENDOR}）："
  hidutil list 2>/dev/null | awk -v v="$VENDOR" '
    $1==v && $4==1 && $5==6 && !seen[$2]++ {printf "  product %s   transport=%s  %s\n", $2, $9, $(NF-2)}'
  echo
  echo "本脚本会处理的产品号：${PRODUCTS[*]}"
}

cmd_status(){
  for p in "${PRODUCTS[@]}"; do
    echo "--- product $p ---"
    hidutil property --matching "{\"VendorID\":$VENDOR,\"ProductID\":$p}" --get UserKeyMapping 2>&1 | head -20
  done
}

apply_to(){
  local p="$1" json="$2"
  hidutil property --matching "{\"VendorID\":$VENDOR,\"ProductID\":$p}" --set "{\"UserKeyMapping\":$json}"
}

cmd_on(){
  # 可以指定只重映射某一款：sudo ./two_keyboards.sh --on 0xb342
  # （如果你两块键盘都是 Logitech，就只映射其中一块，否则两块都会变成玩家3/4）
  local only="${1:-}"
  local live; live="$(connected_products)"
  [ -z "$live" ] && { echo "没找到 Logitech 键盘，先把 K380 / Pebble K380s 连上再跑。"; exit 1; }
  if [ -n "$only" ] && ! printf '%s\n' "$live" | grep -qi "^${only}$"; then
    echo "指定的 product $only 当前没连接。已连接：$(echo $live | tr '\n' ' ')"
    exit 1
  fi
  local map; map="$(build_map_json)"
  for p in $live; do
    [ -n "$only" ] && [ "$p" != "$only" ] && { echo "（按要求跳过 $p）"; continue; }
    local skip=0
    for want in "${PRODUCTS[@]}"; do [ "$p" = "$want" ] && skip=1; done
    [ "$skip" = 0 ] && { echo "跳过未登记的产品 $p（如需支持请加到 PRODUCTS 里）"; continue; }
    echo "→ 给 product $p 应用映射：${NAMES[*]}"
    apply_to "$p" "$map"
  done
  echo
  echo "完成。现在 2 号键盘（Logitech）的 W A S D / I J K L 会变成 F13~F20，"
  echo "游戏里对应玩家 3（WASD→F13~F16）和玩家 4（IJKL→F17~F20）。"
  echo "用完执行：sudo $0 --off"
}

cmd_off(){
  local only="${1:-}"
  for p in "${PRODUCTS[@]}"; do
    [ -n "$only" ] && [ "$p" != "$only" ] && continue
    echo "→ 复原 product $p"
    apply_to "$p" "[]"
  done
  echo "已复原。"
}

ACTION="${1:-}"; ARG="${2:-}"
case "$ACTION" in
  --on|--off)
    if [ "$(id -u)" != "0" ]; then
      echo "⚠️  hidutil 需要管理员权限，请用：sudo $0 $ACTION ${ARG}"
      exit 1
    fi
    [ "$ACTION" = "--on" ] && cmd_on "$ARG" || cmd_off "$ARG"
    ;;
  --status) cmd_status ;;
  --json)   build_map_json; echo ;;
  --list|"") cmd_list ;;
  *) echo "用法: $0 [--list|--status|--json|--on [product]|--off [product]]"; exit 1 ;;
esac
