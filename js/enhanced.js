/* ============ 增强版：六域、22模块与治理功能 ============ */
/**
 * 本文件采用“配置驱动”扩展原型：训练内容、能力域和交互模板相互分离。
 * 新增模块只需登记配置，无需复制训练器；正式版可将本表迁移到内容管理服务。
 */
const ABILITY_DOMAINS={
  A:{name:"注意与感知觉",color:"#4F86F7",legacy:"attention"},
  B:{name:"记忆",color:"#10B981",legacy:"memory"},
  C:{name:"执行功能与逻辑",color:"#8B5CF6",legacy:"logic"},
  D:{name:"语言沟通",color:"#EC4899",legacy:"memory"},
  E:{name:"社会情绪",color:"#F59E0B",legacy:"logic"},
  F:{name:"生活适应与动作",color:"#06B6D4",legacy:"attention"}
};

const TRAINING_CATALOG=[
  ["P01","颜色识别","A","attention","在干扰项中指认目标颜色"],["P02","形状辨认","A","attention","辨认基础形状与大小"],
  ["P03","视觉搜索/找不同","A","logic","训练选择性注意与视觉扫描"],["P04","听觉注意","A","attention","辨认目标声音并抗干扰"],
  ["M01","物品配对","B","memory","匹配相同或关联物品"],["M02","翻牌记忆","B","memory","记住图片位置并配对"],
  ["M03","序列回忆","B","memory","按顺序回忆颜色、数字或图形"],["M04","工作记忆","B","短时保持并操作信息"],
  ["L01","图片命名","D","attention","看图说词并提取词汇"],["L02","句子表达","D","memory","用完整句描述图片"],
  ["L03","指令理解","D","logic","理解一步或多步指令"],["L04","AAC/图片选择","D","attention","用图片表达需要与选择"],
  ["E01","因果关系","C","logic","理解动作、事件与结果"],["E02","分类整理","C","logic","按类别、功能或属性分类"],
  ["E03","数量认知","C","attention","点数、数字匹配与简单比较"],["E04","计划与顺序","C","memory","排列生活事件步骤"],
  ["S01","情绪识别","E","attention","识别基本表情与情境"],["S02","轮流/共同注意","E","memory","练习等待、轮流和共同关注"],
  ["S03","社交规则","E","logic","理解问候、回应和社交边界"],
  ["D01","生活步骤训练","F","memory","按顺序完成生活自理步骤"],["D02","精细动作/点选","F","attention","训练点选与手眼协调"],
  ["D03","模仿/节律动作","F","logic","按节律模仿动作并记录完成度"]
].map(([id,name,domain,engine,goal])=>({id,name,domain,engine,goal}));

// 前端权限只负责界面裁剪；正式授权由服务端数据库角色权限表决定。
Object.assign(PERMS,{
  child:{manage:false,train:true,viewReport:true,viewAI:false,settings:false,accounts:false},
  teacher:{...PERMS.teacher,viewAI:true,org:true,audit:true,content:true,accounts:true}
});
Object.assign(ROLE_NAME,{child:"儿童",parent:"家长",teacher:"康复专业人员"});

/** 每种身份拥有稳定的颜色和图形；登录页、选中态和系统顶栏共用同一份配置。 */
const ROLE_VISUALS={
  child:{color:'#F59E0B',soft:'#FFF7E6',icon:'star',label:'儿童'},
  parent:{color:'#10B981',soft:'#EAFBF4',icon:'heart',label:'家长'},
  teacher:{color:'#4F86F7',soft:'#EEF4FF',icon:'plus',label:'康复专业人员'}
};

/** 初始化增强版数据仓。全部使用独立键，避免破坏旧版备份。 */
const enhancedState={
  goals:lsGet("goals",[]),assessments:lsGet("assessments",[]),reviews:lsGet("reviews",[]),
  familyLogs:lsGet("familyLogs",[]),auditLogs:lsGet("auditLogs",[]),materials:lsGet("materials",[]),
  consents:lsGet("consents",[]),homeTaskCompletions:lsGet("homeTaskCompletions",[]),dataRequests:lsGet("dataRequests",[]),organizations:lsGet("organizations",[{id:"org1",name:"康宇儿童发展中心",classes:["启航班","成长班"]}])
};
function saveEnhanced(){Object.entries(enhancedState).forEach(([k,v])=>lsSet(k,v));}
function audit(action,detail){const user=typeof BACKEND_API!=='undefined'?BACKEND_API.user:null;enhancedState.auditLogs.unshift({id:uid(),action,detail,role:currentRole,actorUserId:user?.userId||('local_'+currentRole),actorName:user?.displayName||ROLE_NAME[currentRole]||currentRole,ts:Date.now()});enhancedState.auditLogs=enhancedState.auditLogs.slice(0,1000);saveEnhanced();}

/**
 * 角色导航矩阵：隐藏无权入口只是第一层体验控制，业务函数中的 PERMS 校验仍是第二层。
 * 正式版还必须由服务端再次鉴权，不能只依赖前端隐藏按钮。
 */
