/* ============ 四角色界面、交互与无障碍增量层 ============ */
/** 儿童原有题目、画像与闯关内容保持不变，本文件只追加快捷无障碍控制。 */
const uxEnterApp=enterApp;
enterApp=function(){
  uxEnterApp();
  let button=$('#childAccessibility');
  if(currentRole==='child'){
    if(!button){button=document.createElement('button');button.id='childAccessibility';button.className='mini-btn child-a11y-button';button.innerHTML='⚙️ 舒适设置';$('.top-actions').prepend(button);}
    button.classList.remove('hidden');button.onclick=openChildComfortPanel;
  }else if(button)button.classList.add('hidden');
};

function openChildComfortPanel(){
  $('#sheet').innerHTML='<h3>🌈 我的舒适设置<button class="x" id="closeComfort">×</button></h3><p class="child-setting-lead">选一个让自己舒服的方式，随时可以改。</p><div class="child-setting-grid"><button data-comfort-toggle="large" class="'+(settings.large?'on':'')+'">🔎<b>大字模式</b><small>字和按钮更大</small></button><button data-comfort-toggle="hc" class="'+(settings.hc?'on':'')+'">◐<b>高对比</b><small>看得更清楚</small></button><button data-comfort-toggle="reducedMotion" class="'+(settings.reducedMotion?'on':'')+'">🐢<b>慢动效</b><small>动画更轻柔</small></button><button data-comfort-toggle="audio" class="'+(settings.audio?'on':'')+'">🔊<b>语音提示</b><small>可以随时关闭</small></button></div><div class="comfort-slider"><label>🗣️ 说话速度 <output id="speechRateOut">'+Math.round((settings.speechRate??.82)*100)+'%</output></label><input id="speechRateControl" type="range" min="50" max="110" value="'+Math.round((settings.speechRate??.82)*100)+'"></div><div class="comfort-slider"><label>🔉 声音大小 <output id="volumeOut">'+Math.round((settings.volume??.3)*100)+'%</output></label><input id="volumeControl" type="range" min="0" max="100" value="'+Math.round((settings.volume??.3)*100)+'"></div><button class="btn-primary" id="tryVoice">▶ 听一听：我们慢慢来</button>';
  openMask();$('#closeComfort').onclick=closeMask;
  $$('[data-comfort-toggle]').forEach(button=>button.onclick=()=>{const key=button.dataset.comfortToggle;settings[key]=!settings[key];button.classList.toggle('on',settings[key]);lsSet('settings',settings);applyAccessibility();});
  $('#speechRateControl').oninput=e=>{settings.speechRate=+e.target.value/100;$('#speechRateOut').value=e.target.value+'%';lsSet('settings',settings);};
  $('#volumeControl').oninput=e=>{settings.volume=+e.target.value/100;$('#volumeOut').value=e.target.value+'%';lsSet('settings',settings);};
  $('#tryVoice').onclick=()=>speakBaseline('我们慢慢来，你可以随时休息。');
}

