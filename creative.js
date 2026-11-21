/* 创作工作台：独立的浏览器本地数据，不触碰经验工作台数据。 */
(() => {
  'use strict';
  const KEY = 'creation-workbench-v1';
  const root = document.getElementById('creativeApp');
  const old = document.getElementById('app');
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $c = s => root.querySelector(s);
  const blank = () => ({version:1,nextC:1,nextS:1,short:[],long:[]});
  let db, lastSnapshot=null, mode='short', selected=null, draft=null, editing=false, dirty=false, returnDraft=null, search='', filter='all', visibleLimit=100;
  const statuses=['待实践','已实践'];
  const practice = x => x.practiceStatus || (x.status === '已发布' ? '已实践' : '待实践');
  const shortTemplate = `## 一、原视频怎么讲的？

| 环节 | 原视频表达 | 作用 |
| --- | --- | --- |
| 开头 |  |  |
| 中间 |  |  |
| 结尾 |  |  |

**表达结构：**

## 二、为什么可能吸引观众？

1. 待补充
2. 待补充

**需要注意：**

## 三、迁移到 AI 领域

**示范话题：**

**迁移方式：**

**候选或最终文案：**

## 四、这个案例记住什么？

- **结构：**
- **适用场景：**
- **值得学：**
- **暂不模仿：**
- **当前判断：** 待实践。`;
  const longTemplate = `## 核心结论

## 表达步骤

## 为什么可能有效

## 适用场景

## 值得学与暂不模仿

## 实践验证

待实践。`;
  const verify=['待实践','实践中','已有反馈','待修正'];
  const groups = {
    short: [
      ['基本信息',[['title','标题','text'],['status','当前状态','status'],['note','备注','area']]],
      ['参考案例',[['url','视频链接','url'],['creator','创作者','text'],['duration','视频时长','text'],['transcript','原始文案或字幕','area'],['referenceNotes','截图链接或备注','area'],['referenceMetrics','原视频数据（点赞、评论等）','area'],['outperformance','明显高于作者日常表现','outperformance']]],
      ['案例分析',[['opening','开场','area'],['setup','铺垫或具体事件','area'],['turn','转折、反差或笑点','area'],['ending','结尾','area'],['hypotheses','为什么可能吸引观众（分析假设）','area'],['structureName','结构名称','text'],['structureSteps','表达结构 / 步骤','area'],['applicable','适用场景','area'],['learn','值得学习的地方','area'],['avoid','暂不模仿的地方','area'],['analysisPaste','AI 分析原文（可整段粘贴）','area']]],
      ['迁移到 AI 领域',[['topic','AI 话题','text'],['viewpoint','核心观点','area'],['transfer','迁移思路','area'],['candidate','候选文案（1～2 条）','area'],['finalScript','最终文案','area']]],
      ['制作与发布',[['production','制作状态','text'],['finalDuration','最终视频时长','text'],['publishedAt','发布时间','datetime-local'],['platform','发布平台','text'],['workUrl','作品链接','url'],['effort','制作耗时','text']]],
      ['发布反馈与复盘',[['views','播放量','number'],['likes','点赞','number'],['comments','评论','number'],['favorites','收藏','number'],['completion','完播率（%）','number'],['reviewKeep','哪个表达结构值得保留？','area'],['reviewNatural','哪些地方影响了自然表达？','area'],['reviewFaster','下次怎样更快完成？','area']]]
    ],
    long: [
      ['结构或方法',[['title','结构或方法名称','text'],['conclusion','核心结论','area'],['steps','表达步骤','area'],['hypotheses','为什么可能有效（分析假设）','area']]],
      ['使用边界',[['applicable','适用场景','area'],['learn','值得学习的地方','area'],['avoid','暂不模仿的地方','area']]],
      ['实践验证',[['verification','验证情况','verification'],['verificationNotes','实践后的验证记录','area']]]
    ]
  };
  function notice(text, err=false) { if (typeof toast === 'function') toast(text,err); }
  function read() { const v=localStorage.getItem(KEY); lastSnapshot=v; if (!v) return blank(); const d=JSON.parse(v); if(d.version!==1 || !Array.isArray(d.short)||!Array.isArray(d.long)) throw Error('创作数据格式不受支持'); return d; }
  function commit(next) { try { if (localStorage.getItem(KEY) !== lastSnapshot) { notice('其他页面修改了创作数据，请先复制当前未保存内容，再返回经验工作台并重新进入',true); return false; } const payload=JSON.stringify(next); localStorage.setItem(KEY, payload); lastSnapshot=payload; db=next; return true; } catch(e) { notice('保存失败：浏览器空间可能不足，请先备份并检查存储空间',true); return false; } }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function localTime(value) { const date=new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : String(value||'').replace('T',' ').slice(0,16); }
  function code(prefix,n) { return prefix + String(n).padStart(3,'0'); }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); }
  function list() { return db[mode]; }
  function askLeave() { return !dirty || confirm('当前修改还没有保存，确定放弃吗？'); }
  function switchMode(next) { if (!askLeave()) return; mode=next; selected=null; draft=null; editing=false; dirty=false; returnDraft=null; search='';filter='all';visibleLimit=100;render(); }
  function newDraft(kind=mode) { return {id:uid(),code:'保存后生成',created:new Date().toISOString(),updated:new Date().toISOString(),title:'', ...(kind==='short'?{practiceStatus:'待实践',structureId:'',body:shortTemplate}:{body:longTemplate})}; }
  function beginNew() { if(!askLeave())return; draft=newDraft();selected=null;editing=true;dirty=true;render(); }
  function save() {
    if(!draft)return;
    if (mode==='short' && !String(draft.title||'').trim() && !String(draft.url||'').trim() && !String(draft.transcript||'').trim()) {notice('请填写标题或参考视频链接',true);return;}
    if(mode==='long'&&!String(draft.title||'').trim()){notice('请填写结构或方法名称',true);return;}
    const next=clone(db), entry=clone(draft), idx=next[mode].findIndex(x=>x.id===entry.id);
    if(idx<0) {const k=mode==='short'?'nextC':'nextS';entry.code=code(mode==='short'?'C':'S',next[k]||1);next[k]=(next[k]||1)+1;next[mode].push(entry);} else next[mode][idx]=entry;
    entry.updated=new Date().toISOString();
    if(!commit(next))return;
    selected=entry.id;draft=clone(entry);editing=false;dirty=false;
    if(mode==='long' && returnDraft){const ret=returnDraft;returnDraft=null;mode='short';draft=ret;draft.structureId=entry.id;editing=true;selected=db.short.some(x=>x.id===draft.id)?draft.id:null;dirty=true;render();notice('结构已保存并关联，请保存短线记录');return;}
    render(); notice('已保存');
  }
  function remove() {
    if(!selected)return; const item=list().find(x=>x.id===selected);if(!item)return;
    const related=mode==='long'?db.short.filter(x=>x.structureId===item.id).length:0;
    if(!confirm(`删除「${item.title || item.code}」？${related ? `关联的 ${related} 条短线记录会保留，关联将解除；删除的长线无法撤销。` : '删除后无法在工作台中撤销，请先确认已有备份。'}`))return;
    const next=clone(db);next[mode]=next[mode].filter(x=>x.id!==item.id);
    if(mode==='long') next.short.forEach(x=>{if(x.structureId===item.id)x.structureId='';});
    if(!commit(next))return; selected=null;draft=null;editing=false;dirty=false;render();notice('已删除');
  }
  function createLinked() {
    if(mode!=='short'||!draft)return;
    returnDraft=clone(draft); const ref=draft;
    mode='long';selected=null;draft=newDraft('long');
    draft.title=ref.structureName||'';draft.body=longTemplate;editing=true;dirty=true;render();notice('保存新结构后，将返回短线并关联');
  }
  function options(vals,value) {return vals.map(v=>`<option ${v===value?'selected':''}>${E(v)}</option>`).join('');}
  function field([key,label,type],entry) {
    const v=entry[key]??'';
    let input;
    if(type==='area') input=`<textarea data-field="${key}" aria-label="${E(label)}">${E(v)}</textarea>`;
    else if(type==='status') input=`<select data-field="${key}" aria-label="${E(label)}">${options(statuses,v||'待分析')}</select>`;
    else if(type==='verification') input=`<select data-field="${key}" aria-label="${E(label)}">${options(verify,v||'待实践')}</select>`;
    else if(type==='outperformance') input=`<select data-field="${key}" aria-label="${E(label)}">${options(['未知','是','否'],v||'未知')}</select>`;
    else input=`<input data-field="${key}" aria-label="${E(label)}" type="${type}" ${type==='number'?'min="0" step="any"':''} value="${E(v)}">`;
    return `<div class="field"><label>${E(label)}</label>${input}</div>`;
  }
  function sidebar() {
    return `<aside class="sidebar"><div class="brand"><div class="logo">创</div><div><div class="brand-name">创作工作台</div><div class="brand-sub">短 · 快 · 多</div></div></div>
      <button class="nav-item" data-action="experience">← 经验工作台</button><div class="creative-nav-title">创作工作台</div>
      <nav class="nav"><button class="nav-item ${mode==='short'?'active':''}" data-mode="short"><span class="dot" style="background:var(--short)"></span>短线 <span class="count">${db.short.length}</span></button>
      <button class="nav-item ${mode==='long'?'active':''}" data-mode="long"><span class="dot" style="background:var(--long)"></span>长线 <span class="count">${db.long.length}</span></button></nav>
      <div class="side-bottom"><div class="creative-hint">创作记录保存在当前浏览器，建议定期备份。</div><button class="side-btn" data-action="backup">⤓ 备份创作数据</button><button class="side-btn" data-action="restore">⤒ 导入创作备份</button><input id="creativeRestore" type="file" accept=".json,application/json" hidden></div></aside>`;
  }
  function records() {
    const q=search.trim().toLowerCase();
    const items=list().filter(x=>{
      const structure=db.long.find(a=>a.id===x.structureId);
      const values=[...Object.values(x),structure?.title||'',structure?.steps||''].join(' ').toLowerCase();
      return (!q||values.includes(q)) && (filter==='all'||(mode==='short'?practice(x):'all')===filter);
    }).sort((a,b)=>String(b.updated||b.created).localeCompare(String(a.updated||a.created)));
    return `<section class="list-pane"><div class="creative-list-actions"><button class="btn primary big" data-action="new">＋ 新建${mode==='short'?'短线':'长线'}</button></div>
      <div class="creative-search"><input id="creativeSearch" type="search" placeholder="搜索标题、内容、结构、状态…" value="${E(search)}"><select id="creativeFilter" aria-label="按状态筛选"><option value="all">全部状态</option>${mode==='short'?options(statuses,filter):''}</select></div>
      <div class="list-head">${mode==='short'?'短线创作':'长线结构'} · ${items.length} 条</div><div class="list">${items.length?items.slice(0,visibleLimit).map(x=>`<div class="card ${selected===x.id?'selected':''}" data-select="${E(x.id)}"><div class="card-top"><span class="chip ${mode==='short'?'短线':'长线'}">${E(x.code)}</span><span>${E(mode==='short'?practice(x):'结构与方法')}</span><span class="date">${E((x.created||'').slice(0,10))}</span></div><div class="card-title">${E(x.title||x.url||'未命名记录')}</div>${mode==='short'&&x.structureId?`<div class="card-how">结构：${E(db.long.find(y=>y.id===x.structureId)?.title||'未找到')}</div>`:''}</div>`).join('')+(items.length>visibleLimit?`<button class="more" data-action="more">再显示 ${Math.min(100,items.length-visibleLimit)} 条</button>`:''):'<div class="empty-list">还没有符合条件的记录</div>'}</div></section>`;
  }
  // 旧字段只读转换为 Markdown，原始数据始终保留；首次保存新正文不会删除旧字段。
  function legacyBody(x,kind) {
    const out=[];
    for(const [section,fields] of groups[kind]) {
      const filled=fields.filter(([k])=>!['title','status','verification','outperformance'].includes(k) && x[k]!==undefined && x[k]!==null && String(x[k]).trim()!=='');
      if(filled.length){out.push('## '+section,'');for(const [k,label] of filled)out.push('**'+label+'：**',String(x[k]),'');}
    }
    if(kind==='short' && x.outperformance && x.outperformance!=='未知')out.push('**明显高于日常表现：** '+x.outperformance,'');
    if(kind==='short' && x.status)out.push('**原状态：** '+x.status,'');
    if(kind==='long' && x.verification)out.push('**原验证情况：** '+x.verification,'');
    return out.join('\n').trim();
  }
  function bodyOf(x,kind) { return typeof x.body==='string' ? x.body : (legacyBody(x,kind) || (kind==='short'?shortTemplate:longTemplate)); }
  function inline(text) {
    return E(text).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function markdown(text) {
    const lines=String(text||'').replace(/\r/g,'').split('\n'); let html='',i=0;
    const tableRow=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());
    const isSep=s=>/^\s*\|?\s*:?-{3,}/.test(s) && tableRow(s).every(c=>/^:?-{3,}:?$/.test(c));
    while(i<lines.length){let l=lines[i], m;
      if(!l.trim()){i++;continue;}
      if(/^```/.test(l)){const b=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))b.push(lines[i++]);if(i<lines.length)i++;html+='<pre><code>'+E(b.join('\n'))+'</code></pre>';continue;}
      if(l.includes('|')&&i+1<lines.length&&isSep(lines[i+1])){const heads=tableRow(l);i+=2;let rows='';while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){const cells=tableRow(lines[i++]);rows+='<tr>'+heads.map((_,n)=>'<td>'+inline(cells[n]||'')+'</td>').join('')+'</tr>';}html+='<div class="cw-table-wrap"><table><thead><tr>'+heads.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';continue;}
      if((m=l.match(/^(#{1,6})\s+(.*)$/))){const level=Math.min(m[1].length+1,6);html+=`<h${level}>${inline(m[2])}</h${level}>`;i++;continue;}
      if(/^\s*([-*+] |\d+[.)、] )/.test(l)){const ordered=/^\s*\d+[.)、] /.test(l),tag=ordered?'ol':'ul',buf=[];while(i<lines.length&&(ordered?/^\s*\d+[.)、] /:/^\s*[-*+] /).test(lines[i]))buf.push('<li>'+inline(lines[i++].replace(/^\s*(?:[-*+]|\d+[.)、])\s+/,''))+'</li>');html+='<'+tag+'>'+buf.join('')+'</'+tag+'>';continue;}
      if(/^\s*[-*_]{3,}\s*$/.test(l)){html+='<hr>';i++;continue;}
      let buf=[inline(l)];i++;while(i<lines.length&&lines[i].trim()&&!/^(#{1,6}\s|```|\s*[-*+] |\s*\d+[.)、] )/.test(lines[i]) && !(lines[i].includes('|')&&i+1<lines.length&&isSep(lines[i+1])))buf.push(inline(lines[i++]));html+='<p>'+buf.join('<br>')+'</p>';
    }
    return html;
  }
  function detail() {
    if(!draft) return `<main class="detail-pane"><div class="creative-empty"><h2>把想法带到真实创作中</h2><p>选择一条记录阅读，或新建一条。</p><button class="btn primary big" data-action="new">＋ 新建${mode==='short'?'短线记录':'长线结构'}</button></div></main>`;
    const body=bodyOf(draft,mode), related=mode==='short'?db.long.find(x=>x.id===draft.structureId):null;
    const refs=mode==='long'?`<details class="creative-section"><summary>关联的短线作品（${db.short.filter(x=>x.structureId===draft.id).length}）</summary><div class="creative-links">${db.short.filter(x=>x.structureId===draft.id).map(x=>`<button class="btn" data-goto-short="${E(x.id)}">${E(x.code+'｜'+(x.title||'未命名'))}</button>`).join('')||'<span class="creative-hint">暂无关联作品。</span>'}</div></details>`:'';
    const linkEditor=mode==='short'?`<div class="field"><label>关联长线结构（可选）</label><select data-field="structureId" aria-label="关联长线结构"><option value="">暂不关联</option>${db.long.map(x=>`<option value="${E(x.id)}" ${x.id===draft.structureId?'selected':''}>${E(x.code+'｜'+x.title)}</option>`).join('')}</select></div><button type="button" class="btn" data-action="newLinked">＋ 新建长线结构并关联</button>`:'';
    const legacy=typeof draft.body==='string' && legacyBody(draft,mode) ? `<details class="creative-section"><summary>查看 V1 原有字段（已保留）</summary><div class="creative-prose">${markdown(legacyBody(draft,mode))}</div></details>` : '';
    const editHtml=`<div class="editor cw-edit"><div class="field"><label>标题</label><input data-field="title" aria-label="标题" value="${E(draft.title||'')}"></div>${mode==='short'?`<div class="field"><label>参考视频链接（可选）</label><input type="url" data-field="url" aria-label="参考视频链接" value="${E(draft.url||'')}"></div><div class="field"><label>状态</label><select data-field="practiceStatus" aria-label="状态">${options(statuses,practice(draft))}</select></div>${linkEditor}`:''}<div class="field"><label>Markdown 正文</label><textarea class="cw-markdown-input" data-field="body" aria-label="Markdown 正文">${E(body)}</textarea></div></div><div class="creative-sticky"><button class="btn primary big" data-action="save">保存</button><button class="btn" data-action="cancelEdit">取消</button><span class="creative-hint">${dirty?'有未保存修改':'编辑中'}</span></div>`;
    const viewHtml=`<div class="detail-toolbar"><button class="btn primary" data-action="edit">编辑</button><button class="btn" data-action="copy">复制 Markdown</button><span class="spacer"></span><button class="btn danger" data-action="delete">删除</button></div><div class="creative-heading"><span class="chip ${mode==='short'?'短线':'长线'}">${E(draft.code)}</span>${mode==='short'?`<span class="chip ghost">${E(practice(draft))}</span>`:''}</div><h1 class="conclusion cw-title">${E(draft.title||'未命名记录')}</h1><div class="creative-hint cw-meta">创建：${E(localTime(draft.created))} · 修改：${E(localTime(draft.updated||draft.created))}</div>${draft.url?`<div class="creative-hint cw-meta">参考链接：${/^https?:\/\//i.test(draft.url)?`<a href="${E(draft.url)}" target="_blank" rel="noopener noreferrer">${E(draft.url)}</a>`:E(draft.url)}</div>`:''}${related?`<div class="creative-hint cw-meta">关联结构：${E(related.code+'｜'+related.title)}</div>`:''}<article class="creative-prose">${markdown(body)}</article>${legacy}${refs}`;
    return `<main class="detail-pane"><div class="detail cw-detail">${editing?`<div class="creative-heading"><span class="chip ${mode==='short'?'短线':'长线'}">${E(draft.code)}</span><span class="creative-hint">${selected?'编辑记录':'新记录'}</span></div>${editHtml}`:viewHtml}</div></main>`;
  }
  function render() { root.innerHTML=sidebar()+records()+detail(); }
  function refreshList() { const pane=$c('.list-pane'), list=pane.querySelector('.list'), scroll=list.scrollTop; const temp=document.createElement('div'); temp.innerHTML=records(); pane.querySelector('.list-head').replaceWith(temp.querySelector('.list-head')); list.replaceWith(temp.querySelector('.list')); pane.querySelector('.list').scrollTop=scroll; }
  async function copyBody(){
    const value=bodyOf(draft,mode);
    try{await navigator.clipboard.writeText(value);notice('已复制 Markdown');}
    catch(_){openModal(`<h3>复制 Markdown</h3><div class="sub">浏览器未允许自动复制，请手动全选复制。</div><textarea class="capture" readonly>${E(value)}</textarea><div class="actions"><button class="btn" id="cwCopyClose">关闭</button></div>`);document.getElementById('cwCopyClose').addEventListener('click',closeModal);}
  }
  function download() {const blob=new Blob([JSON.stringify({app:'creation-workbench',exportedAt:new Date().toISOString(),data:db},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='创作工作台备份-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notice('已开始下载创作备份');}
  function restore(obj) {
    if(obj?.app!=='creation-workbench'||!obj.data||obj.data.version!==1||!Array.isArray(obj.data.short)||!Array.isArray(obj.data.long))throw Error('请选择创作工作台的备份文件');
    const next=clone(db);let added=0;
    for(const kind of ['long','short']) for(const item of obj.data[kind]) {
      if(!item || typeof item.id!=='string' || typeof item.code!=='string') throw Error('备份中存在无效记录');
      if(next.short.some(x=>x.id===item.id)||next.long.some(x=>x.id===item.id))continue;
      const copy=clone(item), key=kind==='short'?'nextC':'nextS', prefix=kind==='short'?'C':'S';
      if(!new RegExp('^'+prefix+'[0-9]+$').test(copy.code) || next[kind].some(x=>x.code===copy.code)) {copy.code=code(prefix,next[key]||1);while(next[kind].some(x=>x.code===copy.code))copy.code=code(prefix,++next[key]);}
      next[key]=Math.max(next[key]||1,Number(copy.code.slice(1))+1);next[kind].push(copy);added++;
    }
    if(!commit(next))return; render();notice(`恢复完成：新增 ${added} 条，已有记录未覆盖`);
  }
  document.getElementById('openCreative').addEventListener('click',()=>{ if(S.editing){saveDraft();} try {db=read();} catch(e) {toast('创作数据读取失败，请勿清除浏览器数据：'+e.message,true);return;} old.hidden=true;root.hidden=false;render();});
  root.addEventListener('input',e=>{if(e.target.dataset.field&&draft){draft[e.target.dataset.field]=e.target.value;dirty=true;const hint=$c('.creative-sticky .creative-hint');if(hint)hint.textContent='有未保存修改';} if(e.target.id==='creativeSearch'){search=e.target.value;visibleLimit=100;refreshList();}});
  root.addEventListener('change',async e=>{if(e.target.id==='creativeFilter'){filter=e.target.value;visibleLimit=100;refreshList();} if(e.target.id==='creativeRestore' && e.target.files[0]){if(!askLeave())return;try{restore(JSON.parse(await e.target.files[0].text()));}catch(err){notice('导入失败：'+err.message,true);}}});
  root.addEventListener('click',e=>{
    const m=e.target.closest('[data-mode]');if(m){switchMode(m.dataset.mode);return;}
    const r=e.target.closest('[data-select]');if(r){if(!askLeave())return;selected=r.dataset.select;draft=clone(list().find(x=>x.id===selected));editing=false;dirty=false;returnDraft=null;render();return;}
    const go=e.target.closest('[data-goto-short]');if(go){if(!askLeave())return;mode='short';selected=go.dataset.gotoShort;draft=clone(db.short.find(x=>x.id===selected));editing=false;dirty=false;search='';filter='all';render();return;}
    const a=e.target.closest('[data-action]');if(!a)return;
    switch(a.dataset.action){case 'more':visibleLimit+=100;refreshList();break;case 'experience':if(!askLeave())return;root.hidden=true;old.hidden=false;break;case 'new':beginNew();break;case 'edit':editing=true;dirty=false;render();break;case 'cancelEdit':if(!askLeave())return;if(returnDraft){mode='short';draft=returnDraft;returnDraft=null;selected=db.short.some(x=>x.id===draft.id)?draft.id:null;editing=true;dirty=true;render();return;}if(selected){draft=clone(list().find(x=>x.id===selected));editing=false;dirty=false;}else{draft=null;editing=false;dirty=false;}render();break;case 'copy':copyBody();break;case 'save':save();break;case 'delete':remove();break;case 'newLinked':createLinked();break;case 'backup':download();break;case 'restore':$c('#creativeRestore').click();break;}
  });
  window.addEventListener('beforeunload',e=>{if(!root.hidden&&dirty){e.preventDefault();e.returnValue='';}});
})();
