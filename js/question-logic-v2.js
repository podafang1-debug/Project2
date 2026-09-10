/* 题目逻辑 v2：统一题型、难度、计分单位与儿童入口。 */
const qChoice=(prompt,target,choices,cue='')=>({mode:'choice',prompt,target,choices,cue});
const qMemory=(prompt,preview,target,choices)=>({mode:'memory',prompt,preview,target,choices});
const qAudio=(spokenPrompt,target,choices)=>({mode:'audio',prompt:'听一听，选一选',spokenPrompt,target,choices});
const qObserved=(mode,prompt,cue='')=>({mode,prompt,cue,target:'自己完成',choices:['自己完成','帮助后完成','还没完成']});

const MODULE_ACTIVITY_BANK={
  P01:[qChoice('点红色','🔴',['🔴','🟡','🔵','🟢']),qChoice('点蓝色','🔵',['🟠','🟢','🔵','🟣']),qChoice('点黄色','🟡',['🟡','🔴','🟢','🔵'])],
  P02:[qChoice('点圆形','●',['●','■','▲','★']),qChoice('点三角形','▲',['◆','▲','●','■']),qChoice('点正方形','■',['●','★','■','▲'])],
  P03:[qChoice('找不一样','⭐',['🌙','🌙','⭐','🌙']),qChoice('找不一样','🍎',['🍐','🍐','🍐','🍎']),qChoice('找不一样','🐶',['🐱','🐶','🐱','🐱'])],
  P04:[qAudio('请点小狗','🐶',['🐶','🐱','🐰','🐼']),qAudio('请点小鸟','🐦',['🐟','🐦','🐢','🐸']),qAudio('请点汽车','🚗',['🚲','🚌','🚗','✈️'])],
  M01:[qChoice('哪个和牙刷一起用？','🪥膏',['🪥膏','👟','🚗','🎈'],'🪥'),qChoice('哪个和鞋子一起穿？','🧦',['🧦','🥄','🧸','🍎'],'👟'),qChoice('哪个和雨天最有关系？','☂️',['☂️','🪥','⚽','📕'],'🌧️')],
  M02:[qMemory('刚才看到哪个？',['🍓'],'🍓',['🍓','🚗','🌙','🧸']),qMemory('刚才看到哪个？',['🚲'],'🚲',['🐶','🚲','🍌','⭐']),qMemory('刚才看到哪个？',['🌻'],'🌻',['🌻','🍎','🚌','🐟'])],
  M03:[qMemory('选出刚才的顺序',['☀️','🌙'],'☀️🌙',['☀️🌙','🌙☀️','⭐☀️','🌙⭐']),qMemory('选出刚才的顺序',['🍎','🚗'],'🍎🚗',['🚗🍎','🍎🚗','🍌🚲','🚗🍌']),qMemory('选出刚才的顺序',['🐶','🐟','⭐'],'🐶🐟⭐',['🐟🐶⭐','🐶🐟⭐','⭐🐟🐶','🐶⭐🐟'])],
  M04:[qMemory('刚才最后一个是谁？',['🐟','🐸','🦋'],'🦋',['🦋','🐟','🐸','🐰']),qMemory('刚才第一个是谁？',['🍎','🚗','🌙'],'🍎',['🌙','🍎','🚗','⭐']),qMemory('刚才最后一个是谁？',['☀️','☁️','🌧️'],'🌧️',['☀️','🌧️','☁️','🌙'])],
  L01:[qObserved('spoken','说出它的名字','🍎'),qObserved('spoken','说出它的名字','🐶'),qObserved('spoken','说出它的名字','🚗')],
  L02:[qObserved('spoken','看图说一句话','🐱 💤'),qObserved('spoken','看图说一句话','小朋友 ⚽'),qObserved('spoken','看图说一句话','妈妈 🍎')],
  L03:[qAudio('请点会飞的动物','🐦',['🐦','🐟','🐢','🐶']),qAudio('先点水果','🍎',['🚗','🍎','👟','🐶']),qAudio('请点能喝的东西','🥛',['🥛','🧦','⚽','📕'])],
  L04:[qChoice('口渴了，选哪个？','💧',['💧','🧸','👟','🚗']),qChoice('想休息，选哪个？','🛏️',['⚽','🛏️','🍎','🚲']),qChoice('想上厕所，选哪个？','🚻',['🚻','🎨','🎈','📕'])],
  E01:[qChoice('下雨出门带什么？','☂️',['☂️','🧢','🪥','🥄']),qChoice('肚子饿了怎么办？','🍚',['⚽','🍚','🛏️','🎨']),qChoice('天冷了穿什么？','🧥',['🧥','🩳','泳圈','扇子'])],
  E02:[qChoice('哪个不是水果？','🚗',['🍎','🍌','🚗','🍓']),qChoice('哪个不是动物？','📕',['🐶','🐱','📕','🐟']),qChoice('哪个不是衣服？','🥄',['👕','🧦','🥄','👖'])],
  E03:[qChoice('哪一组有两个？','🍎🍎',['🍎','🍎🍎','🍎🍎🍎','🍎🍎🍎🍎']),qChoice('哪一组有三个？','⭐⭐⭐',['⭐','⭐⭐','⭐⭐⭐','⭐⭐⭐⭐']),qChoice('哪边更多？','🍌🍌🍌',['🍌','🍌🍌🍌'])],
  E04:[qChoice('睡觉前先做什么？','🪥',['🪥','⚽','🎨','🚲']),qChoice('洗手第一步是什么？','🚰',['擦手','🚰','关灯','穿鞋']),qChoice('出门前先做什么？','👟',['睡觉','👟','洗澡','吃糖'])],
  S01:[qChoice('收到礼物是什么心情？','😊',['😊','😢','😠','😴']),qChoice('玩具坏了是什么心情？','😢',['😊','😢','😴','😮']),qChoice('被抢玩具是什么心情？','😠',['😊','😠','😴','😄'])],
  S02:[qObserved('guided','和大人轮流拍手三次','👏 ↔️ 👏'),qObserved('guided','等大人说“轮到你”再点这里','⏳'),qObserved('guided','和大人一起看同一个东西','🧑 👉 ⭐')],
  S03:[qChoice('想一起玩，可以怎么做？','🙋',['🙋','💢','🏃','🙅']),qChoice('别人说你好，可以怎么做？','👋',['👋','🙈','💢','🏃']),qChoice('轮到别人时，可以怎么做？','⏳',['抢走','⏳','离开','大叫'])],
  D01:[qChoice('洗手第一步是什么？','🚰',['🚰','擦干','关灯','看电视']),qChoice('穿衣第一步是什么？','👕',['👕','穿鞋','出门','睡觉']),qChoice('吃饭前先做什么？','洗手',['洗手','看电视','穿鞋','画画'])],
  D02:[qChoice('轻轻点小星星','⭐',['🌙','⭐','☁️','☀️']),qChoice('轻轻点小花','🌼',['🌼','🍎','🚗','🐟']),qChoice('轻轻点小球','⚽',['🎈','⚽','📕','🧸'])],
  D03:[qObserved('guided','跟着节奏拍手','👏  👏  👏'),qObserved('guided','跟着做：举手、放下','🙌  ⬇️'),qObserved('guided','跟着做：拍手、举手、拍手','👏 🙌 👏')]
};

