/* ============ 已审核档案画像题目执行器 ============ */
const agentQuestionCache=new Map();
const priorAgentOpenTrainer=openTrainer;

async function fetchAgentQuestionSet(childId){
  if(!BACKEND_API.available)return null;
  try{
    const result=await backendRequest('/api/personalized/questions?child_id='+encodeURIComponent(childId));
    const set=result?.questionSet||null;agentQuestionCache.set(childId,set);return set;
  }catch(error){console.warn('个性化题目读取失败：',error.message);return null;}
}

openTrainer=async function(childId,moduleId,difficulty,onDone){
  // 旧三类训练保持原逻辑；22模块优先使用专业审核后的Agent题目。
  if(!TRAINING_CATALOG.some(item=>item.id===moduleId))return priorAgentOpenTrainer(childId,moduleId,difficulty,onDone);
  const gate=trainingGate(childId,moduleId);if(!gate.ok){showTrainingGate(gate,childId);return;}
  const set=agentQuestionCache.has(childId)?agentQuestionCache.get(childId):await fetchAgentQuestionSet(childId);
  const questions=(set?.questions||[]).filter(item=>item.moduleId===moduleId);
  if(!questions.length)return priorAgentOpenTrainer(childId,moduleId,difficulty,onDone);
  openAgentQuestionTrainer(childId,moduleId,questions,onDone);
};

function openAgentQuestionTrainer(childId,moduleId,questions,onDone){
  const child=children.find(item=>item.id===childId),module=TRAINING_CATALOG.find(item=>item.id===moduleId),sheet=$('#trainSheet');
  let index=0,promptCount=0,shownAt=0,results=[];
  sheet.innerHTML='<h3>'+esc(child?.name||'儿童')+' · '+esc(module?.name||'个性化训练')+'<button class="x" id="closeAgentTrain">×</button></h3><div class="agent-training-source">🧠 根据已审核档案画像生成 · 随表现继续调整</div><div id="agentTrainBody"></div>';
  $('#trainMask').classList.remove('hidden');$('#closeAgentTrain').onclick=()=>{$('#trainMask').classList.add('hidden');if(onDone)onDone();};
  const body=$('#agentTrainBody');
  function render(){
    if(index>=questions.length){finish();return;}
    const q=questions[index];promptCount=0;shownAt=performance.now();
    body.innerHTML='<div class="agent-question-progress"><i style="width:'+((index/questions.length)*100)+'%"></i></div><div class="agent-question-card"><span class="agent-question-icon">'+esc(q.targetCue||'🎮')+'</span><h2>'+esc(q.prompt)+'</h2><div class="agent-choice-grid count-'+q.choices.length+'">'+q.choices.map((choice,choiceIndex)=>'<button data-agent-choice="'+choiceIndex+'">'+esc(choice)+'</button>').join('')+'</div><div class="agent-question-tools"><button id="repeatAgentPrompt">🔊 再听一遍</button><button id="hintAgentQuestion">💡 给我提示</button></div><p>'+esc(q.parameters?.prompt||'按需提示')+' · 难度 '+q.difficulty+'</p></div>';
    $$('[data-agent-choice]',body).forEach(button=>button.onclick=()=>answer(q,+button.dataset.agentChoice));
    $('#repeatAgentPrompt').onclick=()=>{promptCount++;if(typeof speakBaseline==='function')speakBaseline(q.prompt);};
    $('#hintAgentQuestion').onclick=()=>{promptCount++;const targetIndex=q.choices.indexOf(q.target),target=$$('[data-agent-choice]',body)[targetIndex];if(target)target.classList.add('gentle-hint');};
    if(settings.audio&&typeof speakBaseline==='function')speakBaseline(q.prompt);
  }
  function answer(q,choiceIndex){
    $$('[data-agent-choice]',body).forEach(button=>button.disabled=true);
    const correct=q.choices[choiceIndex]===q.target,reactionMs=Math.round(performance.now()-shownAt);
    results.push({id:uid(),childId,module:module?.engine||'attention',moduleId,domain:q.domain,difficulty:q.difficulty,correct,firstCorrect:correct,promptLevel:promptCount,reactionMs,errorType:correct?'':'agent_choice_error',completed:true,source:'profile-agent',questionId:q.questionId,ts:Date.now()});
    body.innerHTML='<div class="agent-answer-celebration '+(correct?'ok':'try')+'"><div>'+(correct?'🌟🎉':'🌱💛')+'</div><h2>'+(correct?esc(q.encouragement):esc(q.errorFeedback))+'</h2><p>'+(correct?'你完成了一个小目标！':'每一次尝试都在帮助我们找到更适合你的练习。')+'</p><button class="btn-primary" id="nextAgentQuestion">'+(index+1>=questions.length?'看看结果':'继续下一题')+'</button></div>';
    if(typeof beep==='function')beep(correct);$('#nextAgentQuestion').onclick=()=>{index++;render();};
  }
  function finish(){
    records=records.concat(results);plans[childId]=genPlan(childId);saveAll();
    const correct=results.filter(item=>item.correct).length;
    body.innerHTML='<div class="train-summary"><div class="big" style="color:var(--green)">'+correct+' / '+results.length+'</div><h2>训练完成啦 🌈</h2><p>系统已经记录正确率、反应时间和提示使用情况，下一轮会继续调整。</p><button class="btn-primary" id="finishAgentTrain">完成并保存</button></div>';
    $('#finishAgentTrain').onclick=()=>{$('#trainMask').classList.add('hidden');toast('表现已记录，画像将随训练继续更新');if(onDone)onDone();};
  }
  render();
}
