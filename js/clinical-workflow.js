/* ============ 从接案到结案的专业服务闭环 ============ */
/**
 * 本模块保存训练服务管理记录，不生成医学诊断。诊断字段只允许转录有来源的既有结论；
 * 专业方案必须签署后生效，历史版本不可被新版本覆盖。
 */
Object.assign(enhancedState,{
  caseIntakes:enhancedState.caseIntakes||lsGet('caseIntakes',[]),
  careGoals:enhancedState.careGoals||lsGet('careGoals',[]),
  planVersions:enhancedState.planVersions||lsGet('planVersions',[]),
  reevaluations:enhancedState.reevaluations||lsGet('reevaluations',[]),
  closures:enhancedState.closures||lsGet('closures',[]),
  followups:enhancedState.followups||lsGet('followups',[]),
  confirmations:enhancedState.confirmations||lsGet('confirmations',[])
});

const clinicalRenderSetting=renderSetting;
renderSetting=function(c){
  clinicalRenderSetting(c);
  if(!['teacher','parent'].includes(currentRole))return;
  const card=document.createElement('section');card.className='card clinical-hub-entry';
  card.innerHTML='<b>📋 '+(currentRole==='parent'?'目标共同确认':'专业服务闭环')+'</b><p>'+(currentRole==='parent'?'查看并确认康复师制定的 IEP/ITP 目标。':'接案、目标、方案签署、周期复评、结案与随访。')+'</p><button class="btn-primary" id="openClinicalHub">进入'+(currentRole==='parent'?'目标确认':'闭环管理')+'</button>';
  const logout=c.querySelector('#logout,#roleLogout');if(logout)c.insertBefore(card,logout);else c.appendChild(card);
  $('#openClinicalHub',card).onclick=()=>openClinicalHub(currentRole==='parent'?'goals':'intake');
};

function clinicalChildOptions(){return children.filter(x=>dbCanAccessChild(x.id)).map(x=>'<option value="'+x.id+'"'+(x.id===activeChild?' selected':'')+'>'+esc(x.name)+'</option>').join('');}
function clinicalLatest(list,childId){return list.filter(x=>x.childId===childId).sort((a,b)=>b.ts-a.ts)[0]||null;}
function clinicalSave(collection,record){enhancedState[collection].push(record);saveEnhanced();backendSaveCareRecord(record);}

