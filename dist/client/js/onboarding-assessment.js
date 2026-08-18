/* ============ 儿童首次进入：原创游戏化训练起点评估 ============ */
/**
 * 设计边界：本流程只生成“平台训练起点画像”，不是Gesell、WISC、Vineland、
 * VB-MAPP、PEP-3、CARS等标准化量表，也不输出诊断、智商或临床严重度。
 * 正式量表必须由有资质的专业人员按授权版本施测，再通过专业端录入结果。
 */
const BASELINE_VERSION='platform-baseline-v1';
const BASELINE_GAMES=[
  {domain:'A',construct:'视觉辨别',basis:['发育/智力评估','平台内置'],title:'找找小动物',emoji:'🔍',prompt:'请找到和目标一样的小动物',targetCue:'🐶',target:'🐶',choices:['🐱','🐶','🐰','🐼'],encourage:'你认真看到了每一个小动物！'},
  {domain:'A',construct:'颜色辨别',basis:['发育/智力评估'],title:'颜色小侦探',emoji:'🌈',prompt:'请点出红色的东西',target:'🍎',choices:['🥦','🍎','🫐','🍌'],encourage:'观察得真仔细！'},
  {domain:'A',construct:'视觉搜索与反应效率',basis:['发育/智力评估','行为观察'],title:'谁不一样',emoji:'👀',prompt:'请找到不一样的一个',target:'⭐',choices:['🌙','🌙','⭐'],allowDuplicateChoices:true,encourage:'你的小眼睛发现了不同！'},
  {domain:'B',construct:'视觉再认',basis:['发育/智力评估','平台内置'],title:'记忆宝盒',emoji:'🎁',prompt:'刚才出现的是哪一组？',preview:['🍓','🚗'],target:'🍓🚗',choices:['🍓🚗','🚗🌙','🍌🚲'],encourage:'记忆宝盒被你打开啦！'},
  {domain:'B',construct:'序列记忆',basis:['发育/智力评估'],title:'顺序小火车',emoji:'🚂',prompt:'请找到刚才的顺序',preview:['🌞','🌳','🏠'],target:'🌞🌳🏠',choices:['🏠🌳🌞','🌞🌳🏠','🌳🌞🏠'],encourage:'小火车顺利到站！'},
  {domain:'B',construct:'工作记忆',basis:['发育/智力评估','语言/沟通'],title:'记住最后一个',emoji:'🧠',prompt:'刚才最后出现的是谁？',preview:['🐟','🐸','🦋'],target:'🦋',choices:['🐸','🦋','🐟'],encourage:'你把最后一个朋友记住了！'},
  {domain:'C',construct:'生活顺序推理',basis:['适应行为','平台内置'],title:'生活排序',emoji:'🧩',prompt:'准备睡觉前，接下来做什么更合适？',scene:'🛏️🌙',target:'🪥',choices:['⚽','🪥','🎨'],encourage:'你找到了合适的下一步！'},
  {domain:'C',construct:'分类推理',basis:['发育/智力评估'],title:'分类小能手',emoji:'🧺',prompt:'哪个和其他两个不是一类？',target:'🚗',choices:['🍎','🍌','🚗'],encourage:'分类篮整理好啦！'},
  {domain:'C',construct:'规律发现',basis:['发育/智力评估'],title:'接着排一排',emoji:'🔢',prompt:'太阳、月亮、太阳，接下来是什么？',scene:'☀️ 🌙 ☀️ ❓',target:'🌙',choices:['☀️','🌙','⭐'],encourage:'你发现了藏起来的规律！'},
  {domain:'D',construct:'语言理解',basis:['语言/沟通','孤独症相关'],title:'听懂小任务',emoji:'👂',prompt:'请点一下会飞的动物',target:'🐦',choices:['🐟','🐦','🐢'],encourage:'你听懂了小任务！'},
  {domain:'D',construct:'功能性沟通',basis:['语言/沟通','孤独症相关'],title:'需要什么呢',emoji:'💬',prompt:'口渴的时候，可以选择什么？',target:'💧',choices:['🧸','💧','👟'],encourage:'你表达了自己的需要！'},
  {domain:'D',construct:'句意理解',basis:['语言/沟通'],title:'谁在做什么',emoji:'📖',prompt:'“小猫在睡觉”，请选择对应的画面',target:'🐱💤',choices:['🐱💤','🐱⚽','🐶🍎'],encourage:'你听懂了这句话！'},
  {domain:'E',construct:'情绪识别',basis:['孤独症相关','行为观察'],title:'表情猜猜看',emoji:'😊',prompt:'朋友送你一个礼物，可能是什么心情？',target:'😊',choices:['😢','😊','😠'],encourage:'你发现了表情里的心情！'},
  {domain:'E',construct:'社交回应',basis:['孤独症相关'],title:'轮到谁啦',emoji:'🤝',prompt:'小朋友正在玩球，我想一起玩，可以怎么做？',target:'🙋',choices:['💢','🙋','🏃'],encourage:'你选择了友好的方式！'},
  {domain:'E',construct:'共同注意',basis:['孤独症相关','行为观察'],title:'一起看哪里',emoji:'👉',prompt:'朋友指着天空说“看！”，我们可以看哪里？',scene:'🧒👉☁️',target:'☁️',choices:['👟','☁️','🍽️'],encourage:'你和朋友一起发现了天空！'},
  {domain:'F',construct:'生活工具使用',basis:['适应行为'],title:'生活百宝箱',emoji:'🎒',prompt:'刷牙的时候需要哪一样？',target:'🪥',choices:['🪥','🧦','🥄'],encourage:'生活百宝箱准备好了！'},
  {domain:'F',construct:'动作模仿与完成',basis:['适应行为','平台内置'],title:'动作模仿',emoji:'🕺',prompt:'请先跟着做，再点“我完成了”',scene:'👏 🙌 👏',target:'✅',choices:['✅'],encourage:'动作挑战完成！'},
  {domain:'F',construct:'生活步骤',basis:['适应行为'],title:'穿衣小帮手',emoji:'👕',prompt:'准备出门，应该先穿哪一样？',scene:'🚪🌤️',target:'👕',choices:['🛏️','👕','🛁'],encourage:'你准备好出门啦！'}
];

