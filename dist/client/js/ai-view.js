/* ============ AI 方案 Tab ============ */
function renderAI(c){
  if(!children.length){c.innerHTML='<div class="empty">请先在「档案」中建立儿童档案</div>';return;}
  const canReview=dbCan(DB_ACTIONS.AI_REVIEW);
  let html='<div class="sec-title">'+svg("gear","#8B5CF6",20)+'AI 个性化训练方案</div>';
  html+='<div class="field"><label>选择儿童</label><select id="aiChild" style="height:50px;border:2px solid var(--line);border-radius:14px;padding:0 14px;width:100%;background:#fff">'+
    children.map(ch=>'<option value="'+ch.id+'"'+(ch.id===activeChild?" selected":"")+'>'+esc(ch.name)+'</option>').join("")+'</select></div>';
  const childId=activeChild;let plan=plans[childId];const child=children.find(x=>x.id===childId);if(!plan?.moduleDifficulty){plan=plans[childId]=genPlan(childId);saveAll();}
  html+='<div class="ai-badge">'+svg("brain","#4F86F7",14)+' 本地启发式引擎 · 生成于 '+fmtDate(plan.generatedAt)+'</div>';
  html+='<div class="ai-plan">';
  Object.entries(ABILITY_DOMAINS).forEach(([domain,meta],i)=>{
    const modules=TRAINING_CATALOG.filter(x=>x.domain===domain),stat=plan.domainStats?.[domain],levels=modules.map(x=>plan.moduleDifficulty?.[x.id]||2);
    html+='<div class="step"><div class="num">'+(i+1)+'</div><div><b>'+esc(meta.name)+' · '+modules.length+' 个模块 · 难度 '+Math.min(...levels)+'–'+Math.max(...levels)+'</b><small>'+(stat?.attempts?'近期独立完成率 '+stat.independentRate+'%，样本 '+stat.attempts:'暂无正式训练记录，按六领域画像确定起点')+'</small></div></div>';
  });
  html+='</div>';
  html+='<div class="card"><b>六领域近况</b>'+Object.entries(ABILITY_DOMAINS).map(([domain,meta])=>{const r=plan.domainStats?.[domain];return '<div style="margin-top:8px;font-size:14px">'+esc(meta.name)+'：<b>'+(r?.attempts?r.independentRate+'% 独立完成':'暂无正式训练')+'</b>'+(r?.attempts?' · 样本 '+r.attempts:'')+'</div>';}).join('')+'</div>';
  html+='<div class="note">'+svg("shield","#8B5CF6",16)+' 说明：原型中的“AI引擎”为本地规则化分析（依据正确率与错误模式动态调整难度梯度），非联网大模型。静态体验数据默认保存在当前浏览器；启用机构服务时，会按监护授权范围传输并保存必要数据。</div>';
  if(canReview){
    html+='<button class="btn-ghost" id="regen" style="margin-top:12px">立即重新生成方案</button>';
  }
  c.innerHTML=html;
  $("#aiChild").onchange=e=>{activeChild=e.target.value;lsSet("activeChild",activeChild);renderAI(c);};
  if(canReview)$("#regen").onclick=()=>{plans[childId]=genPlan(childId);enhancedState.reviews.push({id:uid(),childId,planGeneratedAt:plans[childId].generatedAt,result:'pending',reviewer:currentRole,reason:'重新生成方案，等待复核',ts:Date.now()});saveAll();saveEnhanced();renderAI(c);toast("已重新生成，需重新审核后生效");};
}
