/* 创作工作台：独立的浏览器本地数据，不触碰经验工作台数据。 */
(() => {
  'use strict';
  const KEY = 'creation-workbench-v1';
  const root = document.getElementById('creativeApp');
  const old = document.getElementById('app');
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $c = s => root.querySelector(s);
  const blank = () => ({version:1,nextC:1,nextS:1,short:[],long:[]});
  let db, lastSnapshot=null, mode='short', selected=null, draft=null, dirty=false, returnDraft=null, search='', filter='all', visibleLimit=100;
  const statuses=['待分析','待创作','待录制','已发布'];
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
  function code(prefix,n) { return prefix + String(n).padStart(3,'0'); }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); }
  function list() { return db[mode]; }
  function askLeave() { return !dirty || confirm('当前修改还没有保存，确定放弃吗？'); }
  function switchMode(next) { if (!askLeave()) return; mode=next; selected=null; draft=null; dirty=false; returnDraft=null; search='';filter='all';visibleLimit=100;render(); }
  function newDraft(kind=mode) { return {id:uid(),code:'保存后生成',created:new Date().toISOString(),updated:new Date().toISOString(),title:'', ...(kind==='short'?{status:'待分析',outperformance:'未知',structureId:''}:{verification:'待实践'})}; }
  function beginNew() { if(!askLeave())return; draft=newDraft();selected=null;dirty=true;render(); }
  function save() {
    if(!draft)return;
    if (mode==='short' && !String(draft.title||'').trim() && !String(draft.url||'').trim() && !String(draft.transcript||'').trim()) {notice('请至少填写标题、视频链接或原始字幕',true);return;}
    if(mode==='long'&&!String(draft.title||'').trim()){notice('请填写结构或方法名称',true);return;}
    const next=clone(db), entry=clone(draft), idx=next[mode].findIndex(x=>x.id===entry.id);
    if(idx<0) {const k=mode==='short'?'nextC':'nextS';entry.code=code(mode==='short'?'C':'S',next[k]||1);next[k]=(next[k]||1)+1;next[mode].push(entry);} else next[mode][idx]=entry;
    entry.updated=new Date().toISOString();
    if(!commit(next))return;
    selected=entry.id;draft=clone(entry);dirty=false;
    if(mode==='long' && returnDraft){const ret=returnDraft;returnDraft=null;mode='short';draft=ret;draft.structureId=entry.id;selected=db.short.some(x=>x.id===draft.id)?draft.id:null;dirty=true;render();notice('结构已保存并关联，请保存短线记录');return;}
    render(); notice('已保存');
  }
  function remove() {
    if(!selected)return; const item=list().find(x=>x.id===selected);if(!item)return;
    const related=mode==='long'?db.short.filter(x=>x.structureId===item.id).length:0;
    if(!confirm(`删除「${item.title || item.code}」？${related ? `关联的 ${related} 条短线记录会保留，关联将解除；删除的长线无法撤销。` : '删除后无法在工作台中撤销，请先确认已有备份。'}`))return;
    const next=clone(db);next[mode]=next[mode].filter(x=>x.id!==item.id);
    if(mode==='long') next.short.forEach(x=>{if(x.structureId===item.id)x.structureId='';});
    if(!commit(next))return; selected=null;draft=null;dirty=false;render();notice('已删除');
  }
  function createLinked() {
    if(mode!=='short'||!draft)return;
    returnDraft=clone(draft); const ref=draft;
    mode='long';selected=null;draft=newDraft('long');
    draft.title=ref.structureName||'';draft.steps=ref.structureSteps||'';draft.applicable=ref.applicable||'';draft.learn=ref.learn||'';draft.avoid=ref.avoid||'';dirty=true;render();notice('保存新结构后，将返回短线并关联');
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
      return (!q||values.includes(q)) && (filter==='all'||(mode==='short'?x.status:x.verification)===filter);
    }).sort((a,b)=>String(b.updated||b.created).localeCompare(String(a.updated||a.created)));
    return `<section class="list-pane"><div class="creative-list-actions"><button class="btn primary big" data-action="new">＋ 新建${mode==='short'?'短线':'长线'}</button></div>
      <div class="creative-search"><input id="creativeSearch" type="search" placeholder="搜索标题、内容、结构、状态…" value="${E(search)}"><select id="creativeFilter" aria-label="按状态筛选"><option value="all">全部状态</option>${options(mode==='short'?statuses:verify,filter)}</select></div>
      <div class="list-head">${mode==='short'?'短线创作':'长线结构'} · ${items.length} 条</div><div class="list">${items.length?items.slice(0,visibleLimit).map(x=>`<div class="card ${selected===x.id?'selected':''}" data-select="${E(x.id)}"><div class="card-top"><span class="chip ${mode==='short'?'短线':'长线'}">${E(x.code)}</span><span>${E(mode==='short'?(x.status||'待分析'):(x.verification||'待实践'))}</span><span class="date">${E((x.created||'').slice(0,10))}</span></div><div class="card-title">${E(x.title||x.url||'未命名记录')}</div>${mode==='short'&&x.structureId?`<div class="card-how">结构：${E(db.long.find(y=>y.id===x.structureId)?.title||'未找到')}</div>`:''}</div>`).join('')+(items.length>visibleLimit?`<button class="more" data-action="more">再显示 ${Math.min(100,items.length-visibleLimit)} 条</button>`:''):'<div class="empty-list">还没有符合条件的记录</div>'}</div></section>`;
  }
  function detail() {
    if(!draft) return `<main class="detail-pane"><div class="creative-empty"><h2>把想法带到真实创作中</h2><p>先记录一个案例，或保存一个待实践的表达结构。</p><button class="btn primary big" data-action="new">＋ 新建${mode==='short'?'短线记录':'长线结构'}</button></div></main>`;
    const linked=mode==='short'?`<div class="field"><label>关联主要表达结构</label><select data-field="structureId" aria-label="关联主要表达结构"><option value="">暂不关联</option>${db.long.map(x=>`<option value="${E(x.id)}" ${x.id===draft.structureId?'selected':''}>${E(x.code+'｜'+x.title)}</option>`).join('')}</select></div><button class="btn" type="button" data-action="newLinked">＋ 从案例分析新建长线结构</button><div class="sub">新结构保存后会返回当前短线，关联需随短线一起保存。</div>`:'';
    const sections=groups[mode].map(([title,fields],idx)=>`<details class="creative-section" ${idx===0?'open':''}><summary>${E(title)}</summary>${title==='案例分析'?'<div class="sub">吸引力分析是待验证的判断，不自动当作规律。</div>':''}<div class="grid">${fields.map(f=>field(f,draft)).join('')}</div>${title==='案例分析'?linked:''}</details>`).join('');
    const refs=mode==='long'?`<details class="creative-section" open><summary>关联的短线作品</summary><div class="creative-links">${db.short.filter(x=>x.structureId===draft.id).map(x=>`<button class="btn" data-goto-short="${E(x.id)}">${E(x.code+'｜'+(x.title||'未命名'))}</button>`).join('')||'<span class="creative-hint">暂无关联作品。可在短线的案例分析中选择此结构。</span>'}</div></details>`:'';
    return `<main class="detail-pane"><div class="detail"><div class="creative-heading"><h1 class="conclusion">${E(draft.code)}</h1><span class="chip ${mode==='short'?'短线':'长线'}">${mode==='short'?'短线创作':'长线结构'}</span><span class="creative-hint">创建于 ${(draft.created||'').slice(0,10)} · ${selected?'已保存记录':'新记录'}</span></div>
      <p class="creative-hint">${mode==='short'?'只填标题、链接或字幕即可保存；各部分可随时补充。':'先记录结构，效果可以在实践后再验证。'}</p>${sections}${refs}
      <div class="creative-sticky"><button class="btn primary big" data-action="save">保存</button>${selected?'<button class="btn danger" data-action="delete">删除</button>':''}<span class="creative-hint">${dirty?'有未保存修改':'已保存到当前浏览器'}</span></div></div></main>`;
  }
  function render() { root.innerHTML=sidebar()+records()+detail(); }
  function refreshList() { const pane=$c('.list-pane'), list=pane.querySelector('.list'), scroll=list.scrollTop; const temp=document.createElement('div'); temp.innerHTML=records(); pane.querySelector('.list-head').replaceWith(temp.querySelector('.list-head')); list.replaceWith(temp.querySelector('.list')); pane.querySelector('.list').scrollTop=scroll; }
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
    const r=e.target.closest('[data-select]');if(r){if(!askLeave())return;selected=r.dataset.select;draft=clone(list().find(x=>x.id===selected));dirty=false;returnDraft=null;render();return;}
    const go=e.target.closest('[data-goto-short]');if(go){if(!askLeave())return;mode='short';selected=go.dataset.gotoShort;draft=clone(db.short.find(x=>x.id===selected));dirty=false;search='';filter='all';render();return;}
    const a=e.target.closest('[data-action]');if(!a)return;
    switch(a.dataset.action){case 'more':visibleLimit+=100;refreshList();break;case 'experience':if(!askLeave())return;root.hidden=true;old.hidden=false;break;case 'new':beginNew();break;case 'save':save();break;case 'delete':remove();break;case 'newLinked':createLinked();break;case 'backup':download();break;case 'restore':$c('#creativeRestore').click();break;}
  });
  window.addEventListener('beforeunload',e=>{if(!root.hidden&&dirty){e.preventDefault();e.returnValue='';}});
})();
