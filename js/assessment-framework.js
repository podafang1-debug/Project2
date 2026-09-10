/* ============ 多来源评估框架：专业量表 + 家长观察 + 平台游戏 ============ */
/**
 * 目录只保存工具名称、用途和可录入的结果域，不包含受版权保护的题目、常模或评分表。
 * 标准化评估结果必须由有资质人员依据合法版本完成后录入。
 */
const ASSESSMENT_TOOL_CATALOG=[
  {code:'GESELL',category:'发育/智力评估',name:'Gesell发育诊断量表',purpose:'形成发育基线与分层训练',domains:['A','B','C','D','F']},
  {code:'GRIFFITHS',category:'发育/智力评估',name:'Griffiths发育量表',purpose:'形成多领域发育基线',domains:['A','B','C','D','E','F']},
  {code:'WISC',category:'发育/智力评估',name:'WISC-CR/C-WISC（结果录入）',purpose:'认知能力结构参考',domains:['A','B','C','D']},
  {code:'DDST',category:'发育/智力评估',name:'DDST发育筛查（结果录入）',purpose:'发育里程碑筛查',domains:['D','E','F']},
  {code:'SOCIAL_LIFE',category:'适应行为',name:'婴儿-初中生社会生活能力量表',purpose:'生活适应与训练目标',domains:['D','E','F']},
  {code:'VINELAND',category:'适应行为',name:'文兰适应行为量表（结果录入）',purpose:'沟通、日常生活与社会化',domains:['D','E','F']},
  {code:'SS_LANGUAGE',category:'语言/沟通',name:'S-S语言发育迟缓检查法',purpose:'语言模块起点与目标',domains:['B','D','E']},
  {code:'LANGUAGE_DELAY',category:'语言/沟通',name:'语言发育迟缓评定法',purpose:'语言理解与表达起点',domains:['D']},
  {code:'PEP3',category:'语言/沟通与孤独症相关',name:'PEP-3（结果录入）',purpose:'沟通、动作与适应行为画像',domains:['A','D','E','F']},
  {code:'VBMAPP',category:'孤独症相关',name:'VB-MAPP（授权结果录入）',purpose:'语言与学习里程碑',domains:['B','D','E']},
  {code:'ABLLSR',category:'孤独症相关',name:'ABLLS-R（授权结果录入）',purpose:'基础语言与学习技能',domains:['B','C','D','E','F']},
  {code:'ABC',category:'行为观察',name:'ABC行为观察结果',purpose:'行为特点与训练禁忌',domains:['A','E']},
  {code:'CARS',category:'行为观察',name:'CARS/CARS-2（临床结果录入）',purpose:'专业观察与风险提示',domains:['A','D','E']},
  {code:'VABS',category:'行为观察',name:'VABS/适应行为结果',purpose:'适应与行为支持计划',domains:['D','E','F']},
  {code:BASELINE_VERSION,category:'平台内置',name:'原创游戏化训练起点评估',purpose:'动态训练画像',domains:['A','B','C','D','E','F']}
];

async function saveProfessionalAssessment(data){const saved=await backendSaveAssessment(data);if(!saved)throw new Error('服务端保存失败');enhancedState.assessments.push(data);saveEnhanced();audit('PROFESSIONAL_ASSESSMENT_SAVED',`${data.toolCode} · ${data.childId}`);return data;}

/** 分层整理多来源证据。平台训练指数不与标准化评估或家庭观察做数学混合。 */
function assessmentTimestamp(value){const parsed=typeof value==='number'?value:Date.parse(value);return Number.isFinite(parsed)&&parsed>0&&parsed<=Date.now()?parsed:null;}
function buildIntegratedProfile(childId,gameScores,answerCount){const now=Date.now(),year=365*86400000,month=30*86400000,professionals=enhancedState.assessments.filter(x=>x.childId===childId&&x.source==='professional'&&assessmentTimestamp(x.assessedAt)&&now-assessmentTimestamp(x.assessedAt)<year).sort((a,b)=>assessmentTimestamp(b.assessedAt)-assessmentTimestamp(a.assessedAt)),familyCandidates=[...enhancedState.familyLogs.filter(x=>x.childId===childId&&x.type==='assessment-observation'),...enhancedState.assessments.filter(x=>x.childId===childId&&x.source==='family')].filter(x=>assessmentTimestamp(x.assessedAt??x.ts)&&now-assessmentTimestamp(x.assessedAt??x.ts)<month).sort((a,b)=>assessmentTimestamp(b.assessedAt??b.ts)-assessmentTimestamp(a.assessedAt??a.ts)),scores=Object.fromEntries(Object.keys(ABILITY_DOMAINS).map(domain=>[domain,Math.round(gameScores[domain]??50)])),usedProfessional=[...new Map(professionals.map(x=>[x.assessmentId,x])).values()],usedFamily=[...new Map(familyCandidates.map(x=>[x.assessmentId||x.id,x])).values()],evidence=[{type:'platform-game',layer:'training-index',label:`平台原创游戏（${answerCount}题，仅形成训练起点）`,date:Date.now()}];usedProfessional.forEach(x=>evidence.push({type:'professional',layer:'standardized-result',label:`${x.toolName} ${x.toolVersion||''}`.trim(),date:assessmentTimestamp(x.assessedAt),recordId:x.assessmentId,domainScores:x.domainScores}));usedFamily.forEach(x=>evidence.push({type:'family',layer:'context-observation',label:'近30日家长观察（情境证据）',date:assessmentTimestamp(x.assessedAt??x.ts),recordId:x.assessmentId||x.id,domainScores:x.domainScores}));const evidenceCoverage=usedProfessional.length&&usedFamily.length?'多来源证据齐备':usedProfessional.length||usedFamily.length?'已有补充证据':'仅有平台训练数据';return {scores,gameScores,evidence,evidenceCoverage,scoreMeaning:'platform-training-start-index',weights:null,confidence:0,professionalAssessmentId:usedProfessional[0]?.assessmentId||null,familyObservationId:usedFamily[0]?.assessmentId||usedFamily[0]?.id||null};}

