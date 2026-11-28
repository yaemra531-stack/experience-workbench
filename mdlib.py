"""Markdown 解析与导出（只用 Python 标准库）。

设计原则：
- 解析时永远保留原文（source_text），结构化字段只是“读出来”的，不做任何编造。
- 导出格式可以被再次导入（round-trip），方便 Agent 维护 Harness。
"""
import hashlib
import re
from datetime import datetime

TYPES = ("短线", "长线")

# 字段别名：长的放前面，优先匹配
FIELD_ALIASES = [
    ("conclusion", ["一句话结论", "核心结论", "一句话", "结论", "标题", "要点"]),
    ("why", ["属于哪个系统，为什么", "为什么这样认为", "为什么这么认为", "为什么", "为何", "原因", "依据", "理由", "背景"]),
    ("how", ["以后怎么做", "下次怎么做", "之后怎么做", "怎么做", "行动建议", "行动", "做法", "方法", "建议"]),
    ("scene", ["应用场景"]),
    ("reuse", ["快速复用"]),
    ("raw", ["原始记录", "原始想法", "原始对话", "原文"]),
    ("prompt", ["提示词"]),
]
ALIAS_LIST = sorted(
    [(alias, field) for field, aliases in FIELD_ALIASES for alias in aliases],
    key=lambda x: -len(x[0]),
)

