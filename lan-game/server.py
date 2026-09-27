#!/usr/bin/env python3
"""抓人游戏 — quiz-powered multiplayer browser game with mini-worlds."""

import json
import math
import os
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import quiz


HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8765"))

WORLD_WIDTH = 960
WORLD_HEIGHT = 600
MICRO_WORLD_WIDTH = 560
MICRO_WORLD_HEIGHT = 360
PLAYER_RADIUS = 14
TARGET_COINS = 10
OFFLINE_AFTER = 8.0
RESUME_KEEP_AFTER = 180.0
WORLD_REENTER_COOLDOWN = 3.0

INITIAL_SPEED = 5
MIN_SPEED = 1
MAX_SPEED = 150
PIXELS_PER_SPEED = 5
ESCAPE_TRIGGER_SECONDS = 3.0
GROWTH_PER_COIN = 1.02
TAIL_INITIAL_PLAYER_RATIO = 0.10
TAIL_GROWTH_PER_COIN = 1.04
COIN_VALUES = list(range(1, 11))
POWER_LAW_EXPONENT = 1.35

SKIP_CHANCES = 3
MAX_SMALL_WORLDS = 2
SMALL_WORLD_RATE_PER_SECOND = 0.05
SMALL_WORLD_PORTAL_RADIUS = 24
MICRO_COIN_COUNT = 10

MICRO_TIERS = {
    "low": {
        "label": "低级小世界",
        "short": "低级",
        "direct_max": 2,
        "color": "#4ade80",
        "values": [1, 2, 3, 4, 5, 6],
    },
    "mid": {
        "label": "中级小世界",
        "short": "中级",
        "direct_max": 3,
        "color": "#38bdf8",
        "values": [2, 3, 4, 5, 6, 7, 8],
    },
    "high": {
        "label": "高级小世界",
        "short": "高级",
        "direct_max": 4,
        "color": "#a855f7",
        "values": [3, 4, 5, 6, 7, 8, 9],
    },
    "top": {
        "label": "顶级小世界",
        "short": "顶级",
        "direct_max": 5,
        "color": "#fbbf24",
        "values": [4, 5, 6, 7, 8, 9, 10],
    },
}

ROOT = Path(__file__).resolve().parent
COLORS = ["#38bdf8", "#f472b6", "#facc15", "#4ade80", "#c084fc", "#fb923c"]
COIN_WEIGHTS = [1 / (value ** POWER_LAW_EXPONENT) for value in COIN_VALUES]
random.seed(time.time_ns())

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



def rounded_percentage(value, percent):
    return int(value * percent + 0.5)


def coin_radius(value):
    return 10 + value * 0.9


def player_radius(player):
    return PLAYER_RADIUS * (GROWTH_PER_COIN ** player.get("eaten", 0))


def tail_length(player):
    eaten = player.get("eaten", 0)
    if eaten <= 0:
        return 0.0
    # 尾长只作为成就统计数值，不再绘制拖尾。
    return player_radius(player) * 2 * TAIL_INITIAL_PLAYER_RATIO * (TAIL_GROWTH_PER_COIN ** eaten)


def new_secret():
    return "".join(random.choice("0123456789abcdef") for _ in range(16))


def is_offline(player):
    return player.get("_offline_since") is not None


ACHIEVEMENTS = [
    {"key": "first-light", "icon": "✨", "title": "初现光影", "description": "吃到第 1 个光点"},
    {"key": "tail-half", "icon": "🧵", "title": "半身之影", "description": "尾巴达到身长 50%"},
    {"key": "tail-one", "icon": "👻", "title": "一身之影", "description": "尾巴达到身长 100%"},
    {"key": "tail-double", "icon": "🐾", "title": "双倍影蛇", "description": "尾巴达到身长 200%"},
    {"key": "tail-five", "icon": "🌊", "title": "五倍长影", "description": "尾巴达到身长 500%"},
    {"key": "tail-ten", "icon": "🌟", "title": "十倍光影", "description": "尾巴达到身长 1000%"},
    {"key": "body-double", "icon": "🫧", "title": "两倍体积", "description": "身体达到初始 200%"},
    {"key": "body-quad", "icon": "🪸", "title": "巨影体型", "description": "身体达到初始 400%"},
    {"key": "speed-25", "icon": "🌬️", "title": "轻风疾行", "description": "速度达到 25"},
    {"key": "speed-60", "icon": "🚀", "title": "光速掠影", "description": "速度达到 60"},
    {"key": "speed-100", "icon": "⚡", "title": "百速冲刺", "description": "速度达到 100"},
    {"key": "speed-max", "icon": "👑", "title": "极速之王", "description": "速度达到 150"},
]


