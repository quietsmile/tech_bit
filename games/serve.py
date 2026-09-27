#!/usr/bin/env python3
"""Game center server: static files, reusable challenge arenas, and 找不同."""

import json
import os
import random
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = Path(os.environ.get("CENTER_ROOT", ROOT / "current")).absolute()
PORT = int(os.environ.get("GAMES_PORT", "8100"))

SEAT_NAMES = ("小A", "小B", "小C", "小D", "小E", "小F")
SEAT_COUNT = 6
LEVEL_SECONDS = 60
CLIENT_TIMEOUT = 10
SEAT_REUSE_AFTER = 30

ARENA_ROOMS = {}
ARENA_LOCK = threading.RLock()

# ---- 通用房间中继（贪吃蛇等联机游戏复用）：房主广播状态，客人转发输入 ----
RELAY_ROOMS = {}
RELAY_LOCK = threading.Lock()


def relay_new_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "S" + "".join(random.choice(alphabet) for _ in range(3))
        if code not in RELAY_ROOMS:
            return code


def relay_new_token():
    return "".join(random.choice("0123456789abcdef") for _ in range(16))


def relay_prune():
    now = time.time()
    for code in [c for c, r in RELAY_ROOMS.items() if now - r["last_seen"] > 3600 * 6]:
        RELAY_ROOMS.pop(code, None)


RELAY_GAME_CODES = {"snake": "SNAKE", "td-match": "TDMATCH"}


def relay_touch_guest(room, token, now):
    room.setdefault("guest_seen", {})[token] = now


def relay_active_guests(room, now):
    return [t for t in room["guests"] if now - room.get("guest_seen", {}).get(t, 0) < 60]


def relay_auto(game, token):
    """打开页面自动进入该游戏的唯一房间；第一个玩家成为房主。"""
    code = RELAY_GAME_CODES.get(game, game.upper()[:8])
    now = time.time()
    room = RELAY_ROOMS.get(code)
    if not room:
        room = {
            "game": game, "host_token": "", "host_seen": 0, "guests": [], "guest_seen": {},
            "scores": {}, "state": None, "version": 0, "inputs": [],
            "last_seen": now,
        }
        RELAY_ROOMS[code] = room
    room["last_seen"] = now

    # 重连：token 已是房主
    if token and room["host_token"] == token:
        room["host_seen"] = now
        return {"ok": True, "code": code, "token": token, "role": "host", "seat": 0}
    # 重连：token 已是客人
    if token and token in room["guests"]:
        relay_touch_guest(room, token, now)
        return {"ok": True, "code": code, "token": token,
                "role": "guest", "seat": room["guests"].index(token) + 1}

    # 房主离线超过 90 秒则释放房主位
    if room["host_token"] and now - room.get("host_seen", 0) > 90:
        room["host_token"] = ""

    # 空缺的房主位：第一个没有主人的房间由他接管
    if not room["host_token"]:
        room["host_token"] = relay_new_token()
        room["host_seen"] = now
        return {"ok": True, "code": code, "token": room["host_token"],
                "role": "host", "seat": 0, "new_host_token": room["host_token"]}

    # 房间满员检查（活跃客人 < 5）
    if len(relay_active_guests(room, now)) >= 5:
        return {"ok": False, "error": "房间已满（最多 6 人）"}

    guest_token = relay_new_token()
    room["guests"].append(guest_token)
    relay_touch_guest(room, guest_token, now)
    room["last_seen"] = now
    return {"ok": True, "code": code, "token": guest_token,
            "role": "guest", "seat": len(room["guests"])}


def relay_guest_count(room, now):
    return len(relay_active_guests(room, now))


SPOT_LEVEL_COUNT = 4
SPOT_DIFF_COUNT = 3
SPOT_ROOM_LOCK = threading.RLock()
SPOT_ROOM = {
    "clients": {},
    "targetPlayers": 0,
    "started": False,
    "lastEvent": {"kind": "lobby", "message": "等待第一位玩家选择总人数"},
    "roomRevision": 1,
}


