/* 战略看板：把「当前唯一战略」钉在两个工作台的侧栏，每天第一次打开时完整展示一次。
   只读展示，不改动经验数据和创作数据。战略不常改：要改就改下面 STRATEGY 里的文字。 */
(() => {
  'use strict';

  // ===== 战略内容（改这里）=====
  const STRATEGY = {
    name: '短线',                                  // 战略名
    goal: '一年内做 1000 条短视频',                  // 目标一句话
    target: 1000,                                   // 目标总条数
    perDay: 3,                                      // 每天目标条数
    startDate: '2026-11-26',                        // 生效日期
    checkpointEvery: 100,                           // 每发满多少条做一次复盘
    principles: [
      '一段时间只要一个战略，不随时调整；有新想法先记下来，到检查点再一起看。',
      '优质是练出来的，不是每一条的标准：短线的标准是「发出去」。',
    ],
    // 三个栏目（名称要和创作工作台里的「栏目」选项一致）
    columns: [
      { name: '想法观察', len: '约 15 秒', role: '保底，保证每天都有东西发', rhythm: '每天 1 条' },
      { name: '新东西上手', len: '15～30 秒', role: '抢时效，满足爽和好奇', rhythm: '有新东西就做' },
      { name: '痛点解法', len: '约 60 秒', role: '拿收藏，最容易接商单', rhythm: '有好选题才做，不硬凑' },
    ],
    daily: [
      '保底：先发 1 条想法 / 观察',
      '有新模型、新功能，就抢时效做上手',
      '看选题晨报，有好选题再做痛点解法',
      '一次录、多次剪；集中录 2～3 条',
      '发完把状态改成「已实践」，选好栏目',
    ],
    desiresNote: '所有栏目通用：每条都要有一个让人停下来的理由。',
    desires: [
      { name: '懒', heart: '能少干就少干', hook: '每天早上不用想穿什么了' },
      { name: '怕', heart: '怕落后、怕吃亏、怕说错话、担心家人', hook: '爸妈的检查报告你看得懂吗' },
      { name: '贪', heart: '省钱、白嫖、花小钱办大事', hook: '想买的东西等降价，让 AI 替你盯着' },
      { name: '面子', heart: '拿出去显得厉害', hook: '电脑上这个小软件是我自己做的' },
      { name: '爽 / 好奇', heart: '没见过的效果', hook: 'AI 给我出了年度报告' },
      { name: '被说中', heart: '心里那句话被讲了出来', hook: '吵完架，让 AI 帮你把话说得不伤人' },
    ],
    formulaTitle: '痛点解法栏目 · 选题公式',
    formula: [
      { name: '人性欲望', sub: '为什么停下来' },
      { name: '信息差', sub: '新能力或新用法' },
      { name: '零门槛', sub: '复制一句话就能用' },
    ],
    formulaNote: '三项缺一不可。痛点是「人的麻烦」，不是「AI 的毛病」。场景优先：家人、健康、学习、穿搭、人际关系、情绪 ＞ 职场。',
    rules: [
      '只看 OpenAI、Anthropic、DeepSeek 三家的产品',
      '开头用生活或工作场景 + 普通人的原话，不出现功能名和英文产品名',
      '要编程、装工具的玩法，改写成网页或 App 里点几下就能用的平替',
      '健康、法律、钱：定位为帮你看懂、帮你准备，不替代专业人士',
      '借用法不搬运：自己实测、重新录，注明灵感来源',
    ],
  };
  // ===== 战略内容到此为止 =====

  const SEEN_KEY = 'strategy-board-last-seen';   // 记录今天是否已展示过完整看板
  const CREATION_KEY = 'creation-workbench-v1';  // 创作工作台的数据，只读
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => dayKey(new Date());

  function progress() {
    let done = 0, todayDone = 0;
    const byColumn = Object.fromEntries(STRATEGY.columns.map(c => [c.name, 0]));
    try {
      const db = JSON.parse(localStorage.getItem(CREATION_KEY) || 'null');
      (db && Array.isArray(db.short) ? db.short : []).forEach(x => {
        if ((x.practiceStatus || (x.status === '已发布' ? '已实践' : '待实践')) !== '已实践') return;
        done++;
        if (x.column && x.column in byColumn) byColumn[x.column]++;
        const at = x.practicedAt ? new Date(x.practicedAt) : null;
        if (at && !Number.isNaN(at.getTime()) && dayKey(at) === today()) todayDone++;
      });
    } catch (_) { /* 读不到就按 0 显示 */ }
    const start = new Date(STRATEGY.startDate + 'T00:00:00');
    const day = Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);
    const pace = Math.min(STRATEGY.target, Math.round(STRATEGY.target * day / 365));
    const next = (Math.floor(done / STRATEGY.checkpointEvery) + 1) * STRATEGY.checkpointEvery;
    return { done, todayDone, byColumn, day, pace, next, pct: Math.min(100, done / STRATEGY.target * 100) };
  }

  function cardHtml(p) {
    const hit = p.todayDone >= STRATEGY.perDay;
    return `<button class="north-star" type="button" data-ns-open title="查看完整战略">
      <span class="ns-label">当前战略 · ${E(STRATEGY.name)}</span>
      <span class="ns-today ${hit ? 'hit' : ''}">今天 <b>${p.todayDone}</b> / ${STRATEGY.perDay} 条</span>
      <span class="ns-bar"><i style="width:${p.pct.toFixed(2)}%"></i></span>
      <span class="ns-count">总计 <b>${p.done}</b> / ${STRATEGY.target} · 第 ${p.day} 天</span>
    </button>`;
  }

  function boardHtml(p) {
    return `<div class="ns-overlay" role="dialog" aria-modal="true" aria-label="当前战略">
      <div class="ns-board">
        <div class="ns-top"><span>当前战略 · 自 ${E(STRATEGY.startDate)} 起生效</span><span>下一个检查点：已实践 ${p.next} 条</span></div>
        <h1 class="ns-title">${E(STRATEGY.name)}：${E(STRATEGY.goal)}</h1>
        ${STRATEGY.principles.map(s => `<p class="ns-principle">${E(s)}</p>`).join('')}

        <section class="ns-sec ns-progress">
          <div class="ns-progress-head">
            <span>今天已实践 <b>${p.todayDone}</b> / ${STRATEGY.perDay}</span>
            <span>总计 ${p.done} / ${STRATEGY.target} · 第 ${p.day} 天 · 按一年节奏应到约 ${p.pace} 条</span>
          </div>
          <div class="ns-bar big"><i style="width:${p.pct.toFixed(2)}%"></i></div>
        </section>

        <section class="ns-sec">
          <h2>三个栏目 · 一天 ${STRATEGY.perDay} 条，按成本配</h2>
          <div class="ns-columns">${STRATEGY.columns.map(c => `<div class="ns-column"><div class="ns-column-head"><b>${E(c.name)}</b><span>${p.byColumn[c.name]} 条</span></div><span class="ns-column-len">${E(c.len)} · ${E(c.rhythm)}</span><em>${E(c.role)}</em></div>`).join('')}</div>
        </section>

        <div class="ns-cols">
          <section class="ns-sec">
            <h2>每天怎么做</h2>
            <ol class="ns-list">${STRATEGY.daily.map(s => `<li>${E(s)}</li>`).join('')}</ol>
          </section>
          <section class="ns-sec">
            <h2>红线</h2>
            <ul class="ns-list ns-rules">${STRATEGY.rules.map(s => `<li>${E(s)}</li>`).join('')}</ul>
          </section>
        </div>

        <section class="ns-sec">
          <h2>六种人性欲望 · ${E(STRATEGY.desiresNote)}</h2>
          <div class="ns-desires">${STRATEGY.desires.map(d => `<div class="ns-desire"><b>${E(d.name)}</b><span>${E(d.heart)}</span><em>「${E(d.hook)}」</em></div>`).join('')}</div>
        </section>

        <section class="ns-sec">
          <h2>${E(STRATEGY.formulaTitle)}</h2>
          <div class="ns-formula">${STRATEGY.formula.map(f => `<span class="ns-term"><b>${E(f.name)}</b><small>${E(f.sub)}</small></span>`).join('<span class="ns-times">×</span>')}</div>
          <p class="ns-note">${E(STRATEGY.formulaNote)}</p>
        </section>

        <div class="ns-actions"><button class="btn primary big" type="button" data-ns-close>看完了，开始干活</button><span class="ns-tip">每天第一次打开时会自动出现 · 按 Esc 关闭</span></div>
      </div>
    </div>`;
  }

  function openBoard() {
    if (document.querySelector('.ns-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', boardHtml(progress()));
    const ov = document.querySelector('.ns-overlay');
    requestAnimationFrame(() => ov.classList.add('show'));
    ov.querySelector('[data-ns-close]').focus({ preventScroll: true });
    ov.querySelector('.ns-board').scrollTop = 0;
    try { localStorage.setItem(SEEN_KEY, today()); } catch (_) {}
  }
  function closeBoard() {
    const ov = document.querySelector('.ns-overlay');
    if (!ov) return;
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 260);
  }

  // 侧栏卡片：两个工作台都挂一份；创作工作台会整体重绘，所以用观察器补挂
  let lastKey = '';
  function mount() {
    const p = progress();
    const key = `${p.done}|${p.todayDone}|${p.day}`;
    document.querySelectorAll('.sidebar').forEach(sb => {
      const brand = sb.querySelector('.brand');
      if (!brand) return;
      const card = sb.querySelector('.north-star');
      if (!card) brand.insertAdjacentHTML('afterend', cardHtml(p));
      else if (key !== lastKey) card.outerHTML = cardHtml(p);
    });
    lastKey = key;
    mountEditHint();
  }

  // 创作工作台编辑短线时，在正文上方按栏目提示对照战略
  function mountEditHint() {
    const edit = document.querySelector('#creativeApp .cw-edit');
    if (!edit || !edit.querySelector('[data-field="practiceStatus"]') || edit.querySelector('.ns-check')) return;
    const body = edit.querySelector('[data-field="body"]');
    const field = body && body.closest('.field');
    if (!field) return;
    const column = edit.querySelector('[data-field="column"]')?.value || '';
    const tips = column === '痛点解法'
      ? ['① 让人停下来的理由是？', '② 观众没见过吗？', '③ 复制哪一句就能用？']
      : column === '新东西上手'
        ? ['① 最惊艳的那一下是什么？', '② 普通人能不能用？']
        : column === '想法观察'
          ? ['① 一句话说得完吗？', '② 像跟朋友聊天吗？']
          : ['让人停下来的理由是什么？'];
    field.insertAdjacentHTML('beforebegin', `<div class="ns-check"><span class="ns-check-title">对照战略</span>${tips.map(t => `<span>${E(t)}</span>`).join('')}</div>`);
  }

  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; mount(); }); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('storage', schedule);
  window.addEventListener('focus', schedule);

  document.addEventListener('click', ev => {
    if (ev.target.closest('[data-ns-open]')) { openBoard(); return; }
    if (ev.target.closest('[data-ns-close]') || ev.target.classList.contains('ns-overlay')) closeBoard();
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.querySelector('.ns-overlay')) { ev.stopPropagation(); closeBoard(); } }, true);

  mount();
  let seen = '';
  try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch (_) {}
  if (seen !== today()) setTimeout(openBoard, 400);
})();
