/* 个人经验工作台 —— 前端（原生 JS，无需构建） */
'use strict';

// ============================================================ 基础工具
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPES = ['短线', '长线'];
const SOURCES = ['聊天', '阅读', '学习', '实践', '导入', '其他'];

async function api(method, url, body) {
  return browserApi(method, url, body);
}

function fmtDate(s, withTime) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return String(s).slice(0, 10);
  const now = new Date();
  const diff = (now - d) / 86400000;
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff < 1 && now.getDate() === d.getDate()) return withTime ? `今天 ${hm}` : '今天';
  if (diff < 2 && new Date(now - 86400000).getDate() === d.getDate()) return withTime ? `昨天 ${hm}` : '昨天';
  const ds = d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return withTime ? `${ds} ${hm}` : ds;
}

// ---------- 轻量 Markdown 渲染（只处理常用语法，先转义再渲染，安全）
function inlineMd(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return s;
}
function md(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let html = '', i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; continue;
    }
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { html += `<h4>${inlineMd(m[2])}</h4>`; i++; continue; }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      html += `<blockquote>${md(buf.join('\n'))}</blockquote>`; continue;
    }
    if (/^\s*([-*+]|\d+[.)、])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)、]\s+/.test(l);
      const buf = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)、])\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*+]|\d+[.)、])\s+/, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)、])\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        buf.push(`<li>${inlineMd(item)}</li>`);
      }
      html += ordered ? `<ol>${buf.join('')}</ol>` : `<ul>${buf.join('')}</ul>`; continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|>\s?|\s*([-*+]|\d+[.)、])\s+)/.test(lines[i])) buf.push(inlineMd(lines[i++]));
    html += `<p>${buf.join('<br>')}</p>`;
  }
  return html;
}

// ---------- 相似度（字符二元组 Jaccard，与后端一致）
const normalize = (t) => String(t || '').toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
const bgCache = new Map();
function bigrams(t) {
  const n = normalize(t);
  if (bgCache.has(n)) return bgCache.get(n);
  const set = new Set();
  if (n.length === 1) set.add(n);
  for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2));
  if (bgCache.size > 5000) bgCache.clear();
  bgCache.set(n, set);
  return set;
}
// 用 IDF 加权的“重合度”：常见词（如 AI、需求）权重低，专有表达权重高
let DF = new Map(), DFN = 0;
function buildDf() {
  DF = new Map(); const es = S.entries.filter((e) => e.status === 'active' || e.status === 'inbox'); DFN = es.length;
  for (const e of es) for (const g of bigrams(entryText(e))) DF.set(g, (DF.get(g) || 0) + 1);
}
const idf = (g) => Math.log(1 + (DFN + 1) / ((DF.get(g) || 0) + 1));
function sim(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0, sa = 0, sb = 0;
  for (const g of A) { const w = idf(g); sa += w; if (B.has(g)) inter += w; }
  for (const g of B) sb += idf(g);
  const small = Math.min(A.size, B.size);
  const cont = inter / Math.min(sa, sb);
  // 太短的文本容易“被包含”，向 Jaccard 靠拢
  const jac = inter / (sa + sb - inter);
  return small < 6 ? jac : cont * 0.7 + jac * 0.3;
}
const SIM_RELATED = 0.06, SIM_DUP = 0.5;
const entryText = (e) => {
  const j = [e.conclusion, e.why, e.how].filter(Boolean).join('\n');
  return normalize(j) ? j : (e.raw || '');
};

// ============================================================ 状态
const S = {
  entries: [], notDup: [], config: {}, info: {},
  view: 'all', tag: null, q: '', sort: 'updated',
  selectedId: null, editing: null, // editing: {id|null, draft}
  limit: 200,
};
const byId = (id) => S.entries.find((e) => e.id === id);
const alive = () => S.entries.filter((e) => e.status === 'active' || e.status === 'inbox');
const incomplete = (e) => e.status !== 'inbox' && (!e.why || !e.how);
// 分类内按记录时间从早到晚编号；并列时沿用原有记录顺序。
function experienceNumbers() {
  const numbers = new Map();
  for (const type of TYPES) {
    const entries = S.entries.filter(e => e.status === 'active' && e.type === type);
    entries.sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')));
    entries.forEach((e, i) => numbers.set(e.id, i + 1));
  }
  return numbers;
}
function numberChip(e, numbers) {
  const n = numbers.get(e.id);
  return n ? `<span class="chip number ${esc(e.type)}" title="${esc(e.type)}第 ${n} 条" aria-label="${esc(e.type)}第 ${n} 条">${n}</span>` : '';
}


async function loadState() {
  const d = await api('GET', '/api/state');
  S.entries = d.entries; S.notDup = d.not_duplicates || []; S.config = d.config; S.info = d.info;
}
function upsertLocal(e) {
  const i = S.entries.findIndex((x) => x.id === e.id);
  if (i >= 0) S.entries[i] = e; else S.entries.push(e);
}