function openClinicalHub(tab='intake'){
  const professional=currentRole==='teacher';
  if(!professional&&currentRole!=='parent'){toast('当前角色无权进入专业服务闭环');return;}
  if(currentRole==='parent')tab='goals';
  const tabs=professional?[['intake','1 接案'],['goals','2 IEP/ITP目标'],['plans','3 方案版本'],['reevaluation','4 周期复评'],['closure','5 结案随访']]:[['goals','目标共同确认']];
  $('#sheet').innerHTML='<h3>专业服务闭环<button class="x" id="closeClinicalHub">×</button></h3><div class="clinical-child-select"><label>当前儿童</label><select id="clinicalChild">'+clinicalChildOptions()+'</select></div><nav class="clinical-tabs">'+tabs.map(x=>'<button data-clinical-tab="'+x[0]+'" class="'+(x[0]===tab?'on':'')+'">'+x[1]+'</button>').join('')+'</nav><div id="clinicalPanel"></div>';
  openMask();$('#closeClinicalHub').onclick=closeMask;
  $('#clinicalChild').onchange=e=>{activeChild=e.target.value;lsSet('activeChild',activeChild);renderClinicalTab(tab);};
  $$('[data-clinical-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.clinicalTab;$$('[data-clinical-tab]').forEach(x=>x.classList.toggle('on',x===button));renderClinicalTab(tab);});
  renderClinicalTab(tab);
}

function renderClinicalTab(tab){
  if(currentRole==='parent'&&tab!=='goals'){toast('家长只能查看和确认共同目标');tab='goals';}
  if(!['teacher','parent'].includes(currentRole)){toast('当前角色无权访问此记录');return;}
  const renderers={intake:renderIntakeForm,goals:renderGoalManager,plans:renderPlanVersions,reevaluation:renderReevaluation,closure:renderClosureFollowup};
  (renderers[tab]||renderIntakeForm)($('#clinicalPanel'));
}

function renderIntakeForm(panel){
  const old=clinicalLatest(enhancedState.caseIntakes,activeChild)||{};
  panel.innerHTML='<div class="workflow-status">产出：儿童档案＋知情同意＋训练禁忌</div><div class="form-grid">'+
    '<div class="field"><label>主要照护人</label><input id="caseGuardian" value="'+esc(old.guardian||'')+'"></div><div class="field"><label>联系电话</label><input id="casePhone" value="'+esc(old.phone||'')+'"></div>'+
    '<div class="field full"><label>已有诊断原文（平台不自行诊断）</label><textarea id="caseDiagnosis">'+esc(old.diagnosis||'')+'</textarea></div><div class="field"><label>诊断机构/专业人员</label><input id="caseDiagnosisSource" value="'+esc(old.diagnosisSource||'')+'"></div><div class="field"><label>诊断日期</label><input id="caseDiagnosisDate" type="date" value="'+esc(old.diagnosisDate||'')+'"></div>'+
    '<div class="field full"><label>孕产、发育与既往干预史</label><textarea id="caseHistory">'+esc(old.developmentHistory||'')+'</textarea></div><div class="field full"><label>家庭支持、沟通方式和儿童兴趣</label><textarea id="caseFamily">'+esc(old.familySupport||'')+'</textarea></div>'+
    '<div class="field full"><label>用药、过敏、辅助器具和其他禁忌</label><textarea id="caseContra">'+esc(old.contraindications||'')+'</textarea></div></div><div class="risk-checks">'+SAFETY_RISKS.map(([id,label])=>'<label><input type="checkbox" data-intake-risk="'+id+'" '+((old.risks||[]).includes(id)?'checked':'')+'>'+label+'</label>').join('')+'</div><label class="consent-check"><input id="caseConsent" type="checkbox" '+(old.consent?'checked':'')+'>监护人已阅读并同意训练数据、评估数据及必要共享范围</label><button class="btn-primary" id="saveIntake">保存接案版本</button>';
  $('#saveIntake').onclick=()=>{if(!$('#caseGuardian').value.trim()||!$('#caseConsent').checked){toast('请填写主要照护人并确认知情同意');return;}const risks=$$('[data-intake-risk]:checked').map(x=>x.dataset.intakeRisk);const version=(old.version||0)+1;const record={kind:'intake',id:'intake_'+uid(),childId:activeChild,version,status:'active',guardian:$('#caseGuardian').value.trim(),phone:$('#casePhone').value.trim(),diagnosis:$('#caseDiagnosis').value.trim(),diagnosisSource:$('#caseDiagnosisSource').value.trim(),diagnosisDate:$('#caseDiagnosisDate').value,developmentHistory:$('#caseHistory').value.trim(),familySupport:$('#caseFamily').value.trim(),contraindications:$('#caseContra').value.trim(),risks,consent:true,recordedBy:currentRole,ts:Date.now()};clinicalSave('caseIntakes',record);risks.forEach(type=>{if(!activeSafetyRisks(activeChild).some(x=>x.type===type)){const label=SAFETY_RISKS.find(x=>x[0]===type)[1];enhancedState.riskFlags.push({id:'risk_'+uid(),childId:activeChild,type,label,note:'接案禁忌档案同步',status:'active',createdBy:currentRole,ts:Date.now()});}});saveEnhanced();audit('CASE_INTAKE_VERSION_SAVED','v'+version);toast('接案档案 v'+version+' 已保存');renderIntakeForm(panel);};
}

function renderGoalManager(panel){
  const goals=enhancedState.careGoals.filter(x=>x.childId===activeChild&&x.status!=='archived').sort((a,b)=>b.ts-a.ts);
  const parentMode=currentRole==='parent';
  panel.innerHTML='<div class="workflow-status">产出：分层个别化康复目标（IEP/ITP）</div><div class="goal-list">'+(goals.length?goals.map(goal=>'<article class="goal-record"><header><b>'+esc(goal.level)+' · '+esc(goal.domainName)+'</b><span>'+esc(goal.status)+'</span></header><p>'+esc(goal.description)+'</p><small>基线 '+goal.baseline+' → 目标 '+goal.target+' · 截止 '+esc(goal.dueDate)+' · 责任人 '+esc(goal.owner)+'</small><div>家长确认：'+(goal.parentConfirmed?'✅ 已确认':'⏳ 待确认')+'</div>'+(parentMode&&!goal.parentConfirmed?'<button class="btn-primary" data-confirm-goal="'+goal.id+'">确认共同目标</button>':'')+'</article>').join(''):'<div class="empty">暂无分层目标</div>')+'</div>'+(parentMode?'':'<div class="form-grid"><div class="field"><label>目标层级</label><select id="goalLevel"><option>短期目标</option><option>中期目标</option><option>长期目标</option></select></div><div class="field"><label>能力领域</label><select id="goalDomain">'+Object.entries(ABILITY_DOMAINS).map(([k,v])=>'<option value="'+k+'">'+v.name+'</option>').join('')+'</select></div><div class="field full"><label>可观察、可量化的目标描述</label><input id="careGoalText" placeholder="例：在少量提示下完成两步生活指令，连续3次达到80%"></div><div class="field"><label>基线值</label><input id="careGoalBase" type="number" min="0" max="100" value="40"></div><div class="field"><label>目标值</label><input id="careGoalTarget" type="number" min="0" max="100" value="75"></div><div class="field"><label>截止日期</label><input id="careGoalDue" type="date"></div><div class="field"><label>责任人</label><input id="careGoalOwner" value="'+ROLE_NAME[currentRole]+'"></div></div><button class="btn-primary" id="addCareGoal">新增目标</button>');
  $$('[data-confirm-goal]',panel).forEach(button=>button.onclick=()=>{const goal=enhancedState.careGoals.find(x=>x.id===button.dataset.confirmGoal);goal.parentConfirmed=true;goal.parentConfirmedAt=Date.now();const confirmation={kind:'confirmation',id:'confirm_'+uid(),childId:activeChild,version:1,status:'confirmed',targetType:'goal',targetId:goal.id,confirmedBy:'parent',ts:Date.now()};clinicalSave('confirmations',confirmation);saveEnhanced();audit('PARENT_GOAL_CONFIRMED',goal.id);renderGoalManager(panel);});
  if($('#addCareGoal'))$('#addCareGoal').onclick=()=>{const text=$('#careGoalText').value.trim(),due=$('#careGoalDue').value;if(!text||!due){toast('请填写目标描述和截止日期');return;}const domain=$('#goalDomain').value;const record={kind:'goal',id:'goal_'+uid(),childId:activeChild,version:1,status:'active',level:$('#goalLevel').value,domain,domainName:ABILITY_DOMAINS[domain].name,description:text,baseline:clamp(+$('#careGoalBase').value,0,100),target:clamp(+$('#careGoalTarget').value,0,100),dueDate:due,owner:$('#careGoalOwner').value.trim(),parentConfirmed:false,createdBy:currentRole,ts:Date.now()};clinicalSave('careGoals',record);audit('IEP_GOAL_CREATED',record.level+' · '+domain);toast('分层目标已建立，等待家长共同确认');renderGoalManager(panel);};
}

function planRowsFromAI(){const plan=plans[activeChild]||genPlan(activeChild);return plan.steps.map((step,index)=>{const module=TRAINING_CATALOG.find(x=>x.engine===step.dim)||TRAINING_CATALOG[index];return {moduleId:module.id,moduleName:module.name,difficulty:step.difficulty,frequency:3,duration:8,strategy:step.reason};});}
function renderPlanVersions(panel){
  const versions=enhancedState.planVersions.filter(x=>x.childId===activeChild).sort((a,b)=>b.version-a.version),latest=versions[0];
  panel.innerHTML='<div class="workflow-status">产出：可编辑、可签署、可追溯的生效训练方案</div><div class="version-history">'+(versions.length?versions.map(x=>'<span class="'+x.status+'">v'+x.version+' · '+({draft:'草稿',effective:'已签署生效',superseded:'历史版本'}[x.status]||x.status)+'</span>').join(''):'尚无专业方案版本')+'</div><div id="editablePlanRows">'+planRowsFromAI().map((row,i)=>'<div class="editable-plan-row"><select data-plan-module>'+TRAINING_CATALOG.map(m=>'<option value="'+m.id+'" '+(m.id===row.moduleId?'selected':'')+'>'+m.id+' '+m.name+'</option>').join('')+'</select><label>难度<input data-plan-difficulty type="number" min="1" max="5" value="'+row.difficulty+'"></label><label>每周次数<input data-plan-frequency type="number" min="1" max="14" value="'+row.frequency+'"></label><label>每次分钟<input data-plan-duration type="number" min="3" max="30" value="'+row.duration+'"></label><textarea data-plan-strategy>'+esc(row.strategy)+'</textarea></div>').join('')+'</div><div class="field"><label>版本修改说明</label><input id="planChangeNote" placeholder="说明相对上一版本的调整依据"></div><div class="plan-sign"><label>专业签署姓名/工号<input id="planSigner"></label><label class="consent-check"><input id="planSignConfirm" type="checkbox">本人已结合评估、风险和目标审核本方案</label></div><div class="review-actions"><button class="btn-ghost" id="savePlanDraft">保存草稿</button><button class="btn-primary" id="signPlan">签署并生效</button></div>';
  const collect=status=>{const rows=$$('.editable-plan-row').map(row=>{const id=$('[data-plan-module]',row).value,module=TRAINING_CATALOG.find(x=>x.id===id);return {moduleId:id,moduleName:module.name,delivery:module.delivery,difficulty:clamp(+$('[data-plan-difficulty]',row).value,1,5),frequency:clamp(+$('[data-plan-frequency]',row).value,1,14),duration:clamp(+$('[data-plan-duration]',row).value,3,30),strategy:$('[data-plan-strategy]',row).value.trim()};});const version=(latest?.version||0)+1;return {kind:'plan',id:'planv_'+uid(),childId:activeChild,version,status,sourcePlanGeneratedAt:plans[activeChild]?.generatedAt,goals:enhancedState.careGoals.filter(x=>x.childId===activeChild&&x.status==='active').map(x=>x.id),rows,changeNote:$('#planChangeNote').value.trim(),signature:status==='effective'?{signedBy:$('#planSigner').value.trim(),role:currentRole,signedAt:Date.now()}:null,ts:Date.now()};};
  $('#savePlanDraft').onclick=()=>{const record=collect('draft');clinicalSave('planVersions',record);audit('PLAN_VERSION_DRAFTED','v'+record.version);toast('方案草稿 v'+record.version+' 已保存');renderPlanVersions(panel);};
  $('#signPlan').onclick=()=>{if(!$('#planSigner').value.trim()||!$('#planSignConfirm').checked){toast('请填写签署人并确认专业审核');return;}versions.filter(x=>x.status==='effective').forEach(x=>x.status='superseded');const record=collect('effective');clinicalSave('planVersions',record);enhancedState.reviews.push({id:uid(),childId:activeChild,planGeneratedAt:plans[activeChild]?.generatedAt,result:'modified',reviewer:currentRole,reason:'专业编辑并签署方案 v'+record.version,signature:record.signature,ts:Date.now()});saveEnhanced();audit('PLAN_VERSION_SIGNED','v'+record.version+' · '+record.signature.signedBy);toast('方案 v'+record.version+' 已签署并生效');renderPlanVersions(panel);};
}

function renderReevaluation(panel){
  const profile=getCurrentAbilityProfile(activeChild),last=clinicalLatest(enhancedState.reevaluations,activeChild);
  const baseline=last?.scores||profile?.scores||Object.fromEntries(Object.keys(ABILITY_DOMAINS).map(k=>[k,50]));
  panel.innerHTML='<div class="workflow-status">产出：周期复评前后对比＋目标达成判断</div><div class="domain-score-inputs">'+Object.entries(ABILITY_DOMAINS).map(([key,d])=>'<label>'+d.name+'<small>上次 '+baseline[key]+'</small><input data-reval-domain="'+key+'" type="number" min="0" max="100" value="'+baseline[key]+'"></label>').join('')+'</div><div class="field"><label>评估工具/方法</label><input id="revalTool" value="平台引导式复评"></div><div class="field"><label>泛化观察</label><textarea id="revalGeneralization" placeholder="记录技能是否迁移到家庭、学校或机构场景"></textarea></div><button class="btn-primary" id="saveReevaluation">生成复评对比报告</button><div class="reeval-history">'+(last?renderReevaluationReport(last):'<div class="empty">暂无复评报告</div>')+'</div>';
  $('#saveReevaluation').onclick=()=>{const scores={};$$('[data-reval-domain]').forEach(x=>scores[x.dataset.revalDomain]=clamp(+x.value,0,100));const comparisons=Object.keys(ABILITY_DOMAINS).map(key=>({domain:key,before:baseline[key],after:scores[key],change:scores[key]-baseline[key]}));const goals=enhancedState.careGoals.filter(x=>x.childId===activeChild&&x.status==='active').map(goal=>({...goal,achieved:(scores[goal.domain]||0)>=goal.target}));const record={kind:'reevaluation',id:'reval_'+uid(),childId:activeChild,version:(last?.version||0)+1,status:'completed',tool:$('#revalTool').value.trim(),scores,comparisons,goals,generalization:$('#revalGeneralization').value.trim(),assessedBy:currentRole,ts:Date.now()};clinicalSave('reevaluations',record);audit('PERIODIC_REEVALUATION_COMPLETED','v'+record.version);toast('复评报告已生成');renderReevaluation(panel);};
}
function renderReevaluationReport(report){return '<article class="reeval-report"><header><b>复评报告 v'+report.version+'</b><small>'+new Date(report.ts).toLocaleDateString()+' · '+esc(report.tool)+'</small></header><div class="comparison-grid">'+report.comparisons.map(x=>'<div><b>'+ABILITY_DOMAINS[x.domain].name+'</b><span>'+x.before+' → '+x.after+'</span><em class="'+(x.change>=0?'up':'down')+'">'+(x.change>=0?'+':'')+x.change+'</em></div>').join('')+'</div><p>泛化观察：'+esc(report.generalization||'未记录')+'</p><p>目标达成：'+report.goals.filter(x=>x.achieved).length+' / '+report.goals.length+'</p></article>';}

function renderClosureFollowup(panel){
  const records=enhancedState.closures.filter(x=>x.childId===activeChild).sort((a,b)=>b.ts-a.ts),followups=enhancedState.followups.filter(x=>x.childId===activeChild).sort((a,b)=>b.ts-a.ts);
  panel.innerHTML='<div class="workflow-status">产出：结案报告＋维持/随访/转介计划</div><div class="form-grid"><div class="field"><label>处置方向</label><select id="closureType"><option value="maintenance">进入维持训练</option><option value="followup">家庭随访</option><option value="referral">转介建议</option><option value="closed">目标达成结案</option></select></div><div class="field"><label>下次随访日期</label><input id="closureNext" type="date"></div><div class="field full"><label>结案依据与当前能力总结</label><textarea id="closureSummary"></textarea></div><div class="field full"><label>家庭建议/维持计划/转介机构</label><textarea id="closurePlan"></textarea></div></div><label class="consent-check"><input id="closureSign" type="checkbox">专业人员已复核最近评估、目标达成和风险状态</label><button class="btn-primary" id="saveClosure">签署结案或转段记录</button><div class="closure-history">'+records.map(x=>'<div class="log-row"><b>'+esc({maintenance:'维持训练',followup:'家庭随访',referral:'转介建议',closed:'目标达成结案'}[x.disposition])+'</b><small>'+new Date(x.ts).toLocaleString()+' · '+esc(x.signedBy)+'</small><p>'+esc(x.summary)+'</p></div>').join('')+followups.map(x=>'<div class="log-row"><b>随访记录</b><small>'+new Date(x.ts).toLocaleString()+'</small><p>'+esc(x.note)+'</p></div>').join('')+'</div>';
  $('#saveClosure').onclick=()=>{if(!$('#closureSummary').value.trim()||!$('#closureSign').checked){toast('请填写总结并完成专业复核确认');return;}const disposition=$('#closureType').value,record={kind:'closure',id:'closure_'+uid(),childId:activeChild,version:records.length+1,status:'signed',disposition,summary:$('#closureSummary').value.trim(),plan:$('#closurePlan').value.trim(),nextFollowup:$('#closureNext').value,signedBy:ROLE_NAME[currentRole],signature:{signedBy:ROLE_NAME[currentRole],role:currentRole,signedAt:Date.now()},ts:Date.now()};clinicalSave('closures',record);if(record.nextFollowup){const followup={kind:'followup',id:'followup_'+uid(),childId:activeChild,version:1,status:'scheduled',dueDate:record.nextFollowup,note:'由结案/转段记录自动建立',ts:Date.now()};clinicalSave('followups',followup);}audit('CASE_CLOSURE_SIGNED',disposition);toast('结案/转段记录已签署');renderClosureFollowup(panel);};
}
