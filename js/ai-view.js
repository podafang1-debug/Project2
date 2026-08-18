/* ============ AI 方案 Tab ============ */
function renderAI(c){
  if(!children.length){c.innerHTML='<div class="empty">请先在「档案」中建立儿童档案</div>';return;}
  const p=PERMS[currentRole];
  let html='<div class="sec-title">'+svg("gear","#8B5CF6",20)+'AI 个性化训练方案</div>';
  html+='<div class="field"><label>选择儿童</label><select id="aiChild" style="height:50px;border:2px solid var(--line);border-radius:14px;padding:0 14px;width:100%;background:#fff">'+
    children.map(ch=>'<option value="'+ch.id+'"'+(ch.id===activeChild?" selected":"")+'>'+esc(ch.name)+'</option>').join("")+'</select></div>';
  const childId=activeChild;const plan=plans[childId];const child=children.find(x=>x.id===childId);
  html+='<div class="ai-badge">'+svg("brain","#4F86F7",14)+' 本地启发式引擎 · 生成于 '+fmtDate(plan.generatedAt)+'</div>';
  html+='<div class="ai-plan">';
  plan.steps.forEach((s,i)=>{
    const modName={attention:"注意力",memory:"记忆力",logic:"逻辑力"}[s.dim];
    html+='<div class="step"><div class="num">'+(i+1)+'</div><div><b>'+modName+'训练 · 难度 '+s.difficulty+'</b><small>'+esc(s.reason)+'</small></div></div>';
  });
  html+='</div>';
  const a=analyze(childId);
  html+='<div class="card"><b>近况表现分析</b>'+
    ['attention','memory','logic'].map(d=>{const r=a[d];const tag=r.count?({up:'<b style="color:var(--green)">趋势↑</b>',down:'<b style="color:var(--red)">趋势↓</b>',stable:'平稳'}[r.trend]):'';
      return '<div style="margin-top:8px;font-size:14px">'+({attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d])+'：近10次正确率 <b>'+(r.count?((r.accuracy*100).toFixed(0)+'%'):'暂无')+'</b> · 当前难度 '+r.difficulty+(r.count?' · 样本 '+r.count:'')+(r.count?' · '+tag:'')+'</div>';}).join("")+'</div>';
  html+='<div class="note">'+svg("shield","#8B5CF6",16)+' 说明：原型中的“AI引擎”为本地规则化分析（依据正确率与错误模式动态调整难度梯度），非联网大模型。部署到公网后数据仍仅存于本机浏览器，不会上传。</div>';
  if(p.manage){
    html+='<button class="btn-ghost" id="regen" style="margin-top:12px">立即重新生成方案</button>';
  }
  c.innerHTML=html;
  $("#aiChild").onchange=e=>{activeChild=e.target.value;lsSet("activeChild",activeChild);renderAI(c);};
  if(p.manage)$("#regen").onclick=()=>{plans[childId]=genPlan(childId);saveAll();renderAI(c);toast("已重新生成");};
}