def now():
    return time.time()


def arena_room(game_id):
    return ARENA_ROOMS.setdefault(game_id, {
        "clients": {},
        "targetPlayers": 0,
        "started": False,
        "seed": 0,
        "config": {},
        "lastEvent": {"kind": "lobby", "message": "等待第一位玩家选择总人数"},
        "roomRevision": 1,
    })


def arena_connected(room, at=None):
    at = now() if at is None else at
    return [client for client in room["clients"].values()
            if at - client["lastSeen"] <= CLIENT_TIMEOUT]


def arena_host(room, at=None):
    connected = arena_connected(room, at)
    return min(connected, key=lambda client: client["joinedAt"]) if connected else None


def arena_prune(room, at):
    for token in [token for token, client in room["clients"].items()
                  if at - client["lastSeen"] > SEAT_REUSE_AFTER]:
        del room["clients"][token]
    if room["clients"] and not arena_connected(room, at):
        room["clients"] = {}
        room["targetPlayers"] = 0
        room["started"] = False
        room["lastEvent"] = {"kind": "lobby", "message": "等待第一位玩家选择总人数"}
        room["roomRevision"] += 1


def arena_touch(room, token, at):
    client = room["clients"].get(token)
    if client:
        client["lastSeen"] = at
    return client


def arena_find_client(room, body):
    client_id = body.get("clientId")
    token = body.get("token")
    if isinstance(client_id, str) and client_id in room["clients"]:
        return client_id, room["clients"][client_id]
    if token:
        for client_id, client in room["clients"].items():
            if client.get("token") == token:
                return client_id, client
    return None, None


def arena_start(room, at):
    if not room.get("seed"):
        room["seed"] = random.randint(1, 2_147_483_647)
    room.setdefault("config", {})
    room["started"] = True
    for client in arena_connected(room, at):
        client["score"] = 0
        client["progress"] = {
            "status": "playing", "score": 0, "level": 1,
        }
        client["lastEvent"] = {"kind": "start", "message": "🚀 游戏开始"}
    room["lastEvent"] = {"kind": "start", "message": "🚀 人数已满足，游戏自动开始！"}
    room["roomRevision"] += 1


def arena_public(room, game_id, at, viewer=None):
    host = arena_host(room, at)
    players = []
    for seat in range(SEAT_COUNT):
        client = next((item for item in room["clients"].values() if item["seat"] == seat), None)
        connected = bool(client and at - client["lastSeen"] <= CLIENT_TIMEOUT)
        progress = client.get("progress") if client else {
            "status": "waiting", "score": 0, "level": 0,
        }
        players.append({
            "seat": seat,
            "name": client["name"] if client else SEAT_NAMES[seat],
            "connected": connected,
            "isHost": bool(host and host["seat"] == seat),
            "progress": progress,
        })
    viewer_progress = viewer.get("progress") if viewer else None
    return {
        "gameId": game_id,
        "started": room["started"],
        "seed": room.get("seed", 0),
        "config": room.get("config", {}),
        "targetPlayers": room["targetPlayers"],
        "activeCount": len(arena_connected(room, at)),
        "hostSeat": host["seat"] if host else None,
        "seatNames": SEAT_NAMES,
        "players": players,
        "lastEvent": room["lastEvent"],
        "roomRevision": room["roomRevision"],
        "status": viewer_progress["status"] if viewer_progress else "lobby",
        "level": viewer_progress["level"] if viewer_progress else 0,
        "found": sorted(viewer_progress["found"]) if viewer_progress and isinstance(viewer_progress.get("found"), list) else [],
        "remaining": max(0, viewer_progress.get("nextAt", at) - at) if viewer_progress and viewer_progress.get("nextAt") else 0,
        "score": viewer_progress["score"] if viewer_progress else 0,
    }


def spot_connected(at=None):
    at = now() if at is None else at
    return [client for client in SPOT_ROOM["clients"].values()
            if at - client["lastSeen"] <= CLIENT_TIMEOUT]


