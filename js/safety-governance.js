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
function effectiveClinicalPlan(childId){
  return (enhancedState.planVersions||[]).filter(x=>x.childId===childId&&x.status==='effective'&&x.signature?.signedAt).sort((a,b)=>(b.version||0)-(a.version||0)||(b.ts||0)-(a.ts||0))[0]||null;
}
function isModuleInEffectivePlan(childId,moduleId){
  const plan=effectiveClinicalPlan(childId);if(!plan)return false;
  return (plan.rows||[]).some(row=>row.moduleId===moduleId);
}

function currentPlanReview(childId){
  const clinicalPlan=effectiveClinicalPlan(childId);
  if(clinicalPlan)return {status:'effective',label:'训练方案 v'+clinicalPlan.version+' 已实名签署生效',clinicalPlan};
  const plan=plans[childId];
  const review=enhancedState.reviews.filter(x=>x.childId===childId&&['accepted','modified','rejected','pending','pending-review'].includes(x.result)).sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
  if(review?.result==='accepted'||review?.result==='modified')return {status:'reviewed',label:'已完成人工复核，等待实名签署',review};
  if(review?.result==='rejected')return {status:'rejected',label:'方案已拒绝，等待重新生成',review};
  if(!plan)return {status:'missing',label:'暂无方案'};
  return {status:'pending',label:'等待康复专业人员复核'};
}

function trainingGate(childId,moduleId){
  if(typeof dbCanAccessChild==='function'&&!dbCanAccessChild(childId))return {ok:false,reason:'当前账号未获得该儿童的数据授权。'};
  const risks=activeSafetyRisks(childId);
  if(risks.length)return {ok:false,reason:'该儿童存在有效安全暂停标记：'+risks.map(x=>x.label).join('、')+'。请暂停线上训练并联系专业人员。'};
  if(['child','parent'].includes(currentRole)){
    const consent=(enhancedState.consents||[]).filter(x=>x.childId===childId&&x.status==='active').sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
    if(!consent?.scope?.includes('training'))return {ok:false,reason:'尚未获得有效的训练数据授权，请由家长在「我的－知情同意」中确认后再开始。'};
  }
  const module=TRAINING_CATALOG.find(x=>x.id===moduleId);
  if(!module)return {ok:false,reason:'训练模块不存在或已下线。'};
  const review=currentPlanReview(childId);
  if(['child','parent'].includes(currentRole)){
    const clinicalPlan=effectiveClinicalPlan(childId);
    if(!clinicalPlan)return {ok:false,reason:'尚未收到专业人员签署下发的家庭训练方案，暂不能开始训练。'};
    if(!isModuleInEffectivePlan(childId,moduleId))return {ok:false,reason:'该模块不在当前已签署家庭方案中，请按已下发任务训练。'};
  }
  if(module.delivery==='offline')return {ok:false,offline:true,module,reason:'此活动需要真人互动、肢体辅助或环境调控，请在线下由成人按专业建议执行。平台只记录计划与完成情况。'};
  return {ok:true,module,review};
}
const governedOpenTrainer=openTrainer;
openTrainer=function(childId,moduleId,difficulty,onDone){
  const module=TRAINING_CATALOG.find(x=>x.id===moduleId);
  const gate=trainingGate(childId,moduleId);
  if(!gate.ok){showTrainingGate(gate,childId);return;}
  // 训练可直接开始；仅保留有效安全暂停和线下活动提醒。
  if(!module)return governedOpenTrainer(childId,moduleId,difficulty,onDone);
  governedOpenTrainer(childId,moduleId,difficulty,onDone);
};

function showTrainingGate(gate,childId){
  $('#sheet').innerHTML='<h3>'+(gate.offline?'线下活动提示':'请暂停训练')+'<button class="x" id="closeTrainingGate">×</button></h3><div class="safety-stop-card"><span>'+(gate.offline?'🧑‍🤝‍🧑':'🛡️')+'</span><b>'+esc(gate.reason)+'</b></div>'+(gate.offline?'<button class="btn-primary" id="recordOfflineFromGate">记录线下活动</button>':'<div class="note">请告诉身边的大人，并按专业人员建议决定何时继续。</div>');
  openMask();$('#closeTrainingGate').onclick=closeMask;
  if($('#recordOfflineFromGate'))$('#recordOfflineFromGate').onclick=()=>{const method=REHABILITATION_METHODS.find(x=>x.modules.includes(gate.module.id));if(method)openMethodRecord(method.id);};
}

