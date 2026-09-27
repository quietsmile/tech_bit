#!/usr/bin/env python3
"""迷宫竞速在线对战服务（仅 Python 标准库）。"""

import json
import math
import os
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8400"))
CELL = 40
PLAYER_RADIUS = 10
BASE_SPEED = 68
SPEED_STACK_BASE = 128
SPEED_STACK_STEP = 48
SPEED_MAX_STACKS = 6
SPEED_SECONDS = 12
GHOST_SECONDS = 4
SLOW_SECONDS = 6
PICKUP_RADIUS = 26

LEVELS = [
    {"cols": 13, "rows": 9, "items": 9},
    {"cols": 17, "rows": 11, "items": 12},
    {"cols": 21, "rows": 13, "items": 15},
]

ROOMS = {}
LOCK = threading.RLock()


def generate_maze(cols, rows):
    cells = [{"x": x, "y": y, "walls": [True, True, True, True], "visited": False}
             for y in range(rows) for x in range(cols)]

    def at(cx, cy):
        if 0 <= cx < cols and 0 <= cy < rows:
            return cells[cy * cols + cx]
        return None

    stack = [at(0, 0)]
    at(0, 0)["visited"] = True
    dirs = [(0, -1, 0, 2), (1, 0, 1, 3), (0, 1, 2, 0), (-1, 0, 3, 1)]
    while stack:
        cur = stack[-1]
        neighbors = []
        for di, item in enumerate(dirs):
            nxt = at(cur["x"] + item[0], cur["y"] + item[1])
            if nxt and not nxt["visited"]:
                neighbors.append((nxt, di))
        if not neighbors:
            stack.pop()
            continue
        nxt, di = random.choice(neighbors)
        cur["walls"][dirs[di][2]] = False
        nxt["walls"][dirs[di][3]] = False
        nxt["visited"] = True
        stack.append(nxt)
    return {"cols": cols, "rows": rows, "cells": cells}


