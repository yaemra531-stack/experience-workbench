/* 文章库只读取仓库文件，不读写经验或创作数据。 */
(() => {
  'use strict';
  const root = document.getElementById('articleApp');
  const experience = document.getElementById('app');
  const creative = document.getElementById('creativeApp');
  const E = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let previous = experience, entries = [], current = null, viewFile = null, seq = 0;
  const safeFile = name => typeof name === 'string' && name.endsWith('.md') && !name.includes('/') && !name.includes('\\') && !name.includes('..');
  const fileURL = name => 'articles/' + encodeURIComponent(name);
  const shell = () => `<aside class="article-sidebar"><div class="article-brand">📖 文章库</div><p>AI 博主实验 · 文章合集</p><button class="btn" data-article-action="leave">返回工作台</button></aside><main class="article-main"><div class="article-content" id="articleContent"></div></main>`;
  function listing() {
    current = null; viewFile = null; seq++;
    const content = root.querySelector('#articleContent');
    content.innerHTML = `<div class="article-page-head"><p class="article-eyebrow">文章库</p><h1>文章合集</h1><p>共 ${entries.length} 篇</p></div><div class="article-list">${entries.map(a => `<button class="article-card" data-article-id="${Number(a.number)}"><span class="article-number">${String(a.number).padStart(2,'0')}</span><span class="article-card-body"><strong>${E(a.title)}</strong><span>${E(a.description || '')}</span></span></button>`).join('')}</div>`;
    root.querySelector('.article-main').scrollTop = 0;
  }
  async function read(article, file = article.file) {
    if (!safeFile(file) || (file !== article.file && file !== article.originalFile)) return;
    current = article; viewFile = file; const request = ++seq;
    const content = root.querySelector('#articleContent');
    content.innerHTML = '<button class="btn" data-article-action="list">← 返回列表</button><p>正在加载文章…</p>';
    root.querySelector('.article-main').scrollTop = 0;
    try {
      const response = await fetch(fileURL(file));
      if (!response.ok) throw new Error('文章暂时无法读取');
      const markdown = await response.text();
      if (request !== seq) return;
      if (!window.marked || !window.DOMPurify) throw new Error('阅读组件加载失败，请刷新重试');
      const html = DOMPurify.sanitize(marked.parse(markdown));
      content.innerHTML = `<button class="btn article-back" data-article-action="list">← 返回列表</button><article class="article-prose">${html}</article><footer class="article-footer">${article.topics?.length ? `<p><strong>话题：</strong>${article.topics.map(E).join(' ')}</p>` : ''}${article.cover && /^https?:\/\//i.test(article.cover) ? `<p><strong>封面：</strong><a href="${E(article.cover)}" target="_blank" rel="noopener noreferrer">查看封面</a></p>` : ''}</footer>`;
      content.querySelectorAll('.article-prose a').forEach(a => {
        const raw = a.getAttribute('href') || '';
        if (article.originalFile && (raw === article.originalFile || raw === encodeURIComponent(article.originalFile))) {
          a.setAttribute('href', fileURL(article.originalFile)); a.dataset.original = 'true';
        } else if (/^https?:/i.test(raw)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      });
    } catch (_) {
      if (request === seq) content.innerHTML = '<button class="btn" data-article-action="list">← 返回列表</button><p>文章加载失败，请检查网络后重试。</p>';
    }
  }
  async function open(from) {
    previous = from === 'creative' ? creative : experience;
    previous.hidden = true; root.hidden = false; root.innerHTML = shell();
    root.querySelector('#articleContent').innerHTML = '<p>正在加载文章列表…</p>';
    try {
      const response = await fetch('articles/index.json', {cache:'no-cache'});
      if (!response.ok) throw new Error('index');
      const data = await response.json();
      entries = data.filter(a => Number.isInteger(a.number) && safeFile(a.file)).sort((a,b) => a.number-b.number);
      if (!root.hidden) listing();
    } catch (_) {
      root.querySelector('#articleContent').innerHTML = '<p>文章列表加载失败，请检查网络后重新打开。</p>';
    }
  }
  document.getElementById('openArticles').addEventListener('click', () => open('experience'));
  root.addEventListener('click', event => {
    const original = event.target.closest('a[data-original]');
    if (original && current) { event.preventDefault(); read(current, current.originalFile); return; }
    const item = event.target.closest('[data-article-id]');
    if (item) { const entry = entries.find(a => a.number === Number(item.dataset.articleId)); if (entry) read(entry); return; }
    const action = event.target.closest('[data-article-action]')?.dataset.articleAction;
    if (action === 'list') listing();
    if (action === 'leave') { seq++; root.hidden = true; previous.hidden = false; }
  });
  window.articleLibrary = {open};
})();