function getBaselineRecord(childId){return enhancedState.assessments.find(x=>x.childId===childId&&x.scaleCode===BASELINE_VERSION&&x.status==='completed');}

const identityEnterApp=enterApp;
enterApp=function(){
  identityEnterApp();
  // 只有儿童本人首次进入时自动开始；家长和专业账号不触发儿童游戏界面。
  if(currentRole==='child'&&activeChild&&!getBaselineRecord(activeChild))setTimeout(()=>startBaselineJourney(activeChild),120);
};

function startBaselineJourney(childId){
  if($('#baselineJourney'))return;
  const root=document.createElement('div');root.id='baselineJourney';root.className='baseline-journey';
  root.innerHTML='<div class="journey-card"><div class="journey-welcome"><div class="journey-mascot">🦊✨</div><span class="journey-kicker">第一次见面</span><h1>一起去彩虹岛玩游戏吧！</h1><p>这里没有考试，也不会扣分。不会的时候可以听一遍、看提示或休息一下。</p><div class="journey-rules"><span>🎮 '+BASELINE_GAMES.length+'个小游戏</span><span>💛 温和提示</span><span>⏸️ 随时休息</span></div><button class="journey-primary" id="journeyStart">开始探险 🚀</button><button class="journey-link" id="journeyPause">稍后再玩</button><small>结果仅用于安排训练起点，不是医学诊断或标准化量表分数。</small></div><div class="journey-play hidden" id="journeyPlay"></div></div>';
  document.body.appendChild(root);$('#journeyStart').onclick=()=>runBaselineGames(root,childId);$('#journeyPause').onclick=()=>root.remove();
}

