#!/usr/bin/env python3
"""
本地键盘桥：用 macOS 原生 IOHID（ctypes，无第三方依赖）按“哪块键盘”读按键，
再通过 http://127.0.0.1:8765/state 把每块键盘当前按下的键交给游戏页面。

为什么要这个：浏览器拿到的键盘事件是系统合并后的，分不出设备；WebHID 在 macOS 上
对蓝牙键盘经常拿不到报文。原生 IOHID 没有这些限制。

用法：
    python3 kb_bridge.py --list          # 列出能识别的键盘（不需要按键）
    python3 kb_bridge.py --probe 20      # 监听 20 秒，打印收到的按键（用来验证）
    python3 kb_bridge.py                 # 启动桥：127.0.0.1:8765 提供 /state
"""
import argparse, ctypes, ctypes.util, json, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

IOKIT = ctypes.CDLL(ctypes.util.find_library("IOKit"))
CF    = ctypes.CDLL(ctypes.util.find_library("CoreFoundation"))

UTF8 = 0x08000100
KCF_NUMBER_SINT32 = 9
KCF_NUMBER_SINT64 = 11
KCF_STRING_ENCODING_UTF8 = 0x08000100


# ---------- CoreFoundation / IOKit 函数签名（必须先设好 restype，否则 64 位指针会被截断） ----------
CF.CFStringCreateWithCString.restype = ctypes.c_void_p
CF.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
CF.CFStringGetCString.restype = ctypes.c_bool
CF.CFStringGetCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_uint32]
CF.CFNumberGetValue.restype = ctypes.c_bool
CF.CFNumberGetValue.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
CF.CFRunLoopGetCurrent.restype = ctypes.c_void_p
CF.CFRunLoopGetCurrent.argtypes = []
CF.CFRunLoopRun.restype = None
CF.CFRunLoopRun.argtypes = []


def cfstr(s):
    return CF.CFStringCreateWithCString(None, s.encode(), KCF_STRING_ENCODING_UTF8)


def cfnum_int(handle):
    """CFNumber -> python int（拿不到就返回 None）"""
    if not handle:
        return None
    out = ctypes.c_int64(0)
    if CF.CFNumberGetValue(ctypes.c_void_p(handle), KCF_NUMBER_SINT64, ctypes.byref(out)):
        return int(out.value)
    return None


def cfstr_str(handle):
    """CFString -> python str"""
    if not handle:
        return ""
    buf = ctypes.create_string_buffer(256)
    if CF.CFStringGetCString(ctypes.c_void_p(handle), buf, 256, KCF_STRING_ENCODING_UTF8):
        return buf.value.decode("utf-8", "replace")
    return ""


# ---------- IOHID 函数签名 ----------
IOKIT.IOHIDManagerCreate.restype = ctypes.c_void_p
IOKIT.IOHIDManagerCreate.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
IOKIT.IOHIDManagerOpen.restype = ctypes.c_int
IOKIT.IOHIDManagerOpen.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
IOKIT.IOHIDManagerSetDeviceMatching.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
IOKIT.IOHIDManagerRegisterDeviceMatchingCallback.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
IOKIT.IOHIDManagerRegisterInputValueCallback.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
IOKIT.IOHIDManagerScheduleWithRunLoop.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
IOKIT.IOHIDDeviceGetProperty.restype = ctypes.c_void_p
IOKIT.IOHIDDeviceGetProperty.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
IOKIT.IOHIDValueGetElement.restype = ctypes.c_void_p
IOKIT.IOHIDValueGetElement.argtypes = [ctypes.c_void_p]
IOKIT.IOHIDValueGetIntegerValue.restype = ctypes.c_long
IOKIT.IOHIDValueGetIntegerValue.argtypes = [ctypes.c_void_p]
IOKIT.IOHIDElementGetUsagePage.restype = ctypes.c_uint32
IOKIT.IOHIDElementGetUsagePage.argtypes = [ctypes.c_void_p]
IOKIT.IOHIDElementGetUsage.restype = ctypes.c_uint32
IOKIT.IOHIDElementGetUsage.argtypes = [ctypes.c_void_p]
IOKIT.IOHIDElementGetDevice.restype = ctypes.c_void_p
IOKIT.IOHIDElementGetDevice.argtypes = [ctypes.c_void_p]
RUNLOOP_MODE = cfstr("kCFRunLoopDefaultMode")   # 只建一次