// 在训练卡片上明确执行边界和方案状态，避免把线下项目误认为网页训练。
const safetyRenderTrain=renderTrain;
renderTrain=function(c){
  safetyRenderTrain(c);
  const review=currentPlanReview(activeChild),risks=activeSafetyRisks(activeChild);
  const title=c.querySelector('.sec-title');if(title&&(risks.length||currentRole!=='child')){const state=document.createElement('div');state.className='plan-safety-state '+(risks.length?'danger':review.status);state.innerHTML=risks.length?'⛔ 线上训练已暂停：'+risks.map(x=>esc(x.label)).join('、'):'🛡️ 方案状态：'+esc(review.label);title.insertAdjacentElement('afterend',state);}
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
  if(currentRole!=='teacher'||!dbCan(DB_ACTIONS.RISK_FLAG)){toast('当前账号无权管理风险标记');return;}
  const existing=activeSafetyRisks(activeChild);
  const canResolve=dbCan(DB_ACTIONS.RISK_RESOLVE);
  $('#sheet').innerHTML='<h3>安全风险与线上训练暂停<button class="x" id="closeRiskPanel">×</button></h3><div class="safety-rule">出现以下任一情况，应立即暂停线上训练；疑似发作、自伤或吞咽危险应优先联系线下医疗/急救资源。</div><div class="risk-checks">'+SAFETY_RISKS.map(([id,label])=>'<label><input type="checkbox" data-risk="'+id+'">'+label+'</label>').join('')+'</div><div class="form-grid"><div class="field"><label>风险等级</label><select id="riskSeverity"><option value="urgent">紧急</option><option value="high">高</option><option value="moderate">中</option></select></div><div class="field"><label>首次发现时间</label><input id="riskOnset" type="datetime-local"></div><div class="field full"><label>观察与已采取措施</label><textarea id="riskNote" placeholder="必填：发生了什么、已停止哪些活动、已联系谁"></textarea></div><div class="field full"><label>恢复训练前置条件</label><textarea id="riskResumeCriteria" placeholder="必填：需要完成的线下评估或专业复核"></textarea></div></div><button class="btn-primary danger" id="activateRiskStop">保存并暂停线上训练</button>'+(existing.length?'<div class="card"><b>当前暂停原因</b><p>'+existing.map(x=>esc(x.label)+'（'+esc({urgent:'紧急',high:'高',moderate:'中'}[x.severity]||'未分级')+'）').join('、')+'</p>'+(canResolve?'<div class="field"><label>解除依据</label><textarea id="riskResolutionNote" placeholder="必填：复核结果、处置完成情况及可恢复原因"></textarea></div><div class="field"><label>后续随访计划</label><textarea id="riskFollowupPlan" placeholder="必填：复查时间、观察项目与再次暂停条件"></textarea></div><label class="consent-check"><input id="riskResolveConfirm" type="checkbox">本人已核对风险处置记录并承担本次解除责任</label><button class="btn-ghost" id="resolveRiskStop">实名复核后解除暂停</button>':'')+'</div>':'');
  openMask();$('#closeRiskPanel').onclick=closeMask;
  $('#activateRiskStop').onclick=async()=>{const selected=$$('[data-risk]:checked').map(x=>x.dataset.risk),created=[],note=$('#riskNote').value.trim(),resumeCriteria=$('#riskResumeCriteria').value.trim();if(!selected.length){toast('请至少选择一个风险情况');return;}if(!note||!resumeCriteria){toast('请填写观察处置和恢复训练前置条件');return;}const onset=$('#riskOnset').value?new Date($('#riskOnset').value).getTime():Date.now();selected.forEach(id=>{const label=SAFETY_RISKS.find(x=>x[0]===id)[1];created.push({id:'risk_'+uid(),childId:activeChild,type:id,label,severity:$('#riskSeverity').value,onsetAt:onset,note,resumeCriteria,status:'active',createdByRole:currentRole,createdByUserId:BACKEND_API.user?.userId||null,ts:Date.now()});});const saved=await Promise.all(created.map(backendSaveSafetyFlag));if(BACKEND_API.available&&saved.some(x=>!x)){toast('数据库保存失败，请重试');return;}enhancedState.riskFlags.push(...created);saveEnhanced();audit('ONLINE_TRAINING_SUSPENDED',selected.join(',')+' · '+$('#riskSeverity').value);toast('已暂停该儿童的线上训练');closeMask();};
  if($('#resolveRiskStop'))$('#resolveRiskStop').onclick=async()=>{const resolutionNote=$('#riskResolutionNote').value.trim(),followupPlan=$('#riskFollowupPlan').value.trim();if(!resolutionNote||!followupPlan||!$('#riskResolveConfirm').checked){toast('请填写解除依据、随访计划并完成专业确认');return;}if(!BACKEND_API.available||!BACKEND_API.user){toast('风险解除必须连接机构服务并使用实名专业会话');return;}const resolution={resolutionNote,followupPlan,confirmed:true};const saved=await backendResolveSafetyFlags(activeChild,resolution);if(!saved){toast('数据库解除失败，训练仍保持暂停');return;}existing.forEach(x=>{x.status='resolved';x.resolutionNote=resolutionNote;x.followupPlan=followupPlan;x.resolvedByRole=currentRole;x.resolvedByUserId=BACKEND_API.user.userId;x.resolvedByName=BACKEND_API.user.displayName;x.resolvedAt=Date.now();});saveEnhanced();audit('ONLINE_TRAINING_RESUMED',activeChild+' · '+resolutionNote);toast('安全暂停已实名解除，仍需使用已签署方案');closeMask();};
};