ACHIEVEMENT_MAP = {item["key"]: item for item in ACHIEVEMENTS}


def evaluate_achievements_locked(player):
    tail = tail_length(player)
    body = player_radius(player) * 2
    ratio = tail / body if body else 0
    checks = {
        "first-light": player.get("eaten", 0) >= 1,
        "tail-half": ratio >= 0.5,
        "tail-one": ratio >= 1,
        "tail-double": ratio >= 2,
        "tail-five": ratio >= 5,
        "tail-ten": ratio >= 10,
        "body-double": player.get("size", 1) >= 2,
        "body-quad": player.get("size", 1) >= 4,
        "speed-25": player.get("speed", 0) >= 25,
        "speed-60": player.get("speed", 0) >= 60,
        "speed-100": player.get("speed", 0) >= 100,
        "speed-max": player.get("speed", 0) >= MAX_SPEED,
    }
    unlocked = []
    for key, reached in checks.items():
        if reached and key not in player["_achievement_keys"]:
            spec = ACHIEVEMENT_MAP[key]
            payload = {
                **spec,
                "unlockedAt": time.time(),
            }
            player["_achievement_keys"].add(key)
            player["achievements"].append(payload)
            player["_achievement_toasts"].append(payload)
            unlocked.append(payload)
    return unlocked


def update_coin_position(coin, all_coins, players, width, height, dt):
    value = coin["value"]
    if value <= 1:
        return

    same_map_players = [
        player for player in players
        if player.get("_world_id") == coin["world_id"]
    ]
    if not same_map_players:
        return

    # A point only starts running once it is inside a player's 3-second
    # reachable range. Outside that range it remains still.
    threats = []
    away_x = 0.0
    away_y = 0.0
    for player in same_map_players:
        dx = coin["x"] - player["x"]
        dy = coin["y"] - player["y"]
        distance = math.hypot(dx, dy)
        player_speed_px = player["speed"] * PIXELS_PER_SPEED
        reachable = (
            player_radius(player)
            + coin_radius(value)
            + player_speed_px * ESCAPE_TRIGGER_SECONDS
        )
        if distance > reachable:
            continue
        if distance < 0.001:
            angle = random.uniform(0, math.tau)
            dx, dy = math.cos(angle), math.sin(angle)
            distance = 1
        threats.append(player)
        away_x += dx / distance
        away_y += dy / distance

    if not threats:
        return

    # Keep points spread out. Without this, points that share the same “away
    # from players” pressure can collapse into the same corner.
    for other in all_coins:
        if other is coin or other.get("world_id") != coin.get("world_id"):
            continue
        dx = coin["x"] - other["x"]
        dy = coin["y"] - other["y"]
        distance = math.hypot(dx, dy)
        gap = coin_radius(coin["value"]) + coin_radius(other["value"]) + 52
        if distance >= gap:
            continue
        if distance < 0.001:
            angle = random.uniform(0, math.tau)
            dx, dy, distance = math.cos(angle), math.sin(angle), 1
        pressure = 2.4 * (1.0 - distance / gap)
        away_x += dx / distance * pressure
        away_y += dy / distance * pressure

    # Every point keeps a weak preference for its original neighbourhood.
    coin.setdefault("_home_x", coin["x"])
    coin.setdefault("_home_y", coin["y"])
    home_dx = coin["_home_x"] - coin["x"]
    home_dy = coin["_home_y"] - coin["y"]
    home_distance = math.hypot(home_dx, home_dy)
    if home_distance > 1:
        pull = min(0.45, home_distance / (max(width, height) * 0.55))
        away_x += home_dx / home_distance * pull
        away_y += home_dy / home_distance * pull

    # A per-point drift stops identical flee decisions from merging paths.
    coin.setdefault("_drift_angle", random.uniform(0, math.tau))
    coin["_drift_angle"] += random.uniform(-0.35, 0.35) * dt * 60
    away_x += math.cos(coin["_drift_angle"]) * 0.16
    away_y += math.sin(coin["_drift_angle"]) * 0.16

    # Stay away from map edges; otherwise fast points waste time pinned to walls.
    margin = 52
    if coin["x"] < margin:
        away_x += (margin - coin["x"]) / margin
    if coin["x"] > width - margin:
        away_x -= (coin["x"] - (width - margin)) / margin
    if coin["y"] < margin:
        away_y += (margin - coin["y"]) / margin
    if coin["y"] > height - margin:
        away_y -= (coin["y"] - (height - margin)) / margin

    length = math.hypot(away_x, away_y)
    if length < 0.001:
        coin.setdefault("_wander", random.uniform(0, math.tau))
        coin["_wander"] += random.uniform(-0.7, 0.7) * dt * 60
        away_x, away_y = math.cos(coin["_wander"]), math.sin(coin["_wander"])
    else:
        away_x /= length
        away_y /= length

    speed_px = value * value
    next_x = coin["x"] + away_x * speed_px * dt
    next_y = coin["y"] + away_y * speed_px * dt
    # If a wall blocks the preferred direction, slide instead of parking in a corner.
    if next_x <= coin_radius(value) or next_x >= width - coin_radius(value):
        away_y = 1.0 if away_y >= 0 else -1.0
    if next_y <= coin_radius(value) or next_y >= height - coin_radius(value):
        away_x = 1.0 if away_x >= 0 else -1.0
    slide_length = math.hypot(away_x, away_y) or 1
    away_x /= slide_length
    away_y /= slide_length
    next_x = coin["x"] + away_x * speed_px * dt
    next_y = coin["y"] + away_y * speed_px * dt
    coin["x"] = max(coin_radius(value), min(width - coin_radius(value), next_x))
    coin["y"] = max(coin_radius(value), min(height - coin_radius(value), next_y))