def spot_host(at=None):
    connected = spot_connected(at)
    return min(connected, key=lambda client: client["joinedAt"]) if connected else None


def spot_touch(token, at):
    client = SPOT_ROOM["clients"].get(token)
    if client:
        client["lastSeen"] = at
    return client


def spot_prune(at):
    for token in [token for token, client in SPOT_ROOM["clients"].items()
                  if at - client["lastSeen"] > SEAT_REUSE_AFTER]:
        del SPOT_ROOM["clients"][token]
    if SPOT_ROOM["clients"] and not spot_connected(at):
        SPOT_ROOM["clients"] = {}
        SPOT_ROOM["targetPlayers"] = 0
        SPOT_ROOM["started"] = False
        SPOT_ROOM["lastEvent"] = {"kind": "lobby", "message": "等待第一位玩家选择总人数"}
        SPOT_ROOM["roomRevision"] += 1


def spot_new_progress(at):
    return {
        "level": 0,
        "found": set(),
        "score": 0,
        "status": "playing",
        "deadline": at + LEVEL_SECONDS,
        "nextAt": at + LEVEL_SECONDS,
    }


def spot_start(at):
    SPOT_ROOM["started"] = True
    for client in spot_connected(at):
        client["score"] = 0
        client["progress"] = spot_new_progress(at)
    SPOT_ROOM["lastEvent"] = {"kind": "start", "message": "🚀 游戏开始"}
    SPOT_ROOM["roomRevision"] += 1


def spot_tick(client, at):
    progress = client.get("progress")
    if not progress:
        return
    if progress["status"] == "playing" and at >= progress["deadline"]:
        progress["status"] = "levelDone"
        progress["nextAt"] = at + 1.5
        progress["revision"] = SPOT_ROOM["roomRevision"] + 1
    elif progress["status"] == "levelDone" and at >= progress["nextAt"]:
        if progress["level"] < SPOT_LEVEL_COUNT - 1:
            progress["level"] += 1
            progress["found"] = set()
            progress["status"] = "playing"
            progress["deadline"] = at + LEVEL_SECONDS
            progress["nextAt"] = progress["deadline"]
        else:
            progress["status"] = "finished"
        progress["revision"] = SPOT_ROOM["roomRevision"] + 1
    elif progress["status"] == "finished" and at >= progress["nextAt"]:
        progress["status"] = "finishedIdle"
        progress["revision"] = SPOT_ROOM["roomRevision"] + 1