// ============================================================ 过滤 / 搜索
const VIEWS = [
  { id: 'inbox', name: '收件箱', icon: '📥', hint: '随手记下、还没整理的想法' },
  { id: 'all', name: '全部经验', icon: '📚' },
  { id: '短线', name: '短线', dot: 'var(--short)' },
  { id: '长线', name: '长线', dot: 'var(--long)' },
  { id: 'todo', name: '待补全', icon: '✎', hint: '缺“为什么”或“怎么做”的经验' },
  { sep: true },
  { id: 'dups', name: '可能重复', icon: '⧉' },
  { id: 'trash', name: '回收站 / 已合并', icon: '🗑' },
];
function inView(e, v) {
  switch (v) {
    case 'inbox': return e.status === 'inbox';
    case 'all': return e.status === 'active' || e.status === 'inbox';
    case '短线': case '长线': return e.status === 'active' && e.type === v;
    case 'todo': return e.status === 'active' && incomplete(e);
    case 'trash': return e.status === 'trashed' || e.status === 'merged';
    default: return false;
  }
}
function terms() { return S.q.trim().toLowerCase().split(/\s+/).filter(Boolean); }
function matchQ(e, ts) {
  if (!ts.length) return true;
  const hay = [e.conclusion, e.why, e.how, e.raw, e.prompt, (e.tags || []).join(' '), e.source, e.source_file].join('\n').toLowerCase();
  return ts.every((t) => hay.includes(t));
}
function filtered() {
  const ts = terms();
  let list = S.entries.filter((e) => inView(e, S.view) && matchQ(e, ts) && (!S.tag || (e.tags || []).includes(S.tag)));
  const key = S.sort === 'updated' ? 'updated' : 'created';
  list.sort((a, b) => (S.sort === 'oldest' ? 1 : -1) * String(a[key] || '').localeCompare(String(b[key] || '')));
  return list;
}
function hl(text, ts) {
  let s = esc(text);
  if (!ts.length) return s;
  for (const t of ts) {
    const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    s = s.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return s;
}
function snippetAround(text, ts, len = 70) {
  const t = String(text || '').replace(/\s+/g, ' ');
  if (!ts.length) return t.slice(0, len);
  const low = t.toLowerCase();
  const idx = Math.min(...ts.map((x) => { const i = low.indexOf(x); return i < 0 ? Infinity : i; }));
  if (!isFinite(idx)) return t.slice(0, len);
  const start = Math.max(0, idx - 18);
  return (start ? '…' : '') + t.slice(start, start + len);
}

// ============================================================ 渲染：侧边栏
function renderNav() {
  const counts = {};
  for (const v of VIEWS) if (v.id && v.id !== 'dups') counts[v.id] = S.entries.filter((e) => inView(e, v.id)).length;
  $('#nav').innerHTML = VIEWS.map((v) => {
    if (v.sep) return '<div class="nav-sep"></div>';
    const c = v.id === 'dups' ? '' : (counts[v.id] || '');
    const lead = v.dot ? `<span class="dot" style="background:${v.dot}"></span>` : `<span style="width:16px;text-align:center">${v.icon}</span>`;
    return `<button class="nav-item ${S.view === v.id ? 'active' : ''}" data-view="${v.id}" title="${esc(v.hint || '')}">${lead}${v.name}<span class="count">${c}</span></button>`;
  }).join('');
  const tagCount = {};
  for (const e of alive()) for (const t of e.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 40);
  $('#tagCloud').innerHTML = tags.length
    ? tags.map(([t, n]) => `<span class="tag ${S.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)} · ${n}</span>`).join('')
    : '<span class="empty">给经验加标签后会出现在这里</span>';
}

// ============================================================ 渲染：列表
function renderList() {
  if (S.view === 'dups') return renderDupList();
  const list = filtered();
  const ts = terms();
  const viewName = VIEWS.find((v) => v.id === S.view)?.name || '';
  let head = `<span>${viewName} · ${list.length} 条</span>`;
  if (S.tag) head += `<button class="chip-x" data-cleartag>标签：${esc(S.tag)} ✕</button>`;
  if (S.q) head += `<button class="chip-x" data-clearq>搜索：${esc(S.q)} ✕</button>`;
  $('#listHead').innerHTML = head;

  if (!list.length) {
    const msg = S.q || S.tag ? ['🔍', '没有找到匹配的经验，换个关键词试试'] :
      S.view === 'inbox' ? ['📥', '收件箱是空的。<br>聊天时有想法，按 <kbd>N</kbd> 随手记下就行。'] :
      S.view === 'trash' ? ['🗑', '回收站是空的'] :
      S.view === 'todo' ? ['✓', '所有经验都已经写全了'] :
      ['🌱', '还没有经验。<br>按 <kbd>N</kbd> 记录第一条，或从左下角导入 Markdown。'];
    $('#list').innerHTML = `<div class="empty-list"><div class="big">${msg[0]}</div>${msg[1]}</div>`;
    return;
  }
  const shown = list.slice(0, S.limit);
  const numbers = experienceNumbers();
  $('#list').innerHTML = shown.map((e) => {
    const title = e.conclusion
      ? `<div class="card-title">${hl(e.conclusion, ts)}</div>`
      : `<div class="card-title muted">${hl(snippetAround(e.raw, ts, 80), ts)}</div>`;
    let sub = '';
    if (ts.length && !matchQ({ conclusion: e.conclusion, tags: [] }, ts)) {
      const where = [['为什么', e.why], ['怎么做', e.how], ['原文', e.raw]].find(([, v]) => matchQ({ conclusion: v || '', tags: [] }, ts));
      if (where) sub = `<div class="card-how"><b>${where[0]}：</b>${hl(snippetAround(where[1], ts), ts)}</div>`;
    } else if (e.how) sub = `<div class="card-how"><b>怎么做：</b>${esc(String(e.how).replace(/\s+/g, ' ').slice(0, 90))}</div>`;
    const chips = [];
    if (e.status === 'inbox') chips.push('<span class="chip inbox">待整理</span>');
    else if (e.status === 'merged') chips.push('<span class="chip ghost">已合并</span>');
    else if (e.status === 'trashed') chips.push('<span class="chip ghost">回收站</span>');
    chips.push(`<span class="chip ${e.type}">${e.type}</span>${numberChip(e, numbers)}`);
    if (e.status === 'active' && incomplete(e)) chips.push('<span class="chip todo">待补全</span>');
    const tags = (e.tags || []).length ? `<div class="card-tags">${e.tags.slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : '';
    return `<div class="card ${S.selectedId === e.id ? 'selected' : ''}" data-id="${e.id}">
      <div class="card-top">${chips.join('')}<span class="date">${fmtDate(S.sort === 'updated' ? e.updated : e.created)}</span></div>
      ${title}${sub}${tags}</div>`;
  }).join('') + (list.length > S.limit ? `<button class="more" data-more>再显示 ${Math.min(200, list.length - S.limit)} 条（共 ${list.length}）</button>` : '');
}

// ---------- 重复检测
function dupPairs() {
  const es = S.entries.filter((e) => e.status === 'active' || e.status === 'inbox');
  const ignore = new Set(S.notDup.map((p) => p.join('|')));
  const pairs = [];
  for (let i = 0; i < es.length; i++) {
    const ti = entryText(es[i]);
    for (let j = i + 1; j < es.length; j++) {
      const s = sim(ti, entryText(es[j]));
      if (s >= SIM_DUP) {
        const key = [es[i].id, es[j].id].sort().join('|');
        if (!ignore.has(key)) pairs.push({ a: es[i], b: es[j], s });
      }
    }
  }
  return pairs.sort((x, y) => y.s - x.s);
}
function renderDupList() {
  const pairs = dupPairs();
  $('#listHead').innerHTML = `<span>可能重复 · ${pairs.length} 组（按相似度排序）</span>`;
  if (!pairs.length) { $('#list').innerHTML = '<div class="empty-list"><div class="big">✓</div>没有发现明显重复的经验</div>'; return; }
  const label = (e) => esc(e.conclusion || String(e.raw || '').slice(0, 60));
  $('#list').innerHTML = pairs.slice(0, 100).map((p) => `
    <div class="dup-pair">
      <div class="side" data-id="${p.a.id}"><span class="chip ${p.a.type}">${p.a.type}</span> ${label(p.a)}</div>
      <div class="side" data-id="${p.b.id}"><span class="chip ${p.b.type}">${p.b.type}</span> ${label(p.b)}</div>
      <div class="acts">
        <span class="badge similar">${Math.round(p.s * 100)}%</span>
        <button class="btn" data-merge="${p.a.id}|${p.b.id}">合并</button>
        <button class="btn" data-notdup="${p.a.id}|${p.b.id}">不重复</button>
      </div>
    </div>`).join('');
}

// ============================================================ 渲染：详情
function renderDetail() {
  const el = $('#detail');
  const key = (S.editing ? 'edit:' + S.editing.id : 'read:') + S.selectedId;
  const fresh = key !== S._lastKey; S._lastKey = key;
  if (S.editing) { el.innerHTML = editorHtml(); bindEditor(); if (fresh) $('.detail', el).classList.add('rise'); return; }
  const e = S.selectedId && byId(S.selectedId);
  if (!e) { el.innerHTML = welcomeHtml(); el.classList.remove('open'); return; }
  el.classList.add('open');
  const ts = terms();
  const isTrash = e.status === 'trashed' || e.status === 'merged';
  const other = e.type === '短线' ? '长线' : '短线';
  let bar = `<button class="btn back-mobile" data-act="back">← 返回</button>`;
  if (isTrash) {
    bar += `<button class="btn primary" data-act="restore">恢复这条</button><span class="spacer"></span><button class="btn danger" data-act="destroy">彻底删除</button>`;
  } else {
    bar += `<button class="btn primary" data-act="edit">${e.status === 'inbox' ? '整理这条' : '编辑'} <kbd>E</kbd></button>
      <button class="btn" data-act="switch">转为${other}</button>
      <button class="btn" data-act="copy">复制 Markdown</button>
      <span class="spacer"></span>
      <button class="btn danger" data-act="trash">移到回收站</button>`;
  }
  let notice = '';
  if (e.status === 'inbox') notice = `<div class="notice inbox">📥 这是一条随手记，还没整理。花一分钟提炼成「结论 / 为什么 / 怎么做」，以后会更好用。</div>`;
  if (e.status === 'merged') { const t = byId(e.merged_into); notice = `<div class="notice">这条已合并到：<a href="#" data-goto="${e.merged_into}">${esc(t?.conclusion || e.merged_into)}</a></div>`; }
  if (e.status === 'trashed') notice = `<div class="notice">这条在回收站中（${fmtDate(e.trashed_at, true)} 移入）。恢复后会回到原来的位置。</div>`;

  const block = (cls, label, val, field, hint) => val
    ? `<div class="block ${cls}"><div class="block-label">${label}</div><div class="block-body">${ts.length ? hlMd(val, ts) : md(val)}</div></div>`
    : (isTrash ? '' : `<div class="block ${cls}"><div class="block-label">${label}</div><div class="block-body missing" data-fill="${field}">＋ ${hint}</div></div>`);

  const tags = (e.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const meta = [
    `<span class="chip ${e.type}">${e.type}</span>${numberChip(e, experienceNumbers())}`,
    tags ? `<span class="tags">${tags}</span>` : '',
    e.source ? `<span>来源：${esc(e.source)}</span>` : '',
    `<span>记录于 ${fmtDate(e.created, true)}</span>`,
    e.updated && e.updated !== e.created ? `<span>修改于 ${fmtDate(e.updated, true)}</span>` : '',
    e.source_file ? `<span title="导入自">📄 ${esc(e.source_file)}</span>` : '',
  ].filter(Boolean).join('');

  const sims = isTrash ? [] : similarTo(e, 4);
  const simHtml = sims.length ? `<div class="sub-section"><div class="sub-title">相关的经验</div>${sims.map(({ e: x, s }) => `
    <div class="sim-item"><span class="chip ${x.type}">${x.type}</span><span class="t" data-goto="${x.id}">${esc(x.conclusion || String(x.raw).slice(0, 60))}</span>
    <span class="score">${s >= SIM_DUP ? '可能重复 · ' : ''}${Math.round(s * 100)}%</span><button class="btn" data-merge="${e.id}|${x.id}">合并</button></div>`).join('')}</div>` : '';
  const hist = (e.history || []).slice().reverse();
  const histHtml = hist.length ? `<div class="sub-section"><details><summary class="sub-title" style="cursor:pointer">修改历史（${hist.length}）</summary>${hist.map((h, i) => `
    <div class="hist-item"><span style="color:var(--ink-3)">${fmtDate(h.at, true)}</span><span class="t">${esc(h.conclusion || String(h.raw || '').slice(0, 50))}</span>
    <button class="btn" data-viewhist="${hist.length - 1 - i}">查看</button></div>`).join('')}</details></div>` : '';

  el.innerHTML = `<div class="detail">
    <div class="detail-toolbar">${bar}</div>
    ${notice}
    ${e.conclusion ? `<h1 class="conclusion">${ts.length ? hl(e.conclusion, ts) : esc(e.conclusion)}</h1>` : `<h1 class="conclusion placeholder">${isTrash ? '（没有结论）' : '还没有一句话结论'}</h1>`}
    <div class="meta">${meta}</div>
    ${e.status === 'inbox' ? '' : block('why', '为什么这样认为', e.why, 'why', '补充：当时为什么会这样认为？依据或经历是什么？')}
    ${e.status === 'inbox' ? '' : block('how', '以后怎么做', e.how, 'how', '补充：下次遇到类似情况，具体怎么做？')}
    ${e.raw ? `<details class="raw" ${e.status === 'inbox' || !e.conclusion || (ts.length && matchQ({ conclusion: e.raw, tags: [] }, ts)) ? 'open' : ''}><summary>原始记录</summary><div class="block-body">${ts.length ? hlMd(e.raw, ts) : md(e.raw)}</div></details>` : ''}
    <details class="raw" ${ts.length && e.prompt && matchQ({ conclusion: e.prompt, tags: [] }, ts) ? 'open' : ''}><summary>提示词</summary><div class="block-body">${e.prompt ? (ts.length ? hlMd(e.prompt, ts) : md(e.prompt)) : '<span class="missing" data-fill="prompt">＋ 添加提示词</span>'}${e.prompt && !isTrash ? '<div style="margin-top:10px"><button class="btn" data-act="copyPrompt">复制提示词</button></div>' : ''}</div></details>
    ${simHtml}${histHtml}
  </div>`;
  if (fresh) $('.detail', el).classList.add('rise');
}
function hlMd(text, ts) {
  // 渲染后在文本节点里高亮
  const div = document.createElement('div');
  div.innerHTML = md(text);
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const low = n.nodeValue.toLowerCase();
    if (!ts.some((t) => low.includes(t))) continue;
    const span = document.createElement('span');
    span.innerHTML = hl(n.nodeValue, ts);
    n.replaceWith(...span.childNodes);
  }
  return div.innerHTML;
}
function similarTo(e, n = 4, threshold = SIM_RELATED) {
  const t = entryText(e);
  const ignore = new Set(S.notDup.map((p) => p.join('|')));
  return alive().filter((x) => x.id !== e.id && !ignore.has([e.id, x.id].sort().join('|')))
    .map((x) => ({ e: x, s: sim(t, entryText(x)) }))
    .filter((x) => x.s >= threshold).sort((a, b) => b.s - a.s).slice(0, n);
}
function welcomeHtml() {
  const a = alive();
  if (!S.entries.length) {
    return `<div class="welcome">
      <h2>把有价值的想法留下来</h2>
      <div>和 AI 聊天、读书、动手时冒出的经验，都可以在这里记下、整理、重温。</div>
      <div class="steps">
        <div class="step"><b>1</b><span>导入现有的 Harness Markdown（短线 / 长线）</span><button class="btn" data-act="import">导入</button></div>
        <div class="step"><b>2</b><span>有新想法时按 <kbd>N</kbd>，粘贴进来就算记下了</span><button class="btn" data-act="capture">记一下</button></div>
        <div class="step"><b>3</b><span>有空时把收件箱里的想法整理成「结论 / 为什么 / 怎么做」</span></div>
        <div class="step"><b>4</b><span>导出 Markdown，交给 Agent 继续维护 Harness</span><button class="btn" data-act="export">导出</button></div>
      </div></div>`;
  }
  const inbox = a.filter((e) => e.status === 'inbox').length;
  const todo = a.filter((e) => e.status === 'active' && incomplete(e)).length;
  return `<div class="welcome">
    <h2>今天想起点什么？</h2>
    <div class="stats">
      <div class="stat"><div class="n">${a.filter((e) => e.status === 'active' && e.type === '短线').length}</div><div class="l">短线</div></div>
      <div class="stat"><div class="n">${a.filter((e) => e.status === 'active' && e.type === '长线').length}</div><div class="l">长线</div></div>
      <div class="stat"><div class="n">${inbox}</div><div class="l">待整理</div></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="btn primary big" data-act="capture">＋ 记一下</button>
      ${inbox ? `<button class="btn big" data-act="goinbox">整理收件箱（${inbox}）</button>` : ''}
      ${todo ? `<button class="btn big" data-act="gotodo">补全 ${todo} 条经验</button>` : ''}
      <button class="btn big" data-act="review">🎲 随机重温一条</button>
    </div>
    <div style="margin-top:22px;font-size:12px;color:var(--ink-3)">快捷键：<kbd>N</kbd> 记一下 · <kbd>/</kbd> 搜索 · <kbd>J</kbd>/<kbd>K</kbd> 上下切换 · <kbd>E</kbd> 编辑 · <kbd>Esc</kbd> 关闭</div>
  </div>`;
}

// ============================================================ 编辑器
function startEdit(id, focusField) {
  const e = id ? byId(id) : null;
  S.editing = {
    id: e?.id || null,
    focus: focusField || (e && !e.conclusion ? 'conclusion' : null),
    draft: {
      type: e?.type || '短线', conclusion: e?.conclusion || '', why: e?.why || '', how: e?.how || '',
      raw: e?.raw || '', prompt: e?.prompt || '', tags: [...(e?.tags || [])], source: e?.source || '聊天',
    },
  };
  renderDetail();
}
function editorHtml() {
  const d = S.editing.draft;
  const e = S.editing.id ? byId(S.editing.id) : null;
  const srcOpts = SOURCES.concat(d.source && !SOURCES.includes(d.source) ? [d.source] : [])
    .map((s) => `<option ${s === d.source ? 'selected' : ''}>${esc(s)}</option>`).join('');
  return `<div class="detail editor">
    <div class="detail-toolbar"><b style="font-size:15px">${e ? (e.status === 'inbox' ? '整理这条想法' : '编辑经验') : '新经验'}</b>
      <span class="spacer"></span><span style="font-size:12px;color:var(--ink-3)">只写你真正想到的，空着也没关系</span></div>
    <div class="row">
      <div class="seg" id="segType">${TYPES.map((t) => `<button class="${t} ${d.type === t ? 'on' : ''}" data-type="${t}">${t}</button>`).join('')}</div>
      <select class="inline" id="fSource" title="来源">${srcOpts}</select>
      <div class="tag-input" id="tagInput">${d.tags.map((t) => `<span class="tag">${esc(t)}<button data-rmtag="${esc(t)}">×</button></span>`).join('')}
        <input id="fTag" list="tagList" placeholder="${d.tags.length ? '' : '加标签，回车确认'}"><datalist id="tagList">${allTags().map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
    </div>
    <div class="field"><label>一句话结论 <span class="hint" id="cLen"></span></label>
      <input type="text" class="f-conclusion" id="fConclusion" value="${esc(d.conclusion)}" placeholder="用一句话说清这条经验，例如：先让 AI 复述需求再执行"></div>
    <div class="field"><label>为什么这样认为 <span class="hint">依据、经历、当时的情境</span></label>
      <textarea id="fWhy" placeholder="是什么让你得出这个结论？">${esc(d.why)}</textarea></div>
    <div class="field"><label>以后怎么做 <span class="hint">写成下次能直接照做的动作</span></label>
      <textarea id="fHow" placeholder="下次遇到类似情况，具体怎么做？">${esc(d.how)}</textarea></div>
    <div class="field"><label>原始记录 <span class="hint">保留原话，不会被改写</span></label>
      <button type="button" class="btn" id="reparseRaw">从原始记录重新识别</button>
      ${d.raw ? `<div class="raw-helper-tip">点击下面的句子，可插入到上面正在编辑的栏目里</div><div class="raw-helper" id="rawHelper">${sentenceSpans(d.raw)}</div>` : ''}
      <textarea id="fRaw" style="margin-top:8px;${d.raw ? 'min-height:70px' : ''}" placeholder="可粘贴聊天片段、读书摘录或当时的原话">${esc(d.raw)}</textarea></div>
    <details class="raw" ${S.editing.focus === 'prompt' ? 'open' : ''}><summary>提示词</summary><div class="field" style="margin-top:10px"><textarea id="fPrompt" aria-label="提示词" placeholder="把这条经验对应的提示词保存在这里">${esc(d.prompt || '')}</textarea></div></details>
    <div id="editSims"></div>
    <div class="editor-actions">
      <button class="btn primary big" id="btnSave">保存 <kbd style="color:inherit;border-color:currentColor;background:transparent">Ctrl/⌘ + Enter</kbd></button>
      <button class="btn big" id="btnCancel">取消</button>
      <button class="btn big" id="btnPasteStructured">粘贴匹配格式</button>
      <span class="spacer"></span><span class="tip">自动保存草稿，误关也不会丢</span>
    </div>
  </div>`;
}
function sentenceSpans(raw) {
  const parts = String(raw).split(/(?<=[。！？!?；;\n])/);
  return parts.map((p) => p.trim() ? `<span class="s">${esc(p)}</span>` : esc(p)).join('').replace(/\n/g, '<br>');
}
function allTags() {
  const set = new Set();
  for (const e of alive()) for (const t of e.tags || []) set.add(t);
  return [...set].sort();
}
let lastFocusField = 'fConclusion';
function bindEditor() {
  const d = S.editing.draft;
  const bind = (id, key) => { const el = $('#' + id); el.addEventListener('input', () => { d[key] = el.value; saveDraft(); if (key !== 'raw') updateEditSims(); }); el.addEventListener('focus', () => { lastFocusField = id; }); };
  bind('fConclusion', 'conclusion'); bind('fWhy', 'why'); bind('fHow', 'how'); bind('fRaw', 'raw'); bind('fPrompt', 'prompt');
  const cl = () => { const n = d.conclusion.length; $('#cLen').textContent = n ? `${n} 字${n > 50 ? ' · 试试更短一点' : ''}` : ''; };
  $('#fConclusion').addEventListener('input', cl); cl();
  $('#fSource').addEventListener('change', (ev) => { d.source = ev.target.value; saveDraft(); });
  $$('#segType button').forEach((b) => b.addEventListener('click', () => { d.type = b.dataset.type; $$('#segType button').forEach((x) => x.classList.toggle('on', x === b)); saveDraft(); }));
  const tagIn = $('#fTag');
  const addTag = () => {
    const vals = tagIn.value.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
    let changed = false;
    for (const v of vals) if (!d.tags.includes(v)) { d.tags.push(v); changed = true; }
    tagIn.value = '';
    if (changed) { saveDraft(); refreshEditorKeep(); }
  };
  tagIn.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); addTag(); }
    if (ev.key === 'Backspace' && !tagIn.value && d.tags.length) { d.tags.pop(); saveDraft(); refreshEditorKeep(); }
  });
  tagIn.addEventListener('change', addTag);
  $$('[data-rmtag]').forEach((b) => b.addEventListener('click', () => { d.tags = d.tags.filter((t) => t !== b.dataset.rmtag); saveDraft(); refreshEditorKeep(); }));
  $$('#rawHelper .s').forEach((s) => s.addEventListener('click', () => {
    const target = ['fConclusion', 'fWhy', 'fHow'].includes(lastFocusField) ? lastFocusField : 'fConclusion';
    const el = $('#' + target);
    const txt = s.textContent.trim();
    if (target === 'fConclusion') el.value = el.value ? el.value + txt : txt;
    else el.value = el.value ? el.value.replace(/\s*$/, '') + '\n' + txt : txt;
    el.dispatchEvent(new Event('input')); el.focus();
    toast(`已插入到「${{ fConclusion: '一句话结论', fWhy: '为什么', fHow: '怎么做' }[target]}」`);
  }));
  $('#reparseRaw').addEventListener('click', async () => {
    const raw = d.raw;
    if (!raw.trim()) { toast('原始记录为空', true); return; }
    try {
      const parsed = await api('POST', '/api/parse', { files: [{ filename: '粘贴的内容.md', text: raw }] });
      const entries = parsed.files.flatMap(f => f.entries);
      if (entries.length !== 1 || !entries[0].conclusion || !(entries[0].why || entries[0].how)) {
        toast('未识别到标题和原因或做法，原有内容未改变', true); return;
      }
      if (!confirm('将用原始记录重新填写标题、原因和做法，替换这三个栏目目前的内容。原始记录会保留。确定继续吗？')) return;
      const e = entries[0];
      Object.assign(d, { conclusion: e.conclusion, why: e.why, how: e.how });
      saveDraft(); refreshEditorKeep(); toast('已重新识别，请检查后保存');
    } catch (err) { toast('识别失败：' + err.message, true); }
  });
  $('#btnSave').addEventListener('click', saveEdit);
  $('#btnCancel').addEventListener('click', cancelEdit);
  $('#btnPasteStructured').addEventListener('click', openStructuredPaste);
  updateEditSims();
  const f = S.editing.focus === 'why' ? 'fWhy' : S.editing.focus === 'how' ? 'fHow' : S.editing.focus === 'prompt' ? 'fPrompt' : S.editing.focus === 'tag' ? 'fTag' : S.editing.focus === 'conclusion' ? 'fConclusion' : null;
  if (f) { const el = $('#' + f); el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); lastFocusField = f; }
  S.editing.focus = null;
}
function refreshEditorKeep() { S.editing.focus = 'tag'; renderDetail(); }
function updateEditSims() {
  const box = $('#editSims'); if (!box) return;
  const d = S.editing.draft;
  const fake = { id: S.editing.id || '__new', conclusion: d.conclusion, why: d.why, how: d.how, raw: d.raw };
  if (normalize(entryText(fake)).length < 6) { box.innerHTML = ''; return; }
  const sims = similarTo(fake, 3);
  box.innerHTML = sims.length ? `<div class="notice" style="display:block"><div style="margin-bottom:6px">💡 已有相似经验，也许可以合并而不是新增：</div>${sims.map(({ e, s }) => `
    <div class="sim-item"><span class="chip ${e.type}">${e.type}</span><span class="t" data-peek="${e.id}">${esc(e.conclusion || String(e.raw).slice(0, 60))}</span><span class="score">${Math.round(s * 100)}%</span></div>`).join('')}</div>` : '';
  $$('[data-peek]', box).forEach((x) => x.addEventListener('click', () => peekEntry(x.dataset.peek)));
}
const DRAFT_KEY = 'ewb-draft';
function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(S.editing)); } catch (_) {} }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }
async function saveEdit() {
  const ed = S.editing; if (!ed) return;
  const d = { ...ed.draft };
  if (!normalize([d.conclusion, d.why, d.how, d.raw, d.prompt].join(''))) { toast('还什么都没写呢', true); return; }
  try {
    let e;
    if (ed.id) {
      const cur = byId(ed.id);
      if (cur.status === 'inbox' && d.conclusion.trim()) d.status = 'active';
      e = (await api('PUT', '/api/entries/' + ed.id, d)).entry;
    } else {
      d.status = d.conclusion.trim() ? 'active' : 'inbox';
      e = (await api('POST', '/api/entries', d)).entry;
    }
    upsertLocal(e);
    S.editing = null; clearDraft();
    S.selectedId = e.id;
    if (!inView(e, S.view) && S.view !== 'dups') S.view = e.status === 'inbox' ? 'inbox' : 'all';
    renderAll(); toast(ed.id ? '已保存' : '已记下');
  } catch (err) { toast('保存失败：' + err.message, true); }
}
function cancelEdit() {
  const ed = S.editing;
  const orig = ed.id ? byId(ed.id) : null;
  const d = ed.draft;
  const dirty = orig ? ['conclusion', 'why', 'how', 'raw', 'prompt', 'type', 'source'].some((k) => (orig[k] || '') !== (d[k] || '')) || (orig.tags || []).join() !== d.tags.join()
    : normalize([d.conclusion, d.why, d.how, d.raw, d.prompt].join(''));
  if (dirty && !confirm('有未保存的修改，确定放弃吗？')) return;
  S.editing = null; clearDraft(); renderDetail();
}

// ============================================================ 弹窗
function openModal(html, { wide = false, onClose } = {}) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`;
  const bd = $('.modal-backdrop', root);
  bd.addEventListener('mousedown', (ev) => { if (ev.target === bd) closeModal(); });
  root._onClose = onClose;
  return $('.modal', root);
}
function closeModal() {
  const root = $('#modalRoot');
  if (root._onClose) { const f = root._onClose; root._onClose = null; if (f() === false) return; }
  root.innerHTML = '';
}
const modalOpen = () => !!$('#modalRoot').innerHTML;

// ---------- 编辑经验：粘贴完整修改稿后直接识别并应用
function openStructuredPaste() {
  const editing = S.editing;
  if (!editing) return;
  const m = openModal(`
    <h3>粘贴并匹配格式</h3>
    <div class="sub">识别后直接填入标题、原因和做法；原始记录和提示词保留，最后点「保存」。</div>
    <details open><summary>查看可用格式</summary><pre class="pre-md">标题：一句话结论

为什么这样认为：
写下依据、经历或情境。

以后怎么做：
1. 写下具体行动。
2. 可以继续分条。</pre><div class="sub" style="margin:8px 0">也支持「1. 为什么这样认为？」等编号标题，以及 Markdown 标题。</div></details>
    <div class="row"><button class="btn" id="pasteFromClipboard">从剪贴板粘贴</button><span class="sub" style="margin:0">也可点击输入框，按 ⌘V / Ctrl+V</span></div>
    <textarea id="structuredPasteText" class="capture" aria-label="粘贴完整修改稿" placeholder="在这里粘贴完整修改稿" style="margin-top:10px"></textarea>
    <div id="structuredPasteError"></div>
    <div class="actions"><button class="btn" id="structuredPasteCancel">取消</button><button class="btn primary" id="structuredPasteApply">识别并应用</button></div>`, { wide: true });
  const input = $('#structuredPasteText', m), error = $('#structuredPasteError', m);
  input.addEventListener('input', () => { error.innerHTML = ''; });
  $('#structuredPasteCancel', m).addEventListener('click', closeModal);
  $('#pasteFromClipboard', m).addEventListener('click', async () => {
    try { const text = await navigator.clipboard.readText(); if (!text) { toast('剪贴板没有文本，请手动粘贴', true); return; } input.value = text; error.innerHTML = ''; input.focus(); }
    catch (_) { input.focus(); toast('请在输入框按 ⌘V / Ctrl+V 粘贴', true); }
  });
  $('#structuredPasteApply', m).addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) { toast('请先粘贴修改稿', true); input.focus(); return; }
    try {
      const parsed = await api('POST', '/api/parse', { files: [{ filename: '粘贴的内容.md', text }] });
      if (S.editing !== editing || !m.isConnected || input.value.trim() !== text) return;
      const entries = parsed.files.flatMap(f => f.entries);
      if (entries.length !== 1 || !entries[0].conclusion || !entries[0].why || !entries[0].how) {
        error.innerHTML = '<div class="notice" style="margin-top:12px">未完整识别。请按示例填写标题、为什么这样认为和以后怎么做三个栏目，原有内容没有改变。</div>';
        return;
      }
      const matched = entries[0];
      Object.assign(editing.draft, { conclusion: matched.conclusion, why: matched.why, how: matched.how });
      saveDraft(); closeModal(); renderDetail(); toast('已填入，请检查后保存');
    } catch (err) { toast('识别失败：' + err.message, true); }
  });
}

// ---------- 快速记录
function openCapture(prefill = '') {
  const m = openModal(`
    <h3>记一下</h3>
    <div class="sub">把想法、聊天片段或摘录直接粘贴进来。已有「标题、为什么这样认为、以后怎么做」时，可直接识别并填写。</div>
    <textarea class="capture" id="cText" placeholder="刚刚想到……">${esc(prefill)}</textarea>
    <div class="row">
      <div class="seg" id="cType">${TYPES.map((t, i) => `<button class="${t} ${i === 0 ? 'on' : ''}" data-type="${t}">${t}</button>`).join('')}</div>
      <select class="inline" id="cSource">${SOURCES.filter((s) => s !== '导入').map((s) => `<option>${s}</option>`).join('')}</select>
      <input type="text" id="cTags" list="cTagList" placeholder="标签（可选，逗号分隔）" style="flex:1;min-width:140px;padding:6px 10px"><datalist id="cTagList">${allTags().map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
    </div>
    <div class="sims" id="cSims"></div>
    <div class="actions">
      <span style="font-size:12px;color:var(--ink-3)">Ctrl/⌘ + Enter 存入收件箱</span><span class="spacer"></span>
      <button class="btn" id="cParse">识别格式并填写</button>
      <button class="btn" id="cOrganize">存下并马上整理</button>
      <button class="btn primary" id="cSave">存入收件箱</button>
    </div>`, {
    onClose: () => { const v = $('#cText')?.value.trim(); if (v && !$('#cText').dataset.saved && !confirm('还没保存，确定关闭吗？')) return false; },
  });
  let type = '短线';
  $$('#cType button', m).forEach((b) => b.addEventListener('click', () => { type = b.dataset.type; $$('#cType button', m).forEach((x) => x.classList.toggle('on', x === b)); }));
  const ta = $('#cText', m); ta.focus();
  const sims = () => {
    if (!$('#cSims')) return;
    const v = ta.value;
    if (normalize(v).length < 6) { $('#cSims').innerHTML = ''; return; }
    const r = similarTo({ id: '__new', conclusion: '', why: '', how: '', raw: v }, 3);
    $('#cSims').innerHTML = r.length ? `<div class="notice" style="display:block;margin:0"><div style="margin-bottom:6px">💡 你以前记过相似的：</div>${r.map(({ e, s }) => `
      <div class="sim-item"><span class="chip ${e.type}">${e.type}</span><span class="t" data-peek="${e.id}">${esc(e.conclusion || String(e.raw).slice(0, 60))}</span><span class="score">${Math.round(s * 100)}%</span></div>`).join('')}</div>` : '';
    $$('[data-peek]', m).forEach((x) => x.addEventListener('click', () => peekEntry(x.dataset.peek)));
  };
  let tmr; ta.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(sims, 250); });
  const save = async (organize) => {
    const raw = ta.value.trim();
    if (!raw) { toast('先写点什么吧', true); ta.focus(); return; }
    const tags = $('#cTags').value.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
    try {
      const e = (await api('POST', '/api/entries', { type, raw, tags, source: $('#cSource').value, status: 'inbox' })).entry;
      upsertLocal(e); ta.dataset.saved = '1'; closeModal();
      if (organize) { S.view = 'inbox'; S.selectedId = e.id; renderAll(); startEdit(e.id, 'conclusion'); }
      else { if (S.view === 'inbox' || S.view === 'all') S.selectedId = e.id; renderAll(); toast('已存入收件箱'); }
    } catch (err) { toast('保存失败：' + err.message, true); }
  };
  $('#cParse', m).addEventListener('click', async () => {
    const raw = ta.value.trim();
    if (!raw) { toast('先粘贴要识别的内容', true); return; }
    if (S.editing) { toast('请先保存或取消正在编辑的经验', true); return; }
    try {
      const parsed = await api('POST', '/api/parse', { files: [{ filename: '粘贴的内容.md', text: raw }] });
      const entries = parsed.files.flatMap(f => f.entries);
      if (entries.length !== 1 || !entries[0].structured || !entries[0].conclusion || !(entries[0].why || entries[0].how)) {
        toast('未识别到一条带标题的经验，请检查格式；原文仍保留在这里', true); return;
      }
      const e = entries[0];
      const tags = $('#cTags', m).value.split(/[,，、\s]+/).map(x => x.trim()).filter(Boolean);
      const source = $('#cSource', m).value;
      ta.dataset.saved = '1'; closeModal();
      S.editing = { id: null, focus: null, draft: { type, conclusion: e.conclusion, why: e.why, how: e.how, raw, tags, source } };
      renderDetail(); saveDraft();
      toast('已识别，请检查后保存');
    } catch (err) { toast('识别失败：' + err.message, true); }
  });
  $('#cSave', m).addEventListener('click', () => save(false));
  $('#cOrganize', m).addEventListener('click', () => save(true));
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); save(false); } });
}