# HID keyboard page 0x07 usage -> 浏览器里的 e.code（游戏直接用这些名字）
USAGE_TO_CODE = {
    0x04:"KeyA",0x05:"KeyB",0x06:"KeyC",0x07:"KeyD",0x08:"KeyE",0x09:"KeyF",0x0A:"KeyG",
    0x0B:"KeyH",0x0C:"KeyI",0x0D:"KeyJ",0x0E:"KeyK",0x0F:"KeyL",0x10:"KeyM",0x11:"KeyN",
    0x12:"KeyO",0x13:"KeyP",0x14:"KeyQ",0x15:"KeyR",0x16:"KeyS",0x17:"KeyT",0x18:"KeyU",
    0x19:"KeyV",0x1A:"KeyW",0x1B:"KeyX",0x1C:"KeyY",0x1D:"KeyZ",
    0x1E:"Digit1",0x1F:"Digit2",0x20:"Digit3",0x21:"Digit4",0x22:"Digit5",
    0x23:"Digit6",0x24:"Digit7",0x25:"Digit8",0x26:"Digit9",0x27:"Digit0",
    0x28:"Enter",0x29:"Escape",0x2A:"Backspace",0x2B:"Tab",0x2C:"Space",
    0x4F:"ArrowRight",0x50:"ArrowLeft",0x51:"ArrowDown",0x52:"ArrowUp",
    0xE0:"ControlLeft",0xE1:"ShiftLeft",0xE2:"AltLeft",0xE3:"MetaLeft",
    0xE4:"ControlRight",0xE5:"ShiftRight",0xE6:"AltRight",0xE7:"MetaRight",
    0x68:"F13",0x69:"F14",0x6A:"F15",0x6B:"F16",0x6C:"F17",0x6D:"F18",
    0x6E:"F19",0x6F:"F20",0x70:"F21",0x71:"F22",0x72:"F23",0x73:"F24",
}

LOCK = threading.Lock()
DEVICES = {}          # ptr -> {name, vendor, product, keys:set(), last:float}
ORDER = []            # 设备出现顺序（按 vendor/product 排序后用于稳定映射）
OPEN_RESULT = None    # IOHIDManagerOpen 的返回值：0 = 成功，0xe00002e2 = 权限不足


def device_info(device):
    def prop(key):
        return IOKIT.IOHIDDeviceGetProperty(ctypes.c_void_p(device), cfstr(key))
    try:
        vid = cfnum_int(prop("VendorID"))
        pid = cfnum_int(prop("ProductID"))
        name = cfstr_str(prop("Product")) or "(未命名)"
        page = cfnum_int(prop("PrimaryUsagePage"))
        usage = cfnum_int(prop("PrimaryUsage"))
    except Exception:
        vid = pid = page = usage = None
        name = "(读取失败)"
    # 只认“通用桌面 / 键盘”这个 usage（page 1, usage 6）；用来排掉背光、触控、耳机等设备
    is_keyboard = (page == 1 and usage == 6)
    return vid, pid, name, is_keyboard, page, usage


DEVICE_CB = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
VALUE_CB = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)


@DEVICE_CB
def on_device(ctx, result, sender, device):
    vid, pid, name, is_kb, page, usage = device_info(device)
    key = ctypes.cast(device, ctypes.c_void_p).value
    with LOCK:
        DEVICES[key] = {"name": name, "vendor": vid, "product": pid, "keys": set(), "last": 0.0,
                        "keyboard": is_kb, "reports": 0, "page": page, "usage": usage}
        if key not in ORDER:
            ORDER.append(key)
            ORDER.sort(key=lambda k: (DEVICES[k]["vendor"] or 0, DEVICES[k]["product"] or 0))


