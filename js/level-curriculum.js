/* 20 关多形式课程：最终接管儿童训练地图，专业端继续使用原训练模块。 */
const CURRICULUM_ACTIVITY_TYPES={
  color:{emoji:'🎨',label:'颜色'},shape:{emoji:'🔷',label:'图形'},choice:{emoji:'👆',label:'选择'},
  audio:{emoji:'🎧',label:'听声音'},matching:{emoji:'🧩',label:'配对'},memory:{emoji:'🧠',label:'记忆'},
  sequence:{emoji:'🚂',label:'排顺序'},sorting:{emoji:'🧺',label:'分类'},spoken:{emoji:'💬',label:'说一说'},
  guided:{emoji:'🤝',label:'跟着做'},tap:{emoji:'⭐',label:'点一点'}
};
const CURRICULUM_MODULE_TYPES={P01:'color',P02:'shape',P03:'choice',P04:'audio',M01:'matching',M02:'memory',M03:'sequence',M04:'memory',E01:'choice',E02:'sorting',E03:'choice',E04:'sequence',L01:'spoken',L02:'spoken',L03:'audio',L04:'choice',S01:'choice',S02:'guided',S03:'choice',D01:'sequence',D02:'tap',D03:'guided'};
const CURRICULUM_LEVEL_TITLES=['出发啦','眼睛小侦探','记忆宝盒','听听看','第一座彩虹桥','配对高手','顺序小火车','生活小帮手','表情朋友','第二座彩虹桥','分类探险','指令挑战','说说看','轮流合作','第三座彩虹桥','计划小达人','工作记忆站','生活闯关','综合大冒险','彩虹岛庆典'];
const CURRICULUM_ICON=['🌱','👀','🎁','🎧','🌈','🧩','🚂','🏠','😊','🌈','🧺','👂','💬','🤝','🌈','🗺️','🧠','🏆','🚀','🏝️'];
const curriculumCache=new Map(),curriculumFetched=new Set();
const curriculumExcludedByChild=lsGet('curriculumExcludedByChild',{});