def can_stay(maze, px, py, ghost=False):
    """Center-point/radius collision against the walls of the current cell."""
    if px < PLAYER_RADIUS or py < PLAYER_RADIUS:
        return False
    if px > maze["cols"] * CELL - PLAYER_RADIUS or py > maze["rows"] * CELL - PLAYER_RADIUS:
        return False
    if ghost:
        return True

    cx = min(maze["cols"] - 1, max(0, int(px // CELL)))
    cy = min(maze["rows"] - 1, max(0, int(py // CELL)))
    walls = maze["cells"][cy * maze["cols"] + cx]["walls"]
    left = cx * CELL
    top = cy * CELL
    right = left + CELL
    bottom = top + CELL
    if walls[0] and py - PLAYER_RADIUS < top:
        return False
    if walls[1] and px + PLAYER_RADIUS > right:
        return False
    if walls[2] and py + PLAYER_RADIUS > bottom:
        return False
    if walls[3] and px - PLAYER_RADIUS < left:
        return False
    return True


def make_player(slot, name):
    emoji = ["🔵", "🔴"][slot]
    return {
        "slot": slot,
        "name": (name or f"玩家{slot + 1}").strip()[:12],
        "emoji": emoji,
        "color": "#3b82f6" if slot == 0 else "#ef4444",
        "px": CELL / 2,
        "py": CELL / 2,
        "score": 0,
        "kills_wins": 0,
        "speed_stacks": 0,
        "speed_until": 0,
        "ghost_until": 0,
        "slowed_until": 0,
        "finished": False,
        "finish_time": 0,
        "input": [False, False, False, False],
        "collected_items": set(),
    }


def make_item(x, y):
    kind = random.choices(["speed", "ghost", "slow", "coin"], weights=[35, 18, 17, 30], k=1)[0]
    return {"id": f"{x}_{y}_{kind}", "x": x, "y": y, "kind": kind}


def start_level(room, level):
    cfg = LEVELS[level]
    room["level"] = level
    room["maze"] = generate_maze(cfg["cols"], cfg["rows"])
    room["items"] = []
    used = {(0, 0), (cfg["cols"] - 1, cfg["rows"] - 1)}
    while len(room["items"]) < cfg["items"]:
        x, y = random.randrange(cfg["cols"]), random.randrange(cfg["rows"])
        if (x, y) in used:
            continue
        used.add((x, y))
        room["items"].append(make_item(x, y))

    for player in room["players"].values():
        player.update({
            "px": CELL / 2,
            "py": CELL / 2,
            "finished": False,
            "finish_time": 0,
            "speed_stacks": 0,
            "speed_until": 0,
            "ghost_until": 0,
            "slowed_until": 0,
            "input": [False, False, False, False],
            "collected_items": set(),
        })
    room["phase"] = "countdown"
    room["start_at"] = time.time() + 3.2
    room["level_started"] = 0
    room["level_elapsed"] = 0
    room["updated"] = time.time()


def tick_room(room):
    now = time.time()
    if room["phase"] == "countdown":
        if now >= room["start_at"]:
            room["phase"] = "racing"
            room["level_started"] = now
        return

    if room["phase"] != "racing":
        return

    room["level_elapsed"] = now - room["level_started"]
    for player in room["players"].values():
        if player["finished"]:
            continue
        if player["speed_until"] and now >= player["speed_until"]:
            player["speed_until"] = 0
            player["speed_stacks"] = 0

        inp = player["input"]
        dx = (1 if inp[1] else 0) - (1 if inp[3] else 0)
        dy = (1 if inp[2] else 0) - (1 if inp[0] else 0)
        length = math.hypot(dx, dy)
        if length:
            dx /= length
            dy /= length

        if player["speed_stacks"]:
            speed = SPEED_STACK_BASE + SPEED_STACK_STEP * (player["speed_stacks"] - 1)
        else:
            speed = BASE_SPEED
        if now < player["slowed_until"]:
            speed *= 0.55

        ghost = now < player["ghost_until"]
        nx = player["px"] + dx * speed * 0.016
        ny = player["py"] + dy * speed * 0.016
        if can_stay(room["maze"], nx, player["py"], ghost):
            player["px"] = nx
        if can_stay(room["maze"], player["px"], ny, ghost):
            player["py"] = ny

        for item in room["items"][:]:
            if item["id"] in player["collected_items"]:
                continue
            if math.hypot(player["px"] - item["x"] * CELL - CELL / 2,
                          player["py"] - item["y"] * CELL - CELL / 2) <= PICKUP_RADIUS:
                player["collected_items"].add(item["id"])
                if item["kind"] == "coin":
                    player["score"] += 10
                elif item["kind"] == "speed":
                    if now < player["speed_until"]:
                        player["speed_stacks"] = min(SPEED_MAX_STACKS, player["speed_stacks"] + 1)
                        player["speed_until"] = max(now, player["speed_until"]) + SPEED_SECONDS
                    else:
                        player["speed_stacks"] = 1
                        player["speed_until"] = now + SPEED_SECONDS
                elif item["kind"] == "ghost":
                    player["ghost_until"] = max(now, player["ghost_until"]) + GHOST_SECONDS
                elif item["kind"] == "slow":
                    player["slowed_until"] = max(now, player["slowed_until"]) + SLOW_SECONDS

        cx = int(player["px"] // CELL)
        cy = int(player["py"] // CELL)
        if cx == LEVELS[room["level"]]["cols"] - 1 and cy == LEVELS[room["level"]]["rows"] - 1:
            player["finished"] = True
            player["finish_time"] = room["level_elapsed"]
            player["score"] += 50

    if room["players"] and all(p["finished"] for p in room["players"].values()):
        room["phase"] = "level_done"


def public_player(player, now):
    return {
        "slot": player["slot"],
        "name": player["name"],
        "emoji": player["emoji"],
        "color": player["color"],
        "px": round(player["px"], 2),
        "py": round(player["py"], 2),
        "score": player["score"],
        "speed_stacks": player["speed_stacks"],
        "speed_until": round(max(0, player["speed_until"] - now), 2),
        "ghost_until": round(max(0, player["ghost_until"] - now), 2),
        "slowed_until": round(max(0, player["slowed_until"] - now), 2),
        "finished": player["finished"],
        "finish_time": round(player["finish_time"], 3),
    }


def state(room, player_token):
    now = time.time()
    level = LEVELS[room["level"]]
    me = room["players"].get(player_token)
    return {
        "ok": True,
        "code": room["code"],
        "phase": room["phase"],
        "level": room["level"],
        "total_levels": len(LEVELS),
        "countdown": round(max(0, room.get("start_at", 0) - now), 2),
        "elapsed": round(room.get("level_elapsed", 0), 3),
        "world": {"cols": level["cols"], "rows": level["rows"], "cell": CELL},
        "maze": room.get("maze"),
        "items": [item for item in room.get("items", []) if not me or item["id"] not in me["collected_items"]],
        "collected_item_ids": sorted(me["collected_items"]) if me else [],
        "players": [public_player(p, now) for p in room["players"].values()],
        "me": public_player(me, now) if me else None,
        "server_time": now,
    }


def game_loop():
    while True:
        with LOCK:
            for room in list(ROOMS.values()):
                tick_room(room)
        time.sleep(1 / 60)


threading.Thread(target=game_loop, name="maze-race-loop", daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    server_version = "MazeRaceOnline/1.0"

    def log_message(self, fmt, *args):
        return

    def send_json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(raw)

    def read_json(self):
        try:
            size = int(self.headers.get("Content-Length", "0") or 0)
            return json.loads(self.rfile.read(size).decode("utf-8")) if size else {}
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            return self.serve_file("index.html", "text/html; charset=utf-8")
        if parsed.path == "/game.js":
            return self.serve_file("game.js", "text/javascript; charset=utf-8")
        if parsed.path == "/style.css":
            return self.serve_file("style.css", "text/css; charset=utf-8")
        if parsed.path == "/favicon.ico":
            self.send_response(204)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        if parsed.path == "/api/state":
            query = parse_qs(parsed.query)
            code = query.get("code", [""])[0].upper()
            token = query.get("player", [""])[0]
            with LOCK:
                room = ROOMS.get(code)
                if not room:
                    return self.send_json({"ok": False, "error": "房间不存在"}, 404)
                return self.send_json(state(room, token))
        if parsed.path == "/api/ping":
            return self.send_json({"ok": True})
        return self.send_json({"ok": False, "error": "not found"}, 404)

    def serve_file(self, name, content_type):
        try:
            raw = (ROOT / name).read_bytes()
        except OSError:
            return self.send_json({"ok": False, "error": "not found"}, 404)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        path = urlparse(self.path).path
        body = self.read_json()
        code = str(body.get("code", "")).upper()
        token = str(body.get("player", ""))
        with LOCK:
            if path == "/api/create":
                code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=4))
                room = {
                    "code": code,
                    "created": time.time(),
                    "phase": "lobby",
                    "players": {},
                    "level": 0,
                    "maze": None,
                    "items": [],
                    "start_at": 0,
                    "level_started": 0,
                    "level_elapsed": 0,
                }
                name = str(body.get("name", "")).strip()[:12] or "房主"
                player = make_player(0, name)
                token = "p0-" + random.randrange(10 ** 12).__str__()
                player["token"] = token
                room["players"][token] = player
                ROOMS[code] = room
                return self.send_json({"ok": True, "code": code, "player": token, "slot": 0})

            if path == "/api/auto":
                # 单一联机房间：有未满的房间就加入，否则自动新建（玩家无感知）
                target = None
                for c, r in ROOMS.items():
                    if r["phase"] == "lobby" and len(r["players"]) < 6:
                        target = r
                        break
                if not target:
                    code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=4))
                    room = {
                        "code": code, "created": time.time(), "phase": "lobby",
                        "players": {}, "level": 0, "maze": None, "items": [],
                        "start_at": 0, "level_started": 0, "level_elapsed": 0,
                    }
                    ROOMS[code] = room
                else:
                    code = target["code"]
                    room = target
                slot = len(room["players"])
                name = str(body.get("name", "")).strip()[:12] or ("玩家" + str(slot + 1))
                player = make_player(slot, name)
                token = "p" + str(slot) + "-" + str(random.randrange(10 ** 12))
                player["token"] = token
                room["players"][token] = player
                if len(room["players"]) == 6 and room["phase"] == "lobby":
                    start_level(room, 0)
                return self.send_json({"ok": True, "code": code, "player": token, "slot": slot})

            room = ROOMS.get(code)
            if not room:
                return self.send_json({"ok": False, "error": "房间不存在"}, 404)

            if path == "/api/join":
                if len(room["players"]) >= 6:
                    return self.send_json({"ok": False, "error": "房间已满"}, 400)
                name = str(body.get("name", "")).strip()[:12] or "玩家2"
                player = make_player(1, name)
                token = "p1-" + random.randrange(10 ** 12).__str__()
                player["token"] = token
                room["players"][token] = player
                if len(room["players"]) == 6 and room["phase"] == "lobby":
                    start_level(room, 0)
                return self.send_json({"ok": True, "code": code, "player": token, "slot": 1})

            player = room["players"].get(token)
            if not player:
                return self.send_json({"ok": False, "error": "请先加入房间"}, 403)

            if path == "/api/input":
                values = body.get("input")
                if isinstance(values, list) and len(values) == 4:
                    player["input"] = [bool(v) for v in values]
                return self.send_json({"ok": True})

            if path == "/api/start":
                if room["phase"] in ("lobby", "level_done", "finished"):
                    start_level(room, room["level"] if room["phase"] == "level_done" else 0)
                return self.send_json({"ok": True})

            if path == "/api/next":
                if room["phase"] == "level_done":
                    if room["level"] + 1 < len(LEVELS):
                        start_level(room, room["level"] + 1)
                    else:
                        room["phase"] = "finished"
                return self.send_json({"ok": True})

            if path == "/api/restart":
                for player in room["players"].values():
                    player["score"] = 0
                start_level(room, 0)
                return self.send_json({"ok": True})

        return self.send_json({"ok": False, "error": "not found"}, 404)


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    httpd.daemon_threads = True
    print(f"迷宫竞速在线服务: http://0.0.0.0:{PORT}", flush=True)
    httpd.serve_forever()
