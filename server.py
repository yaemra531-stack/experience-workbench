#!/usr/bin/env python3
"""个人经验工作台 —— 本地服务器（只依赖 Python 3.9+ 标准库）。

启动：python3 server.py        然后打开 http://127.0.0.1:5178
数据：data/experiences.json   （自动备份到 data/backups/）
"""
import json
import os
import re
import shutil
import sys
import threading
import uuid
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mdlib  # noqa: E402

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DATA_DIR = Path(os.environ.get("EXP_DATA_DIR", ROOT / "data"))
DATA_FILE = DATA_DIR / "experiences.json"
BACKUP_DIR = DATA_DIR / "backups"
HARNESS_BACKUP_DIR = DATA_DIR / "harness-backups"
EXPORT_DIR = Path(os.environ.get("EXP_EXPORT_DIR", ROOT / "exports"))
CONFIG_FILE = Path(os.environ.get("EXP_CONFIG", ROOT / "config.json"))
HARNESS_EXPORT_SUBDIR = "经验工作台导出"
BACKUP_KEEP = 60
BACKUP_MIN_INTERVAL = 300  # 秒：两次自动备份的最小间隔
HISTORY_KEEP = 30

LOCK = threading.RLock()


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def stamp():
    return datetime.now().strftime("%Y%m%d-%H%M%S")


# ---------------------------------------------------------------- 配置

def load_config():
    cfg = {"harness_dir": str(ROOT / "sample-harness"), "port": 5178}
    if CONFIG_FILE.exists():
        try:
            cfg.update(json.loads(CONFIG_FILE.read_text("utf-8")))
        except Exception:
            pass
    return cfg


def save_config(cfg):
    atomic_write(CONFIG_FILE, json.dumps(cfg, ensure_ascii=False, indent=2))


def harness_path(cfg):
    p = Path(os.path.expanduser(cfg.get("harness_dir", ""))).resolve() if cfg.get("harness_dir") else None
    return p


# ---------------------------------------------------------------- 存储

def atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.last_backup = 0
        if self.path.exists():
            self.data = json.loads(self.path.read_text("utf-8"))
        else:
            self.data = {"version": 1, "entries": [], "not_duplicates": []}
        self.data.setdefault("entries", [])
        self.data.setdefault("not_duplicates", [])

    def backup(self, force=False, reason="auto"):
        if not self.path.exists():
            return None
        t = datetime.now().timestamp()
        if not force and t - self.last_backup < BACKUP_MIN_INTERVAL:
            return None
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        dst = BACKUP_DIR / f"experiences-{stamp()}-{reason}.json"
        shutil.copy2(self.path, dst)
        self.last_backup = t
        files = sorted(BACKUP_DIR.glob("experiences-*.json"))
        for old in files[:-BACKUP_KEEP]:
            old.unlink()
        return dst

    def save(self):
        self.backup()
        self.data["saved_at"] = now_iso()
        atomic_write(self.path, json.dumps(self.data, ensure_ascii=False, indent=1))

    def get(self, eid):
        for e in self.data["entries"]:
            if e["id"] == eid:
                return e
        return None


EDITABLE = ("type", "status", "conclusion", "why", "how", "raw", "prompt", "tags", "source")


def new_id():
    return "e_" + datetime.now().strftime("%y%m%d") + "_" + uuid.uuid4().hex[:6]


def clean_entry_input(d):
    out = {}
    for k in EDITABLE:
        if k in d:
            v = d[k]
            if k == "tags":
                v = [str(t).strip() for t in (v or []) if str(t).strip()]
                v = list(dict.fromkeys(v))
            elif k == "type":
                v = v if v in mdlib.TYPES else "短线"
            elif k == "status":
                v = v if v in ("inbox", "active", "trashed", "merged") else "active"
            else:
                v = (v or "").strip() if isinstance(v, str) else ""
            out[k] = v
    return out