function shuffledQuestionChoices(question,difficulty){
  const source=[...question.choices],target=question.target;
  for(let i=source.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[source[i],source[j]]=[source[j],source[i]];}
  if(question.mode==='spoken'||question.mode==='guided')return source;
  const wanted=difficulty<=1?2:difficulty===2?3:source.length;
  let selected=source.slice(0,Math.min(wanted,source.length));
  if(!selected.includes(target)){const wrong=selected.findIndex(item=>item!==target);selected[wrong<0?selected.length-1:wrong]=target;}
  for(let i=selected.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[selected[i],selected[j]]=[selected[j],selected[i]];}
  return selected;
}

function moduleDifficultyFor(childId,moduleId){
  const module=TRAINING_CATALOG.find(item=>item.id===moduleId),recent=records.filter(item=>item.childId===childId&&item.moduleId===moduleId&&item.source!=='baseline-game').sort((a,b)=>(a.ts||0)-(b.ts||0)).slice(-6);
  if(!module)return 2;
  const signed=typeof effectiveClinicalPlan==='function'?effectiveClinicalPlan(childId):null,planned=signed?.rows?.find(item=>item.moduleId===moduleId)?.difficulty;
  if(Number.isFinite(+planned))return clamp(+planned,1,5);
  const reviewed=typeof currentPlanReview==='function'?currentPlanReview(childId):null,reviewedDifficulty=reviewed?.status==='effective'?plans[childId]?.moduleDifficulty?.[moduleId]:null;
  if(Number.isFinite(+reviewedDifficulty))return clamp(+reviewedDifficulty,1,5);
  if(!recent.length){const profile=getCurrentAbilityProfile(childId),score=profile?.scores?.[module.domain]??50;return clamp(Math.ceil(score/22),1,4);}
  const weighted=recent.reduce((sum,item)=>sum+(item.firstCorrect?1:item.correct?.65:0),0)/recent.length;
  const current=recent.at(-1)?.difficulty||2;
  return clamp(current+(recent.length>=3&&weighted>=.8?1:recent.length>=3&&weighted<.45?-1:0),1,5);
}