def weighted_value(values):
    weights = [1 / (value ** POWER_LAW_EXPONENT) for value in values]
    return random.choices(values, weights=weights, k=1)[0]


class GameState:
    def __init__(self):
        self.lock = threading.RLock()
        self.players = {}
        self.coins = {}
        self.worlds = {}
        self.next_player_id = 1
        self.next_coin_id = 1
        self.next_world_number = 1
        self.started_at = time.time()
        for _ in range(TARGET_COINS):
            self.spawn_main_coin_locked()

    def dimensions(self, world_id):
        if world_id:
            return MICRO_WORLD_WIDTH, MICRO_WORLD_HEIGHT
        return WORLD_WIDTH, WORLD_HEIGHT

    def make_coin_locked(self, value, x, y, world_id=None):
        coin_id = self.next_coin_id
        self.next_coin_id += 1
        self.coins[coin_id] = {
            "id": coin_id,
            "x": x,
            "y": y,
            "value": value,
            "world_id": world_id,
            "question": quiz.generate(value),
        }

    def spawn_main_coin_locked(self):
        value = random.choices(COIN_VALUES, weights=COIN_WEIGHTS, k=1)[0]
        self.make_coin_locked(
            value,
            random.uniform(42, WORLD_WIDTH - 42),
            random.uniform(42, WORLD_HEIGHT - 42),
            None,
        )

    def spawn_world_locked(self):
        if len(self.worlds) >= MAX_SMALL_WORLDS:
            return
        tier = random.choices(
            list(MICRO_TIERS.keys()),
            weights=[34, 29, 23, 14],
            k=1,
        )[0]
        world_id = f"w{self.next_world_number}"
        self.next_world_number += 1
        portal_x, portal_y = 100, 100
        for _ in range(80):
            portal_x = random.uniform(85, WORLD_WIDTH - 85)
            portal_y = random.uniform(85, WORLD_HEIGHT - 85)
            too_close = any(
                math.hypot(portal_x - w["portal_x"], portal_y - w["portal_y"]) < 180
                for w in self.worlds.values()
            )
            if not too_close:
                break

        config = MICRO_TIERS[tier]
        for _ in range(MICRO_COIN_COUNT):
            self.make_coin_locked(
                weighted_value(config["values"]),
                random.uniform(38, MICRO_WORLD_WIDTH - 38),
                random.uniform(38, MICRO_WORLD_HEIGHT - 38),
                world_id,
            )
        self.worlds[world_id] = {
            "id": world_id,
            "tier": tier,
            "portal_x": portal_x,
            "portal_y": portal_y,
            "created": time.time(),
        }

    def remove_finished_worlds_locked(self):
        protected_worlds = {
            player["_pending"]["world_id"]
            for player in self.players.values()
            if player.get("_pending") and player["_pending"].get("world_id")
        }
        finished = [wid for wid, world in self.worlds.items() if wid not in protected_worlds and not any(
            coin["world_id"] == wid for coin in self.coins.values()
        )]
        for world_id in finished:
            world = self.worlds.pop(world_id)
            for player in self.players.values():
                if player.get("_world_id") == world_id:
                    player["_world_id"] = None
                    angle = random.uniform(0, math.tau)
                    player["x"] = max(35, min(WORLD_WIDTH - 35, world["portal_x"] + math.cos(angle) * 46))
                    player["y"] = max(35, min(WORLD_HEIGHT - 35, world["portal_y"] + math.sin(angle) * 46))
                    self.set_feedback(player, "info", "小世界已吃完，你回到了主地图")

    def self_payload_locked(self, player):
        return {
            "id": player["id"],
            "name": player["name"],
            "color": player["color"],
            "x": player["x"],
            "y": player["y"],
            "score": player["score"],
            "speed": player["speed"],
            "eaten": player["eaten"],
            "skips": player["skips"],
            "size": player["size"],
            "radius": player_radius(player),
            "tailLength": player["tailLength"],
            "world_id": player["_world_id"],
        }

    def join(self, name):
        with self.lock:
            player_id = self.next_player_id
            self.next_player_id += 1
            used_colors = {p["color"] for p in self.players.values()}
            color = next((c for c in COLORS if c not in used_colors), random.choice(COLORS))
            clean_name = "".join(ch for ch in (name or "").strip() if ch.isprintable())[:14]
            self.players[player_id] = {
                "id": player_id,
                "name": clean_name or f"Player {player_id}",
                "color": color,
                "x": random.uniform(70, WORLD_WIDTH - 70),
                "y": random.uniform(70, WORLD_HEIGHT - 70),
                "dx": 0,
                "dy": 0,
                "score": 0,
                "speed": INITIAL_SPEED,
                "eaten": 0,
                "skips": SKIP_CHANCES,
                "last_seen": time.time(),
                "secret": new_secret(),
                "_world_id": None,
                "_world_cooldown_until": 0.0,
                "_offline_since": None,
                "_pending": None,
                "_feedback": None,
                "size": 1.0,
                "tailLength": 0.0,
                "achievements": [],
                "_achievement_keys": set(),
                "_achievement_toasts": [],
            }
            player = self.players[player_id]
            payload = self.self_payload_locked(player)
            payload["secret"] = player["secret"]
            return payload

    def resume(self, player_id, secret):
        """断线/刷新后凭 secret 找回原角色（保留分数、速度、体型、成就）。"""
        with self.lock:
            player = self.players.get(player_id)
            if not player or not secret or player.get("secret") != secret:
                return None
            player["last_seen"] = time.time()
            player["_offline_since"] = None
            return self.self_payload_locked(player)

    def set_input(self, player_id, dx, dy):
        with self.lock:
            player = self.players.get(player_id)
            if not player:
                return False
            player["dx"] = max(-1.0, min(1.0, dx))
            player["dy"] = max(-1.0, min(1.0, dy))
            player["last_seen"] = time.time()
            return True

    def leave(self, player_id):
        with self.lock:
            player = self.players.get(player_id)
            if not player:
                return
            # 关闭标签页只标记离线（地图上变灰），保留角色供重连，不立即删除。
            player["dx"] = 0
            player["dy"] = 0
            if not is_offline(player):
                player["_offline_since"] = time.time()

    def set_feedback(self, player, kind, message):
        player["_feedback"] = {
            "kind": kind,
            "message": message,
            "expires": time.time() + 3.5,
        }

    def award_coin(self, player, value, category="instant"):
        player["score"] += value
        old_speed = player["speed"]
        player["speed"] = min(MAX_SPEED, old_speed + value)
        player["eaten"] += 1
        player["size"] = GROWTH_PER_COIN ** player["eaten"]
        player["tailLength"] = tail_length(player)
        unlocked = evaluate_achievements_locked(player)
        if unlocked:
            self.set_feedback(
                player,
                "success",
                "🏅 成就解锁：" + "、".join(item["title"] for item in unlocked),
            )
            return
        self.set_feedback(
            player,
            "success",
            f"+{value}分 · 速度 +{player['speed'] - old_speed} · 尾长 {player['tailLength']:.1f}",
        )

    def answer(self, player_id, question_id, choice):
        with self.lock:
            player = self.players.get(player_id)
            if not player or not player.get("_pending"):
                return {"ok": False, "error": "no-question"}
            pending = player["_pending"]
            question = pending["question"]
            if question["id"] != question_id:
                return {"ok": False, "error": "stale-question"}

            correct = str(choice) == question["answer"]
            if correct:
                self.award_coin(player, pending["value"], pending["category"])
            else:
                old_speed = player["speed"]
                penalty = rounded_percentage(old_speed, 0.10)
                player["speed"] = max(MIN_SPEED, old_speed - penalty)
                self.set_feedback(player, "error", f"答错！速度 -{old_speed - player['speed']}")

            player["_pending"] = None
            return {"ok": True, "correct": correct, "correct_answer": question["answer"]}

    def skip_question(self, player_id):
        with self.lock:
            player = self.players.get(player_id)
            if not player or not player.get("_pending"):
                return {"ok": False, "error": "no-question"}
            if player["skips"] <= 0:
                return {"ok": False, "error": "no-skips"}

            pending = player["_pending"]
            coin = pending["coin"]
            self.coins[coin["id"]] = coin
            player["skips"] -= 1

            width, height = self.dimensions(player.get("_world_id"))
            dx = player["x"] - coin["x"]
            dy = player["y"] - coin["y"]
            length = math.hypot(dx, dy) or 1
            dx /= length
            dy /= length
            # 弹开距离必须超出碰撞圈，否则大体型玩家会贴着同一颗光点反复触发跳题。
            bounce = max(52.0, player_radius(player) + coin_radius(coin["value"]) + 24)
            player["x"] = max(PLAYER_RADIUS, min(width - PLAYER_RADIUS, coin["x"] + dx * bounce))
            player["y"] = max(PLAYER_RADIUS, min(height - PLAYER_RADIUS, coin["y"] + dy * bounce))
            player["_pending"] = None
            self.set_feedback(player, "info", f"安全跳过成功！剩余 {player['skips']} 次")
            return {"ok": True, "skips_left": player["skips"]}

    def exit_world(self, player_id):
        with self.lock:
            player = self.players.get(player_id)
            if not player or not player.get("_world_id"):
                return {"ok": False, "error": "not-in-world"}

            world_id = player["_world_id"]
            world = self.worlds.get(world_id)

            # If a question is open, put the untouched topic back before leaving.
            pending = player.get("_pending")
            if pending and pending.get("coin"):
                coin = pending["coin"]
                self.coins[coin["id"]] = coin
                player["_pending"] = None

            player["_world_id"] = None
            player["dx"] = 0
            player["dy"] = 0
            player["_world_cooldown_until"] = time.time() + WORLD_REENTER_COOLDOWN
            if world:
                # 沿"传送门 → 地图中心"方向弹出足够远，保证落点在入口判定圈外。
                angle = math.atan2(
                    WORLD_HEIGHT / 2 - world["portal_y"],
                    WORLD_WIDTH / 2 - world["portal_x"],
                ) + random.uniform(-0.7, 0.7)
                dist = max(60.0, player_radius(player) + 46)
                player["x"] = max(35, min(WORLD_WIDTH - 35, world["portal_x"] + math.cos(angle) * dist))
                player["y"] = max(35, min(WORLD_HEIGHT - 35, world["portal_y"] + math.sin(angle) * dist))
            else:
                player["x"] = random.uniform(70, WORLD_WIDTH - 70)
                player["y"] = random.uniform(70, WORLD_HEIGHT - 70)

            self.set_feedback(
                player, "info",
                f"已退出小世界，回到主地图（{WORLD_REENTER_COOLDOWN:.0f} 秒内入口不会再次吸入）",
            )
            return {"ok": True}

    def snapshot(self, player_id=None):
        with self.lock:
            now = time.time()
            player = self.players.get(player_id) if player_id else None
            if player:
                player["last_seen"] = now
                # 只要还在轮询就视为在线（例如后台标签页恢复前台）。
                player["_offline_since"] = None

            world_id = player.get("_world_id") if player else None
            public_players = [{
                "id": item["id"],
                "name": item["name"],
                "color": item["color"],
                "x": item["x"],
                "y": item["y"],
                "score": item["score"],
                "speed": item["speed"],
                "eaten": item["eaten"],
                "skips": item["skips"],
                "size": item["size"],
                "tailLength": tail_length(item),
                "radius": player_radius(item),
                "world_id": item["_world_id"],
                "online": not is_offline(item),
                "achievements": [entry["key"] for entry in item["achievements"]],
            } for item in self.players.values() if item.get("_world_id") == world_id]

            # 全服排行榜：所有人（包括在其他小世界里的玩家）都可见。
            public_leaderboard = [{
                "id": item["id"],
                "name": item["name"],
                "score": item["score"],
                "speed": item["speed"],
                "eaten": item["eaten"],
                "tailLength": tail_length(item),
                "achievements": [entry["key"] for entry in item["achievements"]],
                "in_world": bool(item.get("_world_id")),
                "online": not is_offline(item),
            } for item in self.players.values()]

            public_coins = []
            direct_max = 1
            if world_id:
                world = self.worlds.get(world_id)
                if world:
                    direct_max = MICRO_TIERS[world["tier"]]["direct_max"]
            for coin in self.coins.values():
                if coin["world_id"] != world_id:
                    continue
                visible_category = "instant" if coin["value"] <= direct_max else (
                    coin["question"]["category"] if coin["question"] else "instant"
                )
                public_coins.append({
                    "id": coin["id"],
                    "x": coin["x"],
                    "y": coin["y"],
                    "value": coin["value"],
                    "category": visible_category,
                })

            public_worlds = [{
                "id": world["id"],
                "tier": world["tier"],
                "x": world["portal_x"],
                "y": world["portal_y"],
                "radius": SMALL_WORLD_PORTAL_RADIUS,
                "remaining": sum(1 for coin in self.coins.values() if coin["world_id"] == world["id"]),
                "total": MICRO_COIN_COUNT,
                **MICRO_TIERS[world["tier"]],
            } for world in self.worlds.values()]

            quiz_payload = None
            feedback = None
            if player:
                pending = player.get("_pending")
                if pending:
                    quiz_payload = {
                        "value": pending["value"],
                        "skips_left": player["skips"],
                        "question": quiz.public_question(pending["question"]),
                    }
                feedback = player.get("_feedback")
                if feedback and feedback["expires"] < time.time():
                    player["_feedback"] = None
                    feedback = None

            active_world = self.worlds.get(world_id)
            active_payload = None
            if active_world:
                active_payload = {
                    "id": active_world["id"],
                    "tier": active_world["tier"],
                    "remaining": sum(1 for coin in self.coins.values() if coin["world_id"] == active_world["id"]),
                    "total": MICRO_COIN_COUNT,
                    **MICRO_TIERS[active_world["tier"]],
                }

            width, height = self.dimensions(world_id)
            achievement_toasts = list(player["_achievement_toasts"]) if player else []
            if player:
                player["_achievement_toasts"].clear()
            portal_cooldown = max(0.0, player.get("_world_cooldown_until", 0) - now) if player else 0.0
            return {
                "now": now,
                "world": {"width": width, "height": height},
                "rules": {
                    "initialSpeed": INITIAL_SPEED,
                    "minSpeed": MIN_SPEED,
                    "maxSpeed": MAX_SPEED,
                    "pixelsPerSpeed": PIXELS_PER_SPEED,
                    "skipChances": SKIP_CHANCES,
                    "escapeTriggerSeconds": ESCAPE_TRIGGER_SECONDS,
                    "growthPerCoin": GROWTH_PER_COIN,
                    "tailInitialPlayerRatio": TAIL_INITIAL_PLAYER_RATIO,
                    "tailGrowthPerCoin": TAIL_GROWTH_PER_COIN,
                },
                "players": public_players,
                "leaderboard": public_leaderboard,
                "achievementDefinitions": ACHIEVEMENTS,
                "achievementToasts": achievement_toasts,
                "coins": public_coins,
                "worlds": public_worlds if not world_id else [],
                "active_world": active_payload,
                "portal_cooldown": round(portal_cooldown, 1),
                "quiz": quiz_payload,
                "feedback": feedback,
            }

    def update(self, dt):
        with self.lock:
            now = time.time()
            # 超过 OFFLINE_AFTER 没有消息 → 标记离线（停止移动、地图变灰），角色保留；
            # 离线超过 RESUME_KEEP_AFTER 才真正移除，期间可以凭 secret 重连。
            for player in self.players.values():
                if not is_offline(player) and now - player["last_seen"] > OFFLINE_AFTER:
                    player["_offline_since"] = now
                    player["dx"] = 0
                    player["dy"] = 0
            expired = [pid for pid, p in self.players.items()
                       if is_offline(p) and now - p["_offline_since"] > RESUME_KEEP_AFTER]
            for pid in expired:
                gone = self.players.pop(pid, None)
                pending = gone.get("_pending") if gone else None
                if pending and pending.get("coin"):
                    self.coins[pending["coin"]["id"]] = pending["coin"]

            if len(self.worlds) < MAX_SMALL_WORLDS and random.random() < min(0.9, SMALL_WORLD_RATE_PER_SECOND * dt):
                self.spawn_world_locked()

            for player in self.players.values():
                if player.get("_pending") or is_offline(player):
                    continue
                width, height = self.dimensions(player.get("_world_id"))
                radius = player_radius(player)
                speed_px = player["speed"] * PIXELS_PER_SPEED
                dx, dy = player["dx"], player["dy"]
                length = math.hypot(dx, dy)
                if length > 1:
                    dx /= length
                    dy /= length
                player["x"] = max(radius, min(width - radius, player["x"] + dx * speed_px * dt))
                player["y"] = max(radius, min(height - radius, player["y"] + dy * speed_px * dt))

            coins_list = list(self.coins.values())
            active_players = [p for p in self.players.values() if not is_offline(p)]
            for coin in coins_list:
                width, height = self.dimensions(coin.get("world_id"))
                update_coin_position(coin, coins_list, active_players, width, height, dt)

            # Enter mini-world portals.
            if len(self.worlds):
                for player in self.players.values():
                    if player.get("_world_id") or player.get("_pending") or is_offline(player):
                        continue
                    if now < player.get("_world_cooldown_until", 0):
                        continue
                    for world in list(self.worlds.values()):
                        player_radius_value = player_radius(player)
                        dist = math.hypot(player["x"] - world["portal_x"], player["y"] - world["portal_y"])
                        if dist <= player_radius_value + SMALL_WORLD_PORTAL_RADIUS:
                            player["_world_id"] = world["id"]
                            player["x"] = random.uniform(34, MICRO_WORLD_WIDTH - 34)
                            player["y"] = random.uniform(34, MICRO_WORLD_HEIGHT - 34)
                            player["dx"] = 0
                            player["dy"] = 0
                            config = MICRO_TIERS[world["tier"]]
                            self.set_feedback(player, "info", f"进入{config['label']}！≤{config['direct_max']}分直接吃")
                            break

            # Coin collisions, only within the player's current map.
            consumed = []
            for player in self.players.values():
                if player.get("_pending") or is_offline(player):
                    continue
                world_id = player.get("_world_id")
                direct_max = 1
                radius = player_radius(player)
                if world_id:
                    world = self.worlds.get(world_id)
                    if world:
                        direct_max = MICRO_TIERS[world["tier"]]["direct_max"]

                for coin in self.coins.values():
                    if coin["world_id"] != world_id or coin["id"] in consumed:
                        continue
                    dist2 = (player["x"] - coin["x"]) ** 2 + (player["y"] - coin["y"]) ** 2
                    if dist2 > (radius + coin_radius(coin["value"])) ** 2:
                        continue

                    visible_category = (
                        "instant" if coin["value"] <= direct_max
                        else (coin["question"]["category"] if coin["question"] else "instant")
                    )

                    if coin["value"] <= direct_max:
                        self.award_coin(player, coin["value"], visible_category)
                        consumed.append(coin["id"])
                    else:
                        player["_pending"] = {
                            "coin_id": coin["id"],
                            "coin": coin,
                            "value": coin["value"],
                            "question": coin["question"],
                            "category": visible_category,
                            "world_id": world_id,
                        }
                        consumed.append(coin["id"])
                    break

            for coin_id in consumed:
                self.coins.pop(coin_id, None)

            while len(self.coins) < TARGET_COINS + len(self.worlds) * MICRO_COIN_COUNT:
                # This only restores main-map coins; mini-world coins never respawn.
                missing = TARGET_COINS - sum(1 for coin in self.coins.values() if not coin["world_id"])
                for _ in range(max(0, missing)):
                    self.spawn_main_coin_locked()
                break

            self.remove_finished_worlds_locked()