def make_entry(d):
    e = {
        "id": d.get("id") or new_id(),
        "type": "短线",
        "status": "active",
        "conclusion": "",
        "why": "",
        "how": "",
        "raw": "",
        "prompt": "",
        "tags": [],
        "source": "",
        "created": d.get("created") or now_iso(),
        "updated": d.get("updated") or now_iso(),
        "history": [],
    }
    e.update(clean_entry_input(d))
    for k in ("source_file", "source_text", "source_hash"):
        if d.get(k):
            e[k] = d[k]
    return e


def snapshot(e):
    return {k: e.get(k) for k in ("conclusion", "why", "how", "raw", "prompt", "tags", "type", "status")} | {"at": e.get("updated")}


def update_entry(e, patch, keep_history=True):
    patch = clean_entry_input(patch)
    changed = any(e.get(k) != v for k, v in patch.items())
    if not changed:
        return False
    content_changed = any(e.get(k) != v for k, v in patch.items() if k not in ("status",))
    if keep_history and content_changed:
        e.setdefault("history", []).append(snapshot(e))
        e["history"] = e["history"][-HISTORY_KEEP:]
    e.update(patch)
    e["updated"] = now_iso()
    return True


# ---------------------------------------------------------------- Harness 扫描 / 导入

def safe_in(base, p):
    try:
        Path(p).resolve().relative_to(Path(base).resolve())
        return True
    except ValueError:
        return False


def classify(parsed, store_entries, ignore_ids=()):
    """判断解析出的条目与已有经验的关系：new / same / changed / similar。"""
    by_id = {e["id"]: e for e in store_entries}
    alive = [e for e in store_entries if e.get("status") not in ("trashed",)]
    h = mdlib.content_hash(parsed.get("source_text") or mdlib.entry_text(parsed))
    parsed["source_hash"] = h
    text = mdlib.entry_text(parsed)
    th = mdlib.content_hash(text)
    if parsed.get("id") and parsed["id"] in by_id:
        cur = by_id[parsed["id"]]
        same = all((cur.get(k) or "") == (parsed.get(k) or "") for k in ("conclusion", "why", "how", "raw")) and (not parsed.get("prompt_present") or (cur.get("prompt") or "") == (parsed.get("prompt") or ""))
        return {"status": "same" if same else "changed", "match_id": cur["id"]}
    for e in store_entries:
        if e.get("source_hash") == h or mdlib.content_hash(mdlib.entry_text(e)) == th:
            return {"status": "same", "match_id": e["id"]}
    best, best_s = None, 0.0
    for e in alive:
        s = mdlib.similarity(text, mdlib.entry_text(e))
        if s > best_s:
            best, best_s = e, s
    if best and best_s >= 0.5:
        return {"status": "similar", "match_id": best["id"], "score": round(best_s, 2)}
    return {"status": "new"}


def scan_harness(cfg, store):
    base = harness_path(cfg)
    if not base or not base.exists():
        return {"ok": False, "error": f"找不到 Harness 文件夹：{cfg.get('harness_dir')}", "files": []}
    files = []
    for p in sorted(base.rglob("*.md")):
        if any(part.startswith(".") for part in p.relative_to(base).parts):
            continue
        rel = str(p.relative_to(base))
        try:
            text = p.read_text("utf-8")
        except UnicodeDecodeError:
            text = p.read_text("utf-8", errors="replace")
        parsed = mdlib.parse_markdown(text, rel)
        for pe in parsed["entries"]:
            pe["source_file"] = rel
            pe["match"] = classify(pe, store.data["entries"])
        files.append({
            "path": rel,
            "size": p.stat().st_size,
            "mtime": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds"),
            "file_type": parsed["file_type"],
            "mode": parsed["mode"],
            "is_workbench_export": rel.startswith(HARNESS_EXPORT_SUBDIR),
            "entries": parsed["entries"],
        })
    return {"ok": True, "base": str(base), "files": files}