const questionLogicGenPlan=genPlan;
genPlan=function(childId){
  const plan=questionLogicGenPlan(childId);
  plan.moduleDifficulty={};plan.domainStats={};
  TRAINING_CATALOG.forEach(module=>{plan.moduleDifficulty[module.id]=moduleDifficultyFor(childId,module.id);});
  Object.keys(ABILITY_DOMAINS).forEach(domain=>{const list=records.filter(item=>item.childId===childId&&item.domain===domain&&item.source!=='baseline-game').sort((a,b)=>(a.ts||0)-(b.ts||0)).slice(-18);const independent=list.filter(item=>item.firstCorrect).length;plan.domainStats[domain]={attempts:list.length,independentRate:list.length?Math.round(independent/list.length*100):null};});
  return plan;
};

function speakQuestion(text,onDone){
  if(!settings.audio||!('speechSynthesis' in window)){onDone?.();return;}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.rate=settings.speechRate??.82;utterance.volume=settings.volume??.3;utterance.pitch=1.08;
  let finished=false;const done=()=>{if(finished)return;finished=true;onDone?.();};utterance.onend=done;utterance.onerror=done;speechSynthesis.speak(utterance);setTimeout(done,7000);
}

function localQuestionsFor(moduleId){
  const module=TRAINING_CATALOG.find(item=>item.id===moduleId);
  return (MODULE_ACTIVITY_BANK[moduleId]||[]).map((item,index)=>({...item,questionId:'LOCAL-'+moduleId+'-'+(index+1),moduleId,moduleName:module?.name||moduleId,domain:module?.domain||'A',encouragement:'做到了！',errorFeedback:'慢慢来，再练一练'}));
}

