#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""反转盲盒抽奖 - 多人联机游戏服务器 (Python 3.9 标准库)"""
import json
import os
import random
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(HERE, "data.json")
LOCK = threading.RLock()

DEFAULT_PRIZES = [
    {"id": "p1", "name": "贴纸大礼包", "emoji": "🌟", "count": 3},
    {"id": "p2", "name": "卡通橡皮盲盒", "emoji": "🧽", "count": 3},
    {"id": "p3", "name": "卡牌包", "emoji": "🃏", "count": 2},
    {"id": "p4", "name": "可爱笔记本", "emoji": "📓", "count": 2},
    {"id": "p5", "name": "毛绒挂件", "emoji": "🧸", "count": 2},
    {"id": "p6", "name": "彩笔套装", "emoji": "🖍️", "count": 2},
    {"id": "p7", "name": "免作业券", "emoji": "🎟️", "count": 1},
    {"id": "p8", "name": "神秘棒棒糖", "emoji": "🍭", "count": 3},
]


def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"rooms": {}}


def save_data(data):
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


class Room:
    @staticmethod
    def new_room():
        return {
            "code": Room.gen_code(),
            "host_token": secrets.token_hex(8),
            "players": {},        # id -> {id, name, emoji, prizes: []}
            "prizes": [dict(p) for p in DEFAULT_PRIZES],
            "history": [],        # {player, prize, event, ts}
            "phase": "lobby",     # lobby / drawing / done
            "drawing": None,
            "updated": time.time(),
            "round": 0,
        }

    @staticmethod
    def gen_code():
        return "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=4))


REVERSALS = [
    {"key": "evolve", "title": "🎁 奖品进化！"},
    {"key": "double", "title": "🎉 双倍惊喜！"},
    {"key": "egg", "title": "🥚 隐藏彩蛋！"},
    {"key": "comfort", "title": "🌈 全民安慰奖！"},
    {"key": "transfer", "title": "🔄 幸运大反转！"},
]


def do_draw(room, player_id):
    """执行一次抽奖，返回 drawing 状态对象"""
    prizes = [p for p in room["prizes"] if p["count"] > 0]
    if not prizes:
        return None
    total = sum(p["count"] for p in prizes)
    r = random.uniform(0, total)
    acc = 0
    chosen = prizes[-1]
    for p in prizes:
        acc += p["count"]
        if r <= acc:
            chosen = p
            break
    event = random.choice(REVERSALS)
    player = room["players"][player_id]

    final = chosen
    extra = ""
    ev = event["key"]
    if ev == "evolve":
        better = [p for p in prizes if p is not chosen and p["count"] > 0]
        if better:
            final = random.choice(better)
        extra = "%s 突然发光进化成了「%s」！哇！" % (chosen["name"], final["name"])
    elif ev == "double":
        extra = "宇宙说：来都来了，直接双倍快乐！"
    elif ev == "egg":
        extra = "盒子里还藏着一张神秘小纸条：你今天超棒！"
    elif ev == "comfort":
        extra = "没抽到的同学也获得一个精神抱抱 🤗"
    elif ev == "transfer":
        other = [p for p in prizes if p is not chosen]
        if other and random.random() < 0.5:
            final = random.choice(other)
            extra = "命运之手一挥，换成了「%s」！" % final["name"]
        else:
            extra = "命运之手想换，但是金光锁住了奖品，就它了！"

    drawing = {
        "player_id": player_id,
        "player_name": player["name"],
        "stage": "wrap",
        "wrap_emoji": random.choice(["📦", "🎁", "🎈", "🛍️", "🪄"]),
        "wrap_text": random.choice([
            "听！盒子里有史前巨兽在打呼噜……",
            "警告：本盒子可能会笑出声！",
            "X光显示：里面有一只会发光的……什么？！",
            "快递小哥说：这个盒子在车上自己转了三圈！",
        ]),
        "event": event,
        "prize": final,
        "extra": extra,
        "start_ts": time.time(),
    }
    room["phase"] = "drawing"
    room["drawing"] = drawing
    room["updated"] = time.time()
    return drawing


def finalize_draw(room):
    d = room["drawing"]
    if not d or d.get("stage") != "wrap":
        return
    prize = d["prize"]
    player = room["players"].get(d["player_id"])
    if player and prize:
        player["prizes"].append(prize["name"])
        prize["count"] = max(0, prize["count"] - 1)
    room["history"].append({
        "player": d["player_name"],
        "prize": prize["name"] if prize else "(奖品已空)",
        "event": d["event"]["title"],
        "ts": time.time(),
    })
    d["stage"] = "done"
    room["phase"] = "done"
    room["updated"] = time.time()