META_KEYS = {
    "id": "id",
    "标签": "tags",
    "tags": "tags",
    "来源": "source",
    "系统": "system",
    "记录于": "created",
    "创建于": "created",
    "更新于": "updated",
    "类型": "type",
    "状态": "status",
}
STATUS_FROM_LABEL = {"待整理": "inbox", "正常": "active", "已归档": "active"}
STATUS_LABEL = {"inbox": "待整理", "active": "正常"}

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
BULLET_RE = re.compile(r"^[-*+]\s+(.*)$")
HR_RE = re.compile(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$")


# ---------------------------------------------------------------- 工具函数

def normalize(text):
    text = (text or "").lower()
    return re.sub(r"[\s\W_]+", "", text, flags=re.UNICODE)


def content_hash(text):
    return hashlib.sha1(normalize(text).encode("utf-8")).hexdigest()[:16]


def bigrams(text):
    t = normalize(text)
    if len(t) < 2:
        return {t} if t else set()
    return {t[i:i + 2] for i in range(len(t) - 1)}


def similarity(a, b):
    """字符二元组 Jaccard 相似度，适合中文短文本。"""
    A, B = bigrams(a), bigrams(b)
    if not A or not B:
        return 0.0
    inter = len(A & B)
    jac = inter / len(A | B)
    if min(len(A), len(B)) < 6:
        return jac
    return max(jac, 0.8 * inter / min(len(A), len(B)))


def entry_text(e):
    parts = [e.get("conclusion", ""), e.get("why", ""), e.get("how", ""), e.get("scene", ""), e.get("reuse", "")]
    joined = "\n".join(p for p in parts if p)
    return joined if normalize(joined) else e.get("raw", "")


def type_from_text(s):
    if not s:
        return None
    if "长线" in s:
        return "长线"
    if "短线" in s:
        return "短线"
    return None


# ---------------------------------------------------------------- 解析

def parse_frontmatter(text):
    lines = text.split("\n")
    meta = {}
    if lines and lines[0].strip() == "---":
        for i in range(1, min(len(lines), 60)):
            if lines[i].strip() == "---":
                for ln in lines[1:i]:
                    if ":" in ln:
                        k, v = ln.split(":", 1)
                        meta[k.strip()] = v.strip()
                return meta, "\n".join(lines[i + 1:])
    return meta, text


def _strip_md_prefix(line):
    s = line.strip()
    s = re.sub(r"^#{1,6}\s*", "", s)
    s = re.sub(r"^[-*+]\s+", "", s)
    s = re.sub(r"^>\s*", "", s)
    return s


def match_field_label(line):
    """识别字段标签行。返回 (field, inline_content) 或 None。

    支持：### 为什么这样认为 / **为什么**：xxx / 为什么：xxx / - 以后怎么做: xxx
    """
    raw = line.strip()
    is_heading = bool(re.match(r"^#{1,6}\s", raw))
    s = _strip_md_prefix(raw)
    s = re.sub(r"^(?:\d+[.、]|[（(]\d+[）)])\s*", "", s)
    bolded = False
    m = re.match(r"^(\*\*|__)(.+?)(\*\*|__)\s*(.*)$", s)
    if m:
        bolded = True
        label, rest = m.group(2), m.group(4)
        # **为什么：** 这种冒号在加粗内的写法
        if re.search(r"[：:]\s*$", label):
            label = re.sub(r"[：:]\s*$", "", label)
            rest = rest
        else:
            rest = re.sub(r"^[：:]\s*", "", rest)
    else:
        label, rest = s, ""
    label_clean = label.strip()
    for alias, field in ALIAS_LIST:
        if not label_clean.startswith(alias):
            continue
        tail = label_clean[len(alias):]
        if is_heading or bolded:
            # 标题/加粗：标签后可以跟问号、冒号或少量说明
            if tail == "" or re.match(r"^[？?：:（(]", tail) or len(tail) <= 6:
                inline = re.sub(r"^[？?]?\s*[：:]?\s*", "", tail) if re.match(r"^[？?：:]", tail) else ""
                content = (inline + (" " if inline and rest else "") + rest).strip()
                return field, content
        else:
            if tail.strip() in ("？", "?"):
                return field, ""
            m2 = re.match(r"^[？?]?\s*[：:]\s*(.*)$", tail)
            if m2:
                return field, m2.group(1).strip()
    return None


def match_meta(line):
    s = line.strip()
    m = re.match(r"^[-*+]\s+([^:：]{1,8})\s*[:：]\s*(.*)$", s)
    if not m:
        return None
    key = m.group(1).strip().lower() if m.group(1).strip().lower() == "tags" else m.group(1).strip()
    if key in META_KEYS:
        return META_KEYS[key], m.group(2).strip()
    return None


def _clean_block(lines):
    text = "\n".join(lines).strip("\n")
    # 去掉整段引用符号（我们导出原始记录时用 > 引用）
    ls = text.split("\n")
    if ls and all(l.startswith(">") or not l.strip() for l in ls) and any(l.strip() for l in ls):
        ls = [re.sub(r"^>\s?", "", l) for l in ls]
        text = "\n".join(ls)
    return text.strip()


def _first_sentence(text, limit=60):
    t = re.sub(r"[#>*`]", "", text or "").strip()
    t = t.split("\n")[0].strip()
    t = re.sub(r"^[-*+]\s+", "", t)
    m = re.match(r"^(.+?[。！？!?])", t)
    s = m.group(1) if m else t
    return s[:limit]


def parse_section(title, body_lines, title_is_heading=True):
    fields = {"conclusion": [], "why": [], "how": [], "scene": [], "reuse": [], "raw": [], "prompt": []}
    seen_prompt = False
    loose = []
    meta = {}
    current = None
    seen_field = False
    meta_zone = True
    in_code = False
    for line in body_lines:
        if line.lstrip().startswith("```"):
            in_code = not in_code
            (fields[current] if current else loose).append(line)
            continue
        if in_code:
            (fields[current] if current else loose).append(line)
            continue
        if meta_zone:
            mm = match_meta(line)
            if mm:
                meta[mm[0]] = mm[1]
                continue
            if line.strip():
                meta_zone = False
        lab = None if current in ("raw", "prompt") and line.lstrip().startswith(">") else match_field_label(line)
        if lab:
            current, inline = lab
            if current == "prompt":
                seen_prompt = True
            seen_field = True
            if inline:
                fields[current].append(inline)
            continue
        if current:
            fields[current].append(line)
        else:
            loose.append(line)

    f = {k: _clean_block(v) for k, v in fields.items()}
    loose_text = _clean_block(loose)
    title = (title or "").strip()

    conclusion = f["conclusion"] or (title if title_is_heading else "")
    raw = f["raw"]
    if loose_text:
        if not seen_field and not title_is_heading and not conclusion:
            # 纯文本条目（例如列表项）：第一行即观点本身
            conclusion = loose_text.split("\n")[0].strip()
            rest = "\n".join(loose_text.split("\n")[1:]).strip()
            raw = "\n\n".join(x for x in [raw, rest] if x)
        else:
            raw = "\n\n".join(x for x in [loose_text, raw] if x)
    if not conclusion and raw:
        conclusion = ""  # 不臆造结论，留给用户整理

    tags = []
    if meta.get("tags"):
        tags = [t.strip() for t in re.split(r"[,，、/\s]+", meta["tags"]) if t.strip()]
    status = STATUS_FROM_LABEL.get(meta.get("status", ""), None)

    source_text = ((("## " + title + "\n") if title_is_heading and title else "") + "\n".join(body_lines)).strip()
    return {
        "id": meta.get("id") or None,
        "type": type_from_text(meta.get("type", "")),
        "status": status,
        "conclusion": conclusion.strip(),
        "why": f["why"],
        "how": f["how"],
        "system": meta.get("system") if meta.get("system") in ("观点", "尝鲜", "干货", "拆解") else "",
        "scene": f["scene"],
        "reuse": f["reuse"],
        "raw": raw.strip(),
        "prompt": f["prompt"],
        "prompt_present": seen_prompt,
        "tags": tags,
        "source": meta.get("source") or "",
        "created": meta.get("created") or None,
        "updated": meta.get("updated") or None,
        "structured": seen_field,
        "source_text": source_text if source_text else (title or ""),
    }


GROUP_RE = re.compile(r"^(短线|长线)(经验|笔记|记录)?[\s（(]*.*$")


def _split_by_heading(lines, level):
    """按某一级标题切分。上一级标题若是「短线 / 长线」，会作为分组类型带给下面的条目。"""
    prefix = "#" * level + " "
    upper = "#" * (level - 1) + " " if level > 1 else None
    sections, pre = [], []
    cur = None
    group = None
    in_code = False
    for ln in lines:
        if ln.strip().startswith("```"):
            in_code = not in_code
        if not in_code and upper and ln.startswith(upper):
            g = type_from_text(ln[len(upper):]) if GROUP_RE.match(ln[len(upper):].strip()) else None
            if g:
                group = g
                if cur:
                    sections.append(cur)
                    cur = None
                continue
        if not in_code and ln.startswith(prefix):
            if cur:
                sections.append(cur)
            cur = [ln[len(prefix):].strip().rstrip("#").strip(), [], group]
        elif cur is None:
            pre.append(ln)
        else:
            cur[1].append(ln)
    if cur:
        sections.append(cur)
    return pre, sections


def parse_markdown(text, filename=""):
    """把一个 Markdown 文件解析成若干经验条目（预览用，不写入）。"""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    fm, body = parse_frontmatter(text)
    file_type = type_from_text(fm.get("type", "")) or type_from_text(filename)
    lines = body.split("\n")
    heading_lines = [l for l in lines if HEADING_RE.match(l)]
    h2 = [l for l in lines if l.startswith("## ")]
    h1 = [l for l in lines if l.startswith("# ")]
    entries = []

    def add(e):
        if not (e["conclusion"] or e["why"] or e["how"] or e["raw"]):
            return
        if not e["type"]:
            e["type"] = file_type
        entries.append(e)

    if h2 or len(h1) > 1:
        level = 2 if h2 else 1
        pre, sections = _split_by_heading(lines, level)
        pre_text = "\n".join(l for l in pre if not HEADING_RE.match(l) and not HR_RE.match(l)).strip()
        if pre_text and normalize(pre_text) and not fm.get("exported_by"):
            doc_title = next((HEADING_RE.match(l).group(2) for l in pre if HEADING_RE.match(l)), "")
            e = parse_section(doc_title or "（文件开头的说明）", pre_text.split("\n"), title_is_heading=True)
            e["is_preamble"] = True
            add(e)
        for title, body_lines, group in sections:
            # 去掉段落间的分隔线
            while body_lines and (not body_lines[-1].strip() or HR_RE.match(body_lines[-1])):
                body_lines.pop()
            g = type_from_text(title) if GROUP_RE.match(title) else None
            if g:
                # 「## 短线」这样的分组标题：里面的内容按一个独立文件解析
                demoted = [l[1:] if l.startswith("##") else l for l in body_lines]
                sub = parse_markdown("\n".join(demoted), g)
                for se in sub["entries"]:
                    se["type"] = se.get("type") or g
                    add(se)
                continue
            e = parse_section(title, body_lines, title_is_heading=True)
            if group and not e["type"]:
                e["type"] = group
            add(e)
        return {"file_type": file_type, "entries": entries, "mode": "heading"}

    body_wo_h = [l for l in lines if not l.startswith("# ")]
    hr_idx = [i for i, l in enumerate(body_wo_h) if HR_RE.match(l)]
    if hr_idx:
        chunk = []
        for l in body_wo_h + ["---"]:
            if HR_RE.match(l):
                if "\n".join(chunk).strip():
                    add(parse_section("", chunk, title_is_heading=False))
                chunk = []
            else:
                chunk.append(l)
        return {"file_type": file_type, "entries": entries, "mode": "separator"}

    nonblank = [l for l in body_wo_h if l.strip()]
    top_bullets = [l for l in nonblank if BULLET_RE.match(l)]
    if len(top_bullets) >= 2 and len(top_bullets) >= 0.5 * len([l for l in nonblank if not l.startswith((" ", "\t"))]):
        items, cur = [], None
        for l in body_wo_h:
            m = BULLET_RE.match(l)
            if m:
                if cur:
                    items.append(cur)
                cur = [m.group(1)]
            elif cur is not None and (l.startswith((" ", "\t")) or not l.strip()):
                cur.append(l.strip())
            elif l.strip():
                if cur:
                    items.append(cur)
                cur = None
                items.append([l.strip()])
        if cur:
            items.append(cur)
        for it in items:
            add(parse_section("", it, title_is_heading=False))
        return {"file_type": file_type, "entries": entries, "mode": "bullets"}

    title = h1[0][2:].strip() if h1 else ""
    if "\n".join(body_wo_h).strip():
        add(parse_section(title, body_wo_h, title_is_heading=bool(title)))
    return {"file_type": file_type, "entries": entries, "mode": "whole"}


# ---------------------------------------------------------------- 导出

def _fmt_date(s):
    if not s:
        return ""
    return s[:10] if len(s) >= 10 else s


def entry_to_markdown(e, heading_level=2):
    h = "#" * heading_level
    title = (e.get("conclusion") or "").strip().replace("\n", " ")
    if not title:
        first = (e.get("raw") or "").strip().split("\n")[0][:40]
        title = "（待整理）" + first
    out = [f"{h} {title}"]
    out.append(f"- id: {e['id']}")
    out.append(f"- 类型: {e.get('type', '短线')}")
    if e.get("system"):
        out.append(f"- 系统: {e['system']}")
    if e.get("status") == "inbox":
        out.append("- 状态: 待整理")
    if e.get("tags"):
        out.append("- 标签: " + "、".join(e["tags"]))
    if e.get("source"):
        out.append(f"- 来源: {e['source']}")
    if e.get("created"):
        out.append(f"- 记录于: {_fmt_date(e['created'])}")
    if e.get("updated") and _fmt_date(e.get("updated")) != _fmt_date(e.get("created")):
        out.append(f"- 更新于: {_fmt_date(e['updated'])}")
    out.append("")
    sub = "#" * (heading_level + 1)
    if e.get("why"):
        out += [f"{sub} 属于哪个系统，为什么", e["why"].strip(), ""]
    if e.get("scene"):
        out += [f"{sub} 应用场景", e["scene"].strip(), ""]
    if e.get("reuse"):
        out += [f"{sub} 快速复用", e["reuse"].strip(), ""]
    if e.get("how"):
        out += [f"{sub} 以后怎么做", e["how"].strip(), ""]
    if e.get("raw"):
        quoted = "\n".join(("> " + l) if l.strip() else ">" for l in e["raw"].strip().split("\n"))
        out += [f"{sub} 原始记录", quoted, ""]
    if e.get("prompt"):
        quoted = "\n".join(("> " + l) if l.strip() else ">" for l in e["prompt"].strip().split("\n"))
        out += [f"{sub} 提示词", quoted, ""]
    return "\n".join(out).rstrip() + "\n"


def entries_to_markdown(entries, type_name, now=None):
    now = now or datetime.now().strftime("%Y-%m-%d %H:%M")
    head = [
        "---",
        f"type: {type_name}",
        "exported_by: 个人经验工作台",
        f"exported_at: {now}",
        f"count: {len(entries)}",
        "---",
        "",
        f"# {type_name}经验",
        "",
        "> 每条经验：一句话结论（标题） / 为什么这样认为 / 以后怎么做 / 原始记录。",
        "> 本文件可直接再次导入工作台；`- id:` 行用于对应同一条经验，请勿修改。",
        "",
    ]
    body = []
    for e in entries:
        body.append(entry_to_markdown(e))
    return "\n".join(head) + "\n".join(body)
