#!/usr/bin/env python3
"""俄罗斯方块在线对战服务器 — Python 3.9 标准库，无第三方依赖。

SSE(Server-Sent Events) 推送 + HTTP POST 动作，单端口同时提供静态文件和 API。
默认端口 8700，可用环境变量 PORT 覆盖。
"""
import http.server, json, os, threading, time, uuid, queue as q
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", "8700"))
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8", ".json": "application/json",
        ".ico": "image/x-icon", ".png": "image/png", ".svg": "image/svg+xml"}

# ------------------------------------------------------------------ state
class Room:
    __slots__ = ("code", "host", "guest", "state")
    def __init__(self, code, host_id):
        self.code, self.host, self.guest, self.state = code, host_id, None, "waiting"

class Player:
    __slots__ = ("pid","name","eq","score","lines","alive","room","ready")
    def __init__(self, pid, name):
        self.pid, self.name, self.eq = pid, name, q.Queue()
        self.score = self.lines = 0
        self.alive = self.ready = False
        self.room = None

rooms: dict = {}
players: dict = {}
lock = threading.Lock()

def _ev(pl, typ, **kw):
    if pl and pl.alive:
        kw["type"] = typ
        pl.eq.put(json.dumps(kw, ensure_ascii=False))

def _bc(room, typ, **kw):
    for pid in (room.host, room.guest):
        if pid:
            _ev(players.get(pid), typ, **kw)

def _gen_code():
    import random, string
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))

def _opponent(pl):
    r = rooms.get(pl.room) if pl.room else None
    if not r: return None
    if r.host == pl.pid: return players.get(r.guest)
    return players.get(r.host)