const baseEnhancedPanel=openEnhancedPanel;
openEnhancedPanel=function(type){
  if(type==='assessment'){openProfessionalAssessmentPanel();return;}
  if(type==='assessmentObserve'){openFamilyObservationPanel();return;}
  baseEnhancedPanel(type);
};

function openProfessionalAssessmentPanel(){
  if(currentRole!=='teacher'||!dbCan(DB_ACTIONS.ASSESS_EDIT)){toast('仅获授权的康复专业人员可录入专业评估');return;}
  const authorized=children.filter(x=>dbCanAccessChild(x.id));
  if(!authorized.length){toast('当前账号没有可录入评估的授权儿童');return;}
  const identity=BACKEND_API.user;
  $('#sheet').innerHTML='<h3>专业评估结果录入/导入<button class="x" id="closeAssessmentPanel">×</button></h3><div class="note">标准化结果与平台训练指数分开保存，不参与固定权重混分。静态演示不能保存正式专业结果。</div><div class="field"><label>儿童</label><select id="assessmentChild">'+authorized.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('')+'</select></div><div class="field"><label>评估工具</label><select id="assessmentTool">'+ASSESSMENT_TOOL_CATALOG.filter(x=>x.code!==BASELINE_VERSION).map(x=>'<option value="'+x.code+'">'+x.category+' · '+x.name+'</option>').join('')+'</select></div><div class="field"><label>工具版本</label><input id="assessmentVersion" placeholder="必填：出版版次/本地授权版本"></div><div class="field"><label>评估日期</label><input id="assessmentDate" type="date" value="'+todayStr()+'"></div><div class="domain-score-inputs">'+Object.entries(ABILITY_DOMAINS).map(([key,d])=>'<label>'+d.name+'<input data-assessment-domain="'+key+'" type="number" min="0" max="100" placeholder="结果映射值"></label>').join('')+'</div><div class="field"><label>评估人</label><input id="assessmentEvaluator" value="'+esc(identity?.displayName||'未连接机构服务')+'" readonly></div><div class="field"><label>原始分与换算依据</label><textarea id="assessmentScoreBasis" placeholder="必填：原始分、常模/换算表版本、映射到平台领域的规则"></textarea></div><div class="field"><label>补充备注</label><textarea id="assessmentNote" placeholder="风险提示、施测条件和结果限制"></textarea></div><button class="btn-primary" id="saveProfessionalAssessment" '+(!BACKEND_API.available||!identity?'disabled':'')+'>保存专业结果</button><div class="field assessment-import"><label>或导入JSON结果</label><textarea id="assessmentJson" placeholder="{&quot;toolCode&quot;:&quot;VINELAND&quot;,&quot;toolVersion&quot;:&quot;示例版次&quot;,&quot;scoreBasis&quot;:&quot;原始分与换算说明&quot;,&quot;domainScores&quot;:{&quot;D&quot;:60}}"></textarea><button class="btn-ghost" id="importAssessmentJson" '+(!BACKEND_API.available||!identity?'disabled':'')+'>校验并导入</button></div>';
  openMask();$('#closeAssessmentPanel').onclick=closeMask;
  const updateDomains=()=>{const tool=ASSESSMENT_TOOL_CATALOG.find(x=>x.code===$('#assessmentTool').value);$$('[data-assessment-domain]').forEach(input=>{const enabled=tool?.domains.includes(input.dataset.assessmentDomain);input.disabled=!enabled;if(!enabled)input.value='';});};$('#assessmentTool').onchange=updateDomains;updateDomains();
  const persist=async payload=>{if(!BACKEND_API.available||!identity)throw new Error('正式评估必须连接机构服务并使用实名会话');const tool=ASSESSMENT_TOOL_CATALOG.find(x=>x.code===payload.toolCode);if(!tool)throw new Error('未知评估工具');const childId=payload.childId||$('#assessmentChild').value;if(!dbCanAccessChild(childId))throw new Error('无权访问该儿童');const domainScores={};Object.entries(payload.domainScores||{}).forEach(([k,v])=>{if(!ABILITY_DOMAINS[k])throw new Error('未知领域：'+k);if(!tool.domains.includes(k))throw new Error(tool.name+'不支持'+ABILITY_DOMAINS[k].name+'领域');if(v===''||v===null)return;if(!Number.isFinite(+v)||+v<0||+v>100)throw new Error(ABILITY_DOMAINS[k].name+'分数须为0-100');domainScores[k]=+v;});if(!Object.keys(domainScores).length)throw new Error('至少填写一个该工具支持的领域分数');const assessedAt=assessmentTimestamp(payload.assessedAt??new Date($('#assessmentDate').value+'T12:00:00').getTime());if(!assessedAt)throw new Error('评估日期无效或晚于今天');const toolVersion=(payload.toolVersion||$('#assessmentVersion').value).trim(),scoreBasis=(payload.scoreBasis||$('#assessmentScoreBasis').value).trim();if(!toolVersion||!scoreBasis)throw new Error('请填写工具版本和原始分换算依据');await saveProfessionalAssessment({assessmentId:'assess_'+uid(),childId,toolCode:tool.code,toolName:tool.name,toolVersion,category:tool.category,domainScores,scoreBasis,assessedAt,evaluator:identity.displayName,evaluatorUserId:identity.userId,note:payload.note||$('#assessmentNote').value.trim(),source:'professional',status:'completed',createdAt:Date.now()});toast('专业评估结果已保存');closeMask();};
  $('#saveProfessionalAssessment').onclick=async()=>{try{const domainScores={};$$('[data-assessment-domain]').forEach(input=>{if(input.value!=='')domainScores[input.dataset.assessmentDomain]=+input.value;});await persist({toolCode:$('#assessmentTool').value,domainScores});}catch(error){toast(error.message);}};
  $('#importAssessmentJson').onclick=async()=>{try{await persist(JSON.parse($('#assessmentJson').value));}catch(error){toast('导入失败：'+error.message);}};
}

