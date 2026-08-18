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

function saveProfessionalAssessment(data){enhancedState.assessments.push(data);saveEnhanced();backendSaveAssessment(data);audit('PROFESSIONAL_ASSESSMENT_SAVED',`${data.toolCode} · ${data.childId}`);}

/** 融合最近的合法专业结果与家长观察。没有外部证据时不会虚构。 */
function buildIntegratedProfile(childId,gameScores,answerCount){
  const now=Date.now(),year=365*86400000,month=30*86400000;
  const professional=enhancedState.assessments.filter(x=>x.childId===childId&&x.source==='professional'&&now-x.assessedAt<year).sort((a,b)=>b.assessedAt-a.assessedAt)[0];
  const family=enhancedState.familyLogs.filter(x=>x.childId===childId&&x.type==='assessment-observation'&&now-x.ts<month).sort((a,b)=>b.ts-a.ts)[0];
  const hasProfessional=!!professional&&Object.keys(professional.domainScores||{}).length>0,hasFamily=!!family&&Object.keys(family.domainScores||{}).length>0;
  const weights={game:hasProfessional ? .55 : .8,professional:hasProfessional ? .35 : 0,family:hasFamily ? .1 : 0};
  if(!hasProfessional&&hasFamily){weights.game=.85;weights.family=.15;}
  const scores={};Object.keys(ABILITY_DOMAINS).forEach(domain=>{let sum=gameScores[domain]*weights.game,total=weights.game;if(professional?.domainScores?.[domain]!==undefined){sum+=professional.domainScores[domain]*weights.professional;total+=weights.professional;}if(family?.domainScores?.[domain]!==undefined){sum+=family.domainScores[domain]*weights.family;total+=weights.family;}scores[domain]=Math.round(sum/Math.max(total,.01));});
  const evidence=[{type:'platform-game',label:`平台原创游戏（${answerCount}题）`,date:Date.now()}];
  if(professional)evidence.push({type:'professional',label:professional.toolName,date:professional.assessedAt,recordId:professional.assessmentId});
  if(family)evidence.push({type:'family',label:'近30日家长观察',date:family.ts,recordId:family.id});
  const confidence=Math.min(.9,.48+(answerCount>=18 ? .17 : .1)+(hasProfessional ? .18 : 0)+(hasFamily ? .07 : 0));
  return {scores,gameScores,evidence,weights,confidence,professionalAssessmentId:professional?.assessmentId||null,familyObservationId:family?.id||null};
}

const baseEnhancedPanel=openEnhancedPanel;
openEnhancedPanel=function(type){
  if(type==='assessment'){openProfessionalAssessmentPanel();return;}
  if(type==='assessmentObserve'){openFamilyObservationPanel();return;}
  baseEnhancedPanel(type);
};