/* 家长首页：在原有报告之前追加今天、本周和状态提醒，不删除原报告内容。 */
const uxRenderReport=renderReport;
renderReport=function(c){
  uxRenderReport(c);
  if(currentRole!=='parent')return;
  c.classList.add('parent-friendly-report');
  const reportTitle=c.querySelector('.sec-title');if(reportTitle)reportTitle.innerHTML='🌱 家长首页';
  const friendlyTitles={'训练正确率走势':'最近是不是越来越熟练','各类任务练习量':'最近练了什么','最近完成的训练任务':'最近完成的小游戏','六域训练概览':'六种能力小游戏'};
  $$('.card>b',c).forEach(title=>{if(friendlyTitles[title.textContent.trim()])title.textContent=friendlyTitles[title.textContent.trim()];});
  const child=children.find(x=>x.id===activeChild);if(!child)return;
  const week=records.filter(x=>x.childId===activeChild&&x.source!=='baseline-game'&&x.ts>Date.now()-7*86400000),firstCorrect=week.filter(x=>x.firstCorrect??x.correct).length;
  const lastLog=enhancedState.familyLogs.filter(x=>x.childId===activeChild&&x.mood).sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
  const risks=typeof activeSafetyRisks==='function'?activeSafetyRisks(activeChild):[];
  const effective=typeof effectiveClinicalPlan==='function'?effectiveClinicalPlan(activeChild):null;
  const homeRows=(effective?.rows||[]).filter(x=>x.delivery!=='offline').slice(0,3);
  const completionKey=row=>[activeChild,effective?.version||'none',row.moduleId,todayStr()].join('|');
  const completedKeys=new Set((enhancedState.homeTaskCompletions||[]).filter(x=>x.status==='completed').map(x=>x.key));
  const stateText=risks.length?'请暂停训练：'+risks.map(x=>x.label).join('、'):(lastLog?.mood||'今天的状态尚未记录');
  const dashboard=document.createElement('section');dashboard.className='parent-home';
  const taskMarkup=homeRows.length?homeRows.map((row,index)=>{const key=completionKey(row),checked=completedKeys.has(key);return '<label class="home-check'+(checked?' completed':'')+'"><input type="checkbox" data-home-task="'+esc(key)+'" '+(checked?'checked ':'')+(risks.length?'disabled':'')+'><span><b>'+(index+1)+'. '+esc(row.moduleName)+'</b><small>建议 '+(row.duration||5)+' 分钟 · '+esc(row.delivery==='hybrid'?'需要成人陪同':'准备安静桌面和熟悉物品')+'</small><em>话术：“我们一起试一试，不着急。”</em></span></label>';}).join(''):'<div class="empty compact">今天还没有已签署下发的家庭任务，请稍后查看或联系专业人员。</div>';
  dashboard.innerHTML='<div class="parent-welcome"><div><small>今天也不用做很多</small><h2>陪 '+esc(child.name)+' 玩一会儿吧 🌿</h2><p>短时、轻松、有回应，比一次练很久更重要。</p></div><span>🏠💛</span></div><div class="parent-summary-grid"><article><span>✅</span><div><b>今日陪练</b><strong>'+homeRows.length+' 个已下发任务</strong></div></article><article><span>📈</span><div><b>本周练习</b><strong>'+(week.length?'完成 '+week.length+' 题 · 首次独立 '+firstCorrect+' 题':'等待第一次训练')+'</strong></div></article><article class="'+(risks.length?'alert':'')+'"><span>'+(risks.length?'⛔':'🌤️')+'</span><div><b>状态提醒</b><strong>'+esc(stateText)+'</strong></div></article></div><div class="parent-home-columns"><section><h3>今日家庭任务</h3>'+taskMarkup+'</section><section><h3>孩子的偏好与安全</h3><div class="preference-card">💡 '+esc(child.note||'尚未记录偏好，可在反馈日记中补充。')+'</div><div class="safety-home-card">'+(risks.length?'⛔ 当前存在专业安全暂停标记，请停止训练并联系专业人员。':'🛑 出现明显不适、情绪爆发、吞咽或跌倒风险，请立即停止并联系专业人员。')+'</div><button class="btn-ghost" id="openHomeDemo">▶ 查看低刺激陪练示范</button><button class="btn-primary" id="openFamilyLog">记录今天的状态</button></section></div>';
  c.prepend(dashboard);
  $$('[data-home-task]',dashboard).forEach(box=>box.onchange=()=>{
    enhancedState.homeTaskCompletions=enhancedState.homeTaskCompletions||[];
    enhancedState.homeTaskCompletions=enhancedState.homeTaskCompletions.filter(x=>x.key!==box.dataset.homeTask);
    if(box.checked)enhancedState.homeTaskCompletions.push({id:'home_'+uid(),key:box.dataset.homeTask,childId:activeChild,planVersion:effective.version,moduleId:box.dataset.homeTask.split('|')[2],date:todayStr(),status:'completed',completedBy:'parent',ts:Date.now()});
    box.closest('.home-check')?.classList.toggle('completed',box.checked);saveEnhanced();audit(box.checked?'HOME_TASK_COMPLETED':'HOME_TASK_REOPENED',box.dataset.homeTask);toast(box.checked?'已记录完成':'已恢复为未完成');
  });
  $('#openHomeDemo').onclick=openHomeDemonstration;$('#openFamilyLog').onclick=()=>openEnhancedPanel('family');
};
function openHomeDemonstration(){
  $('#sheet').innerHTML='<h3>▶ 5分钟陪练示范<button class="x" id="closeHomeDemo">×</button></h3><div class="demo-story"><div>1</div><span>🧸</span><b>准备熟悉材料</b><p>只放2—3件物品，关闭电视，减少干扰。</p></div><div class="demo-story"><div>2</div><span>👀</span><b>先示范，再邀请</b><p>说：“看我做一次，现在轮到你。”</p></div><div class="demo-story"><div>3</div><span>⭐</span><b>回应每一次尝试</b><p>说：“谢谢你试一试！”不批评，也不催促。</p></div><div class="demo-story"><div>4</div><span>🛑</span><b>在舒服的时候结束</b><p>出现回避或不适就暂停，完成一个小目标也算成功。</p></div><button class="btn-primary" id="repeatHomeDemo">🔁 从头再看</button>';
  openMask();$('#closeHomeDemo').onclick=closeMask;$('#repeatHomeDemo').onclick=()=>{$('.demo-story').scrollIntoView({behavior:settings.reducedMotion?'auto':'smooth'});};
}