function peekEntry(id) {
  const e = byId(id); if (!e) return;
  // 在编辑/记录过程中查看相似条目：用一个不打断的小弹窗
  const html = `<div class="sub" style="margin:0 0 8px"><span class="chip ${e.type}">${e.type}</span> 记录于 ${fmtDate(e.created)}</div>
    <h3 style="font-family:var(--serif);font-size:20px">${esc(e.conclusion || '（未整理）')}</h3>
    ${e.why ? `<div class="block why" style="margin-top:12px"><div class="block-label">为什么这样认为</div><div class="block-body">${md(e.why)}</div></div>` : ''}
    ${e.how ? `<div class="block how"><div class="block-label">以后怎么做</div><div class="block-body">${md(e.how)}</div></div>` : ''}
    ${e.raw ? `<div class="block"><div class="block-label">原始记录</div><div class="block-body" style="background:var(--panel-2)">${md(e.raw)}</div></div>` : ''}`;
  const pop = document.createElement('div');
  pop.className = 'modal-backdrop'; pop.style.zIndex = 60;
  pop.innerHTML = `<div class="modal">${html}<div class="actions"><button class="btn primary">知道了</button></div></div>`;
  document.body.appendChild(pop);
  const close = () => pop.remove();
  pop.addEventListener('mousedown', (ev) => { if (ev.target === pop) close(); });
  $('button', pop).addEventListener('click', close);
}