# ------------------------------------------------------------------ handler
class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a): pass  # silence

    # ---------- helpers ----------
    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        if n < 1: return {}
        try: return json.loads(self.rfile.read(n))
        except Exception: return {}

    def _static(self, path):
        if path == "/" or path == "/index.html":
            fp = os.path.join(STATIC_DIR, "index.html")
        else:
            fp = os.path.normpath(os.path.join(STATIC_DIR, path.lstrip("/")))
            if not fp.startswith(STATIC_DIR): return self._json({"err": "forbidden"}, 403)
        if not os.path.isfile(fp): return self._json({"err": "not found"}, 404)
        ext = os.path.splitext(fp)[1]
        with open(fp, "rb") as f: data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    # ---------- GET ----------
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/events":
            self._sse(parse_qs(url.query).get("pid", [""])[0])
        elif url.path == "/api/ping":
            self._json({"ok": True})
        else:
            self._static(url.path)

    def _sse(self, pid):
        pl = players.get(pid)
        if not pl: return self._json({"err": "unknown player"}, 404)
        pl.alive = True
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            self.wfile.write(b": connected\n\n"); self.wfile.flush()
            while pl.alive:
                try:
                    msg = pl.eq.get(timeout=10)
                    self.wfile.write(f"data: {msg}\n\n".encode()); self.wfile.flush()
                except q.Empty:
                    self.wfile.write(b": ka\n\n"); self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            pl.alive = False
            opp = _opponent(pl)
            if opp and pl.room:
                r = rooms.get(pl.room)
                if r: _ev(opp, "opponent_left")
            with lock:
                players.pop(pid, None)

    # ---------- POST ----------
    def do_POST(self):
        url = urlparse(self.path)
        d = self._body()
        routes = {
            "/api/create": self._create, "/api/join": self._join,
            "/api/ready": self._ready, "/api/garbage": self._garbage,
            "/api/update": self._update, "/api/gameover": self._gameover,
            "/api/restart": self._restart, "/api/leave": self._leave,
        }
        fn = routes.get(url.path)
        if fn: fn(d)
        else: self._json({"err": "not found"}, 404)

    def _create(self, d):
        name = (d.get("name") or "玩家1").strip()[:20]
        pid = uuid.uuid4().hex[:12]
        code = _gen_code()
        with lock:
            while code in rooms: code = _gen_code()
            pl = Player(pid, name)
            pl.room = code
            players[pid] = pl
            rooms[code] = Room(code, pid)
        self._json({"ok": True, "room": code, "pid": pid, "name": name})

    def _join(self, d):
        code = (d.get("room") or "").strip().upper()
        name = (d.get("name") or "玩家2").strip()[:20]
        with lock:
            r = rooms.get(code)
            if not r: return self._json({"ok": False, "err": "房间不存在"})
            if r.guest: return self._json({"ok": False, "err": "房间已满"})
            pid = uuid.uuid4().hex[:12]
            pl = Player(pid, name)
            pl.room = code
            players[pid] = pl
            r.guest = pid
            host = players.get(r.host)
        _ev(pl, "joined", room=code, opponent=host.name if host else "?")
        opp = players.get(r.host) if r else None
        if opp: _ev(opp, "opponent_joined", name=name)
        self._json({"ok": True, "room": code, "pid": pid, "name": name, "opponent": host.name if host else "?"})

    def _ready(self, d):
        pl = players.get(d.get("pid", ""))
        if not pl: return self._json({"ok": False})
        pl.ready = True
        r = rooms.get(pl.room)
        if not r: return self._json({"ok": False})
        h, g = players.get(r.host), players.get(r.guest)
        if h and g and h.ready and g.ready:
            r.state = "countdown"
            threading.Thread(target=self._countdown, args=(r,), daemon=True).start()
        self._json({"ok": True})

    def _countdown(self, room):
        for i in (3, 2, 1):
            _bc(room, "countdown", n=i)
            time.sleep(1)
        _bc(room, "start")
        with lock:
            room.state = "playing"
            for pid in (room.host, room.guest):
                p = players.get(pid)
                if p: p.score = p.lines = 0; p.ready = False

    def _garbage(self, d):
        pl = players.get(d.get("pid", ""))
        if not pl or not pl.room: return self._json({"ok": False})
        lines = min(max(int(d.get("lines", 0)), 0), 10)
        opp = _opponent(pl)
        if opp: _ev(opp, "garbage", lines=lines, sender=pl.name)
        self._json({"ok": True})

    def _update(self, d):
        pl = players.get(d.get("pid", ""))
        if not pl: return self._json({"ok": False})
        pl.score = int(d.get("score", 0))
        pl.lines = int(d.get("lines", 0))
        opp = _opponent(pl)
        if opp: _ev(opp, "opponent_update", score=pl.score, lines=pl.lines)
        self._json({"ok": True})

    def _gameover(self, d):
        pl = players.get(d.get("pid", ""))
        if not pl or not pl.room: return self._json({"ok": False})
        r = rooms.get(pl.room)
        if r: r.state = "finished"
        opp = _opponent(pl)
        if opp: _ev(opp, "opponent_gameover")
        self._json({"ok": True})

    def _restart(self, d):
        pl = players.get(d.get("pid", ""))
        if not pl or not pl.room: return self._json({"ok": False})
        r = rooms.get(pl.room)
        if not r: return self._json({"ok": False})
        opp = _opponent(pl)
        if opp:
            _ev(opp, "restart_request")
            # auto-accept: reset and countdown
            r.state = "countdown"
            threading.Thread(target=self._countdown, args=(r,), daemon=True).start()
        self._json({"ok": True})

    def _leave(self, d):
        pl = players.get(d.get("pid", ""))
        if not pl: return self._json({"ok": False})
        opp = _opponent(pl)
        if opp: _ev(opp, "opponent_left")
        with lock:
            if pl.room:
                r = rooms.pop(pl.room, None)
                if r:
                    for pid in (r.host, r.guest):
                        if pid and pid != pl.pid:
                            p = players.get(pid)
                            if p: p.room = None
            players.pop(pl.pid, None)
        pl.alive = False
        self._json({"ok": True})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

# ------------------------------------------------------------------ main
class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    srv = Server(("0.0.0.0", PORT), Handler)
    print(f"🎮 俄罗斯方块在线对战服务器已启动")
    print(f"   端口: {PORT}")
    print(f"   访问: http://0.0.0.0:{PORT}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 服务器已关闭")
        srv.server_close()
