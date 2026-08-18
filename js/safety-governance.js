/* ============ 训练安全边界与方案生效治理 ============ */
const SAFETY_RISKS=[
  ['seizure','癫痫或疑似发作'],['selfHarm','自伤'],['aggression','攻击行为'],
  ['meltdown','严重情绪爆发'],['swallowing','吞咽风险'],['fall','跌倒风险']
];
enhancedState.riskFlags=enhancedState.riskFlags||lsGet('riskFlags',[]);

// 对现有内容做执行方式标注。纯网页任务保持线上；需要真人互动或肢体辅助的任务改为混合/线下。
const OFFLINE_MODULES={D03:'offline',D02:'hybrid',D01:'hybrid',S02:'hybrid',S03:'hybrid',L02:'hybrid'};
TRAINING_CATALOG.forEach(module=>{
  module.delivery=OFFLINE_MODULES[module.id]||'online';
  module.deliveryLabel={online:'线上结构化训练',hybrid:'线上引导＋线下互动',offline:'线下成人辅助'}[module.delivery];
});

function activeSafetyRisks(childId){return enhancedState.riskFlags.filter(x=>x.childId===childId&&x.status==='active');}
function currentPlanReview(childId){
  const plan=plans[childId];if(!plan)return {status:'missing',label:'暂无方案'};
  const review=enhancedState.reviews.filter(x=>x.childId===childId&&x.planGeneratedAt===plan.generatedAt&&['accepted','modified','rejected'].includes(x.result)).sort((a,b)=>b.ts-a.ts)[0];
  if(review?.result==='accepted'||review?.result==='modified')return {status:'effective',label:review.result==='modified'?'修改后已生效':'审核通过并生效',review};
  if(review?.result==='rejected')return {status:'rejected',label:'方案已拒绝，等待重新生成',review};
  return {status:'pending',label:'等待康复师／医师审核'};
}

function trainingGate(childId,moduleId){
  const risks=activeSafetyRisks(childId);
  if(risks.length)return {ok:false,reason:'该儿童存在有效安全暂停标记：'+risks.map(x=>x.label).join('、')+'。请暂停线上训练并联系专业人员。'};
  const approval=currentPlanReview(childId);
  if(approval.status!=='effective')return {ok:false,reason:'当前训练方案尚未由康复师或医师审核生效，暂不能开始训练。'};
  const module=TRAINING_CATALOG.find(x=>x.id===moduleId);
  if(module?.delivery==='offline')return {ok:false,offline:true,module,reason:'此活动需要真人互动、肢体辅助或环境调控，请在线下由成人按专业建议执行。平台只记录计划与完成情况。'};
  return {ok:true,module};
}

const governedOpenTrainer=openTrainer;
openTrainer=function(childId,moduleId,difficulty,onDone){
  const module=TRAINING_CATALOG.find(x=>x.id===moduleId);
  const gate=trainingGate(childId,moduleId);
  if(!gate.ok){showTrainingGate(gate,childId);return;}
  // 旧三维引擎仍可由已审核的排程调用，但同样先经过风险和方案状态检查。
  if(!module)return governedOpenTrainer(childId,moduleId,difficulty,onDone);
  governedOpenTrainer(childId,moduleId,difficulty,onDone);
};

function showTrainingGate(gate,childId){
  $('#sheet').innerHTML='<h3>'+(gate.offline?'线下活动提示':'训练暂未开放')+'<button class="x" id="closeTrainingGate">×</button></h3><div class="safety-stop-card"><span>'+(gate.offline?'🧑‍🤝‍🧑':'🛡️')+'</span><b>'+esc(gate.reason)+'</b></div>'+(gate.offline?'<button class="btn-primary" id="recordOfflineFromGate">记录线下活动</button>':'<div class="note">AI不能直接让未审核方案生效，也不会向家长开放高风险调整。</div>');
  openMask();$('#closeTrainingGate').onclick=closeMask;
  if($('#recordOfflineFromGate'))$('#recordOfflineFromGate').onclick=()=>{const method=REHABILITATION_METHODS.find(x=>x.modules.includes(gate.module.id));if(method)openMethodRecord(method.id);};
}

