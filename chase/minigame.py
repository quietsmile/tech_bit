#!/usr/bin/env python3
"""
最小键盘验证（不做地图，只验证“按键跟着键盘走”）：
  每块键盘两个方块：左半边的 W A S D 控制左边方块，右半边的 方向键 / I J K L 控制右边方块。
  顶部显示桥识别到的键盘，底部显示每块键盘当前按下的键（实时）。

运行：
  ./.venv/bin/python minigame.py
前提：先双击打开同目录的 KBBridge.app（由它拿「输入监控」权限读键盘）。
      本程序只通过 http://127.0.0.1:8765/keyboards 读状态，自己不需要任何权限。
ESC 退出。
"""
import json, urllib.request
import pygame
# 注意：pygame.font / pygame.freetype 的 Python 包装在 Python 3.14 上不可用
# （pygame.sysfont 依赖已经坏掉的 pygame.font），所以直接用底层扩展 _freetype。
from pygame import _freetype as ft

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        try:
            return ft.Font(path, size)
        except Exception:
            continue
    try:
        return ft.Font(None, size)      # 兜底：pygame 自带字体（没有中文字形）
    except Exception:
        return None

BRIDGE_URL = "http://127.0.0.1:8765/keyboards"

ROLES = {
    "left":  {"up": "KeyW", "down": "KeyS", "left": "KeyA", "right": "KeyD"},
    "right": {"up": "ArrowUp", "down": "ArrowDown", "left": "ArrowLeft", "right": "ArrowRight",
              "alt_up": "KeyI", "alt_down": "KeyK", "alt_left": "KeyJ", "alt_right": "KeyL"},
}
COLORS = [(229,84,75), (79,156,249), (63,208,138), (245,195,59),
          (178,120,255), (60,214,220), (255,140,90), (150,190,90)]
SPEED = 260


def read_keyboards():
    """(键盘列表, 错误信息)：列表里每项 {name, vendor, product, keys:[...], reports:N}"""
    try:
        with urllib.request.urlopen(BRIDGE_URL, timeout=0.35) as r:
            return json.loads(r.read().decode()).get("keyboards", []), None
    except Exception as e:
        return [], str(e)


def main():
    pygame.init()
    ft.init()
    pygame.display.set_caption("键盘验证 — 每块键盘两个玩家")
    screen = pygame.display.set_mode((980, 640))
    clock = pygame.time.Clock()
    CJK = ["PingFang SC", "Heiti SC", "Arial Unicode MS", "Hiragino Sans GB"]
    try:
        big = load_font(18)
        small = load_font(14)
    except Exception:
        big = small = None

    def text(s, pos, color=(210,225,240), f=None):
        if f:
            f.render_to(screen, pos, s, color)

    players = []
    running = True
    while running:
        for e in pygame.event.get():
            if e.type == pygame.QUIT or (e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE):
                running = False

        kbs, err = read_keyboards()
        if len(players) != len(kbs) * 2:            # 键盘数量变化就重建方块
            players = []
            for i in range(len(kbs)):
                for j, role in enumerate(("left", "right")):
                    players.append({"kb": i, "role": role,
                                    "x": 150 + i * 300 + j * 100, "y": 300 + j * 120})

        dt = clock.tick(60) / 1000.0
        for p in players:
            if p["kb"] >= len(kbs):
                continue
            keys = set(kbs[p["kb"]]["keys"])
            m = ROLES[p["role"]]
            dx = (1 if m["right"] in keys else 0) - (1 if m["left"] in keys else 0)
            dy = (1 if m["down"] in keys else 0) - (1 if m["up"] in keys else 0)
            if p["role"] == "right":
                if dx == 0:
                    dx = (1 if m["alt_right"] in keys else 0) - (1 if m["alt_left"] in keys else 0)
                if dy == 0:
                    dy = (1 if m["alt_down"] in keys else 0) - (1 if m["alt_up"] in keys else 0)
            p["x"] = max(24, min(956, p["x"] + dx * SPEED * dt))
            p["y"] = max(80, min(620, p["y"] + dy * SPEED * dt))

        # ---- 画面 ----
        screen.fill((13, 20, 29))
        text("键盘验证：每块键盘 = 左方块 WASD / 右方块 方向键(或 IJKL)    ESC 退出", (16, 12), (205,225,240), big)
        if err:
            text("连不上键盘桥：先双击打开 chase/KBBridge.app（它负责读键盘）", (16, 40), (255,120,110), small)
        elif not kbs:
            text("桥在跑，但还没识别到键盘：请在两块键盘上各按一下 W", (16, 40), (255,180,90), small)
        else:
            text("桥识别到 " + "   ".join(f"键盘{i+1}={d['name']}" for i, d in enumerate(kbs)),
                 (16, 40), (120,205,175), small)

        for p in players:
            if p["kb"] >= len(kbs):
                continue
            color = COLORS[(p["kb"] * 2 + (0 if p["role"] == "left" else 1)) % len(COLORS)]
            pygame.draw.rect(screen, color, (p["x"]-18, p["y"]-18, 36, 36), border_radius=9)
            pygame.draw.rect(screen, (250,252,255), (p["x"]-18, p["y"]-18, 36, 36), 1, border_radius=9)
            text(f"键盘{p['kb']+1}-{'左' if p['role']=='left' else '右'}", (p["x"]-30, p["y"]-46), (235,242,248), small)

        # 底部：每块键盘实时按键（自检用）
        for i, d in enumerate(kbs):
            line = f"键盘{i+1} {d['name']}  (报文 {d.get('reports',0)})  按下: {' '.join(d['keys']) if d['keys'] else '(无)'}"
            text(line, (16, 500 + i * 20), (150,175,195), small)

        if not kbs and not err:
            text("提示：先在这三块键盘上随便按一下键，键盘就会被桥识别出来", (16, 560), (140,160,180), small)

        pygame.display.flip()

    pygame.quit()


if __name__ == "__main__":
    main()