@VALUE_CB
def on_value(ctx, result, sender, value):
    try:
        elem = IOKIT.IOHIDValueGetElement(ctypes.c_void_p(value))
        page = IOKIT.IOHIDElementGetUsagePage(ctypes.c_void_p(elem))
        if page != 0x07:                       # 只看键盘页
            return
        usage = IOKIT.IOHIDElementGetUsage(ctypes.c_void_p(elem))
        code = USAGE_TO_CODE.get(usage)
        if not code:
            return
        down = IOKIT.IOHIDValueGetIntegerValue(ctypes.c_void_p(value)) != 0
        dev = IOKIT.IOHIDElementGetDevice(ctypes.c_void_p(elem))
        key = ctypes.cast(ctypes.c_void_p(dev), ctypes.c_void_p).value
        with LOCK:
            rec = DEVICES.get(key)
            if rec is None:
                vid, pid, name, is_kb, page, usage = device_info(dev)
                rec = {"name": name, "vendor": vid, "product": pid, "keys": set(), "last": 0.0,
                       "keyboard": is_kb, "reports": 0, "page": page, "usage": usage}
                DEVICES[key] = rec
                ORDER.append(key)
            rec["keyboard"] = True        # 能送来键盘报文，就是键盘
            rec["reports"] = rec.get("reports", 0) + 1
            if down:
                rec["keys"].add(code)
            else:
                rec["keys"].discard(code)
            rec["last"] = time.time()
    except Exception:
        pass


def make_manager():
    global OPEN_RESULT
    mgr = IOKIT.IOHIDManagerCreate(None, 0)
    if not mgr:
        raise RuntimeError("IOHIDManagerCreate 失败")
    IOKIT.IOHIDManagerSetDeviceMatching(ctypes.c_void_p(mgr), None)   # 匹配所有 HID，回调里再筛
    IOKIT.IOHIDManagerRegisterDeviceMatchingCallback(ctypes.c_void_p(mgr), on_device, None)
    IOKIT.IOHIDManagerRegisterInputValueCallback(ctypes.c_void_p(mgr), on_value, None)
    # 用模块级 CF 句柄上“已声明好 restype”的常量，别再新建句柄（否则指针会被截断 → 段错误）
    IOKIT.IOHIDManagerScheduleWithRunLoop(ctypes.c_void_p(mgr),
                                          ctypes.c_void_p(CF.CFRunLoopGetCurrent()),
                                          ctypes.c_void_p(RUNLOOP_MODE))
    r = IOKIT.IOHIDManagerOpen(ctypes.c_void_p(mgr), 0)
    OPEN_RESULT = r & 0xffffffff
    if r != 0:
        print(f"⚠️ IOHIDManagerOpen 返回 0x{r & 0xffffffff:x}（0xe00002e2 = 权限不足，需要在"
              f"「系统设置 → 隐私与安全性 → 输入监控」里给终端/这个进程授权）", file=sys.stderr)
    return mgr


def open_ok():
    return OPEN_RESULT == 0


def keyboard_devices():
    """返回识别到的物理键盘（按 vendor/product/名称合并重复枚举），
    顺序固定：苹果键盘 → Logitech K380 → Pebble K380s → 其它"""
    def rank(d):
        if d["vendor"] == 0x5ac: return (0, d["product"] or 0)
        if d["vendor"] == 0x46d: return (1, d["product"] or 0)
        return (2, (d["vendor"] or 0) * 100000 + (d["product"] or 0))
    merged = {}
    for d in snapshot():
        if not d.get("keyboard"):
            continue
        k = (d["vendor"] or 0, d["product"] or 0, d["name"] or "")
        rec = merged.get(k)
        if rec is None:
            merged[k] = dict(d)
        else:                                  # 同一块键盘的多个服务：合并按键，累计报文
            rec["keys"] = sorted(set(rec["keys"]) | set(d["keys"]))
            rec["reports"] = rec.get("reports", 0) + d.get("reports", 0)
            rec["last"] = max(rec.get("last", 0), d.get("last", 0))
    return sorted(merged.values(), key=rank)


