/* ============ 康复方法中心：方法—活动—记录闭环 ============ */
/**
 * 方法名称用于解释训练设计依据，不表示平台正在实施医疗治疗。
 * 运动、感觉统合、作业和物理治疗活动必须由成人按专业建议在线下完成。
 */
const REHABILITATION_METHODS=[
  {id:'ABA',icon:'⭐',name:'应用行为分析（ABA）',idea:'技能分解、提示、强化、消退与泛化',implementation:'任务分层、回合训练、即时强化、温和纠错和泛化题库',modules:['P01','M01','L03'],mode:'online'},
  {id:'TEACCH',icon:'🗓️',name:'结构化教学（TEACCH）',idea:'结构化环境、视觉日程和清晰起止',implementation:'固定流程、视觉步骤条、工作篮和完成标记',modules:['E04','D01'],mode:'hybrid'},
  {id:'NDBI',icon:'🌳',name:'自然情景发展行为干预（NDBI）',idea:'在自然互动和儿童兴趣中嵌入学习机会',implementation:'生活情境、兴趣素材、家长陪练和场景泛化',modules:['L02','S02'],mode:'hybrid'},
  {id:'SENSORY',icon:'🧘',name:'感觉统合训练支持',idea:'支持前庭、本体和触觉等感觉处理',implementation:'平台安排计划并记录；动作在线下由成人辅助完成',modules:['D03'],mode:'offline',warning:'必须成人陪同；出现眩晕、疼痛或明显不适立即停止。'},
  {id:'SLT',icon:'💬',name:'言语—语言训练支持',idea:'语言理解、表达、语用和沟通动机',implementation:'命名、句子表达、指令理解、语音反馈和AAC',modules:['L01','L02','L03','L04'],mode:'hybrid'},
  {id:'OT',icon:'👐',name:'作业治疗支持',idea:'精细动作、生活自理、感觉调节与执行功能',implementation:'生活序列、手眼协调、分类和计划执行',modules:['D01','D02','E02','E04'],mode:'offline',warning:'线下活动应遵循康复师或作业治疗专业人员建议。'},
  {id:'PT',icon:'🏃',name:'物理治疗／运动康复支持',idea:'姿势控制、粗大动作、协调和体能',implementation:'动作模仿、节律跟随和动作计划，线下执行并记录',modules:['D03'],mode:'offline',warning:'需成人看护并排除跌倒、疼痛和运动禁忌风险。'},
  {id:'ART',icon:'🎵',name:'音乐／游戏／艺术活动',idea:'降低焦虑、提升参与、表达和社交机会',implementation:'节律模仿、视觉艺术、游戏互动和情绪反馈',modules:['D03','S01'],mode:'hybrid'},
  {id:'SOCIAL_STORY',icon:'📖',name:'社交故事与视觉支持',idea:'用可理解方式预告规则、步骤和社交情景',implementation:'社交故事库、视觉日程和社会情景模拟',modules:['S01','S02','S03'],mode:'online'},
  {id:'AAC',icon:'🖼️',name:'图片交换沟通／AAC',idea:'为语言不足儿童提供替代或补充沟通',implementation:'图片选择、需求表达、沟通板和语音输出',modules:['L04'],mode:'online'},
  {id:'COGNITIVE',icon:'🧠',name:'认知康复训练',idea:'针对注意、记忆和执行功能开展结构化训练',implementation:'六域核心游戏、自适应难度和过程数据',modules:['P01','P03','M02','M03','M04','E01','E04'],mode:'online'},
  {id:'FAMILY',icon:'🏠',name:'家庭中心干预支持',idea:'家长参与、日常泛化与家校一致',implementation:'家长指导、陪练话术、反馈日记、提醒和周报',modules:['M01','L03','D01'],mode:'hybrid'}
];

enhancedState.interventionLogs=enhancedState.interventionLogs||lsGet('interventionLogs',[]);

const methodsRenderSetting=renderSetting;
renderSetting=function(c){
  methodsRenderSetting(c);
  if(!['parent','teacher'].includes(currentRole))return;
  const section=document.createElement('section');section.className='card method-center-entry';
  section.innerHTML='<b>🧩 康复方法与活动中心</b><p>查看12类方法如何落实到游戏、家庭任务和线下记录。</p><button class="btn-primary" data-open-method-center>打开方法中心</button>';
  const logout=c.querySelector('#logout,#roleLogout');if(logout)c.insertBefore(section,logout);else c.appendChild(section);
  section.querySelector('[data-open-method-center]').onclick=()=>openRehabilitationCenter();
};