function curriculumExclusions(childId){return new Set(curriculumExcludedByChild[childId]||[]);}
function saveCurriculumExclusions(childId,values){
  curriculumExcludedByChild[childId]=[...new Set(values)].filter(type=>CURRICULUM_ACTIVITY_TYPES[type]);
  lsSet('curriculumExcludedByChild',curriculumExcludedByChild);curriculumCache.delete(childId);curriculumFetched.delete(childId);
}
function curriculumDomainOrder(childId){
  const scores=getCurrentAbilityProfile(childId)?.scores||children.find(item=>item.id===childId)?.profile6||{};
  return Object.keys(ABILITY_DOMAINS).sort((a,b)=>(scores[a]??50)-(scores[b]??50));
}
/* 扩展接口：追加配置后无需复制地图或答题器。 */
function buildLocalCurriculum(childId,extraLevels=[]){
  const order=curriculumDomainOrder(childId),excluded=curriculumExclusions(childId);
  const levels=CURRICULUM_LEVEL_TITLES.map((title,index)=>{
    const focus=[order[index%6],order[(index+1)%6],order[(index+3)%6]];
    let pool=TRAINING_CATALOG.filter(module=>focus.includes(module.domain)&&!excluded.has(CURRICULUM_MODULE_TYPES[module.id]));
    if(pool.length<5)pool=pool.concat(TRAINING_CATALOG.filter(module=>!pool.includes(module)&&!excluded.has(CURRICULUM_MODULE_TYPES[module.id])));
    if(pool.length<3)pool=TRAINING_CATALOG.filter(module=>['choice','tap'].includes(CURRICULUM_MODULE_TYPES[module.id]));
    const activities=[],used=new Set(),start=index*3;
    for(let turn=0;activities.length<5&&turn<pool.length*4;turn++){
      const module=pool[(start+turn)%pool.length],type=CURRICULUM_MODULE_TYPES[module.id];
      if(activities.some(item=>item.moduleId===module.id))continue;
      if(!used.has(type)||activities.length>=3){activities.push({activityId:'LV'+String(index+1).padStart(2,'0')+'-A'+(activities.length+1),moduleId:module.id,domain:module.domain,type,label:module.name,questionVariant:(index+activities.length)%3});used.add(type);}
    }
    pool.forEach(module=>{if(activities.length<5&&!activities.some(item=>item.moduleId===module.id))activities.push({activityId:'LV'+String(index+1).padStart(2,'0')+'-A'+(activities.length+1),moduleId:module.id,domain:module.domain,type:CURRICULUM_MODULE_TYPES[module.id],label:module.name,questionVariant:(index+activities.length)%3});});
    return {levelId:'LV'+String(index+1).padStart(2,'0'),order:index+1,title,theme:ABILITY_DOMAINS[focus[0]].name+'岛',difficulty:Math.min(5,Math.floor(index/5)+1),focusDomains:focus,activities:activities.slice(0,5),passRule:{minCompleted:5,minAccuracy:.6}};
  });
  return {curriculumId:'LOCAL-'+childId,version:1,status:'effective-presentation-plan',generatedBy:{provider:'browser-safe-fallback',model:'rules-v1',fallback:true},levels:levels.concat(extraLevels),extension:{schemaVersion:'level-plan-v1',nextLevelOrder:levels.length+extraLevels.length+1,endpoint:'/api/personalized/levels'}};
}
function registerCurriculumLevels(childId,levels){
  const current=curriculumCache.get(childId)||buildLocalCurriculum(childId);
  const known=new Set(current.levels.map(level=>level.levelId));
  const additions=(levels||[]).filter(level=>level?.levelId&&!known.has(level.levelId));
  current.levels=current.levels.concat(additions).sort((a,b)=>a.order-b.order);curriculumCache.set(childId,current);return current;
}
async function fetchPersonalizedCurriculum(childId){
  if(!BACKEND_API.available)return null;
  const excluded=[...curriculumExclusions(childId)].join(',');
  try{
    const result=await backendRequest('/api/personalized/levels?child_id='+encodeURIComponent(childId)+'&excluded='+encodeURIComponent(excluded));
    if(result?.curriculum?.levels?.length){curriculumCache.set(childId,result.curriculum);return result.curriculum;}
  }catch(error){console.warn('课程 Agent 读取失败，使用本地安全方案：',error.message);}
  return null;
}
function curriculumFor(childId){
  if(!curriculumCache.has(childId))curriculumCache.set(childId,buildLocalCurriculum(childId));
  if(!curriculumFetched.has(childId)){curriculumFetched.add(childId);fetchPersonalizedCurriculum(childId).then(result=>{if(result&&currentRole==='child'&&activeChild===childId){const panel=$('#tabContent');if(panel)renderTrain(panel);}});}
  return curriculumCache.get(childId);
}
function getCurriculumLevelState(childId,levelId){
  const level=curriculumFor(childId).levels.find(item=>item.levelId===levelId);
  const rows=records.filter(item=>item.childId===childId&&item.curriculumLevelId===levelId);
  const grouped=new Map();rows.forEach(item=>{const key=item.curriculumRunId||item.id;(grouped.get(key)||grouped.set(key,[]).get(key)).push(item);});
  const runs=[...grouped.values()].sort((a,b)=>(a[0]?.ts||0)-(b[0]?.ts||0));
  const last=runs.at(-1)||[],completed=last.filter(item=>item.completed).length,correct=last.filter(item=>item.correct).length;
  const needed=level?.passRule?.minCompleted||level?.activities?.length||5,accuracy=last.length?correct/last.length:0;
  return {attempts:runs.length,completed,accuracy:Math.round(accuracy*100),passed:completed>=needed&&accuracy>=(level?.passRule?.minAccuracy??.6)};
}
function curriculumSelectedInterest(childId){
  const daily=typeof rubricDailyChoiceByChild!=='undefined'?rubricDailyChoiceByChild[childId]:null;
  return daily?.date===rubricTodayKey?.()?daily.interestId:null;
}
function curriculumInterestMatches(level,interestId){
  const channel=RUBRIC_INTEREST_CHANNELS.find(item=>item.id===interestId);
  return !!channel&&level.activities.some(activity=>channel.moduleIds.includes(activity.moduleId));
}
function curriculumChains(childId){
  const levels=curriculumFor(childId).levels,interestId=curriculumSelectedInterest(childId);
  return interestId?[levels.filter(level=>curriculumInterestMatches(level,interestId)),levels.filter(level=>!curriculumInterestMatches(level,interestId))]:[levels];
}
function curriculumCanOpenLevel(childId,levelId){
  const chain=curriculumChains(childId).find(items=>items.some(item=>item.levelId===levelId))||[],index=chain.findIndex(item=>item.levelId===levelId);
  return index>=0&&(getCurriculumLevelState(childId,levelId).passed||chain.slice(0,index).every(item=>getCurriculumLevelState(childId,item.levelId).passed));
}
function curriculumLevelStatus(childId,level){
  const chain=curriculumChains(childId).find(items=>items.some(item=>item.levelId===level.levelId))||[],index=chain.findIndex(item=>item.levelId===level.levelId),state=getCurriculumLevelState(childId,level.levelId);
  if(state.passed)return 'passed';
  const previousPassed=chain.slice(0,index).every(item=>getCurriculumLevelState(childId,item.levelId).passed);
  return previousPassed?(state.attempts?'retry':'current'):'locked';
}
function curriculumQuestion(activity){
  const list=localQuestionsFor(activity.moduleId),question=list[activity.questionVariant%Math.max(1,list.length)]||list[0];
  return {...question,activityId:activity.activityId,activityType:activity.type,moduleId:activity.moduleId,domain:activity.domain};
}
async function curriculumQuestions(childId,level){
  let set=agentQuestionCache.get(childId);
  if(!set)try{set=await fetchAgentQuestionSet(childId);}catch(_error){}
  return level.activities.map(activity=>{
    const remote=(set?.questions||[]).filter(q=>q.moduleId===activity.moduleId)[activity.questionVariant%Math.max(1,(set?.questions||[]).filter(q=>q.moduleId===activity.moduleId).length)];
    const local=curriculumQuestion(activity);
    return remote?{...local,...remote,mode:remote.mode||local.mode,activityId:activity.activityId,activityType:activity.type}:local;
  });
}
function openCurriculumPreferences(childId,onSaved){
  const selected=curriculumExclusions(childId);
  $('#sheet').innerHTML='<h3>不想玩哪些？<button class="x" id="closeCurriculumPrefs">×</button></h3><div class="curriculum-pref-grid">'+Object.entries(CURRICULUM_ACTIVITY_TYPES).map(([type,item])=>'<button class="'+(selected.has(type)?'off':'')+'" data-curriculum-pref="'+type+'"><span>'+item.emoji+'</span><b>'+item.label+'</b><small>'+(selected.has(type)?'不玩':'可以玩')+'</small></button>').join('')+'</div><p class="curriculum-pref-note">点一下就能换掉。至少留下两种游戏。</p><button class="btn-primary" id="saveCurriculumPrefs">保存</button>';
  openMask();$$('[data-curriculum-pref]',$('#sheet')).forEach(button=>button.onclick=()=>{button.classList.toggle('off');button.querySelector('small').textContent=button.classList.contains('off')?'不玩':'可以玩';});
  $('#closeCurriculumPrefs').onclick=closeMask;
  $('#saveCurriculumPrefs').onclick=()=>{const off=$$('[data-curriculum-pref].off',$('#sheet')).map(button=>button.dataset.curriculumPref);if(Object.keys(CURRICULUM_ACTIVITY_TYPES).length-off.length<2){toast('请至少留下两种游戏');return;}saveCurriculumExclusions(childId,off);closeMask();onSaved?.();};
}
function openCurriculumLevel(childId,levelId){
  if(!curriculumCanOpenLevel(childId,levelId)){toast('先闯过前一关吧');return;}
  const level=curriculumFor(childId).levels.find(item=>item.levelId===levelId);if(!level)return;
  const list=level.activities.map(activity=>{const type=CURRICULUM_ACTIVITY_TYPES[activity.type]||{emoji:'🎮',label:'小游戏'};return '<li><span>'+type.emoji+'</span><div><b>'+esc(activity.label)+'</b><small>'+type.label+'</small></div></li>';}).join('');
  $('#sheet').innerHTML='<div class="curriculum-level-intro"><button class="x" id="closeLevelIntro">×</button><span class="level-big-icon">'+CURRICULUM_ICON[level.order-1]+'</span><small>第 '+level.order+' 关</small><h2>'+esc(level.title)+'</h2><ul>'+list+'</ul><button class="btn-ghost" id="changeCurriculumPrefs">🔁 换掉不想玩的</button><button class="btn-primary" id="startCurriculumLevel">开始闯关</button></div>';
  openMask();$('#closeLevelIntro').onclick=closeMask;$('#changeCurriculumPrefs').onclick=()=>openCurriculumPreferences(childId,()=>{renderTrain($('#tabContent'));});
  $('#startCurriculumLevel').onclick=async()=>{closeMask();const questions=await curriculumQuestions(childId,level);runCurriculumQuestions(childId,level,questions);};
}
function runCurriculumQuestions(childId,level,questions){
  const sheet=$('#trainSheet'),bodyId='curriculumQuestionBody',runId='CRUN-'+uid();let index=0,results=[],difficulty=level.difficulty,advanceTimer=null,closed=false;
  const leaveRun=()=>{closed=true;clearTimeout(advanceTimer);$('#trainMask').classList.add('hidden');$('#trainMask').classList.remove('curriculum-fullscreen');document.body.classList.remove('curriculum-playing');renderTrain($('#tabContent'));};
  sheet.innerHTML='<header class="curriculum-run-header"><button class="curriculum-run-exit" id="closeCurriculumRun" aria-label="退出本关">×</button><div class="curriculum-progress-track" aria-label="本关进度"><i id="curriculumProgressBar"></i></div><b id="curriculumProgressLabel">1 / '+questions.length+'</b></header><main id="'+bodyId+'" class="curriculum-question-stage" aria-live="polite"></main>';
  $('#trainMask').classList.remove('hidden');$('#trainMask').classList.add('curriculum-fullscreen');document.body.classList.add('curriculum-playing');$('#closeCurriculumRun').onclick=leaveRun;const body=$('#'+bodyId);
  function render(){
    if(index>=questions.length){finish();return;}const q=questions[index],choices=shuffledQuestionChoices(q,difficulty);let started=performance.now(),hints=0,repeats=0;
    $('#curriculumProgressBar').style.width=Math.round(index/questions.length*100)+'%';$('#curriculumProgressLabel').textContent=(index+1)+' / '+questions.length;
    body.innerHTML='<div class="curriculum-game-tag">'+(CURRICULUM_ACTIVITY_TYPES[q.activityType]?.emoji||'🎮')+' '+esc(CURRICULUM_ACTIVITY_TYPES[q.activityType]?.label||'小游戏')+'</div><div class="agent-question-card"><span class="agent-question-icon">'+esc(q.cue||q.targetCue||'🎮')+'</span><h2>'+esc(q.mode==='audio'?'听一听，选一选':q.prompt)+'</h2>'+(q.preview?'<div class="memory-preview" id="curriculumPreview">'+q.preview.join('　')+'</div>':'')+'<div id="curriculumChoices" class="agent-choice-grid count-'+choices.length+(q.preview?' hidden':'')+'">'+choices.map((choice,i)=>'<button data-curriculum-choice="'+i+'">'+esc(choice)+'</button>').join('')+'</div><div class="agent-question-tools"><button id="repeatCurriculum">🔊 再听</button>'+(q.mode==='spoken'||q.mode==='guided'?'':'<button id="hintCurriculum">💡 提示</button>')+'</div></div>';
    $$('[data-curriculum-choice]',body).forEach(button=>button.onclick=()=>answer(q,choices[+button.dataset.curriculumChoice],hints,repeats,Math.round(performance.now()-started)));
    $('#repeatCurriculum').onclick=()=>{repeats++;speakQuestion(q.spokenPrompt||q.prompt);};if($('#hintCurriculum'))$('#hintCurriculum').onclick=()=>{hints++;const wrong=$$('[data-curriculum-choice]',body).find(button=>choices[+button.dataset.curriculumChoice]!==q.target&&!button.disabled);if(wrong)wrong.disabled=true;};
    if(q.preview)setTimeout(()=>{const preview=$('#curriculumPreview'),choiceBox=$('#curriculumChoices');if(!preview||!choiceBox)return;preview.classList.add('hidden');choiceBox.classList.remove('hidden');started=performance.now();},1800);
    else if(q.mode==='audio')speakQuestion(q.spokenPrompt||q.prompt);
  }
  function answer(q,picked,hints,repeats,reactionMs){
    $$('[data-curriculum-choice]',body).forEach(button=>button.disabled=true);const observed=q.mode==='spoken'||q.mode==='guided',completed=picked!=='还没完成',correct=observed?completed:picked===q.target,promptLevel=hints?2:repeats?1:picked==='帮助后完成'?2:0,module=TRAINING_CATALOG.find(item=>item.id===q.moduleId);
    results.push({id:uid(),childId,module:module?.engine||'attention',moduleId:q.moduleId,domain:q.domain,difficulty,correct,firstCorrect:correct&&promptLevel===0,promptLevel,hintCount:hints,repeatCount:repeats,reactionMs,completed,source:'curriculum-agent-v1',questionId:q.questionId,activityId:q.activityId,activityType:q.activityType,curriculumLevelId:level.levelId,curriculumRunId:runId,ts:Date.now()});
    $('#curriculumProgressBar').style.width=Math.round((index+1)/questions.length*100)+'%';if(correct){body.innerHTML='<div class="curriculum-success-flash"><div>👍</div><h2>你真棒！</h2></div>';advanceTimer=setTimeout(()=>{if(closed)return;index++;render();},900);}else{body.innerHTML='<div class="agent-answer-celebration try"><div>🌱</div><h2>没关系，再试一次也很棒</h2><button class="btn-primary" id="nextCurriculumQuestion">'+(index+1===questions.length?'看看结果':'下一题')+'</button></div>';$('#nextCurriculumQuestion').onclick=()=>{index++;render();};}
  }
  function finish(){
    records=records.concat(results);backendSaveTrainingRecords(results);plans[childId]=genPlan(childId);saveAll();const correct=results.filter(item=>item.correct).length,passed=results.length>=level.passRule.minCompleted&&correct/results.length>=level.passRule.minAccuracy;
    if(typeof recordRubricReward==='function')recordRubricReward(childId,level.levelId,results);
    body.innerHTML='<div class="train-summary curriculum-final-summary"><div class="big">'+correct+' / '+results.length+'</div><h2>'+(passed?'闯关成功！ 🎉':'再试一次也很棒 🌱')+'</h2><p>'+(passed?'下一关已经打开。':'这一关还在等你，慢慢来。')+'</p><button class="btn-primary" id="finishCurriculum">'+(passed?'去看新关卡':'回到地图')+'</button></div>';$('#finishCurriculum').onclick=leaveRun;
  }
  render();
}

