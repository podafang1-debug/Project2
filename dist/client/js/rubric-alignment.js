/* 竞赛要求对齐层：兴趣入口、完成奖励与真实实践记录。 */
enhancedState.interestEvents=enhancedState.interestEvents||lsGet('interestEvents',[]);
enhancedState.rewardLedger=enhancedState.rewardLedger||lsGet('rewardLedger',[]);
enhancedState.practiceLogs=enhancedState.practiceLogs||lsGet('practiceLogs',[]);

const RUBRIC_INTEREST_CHANNELS=[
  {id:'color',emoji:'🎨',name:'颜色世界',childLabel:'颜色',hint:'从鲜明、熟悉的颜色开始',moduleIds:['P01','P03','M03']},
  {id:'shape',emoji:'🔷',name:'图形乐园',childLabel:'图形',hint:'找形状、配一配、排顺序',moduleIds:['P02','E02','E03']},
  {id:'sound',emoji:'🎵',name:'声音森林',childLabel:'声音',hint:'听声音、听指令、跟节奏',moduleIds:['P04','L03','D03']}
];

function rubricInterestSummary(childId){
  const events=enhancedState.interestEvents.filter(item=>item.childId===childId),counts={color:0,shape:0,sound:0};
  events.forEach(item=>{if(item.interestId in counts)counts[item.interestId]++;});
  const topId=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  return {events,counts,top:events.length?RUBRIC_INTEREST_CHANNELS.find(item=>item.id===topId):null};
}

function rubricRewardSummary(childId){
  const entries=enhancedState.rewardLedger.filter(item=>item.childId===childId),points=entries.reduce((sum,item)=>sum+(item.points||0),0);
  return {entries,points,badges:Math.floor(points/50),remaining:50-points%50};
}

function recordRubricInterest(childId,interestId){
  const channel=RUBRIC_INTEREST_CHANNELS.find(item=>item.id===interestId);if(!childId||!channel)return;
  enhancedState.interestEvents.unshift({id:'interest_'+uid(),childId,interestId,source:'child-self-choice',ts:Date.now()});
  enhancedState.interestEvents=enhancedState.interestEvents.slice(0,500);saveEnhanced();
  audit('CHILD_INTEREST_SELECTED',channel.name);
}

function recordRubricReward(childId,moduleId,newRecords){
  if(!childId||!newRecords.length)return;
  const recordIds=newRecords.map(item=>item.id).filter(Boolean);
  const alreadyRewarded=enhancedState.rewardLedger.some(entry=>(entry.recordIds||[]).some(id=>recordIds.includes(id)));
  if(alreadyRewarded)return;
  const module=TRAINING_CATALOG.find(item=>item.id===moduleId);
  // 积分只奖励完成和坚持，不按答对数量发放。
  enhancedState.rewardLedger.unshift({id:'reward_'+uid(),childId,moduleId:moduleId||'',recordIds,points:10,reason:'完成一轮训练',ts:Date.now()});
  enhancedState.rewardLedger=enhancedState.rewardLedger.slice(0,500);saveEnhanced();
  audit('TRAINING_REWARD_EARNED',(module?.name||moduleId||'训练')+' · 10积分');
}

function rubricInterestModules(childId,interestId){
  const channel=RUBRIC_INTEREST_CHANNELS.find(item=>item.id===interestId);if(!channel)return new Set();
  const signed=typeof effectiveClinicalPlan==='function'?effectiveClinicalPlan(childId):null,allowed=new Set(signed?.rows?.map(row=>row.moduleId)||TRAINING_CATALOG.map(module=>module.id));
  return new Set(channel.moduleIds.filter(id=>allowed.has(id)));
}

function rubricCanOpenLevel(childId,moduleId){
  if(currentRole!=='child'||!TRAINING_CATALOG.some(module=>module.id===moduleId))return true;
  const levels=childAdventureOrder(getCurrentAbilityProfile(childId)),selected=rubricActiveInterestByChild.get(childId),matched=rubricInterestModules(childId,selected),isInterest=matched.has(moduleId);
  const chain=selected?levels.filter(level=>matched.has(level.id)===isInterest):levels,index=chain.findIndex(level=>level.id===moduleId);
  return index>=0&&(getLevelState(childId,moduleId).passed||chain.slice(0,index).every(level=>getLevelState(childId,level.id).passed));
}