// ---------- 合并
function openMerge(idA, idB) {
  let main = byId(idA), other = byId(idB);
  if (!main || !other) return;
  const combine = (a, b) => {
    a = (a || '').trim(); b = (b || '').trim();
    if (!b || normalize(a).includes(normalize(b))) return a;
    if (!a) return b;
    return a + '\n\n' + b;
  };
  const draw = () => {
    const merged = {
      conclusion: main.conclusion || other.conclusion,
      why: combine(main.why, other.why),
      how: combine(main.how, other.how),
      raw: combine(main.raw, [other.conclusion && other.conclusion !== main.conclusion ? `（合并自：${other.conclusion}）` : '', other.raw].filter(Boolean).join('\n')),
      prompt: combine(main.prompt, other.prompt),
      tags: [...new Set([...(main.tags || []), ...(other.tags || [])])],
      type: main.type,
    };
    const col = (e, isMain) => `<div class="merge-col ${isMain ? 'main' : ''}"><h4>${isMain ? '保留为主条目' : '将并入主条目'} · <span class="chip ${e.type}">${e.type}</span></h4>
      <b>${esc(e.conclusion || '（未整理）')}</b>${e.why ? `<div style="margin-top:6px;color:var(--ink-2)">为什么：${esc(e.why)}</div>` : ''}${e.how ? `<div style="margin-top:4px;color:var(--ink-2)">怎么做：${esc(e.how)}</div>` : ''}</div>`;
    const m = openModal(`
      <h3>合并两条经验</h3>
      <div class="sub">合并后，被并入的那条会移到「回收站 / 已合并」，随时可以恢复。原始记录会完整保留。</div>
      <div class="merge-grid">${col(main, true)}${col(other, false)}</div>
      <div class="row" style="margin:0 0 12px"><button class="btn" id="mSwap">⇄ 换一条作为主条目</button></div>
      <div class="editor">
        <div class="field"><label>合并后的一句话结论</label><input type="text" class="f-conclusion" id="mC" value="${esc(merged.conclusion)}"></div>
        <div class="field"><label>为什么这样认为</label><textarea id="mW">${esc(merged.why)}</textarea></div>
        <div class="field"><label>以后怎么做</label><textarea id="mH">${esc(merged.how)}</textarea></div>
        <div class="field"><label>原始记录（两条都保留）</label><textarea id="mR">${esc(merged.raw)}</textarea></div>
        <div class="field"><label>提示词（两条都保留）</label><textarea id="mPrompt">${esc(merged.prompt)}</textarea></div>
      </div>
      <div class="actions"><button class="btn" id="mCancel">取消</button><button class="btn primary" id="mOk">确认合并</button></div>`, { wide: true });
    $('#mSwap', m).addEventListener('click', () => { [main, other] = [other, main]; draw(); });
    $('#mCancel', m).addEventListener('click', closeModal);
    $('#mOk', m).addEventListener('click', async () => {
      const patch = { conclusion: $('#mC').value, why: $('#mW').value, how: $('#mH').value, raw: $('#mR').value, prompt: $('#mPrompt').value, tags: merged.tags, type: merged.type };
      if (main.status === 'inbox' && patch.conclusion.trim()) patch.status = 'active';
      try {
        const r = await api('POST', '/api/merge', { target_id: main.id, source_id: other.id, patch });
        upsertLocal(r.entry); upsertLocal(r.source);
        closeModal(); S.selectedId = r.entry.id; renderAll();
        toast('已合并', false, { label: '撤销', fn: async () => { const x = await api('POST', `/api/entries/${r.source.id}/restore`); upsertLocal(x.entry); renderAll(); toast('已恢复被合并的条目（主条目的修改可在修改历史中找回）'); } });
      } catch (err) { toast('合并失败：' + err.message, true); }
    });
  };
  draw();
}