function openFamilyObservationPanel(){
  if(currentRole!=='parent'||!dbCan(DB_ACTIONS.ASSESS_LIMITED)){toast('仅绑定家长可提交家庭观察');return;}
  $('#sheet').innerHTML='<h3>家庭生活观察<button class="x" id="closeFamilyObserve">×</button></h3><div class="note">这不是考试。请根据最近两周日常表现填写，不确定可以留空；至少填写一个领域。</div><div class="domain-score-inputs">'+[['D','沟通表达','💬'],['E','互动与情绪','😊'],['F','生活自理','👐']].map(([key,name,emoji])=>'<label>'+emoji+' '+name+'<input data-family-domain="'+key+'" type="number" min="0" max="100" placeholder="可留空"></label>').join('')+'</div><div class="field"><label>补充观察</label><textarea id="familyAssessmentNote" placeholder="例：在熟悉环境中会主动表达喝水需求"></textarea></div><button class="btn-primary" id="saveFamilyObservation">保存观察</button>';
  openMask();$('#closeFamilyObserve').onclick=closeMask;
  $('#saveFamilyObservation').onclick=()=>{const domainScores={};for(const input of $$('[data-family-domain]')){if(input.value==='')continue;if(!Number.isFinite(+input.value)||+input.value<0||+input.value>100){toast('家庭观察分数须为0-100');return;}domainScores[input.dataset.familyDomain]=+input.value;}if(!Object.keys(domainScores).length){toast('请至少填写一个领域，或取消本次观察');return;}const now=Date.now(),record={assessmentId:'family_'+uid(),id:null,type:'assessment-observation',childId:activeChild,toolCode:'FAMILY_OBSERVATION',toolName:'家庭生活观察',domainScores,note:$('#familyAssessmentNote').value.trim(),observer:BACKEND_API.user?.displayName||'绑定家长',source:'family',status:'completed',assessedAt:now,ts:now};record.id=record.assessmentId;enhancedState.familyLogs.push(record);saveEnhanced();backendSaveAssessment(record);audit('FAMILY_OBSERVATION_SAVED',activeChild);toast('家庭观察已保存');closeMask();};
}