def run_loop_forever():
    CF.CFRunLoopRun()


def start():
    """在同一个后台线程里创建 manager + 跑 RunLoop。
    注意：IOHIDManagerScheduleWithRunLoop 必须和 CFRunLoopRun 在同一个线程，
    否则设备回调永远不会触发（表现为 devices 一直是空的）。"""
    def worker():
        try:
            make_manager()
            CF.CFRunLoopRun()
        except Exception as e:
            print(f"桥线程异常: {e}", file=sys.stderr)
    t = threading.Thread(target=worker, daemon=True, name="hid-runloop")
    t.start()
    for _ in range(50):                 # 等 manager 打开（最多 5 秒）
        if OPEN_RESULT is not None:
            return
        time.sleep(0.1)


def snapshot():
    with LOCK:
        out = []
        for k in ORDER:
            r = DEVICES.get(k)
            if not r:
                continue
            out.append({"name": r["name"], "vendor": r["vendor"], "product": r["product"],
                        "keys": sorted(r["keys"]), "last": r["last"],
                        "keyboard": r.get("keyboard", False), "reports": r.get("reports", 0),
                        "page": r.get("page"), "usage": r.get("usage")})
        return out


def cmd_list():
    start()
    time.sleep(1.5)
    devs = [d for d in snapshot() if d["vendor"] in (0x46d, 0x5ac)]
    if not devs:
        print("没识别到键盘（Apple: 0x5ac / Logitech: 0x46d）。若提示权限不足，先去给终端开「输入监控」。")
    for d in devs:
        who = "Logitech" if d["vendor"] == 0x46d else "Apple"
        print(f"  {who:9s} vendor=0x{d['vendor']:x} product=0x{d['product']:x}  {d['name']}")


def cmd_probe(seconds):
    start()
    print(f"监听 {seconds} 秒：请在两块键盘上各按几下 W / A / S / D …")
    t0 = time.time()
    while time.time() - t0 < seconds:
        time.sleep(0.4)
        for d in snapshot():
            if d["keys"]:
                who = "Logitech" if d["vendor"] == 0x46d else ("Apple" if d["vendor"] == 0x5ac else "其它")
                print(f"  [{time.strftime('%H:%M:%S')}] {who:9s} {d['name']:16s} 按下: {' '.join(d['keys'])}")
    print("监听结束。")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):     # 静音访问日志
        pass

    def do_GET(self):
        if self.path.startswith("/health"):
            body = b'{"status":"ok","service":"kb-bridge"}'
        elif self.path.startswith("/keyboards"):
            # 游戏直接读这个：已经过滤掉非键盘设备、并合并了重复枚举
            body = json.dumps({"ok": True, "keyboards": keyboard_devices()},
                              ensure_ascii=False).encode()
        elif self.path.startswith("/state"):
            body = json.dumps({"ok": True, "devices": snapshot()}, ensure_ascii=False).encode()
        else:
            self.send_response(404); self.end_headers(); return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


def cmd_serve(port):
    start()
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"键盘桥已启动：http://127.0.0.1:{port}/state  （Ctrl+C 退出）")
    for d in snapshot():
        if d["vendor"] in (0x46d, 0x5ac):
            print(f"  发现键盘：{d['name']}  vendor=0x{d['vendor']:x} product=0x{d['product']:x}")
    srv.serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--probe", type=int, metavar="SECONDS")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    if a.list:
        cmd_list()
    elif a.probe:
        cmd_probe(a.probe)
    else:
        cmd_serve(a.port)