// ---------- 导入
function openImport() {
  let tab = 'upload';
  let preview = null; // {files:[...]}
  const m = openModal(`
    <h3>导入 Markdown</h3>
    <div class="sub">只读取原文件，不会修改或删除它们。导入前可以逐条确认。</div>
    <div class="tabs"><button data-tab="upload" class="on">上传 / 粘贴</button></div>
    <div id="impSrc"></div>
    <div id="impPreview"></div>
    <div class="actions" id="impActions"></div>`, { wide: true });
  const src = $('#impSrc', m);
  const drawSrc = () => {
    $$('.tabs button', m).forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'harness') {
      src.innerHTML = `<div class="row" style="margin:0 0 12px"><span style="color:var(--ink-3);font-size:13px">文件夹：</span>
        <code style="font-size:12px;flex:1;word-break:break-all">${esc(S.config.harness_dir || '（未设置）')}</code>
        <button class="btn" id="impChange">更改</button><button class="btn primary" id="impScan">扫描</button></div>`;
      $('#impChange', m).addEventListener('click', () => { closeModal(); openSettings(); });
      $('#impScan', m).addEventListener('click', async () => {
        $('#impPreview', m).innerHTML = '<div class="empty-list">扫描中…</div>';
        try {
          const r = await api('GET', '/api/harness/scan');
          preview = r; drawPreview();
        } catch (err) { $('#impPreview', m).innerHTML = `<div class="notice" style="color:var(--warn)">${esc(err.message)}</div>`; }
      });
    } else {
      src.innerHTML = `<div class="drop" id="drop">把 .md 文件拖到这里，或 <button class="btn" id="pick">选择文件</button><input type="file" id="file" accept=".md,.markdown,.txt" multiple hidden></div>
        <textarea id="paste" placeholder="也可以直接粘贴 Markdown 内容" style="min-height:90px"></textarea>
        <div class="row"><span class="spacer" style="flex:1"></span><button class="btn primary" id="parsePaste">解析</button></div>`;
      const drop = $('#drop', m), file = $('#file', m);
      $('#pick', m).addEventListener('click', () => file.click());
      const handle = async (files) => {
        const items = await Promise.all([...files].map(async (f) => ({ filename: f.name, text: await f.text() })));
        preview = await api('POST', '/api/parse', { files: items }); drawPreview();
      };
      file.addEventListener('change', () => handle(file.files));
      drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (ev) => { ev.preventDefault(); drop.classList.remove('over'); handle(ev.dataTransfer.files); });
      $('#parsePaste', m).addEventListener('click', async () => {
        const t = $('#paste', m).value; if (!t.trim()) return;
        preview = await api('POST', '/api/parse', { files: [{ filename: '粘贴的内容.md', text: t }] }); drawPreview();
      });
    }
  };
  const STATUS_TEXT = { new: '新经验', same: '已导入过', changed: '原文有变化', similar: '可能重复' };
  const drawPreview = () => {
    const box = $('#impPreview', m);
    const files = preview?.files || [];
    const total = files.reduce((n, f) => n + f.entries.length, 0);
    if (!total) { box.innerHTML = '<div class="empty-list">没有找到可导入的内容</div>'; $('#impActions', m).innerHTML = ''; return; }
    // 默认选择：新的勾上；已存在的跳过；有变化的更新；相似的不勾（让你决定）；文件开头说明不勾
    files.forEach((f, fi) => f.entries.forEach((e, ei) => {
      e._k = fi + ':' + ei;
      if (e._checked === undefined) e._checked = e.match.status === 'new' && !e.is_preamble || e.match.status === 'changed';
      if (!e.type) e.type = f.file_type || null;
    }));
    box.innerHTML = `<div class="imp-scroll">${files.map((f, fi) => `
      <div class="imp-file"><div class="imp-file-head"><span class="path">📄 ${esc(f.path)}</span>
        ${f.is_workbench_export ? '<span class="badge same">工作台导出的文件</span>' : ''}
        <span style="color:var(--ink-3)">${f.entries.length} 条</span>
        <select data-ftype="${fi}" title="整份文件的类型"><option value="">类型：${f.file_type ? '自动（' + f.file_type + '）' : '请选择'}</option>${TYPES.map((t) => `<option value="${t}">全部设为${t}</option>`).join('')}</select>
        <button class="btn" data-fall="${fi}">全选</button><button class="btn" data-fnone="${fi}">全不选</button></div>
        ${f.entries.map((e, ei) => `<div class="imp-row">
          <input type="checkbox" data-k="${fi}:${ei}" ${e._checked ? 'checked' : ''}>
          <div class="ct"><div class="c">${e.is_preamble ? '<span class="badge same">文件说明</span> ' : ''}${esc(e.conclusion || '（无结论，将进入收件箱）' + String(e.raw || '').slice(0, 40))}</div>
            <div class="d">${[e.why && '为什么 ✓', e.how && '怎么做 ✓', e.raw && '原始记录 ✓', e.tags?.length && '标签：' + e.tags.join('、')].filter(Boolean).join(' · ') || '只有一句话'}${e.match.match_id ? ' · 对应：' + esc((byId(e.match.match_id)?.conclusion || '').slice(0, 30)) : ''}</div></div>
          <select data-type-k="${fi}:${ei}">${TYPES.map((t) => `<option ${e.type === t ? 'selected' : ''}>${t}</option>`).join('')}${e.type ? '' : '<option selected value="">选择类型</option>'}</select>
          <span class="badge ${e.match.status}">${STATUS_TEXT[e.match.status]}${e.match.score ? ' ' + Math.round(e.match.score * 100) + '%' : ''}</span>
        </div>`).join('')}</div>`).join('')}</div>`;
    const get = (k) => { const [a, b] = k.split(':').map(Number); return files[a].entries[b]; };
    $$('input[data-k]', box).forEach((c) => c.addEventListener('change', () => { get(c.dataset.k)._checked = c.checked; drawActions(); }));
    $$('select[data-type-k]', box).forEach((s) => s.addEventListener('change', () => { get(s.dataset.typeK).type = s.value; drawActions(); }));
    $$('select[data-ftype]', box).forEach((s) => s.addEventListener('change', () => { if (s.value) { files[+s.dataset.ftype].entries.forEach((e) => (e.type = s.value)); drawPreview(); } }));
    $$('[data-fall]', box).forEach((b) => b.addEventListener('click', () => { files[+b.dataset.fall].entries.forEach((e) => (e._checked = true)); drawPreview(); }));
    $$('[data-fnone]', box).forEach((b) => b.addEventListener('click', () => { files[+b.dataset.fnone].entries.forEach((e) => (e._checked = false)); drawPreview(); }));
    drawActions();
  };
  const drawActions = () => {
    const sel = (preview?.files || []).flatMap((f) => f.entries).filter((e) => e._checked);
    const noType = sel.filter((e) => !e.type).length;
    $('#impActions', m).innerHTML = `<span style="font-size:13px;color:var(--ink-3)">已选 ${sel.length} 条${noType ? `，其中 <b style="color:var(--warn)">${noType} 条未选类型</b>（将默认为短线）` : ''}</span>
      <span class="spacer"></span><button class="btn" id="impCancel">取消</button><button class="btn primary" id="impGo" ${sel.length ? '' : 'disabled'}>导入 ${sel.length} 条</button>`;
    $('#impCancel', m).addEventListener('click', closeModal);
    $('#impGo', m).addEventListener('click', async () => {
      const items = sel.map((e) => {
        const base = { conclusion: e.conclusion, why: e.why, how: e.how, raw: e.raw, prompt: e.prompt, prompt_present: e.prompt_present, tags: e.tags, type: e.type || '短线', source_file: e.source_file, source_text: e.source_text, source_hash: e.source_hash, id: e.id, created: e.created, source: e.source || '导入' };
        if (e.status) base.status = e.status;
        if (e.match.status === 'changed' || e.match.status === 'same') return { ...base, action: 'update', target_id: e.match.match_id };
        return { ...base, action: 'create' };
      });
      try {
        const r = await api('POST', '/api/import', { items });
        await loadState(); closeModal(); S.view = 'all'; S.selectedId = null; renderAll();
        toast(`导入完成：新增 ${r.created} 条，更新 ${r.updated} 条`);
      } catch (err) { toast('导入失败：' + err.message, true); }
    });
  };
  $$('.tabs button', m).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; preview = null; $('#impPreview', m).innerHTML = ''; $('#impActions', m).innerHTML = ''; drawSrc(); }));
  drawSrc();
  if (S.info.harness_exists) $('#impScan', m)?.click();
}