function openRehabilitationCenter(){
  const recent=enhancedState.interventionLogs.filter(x=>x.childId===activeChild).slice(-5).reverse();
  $('#sheet').innerHTML='<h3>康复方法与活动中心<button class="x" id="closeMethodCenter">×</button></h3><div class="note">平台提供训练支持和记录，不代替诊断、处方或线下专业治疗。请选择方法查看可执行活动。</div><div class="method-catalog">'+REHABILITATION_METHODS.map(method=>{
    const modules=method.modules.map(id=>TRAINING_CATALOG.find(x=>x.id===id)).filter(Boolean);
    return '<article class="method-card" data-method="'+method.id+'"><header><span>'+method.icon+'</span><div><b>'+method.name+'</b><small>'+(method.mode==='online'?'线上游戏':method.mode==='offline'?'线下辅助':'线上＋线下')+'</small></div></header><p>'+method.idea+'</p><div class="method-implementation">平台实现：'+method.implementation+'</div>'+(method.warning?'<div class="method-warning">⚠️ '+method.warning+'</div>':'')+'<div class="method-tags">'+modules.map(x=>'<span>'+x.name+'</span>').join('')+'</div><div class="method-actions">'+(modules[0]?'<button class="btn-ghost" data-method-start="'+modules[0].id+'">开始关联训练</button>':'')+'<button class="btn-primary" data-method-record="'+method.id+'">记录一次活动</button></div></article>';
  }).join('')+'</div><section class="method-history"><h4>最近活动记录</h4>'+(recent.length?recent.map(x=>'<div class="log-row"><b>'+esc(x.methodName)+'</b><small>'+new Date(x.ts).toLocaleString()+' · '+esc(x.context)+'</small><p>'+esc(x.note||'已完成')+'</p></div>').join(''):'<div class="empty">还没有活动记录</div>')+'</section>';
  openMask();$('#closeMethodCenter').onclick=closeMask;
  $$('[data-method-start]',$('#sheet')).forEach(button=>button.onclick=()=>{if(!activeChild){toast('请先选择儿童');return;}closeMask();openTrainer(activeChild,button.dataset.methodStart,2);});
  $$('[data-method-record]',$('#sheet')).forEach(button=>button.onclick=()=>openMethodRecord(button.dataset.methodRecord));
}

function openMethodRecord(methodId){
  const method=REHABILITATION_METHODS.find(x=>x.id===methodId);if(!method)return;
  $('#sheet').innerHTML='<h3>'+method.icon+' '+method.name+'<button class="x" id="closeMethodRecord">×</button></h3>'+(method.warning?'<div class="method-warning">⚠️ '+method.warning+'</div>':'')+'<div class="field"><label>活动场景</label><select id="methodContext"><option>机构训练</option><option>学校活动</option><option>家庭陪练</option><option>远程指导</option></select></div><div class="field"><label>参与时长（分钟）</label><input id="methodMinutes" type="number" min="1" max="60" value="5"></div><div class="field"><label>儿童状态</label><select id="methodState"><option>平稳参与</option><option>需要少量提示</option><option>需要较多辅助</option><option>出现不适并停止</option></select></div><div class="field"><label>必要观察</label><textarea id="methodNote" placeholder="记录完成情况、提示程度或需要注意的反应"></textarea></div><button class="btn-primary" id="saveMethodRecord">保存活动记录</button>';
  $('#closeMethodRecord').onclick=closeMask;
  $('#saveMethodRecord').onclick=async()=>{const record={id:'intervention_'+uid(),childId:activeChild,methodId:method.id,methodName:method.name,context:$('#methodContext').value,minutes:clamp(+$('#methodMinutes').value,1,60),state:$('#methodState').value,note:$('#methodNote').value.trim(),role:currentRole,ts:Date.now()};enhancedState.interventionLogs.push(record);saveEnhanced();if(typeof backendSaveIntervention==='function')await backendSaveIntervention(record);audit('INTERVENTION_ACTIVITY_RECORDED',method.id+' · '+record.context);toast('活动记录已保存');closeMask();};
}