const ROLE_TABS={
  child:['train','report'],parent:['train','report','setting'],teacher:['archive','train','ai','report','setting']
};
const ROLE_HOME={child:'train',parent:'report',teacher:'archive'};
function dbCanOpenTab(tab){
  if(tab==='train')return dbCan(DB_ACTIONS.TRAIN);
  if(tab==='archive')return dbCan(DB_ACTIONS.PROFILE_EDIT)||dbCan(DB_ACTIONS.PROFILE_MANAGE);
  if(tab==='ai')return dbCan(DB_ACTIONS.AI_REVIEW);
  if(tab==='report')return dbCan(DB_ACTIONS.PROGRESS_SIMPLE)||dbCan(DB_ACTIONS.PROGRESS_AUTH)||dbCan(DB_ACTIONS.PROGRESS_ANON);
  if(tab==='setting')return true; // 设置页内部仍按权限数据库拆分具体模块。
  return false;
}
const unguardedShowTab=showTab;
showTab=function(tab){
  const allowed=(ROLE_TABS[currentRole]||[]).filter(dbCanOpenTab);
  // 即使通过控制台或旧链接请求越权页面，也会回到该角色默认页。
  const safeTab=allowed.includes(tab)?tab:(ROLE_HOME[currentRole]||allowed[0]);
  if(!safeTab){toast('当前账号没有可访问模块');return;}
  unguardedShowTab(safeTab);
};
const baseEnterApp=enterApp;
enterApp=function(){
  syncDatabaseBindings();
  const authorized=dbAuthorizedChildIds();
  if((currentRole==='child'||currentRole==='parent')&&!authorized.includes(activeChild))activeChild=authorized[0]||null;
  baseEnterApp();
  const visual=ROLE_VISUALS[currentRole];
  if(visual){
    $('#roleBadge').style.setProperty('--role-color',visual.color);$('#roleBadge').style.setProperty('--role-soft',visual.soft);
    $('#roleBadge').innerHTML='<span class="role-badge-icon">'+svg(visual.icon,visual.color,20)+'</span><span><small>当前身份</small><b>'+visual.label+'</b></span>';
  }
  const allowed=(ROLE_TABS[currentRole]||[]).filter(dbCanOpenTab);
  $$('.tab').forEach(tab=>{
    tab.classList.toggle('hidden',!allowed.includes(tab.dataset.tab));
    const labels=currentRole==='parent'?{train:'陪练',report:'首页',setting:'我的'}:{archive:'档案',train:'训练',ai:'AI方案',report:'报表',setting:'设置'};
    const textNode=[...tab.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
    if(textNode&&labels[tab.dataset.tab])textNode.textContent=labels[tab.dataset.tab];
  });
  // 顶部操作也遵循角色权限：无训练权不显示今日训练，无备份权不显示备份/恢复。
  // 儿童端直接使用闯关地图，不再展示专业排程区，避免重复入口和越权文案。
  $('#todayBox').classList.toggle('hidden',!dbCan(DB_ACTIONS.TRAIN)||currentRole==='child');
  const todayTitle=$('#todayBox h2'),todayHint=$('#todayBox .hint');
  if(todayTitle)todayTitle.childNodes[todayTitle.childNodes.length-1].textContent=currentRole==='parent'?'今日陪练任务':'今日训练任务';
  if(todayHint)todayHint.textContent=currentRole==='parent'?'这里只显示专业人员已签署并下发的家庭任务。点「开始」进入陪练。':'系统依据已审核方案排程；逾期任务已标红，点「开始」进入训练。';
  $('#btnExport').classList.toggle('hidden',!(dbCan(DB_ACTIONS.BACKUP_LIMITED)||dbCan(DB_ACTIONS.BACKUP_FULL)));
  $('#btnImport').classList.toggle('hidden',!(dbCan(DB_ACTIONS.BACKUP_LIMITED)||dbCan(DB_ACTIONS.BACKUP_FULL)));
  let logout=$('#globalLogout');
  if(!logout){logout=document.createElement('button');logout.id='globalLogout';logout.className='mini-btn';logout.textContent='退出';$('.top-actions').appendChild(logout);}
  logout.onclick=logoutToLogin;
  showTab(ROLE_HOME[currentRole]||allowed[0]||'archive');
  audit('LOGIN',ROLE_NAME[currentRole]||currentRole);
};

/**
 * 22模块共用三种低刺激交互原型。moduleId 记录专业模块，engine 保持旧AI兼容；
 * 后续接入语音、摄像头或线下动作采集时，可按 moduleId 注册专用引擎。
 */
const legacyOpenTrainer=openTrainer;
openTrainer=function(childId,moduleId,difficulty,onDone){
  const item=TRAINING_CATALOG.find(x=>x.id===moduleId);
  if(!item)return legacyOpenTrainer(childId,moduleId,difficulty,onDone);
  window.__activeTrainingModuleId=item.id;window.__activeTrainingDomain=item.domain;
  audit("START_TRAINING",`${item.id} ${item.name}`);
  legacyOpenTrainer(childId,item.engine,clamp(difficulty||2,1,5),()=>{window.__activeTrainingModuleId=null;window.__activeTrainingDomain=null;if(onDone)onDone();});
  const h=$("#trainSheet h3");if(h)h.childNodes[0].textContent=(children.find(x=>x.id===childId)?.name||"")+" · "+item.name+" ";
};

// 以六域分组呈现22模块，专业名称、训练目标与AI建议难度均由配置生成。
renderTrain=function(c){
  if(!dbCan(DB_ACTIONS.TRAIN)){c.innerHTML='<div class="empty">当前账号无训练权限。专业人员可在 AI 方案中审核，家长和儿童可执行已授权任务。</div>';return;}
  if(!children.length){c.innerHTML='<div class="empty">请先建立儿童档案</div>';return;}
  const authorizedIds=dbAuthorizedChildIds();
  const scopedChildren=children.filter(ch=>authorizedIds.includes(ch.id));
  if(!scopedChildren.length){c.innerHTML='<div class="empty">当前账号尚未绑定儿童，请联系机构确认授权关系。</div>';return;}
  const familyMode=currentRole==='parent';
  const signedPlan=familyMode&&typeof effectiveClinicalPlan==='function'?effectiveClinicalPlan(activeChild):null;
  const plannedRows=new Map((signedPlan?.rows||[]).map(row=>[row.moduleId,row]));
  const visibleModules=familyMode?TRAINING_CATALOG.filter(module=>plannedRows.has(module.id)&&module.delivery!=='offline'):TRAINING_CATALOG;
  let html='<div class="sec-title">'+svg("brain","#F7A14F",20)+(familyMode?'已下发的家庭陪练':'六域训练地图 · 22个模块')+'</div>'+
    '<div class="field"><label>'+(scopedChildren.length>1?'选择儿童':'当前儿童')+'</label><select id="trainChild" '+(scopedChildren.length<2?'disabled':'')+'>'+scopedChildren.map(ch=>'<option value="'+ch.id+'"'+(ch.id===activeChild?' selected':'')+'>'+esc(ch.name)+'</option>').join('')+'</select></div>'+
    '<div class="note">'+(familyMode?'这里只显示专业人员已签署并下发的家庭任务。短时、轻松、有回应；出现明显不适请立即停止。':'训练反馈温和、无惩罚；连续2次正确/错误只升降1档。动作与社交类任务应由成人陪同，出现明显不适请立即停止。')+'</div>';
  if(familyMode&&!signedPlan)html+='<div class="empty">尚未收到专业人员签署下发的家庭训练方案。</div>';
  else if(familyMode&&!visibleModules.length)html+='<div class="empty">当前方案没有可在线执行的家庭任务，请查看首页或联系专业人员。</div>';
  Object.entries(ABILITY_DOMAINS).forEach(([key,domain])=>{
    const modules=visibleModules.filter(x=>x.domain===key);if(!modules.length)return;
    html+='<section class="domain-section"><h3 style="color:'+domain.color+'">'+(familyMode?'':key+' · ')+domain.name+'</h3><div class="module-grid">';
    modules.forEach(module=>{const planned=plannedRows.get(module.id),difficulty=clamp(+(planned?.difficulty||2),1,5);html+='<button class="module-card" data-module="'+module.id+'" data-difficulty="'+difficulty+'" style="--module-color:'+domain.color+'"><b>'+module.name+'</b><small>'+module.goal+'</small><span>建议 '+(planned?.duration||5)+' 分钟 · 难度 '+difficulty+' · 点击开始</span></button>';});
    html+='</div></section>';
  });
  c.innerHTML=html;
  $('#trainChild').onchange=e=>{activeChild=e.target.value;lsSet('activeChild',activeChild);renderTrain(c);};
  $$('.module-card',c).forEach(button=>button.onclick=()=>{const childId=$('#trainChild').value;if(!dbCanAccessChild(childId)){toast('当前账号未获得该儿童的数据授权');return;}openTrainer(childId,button.dataset.module,+button.dataset.difficulty||2);});
};
/** 将专业治理、家庭支持和系统安全入口追加到设置页。 */
const baseRenderSetting=renderSetting;
renderSetting=function(c){
  const roleModules={parent:[['family','反馈日记','记录情绪、睡眠、配合度和特殊事件'],['homeTask','今日陪练','查看短时家庭任务、材料和陪练话术'],['reminder','训练提醒','设置训练频率、时段和复评提醒'],['assessmentObserve','评估观察','提交家庭观察，不修改专业量表'],['consent','知情同意','管理授权范围、导出和撤回']]};
  if(currentRole==='teacher')baseRenderSetting(c);else c.innerHTML='<div class="sec-title">'+ROLE_NAME[currentRole]+'工作台</div>';
  const extra=document.createElement('div');
  const modules=currentRole==='teacher'?[['patients','我的患者','选择需要跟进的家长儿童账号'],['assessment','专业评估与复评','录入量表来源、版本与换算依据'],['sessionMode','机构/学校排程','一对一、小组及班级每日训练'],['goals','康复目标','建立可观察的训练目标与周期'],['review','AI训练方案复核','复核、修改并通过实名会话签署'],['risk','医疗与训练风险','分级暂停并填写解除依据和随访计划'],['family','家庭观察','查看家长反馈并辅助调整方案'],['homeSync','同步居家任务','从已签署方案下发短时陪练任务'],['remoteReview','远程专业指导','在授权范围内复核基层资料'],['contentSuggest','内容专业建议','提交并管理训练内容建议'],['auditLimited','本人操作记录','查看本人相关建档、签署与变更'],['materials','素材库','图片、音频、视频和社交故事'],['contentReview','内容审核','上传、审核、发布和下架'],['versions','版本管理','内容版本、变更原因和回滚'],['calibration','难度与文化适配','难度校准、方言与城乡场景检查'],['org','机构与班级','组织、班级和授权边界'],['accounts','账号与授权','审核专业账号、状态和儿童绑定关系'],['audit','审计日志','登录、修改、审核和导出追溯'],['operations','脱敏运营看板','训练量、完成率和安全事件'],['remoteShare','远程授权共享','管理机构间授权范围和有效期'],['consent','知情同意','授权版本、范围和撤回记录'],['backupGovernance','备份与治理','恢复演练与备份状态']]:roleModules[currentRole]||[];
  extra.innerHTML=(currentRole==='teacher'?'<div class="sec-title">康复专业工作模块</div>':'')+'<div class="ops-grid">'+modules.map(m=>'<button class="ops-card" data-panel="'+m[0]+'"><b>'+m[1]+'</b><small>'+m[2]+'</small></button>').join('')+'</div>'+
    '<div class="note">平台只提供训练建议，不作诊断或治疗结论。癫痫、自伤、攻击、严重情绪爆发、吞咽或跌倒风险应立即停止并联系专业人员。</div>';
  if(currentRole==='teacher')c.insertBefore(extra,c.lastElementChild);else{c.appendChild(extra);const logout=document.createElement('button');logout.className='btn-ghost';logout.id='roleLogout';logout.textContent='退出登录';c.appendChild(logout);logout.onclick=logoutToLogin;}
  $$('[data-panel]',extra).forEach(b=>b.onclick=()=>openEnhancedPanel(b.dataset.panel));
};

async function logoutToLogin(){
  await backendLogout();currentRole=null;lsSet('session',null);
  $('#main').classList.add('hidden');$('#tabbar').classList.add('hidden');$('#login').classList.remove('hidden');
  if($('#passwordInput'))$('#passwordInput').value='';if($('#loginErr'))$('#loginErr').textContent='';
  if(typeof setAuthenticationMode==='function')setAuthenticationMode();
}

function openEnhancedPanel(type){
  const titles={patients:'我的患者',goals:'康复目标',family:'家庭反馈日记',review:'专业方案审核',contentReview:'内容审核',consent:'知情同意',audit:'审计日志',org:'机构与班级',homeTask:'今日陪练',reminder:'训练提醒',assessment:'评估与周期复评',assessmentObserve:'家庭评估观察',risk:'风险标记',materials:'素材库',versions:'版本管理',calibration:'难度校准',accounts:'账号与授权',operations:'脱敏运营看板',sessionMode:'机构/学校排程',homeSync:'同步居家任务',contentSuggest:'内容建议',auditLimited:'受限审计',remoteReview:'远程指导',remoteShare:'远程授权共享',backupGovernance:'备份与治理'};
  const activeConsent=(enhancedState.consents||[]).filter(x=>x.childId===activeChild&&x.status==='active').sort((a,b)=>(b.ts||0)-(a.ts||0))[0]||null;
  let body='';
  if(type==='audit')body=(enhancedState.auditLogs.length?enhancedState.auditLogs:'').slice(0,20).map(x=>'<div class="log-row"><b>'+esc(x.action)+'</b><small>'+new Date(x.ts).toLocaleString()+' · '+esc(x.role||'system')+'</small><p>'+esc(x.detail||'')+'</p></div>').join('')||'<div class="empty">暂无审计记录</div>';
  else if(type==='org')body=enhancedState.organizations.map(x=>'<div class="card"><b>'+esc(x.name)+'</b><p>班级：'+esc(x.classes.join('、'))+'</p></div>').join('');
  else if(type==='consent')body=currentRole!=='parent'?'<div class="card"><b>授权治理汇总</b><p>当前共有 '+enhancedState.consents.filter(x=>x.status==='active').length+' 条有效授权。康复专业人员只能在授权范围内处理数据，不能替代监护人授权。</p></div>':'<div class="card"><b>当前状态：'+(activeConsent?'已授权':'未授权')+'</b><p>请按用途分别选择。未勾选的范围不会被视为同意；撤回后不再用于新的处理活动。</p><div class="risk-checks"><label><input type="checkbox" data-consent-scope="training" '+(activeConsent?.scope?.includes('training')?'checked':'')+'>训练记录</label><label><input type="checkbox" data-consent-scope="assessment" '+(activeConsent?.scope?.includes('assessment')?'checked':'')+'>评估与家庭观察</label><label><input type="checkbox" data-consent-scope="media" '+(activeConsent?.scope?.includes('media')?'checked':'')+'>音视频采集（当前原型不采集）</label></div><button class="btn-primary" id="saveConsent">保存授权范围</button>'+(activeConsent?'<button class="btn-ghost danger" id="revokeConsent">撤回当前授权</button>':'')+'<button class="btn-ghost" id="exportMyData">导出当前儿童数据</button><button class="btn-ghost danger" id="requestDataDeletion">提交数据删除申请</button><div class="note">这是原型中的本地授权记录。正式服务还应提供身份核验、处理时限和申请进度。</div></div>';
  else if(type==='family')body='<div class="field"><label>今日状态</label><select id="familyMood"><option>状态平稳</option><option>睡眠不足</option><option>情绪波动</option><option>配合度较高</option></select></div><div class="field"><label>观察记录</label><textarea id="familyNote" placeholder="只记录训练相关的必要信息"></textarea></div><button class="btn-primary" id="saveFamily">保存日记</button>';
  else if(type==='goals')body='<div class="field"><label>目标描述</label><input id="goalText" placeholder="例：在少量提示下完成两步指令"></div><div class="field"><label>目标值（0-100）</label><input id="goalValue" type="number" min="0" max="100" value="70"></div><button class="btn-primary" id="saveGoal">新增目标</button>';
  else if(type==='homeTask')body='<div class="card"><b>今日任务：颜色与物品配对</b><p>准备3种常见物品，每次5分钟。话术：“请把一样的放在一起。”连续出现明显烦躁或回避时停止。</p></div>';
  else if(type==='reminder')body='<div class="card"><b>提醒设置</b><p>建议短时高频，每次5–10分钟；可在正式版连接通知服务。当前原型不发送系统推送。</p></div>';
  else if(type==='assessment')body='<div class="card"><b>评估记录</b><p>记录量表编码、版本、评估日期、评估人和分项分；受版权保护的量表题目不内置。</p></div>';
  else if(type==='assessmentObserve')body='<div class="card"><b>家庭观察权限</b><p>家长可提交生活场景观察，不能修改专业量表得分或诊断信息。</p></div>';
  else if(type==='risk')body='<div class="card"><b>专业风险提示</b><p>可记录癫痫、自伤、攻击、情绪爆发、吞咽和跌倒风险。风险标记优先于任何AI自动升级。</p></div>';
  else if(type==='materials')body=TRAINING_CATALOG.slice(0,8).map(x=>'<div class="log-row"><b>'+x.id+' '+x.name+'</b><small>'+ABILITY_DOMAINS[x.domain].name+' · 已发布 · v1.0</small><p>'+x.goal+'</p></div>').join('');
  else if(type==='contentReview')body='<div class="card"><b>内容审核队列</b><p>康复专业人员可审核素材科学性、文化适配、难度和版权来源。</p><button class="btn-primary" id="approveContentDemo">记录内容审核通过</button></div>';
  else if(type==='sessionMode')body='<div class="card"><b>训练场景</b><p>机构：一对一/小组训练；学校：按班级安排每日任务。训练结束后进入报表与AI方案审核。</p></div>';
  else if(type==='homeSync')body='<div class="card"><b>家校同步</b><p>从已审核方案选择1–3个短时任务，下发给绑定家长；家长只查看被授权儿童。</p></div>';
  else if(type==='auditLimited'){const userId=BACKEND_API.user?.userId;body=enhancedState.auditLogs.filter(x=>userId?x.actorUserId===userId:x.role===currentRole).slice(0,20).map(x=>'<div class="log-row"><b>'+esc(x.action)+'</b><small>'+new Date(x.ts).toLocaleString()+' · '+esc(x.actorName||ROLE_NAME[x.role]||x.role)+'</small><p>'+esc(x.detail||'')+'</p></div>').join('')||'<div class="empty">暂无与本人相关的记录</div>';}
  else if(type==='remoteReview'||type==='remoteShare')body='<div class="card"><b>'+titles[type]+'</b><p>远程访问必须基于儿童监护授权、机构关系、明确范围和有效期；每次查看与修改均写入审计日志。</p></div>';
  else if(type==='contentSuggest')body='<div class="card"><b>提交专业建议</b><p>康复专业人员可以提交建议，并在审核通过后发布训练内容。</p></div>';
  else if(['versions','calibration','accounts','operations','backupGovernance'].includes(type))body='<div class="card"><b>'+titles[type]+'</b><p>该模块已建立独立权限入口和审计边界；生产版需由服务端、数据库及真实组织数据提供完整能力。</p></div>';
  else body='<div class="card"><b>待审核队列</b><p>AI宏观方案、训练素材与安全规则变更必须人工审核并记录理由。</p><button class="btn-primary" id="approveDemo">记录一次审核通过</button></div>';
  $('#sheet').innerHTML='<h3>'+titles[type]+'<button class="x" id="closeEnhanced">×</button></h3>'+body;openMask();$('#closeEnhanced').onclick=closeMask;
  if($('#saveConsent'))$('#saveConsent').onclick=async()=>{const scope=$$('[data-consent-scope]:checked').map(x=>x.dataset.consentScope);if(!scope.length){toast('请至少选择一项授权范围');return;}const saved=await backendSaveConsent(activeChild,scope);if(BACKEND_API.available&&!saved){toast('机构服务保存失败，授权未更改');return;}(enhancedState.consents||[]).filter(x=>x.childId===activeChild&&x.status==='active').forEach(x=>{x.status='superseded';x.endedAt=Date.now();});enhancedState.consents.push({id:saved?.consentId||'consent_'+uid(),childId:activeChild,version:'1.0',status:'active',scope,confirmedBy:BACKEND_API.user?.userId||'parent',ts:Date.now()});audit('CONSENT_SCOPE_SAVED',scope.length+'项用途');toast('授权范围已保存');openEnhancedPanel('consent');};
  if($('#revokeConsent'))$('#revokeConsent').onclick=()=>confirmBox('确认撤回当前授权？撤回后将停止新的数据处理和训练。',async()=>{const revoked=await backendRevokeConsent(activeChild);if(BACKEND_API.available&&!revoked){toast('机构服务撤回失败，授权保持有效');return;}activeConsent.status='revoked';activeConsent.revokedAt=Date.now();saveEnhanced();audit('CONSENT_REVOKED','已撤回');toast('当前授权已撤回');openEnhancedPanel('consent');});
  if($('#exportMyData'))$('#exportMyData').onclick=()=>{if(!dbCanAccessChild(activeChild)){toast('当前账号未获得该儿童的数据授权');return;}const payload={exportedAt:new Date().toISOString(),child:children.find(x=>x.id===activeChild),trainingRecords:records.filter(x=>x.childId===activeChild),familyLogs:enhancedState.familyLogs.filter(x=>x.childId===activeChild),homeTaskCompletions:(enhancedState.homeTaskCompletions||[]).filter(x=>x.childId===activeChild),consents:enhancedState.consents.filter(x=>x.childId===activeChild)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='我的儿童数据-'+todayStr()+'.json';a.click();URL.revokeObjectURL(a.href);audit('PARENT_DATA_EXPORTED',activeChild);};
  if($('#requestDataDeletion'))$('#requestDataDeletion').onclick=()=>confirmBox('提交后将进入机构数据治理队列，不会立即删除数据。确认提交吗？',async()=>{const saved=await backendCreateDataRequest(activeChild,'deletion');if(BACKEND_API.available&&!saved){toast('机构服务提交失败，请重试');return;}enhancedState.dataRequests=enhancedState.dataRequests||[];enhancedState.dataRequests.push({id:saved?.requestId||'request_'+uid(),childId:activeChild,type:'deletion',status:'pending',requestedBy:BACKEND_API.user?.userId||'parent',ts:Date.now()});saveEnhanced();audit('DATA_DELETION_REQUESTED','已提交治理队列');toast('删除申请已提交');closeMask();});
  if($('#saveFamily'))$('#saveFamily').onclick=()=>{enhancedState.familyLogs.push({id:uid(),childId:activeChild,mood:$('#familyMood').value,note:$('#familyNote').value,ts:Date.now()});audit('FAMILY_LOG_CREATED',$('#familyMood').value);toast('日记已保存');closeMask();};
  if($('#saveGoal'))$('#saveGoal').onclick=()=>{enhancedState.goals.push({id:uid(),childId:activeChild,text:$('#goalText').value,target:clamp(+$('#goalValue').value,0,100),baseline:0,status:'active',ts:Date.now()});audit('GOAL_CREATED',$('#goalText').value);toast('目标已保存');closeMask();};
  if($('#approveDemo'))$('#approveDemo').onclick=()=>{enhancedState.reviews.push({id:uid(),type:'ai-plan',result:'approved',reviewer:currentRole,ts:Date.now()});audit('REVIEW_APPROVED','AI方案演示审核');toast('审核结果已留痕');closeMask();};
  if($('#approveContentDemo'))$('#approveContentDemo').onclick=()=>{enhancedState.reviews.push({id:uid(),type:'content',result:'approved',reviewer:currentRole,ts:Date.now()});audit('CONTENT_REVIEW_APPROVED','内容审核演示');toast('内容审核结果已留痕');closeMask();};
}

// 在顶部风险提示下显示产品边界，防止把训练建议误读为医疗结论。
const baseCheckAcc=checkAcc;
checkAcc=function(){
  const b=$('#accBanner');
  // 儿童和内容审核角色不展示数据维护告警；他们既无备份权限，也不负责数据治理。
  if(currentRole==='child'){b.classList.add('hidden');return;}
  if(currentRole==='parent'){
    b.classList.remove('hidden');b.innerHTML=svg('heart','#10B981',16)+' 已记录 '+records.filter(x=>x.childId===activeChild&&x.source!=='baseline-game').length+' 条训练足迹，可在首页查看近期训练表现。';return;
  }
  if(records.length>=30&&(dbCan(DB_ACTIONS.BACKUP_LIMITED)||dbCan(DB_ACTIONS.BACKUP_FULL))){
    b.classList.remove('hidden');b.innerHTML=svg('clock','#E07B2E',16)+' 数据已积累 '+records.length+' 条，建议点右上角「备份」导出 JSON 防丢失。';return;
  }
  b.classList.remove('hidden');b.innerHTML=svg('shield','#8B5CF6',16)+' 本平台为康复训练辅助工具，不提供医学诊断或疗效承诺。';
};

/** 在旧三维报表之上增加六域统计，确保历史记录仍可阅读。 */
const baseRenderReport=renderReport;
renderReport=function(c){
  if(dbCan(DB_ACTIONS.PROGRESS_ANON)){
    const summary=BACKEND_API.anonymousSummary||{},totalSessions=summary.trainingRecords??records.filter(x=>x.source!=='baseline-game').length,childCount=summary.children??children.length;
    c.innerHTML='<div class="sec-title">脱敏运营看板</div><div class="stat-row"><div class="stat"><b>'+childCount+'</b><small>档案数量</small></div><div class="stat"><b>'+totalSessions+'</b><small>训练题次</small></div></div><div class="note">运营汇总用于机构服务质量管理，患者明细仍受授权关系限制。</div>';
    return;
  }
  if(!dbCanAccessChild(activeChild)){c.innerHTML='<div class="empty">当前账号未获得该儿童的数据授权</div>';return;}
  if(dbCan(DB_ACTIONS.PROGRESS_SIMPLE)&&!dbCan(DB_ACTIONS.PROGRESS_AUTH)){
    const recs=records.filter(x=>x.childId===activeChild&&x.source!=='baseline-game'),done=recs.length,stars=Math.min(5,Math.ceil(done/10));
    c.innerHTML='<div class="sec-title">我的简单进度</div><div class="card child-progress-simple"><div class="reward-stars">'+('★'.repeat(stars)+ '☆'.repeat(5-stars))+'</div><b>已经完成 '+done+' 道训练题</b><p>继续按自己的节奏练习。答错没关系，系统会给提示并安排更合适的下一轮。</p></div>';
    return;
  }
  baseRenderReport(c);
  if(currentRole==='child'||currentRole==='parent'){
    const selector=$('#repChild');if(selector){$$('option',selector).forEach(option=>{if(option.value!==activeChild)option.remove();});selector.disabled=true;}
  }
  const recs=records.filter(r=>r.childId===activeChild&&r.source!=='baseline-game'&&r.domain&&ABILITY_DOMAINS[r.domain]);
  const card=document.createElement('div');card.className='card';
  card.innerHTML='<b>六域训练概览</b><p class="hint">首次正确率优先反映独立掌握；暂无记录显示为“—”。</p><div class="domain-metrics">'+
    Object.entries(ABILITY_DOMAINS).map(([key,d])=>{const list=recs.filter(r=>r.domain===key);const rate=list.length?Math.round(list.filter(r=>r.firstCorrect).length/list.length*100):null;return '<div><span style="color:'+d.color+'">'+key+'</span><b>'+(rate===null?'—':rate+'%')+'</b><small>'+d.name+' · '+list.length+'次</small></div>';}).join('')+'</div>';
  c.appendChild(card);
};

/** 专业端对AI宏观方案执行接受、修改、拒绝，所有动作进入审核与审计记录。 */
const baseRenderAI=renderAI;
renderAI=function(c){
  if(!dbCan(DB_ACTIONS.AI_REVIEW)){c.innerHTML='<div class="empty">当前账号无权生成或审核AI方案</div>';return;}
  if(!dbCanAccessChild(activeChild)){c.innerHTML='<div class="empty">当前账号未获得该儿童授权</div>';return;}
  baseRenderAI(c);
  if(!(PERMS[currentRole].manage||PERMS[currentRole].review))return;
  const panel=document.createElement('div');panel.className='card';
  panel.innerHTML='<b>训练方案复核</b><p class="hint">AI建议只能作为草稿。复核结果不会直接生效，必须由当前康复专业人员通过实名服务端会话签署。</p><div class="review-actions"><button class="btn-primary" data-review-result="accepted">复核通过，待签署</button><button class="btn-ghost" data-review-result="modified">编辑方案草稿</button><button class="btn-ghost danger" data-review-result="rejected">退回重拟</button></div>';
  c.appendChild(panel);
  $$('[data-review-result]',panel).forEach(b=>b.onclick=()=>{const result=b.dataset.reviewResult;if(result==='modified'){toast('请编辑具体模块参数并保存草稿');openClinicalHub('plans');return;}enhancedState.reviews.push({id:uid(),childId:activeChild,planGeneratedAt:plans[activeChild]?.generatedAt,result,workflowStatus:result==='accepted'?'reviewed-awaiting-signature':'returned',reviewerRole:currentRole,reviewerUserId:BACKEND_API.user?.userId||null,reviewerName:BACKEND_API.user?.displayName||ROLE_NAME[currentRole],reason:result==='accepted'?'已完成人工复核，等待实名签署':'需要重新制定方案',ts:Date.now()});saveEnhanced();audit('AI_PLAN_REVIEW',result);toast(result==='accepted'?'已复核，仍需实名签署后生效':'已退回重新制定');});
};

/* ============ 可视化闭环演示：模拟作答 → AI分析 → 针对性再训练 ============ */
/**
 * 为答辩演示生成一组“明确标注为模拟”的逐题数据。
 * 正确率由儿童基线决定，并故意让最低能力域出现更多错误，以便AI展示针对性调整。
 */
function simulateTrainingCycle(childId){
  if(!dbCan(DB_ACTIONS.TRAIN)||!dbCanAccessChild(childId)){toast('当前账号无权执行该训练');return;}
  const child=children.find(x=>x.id===childId);if(!child)return;
  const legacyScores={attention:child.baseline.attention,memory:child.baseline.memory,logic:child.baseline.logic};
  const weakLegacy=Object.entries(legacyScores).sort((a,b)=>a[1]-b[1])[0][0];
  const candidates=TRAINING_CATALOG.filter(x=>ABILITY_DOMAINS[x.domain].legacy===weakLegacy);
  const moduleItem=candidates[0]||TRAINING_CATALOG[0];
  const oldPlan=JSON.parse(JSON.stringify(plans[childId]||genPlan(childId)));
  const start=Date.now()-12*60000;
  const simulated=[];
  for(let i=0;i<12;i++){
    // 前半段错误偏多，后半段在温和提示后略有改善，形成可解释的学习轨迹。
    const correct=i>=8?i%3!==0:i%3===0;
    simulated.push({id:uid(),childId,module:moduleItem.engine,moduleId:moduleItem.id,domain:moduleItem.domain,difficulty:i<6?3:2,
      correct,firstCorrect:correct,promptLevel:correct?0:(i<6?2:1),reactionMs:correct?900+i*35:1750+i*70,
      errorType:correct?'':(moduleItem.engine==='memory'?'mismatch':moduleItem.engine==='logic'?'category_error':'wrong_target'),
      completed:true,source:'simulation',ts:start+i*60000});
  }
  records=records.concat(simulated);
  backendSaveTrainingRecords(simulated);
  plans[childId]=genPlan(childId);saveAll();
  const newPlan=plans[childId];
  const weakStep=newPlan.steps.find(x=>x.dim===weakLegacy);
  enhancedState.reviews.push({id:uid(),childId,type:'simulation-cycle',result:'pending-review',moduleId:moduleItem.id,ts:Date.now()});
  audit('SIMULATED_TRAINING_CYCLE',`${child.name} · ${moduleItem.id} ${moduleItem.name} · 12题`);
  showCycleResult(child,moduleItem,simulated,oldPlan,newPlan,weakStep);
}

/** 用四步流程解释AI为何安排下一轮训练，避免只给一个不透明的推荐结果。 */
function showCycleResult(child,moduleItem,recs,oldPlan,newPlan,weakStep){
  const correct=recs.filter(x=>x.correct).length;
  const firstHalf=recs.slice(0,6).filter(x=>x.correct).length;
  const secondHalf=recs.slice(6).filter(x=>x.correct).length;
  const oldStep=oldPlan.steps.find(x=>x.dim===moduleItem.engine);
  $('#sheet').innerHTML='<h3>AI闭环演示结果<button class="x" id="closeCycle">×</button></h3>'+
    '<div class="cycle-flow"><div><i>1</i><b>模拟答题</b><small>'+esc(child.name)+'完成12题</small></div><span>→</span><div><i>2</i><b>识别信号</b><small>首次正确'+correct+'/12</small></div><span>→</span><div><i>3</i><b>调整方案</b><small>难度最多±1级</small></div><span>→</span><div><i>4</i><b>针对性再练</b><small>'+moduleItem.name+'</small></div></div>'+
    '<div class="card"><b>AI发现了什么</b><p>前6题正确 '+firstHalf+' 题，后6题正确 '+secondHalf+' 题；主要错误为 '+esc(ERR_NAME[recs.find(x=>!x.correct)?.errorType]||'目标误触')+'。系统判断“'+ABILITY_DOMAINS[moduleItem.domain].name+'”仍需巩固，但后半段已有改善，因此采用温和降级而非大幅改变。</p></div>'+
    '<div class="plan-change"><div><small>调整前</small><b>'+({attention:'注意力',memory:'记忆力',logic:'逻辑力'}[moduleItem.engine])+' 难度 '+(oldStep?.difficulty||2)+'</b></div><span>→</span><div><small>调整后</small><b>'+moduleItem.id+' '+moduleItem.name+' · 难度 '+(weakStep?.difficulty||2)+'</b><p>'+esc(weakStep?.reason||'根据近期正确率与错误模式继续巩固')+'</p></div></div>'+
    '<div class="note">这12条记录已写入儿童档案，并标记为“演示模拟”。下一轮训练将采用更新后的AI方案，专业人员仍需审核。</div>';
  openMask();$('#closeCycle').onclick=()=>{closeMask();renderArchive($('#tabContent'));};
}

/** 在每位儿童档案中追加训练记录和闭环演示入口。 */
const baseRenderArchive=renderArchive;
renderArchive=function(c){
  baseRenderArchive(c);
  const title=c.querySelector('.sec-title');
  if(title){const guide=document.createElement('div');guide.className='closed-loop-banner';guide.innerHTML='<b>训练闭环演示</b><span>儿童作答 → 记录行为信号 → AI识别薄弱项 → 调整难度与模块 → 针对性再训练</span>';title.insertAdjacentElement('afterend',guide);}
  const cards=$$('.child-card',c);
  children.forEach((child,index)=>{
    const card=cards[index];if(!card)return;
    const childRecords=records.filter(r=>r.childId===child.id&&r.source!=='baseline-game').sort((a,b)=>b.ts-a.ts);
    const recent=childRecords.slice(0,5);
    const area=document.createElement('div');area.className='child-history';
    area.innerHTML='<div class="history-head"><b>训练档案记录</b><span>累计 '+childRecords.length+' 题</span></div>'+
      (recent.length?'<div class="history-list">'+recent.map(r=>'<div><span class="history-dot '+(r.correct?'ok':'no')+'"></span><b>'+esc(r.moduleId||({attention:'注意力',memory:'记忆力',logic:'逻辑力'}[r.module]||r.module))+'</b><small>'+fmtDate(r.ts)+' · 难度'+r.difficulty+' · '+(r.correct?'首次答对':'错误：'+esc(ERR_NAME[r.errorType]||'需提示'))+(r.source==='simulation'?' · <em>演示模拟</em>':'')+'</small></div>').join('')+'</div>':'<div class="empty compact">暂无训练记录</div>')+
      (dbCan(DB_ACTIONS.TRAIN)&&dbCanAccessChild(child.id)?'<button class="btn-primary simulate-cycle" data-child="'+child.id+'">模拟儿童答题并让AI调整</button>':'');
    card.appendChild(area);
  });
  $$('.simulate-cycle',c).forEach(b=>b.onclick=()=>simulateTrainingCycle(b.dataset.child));
};