def spot_public(viewer, at):
    host = spot_host(at)
    players = []
    for seat in range(SEAT_COUNT):
        client = next((item for item in SPOT_ROOM["clients"].values() if item["seat"] == seat), None)
        connected = bool(client and at - client["lastSeen"] <= CLIENT_TIMEOUT)
        progress = (client.get("progress") if client else None) or {
            "status": "waiting", "found": [], "level": 0, "score": 0,
        }
        players.append({
            "seat": seat,
            "name": client["name"] if client else SEAT_NAMES[seat],
            "connected": connected,
            "score": progress.get("score", 0),
            "level": progress.get("level", 0) + 1,
            "status": progress.get("status", "waiting"),
            "isHost": bool(host and host["seat"] == seat),
        })
    viewer_progress = (viewer.get("progress") if viewer else None) or {
        "status": "lobby", "found": [], "level": 0, "score": 0,
    }
    return {
        "targetPlayers": SPOT_ROOM["targetPlayers"],
        "started": SPOT_ROOM["started"],
        "activeCount": len(spot_connected(at)),
        "hostSeat": host["seat"] if host else None,
        "seatNames": SEAT_NAMES,
        "players": players,
        "lastEvent": viewer.get("lastEvent") if viewer else SPOT_ROOM["lastEvent"],
        "roomRevision": SPOT_ROOM["roomRevision"],
        "status": viewer_progress.get("status", "lobby"),
        "level": viewer_progress.get("level", 0),
        "found": sorted(viewer_progress.get("found", [])),
        "remaining": max(0, viewer_progress.get("nextAt", at) - at),
        "score": viewer_progress.get("score", 0),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_ROOT), **kwargs)

    def log_message(self, fmt, *args):
        return

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 10_000:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def do_POST(self):
        route = urlparse(self.path).path
        body = self.read_json()
        at = now()

        if route.startswith("/api/relay/"):
            action = route.rstrip("/").split("/")[-1]
            code = str(body.get("code", ""))
            token = str(body.get("token", ""))
            with RELAY_LOCK:
                relay_prune()
                if action == "auto":
                    # 每个游戏一个固定房间：打开页面自动进入（第一个玩家是房主）
                    result = relay_auto(str(body.get("game", "snake"))[:20], token)
                    self.send_json(result)
                    return
                room = RELAY_ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "invalid-room"}, 404)
                    return
                if action == "input":
                    if not token:
                        self.send_json({"ok": False, "error": "invalid-room"}, 403)
                        return
                    room["inputs"].append(body.get("input"))
                    if len(room["inputs"]) > 80:
                        room["inputs"] = room["inputs"][-80:]
                    room["last_seen"] = time.time()
                    self.send_json({"ok": True})
                    return
                if action == "score":
                    if not token:
                        self.send_json({"ok": False, "error": "invalid-room"}, 403)
                        return
                    scores = room.setdefault("scores", {})
                    prev = scores.get(token, {"score": 0})
                    scores[token] = {
                        "name": str(body.get("name", ""))[:12] or "玩家",
                        "score": int(body.get("score", 0) or prev.get("score", 0)),
                        "ts": time.time(),
                    }
                    room["last_seen"] = time.time()
                    self.send_json({"ok": True})
                    return
                # 房主专用动作（state 广播）
                if room["host_token"] != token:
                    self.send_json({"ok": False, "error": "invalid-room"}, 403)
                    return
                if action == "state":
                    room["state"] = body.get("state")
                    room["version"] += 1
                    room["last_seen"] = time.time()
                    self.send_json({"ok": True, "version": room["version"]})
                    return
            self.send_json({"ok": False, "error": "unknown-action"}, 400)
            return

        if route.startswith("/api/arena/"):
            parts = [part for part in route.split("/") if part]
            if len(parts) >= 3 and parts[:2] == ["api", "arena"]:
                game_id = parts[2]
                action = parts[3] if len(parts) > 3 else "state"
                room = arena_room(game_id)
                token = body.get("token")
                client_id = body.get("clientId")
                with ARENA_LOCK:
                    arena_prune(room, at)
                    client = arena_touch(room, token, at)
                    if not client and client_id:
                        client = arena_touch(room, client_id, at)

                    if action == "join":
                        client_id = body.get("clientId")
                        if isinstance(client_id, str) and client_id in room["clients"]:
                            client = arena_touch(room, client_id, at)
                            return self.send_json({
                                "ok": True,
                                "token": client["token"],
                                "clientId": client_id,
                                "seat": client["seat"],
                                "name": client["name"],
                                "state": arena_public(room, game_id, at, client),
                            })

                        connected = arena_connected(room, at)
                        if room["started"] and len(connected) >= room["targetPlayers"]:
                            return self.send_json({"ok": False, "error": "room-full", "message": "房间已满"}, 409)
                        used = {client["seat"] for client in room["clients"].values()}
                        seat = next((seat for seat in range(SEAT_COUNT) if seat not in used), None)
                        if seat is None:
                            return self.send_json({"ok": False, "error": "room-full", "message": "房间已满"}, 409)

                        token = uuid.uuid4().hex
                        client_id = str(body.get("clientId") or uuid.uuid4().hex)
                        name = SEAT_NAMES[seat]
                        client = {
                            "clientId": client_id,
                            "token": token,
                            "seat": seat,
                            "name": name,
                            "joinedAt": at,
                            "lastSeen": at,
                            "progress": {"status": "waiting", "score": 0, "level": 0},
                            "lastEvent": {"kind": "join", "message": f"👋 {name} 已加入"},
                        }
                        room["clients"][client_id] = client
                        connected = arena_connected(room, at)
                        if not room["started"] and room["targetPlayers"] > 0 and len(connected) >= room["targetPlayers"]:
                            arena_start(room, at)
                        room["lastEvent"] = client["lastEvent"]
                        room["roomRevision"] += 1
                        return self.send_json({
                            "ok": True,
                            "token": token,
                            "clientId": client_id,
                            "seat": seat,
                            "name": name,
                            "state": arena_public(room, game_id, at, client),
                        })

                    if not client:
                        return self.send_json({"ok": False, "error": "invalid-token"}, 401)

                    if action == "target":
                        host = arena_host(room, at)
                        if not host or host["clientId"] != client["clientId"]:
                            return self.send_json({"ok": False, "error": "not-host", "message": "只有第一位玩家能设置总人数"}, 403)
                        if room["started"]:
                            return self.send_json({"ok": False, "error": "already-started"}, 409)
                        try:
                            target = int(body.get("targetPlayers"))
                        except (TypeError, ValueError):
                            target = 0
                        if target < 1 or target > SEAT_COUNT:
                            return self.send_json({"ok": False, "error": "bad-target", "message": "总人数必须在 1 到 6 人之间"}, 400)

                        room["targetPlayers"] = target
                        config = body.get("config")
                        room["config"] = config if isinstance(config, dict) else {}
                        if not room.get("seed"):
                            room["seed"] = random.randint(1, 2_147_483_647)
                        connected = arena_connected(room, at)
                        if len(connected) >= target:
                            arena_start(room, at)
                        else:
                            room["lastEvent"] = {"kind": "target", "message": f"目标 {target} 人，当前 {len(connected)} 人"}
                        room["roomRevision"] += 1
                        return self.send_json({"ok": True, "targetPlayers": target,
                                               "state": arena_public(room, game_id, at, client)})

                    if action == "progress":
                        progress = body.get("progress")
                        if not isinstance(progress, dict):
                            return self.send_json({"ok": False, "error": "bad-progress"}, 400)
                        clean = {
                            "status": str(progress.get("status", "playing"))[:24],
                            "score": max(0, int(progress.get("score", 0) or 0)),
                            "level": max(0, int(progress.get("level", 0) or 0)),
                        }
                        if client.get("progress") != clean:
                            client["progress"] = clean
                            room["roomRevision"] += 1
                        return self.send_json({"ok": True, "state": arena_public(room, game_id, at, client)})

                    if action == "rename":
                        name = str(body.get("name", "")).strip()[:16]
                        if not name:
                            return self.send_json({"ok": False, "error": "empty-name", "message": "名字不能为空"}, 400)
                        if any(other is not client and other["name"] == name
                               for other in room["clients"].values()):
                            return self.send_json({"ok": False, "error": "duplicate-name", "message": "名字已被使用"}, 409)
                        old = client["name"]
                        client["name"] = name
                        client["lastEvent"] = {"kind": "rename", "message": f"✏️ 名字已改为 {name}"}
                        room["lastEvent"] = {"kind": "rename", "message": f"✏️ {old} 改名为 {name}"}
                        room["roomRevision"] += 1
                        return self.send_json({"ok": True, "name": name,
                                               "state": arena_public(room, game_id, at, client)})

                    if action == "restart":
                        client["progress"] = {"status": "playing", "score": 0, "level": 1}
                        client["lastEvent"] = {"kind": "restart", "message": "🔄 已重新开始"}
                        return self.send_json({"ok": True, "state": arena_public(room, game_id, at, client)})

                    if action == "state":
                        return self.send_json({"ok": True, "seat": client["seat"], "name": client["name"],
                                               "state": arena_public(room, game_id, at, client)})

        if route == "/api/spot-difference/join":
            with SPOT_ROOM_LOCK:
                spot_prune(at)
                token = body.get("clientId")
                if isinstance(token, str) and token in SPOT_ROOM["clients"]:
                    client = spot_touch(token, at)
                    spot_tick(client, at)
                    return self.send_json({"ok": True, "token": token, "seat": client["seat"],
                                           "name": client["name"], "state": spot_public(client, at)})

                if not spot_connected(at):
                    SPOT_ROOM["clients"] = {}
                    SPOT_ROOM["targetPlayers"] = 0
                    SPOT_ROOM["started"] = False

                used = {client["seat"] for client in SPOT_ROOM["clients"].values()}
                seat = next((seat for seat in range(SEAT_COUNT) if seat not in used), None)
                if seat is None:
                    return self.send_json({"ok": False, "error": "room-full", "message": "联机房已满"}, 409)
                token = uuid.uuid4().hex
                name = SEAT_NAMES[seat]
                client = {"seat": seat, "name": name, "lastSeen": at, "joinedAt": at, "score": 0,
                          "lastEvent": {"kind": "join", "message": f"👋 {name} 已加入"}}
                SPOT_ROOM["clients"][token] = client
                connected = spot_connected(at)
                if not SPOT_ROOM["started"] and SPOT_ROOM["targetPlayers"] > 0 and len(connected) >= SPOT_ROOM["targetPlayers"]:
                    spot_start(at)
                SPOT_ROOM["lastEvent"] = client["lastEvent"]
                SPOT_ROOM["roomRevision"] += 1
                return self.send_json({"ok": True, "token": token, "seat": seat, "name": name,
                                       "state": spot_public(client, at)})

        if route.startswith("/api/spot-difference/"):
            action = route.rsplit("/", 1)[-1]
            token = body.get("token")
            with SPOT_ROOM_LOCK:
                client = spot_touch(token, at)
                if not client:
                    return self.send_json({"ok": False, "error": "invalid-token"}, 401)
                spot_tick(client, at)

                if action == "set-target":
                    host = spot_host(at)
                    if not host or host["seat"] != client["seat"]:
                        return self.send_json({"ok": False, "error": "not-host", "message": "只有第一位玩家能设置总人数"}, 403)
                    if SPOT_ROOM["started"]:
                        return self.send_json({"ok": False, "error": "already-started"}, 409)
                    try:
                        target = int(body.get("targetPlayers"))
                    except (TypeError, ValueError):
                        target = 0
                    if target < 1 or target > SEAT_COUNT:
                        return self.send_json({"ok": False, "error": "bad-target", "message": "总人数必须在 1 到 6 人之间"}, 400)
                    SPOT_ROOM["targetPlayers"] = target
                    if len(spot_connected(at)) >= target:
                        spot_start(at)
                    else:
                        SPOT_ROOM["lastEvent"] = {"kind": "target", "message": f"目标 {target} 人，当前 {len(spot_connected(at))} 人"}
                    SPOT_ROOM["roomRevision"] += 1
                    return self.send_json({"ok": True, "state": spot_public(client, at)})

                if action == "click":
                    progress = client.get("progress")
                    if not progress or progress["status"] != "playing":
                        return self.send_json({"ok": False, "error": "not-playing"}, 409)
                    if int(body.get("level", -1)) != progress["level"]:
                        return self.send_json({"ok": False, "error": "stale-level"}, 409)
                    try:
                        diff_index = int(body.get("diffIndex", -1))
                    except (TypeError, ValueError):
                        diff_index = -1
                    if diff_index < 0 or diff_index >= DIFF_COUNT:
                        return self.send_json({"ok": False, "error": "bad-diff"}, 400)
                    if diff_index in progress["found"]:
                        return self.send_json({"ok": False, "error": "already-found"}, 409)

                    progress["found"].add(diff_index)
                    gained = 10
                    client["score"] += gained
                    progress["score"] = client["score"]
                    if progress["level"] == 1:
                        target = state.targetSeconds
                        error = abs(elapsed - target)
                        value = error
                    else:
                        target = state.fallMs / 1000
                        error = abs(elapsed - target)
                        value = error
                    name = client["name"]
                    result = {
                        "stage": progress["level"],
                        "elapsed": elapsed,
                        "target": target,
                        "error": error,
                        "value": value,
                    }
                    client["score"] += value
                    progress["score"] = client["score"]
                    if len(progress["found"]) == DIFF_COUNT:
                        message = f"🎉 {name} 完成第 {progress['level'] + 1} 关，+{gained} 分"
                    else:
                        message = f"✅ {name} 找到了 {label}，+10 分"

                    client["lastEvent"] = {"kind": "found", "message": message}
                    ROOM["lastEvent"] = {
                        "kind": "race",
                        "message": message,
                        "seat": client["seat"],
                        "name": name,
                    }
                    ROOM["roomRevision"] += 1
                    return self.send_json({
                        "ok": True,
                        "correct": True,
                        "diffIndex": diff_index,
                        "gained": gained,
                        "state": build_state_locked(client, now),
                    })

        if route == "/api/spot-difference/restart":
            token = body.get("token")
            with SPOT_ROOM_LOCK:
                client = spot_touch(token, now)
                if not client:
                    return self.send_json({"ok": False, "error": "invalid-token"}, 401)

                if not ROOM["started"]:
                    return self.send_json({"ok": False, "error": "not-started"}, 409)

                client["score"] = 0
                client["progress"] = new_progress_locked(now)
                client["lastEvent"] = {"kind": "restart", "message": "🔄 你的挑战已重新开始"}
                return self.send_json({
                    "ok": True,
                    "state": build_state_locked(client, now),
                })

        return self.send_json({"ok": False, "error": "not-found"}, 404)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/arena/poem-guess/state":
            query = parse_qs(parsed.query)
            token = query.get("token", [""])[0]
            now = time.time()
            with SPOT_ROOM_LOCK:
                client = spot_touch(token, now)
                if not client:
                    return self.send_json({"ok": False, "error": "invalid-token"}, 401)
                spot_tick(client, now)
                return self.send_json({"ok": True, "seat": client["seat"], "name": client["name"],
                                       "state": spot_public(client, now)})

        if parsed.path == "/healthz":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return

        if parsed.path == "/api/relay/scores":
            query = parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            with RELAY_LOCK:
                room = RELAY_ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "invalid-room"}, 404)
                    return
                scores = sorted(room.get("scores", {}).values(), key=lambda s: -s.get("score", 0))
            self.send_json({"ok": True, "scores": scores})
        if parsed.path == "/api/relay/state":
            query = parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            token = query.get("token", [""])[0]
            now = time.time()
            with RELAY_LOCK:
                room = RELAY_ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "invalid-room"}, 404)
                    return
                room["last_seen"] = now
                if token and room["host_token"] == token:
                    room["host_seen"] = now
                elif token and token in room["guests"]:
                    relay_touch_guest(room, token, now)
                self.send_json({"ok": True, "version": room["version"], "state": room["state"]})
        if parsed.path == "/api/relay/inputs":
            query = parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            token = query.get("token", [""])[0]
            with RELAY_LOCK:
                room = RELAY_ROOMS.get(code)
                if not room or room["host_token"] != token:
                    self.send_json({"ok": False, "error": "invalid-room"}, 403)
                    return
                room["last_seen"] = time.time()
                room["host_seen"] = time.time()
                inputs = room["inputs"]
                room["inputs"] = []
                guest_tokens = list(room["guests"])
            self.send_json({"ok": True, "inputs": inputs, "guests": guest_tokens})

        path = parsed.path
        if path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/games/index.html")
            self.end_headers()
        else:
            super().do_GET()


if __name__ == "__main__":
    print(f"Game center root: {STATIC_ROOT}", flush=True)
    print(f"Game center: http://0.0.0.0:{PORT}/games/index.html", flush=True)
    with ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as server:
        server.daemon_threads = True
        server.serve_forever()