class Handler(BaseHTTPRequestHandler):
    server_version = "PrizeLottery/1.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, obj=None, content_type="application/json"):
        if obj is None:
            body = b""
        elif content_type == "application/json":
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        else:
            body = obj
        self.send_response(code)
        self.send_header("Content-Type", content_type + ("; charset=utf-8" if "text" in content_type or content_type == "application/json" else ""))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json_body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        if n == 0:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return {}

    # ---- helpers ----
    def _get_room(self, code):
        with LOCK:
            return DATA.get("rooms", {}).get((code or "").upper())

    # ---- GET ----
    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            return self._serve_file("index.html")
        if path == "/api/state":
            q = dict(p.split("=", 1) for p in self.path.split("?")[1].split("&") if "=" in p) if "?" in self.path else {}
            room = self._get_room(q.get("code"))
            if not room:
                return self._send(404, {"ok": False, "error": "房间不存在"})
            with LOCK:
                pid = q.get("player", "")
                me = room["players"].get(pid)
                drawing = room["drawing"]
                auto = None
                if drawing and drawing["stage"] == "wrap" and time.time() - drawing["start_ts"] > 3.5:
                    finalize_draw(room)
                    save_data(DATA)
                    drawing = room["drawing"]
                state = {
                    "ok": True,
                    "code": room["code"],
                    "phase": room["phase"],
                    "round": room["round"],
                    "players": [{"id": p["id"], "name": p["name"], "emoji": p["emoji"], "prizes": p["prizes"]} for p in room["players"].values()],
                    "prizes": [{"id": p["id"], "name": p["name"], "emoji": p["emoji"], "count": p["count"]} for p in room["prizes"]],
                    "history": room["history"][-30:],
                    "drawing": drawing,
                    "me": me,
                    "now": time.time(),
                }
            return self._send(200, state)
        if path == "/api/ping":
            return self._send(200, {"ok": True})
        return self._send(404, {"ok": False, "error": "not found"})

    def _serve_file(self, name):
        fp = os.path.join(HERE, name)
        if not os.path.exists(fp):
            return self._send(404, "Not Found", "text/plain")
        with open(fp, "rb") as f:
            return self._send(200, f.read(), "text/html")

    # ---- POST ----
    def do_POST(self):
        path = self.path
        body = self._json_body()
        with LOCK:
            rooms = DATA["rooms"]
            if path == "/api/create":
                for _ in range(20):
                    r = Room.new_room()
                    if r["code"] not in rooms:
                        break
                rooms[r["code"]] = r
                save_data(DATA)
                return self._send(200, {"ok": True, "code": r["code"], "host_token": r["host_token"]})

            room = self._get_room(body.get("code"))
            if not room:
                return self._send(404, {"ok": False, "error": "房间不存在"})

            if path == "/api/join":
                name = (body.get("name") or "").strip()[:12]
                if not name:
                    return self._send(400, {"ok": False, "error": "请输入昵称"})
                for p in room["players"].values():
                    if p["name"] == name:
                        return self._send(200, {"ok": True, "player_id": p["id"], "rejoin": True})
                emojis = ["🐱", "🐶", "🐰", "🦊", "🐼", "🐸", "🦄", "🐙", "🐧", "🦁", "🐵", "🐨"]
                pid = secrets.token_hex(6)
                room["players"][pid] = {
                    "id": pid, "name": name,
                    "emoji": emojis[len(room["players"]) % len(emojis)],
                    "prizes": [],
                }
                room["updated"] = time.time()
                save_data(DATA)
                return self._send(200, {"ok": True, "player_id": pid})

            if path == "/api/draw":
                pid = body.get("player_id", "")
                if pid not in room["players"]:
                    return self._send(403, {"ok": False, "error": "请先加入房间"})
                if room["phase"] == "drawing":
                    return self._send(200, {"ok": True, "busy": True})
                d = do_draw(room, pid)
                if not d:
                    return self._send(400, {"ok": False, "error": "奖池空啦！"})
                save_data(DATA)
                return self._send(200, {"ok": True})

            if path in ("/api/add_prize", "/api/import_pool", "/api/reset", "/api/remove_prize"):
                if body.get("host_token") != room["host_token"]:
                    return self._send(403, {"ok": False, "error": "只有房主可以操作"})
                if path == "/api/add_prize":
                    name = (body.get("name") or "").strip()[:20]
                    if not name:
                        return self._send(400, {"ok": False, "error": "请输入奖品名"})
                    room["prizes"].append({
                        "id": secrets.token_hex(4),
                        "name": name,
                        "emoji": (body.get("emoji") or "🎁").strip()[:4] or "🎁",
                        "count": max(1, min(99, int(body.get("count") or 1))),
                    })
                elif path == "/api/import_pool":
                    text = body.get("text") or ""
                    n = 0
                    for line in text.splitlines():
                        line = line.strip()
                        if not line:
                            continue
                        m = re.match(r"^(.*?)[\s×x*X*]*(\d+)$", line)
                        if m and m.group(1).strip():
                            name = m.group(1).strip()
                            cnt = int(m.group(2))
                        else:
                            name = line
                            cnt = 1
                        room["prizes"].append({"id": secrets.token_hex(4), "name": name[:20], "emoji": "🎁", "count": max(1, min(99, cnt))})
                        n += 1
                    if n == 0:
                        return self._send(400, {"ok": False, "error": "没有识别到奖品"})
                elif path == "/api/reset":
                    room["players"] = {}
                    room["history"] = []
                    room["prizes"] = [dict(p) for p in DEFAULT_PRIZES]
                    room["phase"] = "lobby"
                    room["drawing"] = None
                    room["round"] += 1
                room["updated"] = time.time()
                save_data(DATA)
                return self._send(200, {"ok": True})

        return self._send(404, {"ok": False, "error": "not found"})


DATA = load_data()


def main():
    port = int(os.environ.get("PORT", 8300))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("🎁 反转盲盒抽奖已启动: http://0.0.0.0:%d" % port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()


if __name__ == "__main__":
    main()