const questionLogicPriorOpenTrainer=openTrainer;
openTrainer=async function(childId,moduleId,difficulty,onDone){
  if(!MODULE_ACTIVITY_BANK[moduleId])return questionLogicPriorOpenTrainer(childId,moduleId,difficulty,onDone);
  const gate=trainingGate(childId,moduleId);if(!gate.ok){showTrainingGate(gate,childId);return;}
  let remote=[];try{const set=agentQuestionCache.has(childId)?agentQuestionCache.get(childId):await fetchAgentQuestionSet(childId);remote=(set?.questions||[]).filter(item=>item.moduleId===moduleId);}catch(_error){}
  const local=localQuestionsFor(moduleId),mode=local[0]?.mode||'choice';
  remote=remote.map(item=>({...item,mode:item.mode||mode,preview:item.preview||null,cue:item.cue||item.targetCue||''}));
  const unique=[...remote,...local].filter((item,index,list)=>list.findIndex(other=>other.prompt===item.prompt&&String(other.target)===String(item.target))===index).slice(0,3);
  openUnifiedQuestionTrainer(childId,moduleId,unique,moduleDifficultyFor(childId,moduleId),onDone);
};

function openUnifiedQuestionTrainer(childId,moduleId,questions,startDifficulty,onDone){
  const child=children.find(item=>item.id===childId),module=TRAINING_CATALOG.find(item=>item.id===moduleId),sheet=$('#trainSheet');
  let index=0,results=[],correctStreak=0,wrongStreak=0,difficulty=startDifficulty;
  sheet.innerHTML='<h3>'+esc(child?.name||'儿童')+' · '+esc(module?.name||'训练')+'<button class="x" id="closeUnifiedTrain">×</button></h3><div class="agent-training-source">每轮 3 个小任务 · 难度会慢慢变化</div><div id="unifiedQuestionBody"></div>';
  $('#trainMask').classList.remove('hidden');$('#closeUnifiedTrain').onclick=()=>{$('#trainMask').classList.add('hidden');if(onDone)onDone();};
  const body=$('#unifiedQuestionBody');
  function updateDifficulty(correct){if(correct){correctStreak++;wrongStreak=0;if(correctStreak>=2){difficulty=clamp(difficulty+1,1,5);correctStreak=0;}}else{wrongStreak++;correctStreak=0;if(wrongStreak>=2){difficulty=clamp(difficulty-1,1,5);wrongStreak=0;}}}
  function render(){
    if(index>=questions.length){finish();return;}
    const q=questions[index],choices=shuffledQuestionChoices(q,difficulty);let repeatCount=0,hintCount=0,startedAt=0,pausedMs=0,pauseAt=0;
    const visiblePrompt=q.mode==='audio'?'听一听，选一选':q.prompt;
    body.innerHTML='<div class="agent-question-progress"><i style="width:'+Math.round(index/questions.length*100)+'%"></i></div><div class="agent-question-card"><span class="agent-question-icon">'+esc(q.cue||q.targetCue||'🎮')+'</span><h2>'+esc(visiblePrompt)+'</h2>'+(q.preview?'<div class="memory-preview" id="unifiedPreview">'+q.preview.join('　')+'</div>':'')+'<div class="agent-choice-grid count-'+choices.length+' hidden" id="unifiedChoices">'+choices.map((choice,choiceIndex)=>'<button data-agent-choice="'+choiceIndex+'">'+esc(choice)+'</button>').join('')+'</div><div class="agent-question-tools"><button id="repeatUnifiedPrompt">🔊 再听一遍</button>'+(q.mode==='spoken'||q.mode==='guided'?'':'<button id="hintUnifiedQuestion">💡 给我一点提示</button>')+'</div><p id="unifiedSupportNote"></p></div>';
    const choiceBox=$('#unifiedChoices'),buttons=()=>$$('[data-agent-choice]',body);
    let enabled=false;const enable=()=>{if(enabled)return;enabled=true;choiceBox.classList.remove('hidden');buttons().forEach(button=>button.disabled=false);startedAt=performance.now();buttons().forEach(button=>button.onclick=()=>answer(q,choices[+button.dataset.agentChoice],repeatCount,hintCount,Math.max(0,Math.round(performance.now()-startedAt-pausedMs))));};
    const present=()=>{enable();speakQuestion(q.spokenPrompt||q.prompt);};
    if(q.preview)setTimeout(()=>{if(!$('#unifiedPreview'))return;$('#unifiedPreview').classList.add('hidden');present();},1800);else present();
    $('#repeatUnifiedPrompt').onclick=()=>{repeatCount++;pauseAt=performance.now();buttons().forEach(button=>button.disabled=true);speakQuestion(q.spokenPrompt||q.prompt,()=>{pausedMs+=performance.now()-pauseAt;buttons().forEach(button=>button.disabled=false);});$('#unifiedSupportNote').textContent='又听了一遍';};
    if($('#hintUnifiedQuestion'))$('#hintUnifiedQuestion').onclick=()=>{hintCount++;const wrong=buttons().find(button=>choices[+button.dataset.agentChoice]!==q.target&&!button.disabled);if(wrong)wrong.disabled=true;$('#unifiedSupportNote').textContent='少了一个不合适的选项';};
  }
  function answer(q,picked,repeatCount,hintCount,reactionMs){
    $$('[data-agent-choice]',body).forEach(button=>button.disabled=true);const independent=picked===q.target,completed=picked!=='还没完成',correct=q.mode==='spoken'||q.mode==='guided'?completed:independent;const supportOutcome=picked==='帮助后完成'?'supported':picked==='还没完成'?'not-completed':'independent';const promptLevel=hintCount?2:repeatCount?1:supportOutcome==='supported'?2:0;
    results.push({id:uid(),childId,module:module.engine,moduleId,domain:module.domain,difficulty,correct,firstCorrect:correct&&promptLevel===0,supportOutcome,repeatCount,hintCount,promptLevel,reactionMs,errorType:correct?'':q.mode==='spoken'?'spoken_support_needed':q.mode==='guided'?'guided_support_needed':'choice_error',completed,source:'unified-question-v2',questionId:q.questionId,ts:Date.now()});
    updateDifficulty(correct&&promptLevel===0);body.innerHTML='<div class="agent-answer-celebration '+(correct?'ok':'try')+'"><div>'+(correct?'🌟':'🌱')+'</div><h2>'+(correct?'完成啦！':'没关系')+'</h2><p>'+(correct?(promptLevel?'有一点帮助也很好。':'你自己完成了。'):'下次再试一试。')+'</p><button class="btn-primary" id="nextUnifiedQuestion">'+(index+1>=questions.length?'看看结果':'下一题')+'</button></div>';$('#nextUnifiedQuestion').onclick=()=>{index++;render();};
  }
  function finish(){records=records.concat(results);backendSaveTrainingRecords(results);plans[childId]=genPlan(childId);saveAll();const independent=results.filter(item=>item.firstCorrect).length;body.innerHTML='<div class="train-summary"><div class="big" style="color:var(--green)">'+independent+' / '+results.length+'</div><h2>完成啦 🌈</h2><p>上面是独立完成数，需要帮助的题也已经单独记录。</p><button class="btn-primary" id="finishUnifiedTrain">完成并保存</button></div>';$('#finishUnifiedTrain').onclick=()=>{$('#trainMask').classList.add('hidden');if(onDone)onDone();};}
  render();
}