function runBaselineGames(root,childId){
  let index=0,streak=0;const answers=[];let promptCount=0;let shownAt=performance.now();
  const celebrationSets=[['⭐','✨','🌈','🎈','💛'],['🎉','🌟','🫧','🦋','🍀'],['🚀','⭐','☀️','🎵','💫']];
  const play=$('#journeyPlay',root);root.querySelector('.journey-welcome').classList.add('hidden');play.classList.remove('hidden');
  const render=()=>{
    const game=BASELINE_GAMES[index];promptCount=0;shownAt=performance.now();
    play.innerHTML='<div class="journey-top"><button class="journey-icon-btn" id="journeyExit" aria-label="暂停">⏸️</button><div class="journey-progress"><i style="width:'+Math.round(index/BASELINE_GAMES.length*100)+'%"></i></div><span>'+ (index+1)+' / '+BASELINE_GAMES.length+'</span></div>'+
      '<div class="game-domain" style="--domain-color:'+ABILITY_DOMAINS[game.domain].color+'">'+game.emoji+' '+game.title+'</div>'+
      '<div class="game-scene">'+(game.scene||'')+'</div><h2>'+game.prompt+'</h2>'+
      (game.targetCue?'<div class="target-cue"><small>要找的是</small><span>'+game.targetCue+'</span></div>':'')+
      (game.preview?'<div class="memory-preview" id="memoryPreview">'+game.preview.join('　')+'</div><div class="memory-ready hidden" id="memoryReady">🙈 记住了吗？请选择答案</div>':'')+
      '<div class="emoji-choices '+(game.preview?'hidden':'')+'" id="emojiChoices">'+game.choices.map((choice,i)=>'<button data-choice="'+i+'"><span>'+choice+'</span></button>').join('')+'</div>'+
      '<div class="journey-tools"><button id="repeatPrompt">🔊 再听一遍</button><button id="showHint">💡 给我提示</button></div><div class="journey-message" id="journeyMessage"></div>';
    $('#journeyExit').onclick=()=>root.remove();
    $('#repeatPrompt').onclick=()=>{promptCount++;speakBaseline(game.prompt);};
    $('#showHint').onclick=()=>{promptCount++;const targetIndex=game.choices.indexOf(game.target);const target=$$('.emoji-choices button',play)[targetIndex];if(target)target.classList.add('gentle-hint');$('#journeyMessage').textContent='小提示来啦，慢慢看一看 👀';};
    const enableChoices=()=>{$('#emojiChoices').classList.remove('hidden');$$('.emoji-choices button',play).forEach(button=>button.onclick=()=>answer(game,+button.dataset.choice));};
    if(game.preview)setTimeout(()=>{const preview=$('#memoryPreview');if(!preview)return;preview.classList.add('hidden');$('#memoryReady').classList.remove('hidden');enableChoices();shownAt=performance.now();},1800);else enableChoices();
    speakBaseline(game.prompt);
  };
  const answer=(game,choiceIndex)=>{
    const picked=game.choices[choiceIndex],correct=picked===game.target,rt=Math.round(performance.now()-shownAt);
    answers.push({id:uid(),childId,domain:game.domain,gameTitle:game.title,construct:game.construct,basis:game.basis,correct,firstCorrect:correct,promptLevel:promptCount,responseTimeMs:rt,ts:Date.now()});
    $$('.emoji-choices button',play).forEach(b=>b.disabled=true);
    // 每题单独展示反馈场景，再进入下一题；未答对也使用成长型语言与柔和动画。
    streak=correct?streak+1:0;
    const emojis=celebrationSets[index%celebrationSets.length];
    const overlay=document.createElement('div');overlay.className='answer-celebration '+(correct?'answer-bright':'answer-gentle');
    overlay.innerHTML='<div class="emoji-burst">'+[...emojis,...emojis].map((emoji,i)=>'<i style="--burst-index:'+i+'">'+emoji+'</i>').join('')+'</div>'+
      (correct?'<div class="success-ring"><span>✓</span></div><div class="feedback-friend">🦊🎉</div><h2>答对啦，真棒！</h2><p>'+game.encourage+'</p>'+(streak>1?'<div class="streak-chip">🔥 连续答对 '+streak+' 题</div>':''):
      '<div class="feedback-friend">🦊🌱</div><h2>谢谢你认真试一试！</h2><p>这一题有一点难，没关系，我们会从更轻松的游戏开始。</p>')+
      '<button class="celebration-continue" id="celebrationContinue">'+(index===BASELINE_GAMES.length-1?'看看我的彩虹画像 🌈':'继续下一题 ➜')+'</button><small class="auto-next-note">也可以稍等一下，系统会自动继续</small>';
    play.appendChild(overlay);playBaselineAnswerSound(correct);
    let advanced=false;const advance=()=>{if(advanced)return;advanced=true;index++;if(index<BASELINE_GAMES.length)render();else finishBaselineJourney(root,childId,answers);};
    $('#celebrationContinue').onclick=advance;setTimeout(advance,2200);
  };
  render();
}

