/* 创作工作台：独立的浏览器本地数据，不触碰经验工作台数据。 */
(() => {
  'use strict';
  const KEY = 'creation-workbench-v1';
  const root = document.getElementById('creativeApp');
  const old = document.getElementById('app');
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $c = s => root.querySelector(s);
  const blank = () => ({version:1,nextC:1,nextS:1,nextA:1,short:[],long:[],analysis:[]});
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
  // 选题模板：短线新建时的默认正文（对应战略看板的选题公式）
  const topicTemplate = `## 一、选题

- **来源类型：** 官方新能力 / 真人用法 / X 动向
- **出处：**
- **平替说明：**（原玩法需要工具时填写）

## 二、复制即用

>

## 三、60 秒骨架

- **钩子：**
- **演示：**
- **结果：**

## 四、注意

- **为什么会收藏：**
- **需要实测：**
- **当前判断：** 待实践。`;
  // 新东西上手模板（15～30 秒）
  const tryoutTemplate = `## 一、新东西

- **是什么：**（哪家、什么模型或功能、哪天出的）
- **链接：**

## 二、我试了什么

> （用了哪句话或哪个操作）

## 三、15～30 秒怎么拍

- **开头一句：**
- **展示：**（最惊艳的那一下）
- **一句评价：**

## 四、注意

- **普通人能不能用：**（免费 / 付费 / 地区限制）
- **当前判断：** 待实践。`;
  // 想法观察模板（约 15 秒）
  const ideaTemplate = `## 一、一句话观点

## 二、怎么想到的

（哪次使用、哪条评论、哪个新闻）

## 三、15 秒怎么说

- **开头：**
- **展开：**
- **收尾：**

- **当前判断：** 待实践。`;
  const templates = { topic: ['解法', topicTemplate], tryout: ['上手', tryoutTemplate], idea: ['想法', ideaTemplate], case: ['拆案例', shortTemplate] };
  // 栏目：名称要和战略看板 strategy.js 里的栏目一致
  const COLUMNS = ['观点', '尝鲜', '干货', '拆解'];
  const COLUMN_ALIASES = {'想法观察':'观点','新东西上手':'尝鲜','痛点解法':'干货','深度内容':'干货','文章':'拆解'};
  const columnName = value => COLUMN_ALIASES[value] || value || '';
  const COLUMN_TEMPLATE = { '干货': 'topic', '尝鲜': 'tryout', '观点': 'idea' };
  const DESIRES = ['懒', '怕', '贪', '面子', '爽好奇', '被说中'];
  const METRICS = [['views','播放'],['favorites','收藏'],['follows','关注']];
  // 这些字段由新界面直接编辑，不再算作「V1 原有字段」
  const NEW_KEYS = ['column','practicedAt','desire','views','favorites','follows'];
  const importFormat = `标题：填写选题钩子
参考视频链接：
状态：待实践
栏目：观点 / 尝鲜 / 干货 / 拆解（选一个）
欲望标签：懒 / 怕 / 贪 / 面子 / 爽好奇 / 被说中（选一个）
正文：
${topicTemplate}`;
  const longTemplate = `## 核心结论

## 表达步骤

## 为什么可能有效

## 适用场景

## 值得学与暂不模仿

## 实践验证

待实践。`;
  const analysisTemplate = '## 开头\n\n## 节奏\n\n## 画面\n\n## 标题与结尾\n';
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
  function read() { const v=localStorage.getItem(KEY); lastSnapshot=v; if (!v) return blank(); const d=JSON.parse(v); if(d.version!==1 || !Array.isArray(d.short)||!Array.isArray(d.long) || (d.analysis!==undefined && !Array.isArray(d.analysis))) throw Error('创作数据格式不受支持'); if(!d.analysis)d.analysis=[]; if(!d.nextA)d.nextA=1; return d; }
  function commit(next) { try { if (localStorage.getItem(KEY) !== lastSnapshot) { notice('其他页面修改了创作数据，请先复制当前未保存内容，再返回经验工作台并重新进入',true); return false; } const payload=JSON.stringify(next); localStorage.setItem(KEY, payload); lastSnapshot=payload; db=next; return true; } catch(e) { notice('保存失败：浏览器空间可能不足，请先备份并检查存储空间',true); return false; } }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function localTime(value) { const date=new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : String(value||'').replace('T',' ').slice(0,16); }
  function code(prefix,n) { return prefix + String(n).padStart(3,'0'); }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); }
  function list() { return db[mode]; }
  function askLeave() { return !dirty || confirm('当前修改还没有保存，确定放弃吗？'); }
  function switchMode(next) { if (!askLeave()) return; mode=next; selected=null; draft=null; editing=false; dirty=false; returnDraft=null; search='';filter='all';visibleLimit=100;render(); }
  function newDraft(kind=mode) { return {id:uid(),code:'保存后生成',created:new Date().toISOString(),updated:new Date().toISOString(),title:'', ...(kind==='short'?{practiceStatus:'待实践',structureId:'',column:'',desire:'',body:topicTemplate}:kind==='analysis'?{status:'待用',shortId:'',upgrade:'',body:analysisTemplate}:{body:longTemplate})}; }
  // 切换正文模板：正文是空的或还是某个模板原样时直接换；写过内容就先确认
  function useTemplate(key) {
    if(!draft||mode!=='short'||!templates[key])return;
    const cur=String(draft.body??'').trim(), untouched=!cur||Object.values(templates).some(([,t])=>t.trim()===cur);
    if(!untouched&&!confirm(`正文已经写了内容，换成「${templates[key][0]}」模板会覆盖它，确定吗？`))return;
    draft.body=templates[key][1];dirty=true;render();
  }
  function metricsLine(x) {
    const nums=METRICS.filter(([k])=>x[k]!==undefined&&x[k]!==null&&String(x[k]).trim()!=='');
    if(!nums.length)return '';
    const v=Number(x.views),f=Number(x.favorites);
    const rate=v>0&&String(x.favorites??'').trim()!==''&&Number.isFinite(f)?` · 收藏率 ${(f/v*100).toFixed(1)}%`:'';
    return nums.map(([k,l])=>`${l} ${E(x[k])}`).join(' · ')+rate;
  }
  function beginNew() { if(!askLeave())return; draft=newDraft();selected=null;editing=true;dirty=true;render(); }
  function save() {
    if(!draft)return;
    if (mode==='short' && !String(draft.title||'').trim() && !String(draft.url||'').trim() && !String(draft.transcript||'').trim()) {notice('请填写标题或参考视频链接',true);return;}
    if(mode==='long'&&!String(draft.title||'').trim()){notice('请填写结构或方法名称',true);return;}
    if(mode==='analysis'&&(!String(draft.title||'').trim()||!String(draft.upgrade||'').trim())){notice('请填写标题和升级点',true);return;}
    if(mode==='analysis'&&/[\r\n]/.test(draft.upgrade.trim())){notice('升级点请写成一句话',true);return;}
    const next=clone(db), entry=clone(draft), idx=next[mode].findIndex(x=>x.id===entry.id);
    // 记下第一次标为「已实践」的时间，战略看板用它算「今天已实践几条」
    if(mode==='short'){ if(practice(entry)==='已实践'){ if(!entry.practicedAt && (idx<0 || practice(next.short[idx])!=='已实践')) entry.practicedAt=new Date().toISOString(); } else delete entry.practicedAt; }
    if(idx<0) {const k=mode==='short'?'nextC':mode==='long'?'nextS':'nextA', prefix=mode==='short'?'C':mode==='long'?'S':'A'; let n=next[k]||1; while(next[mode].some(x=>x.code===code(prefix,n)))n++; entry.code=code(prefix,n);next[k]=n+1;next[mode].push(entry);} else next[mode][idx]=entry;
    // 一条短线关联一条分析；在同一次本地写入里同步反向关联和状态。
    if(mode==='short'){
      next.analysis.forEach(a=>{if(a.shortId===entry.id && a.id!==entry.analysisId)a.shortId='';});
      const a=next.analysis.find(a=>a.id===entry.analysisId);
      if(a){next.short.forEach(x=>{if(x.id!==entry.id&&x.analysisId===a.id)x.analysisId='';}); a.shortId=entry.id;a.status='已用';}
    } else if(mode==='analysis'){
      next.short.forEach(x=>{if(x.analysisId===entry.id && x.id!==entry.shortId)x.analysisId='';});
      const target=next.short.find(x=>x.id===entry.shortId);
      if(target){next.analysis.forEach(a=>{if(a.id!==entry.id&&a.shortId===target.id)a.shortId='';});target.analysisId=entry.id;entry.status='已用';}
    }
    entry.updated=new Date().toISOString();
    if(!commit(next))return;
    selected=entry.id;draft=clone(entry);editing=false;dirty=false;
    if(mode==='long' && returnDraft){const ret=returnDraft;returnDraft=null;mode='short';draft=ret;draft.structureId=entry.id;editing=true;selected=db.short.some(x=>x.id===draft.id)?draft.id:null;dirty=true;render();notice('结构已保存并关联，请保存作品');return;}
    render(); notice('已保存');
  }
  function remove() {
    if(!selected)return; const item=list().find(x=>x.id===selected);if(!item)return;
    const related=mode==='long'?db.short.filter(x=>x.structureId===item.id).length:0;
    if(!confirm(`删除「${item.title || item.code}」？${related ? `关联的 ${related} 条作品会保留，关联将解除；删除的结构无法撤销。` : '删除后无法在工作台中撤销，请先确认已有备份。'}`))return;
    const next=clone(db);next[mode]=next[mode].filter(x=>x.id!==item.id);
    if(mode==='long') next.short.forEach(x=>{if(x.structureId===item.id)x.structureId='';});
    if(mode==='analysis') next.short.forEach(x=>{if(x.analysisId===item.id)x.analysisId='';});
    if(mode==='short') next.analysis.forEach(x=>{if(x.shortId===item.id)x.shortId='';});
    if(!commit(next))return; selected=null;draft=null;editing=false;dirty=false;render();notice('已删除');
  }
  function createLinked() {
    if(mode!=='short'||!draft)return;
    returnDraft=clone(draft); const ref=draft;
    mode='long';selected=null;draft=newDraft('long');
    draft.title=ref.structureName||'';draft.body=longTemplate;editing=true;dirty=true;render();notice('保存新结构后，将返回作品并关联');
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
      <button class="nav-item" data-action="experience">← 经验工作台</button><button class="nav-item" data-action="articles">📖 文章库</button><div class="creative-nav-title">创作工作台</div>
      <nav class="nav"><button class="nav-item ${mode==='short'?'active':''}" data-mode="short"><span class="dot" style="background:var(--short)"></span>作品 <span class="count">${db.short.length}</span></button>
      <button class="nav-item ${mode==='long'?'active':''}" data-mode="long"><span class="dot" style="background:var(--long)"></span>结构与方法 <span class="count">${db.long.length}</span></button><button class="nav-item ${mode==='analysis'?'active':''}" data-mode="analysis"><span class="dot" style="background:var(--ink-3)"></span>分析 <span class="count">${db.analysis.length}</span></button></nav>
      <div class="side-bottom"><button class="side-btn" data-action="exportSelected">⤴ 选择性导出 Markdown</button><div class="creative-hint">创作记录保存在当前浏览器，建议定期备份。</div><button class="side-btn" data-action="backup">⤓ 备份创作数据</button><button class="side-btn" data-action="restore">⤒ 导入创作备份</button><input id="creativeRestore" type="file" accept=".json,application/json" hidden></div></aside>`;
  }
  function records() {
    const q=search.trim().toLowerCase();
    const items=list().filter(x=>{
      const structure=db.long.find(a=>a.id===x.structureId);
      const values=[...Object.values(x),structure?.title||'',structure?.steps||''].join(' ').toLowerCase();
      return (!q||values.includes(q)) && (filter==='all'||(mode==='short'?practice(x):mode==='analysis'?(x.status||'待用'):'all')===filter);
    }).sort((a,b)=>String(b.updated||b.created).localeCompare(String(a.updated||a.created)));
    return `<section class="list-pane"><div class="creative-list-actions"><button class="btn primary big" data-action="new">＋ 新建${mode==='short'?'作品':mode==='analysis'?'分析':'结构'}</button>${mode==='short'?'<button class="btn" data-action="pasteCase">📋 粘贴案例</button>':''}</div>
      <div class="creative-search"><input id="creativeSearch" type="search" placeholder="搜索标题、内容、结构、状态…" value="${E(search)}"><select id="creativeFilter" aria-label="按状态筛选"><option value="all">全部状态</option>${mode==='short'?options(statuses,filter):mode==='analysis'?options(['待用','已用'],filter):''}</select></div>
      <div class="list-head">${mode==='short'?'创作作品':mode==='analysis'?'分析':'结构与方法'} · ${items.length} 条</div><div class="list">${items.length?items.slice(0,visibleLimit).map(x=>`<div class="card ${selected===x.id?'selected':''}" data-select="${E(x.id)}"><div class="card-top"><span class="chip ${mode==='short'?'短线':'长线'}">${E(x.code)}</span><span>${E(mode==='short'?practice(x):mode==='analysis'?(x.status||'待用'):'结构与方法')}</span>${mode==='short'&&x.column?`<span class="chip cw-column system-chip" data-system="${E(COLUMNS.includes(columnName(x.column)) ? columnName(x.column) : '未分类')}">${E(columnName(x.column))}</span>`:''}${mode==='short'&&x.desire?`<span class="chip cw-desire">${E(x.desire)}</span>`:''}<span class="date">${E((x.created||'').slice(0,10))}</span></div><div class="card-title">${E(x.title||x.url||'未命名记录')}</div>${mode==='short'&&x.structureId?`<div class="card-how">结构：${E(db.long.find(y=>y.id===x.structureId)?.title||'未找到')}</div>`:''}</div>`).join('')+(items.length>visibleLimit?`<button class="more" data-action="more">再显示 ${Math.min(100,items.length-visibleLimit)} 条</button>`:''):'<div class="empty-list">还没有符合条件的记录</div>'}</div></section>`;
  }
  // 旧字段只读转换为 Markdown，原始数据始终保留；首次保存新正文不会删除旧字段。
  function legacyBody(x,kind) {
    const out=[];
    for(const [section,fields] of groups[kind]) {
      const filled=fields.filter(([k])=>!['title','status','verification','outperformance',...NEW_KEYS].includes(k) && x[k]!==undefined && x[k]!==null && String(x[k]).trim()!=='');
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
      if(/^\s*>\s?/.test(l)){const b=[];while(i<lines.length && /^\s*>\s?/.test(lines[i]))b.push(inline(lines[i++].replace(/^\s*>\s?/,'')));html+='<blockquote>'+b.join('<br>')+'</blockquote>';continue;}
      if(/^\s*[-*_]{3,}\s*$/.test(l)){html+='<hr>';i++;continue;}
      let buf=[inline(l)];i++;while(i<lines.length&&lines[i].trim()&&!/^(#{1,6}\s|```|\s*>|\s*[-*+] |\s*\d+[.)、] )/.test(lines[i]) && !(lines[i].includes('|')&&i+1<lines.length&&isSep(lines[i+1])))buf.push(inline(lines[i++]));html+='<p>'+buf.join('<br>')+'</p>';
    }
    return html;
  }
  function analysisDetail(){
    const body=draft.body||analysisTemplate, linked=db.short.find(x=>x.id===draft.shortId);
    const editor=`<div class="editor cw-edit"><div class="field"><label>标题</label><input data-field="title" aria-label="标题" value="${E(draft.title||'')}"></div><div class="field"><label>链接（可选）</label><input data-field="url" aria-label="链接" value="${E(draft.url||'')}"></div><div class="field"><label>好在哪</label><textarea class="cw-markdown-input" data-field="body" aria-label="好在哪">${E(body)}</textarea></div><div class="field"><label>升级点（必填，一句话）</label><input data-field="upgrade" aria-label="升级点" value="${E(draft.upgrade||'')}"></div><div class="field"><label>状态</label><select data-field="status" aria-label="状态">${options(['待用','已用'],draft.status||'待用')}</select></div><div class="field"><label>用在了（可选）</label><select data-field="shortId" aria-label="用在了"><option value="">暂不关联</option>${db.short.map(x=>`<option value="${E(x.id)}" ${x.id===draft.shortId?'selected':''}>${E(x.code+'｜'+(x.title||'未命名'))}</option>`).join('')}</select><p class="creative-hint">关联作品并保存后，状态自动变为已用。</p></div></div><div class="creative-sticky"><button class="btn primary big" data-action="save">保存</button><button class="btn" data-action="cancelEdit">取消</button></div>`;
    const view=`<div class="detail-toolbar"><button class="btn primary" data-action="edit">编辑</button><button class="btn" data-action="copy">复制 Markdown</button><span class="spacer"></span><button class="btn danger" data-action="delete">删除</button></div><div class="creative-heading"><span class="chip 长线">${E(draft.code)}</span><span class="chip ghost">${E(draft.status||'待用')}</span></div><h1 class="conclusion cw-title">${E(draft.title||'未命名')}</h1>${draft.url?`<div class="creative-hint cw-meta">链接：${/^https?:\/\//i.test(draft.url)?`<a href="${E(draft.url)}" target="_blank" rel="noopener noreferrer">${E(draft.url)}</a>`:E(draft.url)}</div>`:''}<p><strong>升级点：</strong>${E(draft.upgrade||'')}</p>${linked?`<p>用在了：${E(linked.code+'｜'+linked.title)}</p>`:''}<article class="creative-prose">${markdown(body)}</article>`;
    return `<main class="detail-pane"><div class="detail cw-detail">${editing?editor:view}</div></main>`;
  }
  function detail() {
    if(draft && mode==='analysis')return analysisDetail();
    if(!draft) return `<main class="detail-pane"><div class="creative-empty"><h2>把想法带到真实创作中</h2><p>选择一条记录阅读，或新建一条。</p><button class="btn primary big" data-action="new">＋ 新建${mode==='short'?'作品':mode==='analysis'?'分析':'结构'}</button></div></main>`;
    const body=bodyOf(draft,mode), related=mode==='short'?db.long.find(x=>x.id===draft.structureId):null;
    const refs=mode==='long'?`<details class="creative-section"><summary>关联的作品（${db.short.filter(x=>x.structureId===draft.id).length}）</summary><div class="creative-links">${db.short.filter(x=>x.structureId===draft.id).map(x=>`<button class="btn" data-goto-short="${E(x.id)}">${E(x.code+'｜'+(x.title||'未命名'))}</button>`).join('')||'<span class="creative-hint">暂无关联作品。</span>'}</div></details>`:'';
    const analysisEditor=mode==='short'?`<div class="field"><label>关联分析（可选）</label><select data-field="analysisId" aria-label="关联分析"><option value="">暂不关联</option>${db.analysis.map(a=>`<option value="${E(a.id)}" ${a.id===draft.analysisId?'selected':''}>${E((a.code||'')+'｜'+a.title+' · '+(a.status||'待用'))}</option>`).join('')}</select><p class="creative-hint">保存后分析自动标为已用。</p></div>`:'';
    const linkEditor=mode==='short'?`<div class="field"><label>关联结构（可选）</label><select data-field="structureId" aria-label="关联结构"><option value="">暂不关联</option>${db.long.map(x=>`<option value="${E(x.id)}" ${x.id===draft.structureId?'selected':''}>${E(x.code+'｜'+x.title)}</option>`).join('')}</select></div><button type="button" class="btn" data-action="newLinked">＋ 新建结构并关联</button>`:'';
    const hasLegacy = groups[mode].some(([, fields]) => fields.some(([k]) => !['title','url',...NEW_KEYS].includes(k) && draft[k] !== undefined && draft[k] !== null && String(draft[k]).trim() !== ''));
    const legacy=typeof draft.body==='string' && hasLegacy && legacyBody(draft,mode) ? `<details class="creative-section"><summary>查看 V1 原有字段（已保留）</summary><div class="creative-prose">${markdown(legacyBody(draft,mode))}</div></details>` : '';
    const editHtml=`<div class="editor cw-edit"><div class="field"><label>标题</label><input data-field="title" aria-label="标题" value="${E(draft.title||'')}"></div>${mode==='short'?`<div class="field"><label>参考视频链接（可选）</label><input type="url" data-field="url" aria-label="参考视频链接" value="${E(draft.url||'')}"></div><div class="field"><label>状态</label><select data-field="practiceStatus" aria-label="状态">${options(statuses,practice(draft))}</select></div><div class="field"><label>栏目</label><select data-field="column" aria-label="栏目"><option value="">未选择</option>${options(COLUMNS.concat(draft.column && !COLUMNS.includes(columnName(draft.column)) ? [draft.column] : []),columnName(draft.column))}</select></div><details class="cw-optional" ${draft.desire||METRICS.some(([k])=>String(draft[k]??'').trim()!=='')?'open':''}><summary>可选：欲望标签与发布数据</summary><div class="field"><label>欲望标签（选一个）</label><select data-field="desire" aria-label="欲望标签"><option value="">未选择</option>${options(DESIRES,draft.desire||'')}</select></div><div class="field"><label>发布数据（发布后填）</label><div class="cw-metrics-input">${METRICS.map(([k,l])=>`<label class="cw-metric"><span>${l}</span><input type="number" min="0" step="1" inputmode="numeric" data-field="${k}" aria-label="${l}" value="${E(draft[k]??'')}"></label>`).join('')}</div></div></details>${linkEditor}${analysisEditor}`:''}<div class="field"><label class="cw-body-label"><span>Markdown 正文</span>${mode==='short'?`<span class="cw-tpl">换模板：${Object.entries(templates).map(([k,[n]])=>`<button type="button" class="btn" data-action="tpl" data-tpl="${k}">${n}</button>`).join('')}</span>`:''}</label><textarea class="cw-markdown-input" data-field="body" aria-label="Markdown 正文">${E(body)}</textarea></div></div><div class="creative-sticky"><button class="btn primary big" data-action="save">保存</button><button class="btn" data-action="cancelEdit">取消</button><span class="creative-hint">${dirty?'有未保存修改':'编辑中'}</span></div>`;
    const viewHtml=`<div class="detail-toolbar"><button class="btn primary" data-action="edit">编辑</button><button class="btn" data-action="copy">复制 Markdown</button><span class="spacer"></span><button class="btn danger" data-action="delete">删除</button></div><div class="creative-heading"><span class="chip ${mode==='short'?'短线':'长线'}">${E(draft.code)}</span>${mode==='short'?`<span class="chip ghost">${E(practice(draft))}</span>${draft.column?`<span class="chip cw-column system-chip" data-system="${E(COLUMNS.includes(columnName(draft.column)) ? columnName(draft.column) : '未分类')}">${E(columnName(draft.column))}</span>`:''}${draft.desire?`<span class="chip cw-desire">${E(draft.desire)}</span>`:''}`:''}</div><h1 class="conclusion cw-title">${E(draft.title||'未命名记录')}</h1><div class="creative-hint cw-meta">创建：${E(localTime(draft.created))} · 修改：${E(localTime(draft.updated||draft.created))}</div>${mode==='short'&&metricsLine(draft)?`<div class="cw-metrics">${metricsLine(draft)}</div>`:''}${draft.url?`<div class="creative-hint cw-meta">参考链接：${/^https?:\/\//i.test(draft.url)?`<a href="${E(draft.url)}" target="_blank" rel="noopener noreferrer">${E(draft.url)}</a>`:E(draft.url)}</div>`:''}${related?`<div class="creative-hint cw-meta">关联结构：${E(related.code+'｜'+related.title)}</div>`:''}<article class="creative-prose">${markdown(body)}</article>${legacy}${refs}`;
    return `<main class="detail-pane"><div class="detail cw-detail">${editing?`<div class="creative-heading"><span class="chip ${mode==='short'?'短线':'长线'}">${E(draft.code)}</span><span class="creative-hint">${selected?'编辑记录':'新记录'}</span></div>${editHtml}`:viewHtml}</div></main>`;
  }
  function render() { root.innerHTML=sidebar()+records()+detail(); }
  function refreshList() { const pane=$c('.list-pane'), list=pane.querySelector('.list'), scroll=list.scrollTop; const temp=document.createElement('div'); temp.innerHTML=records(); pane.querySelector('.list-head').replaceWith(temp.querySelector('.list-head')); list.replaceWith(temp.querySelector('.list')); pane.querySelector('.list').scrollTop=scroll; }
  // 只识别正文开头的明确字段；未识别的内容全部保留在正文。
  function parseCase(text) {
    const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
    let title='',url='',status='待实践',desireText='',column='',i=0;const prefix=[];
    while(i<lines.length) {
      const line=lines[i], clean=line.trim(); let m;
      if(!clean){ if(prefix.length)prefix.push('');i++;continue; }
      if((m=clean.match(/^正文\s*[：:]\s*(.*)$/))){ if(m[1])prefix.push(m[1]);i++;break; }
      if(/^#{2,6}\s/.test(clean))break;
      if(!title && (m=clean.match(/^#\s+(.+?)\s*$/))){ title=m[1].trim();i++;continue; }
      const plain=clean.replace(/^[-*+]\s+/, '').replace(/^\*\*([^*]+?)\*\*\s*([：:]?)/,'$1$2').replace(/^\*\*([^*]+[：:])\*\*/, '$1');
      if(!title && (m=plain.match(/^(?:标题|案例标题)\s*[：:]\s*(.+)$/))){title=m[1].trim();i++;continue;}
      if((m=plain.match(/^(?:参考视频链接|视频链接|参考链接)\s*[：:]\s*(.*)$/))){
        const candidate=m[1].trim();
        if(!candidate){i++;continue;}
        if(/^https?:\/\/\S+$/i.test(candidate)){url=candidate;i++;continue;}
        prefix.push(line);i++;continue;
      }
      if((m=plain.match(/^状态\s*[：:]\s*(待实践|已实践)\s*$/))){status=m[1];i++;continue;}
      if((m=plain.match(/^欲望标签\s*[：:]\s*(.*)$/))){desireText=m[1];i++;continue;}
      if((m=plain.match(/^栏目\s*[：:]\s*(.*)$/))){const c=columnName(m[1].trim());if(COLUMNS.includes(c))column=c;else prefix.push(line);i++;continue;}
      if((m=plain.match(/^状态\s*[：:]\s*$/))){i++;continue;}
      // 来源说明、时长等不是独立字段：原样并入正文。
      prefix.push(line);i++;
    }
    const body=[...prefix,...lines.slice(i)].join('\n').trim();
    if(!desireText){const bm=body.match(/欲望标签[^\n：:]*[：:][*\s]*([^\n]+)/);if(bm)desireText=bm[1];}
    return {title,url,practiceStatus:status,column,desire:pickDesire(desireText),body};
  }
  // 从「怕 + 被说中」这类文字里取第一个出现的欲望；模板占位（全部列出）不算
  function pickDesire(text) {
    const s=String(text||'');
    const hits=DESIRES.map(d=>[d,d==='爽好奇'?s.search(/爽/):s.indexOf(d)]).filter(([,n])=>n>=0).sort((a,b)=>a[1]-b[1]);
    return hits.length===1||(hits.length>1&&hits.length<DESIRES.length)?hits[0][0]:'';
  }
  function openCasePaste(){
    const m=openModal(`<h3>粘贴案例</h3><div class="sub">把下面的格式发给 AI，或直接粘贴符合此结构的案例。将生成一条新作品，检查后点击保存。</div>
      <details open><summary>案例格式（可复制给 AI）</summary><pre class="pre-md" id="caseFormat">${E(importFormat)}</pre><div class="row"><button class="btn" id="caseCopyFormat">复制格式</button></div></details>
      <div class="row"><button class="btn" id="casePasteClipboard">粘贴并识别</button><span class="creative-hint">也可以在下面按 ⌘V / Ctrl+V</span></div>
      <textarea class="capture" id="casePasteText" aria-label="粘贴完整案例" placeholder="把 AI 整理好的完整案例粘贴在这里" style="margin-top:10px"></textarea>
      <div id="casePasteError"></div><div class="actions"><button class="btn" id="casePasteCancel">取消</button><button class="btn primary" id="casePasteApply">识别并填写</button></div>`,{wide:true});
    const input=m.querySelector('#casePasteText'),error=m.querySelector('#casePasteError');
    m.querySelector('#casePasteCancel').addEventListener('click',closeModal);
    m.querySelector('#caseCopyFormat').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(importFormat);notice('已复制案例格式，可发给 AI');}catch(_){notice('请手动选中上方格式并复制',true);}});
    function applyCase(){
      const value=input.value;if(!value.trim()){notice('请先粘贴案例内容',true);return;}
      const parsed=parseCase(value);
      if(!parsed.title || !parsed.body){error.textContent='请填写标题和正文；粘贴内容仍保留在输入框中。';return;}
      if(!askLeave())return;
      const next=newDraft('short');Object.assign(next,parsed);draft=next;mode='short';selected=null;editing=true;dirty=true;returnDraft=null;search='';filter='all';visibleLimit=100;closeModal();render();notice('已识别，请检查后保存');
    }
    m.querySelector('#casePasteClipboard').addEventListener('click',async()=>{try{const t=await navigator.clipboard.readText();if(!m.isConnected)return;if(!t){notice('剪贴板没有文字，请手动粘贴',true);return;}input.value=t;error.innerHTML='';applyCase();}catch(_){input.focus();notice('请在输入框按 ⌘V / Ctrl+V 粘贴',true);}});
    m.querySelector('#casePasteApply').addEventListener('click',applyCase);
  }
  async function copyBody(){
    const value=mode==='analysis' ? `# ${draft.title||''}\n\n升级点：${draft.upgrade||''}\n状态：${draft.status||'待用'}\n\n${draft.body||''}` : bodyOf(draft,mode);
    try{await navigator.clipboard.writeText(value);notice('已复制 Markdown');}
    catch(_){openModal(`<h3>复制 Markdown</h3><div class="sub">浏览器未允许自动复制，请手动全选复制。</div><textarea class="capture" readonly>${E(value)}</textarea><div class="actions"><button class="btn" id="cwCopyClose">关闭</button></div>`);document.getElementById('cwCopyClose').addEventListener('click',closeModal);}
  }
  // 选择的是已保存记录；筛选只影响列表，不会取消其他已选项。
  function openSelectedExport(){
    const chosen=new Set();
    const saved=[...db.short.map(x=>({kind:'short',item:x})),...db.long.map(x=>({kind:'long',item:x})),...db.analysis.map(x=>({kind:'analysis',item:x}))];
    const idOf=x=>x.kind+':'+x.item.id;
    const dateOf=value=>{const d=new Date(value);if(!value||Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
    const m=openModal(`<h3>选择性导出</h3><div class="sub">选出要交给 AI 的创作记录。导出为 Markdown 文本；只包含已保存内容，不会修改原记录。${dirty?'当前编辑尚未保存，不会包含在导出中。':''}</div>
      <div class="cw-export-filters"><label>类型<select id="ceKind"><option value="all">全部类型</option><option value="short">创作作品</option><option value="long">结构与方法</option><option value="analysis">分析</option></select></label><label>搜索<input id="ceSearch" type="search" placeholder="标题、内容、编号…"></label><label>创建日期从<input id="ceStart" type="date"></label><label>到<input id="ceEnd" type="date"></label></div>
      <div class="row"><button class="btn" id="ceAll">全选当前筛选</button><button class="btn" id="ceClear">清空选择</button><span class="creative-hint" id="ceCount"></span></div>
      <div class="cw-export-list" id="ceList"></div><div class="sub-title" style="margin-top:14px">导出内容预览</div><textarea id="cePreview" aria-label="导出内容预览" readonly style="min-height:150px" placeholder="请先勾选要导出的记录"></textarea>
      <div class="actions"><button class="btn" id="ceClose">关闭</button><button class="btn" id="ceDownload" disabled>下载 Markdown</button><button class="btn primary" id="ceCopy" disabled>复制给 AI</button></div>`,{wide:true});
    const q=id=>m.querySelector(id), listEl=q('#ceList'),preview=q('#cePreview');
    function filteredExport(){
      const kind=q('#ceKind').value,query=q('#ceSearch').value.trim().toLowerCase(),start=q('#ceStart').value,end=q('#ceEnd').value;
      return saved.filter(({kind:k,item:x})=>{const date=dateOf(x.created),hay=[x.code,x.title,x.url,k==='analysis'?`${x.body||''} ${x.upgrade||''} ${x.status||''}`:bodyOf(x,k),k==='short'?'短线':k==='analysis'?'分析':'长线',k==='short'?practice(x):''].join('\n').toLowerCase();return (kind==='all'||kind===k)&&(!query||hay.includes(query))&&(!start||(date&&date>=start))&&(!end||(date&&date<=end));});
    }
    function output(){
      const records=saved.filter(x=>chosen.has(idOf(x)));
      return records.map(({kind,item:x})=>{
        const rel=kind==='short'?db.long.find(y=>y.id===x.structureId):null;
        if(kind==='analysis'){const linked=db.short.find(y=>y.id===x.shortId);return [`# ${x.code||''}｜${(x.title||'未命名').replace(/[\r\n]+/g,' ')}`,`类型：分析\n状态：${x.status||'待用'}\n升级点：${x.upgrade||''}${x.url?'\n链接：'+x.url:''}${linked?'\n用在了：'+linked.code+'｜'+linked.title:''}`,x.body||''].join('\n\n');}
        const heading=`# ${x.code||''}｜${(x.title||'未命名').replace(/[\r\n]+/g,' ')}`;
        const meta=[`类型：${kind==='short'?'创作作品':'结构与方法'}`,kind==='short'?`状态：${practice(x)}`:'',kind==='short'&&x.column?`栏目：${columnName(x.column)}`:'',kind==='short'&&x.desire?`欲望标签：${x.desire}`:'',kind==='short'&&METRICS.some(([k])=>String(x[k]??'').trim()!=='')?'发布数据：'+METRICS.filter(([k])=>String(x[k]??'').trim()!=='').map(([k,l])=>`${l} ${x[k]}`).join('，'):'',x.url?`参考链接：${x.url}`:'',rel?`关联结构：${rel.code}｜${rel.title}`:'',x.created?`创建日期：${dateOf(x.created)}`:''].filter(Boolean).join('\n');
        const legacy=typeof x.body==='string' && groups[kind].some(([,fields])=>fields.some(([k])=>!['title','url',...NEW_KEYS].includes(k)&&x[k]!==undefined&&x[k]!==null&&String(x[k]).trim()!=='')) ? legacyBody(x,kind) : '';
        return [heading,meta,bodyOf(x,kind),legacy?'## V1 原有字段（保留）\n\n'+legacy:''].filter(Boolean).join('\n\n');
      }).join('\n\n---\n\n');
    }
    function updatePreview(){q('#ceCount').textContent=`已选择 ${chosen.size} 条`;preview.value=output();q('#ceCopy').disabled=!chosen.size;q('#ceDownload').disabled=!chosen.size;}
    function draw(){const items=filteredExport();listEl.innerHTML=items.length?items.map(({kind,item:x})=>`<label class="cw-export-row"><input type="checkbox" data-export-kind="${kind}" data-export-id="${E(x.id)}" ${chosen.has(kind+':'+x.id)?'checked':''}><span><b>${E(x.code||'')}｜${E(x.title||'未命名')}</b><small>${kind==='short'?'作品 · '+E(practice(x)):kind==='analysis'?'分析 · '+E(x.status||'待用'):'结构与方法'}${x.created?' · '+E(dateOf(x.created)):''}</small></span></label>`).join(''):'<div class="empty-list">没有符合筛选条件的记录</div>';updatePreview();}
    listEl.addEventListener('change',e=>{const t=e.target;if(t.dataset.exportId){const id=t.dataset.exportKind+':'+t.dataset.exportId;if(t.checked)chosen.add(id);else chosen.delete(id);updatePreview();}});
    for(const id of ['#ceKind','#ceSearch','#ceStart','#ceEnd'])q(id).addEventListener(id==='#ceSearch'?'input':'change',draw);
    q('#ceAll').addEventListener('click',()=>{filteredExport().forEach(x=>chosen.add(idOf(x)));draw();});
    q('#ceClear').addEventListener('click',()=>{chosen.clear();draw();});
    q('#ceClose').addEventListener('click',closeModal);
    q('#ceCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(preview.value);notice('已复制所选内容，可粘贴给 AI');}catch(_){preview.focus();preview.select();notice('请按 ⌘C / Ctrl+C 手动复制已选中的内容',true);}});
    q('#ceDownload').addEventListener('click',()=>{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([preview.value],{type:'text/markdown;charset=utf-8'}));a.href=url;a.download='创作工作台-所选记录.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已开始下载 Markdown');});
    draw();
  }
  function download() {const blob=new Blob([JSON.stringify({app:'creation-workbench',exportedAt:new Date().toISOString(),data:db},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='创作工作台备份-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notice('已开始下载创作备份');}
  function restore(obj) {
    if(obj?.app!=='creation-workbench'||!obj.data||obj.data.version!==1||!Array.isArray(obj.data.short)||!Array.isArray(obj.data.long)||(obj.data.analysis!==undefined&&!Array.isArray(obj.data.analysis)))throw Error('请选择创作工作台的备份文件');
    const next=clone(db);let added=0;
    for(const kind of ['long','short','analysis']) for(const item of (obj.data[kind]||[])) {
      if(!item || typeof item.id!=='string' || typeof item.code!=='string') throw Error('备份中存在无效记录');
      if(['short','long','analysis'].some(k=>next[k].some(x=>x.id===item.id)))continue;
      const copy=clone(item), key=kind==='short'?'nextC':kind==='long'?'nextS':'nextA', prefix=kind==='short'?'C':kind==='long'?'S':'A';
      if(!new RegExp('^'+prefix+'[0-9]+$').test(copy.code) || next[kind].some(x=>x.code===copy.code)) {copy.code=code(prefix,next[key]||1);while(next[kind].some(x=>x.code===copy.code))copy.code=code(prefix,++next[key]);}
      next[key]=Math.max(next[key]||1,Number(copy.code.slice(1))+1);next[kind].push(copy);added++;
    }
    if(!commit(next))return; render();notice(`恢复完成：新增 ${added} 条，已有记录未覆盖`);
  }
  document.getElementById('openCreative').addEventListener('click',()=>{ if(S.editing){saveDraft();} try {db=read();} catch(e) {toast('创作数据读取失败，请勿清除浏览器数据：'+e.message,true);return;} old.hidden=true;root.hidden=false;render();});
  root.addEventListener('input',e=>{if(e.target.dataset.field&&draft){draft[e.target.dataset.field]=e.target.value;dirty=true;const hint=$c('.creative-sticky .creative-hint');if(hint)hint.textContent='有未保存修改';} if(e.target.id==='creativeSearch'){search=e.target.value;visibleLimit=100;refreshList();}});
  // 选栏目时：正文还没动过，就自动换成该栏目的模板；同时刷新「对照战略」提示
  root.addEventListener('change',e=>{
    if(e.target.dataset.field!=='column'||!draft||!editing||mode!=='short')return;
    draft.column=e.target.value;dirty=true;
    const key=COLUMN_TEMPLATE[draft.column], cur=String(draft.body??'').trim();
    if(key && (!cur||Object.values(templates).some(([,t])=>t.trim()===cur))) draft.body=templates[key][1];
    render();
  });
  root.addEventListener('change',async e=>{if(e.target.id==='creativeFilter'){filter=e.target.value;visibleLimit=100;refreshList();} if(e.target.id==='creativeRestore' && e.target.files[0]){if(!askLeave())return;try{restore(JSON.parse(await e.target.files[0].text()));}catch(err){notice('导入失败：'+err.message,true);}}});
  root.addEventListener('click',e=>{
    const m=e.target.closest('[data-mode]');if(m){switchMode(m.dataset.mode);return;}
    const r=e.target.closest('[data-select]');if(r){if(!askLeave())return;selected=r.dataset.select;draft=clone(list().find(x=>x.id===selected));editing=false;dirty=false;returnDraft=null;render();return;}
    const go=e.target.closest('[data-goto-short]');if(go){if(!askLeave())return;mode='short';selected=go.dataset.gotoShort;draft=clone(db.short.find(x=>x.id===selected));editing=false;dirty=false;search='';filter='all';render();return;}
    const a=e.target.closest('[data-action]');if(!a)return;
    switch(a.dataset.action){case 'more':visibleLimit+=100;refreshList();break;case 'experience':if(!askLeave())return;root.hidden=true;old.hidden=false;break;case 'articles':window.articleLibrary.open('creative');break;case 'new':beginNew();break;case 'pasteCase':openCasePaste();break;case 'edit':editing=true;dirty=false;render();break;case 'cancelEdit':if(!askLeave())return;if(returnDraft){mode='short';draft=returnDraft;returnDraft=null;selected=db.short.some(x=>x.id===draft.id)?draft.id:null;editing=true;dirty=true;render();return;}if(selected){draft=clone(list().find(x=>x.id===selected));editing=false;dirty=false;}else{draft=null;editing=false;dirty=false;}render();break;case 'copy':copyBody();break;case 'save':save();break;case 'delete':remove();break;case 'newLinked':createLinked();break;case 'tpl':useTemplate(a.dataset.tpl);break;case 'exportSelected':openSelectedExport();break;case 'backup':download();break;case 'restore':$c('#creativeRestore').click();break;}
  });
  window.addEventListener('beforeunload',e=>{if((!root.hidden||!document.getElementById('articleApp').hidden)&&dirty){e.preventDefault();e.returnValue='';}});
})();