function scoreBaselineDomainV2(list){
  if(!list.length)return 0;
  const points=list.reduce((sum,item)=>sum+(!item.correct?0:item.supportOutcome==='supported'?.5:item.hintCount?.55:item.repeatCount?.8:1),0);
  return Math.round(points/list.length*100);
}

// 原来的动作模仿只有一个“完成”按钮，会天然得到满分；改为记录独立、协助和未完成。
const originalActionGame=BASELINE_GAMES.find(item=>item.title==='动作模仿');
if(originalActionGame)Object.assign(originalActionGame,{target:'自己完成',choices:['自己完成','帮助后完成','还没完成'],responseMode:'observed'});
// 每个能力域增加一个独立探查题，降低三题偶然性的影响。
if(BASELINE_GAMES.length===18)BASELINE_GAMES.push(
  {domain:'A',construct:'大小辨别',basis:['平台内置'],title:'大小眼力',emoji:'👀',prompt:'请点最大的圆',target:'●',choices:['·','•','●'],encourage:'你认真比较了大小！'},
  {domain:'B',construct:'位置记忆',basis:['平台内置'],title:'位置记忆',emoji:'🧠',prompt:'刚才看到哪个？',preview:['🏠'],target:'🏠',choices:['🏠','🚗','🌳'],encourage:'你记住了！'},
  {domain:'C',construct:'简单因果',basis:['平台内置'],title:'想一想',emoji:'🧩',prompt:'杯子倒了会怎么样？',target:'💧',choices:['💧','☀️','🎈'],encourage:'你想到了结果！'},
  {domain:'D',construct:'词义理解',basis:['平台内置'],title:'听懂词语',emoji:'💬',prompt:'请点可以喝的东西',target:'🥛',choices:['🥛','👟','⚽'],encourage:'你听懂了！'},
  {domain:'E',construct:'情境回应',basis:['平台内置'],title:'友好回应',emoji:'😊',prompt:'朋友帮助了我，可以怎么做？',target:'谢谢',choices:['谢谢','抢走','离开'],encourage:'你选择了友好的回应！'},
  {domain:'F',construct:'动作完成观察',basis:['平台内置','行为观察'],title:'动作挑战',emoji:'👐',prompt:'跟着做：拍手、举手',target:'自己完成',choices:['自己完成','帮助后完成','还没完成'],responseMode:'observed',encourage:'谢谢你完成动作！'}
);