// 最终训练入口外包一层：只有真正新增训练记录后才发放奖励，中途退出不会得分。
const rubricOpenTrainer=openTrainer;
openTrainer=function(childId,moduleId,difficulty,onDone){
  if(!rubricCanOpenLevel(childId,moduleId)){toast('请先通过本路线的前一关');return;}
  const beforeIds=new Set(records.filter(item=>item.childId===childId).map(item=>item.id));
  const completed=()=>{
    const added=records.filter(item=>item.childId===childId&&!beforeIds.has(item.id));
    recordRubricReward(childId,moduleId,added);
    if(onDone)onDone();
  };
  return rubricOpenTrainer(childId,moduleId,difficulty,completed);
};

const rubricActiveInterestByChild=new Map();
const rubricDailyChoiceByChild=lsGet('rubricDailyChoiceByChild',{});

function rubricTodayKey(){const now=new Date();return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');}
function saveRubricDailyChoice(childId,interestId){rubricDailyChoiceByChild[childId]={date:rubricTodayKey(),interestId:interestId||null};lsSet('rubricDailyChoiceByChild',rubricDailyChoiceByChild);}

function rubricApplyChain(nodes,childId,chainName){
  const states=nodes.map(button=>getLevelState(childId,button.dataset.level));
  let firstOpen=states.findIndex(state=>!state.passed);if(firstOpen<0)firstOpen=states.length;
  nodes.forEach((button,index)=>{const state=states[index],isCurrent=index===firstOpen,isRetry=isCurrent&&state.attempts>0&&!state.passed,isLocked=index>firstOpen,status=state.passed?'passed':isRetry?'retry':isCurrent?'current':'locked';button.classList.remove('passed','retry','current','locked','available');button.classList.add(status);button.disabled=isLocked;button.dataset.progressChain=chainName;const icon=$('.level-icon',button),label=$('small',button);if(icon)icon.textContent=state.passed?'⭐':isRetry?'🌱':isCurrent?'🎮':'🔒';if(label)label.textContent=state.passed?'已通过':isRetry?'再试一次':isCurrent?'开始':'通过本路线前一关后解锁';button.setAttribute('aria-label',(button.querySelector('b')?.textContent||button.dataset.level)+' '+status);});
}

const rubricRenderTrain=renderTrain;
renderTrain=function(c){
  rubricRenderTrain(c);c.classList.remove('interest-choice-pending');if(currentRole!=='child'||!c.querySelector('.adventure-header'))return;
  const cards=$$('.level-node[data-level]',c);
  cards.forEach(button=>button.onclick=()=>openTrainer(activeChild,button.dataset.level,moduleDifficultyFor(activeChild,button.dataset.level),()=>renderTrain(c)));
  const applyFilter=channel=>{
    const matched=rubricInterestModules(activeChild,channel.id);
    cards.forEach(card=>{card.classList.toggle('interest-match',matched.has(card.dataset.level));card.classList.toggle('interest-dimmed',!matched.has(card.dataset.level));});
    const highlighted=cards.filter(card=>matched.has(card.dataset.level));
    rubricApplyChain(highlighted,activeChild,'interest');
    rubricApplyChain(cards.filter(card=>!matched.has(card.dataset.level)),activeChild,'other');
  };
  const today=rubricTodayKey(),daily=rubricDailyChoiceByChild[activeChild],pending=daily?.date!==today,selected=RUBRIC_INTEREST_CHANNELS.find(channel=>channel.id===daily?.interestId);
  if(daily?.date===today&&selected){rubricActiveInterestByChild.set(activeChild,selected.id);applyFilter(selected);}else rubricActiveInterestByChild.delete(activeChild);
  if(!pending)return;
  const reward=rubricRewardSummary(activeChild),gateway=document.createElement('section');gateway.className='interest-gateway interest-daily-gateway';gateway.setAttribute('role','dialog');gateway.setAttribute('aria-modal','true');gateway.setAttribute('aria-labelledby','dailyInterestTitle');
  gateway.innerHTML='<div class="interest-gateway-head"><h2 id="dailyInterestTitle">今天想玩什么？</h2><div class="reward-wallet" aria-label="已有 '+reward.points+' 积分"><span>⭐</span><b>'+reward.points+'</b></div></div><div class="interest-choice-grid">'+RUBRIC_INTEREST_CHANNELS.map(item=>'<button data-rubric-interest="'+item.id+'" aria-label="选择'+item.childLabel+'"><span>'+item.emoji+'</span><b>'+item.childLabel+'</b></button>').join('')+'</div><button class="interest-skip" id="skipInterestChoice">直接开始</button>';
  c.querySelector('.adventure-header').before(gateway);c.classList.add('interest-choice-pending');
  const completeChoice=interestId=>{const channel=RUBRIC_INTEREST_CHANNELS.find(item=>item.id===interestId);if(channel){rubricActiveInterestByChild.set(activeChild,channel.id);recordRubricInterest(activeChild,channel.id);}else rubricActiveInterestByChild.delete(activeChild);saveRubricDailyChoice(activeChild,channel?.id||null);renderTrain(c);};
  $$('[data-rubric-interest]',gateway).forEach(button=>button.onclick=()=>completeChoice(button.dataset.rubricInterest));
  $('#skipInterestChoice',gateway).onclick=()=>completeChoice(null);
  requestAnimationFrame(()=>gateway.querySelector('[data-rubric-interest]')?.focus());
};

function rubricAbilitySummary(childId){
  const childRecords=records.filter(item=>item.childId===childId&&item.source!=='baseline-game'&&item.domain&&ABILITY_DOMAINS[item.domain]);
  const rows=Object.keys(ABILITY_DOMAINS).map(domain=>{const list=childRecords.filter(item=>item.domain===domain);return {domain,count:list.length,rate:list.length?Math.round(list.filter(item=>item.firstCorrect).length/list.length*100):null};});
  return rows.filter(item=>item.count>=3).sort((a,b)=>b.rate-a.rate)[0]||null;
}

function rubricInterestCard(childId){
  const interest=rubricInterestSummary(childId),ability=rubricAbilitySummary(childId),card=document.createElement('div');card.className='card interest-evidence-card';
  card.innerHTML='<b>兴趣与能力分开解读</b><p class="hint">兴趣来自儿童主动选择；能力来自首次正确率、反应时间和提示次数。兴趣高不代表能力高。</p><div class="interest-evidence-grid">'+RUBRIC_INTEREST_CHANNELS.map(item=>'<div><span>'+item.emoji+'</span><b>'+interest.counts[item.id]+'次</b><small>'+item.name+'自主选择</small></div>').join('')+'</div><p class="interest-reading">'+(interest.top?'当前较常选择：<b>'+esc(interest.top.name)+'</b>。':'还没有形成稳定的自主选择记录。')+' '+(ability?'目前有足够练习记录的较强表现领域：<b>'+esc(ABILITY_DOMAINS[ability.domain].name)+'</b>（'+ability.rate+'%，'+ability.count+'次）。':'能力数据仍不足，暂不下结论。')+'</p>';
  return card;
}

const rubricRenderReport=renderReport;
renderReport=function(c){
  rubricRenderReport(c);
  if(currentRole==='child'){
    const reward=rubricRewardSummary(activeChild),interest=rubricInterestSummary(activeChild),box=c.querySelector('.child-progress-simple');
    if(box)box.innerHTML='<div class="reward-stars">'+('★'.repeat(Math.min(5,reward.badges))+'☆'.repeat(Math.max(0,5-reward.badges)))+'</div><b>'+reward.points+' 积分 · 完成 '+reward.entries.length+' 轮训练</b><p>'+(interest.top?'你最近常选“'+esc(interest.top.name)+'”。':'还没有选过兴趣入口。')+' 答错没关系，完成一轮就能得到10积分。</p>';
    return;
  }
  if(currentRole==='parent'||currentRole==='teacher')c.appendChild(rubricInterestCard(activeChild));
  if(currentRole==='teacher'){
    const minutes=enhancedState.practiceLogs.reduce((sum,item)=>sum+(item.minutes||0),0),withEvidence=enhancedState.practiceLogs.filter(item=>item.evidenceType!=='none'&&item.evidenceRef).length;
    const card=document.createElement('div');card.className='card practice-summary-card';card.innerHTML='<b>实践过程脱敏汇总</b><div class="practice-kpis"><article><b>'+enhancedState.practiceLogs.length+'</b><small>真实活动</small></article><article><b>'+Math.round(minutes/60*10)/10+'</b><small>实践小时</small></article><article><b>'+withEvidence+'</b><small>证据已登记</small></article></div><p>演示模拟数据不会计入实践活动。</p>';c.appendChild(card);
  }
};

function openRubricPracticePanel(mode){
  const logs=enhancedState.practiceLogs.slice().sort((a,b)=>b.ts-a.ts),minutes=logs.reduce((sum,item)=>sum+(item.minutes||0),0),people=logs.reduce((sum,item)=>sum+(item.people||0),0),withEvidence=logs.filter(item=>item.evidenceType!=='none'&&item.evidenceRef).length;
  if(mode==='overview'){
    $('#sheet').innerHTML='<h3>实践过程总览<button class="x" id="closeRubricPractice">×</button></h3><div class="practice-kpis"><article><b>'+logs.length+'</b><small>真实活动</small></article><article><b>'+Math.round(minutes/60*10)/10+'</b><small>实践小时</small></article><article><b>'+people+'</b><small>参与人次</small></article><article><b>'+withEvidence+'</b><small>证据已登记</small></article></div><div class="note">仅显示脱敏汇总，不展示儿童姓名、访谈原文或现场文件。演示模拟数据不计入。</div>';
    openMask();$('#closeRubricPractice').onclick=closeMask;return;
  }
  const recent=logs.slice(0,5);
  $('#sheet').innerHTML='<h3>真实实践记录<button class="x" id="closeRubricPractice">×</button></h3><div class="practice-integrity">只记录已经真实开展的活动。请勿把产品演示或模拟数据登记为现场实践。</div><div class="form-grid practice-form"><div class="field"><label>实践日期</label><input id="practiceDate" type="date" value="'+todayStr()+'"></div><div class="field"><label>真实场景</label><select id="practiceScene"><option>康复机构</option><option>学校</option><option>社区</option><option>家庭</option><option>其他现场</option></select></div><div class="field"><label>采用方法</label><select id="practiceMethod"><option>访谈调研</option><option>参与式观察</option><option>行动研究</option><option>案例分析</option><option>情景模拟</option></select></div><div class="field"><label>参与人数</label><input id="practicePeople" type="number" min="1" value="1"></div><div class="field"><label>实践时长 分钟</label><input id="practiceMinutes" type="number" min="1" value="60"></div><div class="field"><label>原始证据</label><select id="practiceEvidence"><option value="photo">现场影像</option><option value="interview">访谈记录</option><option value="log">调研日志</option><option value="third-party">第三方证明</option><option value="none">暂未整理</option></select></div><div class="field full"><label>活动内容与真实发现</label><textarea id="practiceFinding" placeholder="填写做了什么、观察到什么，以及它如何推动产品改进"></textarea></div><div class="field full"><label>证据编号或存放位置</label><input id="practiceEvidenceRef" placeholder="例：访谈记录 F-03 或照片目录 2026-09-07"></div></div><button class="btn-primary" id="saveRubricPractice">保存真实实践记录</button>'+(recent.length?'<div class="practice-history"><h4>最近记录</h4>'+recent.map(item=>'<article><b>'+esc(item.scene)+' · '+esc(item.method)+'</b><small>'+esc(item.date)+' · '+item.minutes+'分钟 · '+item.people+'人 · '+(item.evidenceType==='none'?'证据待补':'证据已登记')+'</small><p>'+esc(item.finding)+'</p></article>').join('')+'</div>':'');
  openMask();$('#closeRubricPractice').onclick=closeMask;
  $('#saveRubricPractice').onclick=()=>{
    const finding=$('#practiceFinding').value.trim(),evidenceType=$('#practiceEvidence').value,evidenceRef=$('#practiceEvidenceRef').value.trim();
    if(!finding){toast('请填写活动内容与真实发现');return;}if(evidenceType!=='none'&&!evidenceRef){toast('请填写证据编号或存放位置');return;}
    const entry={id:'practice_'+uid(),date:$('#practiceDate').value,scene:$('#practiceScene').value,method:$('#practiceMethod').value,people:Math.max(1,+$('#practicePeople').value||1),minutes:Math.max(1,+$('#practiceMinutes').value||1),evidenceType,evidenceRef,finding,source:'real-practice',recordedBy:currentRole,ts:Date.now()};
    enhancedState.practiceLogs.unshift(entry);saveEnhanced();audit('FIELD_PRACTICE_RECORDED',entry.scene+' · '+entry.method+' · '+entry.minutes+'分钟');toast('真实实践记录已保存');closeMask();
  };
}

const rubricRenderSetting=renderSetting;
renderSetting=function(c){
  rubricRenderSetting(c);if(currentRole!=='teacher')return;
  const grid=c.querySelector('.ops-grid');if(!grid)return;
  const button=document.createElement('button');button.className='ops-card rubric-practice-entry';button.dataset.rubricPractice='record';
  button.innerHTML='<b>真实实践记录</b><small>记录真实场景、研究方法、时长和原始证据</small>';
  grid.prepend(button);button.onclick=()=>openRubricPracticePanel(button.dataset.rubricPractice);
};