// ---------- 导出
function openExport(presetIds) {
  const m = openModal(`
    <h3>导出 Markdown</h3>
    <div class="sub">按「短线 / 长线」各生成一个文件。格式可以被工作台再次导入，也方便 Agent 读取维护。</div>
    <div class="row" style="margin:0 0 12px">
      <span style="font-size:13px">范围</span>
      <div class="seg" id="xScope">
        <button data-s="all" class="on">全部</button><button data-s="短线">只要短线</button><button data-s="长线">只要长线</button>
        ${presetIds ? '<button data-s="current">当前列表</button>' : ''}
      </div>
      <label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="xInbox" checked> 包含收件箱里未整理的</label>
    </div>
    <div id="xPreview"></div>
    <div class="sub-title" style="margin-top:16px">保存到哪里</div>
    <div class="radio-list">
      <label><input type="radio" name="xt" value="download" checked><div>下载到电脑<small>浏览器下载 .md 文件</small></div></label>

    </div>
    <div id="xReplace"></div>
    <div class="actions"><button class="btn" id="xCopy">复制到剪贴板</button><span class="spacer"></span><button class="btn" id="xCancel">取消</button><button class="btn primary" id="xGo">导出</button></div>`, { wide: true });
  let scope = 'all';
  let files = {};
  const req = () => ({ scope: scope === 'current' ? 'all' : scope, ids: scope === 'current' ? presetIds : null, include_inbox: $('#xInbox', m).checked });
  const refresh = async () => {
    files = (await api('POST', '/api/export/preview', req())).files;
    const names = Object.keys(files);
    $('#xPreview', m).innerHTML = names.length ? names.map((n) => `<div style="font-size:12px;color:var(--ink-3);margin:6px 0 4px">${esc(n)} · ${(files[n].match(/^## /gm) || []).length} 条</div><pre class="pre-md">${esc(files[n].slice(0, 2500))}${files[n].length > 2500 ? '\n…（预览已截断）' : ''}</pre>`).join('') : '<div class="empty-list">这个范围里没有经验</div>';
  };
  $$('#xScope button', m).forEach((b) => b.addEventListener('click', () => { scope = b.dataset.s; $$('#xScope button', m).forEach((x) => x.classList.toggle('on', x === b)); refresh(); }));
  $('#xInbox', m).addEventListener('change', refresh);
  let harnessFiles = null;
  $$('input[name=xt]', m).forEach((r) => r.addEventListener('change', async () => {
    const box = $('#xReplace', m);
    if (r.value !== 'harness-replace' || !r.checked) { box.innerHTML = ''; return; }
    if (!harnessFiles) { try { harnessFiles = (await api('GET', '/api/harness/scan')).files.map((f) => f.path); } catch (e) { harnessFiles = []; } }
    box.innerHTML = `<div class="notice" style="display:block;margin-top:10px"><div style="margin-bottom:8px">选择每个导出文件要替换的 Harness 文件（原文件会先备份到工作台的 data/harness-backups/）：</div>
      ${Object.keys(files).map((n) => `<div class="row" style="margin:4px 0"><b style="width:70px">${esc(n)}</b> → <select class="inline" data-map="${esc(n)}"><option value="">不替换</option>${harnessFiles.map((p) => `<option>${esc(p)}</option>`).join('')}</select></div>`).join('')}
      <div class="row">输入 <b>确认覆盖</b> 以继续：<input type="text" id="xConfirm" style="width:140px;padding:5px 8px"></div></div>`;
  }));
  $('#xCancel', m).addEventListener('click', closeModal);
  $('#xCopy', m).addEventListener('click', async () => {
    const text = Object.values(files).join('\n\n');
    try { await navigator.clipboard.writeText(text); toast('已复制到剪贴板'); } catch (_) { toast('浏览器不允许复制，请用下载', true); }
  });
  $('#xGo', m).addEventListener('click', async () => {
    const target = $('input[name=xt]:checked', m).value;
    if (!Object.keys(files).length) { toast('没有可导出的内容', true); return; }
    try {
      if (target === 'download') {
        const day = new Date().toISOString().slice(0, 10);
        for (const [n, t] of Object.entries(files)) download(n.replace('.md', `-${day}.md`), t);
        closeModal(); toast('已开始下载'); return;
      }
      const body = { ...req(), target };
      if (target === 'harness-replace') {
        const mapping = {}; $$('[data-map]', m).forEach((s) => { if (s.value) mapping[s.dataset.map] = s.value; });
        if (!Object.keys(mapping).length) { toast('请至少选择一个要替换的文件', true); return; }
        body.mapping = mapping; body.confirm = ($('#xConfirm', m).value || '').trim();
        if (body.confirm !== '确认覆盖') { toast('请输入“确认覆盖”', true); return; }
      }
      const r = await api('POST', '/api/export/save', body);
      openModal(`<h3>导出完成</h3><div class="sub">已写入以下文件：</div><pre class="pre-md">${esc(r.written.join('\n'))}</pre><div class="actions"><button class="btn primary" onclick="closeModal()">好的</button></div>`);
    } catch (err) { toast('导出失败：' + err.message, true); }
  });
  refresh();
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function entryToMd(e) {
  const out = [`## ${e.conclusion || '（待整理）' + String(e.raw || '').split('\n')[0].slice(0, 40)}`, `- id: ${e.id}`, `- 类型: ${e.type}`];
  if (e.tags?.length) out.push(`- 标签: ${e.tags.join('、')}`);
  if (e.source) out.push(`- 来源: ${e.source}`);
  out.push(`- 记录于: ${String(e.created || '').slice(0, 10)}`, '');
  if (e.why) out.push('### 为什么这样认为', e.why, '');
  if (e.how) out.push('### 以后怎么做', e.how, '');
  if (e.raw) out.push('### 原始记录', e.raw.split('\n').map((l) => '> ' + l).join('\n'), '');
  if (e.prompt) out.push('### 提示词', e.prompt.split('\n').map((l) => '> ' + l).join('\n'), '');
  return out.join('\n');
}

// ---------- 设置
function openSettings() {
  const m = openModal(`<h3>设置与备份</h3><div class="sub">数据只保存在当前浏览器，不会自动同步。清除浏览器数据可能导致记录丢失，请定期下载备份。</div>
    <div class="kv"><div class="k">经验总数</div><div class="v">${S.entries.length}（含回收站）</div></div>
    <div class="row"><button class="btn primary" id="sJson">下载完整数据（JSON）</button><button class="btn" id="sRestore">从 JSON 恢复…</button><input type="file" id="sRestoreFile" accept=".json" hidden></div>
    <div class="actions"><button class="btn" id="sClose">关闭</button></div>`);
  $('#sClose', m).addEventListener('click', closeModal);
  $('#sJson', m).addEventListener('click', () => download(`经验工作台-完整数据-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({version: 1, entries: S.entries, not_duplicates: S.notDup}, null, 1)));
  $('#sRestore', m).addEventListener('click', () => $('#sRestoreFile', m).click());
  $('#sRestoreFile', m).addEventListener('change', async ev => { try { const d = JSON.parse(await ev.target.files[0].text()); const r = await api('POST', '/api/restore-json', {entries: d.entries || d}); await loadState(); renderAll(); toast(`恢复完成：新增 ${r.added} 条，已存在跳过 ${r.skipped} 条`); } catch (err) { toast('恢复失败：' + err.message, true); } });
}

// ============================================================ 动作
async function act(name) {
  const e = S.selectedId && byId(S.selectedId);
  switch (name) {
    case 'edit': if (e) startEdit(e.id); break;
    case 'capture': openCapture(); break;
    case 'import': openImport(); break;
    case 'export': openExport(); break;
    case 'review': review(); break;
    case 'goinbox': S.view = 'inbox'; renderAll(); break;
    case 'gotodo': S.view = 'todo'; renderAll(); break;
    case 'back': S.selectedId = null; renderAll(); break;
    case 'switch': {
      const t = e.type === '短线' ? '长线' : '短线';
      const r = await api('PUT', '/api/entries/' + e.id, { type: t }); upsertLocal(r.entry); renderAll(); toast(`已转为${t}`); break;
    }
    case 'copyPrompt': {
      try { await navigator.clipboard.writeText(e.prompt); toast('已复制提示词'); } catch (_) { toast('复制失败，请手动选择文字', true); }
      break;
    }
    case 'copy': {
      try { await navigator.clipboard.writeText(entryToMd(e)); toast('已复制这条的 Markdown'); } catch (_) { toast('浏览器不允许复制', true); }
      break;
    }
    case 'trash': {
      const r = await api('POST', `/api/entries/${e.id}/trash`); upsertLocal(r.entry);
      const list = filtered(); S.selectedId = null; renderAll();
      toast('已移到回收站', false, { label: '撤销', fn: async () => { const x = await api('POST', `/api/entries/${e.id}/restore`); upsertLocal(x.entry); S.selectedId = e.id; renderAll(); } });
      void list; break;
    }
    case 'restore': { const r = await api('POST', `/api/entries/${e.id}/restore`); upsertLocal(r.entry); renderAll(); toast('已恢复'); break; }
    case 'destroy': {
      if (!confirm('彻底删除后无法在工作台里恢复（自动备份里仍有记录）。确定吗？')) return;
      await api('DELETE', '/api/entries/' + e.id); S.entries = S.entries.filter((x) => x.id !== e.id); S.selectedId = null; renderAll(); toast('已彻底删除'); break;
    }
  }
}
function review() {
  const pool = alive().filter((e) => e.status === 'active');
  if (!pool.length) { toast('还没有已整理的经验'); return; }
  // 越久没改过的越容易被抽到
  const now = Date.now();
  const w = pool.map((e) => 1 + Math.min(60, (now - new Date(e.updated || e.created).getTime()) / 86400000));
  let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
  while ((r -= w[i]) > 0) i++;
  const e = pool[Math.min(i, pool.length - 1)];
  S.editing = null; S.view = 'all'; S.q = ''; S.tag = null; $('#search').value = ''; S.selectedId = e.id; renderAll();
  $(`.card[data-id="${e.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function viewHistory(idx) {
  const e = byId(S.selectedId); const h = e.history[idx];
  const m = openModal(`<h3>历史版本 · ${fmtDate(h.at, true)}</h3>
    <div class="sub"><span class="chip ${h.type}">${h.type}</span> ${(h.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>
    <h3 style="font-family:var(--serif);font-size:20px">${esc(h.conclusion || '（无结论）')}</h3>
    ${h.why ? `<div class="block why" style="margin-top:10px"><div class="block-label">为什么这样认为</div><div class="block-body">${md(h.why)}</div></div>` : ''}
    ${h.how ? `<div class="block how"><div class="block-label">以后怎么做</div><div class="block-body">${md(h.how)}</div></div>` : ''}
    ${h.raw ? `<div class="block"><div class="block-label">原始记录</div><div class="block-body">${md(h.raw)}</div></div>` : ''}
    ${h.prompt ? `<div class="block"><div class="block-label">提示词</div><div class="block-body">${md(h.prompt)}</div></div>` : ''}
    <div class="actions"><button class="btn" id="hClose">关闭</button><button class="btn primary" id="hRestore">恢复为这个版本</button></div>`);
  $('#hClose', m).addEventListener('click', closeModal);
  $('#hRestore', m).addEventListener('click', async () => {
    const r = await api('PUT', '/api/entries/' + e.id, { conclusion: h.conclusion, why: h.why, how: h.how, raw: h.raw, ...(Object.hasOwn(h, 'prompt') ? { prompt: h.prompt || '' } : {}), tags: h.tags, type: h.type });
    upsertLocal(r.entry); closeModal(); renderAll(); toast('已恢复（当前版本也已存入历史）');
  });
}

// ============================================================ Toast
function toast(msg, err = false, action) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { t.remove(); action.fn().catch((e2) => toast(e2.message, true)); }; t.appendChild(b); }
  $('#toastRoot').appendChild(t);
  setTimeout(() => t.remove(), action ? 6000 : 2600);
}

// ============================================================ 事件
function renderAll() { buildDf(); renderNav(); renderList(); renderDetail(); }

function selectEntry(id) {
  if (S.editing) { const ed = S.editing; const orig = ed.id ? byId(ed.id) : null; const d = ed.draft;
    const dirty = orig ? ['conclusion', 'why', 'how', 'raw', 'prompt'].some((k) => (orig[k] || '') !== (d[k] || '')) : normalize([d.conclusion, d.why, d.how, d.raw, d.prompt].join(''));
    if (dirty && !confirm('有未保存的修改，确定放弃吗？')) return; S.editing = null; clearDraft(); }
  S.selectedId = id;
  $$('.card').forEach((c) => c.classList.toggle('selected', c.dataset.id === id));
  renderDetail();
  $('#detail').scrollTop = 0;
}

function bind() {
  $('#nav').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-view]'); if (!b) return;
    S.view = b.dataset.view; S.limit = 200; renderNav(); renderList();
    if (S.selectedId && !inView(byId(S.selectedId) || {}, S.view)) { if (!S.editing) { S.selectedId = null; renderDetail(); } }
  });
  $('#tagCloud').addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-tag]'); if (!t) return;
    S.tag = S.tag === t.dataset.tag ? null : t.dataset.tag;
    if (S.view === 'trash' || S.view === 'dups') S.view = 'all';
    renderNav(); renderList();
  });
  let tmr;
  $('#search').addEventListener('input', (ev) => {
    clearTimeout(tmr);
    tmr = setTimeout(() => { S.q = ev.target.value; S.limit = 200; if (S.q && (S.view === 'dups')) S.view = 'all'; renderNav(); renderList(); if (!S.editing) renderDetail(); }, 120);
  });
  $('#sort').addEventListener('change', (ev) => { S.sort = ev.target.value; renderList(); });
  $('#listHead').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-cleartag]')) { S.tag = null; renderNav(); renderList(); }
    if (ev.target.closest('[data-clearq]')) { S.q = ''; $('#search').value = ''; renderList(); renderDetail(); }
  });
  $('#list').addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-more]')) { S.limit += 200; renderList(); return; }
    const mg = ev.target.closest('[data-merge]'); if (mg) { const [a, b] = mg.dataset.merge.split('|'); openMerge(a, b); return; }
    const nd = ev.target.closest('[data-notdup]');
    if (nd) { const [a, b] = nd.dataset.notdup.split('|'); await api('POST', '/api/not-duplicate', { a, b }); S.notDup.push([a, b].sort()); renderList(); toast('已标记为不重复，不会再提示'); return; }
    const c = ev.target.closest('[data-id]'); if (c) selectEntry(c.dataset.id);
  });
  $('#detail').addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-act]'); if (a) { act(a.dataset.act).catch((e) => toast(e.message, true)); return; }
    const g = ev.target.closest('[data-goto]'); if (g) { ev.preventDefault(); const id = g.dataset.goto; const x = byId(id); if (x && !inView(x, S.view)) { S.view = inView(x, 'trash') ? 'trash' : 'all'; renderNav(); renderList(); } selectEntry(id); return; }
    const f = ev.target.closest('[data-fill]'); if (f) { startEdit(S.selectedId, f.dataset.fill); return; }
    const mg = ev.target.closest('[data-merge]'); if (mg) { const [x, y] = mg.dataset.merge.split('|'); openMerge(x, y); return; }
    const h = ev.target.closest('[data-viewhist]'); if (h) viewHistory(+h.dataset.viewhist);
  });
  $('#btnCapture').addEventListener('click', () => openCapture());
  $('#btnImport').addEventListener('click', openImport);
  $('#btnExport').addEventListener('click', () => openExport(filtered().map((e) => e.id)));
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnReview').addEventListener('click', review);

  document.addEventListener('keydown', (ev) => {
    if (!$('#creativeApp').hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (ev.key === 'Escape') {
      if ($('.modal-backdrop[style]')) { $('.modal-backdrop[style]').remove(); return; }
      if (modalOpen()) { closeModal(); return; }
      if (S.editing) { cancelEdit(); return; }
      if (typing) { document.activeElement.blur(); return; }
    }
    if (S.editing && ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); saveEdit(); return; }
    if (typing || modalOpen() || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); openCapture(); }
    else if (ev.key === '/') { ev.preventDefault(); $('#search').focus(); $('#search').select(); }
    else if ((ev.key === 'e' || ev.key === 'E') && S.selectedId && !S.editing) { const x = byId(S.selectedId); if (x && x.status !== 'trashed' && x.status !== 'merged') { ev.preventDefault(); startEdit(S.selectedId); } }
    else if ((ev.key === 'j' || ev.key === 'k') && !S.editing) {
      const list = filtered(); if (!list.length) return;
      let i = list.findIndex((x) => x.id === S.selectedId);
      i = ev.key === 'j' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
      selectEntry(list[i].id); $(`.card[data-id="${list[i].id}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  });
  window.addEventListener('beforeunload', (ev) => { if (S.editing) { saveDraft(); } });
}

async function init() {
  bind();
  $('#detail').innerHTML = '<div class="welcome"><h2>正在加载工作台…</h2><div>首次打开需要加载运行组件，请稍等。</div></div>';
  try { await loadState(); }
  catch (err) {
    $('#detail').innerHTML = `<div class="welcome"><h2>工作台加载失败</h2><div>请检查网络或刷新页面重试。浏览器保存的数据不会因此删除。</div></div>`;
    return;
  }
  // 恢复上次未保存的草稿
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.draft && normalize([d.draft.conclusion, d.draft.why, d.draft.how, d.draft.raw, d.draft.prompt].join(''))) {
      S.editing = d; if (d.id) S.selectedId = d.id;
      setTimeout(() => toast('已恢复上次没保存的草稿'), 300);
    }
  } catch (_) {}
  if (S.entries.some((e) => e.status === 'inbox') && !S.selectedId) S.view = 'all';
  renderAll();
}
init();