const curriculumPriorRenderTrain=renderTrain;
renderTrain=function(c){
  if(currentRole!=='child'){curriculumPriorRenderTrain(c);return;}
  c.classList.remove('interest-choice-pending');
  const profile=getCurrentAbilityProfile(activeChild);if(!profile){c.innerHTML='<div class="empty">先完成彩虹岛小游戏 🌈</div>';return;}
  const curriculum=curriculumFor(activeChild),levels=curriculum.levels,passed=levels.filter(level=>getCurriculumLevelState(activeChild,level.levelId).passed).length,interestId=curriculumSelectedInterest(activeChild);
  c.innerHTML='<div class="adventure-header curriculum-header"><div><span>🏝️ 我的彩虹冒险</span><h2>20 关 · 每关 5 个小游戏</h2></div><button class="curriculum-preference-button" id="openCurriculumPrefs">🔁 不想玩哪些？</button><div class="adventure-score"><b>'+passed+'</b><small>/ '+levels.length+'</small></div></div><div class="adventure-progress"><i style="width:'+Math.round(passed/levels.length*100)+'%"></i></div><div class="adventure-path">'+levels.map((level,index)=>{const state=getCurriculumLevelState(activeChild,level.levelId),status=curriculumLevelStatus(activeChild,level),matched=interestId&&curriculumInterestMatches(level,interestId);return '<div class="level-row '+(index%2?'right':'left')+'"><div class="path-line"></div><button class="level-node '+status+(matched?' interest-match':'')+'" data-curriculum-level="'+level.levelId+'" '+(status==='locked'?'disabled':'')+'><span class="level-icon">'+(state.passed?'⭐':status==='retry'?'🌱':status==='current'?'🎮':'🔒')+'</span><b>'+esc(level.title)+'</b><small>第 '+level.order+' 关 · '+level.activities.length+' 个小游戏</small></button></div>';}).join('')+'</div>';
  $('#openCurriculumPrefs').onclick=()=>openCurriculumPreferences(activeChild,()=>renderTrain(c));$$('[data-curriculum-level]:not([disabled])',c).forEach(button=>button.onclick=()=>openCurriculumLevel(activeChild,button.dataset.curriculumLevel));
  const daily=typeof rubricDailyChoiceByChild!=='undefined'?rubricDailyChoiceByChild[activeChild]:null;if(daily?.date===rubricTodayKey())return;
  const reward=rubricRewardSummary(activeChild),gateway=document.createElement('section');gateway.className='interest-gateway interest-daily-gateway';gateway.innerHTML='<div class="interest-gateway-head"><h2>今天想玩什么？</h2><div class="reward-wallet"><span>⭐</span><b>'+reward.points+'</b></div></div><div class="interest-choice-grid">'+RUBRIC_INTEREST_CHANNELS.map(item=>'<button data-curriculum-interest="'+item.id+'"><span>'+item.emoji+'</span><b>'+item.childLabel+'</b></button>').join('')+'</div><button class="interest-skip" id="skipCurriculumInterest">直接开始</button>';c.querySelector('.adventure-header').before(gateway);c.classList.add('interest-choice-pending');
  const choose=id=>{if(id)recordRubricInterest(activeChild,id);saveRubricDailyChoice(activeChild,id||null);renderTrain(c);};$$('[data-curriculum-interest]',gateway).forEach(button=>button.onclick=()=>choose(button.dataset.curriculumInterest));$('#skipCurriculumInterest').onclick=()=>choose(null);
};