def parse_uploaded(items, store):
    files = []
    for it in items:
        name = it.get("filename") or "粘贴的内容.md"
        parsed = mdlib.parse_markdown(it.get("text", ""), name)
        for pe in parsed["entries"]:
            pe["source_file"] = name
            pe["match"] = classify(pe, store.data["entries"])
        files.append({"path": name, "file_type": parsed["file_type"], "mode": parsed["mode"], "entries": parsed["entries"]})
    return {"ok": True, "files": files}


def do_import(store, items):
    created, updated, skipped = 0, 0, 0
    ids = []
    for it in items:
        action = it.get("action", "create")
        if action == "skip":
            skipped += 1
            continue
        if action == "update" and it.get("target_id"):
            cur = store.get(it["target_id"])
            if cur:
                patch = {k: it[k] for k in ("conclusion", "why", "how", "raw", "tags", "type") if k in it and it[k] not in (None,)}
                if it.get("prompt_present"):
                    patch["prompt"] = it.get("prompt", "")
                if update_entry(cur, patch):
                    updated += 1
                cur["source_hash"] = it.get("source_hash", cur.get("source_hash"))
                ids.append(cur["id"])
                continue
        d = dict(it)
        if d.get("id") and store.get(d["id"]):
            d["id"] = None  # id 冲突时生成新 id，绝不覆盖
        d.setdefault("type", "短线")
        if not d.get("type"):
            d["type"] = "短线"
        if not d.get("status"):
            d["status"] = "active" if (d.get("conclusion") or "").strip() else "inbox"
        if not d.get("source"):
            d["source"] = "导入"
        e = make_entry(d)
        store.data["entries"].append(e)
        ids.append(e["id"])
        created += 1
    return {"created": created, "updated": updated, "skipped": skipped, "ids": ids}


# ---------------------------------------------------------------- 导出

def select_for_export(store, scope, ids=None, include_inbox=True):
    es = [e for e in store.data["entries"] if e.get("status") in ("active", "inbox")]
    if not include_inbox:
        es = [e for e in es if e.get("status") != "inbox"]
    if ids:
        idset = set(ids)
        es = [e for e in es if e["id"] in idset]
    groups = {}
    for t in mdlib.TYPES:
        if scope in ("all", t):
            groups[t] = sorted([e for e in es if e.get("type") == t], key=lambda e: e.get("created") or "")
    return groups


def build_markdown_files(store, scope, ids=None, include_inbox=True):
    groups = select_for_export(store, scope, ids, include_inbox)
    return {f"{t}.md": mdlib.entries_to_markdown(es, t) for t, es in groups.items() if es or scope == t}


def unique_path(p):
    p = Path(p)
    if not p.exists():
        return p
    i = 2
    while True:
        cand = p.with_name(f"{p.stem}-{i}{p.suffix}")
        if not cand.exists():
            return cand
        i += 1


# ---------------------------------------------------------------- HTTP

