/* ============ 训练 Tab ============ */
function renderTrain(c){
  if(!PERMS[currentRole].train){
    c.innerHTML='<div class="empty">当前身份（'+ROLE_NAME[currentRole]+'）无训练操作权限，可在「报表」查看进度。</div>';return;
  }
  if(!children.length){c.innerHTML='<div class="empty">请先在「档案」中建立儿童档案</div>';return;}
  // 儿童选择
  let html='<div class="sec-title">'+svg("brain","#F7A14F",20)+'交互式训练</div>';
  html+='<div class="field"><label>选择儿童</label><select id="trainChild" style="height:50px;border:2px solid var(--line);border-radius:14px;padding:0 14px;width:100%;background:#fff">'+
    children.map(ch=>'<option value="'+ch.id+'"'+(ch.id===activeChild?" selected":"")+'>'+esc(ch.name)+'</option>').join("")+'</select></div>';
  html+='<div class="grid3">';
  const mods=[["attention","找目标","看提示图标，在格子里点出相同的"],["memory","翻牌配对","翻开两张相同图案的卡片"],["logic","找不同","找出和其他三张不一样的"]];
  mods.forEach(m=>{
    const plan=plans[activeChild];
    const diff=plan?plan.steps.find(s=>s.dim===m[0]).difficulty:2;
    html+='<button class="mod-btn '+m[0]+'" data-mod="'+m[0]+'"><span class="ic">'+svg(m[0],colorOf(m[0]),52)+'</span><b>'+m[1]+'</b><small>'+m[2]+'</small><span class="diff-tag" style="background:'+colorOf(m[0])+'">AI建议难度 '+diff+'</span></button>';
  });
  html+='</div><div class="note">'+svg("brain","#4F86F7",16)+' 训练中的每一次点击都会实时记录「正确/错误、反应时长、错误类型」，用于 AI 引擎分析并动态调整难度。</div>';
  c.innerHTML=html;
  $("#trainChild").onchange=e=>{activeChild=e.target.value;lsSet("activeChild",activeChild);renderTrain(c);};
  $$(".mod-btn",c).forEach(b=>b.onclick=()=>{
    const childId=$("#trainChild").value;const mod=b.dataset.mod;
    const plan=plans[childId];const diff=plan?plan.steps.find(s=>s.dim===mod).difficulty:2;
    openTrainer(childId,mod,diff,null);
  });
}
function colorOf(m){return {attention:"#4F86F7",memory:"#10B981",logic:"#8B5CF6"}[m];}