GAME = GameState()


def game_loop():
    last = time.time()
    while True:
        now = time.time()
        dt = min(0.1, now - last)
        last = now
        GAME.update(dt)
        time.sleep(1 / 60)


threading.Thread(target=game_loop, name="game-loop", daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    server_version = "LanOrbRush/3.0"

    def log_message(self, fmt, *args):
        return

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
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 10_000:
                return {}
            return json.loads(self.rfile.read(size).decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path
        if route in ("/", "/index.html"):
            self.send_file(ROOT / "index.html", "text/html; charset=utf-8")
        elif route == "/healthz":
            self.send_json({"ok": True, "uptime": time.time() - GAME.started_at})
        elif route == "/state":
            query = parse_qs(parsed.query)
            try:
                player_id = int(query.get("id", [""])[0])
            except ValueError:
                player_id = None
            self.send_json(GAME.snapshot(player_id))
        elif route == "/api/relay/state":
            query = parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            with RELAY_LOCK:
                room = RELAY_ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "invalid-room"}, 404)
                    return
                room["last_seen"] = time.time()
                self.send_json({"ok": True, "version": room["version"], "state": room["state"]})
        elif route == "/api/relay/inputs":
            query = parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            token = query.get("token", [""])[0]
            with RELAY_LOCK:
                room = RELAY_ROOMS.get(code)
                if not room or room["host_token"] != token:
                    self.send_json({"ok": False, "error": "invalid-room"}, 403)
                    return
                room["last_seen"] = time.time()
                inputs = room["inputs"]
                room["inputs"] = []
                guests = len(room["guests"])
            self.send_json({"ok": True, "inputs": inputs, "guests": guests})
        elif route == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        route = urlparse(self.path).path
        data = self.read_json()
        if route == "/join":
            player = GAME.join(data.get("name", ""))
            self.send_json({"ok": True, "player": player})
        elif route == "/resume":
            try:
                player_id = int(data.get("id", 0))
            except (TypeError, ValueError):
                player_id = 0
            player = GAME.resume(player_id, str(data.get("secret", "")))
            if player:
                self.send_json({"ok": True, "player": player})
            else:
                self.send_json({"ok": False, "error": "no-session"})
        elif route == "/input":
            try:
                player_id = int(data.get("id", 0))
                dx = float(data.get("dx", 0))
                dy = float(data.get("dy", 0))
            except (TypeError, ValueError):
                player_id = 0
                ok = False
            else:
                ok = GAME.set_input(player_id, dx, dy)
            self.send_json({"ok": ok})
        elif route == "/answer":
            try:
                player_id = int(data.get("id", 0))
                question_id = str(data.get("question_id", ""))
                choice = str(data.get("choice", ""))
            except (TypeError, ValueError):
                self.send_json({"ok": False, "error": "bad-request"})
                return
            self.send_json(GAME.answer(player_id, question_id, choice))
        elif route == "/skip":
            try:
                player_id = int(data.get("id", 0))
            except (TypeError, ValueError):
                player_id = 0
            self.send_json(GAME.skip_question(player_id))
        elif route == "/exit_world":
            try:
                player_id = int(data.get("id", 0))
            except (TypeError, ValueError):
                player_id = 0
            self.send_json(GAME.exit_world(player_id))
        elif route == "/leave":
            try:
                player_id = int(data.get("id", 0))
            except (TypeError, ValueError):
                player_id = 0
            GAME.leave(player_id)
            self.send_json({"ok": True})
        elif route == "/api/relay/create":
            with RELAY_LOCK:
                relay_prune()
                code = relay_new_code()
                token = relay_new_token()
                RELAY_ROOMS[code] = {
                    "game": str(data.get("game", "snake"))[:20],
                    "host_token": token, "guests": [],
                    "state": None, "version": 0, "inputs": [],
                    "last_seen": time.time(),
                }
            self.send_json({"ok": True, "code": code, "token": token, "role": "host"})
        elif route == "/api/relay/join":
            code = str(data.get("code", "")).strip().upper()
            with RELAY_LOCK:
                room = RELAY_ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "房间不存在"}, 404)
                    return
                token = relay_new_token()
                room["guests"].append(token)
                room["last_seen"] = time.time()
            self.send_json({"ok": True, "code": code, "token": token, "role": "guest"})
        elif route == "/api/relay/state":
            code = str(data.get("code", ""))
            token = str(data.get("token", ""))
            with RELAY_LOCK:
                room = RELAY_ROOMS.get(code)
                if not room or room["host_token"] != token:
                    self.send_json({"ok": False, "error": "invalid-room"}, 403)
                    return
                room["state"] = data.get("state")
                room["version"] += 1
                room["last_seen"] = time.time()
                version = room["version"]
            self.send_json({"ok": True, "version": version})
        elif route == "/api/relay/input":
            code = str(data.get("code", ""))
            with RELAY_LOCK:
                room = RELAY_ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "invalid-room"}, 404)
                    return
                room["inputs"].append(data.get("input"))
                if len(room["inputs"]) > 40:
                    room["inputs"] = room["inputs"][-40:]
                room["last_seen"] = time.time()
            self.send_json({"ok": True})
        else:
            self.send_json({"error": "not found"}, 404)

    def send_file(self, path, content_type):
        try:
            raw = path.read_bytes()
        except OSError:
            self.send_json({"error": "file unavailable"}, 500)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"抓人游戏 running: http://0.0.0.0:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