STORE = None
CONFIG = None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def log_message(self, fmt, *args):
        if os.environ.get("EXP_QUIET"):
            return
        sys.stderr.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # -- helpers
    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def route(self, method):
        u = urlparse(self.path)
        path = u.path
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if not path.startswith("/api/"):
            return None
        try:
            with LOCK:
                return self.api(method, path, q)
        except Exception as ex:  # 统一返回错误信息，便于界面提示
            import traceback
            traceback.print_exc()
            self.send_json({"ok": False, "error": str(ex)}, 500)
            return True

    def do_GET(self):
        if self.route("GET") is None:
            if self.path == "/":
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        if self.route("POST") is None:
            self.send_json({"ok": False, "error": "not found"}, 404)

    def do_PUT(self):
        if self.route("PUT") is None:
            self.send_json({"ok": False, "error": "not found"}, 404)

    def do_DELETE(self):
        if self.route("DELETE") is None:
            self.send_json({"ok": False, "error": "not found"}, 404)

    # -- API
    def api(self, method, path, q):
        S = STORE
        m = re.match(r"^/api/entries/([\w-]+)(?:/(\w+))?$", path)

        if method == "GET" and path == "/api/state":
            backups = sorted(BACKUP_DIR.glob("experiences-*.json")) if BACKUP_DIR.exists() else []
            self.send_json({
                "ok": True,
                "entries": S.data["entries"],
                "not_duplicates": S.data["not_duplicates"],
                "config": CONFIG,
                "info": {
                    "data_file": str(DATA_FILE),
                    "export_dir": str(EXPORT_DIR),
                    "backup_dir": str(BACKUP_DIR),
                    "backup_count": len(backups),
                    "last_backup": backups[-1].name if backups else None,
                    "harness_exists": bool(harness_path(CONFIG) and harness_path(CONFIG).exists()),
                },
            })
            return True

        if method == "POST" and path == "/api/entries":
            d = self.read_json()
            e = make_entry(d)
            S.data["entries"].append(e)
            S.save()
            self.send_json({"ok": True, "entry": e})
            return True

        if m and method == "PUT" and not m.group(2):
            e = S.get(m.group(1))
            if not e:
                self.send_json({"ok": False, "error": "条目不存在"}, 404)
                return True
            update_entry(e, self.read_json())
            S.save()
            self.send_json({"ok": True, "entry": e})
            return True

        if m and method == "POST" and m.group(2) in ("trash", "restore"):
            e = S.get(m.group(1))
            if not e:
                self.send_json({"ok": False, "error": "条目不存在"}, 404)
                return True
            if m.group(2) == "trash":
                e["prev_status"] = e.get("status")
                e["status"] = "trashed"
                e["trashed_at"] = now_iso()
            else:
                e["status"] = e.pop("prev_status", None) or "active"
                if e["status"] in ("trashed", "merged"):
                    e["status"] = "active"
                e.pop("merged_into", None)
                e.pop("trashed_at", None)
            e["updated"] = now_iso()
            S.save()
            self.send_json({"ok": True, "entry": e})
            return True

        if m and method == "DELETE" and not m.group(2):
            e = S.get(m.group(1))
            if not e:
                self.send_json({"ok": False, "error": "条目不存在"}, 404)
                return True
            if e.get("status") not in ("trashed", "merged"):
                self.send_json({"ok": False, "error": "只能彻底删除回收站里的条目"}, 400)
                return True
            S.backup(force=True, reason="before-delete")
            S.data["entries"] = [x for x in S.data["entries"] if x["id"] != e["id"]]
            S.save()
            self.send_json({"ok": True})
            return True

        if method == "POST" and path == "/api/merge":
            d = self.read_json()
            tgt, src = S.get(d.get("target_id")), S.get(d.get("source_id"))
            if not tgt or not src or tgt is src:
                self.send_json({"ok": False, "error": "合并对象无效"}, 400)
                return True
            update_entry(tgt, d.get("patch") or {})
            tgt.setdefault("merged_from", []).append(src["id"])
            src["prev_status"] = src.get("status")
            src["status"] = "merged"
            src["merged_into"] = tgt["id"]
            src["updated"] = now_iso()
            S.save()
            self.send_json({"ok": True, "entry": tgt, "source": src})
            return True

        if method == "POST" and path == "/api/not-duplicate":
            d = self.read_json()
            pair = sorted([d.get("a"), d.get("b")])
            if pair not in S.data["not_duplicates"]:
                S.data["not_duplicates"].append(pair)
                S.save()
            self.send_json({"ok": True})
            return True

        if method == "GET" and path == "/api/harness/scan":
            self.send_json(scan_harness(CONFIG, S))
            return True

        if method == "POST" and path == "/api/parse":
            d = self.read_json()
            self.send_json(parse_uploaded(d.get("files", []), S))
            return True

        if method == "POST" and path == "/api/import":
            d = self.read_json()
            S.backup(force=True, reason="before-import")
            res = do_import(S, d.get("items", []))
            S.save()
            self.send_json({"ok": True, **res})
            return True

        if method == "POST" and path == "/api/restore-json":
            # 从 JSON 备份恢复：按 id 合并，已存在的不覆盖
            d = self.read_json()
            incoming = d.get("entries") or []
            S.backup(force=True, reason="before-restore")
            existing = {e["id"] for e in S.data["entries"]}
            added = 0
            for e in incoming:
                if not isinstance(e, dict) or not e.get("id") or e["id"] in existing:
                    continue
                S.data["entries"].append(e)
                added += 1
            S.save()
            self.send_json({"ok": True, "added": added, "skipped": len(incoming) - added})
            return True

        if method == "POST" and path == "/api/export/preview":
            d = self.read_json()
            files = build_markdown_files(S, d.get("scope", "all"), d.get("ids"), d.get("include_inbox", True))
            self.send_json({"ok": True, "files": files})
            return True

        if method == "POST" and path == "/api/export/save":
            d = self.read_json()
            files = build_markdown_files(S, d.get("scope", "all"), d.get("ids"), d.get("include_inbox", True))
            target = d.get("target", "exports")
            written = []
            if target == "exports":
                out_dir = EXPORT_DIR / stamp()
                out_dir.mkdir(parents=True, exist_ok=True)
                for name, text in files.items():
                    p = unique_path(out_dir / name)
                    atomic_write(p, text)
                    written.append(str(p))
            elif target == "harness-new":
                base = harness_path(CONFIG)
                if not base or not base.exists():
                    self.send_json({"ok": False, "error": "Harness 文件夹不存在，请先在设置里填写"}, 400)
                    return True
                out_dir = base / HARNESS_EXPORT_SUBDIR
                out_dir.mkdir(parents=True, exist_ok=True)
                for name, text in files.items():
                    p = unique_path(out_dir / f"{Path(name).stem}-{stamp()}.md")
                    atomic_write(p, text)
                    written.append(str(p))
            elif target == "harness-replace":
                # 替换 Harness 中已有文件：必须明确确认，且先备份原文件
                base = harness_path(CONFIG)
                mapping = d.get("mapping") or {}
                if d.get("confirm") != "确认覆盖":
                    self.send_json({"ok": False, "error": "覆盖原文件需要输入“确认覆盖”"}, 400)
                    return True
                for name, rel in mapping.items():
                    if name not in files:
                        continue
                    dst = (base / rel).resolve()
                    if not safe_in(base, dst) or dst.suffix != ".md":
                        self.send_json({"ok": False, "error": f"路径不安全：{rel}"}, 400)
                        return True
                    backup = None
                    if dst.exists():
                        bdir = HARNESS_BACKUP_DIR / stamp()
                        bdir.mkdir(parents=True, exist_ok=True)
                        backup = bdir / rel.replace("/", "__")
                        shutil.copy2(dst, backup)
                    atomic_write(dst, files[name])
                    written.append(str(dst) + (f"（原文件已备份到 {backup}）" if backup else ""))
            self.send_json({"ok": True, "written": written})
            return True

        if method == "PUT" and path == "/api/config":
            d = self.read_json()
            if "harness_dir" in d:
                CONFIG["harness_dir"] = str(d["harness_dir"]).strip()
            save_config(CONFIG)
            hp = harness_path(CONFIG)
            self.send_json({"ok": True, "config": CONFIG, "harness_exists": bool(hp and hp.exists())})
            return True

        if method == "POST" and path == "/api/backup":
            p = S.backup(force=True, reason="manual")
            self.send_json({"ok": True, "file": str(p) if p else None})
            return True

        self.send_json({"ok": False, "error": "unknown api"}, 404)
        return True


def main():
    global STORE, CONFIG
    CONFIG = load_config()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STORE = Store(DATA_FILE)
    port = int(os.environ.get("EXP_PORT") or CONFIG.get("port") or 5178)
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        print(f"端口 {port} 被占用。可能工作台已经在运行，直接打开 http://127.0.0.1:{port} 即可。")
        if "--no-browser" not in sys.argv:
            webbrowser.open(f"http://127.0.0.1:{port}")
        return
    url = f"http://127.0.0.1:{port}"
    print(f"个人经验工作台已启动：{url}")
    print(f"数据文件：{DATA_FILE}")
    print("关闭此窗口（或按 Ctrl+C）即可停止。")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