/* ============ 训练器（三大模块） ============ */
function openTrainer(childId,module,difficulty,onDone){
  const child=children.find(c=>c.id===childId);
  const sheet=$("#trainSheet");
  sheet.innerHTML='<h3>'+esc(child.name)+' · '+({attention:"注意力训练",memory:"记忆力训练",logic:"逻辑力训练"}[module])+'<button class="x" id="closeTrain">'+svg("cross","currentColor",18)+'</button></h3>'+
    '<div style="position:relative"><div id="trainBody"></div><div class="fb" id="trainFb"></div></div>';
  $("#trainMask").classList.remove("hidden");
  $("#closeTrain").onclick=()=>{$("#trainMask").classList.add("hidden");if(onDone)onDone();};
  const body=$("#trainBody");
  const done=recs=>{
    // 增强版同时保存“底层交互类型”和“专业模块 ID”，兼容旧报表并支持六域统计。
    recs.forEach(r=>{r.moduleId=window.__activeTrainingModuleId||module;r.domain=window.__activeTrainingDomain||module;r.firstCorrect=r.correct;r.promptLevel=r.correct?0:1;r.completed=true;});
    records=records.concat(recs);
    backendSaveTrainingRecords(recs);
    plans[childId]=genPlan(childId);
    saveAll();
    const ok=recs.filter(r=>r.correct).length, tot=recs.length;
    body.innerHTML='<div class="train-summary"><div class="big" style="color:'+(ok/tot>=0.6?"var(--green)":"var(--red)")+'">'+(ok/tot*100).toFixed(0)+'%</div>'+
      '<p>本轮 '+tot+' 次，正确 '+ok+' 次</p>'+
      '<button class="btn-primary" id="finishTrain" style="margin-top:14px">完成并保存</button>'+
      '<button class="btn-ghost" id="againTrain">再来一轮</button></div>';
    $("#finishTrain").onclick=()=>{$("#trainMask").classList.add("hidden");toast("已记录并更新 AI 方案");if(curTab==="ai"||curTab==="report")showTab(curTab);else if(onDone)onDone();else{renderToday();}};
    $("#againTrain").onclick=()=>openTrainer(childId,module,difficulty,onDone);
  };
  if(module==="attention")playAttention(body,difficulty,childId,done);
  else if(module==="memory")playMemory(body,difficulty,childId,done);
  else playLogic(body,difficulty,childId,done);
}
function feedback(ok,cb){
  beep(ok);                          // 语音反馈（受设置开关控制）
  const fb=$("#trainFb");
  if(!fb){cb();return;}
  fb.innerHTML=ok?svg("check",null,120):svg("cross",null,120);
  fb.className="fb "+(ok?"ok":"no");
  setTimeout(()=>{fb.className="fb";cb();},650);
}
/* 训练中实时自适应难度：连续 2 次正确→升一档，连续 2 次错误→降一档（区间 1-5） */
function makeAdaptive(start){
  let d=start,cS=0,wS=0;
  return {
    get diff(){return d;},
    update(correct){
      if(correct){cS++;wS=0;if(cS>=2){d=Math.min(5,d+1);cS=0;}}
      else{wS++;cS=0;if(wS>=2){d=Math.max(1,d-1);wS=0;}}
    }
  };
}
function playAttention(body,difficulty,childId,done){
  const rounds=5;let ri=0;const out=[];const ad=makeAdaptive(difficulty);
  function round(){
    if(ri>=rounds){done(out);return;}
    const n=ad.diff<=1?4:9;                 // 网格大小随实时难度变化
    const target=ICON_SET[Math.floor(Math.random()*ICON_SET.length)];
    let pool=ICON_SET.filter(i=>i!==target);shuffle(pool);
    let cells=[target].concat(pool.slice(0,n-1));shuffle(cells);
    const t0=performance.now();
    body.innerHTML='<div class="train-prompt">请点出和目标一样的图案</div>'+
      '<div class="train-target">'+svg(target,ICON_COLOR[target],64)+'</div>'+
      '<div class="train-grid g'+n+'">'+cells.map((ic,idx)=>'<button class="train-cell" data-i="'+idx+'">'+svg(ic,ICON_COLOR[ic],46)+'</button>').join("")+'</div>'+
      '<div class="train-progress">第 '+(ri+1)+' / '+rounds+' 轮 · 自适应难度 '+ad.diff+'</div>';
    $$(".train-cell",body).forEach(b=>b.onclick=()=>{
      const picked=cells[+b.dataset.i];
      const rt=Math.round(performance.now()-t0);
      const correct=picked===target;
      const dNow=ad.diff;                   // 记录本轮实际难度
      out.push({id:uid(),childId,module:"attention",difficulty:dNow,correct,reactionMs:rt,errorType:correct?"":"wrong_target",ts:Date.now()});
      ad.update(correct);ri++;feedback(correct,()=>round());
    });
  }
  round();
}
function playMemory(body,difficulty,childId,done){
  const pairCount={1:3,2:4,3:6,4:8,5:10}[difficulty]||4;
  const used=ICON_SET.slice(0,pairCount);
  let deck=[];used.forEach(ic=>{deck.push(ic);deck.push(ic);});shuffle(deck);
  const matched=new Set();let flipped=[];let lock=false;const out=[];
  const cols=pairCount<=4?3:(pairCount<=6?4:5);
  function render(){
    body.innerHTML='<div class="train-prompt">翻开两张相同的卡片配对</div>'+
      '<div class="mem-grid" style="grid-template-columns:repeat('+cols+',1fr)">'+deck.map((ic,idx)=>{
        const f=flipped.includes(idx),m=matched.has(idx);
        const inner=(f||m)?svg(ic,ICON_COLOR[ic],42):'<svg viewBox="0 0 24 24" width="42" height="42"><rect x="3" y="3" width="18" height="18" rx="4" fill="#CBD5E1"/></svg>';
        return '<button class="mem-cell'+(m?" matched":"")+'" data-i="'+idx+'"'+(m?" disabled":"")+'>'+inner+'</button>';
      }).join("")+'</div>'+
      '<div class="train-progress">已配对 '+(matched.size/2)+' / '+pairCount+'</div>';
    $$(".mem-cell",body).forEach(b=>b.onclick=()=>{
      if(lock)return;const i=+b.dataset.i;
      if(flipped.includes(i)||matched.has(i))return;
      flipped.push(i);
      if(flipped.length===2){
        lock=true;const [a,b2]=flipped;const correct=deck[a]===deck[b2];
        out.push({id:uid(),childId,module:"memory",difficulty,correct,reactionMs:0,errorType:correct?"":"mismatch",ts:Date.now()});
        render();
        setTimeout(()=>{
          if(correct){matched.add(a);matched.add(b2);}
          flipped=[];lock=false;
          if(matched.size===deck.length)done(out);else render();
        },correct?450:750);
      }else render();
    });
  }
  render();
}
function playLogic(body,difficulty,childId,done){
  const rounds=5;let ri=0;const out=[];const ad=makeAdaptive(difficulty);
  const shapes=["circle","square","triangle","star"];
  const colors=["#EF4444","#F59E0B","#10B981","#4F86F7"];
  function round(){
    if(ri>=rounds){done(out);return;}
    const d=ad.diff;
    const common=shapes[Math.floor(Math.random()*shapes.length)];
    let odd=shapes[(shapes.indexOf(common)+1)%shapes.length];
    const col=colors[Math.floor(Math.random()*colors.length)];
    // 难度：diff>=3 时让“相同项”颜色也一致，odd 仅靠形状区分；更高难用近似色
    let cells=[{s:common,c:col},{s:common,c:col},{s:common,c:col},{s:odd,c:col}];
    if(d>=4){cells[0].c=shade(col);} // 轻微干扰
    shuffle(cells);
    const oddIdx=cells.findIndex(x=>x.s===odd);
    const t0=performance.now();
    body.innerHTML='<div class="train-prompt">哪一张不一样？点它</div>'+
      '<div class="logic-grid">'+cells.map((c,idx)=>'<button class="logic-cell" data-i="'+idx+'">'+svgShape(c.s,c.c,50)+'</button>').join("")+'</div>'+
      '<div class="train-progress">第 '+(ri+1)+' / '+rounds+' 轮 · 自适应难度 '+d+'</div>';
    $$(".logic-cell",body).forEach(b=>b.onclick=()=>{
      const picked=+b.dataset.i;const rt=Math.round(performance.now()-t0);
      const correct=picked===oddIdx;
      const dNow=ad.diff;
      out.push({id:uid(),childId,module:"logic",difficulty:dNow,correct,reactionMs:rt,errorType:correct?"":"category_error",ts:Date.now()});
      ad.update(correct);ri++;feedback(correct,()=>round());
    });
  }
  round();
}
function shade(hex){const m={"#EF4444":"#F87171","#F59E0B":"#FBBF24","#10B981":"#34D399","#4F86F7":"#93B4FB"};return m[hex]||hex;}