/* 专业端：在原档案列表上增加总览、筛选、批量对比和CSV导出。 */
const uxRenderArchive=renderArchive;
renderArchive=function(c){
  uxRenderArchive(c);if(currentRole!=='teacher')return;
  const pending=children.filter(x=>currentPlanReview(x.id).status!=='effective').length,riskCount=children.filter(x=>activeSafetyRisks(x.id).length).length;
  const toolbar=document.createElement('section');toolbar.className='professional-command';
  toolbar.innerHTML='<div class="professional-kpis"><article><b>'+children.length+'</b><small>授权儿童</small></article><article><b>'+pending+'</b><small>待复核/签署</small></article><article class="'+(riskCount?'alert':'')+'"><b>'+riskCount+'</b><small>风险暂停</small></article><article><b>'+enhancedState.reevaluations.length+'</b><small>训练支持复评</small></article></div><div class="professional-tools professional-batch-tools"><span>授权范围内查看</span><button class="btn-ghost" id="compareChildren">批量对比</button></div>';
  c.prepend(toolbar);
  $$('.child-card',c).forEach(card=>{const child=children.find(x=>card.textContent.includes(x.name));if(!child)return;card.dataset.childId=child.id;card.dataset.status=child.status||'在训';const check=document.createElement('input');check.type='checkbox';check.className='child-compare-check';check.value=child.id;card.prepend(check);});
  $('#compareChildren').onclick=()=>openChildrenComparison($$('.child-compare-check:checked',c).map(x=>x.value));
};

function openChildrenComparison(ids){
  if(ids.length<2){toast('请至少选择两名儿童');return;}const selected=children.filter(x=>ids.includes(x.id));
  $('#sheet').innerHTML='<h3>儿童能力批量对比<button class="x" id="closeCompare">×</button></h3><div class="comparison-table"><div class="head"><b>儿童</b>'+Object.values(ABILITY_DOMAINS).map(x=>'<b>'+x.name+'</b>').join('')+'</div>'+selected.map(child=>{const p=getCurrentAbilityProfile(child.id);return '<div><strong>'+esc(child.name)+'</strong>'+Object.keys(ABILITY_DOMAINS).map(k=>'<span>'+(p?.scores[k]??'—')+'</span>').join('')+'</div>';}).join('')+'</div><div class="note">仅比较已授权儿童的训练起点，不用于儿童间排名或诊断。</div>';openMask();$('#closeCompare').onclick=closeMask;
}
function exportAuthorizedChildrenCsv(){
  const rows=[['化名','状态','注意与感知','记忆','执行与逻辑','语言沟通','社会情绪','生活适应']];children.filter(x=>dbCanAccessChild(x.id)).forEach(child=>{const p=getCurrentAbilityProfile(child.id);rows.push([child.name,child.status||'在训',...Object.keys(ABILITY_DOMAINS).map(k=>p?.scores[k]??'')]);});
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='授权儿童能力汇总.csv';a.click();URL.revokeObjectURL(a.href);audit('AUTHORIZED_CSV_EXPORTED',rows.length-1+'名儿童');
}

/* 每条AI建议显示证据样本量和数据充分度，不使用未经校准的百分比置信度。 */
const uxRenderAI=renderAI;
renderAI=function(c){
  uxRenderAI(c);if(currentRole!=='teacher')return;
  const plan=plans[activeChild];if(!plan)return;
  $$('.ai-plan .step',c).forEach((step,index)=>{const domain=Object.keys(ABILITY_DOMAINS)[index],sample=records.filter(x=>x.childId===activeChild&&x.source!=='baseline-game'&&x.domain===domain).slice(-18).length,sufficiency=sample>=12?'样本较充分':sample>=6?'样本有限':'资料不足';const explain=document.createElement('div');explain.className='ai-evidence';explain.innerHTML='<span>依据：近'+sample+'次正式训练＋分层证据</span><b>数据充分度：'+sufficiency+'</b><button data-quick-edit="'+index+'">快速修改</button>';step.appendChild(explain);});
  $$('[data-quick-edit]',c).forEach(button=>button.onclick=()=>openClinicalHub('plans'));
};

/* 复合管理员工作台顶部明确职责隔离。 */
const uxRenderSetting=renderSetting;
renderSetting=function(c){uxRenderSetting(c);if(currentRole!=='admin')return;const banner=document.createElement('div');banner.className='admin-governance-banner';banner.innerHTML='<span>🏢🛡️</span><div><b>内容与机构治理中心</b><p>管理素材、组织、账号和审计；儿童临床档案与业务备份保持隔离，仅提供脱敏运营汇总。</p></div>';c.prepend(banner);};