// 在训练卡片上明确执行边界和方案状态，避免把线下项目误认为网页训练。
const safetyRenderTrain=renderTrain;
renderTrain=function(c){
  safetyRenderTrain(c);
  const review=currentPlanReview(activeChild),risks=activeSafetyRisks(activeChild);
  const title=c.querySelector('.sec-title');if(title){const state=document.createElement('div');state.className='plan-safety-state '+(risks.length?'danger':review.status);state.innerHTML=risks.length?'⛔ 线上训练已暂停：'+risks.map(x=>esc(x.label)).join('、'):'🛡️ 方案状态：'+esc(review.label);title.insertAdjacentElement('afterend',state);}
  $$('.module-card',c).forEach(card=>{const module=TRAINING_CATALOG.find(x=>x.id===card.dataset.module);if(!module)return;const badge=document.createElement('em');badge.className='delivery-badge '+module.delivery;badge.textContent=module.deliveryLabel;card.appendChild(badge);});
};

// 所有身份登录后都能看到安全停止条件；儿童端使用不恐吓的简化表达。
const safetyEnterApp=enterApp;
enterApp=function(){
  safetyEnterApp();
  let strip=$('#mandatorySafetyStrip');if(!strip){strip=document.createElement('div');strip.id='mandatorySafetyStrip';strip.className='mandatory-safety-strip';$('#main').prepend(strip);}
  strip.innerHTML=currentRole==='child'?'🛑 身体不舒服、很害怕或想休息时，请马上停下来告诉身边的大人。':'🛑 出现癫痫、自伤、攻击、严重情绪爆发、吞咽或跌倒风险时，立即暂停线上训练并联系专业人员。';
};

// 替换原风险占位页为可保存、可解除的专业安全暂停标记。
const safetyEnhancedPanel=openEnhancedPanel;
openEnhancedPanel=function(type){
  if(type!=='risk'){safetyEnhancedPanel(type);return;}
  if(currentRole!=='teacher'){toast('仅康复医疗专业人员可管理风险标记');return;}
  const existing=activeSafetyRisks(activeChild);
  $('#sheet').innerHTML='<h3>安全风险与线上训练暂停<button class="x" id="closeRiskPanel">×</button></h3><div class="safety-rule">出现以下任一情况，应暂停线上训练并联系专业人员。</div><div class="risk-checks">'+SAFETY_RISKS.map(([id,label])=>'<label><input type="checkbox" data-risk="'+id+'">'+label+'</label>').join('')+'</div><div class="field"><label>专业备注</label><textarea id="riskNote" placeholder="记录观察、处置建议和恢复训练条件"></textarea></div><button class="btn-primary danger" id="activateRiskStop">保存并暂停线上训练</button>'+(existing.length?'<div class="card"><b>当前暂停原因</b><p>'+existing.map(x=>esc(x.label)).join('、')+'</p><button class="btn-ghost" id="resolveRiskStop">专业评估后解除暂停</button></div>':'');
  openMask();$('#closeRiskPanel').onclick=closeMask;
  $('#activateRiskStop').onclick=()=>{const selected=$$('[data-risk]:checked').map(x=>x.dataset.risk);if(!selected.length){toast('请至少选择一个风险情况');return;}selected.forEach(id=>{const label=SAFETY_RISKS.find(x=>x[0]===id)[1];enhancedState.riskFlags.push({id:'risk_'+uid(),childId:activeChild,type:id,label,note:$('#riskNote').value.trim(),status:'active',createdBy:currentRole,ts:Date.now()});});saveEnhanced();audit('ONLINE_TRAINING_SUSPENDED',selected.join(','));toast('已暂停该儿童的线上训练');closeMask();};
  if($('#resolveRiskStop'))$('#resolveRiskStop').onclick=()=>{existing.forEach(x=>{x.status='resolved';x.resolvedBy=currentRole;x.resolvedAt=Date.now();});saveEnhanced();audit('ONLINE_TRAINING_RESUMED',activeChild);toast('安全暂停已解除，仍需使用已审核方案');closeMask();};
};