function openProfessionalAssessmentPanel(){
  if(currentRole!=='teacher'||!dbCan(DB_ACTIONS.ASSESS_EDIT)){toast('仅获授权的康复医疗专业人员可录入专业评估');return;}
  const authorized=children.filter(x=>dbCanAccessChild(x.id));
  $('#sheet').innerHTML='<h3>专业评估结果录入/导入<button class="x" id="closeAssessmentPanel">×</button></h3><div class="note">仅录入已由有资质人员完成的正式结果。本平台不提供或复刻受版权保护的量表题目、常模与诊断。</div><div class="field"><label>儿童</label><select id="assessmentChild">'+authorized.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('')+'</select></div><div class="field"><label>评估工具</label><select id="assessmentTool">'+ASSESSMENT_TOOL_CATALOG.filter(x=>x.code!==BASELINE_VERSION).map(x=>'<option value="'+x.code+'">'+x.category+' · '+x.name+'</option>').join('')+'</select></div><div class="field"><label>评估日期</label><input id="assessmentDate" type="date" value="'+todayStr()+'"></div><div class="domain-score-inputs">'+Object.entries(ABILITY_DOMAINS).map(([key,d])=>'<label>'+d.name+'<input data-assessment-domain="'+key+'" type="number" min="0" max="100" placeholder="0-100"></label>').join('')+'</div><div class="field"><label>评估人/备注</label><input id="assessmentEvaluator" placeholder="姓名或工号"><textarea id="assessmentNote" placeholder="版本、原始分转换说明、风险提示等"></textarea></div><button class="btn-primary" id="saveProfessionalAssessment">保存专业结果</button><div class="field assessment-import"><label>或导入JSON结果</label><textarea id="assessmentJson" placeholder="{&quot;toolCode&quot;:&quot;VINELAND&quot;,&quot;domainScores&quot;:{&quot;D&quot;:60,&quot;E&quot;:55,&quot;F&quot;:50}}"></textarea><button class="btn-ghost" id="importAssessmentJson">校验并导入</button></div>';
  openMask();$('#closeAssessmentPanel').onclick=closeMask;
  const persist=payload=>{const tool=ASSESSMENT_TOOL_CATALOG.find(x=>x.code===payload.toolCode);if(!tool)throw new Error('未知评估工具');const domainScores={};Object.entries(payload.domainScores||{}).forEach(([k,v])=>{if(ABILITY_DOMAINS[k]&&Number.isFinite(+v))domainScores[k]=clamp(+v,0,100);});if(!Object.keys(domainScores).length)throw new Error('至少填写一个领域分数');saveProfessionalAssessment({assessmentId:'assess_'+uid(),childId:payload.childId||$('#assessmentChild').value,toolCode:tool.code,toolName:tool.name,category:tool.category,domainScores,assessedAt:payload.assessedAt||new Date($('#assessmentDate').value).getTime(),evaluator:payload.evaluator||$('#assessmentEvaluator').value.trim(),note:payload.note||$('#assessmentNote').value.trim(),source:'professional',status:'completed',createdAt:Date.now()});toast('专业评估结果已保存');closeMask();};
  $('#saveProfessionalAssessment').onclick=()=>{try{const domainScores={};$$('[data-assessment-domain]').forEach(input=>{if(input.value!=='')domainScores[input.dataset.assessmentDomain]=+input.value;});persist({toolCode:$('#assessmentTool').value,domainScores});}catch(error){toast(error.message);}};
  $('#importAssessmentJson').onclick=()=>{try{persist(JSON.parse($('#assessmentJson').value));}catch(error){toast('导入失败：'+error.message);}};
}

function openFamilyObservationPanel(){
  if(currentRole!=='parent'||!dbCan(DB_ACTIONS.ASSESS_LIMITED)){toast('仅绑定家长可提交家庭观察');return;}
  $('#sheet').innerHTML='<h3>家庭生活观察<button class="x" id="closeFamilyObserve">×</button></h3><div class="note">这不是考试。请根据最近两周日常表现填写，不确定可以留空。</div><div class="domain-score-inputs">'+[['D','沟通表达','💬'],['E','互动与情绪','😊'],['F','生活自理','👐']].map(([key,name,emoji])=>'<label>'+emoji+' '+name+'<input data-family-domain="'+key+'" type="range" min="0" max="100" value="50"><output>50</output></label>').join('')+'</div><div class="field"><label>补充观察</label><textarea id="familyAssessmentNote" placeholder="例：在熟悉环境中会主动表达喝水需求"></textarea></div><button class="btn-primary" id="saveFamilyObservation">保存观察</button>';
  openMask();$('#closeFamilyObserve').onclick=closeMask;$$('[data-family-domain]').forEach(input=>input.oninput=()=>input.nextElementSibling.value=input.value);
  $('#saveFamilyObservation').onclick=()=>{const domainScores={};$$('[data-family-domain]').forEach(input=>domainScores[input.dataset.familyDomain]=+input.value);enhancedState.familyLogs.push({id:'family_'+uid(),type:'assessment-observation',childId:activeChild,domainScores,note:$('#familyAssessmentNote').value.trim(),observer:'guardian-demo',ts:Date.now()});saveEnhanced();audit('FAMILY_OBSERVATION_SAVED',activeChild);toast('家庭观察已保存');closeMask();};
}