const questionLogicProfessionalRenderTrain=renderTrain;
renderTrain=function(c){
  if(currentRole!=='child'){questionLogicProfessionalRenderTrain(c);return;}
  const profile=getCurrentAbilityProfile(activeChild);if(!profile){c.innerHTML='<div class="empty">先完成彩虹岛小游戏 🌈</div>';return;}
  const levels=childAdventureOrder(profile),states=levels.map(level=>getLevelState(activeChild,level.id)),passedCount=states.filter(state=>state.passed).length;
  let firstOpen=states.findIndex(state=>!state.passed);if(firstOpen<0)firstOpen=states.length;
  let html='<div class="adventure-header"><div><h2>选一关玩吧</h2><p>通过当前关后，下一关才会解锁。</p></div><div class="adventure-score"><b>'+passedCount+'</b><small>/ '+levels.length+'</small></div></div><div class="adventure-progress"><i style="width:'+Math.round(passedCount/levels.length*100)+'%"></i></div><div class="adventure-path">';let lastDomain='';
  levels.forEach((level,index)=>{const state=states[index],isCurrent=index===firstOpen,isRetry=isCurrent&&state.attempts>0&&!state.passed,isLocked=index>firstOpen,status=state.passed?'passed':isRetry?'retry':isCurrent?'current':'locked';if(level.domain!==lastDomain){const domain=ABILITY_DOMAINS[level.domain];html+='<div class="island-marker" style="--island-color:'+domain.color+'"><span>'+({A:'👀',B:'🧠',C:'🧩',D:'💬',E:'😊',F:'👐'}[level.domain])+'</span><div><b>'+domain.name+'</b></div></div>';lastDomain=level.domain;}html+='<div class="level-row '+(index%2?'right':'left')+'"><div class="path-line"></div><button class="level-node '+status+'" data-level="'+level.id+'" '+(isLocked?'disabled':'')+'><span class="level-icon">'+(state.passed?'⭐':isRetry?'🌱':isCurrent?'🎮':'🔒')+'</span><b>'+level.name+'</b><small>'+(state.passed?'已通过':isRetry?'再试一次':isCurrent?'开始':'通过前一关后解锁')+'</small></button></div>';});
  c.innerHTML=html+'</div>';
  $$('[data-level]:not([disabled])',c).forEach(button=>button.onclick=()=>openTrainer(activeChild,button.dataset.level,moduleDifficultyFor(activeChild,button.dataset.level),()=>renderTrain(c)));
};