function speakBaseline(text){
  if(!settings.audio||!('speechSynthesis'in window))return;
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.rate=settings.speechRate??.82;utterance.volume=settings.volume??.3;utterance.pitch=1.08;speechSynthesis.speak(utterance);
}

/**
 * 儿童答题专用音效：正确为轻柔上行三音，未答对为低音量双音提示。
 * 音量和时长刻意保持较低，不播放突然爆发或持续高频声音；关闭语音反馈时完全静音。
 */
function playBaselineAnswerSound(correct){
  if(!settings.audio)return;
  try{
    _ac=_ac||new (window.AudioContext||window.webkitAudioContext)();
    if(_ac.state==='suspended')_ac.resume();
    const now=_ac.currentTime;
    const notes=correct?[523.25,659.25,783.99]:[392,349.23];
    notes.forEach((frequency,index)=>{
      const start=now+index*(correct?.09:.13),duration=correct?.19:.22;
      const oscillator=_ac.createOscillator(),gain=_ac.createGain();
      oscillator.type=correct?'sine':'triangle';oscillator.frequency.setValueAtTime(frequency,start);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime((correct?.075:.045)*(settings.volume??.3),start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      oscillator.connect(gain);gain.connect(_ac.destination);oscillator.start(start);oscillator.stop(start+duration+.02);
    });
  }catch(_error){/* 部分浏览器禁止自动音频时安静降级，不影响答题。 */}
}

async function finishBaselineJourney(root,childId,answers){
  const gameScores={};Object.keys(ABILITY_DOMAINS).forEach(domain=>{const list=answers.filter(x=>x.domain===domain);const accuracy=list.filter(x=>x.correct).length/list.length;const independence=1-Math.min(1,list.reduce((n,x)=>n+x.promptLevel,0)/(list.length*2));gameScores[domain]=Math.round(35+accuracy*50+independence*15);});
  // 融合平台游戏、专业人员已录入的正式评估结论与近期家庭观察；没有外部数据时自动只采用游戏证据。
  const integrated=buildIntegratedProfile(childId,gameScores,answers.length),scores=integrated.scores;
  const play=$('#journeyPlay',root);
  // 最后一题结束后立即进入画像生成状态，用温和动画承接等待，避免儿童误以为页面卡住。
  play.innerHTML='<div class="journey-generating"><div class="ai-orbit"><span>🤖</span><i>⭐</i><i>🌈</i><i>💛</i></div><h1>小助手正在整理你的游戏足迹</h1><p>每一次点击都很有用，很快就好啦……</p><div class="thinking-dots"><b></b><b></b><b></b></div></div>';
  const child=children.find(x=>x.id===childId);child.profile6=scores;child.baselineCompletedAt=new Date().toISOString();
  // 把六域画像映射回旧三维字段，保证既有AI与报表可以立即使用。
  child.baseline.attention=Math.round(scores.A);child.baseline.memory=Math.round(scores.B);child.baseline.logic=Math.round((scores.C+scores.D+scores.E+scores.F)/4);
  const assessmentId='assess_'+uid(),profileId='profile_'+uid();
  enhancedState.assessments.push({assessmentId,childId,scaleCode:BASELINE_VERSION,name:'平台原创游戏化训练起点评估',status:'completed',scores,answers,completedAt:Date.now(),disclaimer:'非标准化量表，不用于诊断'});
  answers.forEach(x=>records.push({id:x.id,childId,module:ABILITY_DOMAINS[x.domain].legacy,moduleId:'BASE-'+x.domain,domain:x.domain,difficulty:1,correct:x.correct,firstCorrect:x.firstCorrect,promptLevel:x.promptLevel,reactionMs:x.responseTimeMs,errorType:x.correct?'':'baseline_support_needed',completed:true,source:'baseline-game',ts:x.ts}));
  plans[childId]=genPlan(childId);saveAll();saveEnhanced();
  // 画像先以generating状态写库，确保即使AI叙述服务中断，六域分数也不会丢失。
  const profile=dbSaveAbilityProfile({profileId,childId,assessmentId,version:BASELINE_VERSION,scores,gameScores,evidence:integrated.evidence,weights:integrated.weights,confidence:integrated.confidence,status:'current',narrativeStatus:'generating',createdAt:Date.now(),source:'integrated-assessment'});
  const aiResult=await generateChildProfileNarrative(scores,integrated);
  profile.narrative=aiResult.text;profile.narrativeStatus='completed';profile.aiProvider=aiResult.provider;profile.aiModel=aiResult.model;profile.updatedAt=Date.now();
  const inference=dbSaveAiInference({inferenceId:'infer_'+uid(),profileId,childId,provider:aiResult.provider,model:aiResult.model,inputSummary:{scores},output:aiResult.text,safetyPolicy:'child-safe-v1',createdAt:Date.now()});saveDatabase();
  // 浏览器副本写完后再同步 SQLite；后端不可用不会阻塞儿童看到画像。
  const backendSaved=await backendSaveProfileBundle(profile,inference);
  audit('BASELINE_JOURNEY_COMPLETED',`${childId} · ${aiResult.provider}/${aiResult.model}`);
  const weak=Object.entries(scores).sort((a,b)=>a[1]-b[1])[0][0];
  play.innerHTML='<div class="journey-finish"><div class="journey-mascot">🏝️🏆</div><h1>彩虹岛探险完成！</h1><p>你完成了所有小游戏，每一次尝试都很棒。</p><div class="profile-save-confirm">✅ 彩虹画像已经安全保存至'+(backendSaved?' SQLite 数据库':'浏览器本机数据库')+'</div><div class="profile-six">'+Object.entries(ABILITY_DOMAINS).map(([key,d])=>'<div><span>'+['👀','🧠','🧩','💬','😊','👐'][Object.keys(ABILITY_DOMAINS).indexOf(key)]+'</span><b>'+d.name+'</b><i><em style="width:'+scores[key]+'%;background:'+d.color+'"></em></i><small>训练起点 '+scores[key]+'</small></div>').join('')+'</div><div class="ai-child-message"><span>🤖</span><p>'+esc(aiResult.text)+'</p></div><div class="journey-next">下一站：先玩一些 <b>'+ABILITY_DOMAINS[weak].name+'</b> 的轻松游戏。以后每次训练，路线都会跟着你的节奏慢慢调整。</div><button class="journey-primary" id="journeyDone">进入我的训练地图 🎮</button><small>画像编号：'+esc(profileId)+' · 免费本地引擎：'+esc(aiResult.model)+'<br>这是一份平台训练画像，不代表智力、诊断或临床量表结果。</small></div>';
  $('#journeyDone').onclick=()=>{root.remove();showTab('train');};
}

/* ============ 已生成画像的长期展示入口 ============ */
function getCurrentAbilityProfile(childId){return relationalDb.abilityProfiles.filter(x=>x.childId===childId&&x.status==='current').sort((a,b)=>b.createdAt-a.createdAt)[0]||null;}

/** 儿童端与专业端读取同一条profileId数据库记录，仅调整解释层级。 */
function abilityProfileCard(profile,mode){
  if(!profile)return '';
  const childMode=mode==='child';
  return '<section class="saved-profile '+(childMode?'saved-profile-child':'')+'" data-profile-id="'+profile.profileId+'"><div class="saved-profile-head"><div><span>🌈 '+(childMode?'我的彩虹画像':'平台初始能力画像')+'</span><small>生成于 '+new Date(profile.createdAt).toLocaleDateString()+'</small></div><button class="profile-detail-btn" data-profile-detail="'+profile.profileId+'">查看详情</button></div><div class="saved-profile-grid">'+
    Object.entries(ABILITY_DOMAINS).map(([key,domain],i)=>'<div><span class="profile-emoji">'+['👀','🧠','🧩','💬','😊','👐'][i]+'</span><b>'+domain.name+'</b><i><em style="width:'+profile.scores[key]+'%;background:'+domain.color+'"></em></i><small>训练起点 '+profile.scores[key]+'</small></div>').join('')+'</div><div class="saved-profile-message"><span>🤖</span><p>'+esc(profile.narrative||'你的游戏足迹已经保存，我们会按你的节奏安排下一次训练。')+'</p></div>'+
    (childMode?'<small class="profile-disclaimer">这不是考试分数，每个人都有自己的游戏路线。</small>':'<small class="profile-disclaimer">平台原创训练起点画像，不等同于标准化量表或医学诊断。画像ID：'+profile.profileId+'</small>')+'</section>';
}

function bindAbilityProfileButtons(root){$$('[data-profile-detail]',root).forEach(button=>button.onclick=()=>openAbilityProfileDetail(button.dataset.profileDetail));}

function openAbilityProfileDetail(profileId){
  const profile=relationalDb.abilityProfiles.find(x=>x.profileId===profileId);if(!profile){toast('画像记录不存在');return;}
  const inference=relationalDb.aiInferences.find(x=>x.profileId===profileId);
  $('#sheet').innerHTML='<h3>初始画像详情<button class="x" id="closeProfileDetail">×</button></h3>'+abilityProfileCard(profile,currentRole==='child'?'child':'professional')+
    '<div class="card profile-meta"><b>生成记录</b><p>画像版本：'+esc(profile.version)+'<br>数据来源：'+esc((profile.evidence||[]).map(x=>x.label).join('；')||BASELINE_GAMES.length+'个原创游戏任务')+'<br>融合置信度：'+Math.round((profile.confidence||.48)*100)+'%<br>叙述引擎：'+esc(inference?.model||profile.aiModel||'安全本地引擎')+'<br>保存位置：本机数据库 · abilityProfiles · '+esc(profile.profileId)+'<br>生成状态：已完成并保存 ✅</p></div>';
  openMask();$('#closeProfileDetail').onclick=closeMask;
}

const profileArchiveRenderer=renderArchive;
renderArchive=function(c){
  profileArchiveRenderer(c);
  $$('.child-card',c).forEach((card,index)=>{const profile=getCurrentAbilityProfile(children[index]?.id);if(!profile)return;const wrapper=document.createElement('div');wrapper.className='profile-in-archive';wrapper.innerHTML=abilityProfileCard(profile,'professional');card.appendChild(wrapper);});
  bindAbilityProfileButtons(c);
};

const profileReportRenderer=renderReport;
renderReport=function(c){
  profileReportRenderer(c);
  if(currentRole==='admin')return;
  const profile=getCurrentAbilityProfile(activeChild);if(!profile)return;
  const wrapper=document.createElement('div');wrapper.innerHTML=abilityProfileCard(profile,currentRole==='child'?'child':'professional');
  const title=c.querySelector('.sec-title');if(title)title.insertAdjacentElement('afterend',wrapper);else c.prepend(wrapper);
  bindAbilityProfileButtons(c);
};

/* ============ 儿童端：多邻国式闯关训练地图 ============ */
function getLevelState(childId,moduleId){
  const attempts=records.filter(x=>x.childId===childId&&x.moduleId===moduleId&&x.source!=='baseline-game');
  const correct=attempts.filter(x=>x.correct).length;
  return {attempts:attempts.length,passed:attempts.length>=3&&correct/attempts.length>=.6,accuracy:attempts.length?Math.round(correct/attempts.length*100):0};
}

function childAdventureOrder(profile){
  const domainOrder=Object.keys(ABILITY_DOMAINS).sort((a,b)=>(profile?.scores[a]??50)-(profile?.scores[b]??50));
  return domainOrder.flatMap(domain=>TRAINING_CATALOG.filter(module=>module.domain===domain));
}

const professionalTrainingRenderer=renderTrain;
renderTrain=function(c){
  if(currentRole!=='child'){professionalTrainingRenderer(c);return;}
  const profile=getCurrentAbilityProfile(activeChild);
  if(!profile){c.innerHTML='<div class="empty">先完成彩虹岛小游戏，就能开启训练闯关地图 🌈</div>';return;}
  const levels=childAdventureOrder(profile),states=levels.map(level=>getLevelState(activeChild,level.id));
  const passedCount=states.filter(x=>x.passed).length;
  let firstOpen=states.findIndex(x=>!x.passed);if(firstOpen<0)firstOpen=states.length;
  let html='<div class="adventure-header"><div><span>🏝️ 我的训练冒险</span><h2>一步一步，点亮彩虹路线</h2><p>闯过一关才会打开下一关。没有答对也没关系，可以再试一次。</p></div><div class="adventure-score"><b>'+passedCount+'</b><small>/ '+levels.length+' 已闯过</small></div></div><div class="adventure-progress"><i style="width:'+Math.round(passedCount/levels.length*100)+'%"></i></div><div class="adventure-legend"><span class="passed">✓ 已闯过</span><span class="current">▶ 当前关</span><span class="retry">↻ 再试一次</span><span class="locked">🔒 未解锁</span></div><div class="adventure-path">';
  let lastDomain='';
  levels.forEach((level,index)=>{
    const state=states[index],isCurrent=index===firstOpen,isRetry=isCurrent&&state.attempts>0&&!state.passed,isLocked=index>firstOpen;
    if(level.domain!==lastDomain){const domain=ABILITY_DOMAINS[level.domain];html+='<div class="island-marker" style="--island-color:'+domain.color+'"><span>'+({A:'👀',B:'🧠',C:'🧩',D:'💬',E:'😊',F:'👐'}[level.domain])+'</span><div><b>'+domain.name+'岛</b><small>'+(index===0?'根据画像，先从这里开始':'继续沿着路线探索')+'</small></div></div>';lastDomain=level.domain;}
    const status=state.passed?'passed':isRetry?'retry':isCurrent?'current':'locked';
    html+='<div class="level-row '+(index%2?'right':'left')+'"><div class="path-line"></div><button class="level-node '+status+'" data-level="'+level.id+'" '+(isLocked?'disabled':'')+' aria-label="'+level.name+' '+status+'"><span class="level-icon">'+(state.passed?'⭐':isRetry?'🌱':isCurrent?'🎮':'🔒')+'</span><b>'+level.name+'</b><small>'+level.id+' · '+(state.passed?'已闯过 '+state.accuracy+'%':isRetry?'再试一次，上次 '+state.accuracy+'%':isCurrent?'点击开始':'完成前一关后解锁')+'</small>'+(state.passed?'<i>✓</i>':'')+'</button></div>';
  });
  html+='</div><div class="adventure-end">🏆 全部点亮后，彩虹岛会送出一枚坚持勋章！</div>';
  c.innerHTML=html;
  $$('.level-node:not(.locked)',c).forEach(button=>button.onclick=()=>{const moduleId=button.dataset.level;openTrainer(activeChild,moduleId,2,()=>renderTrain(c));});
};
