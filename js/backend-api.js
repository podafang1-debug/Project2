/* ============ Python + SQLite 后端兼容层 ============ */
/**
 * 本地 Python 服务启用数据库会话和 SQLite 主数据；公开静态演示只保留浏览器临时数据。
 */
const BACKEND_TOKEN_KEY='qizhi_backend_token';
const BACKEND_API={available:false,storage:'browser',token:sessionStorage.getItem(BACKEND_TOKEN_KEY)||'',user:null,authorizedChildIds:[],anonymousSummary:null,accountSetupRequired:false};
async function detectBackend(){
  try{
    const response=await fetch('/api/health',{signal:AbortSignal.timeout(1200)});
    if(!response.ok)return false;
    Object.assign(BACKEND_API,await response.json(),{available:true});
    return true;
  }catch(_error){BACKEND_API.available=false;return false;}
}
const backendReady=detectBackend();

async function backendRequest(path,options={},requiresAuth=true){
  if(!BACKEND_API.available)return null;
  const headers={...(options.headers||{})};
  if(!(options.body instanceof FormData)&&!headers['Content-Type'])headers['Content-Type']='application/json';
  if(requiresAuth){
    if(!BACKEND_API.token)throw new Error('请重新登录');
    headers.Authorization='Bearer '+BACKEND_API.token;
  }
  const response=await fetch(path,{...options,headers});
  const result=await response.json().catch(()=>({}));
  if(response.status===403&&requiresAuth&&String(result.error||'').includes('会话')){
    BACKEND_API.token='';sessionStorage.removeItem(BACKEND_TOKEN_KEY);
  }
  if(!response.ok)throw new Error(result.error||'后端请求失败');
  return result;
}

async function backendLogin(phone,password,role){
  await backendReady;
  if(!BACKEND_API.available)return null;
  const result=await backendRequest('/api/auth/login',{method:'POST',body:JSON.stringify({phone,password,role})},false);
  BACKEND_API.token=result.token;BACKEND_API.user=result.user;BACKEND_API.authorizedChildIds=result.authorizedChildIds||[];
  sessionStorage.setItem(BACKEND_TOKEN_KEY,result.token);
  await hydrateFromBackend();
  return result;
}

async function backendLogout(){
  if(BACKEND_API.available&&BACKEND_API.token){try{await backendRequest('/api/auth/logout',{method:'POST'});}catch(_error){}}
  BACKEND_API.token='';BACKEND_API.user=null;BACKEND_API.authorizedChildIds=[];sessionStorage.removeItem(BACKEND_TOKEN_KEY);
}

function mergeById(local,remote,idKey='id'){
  const merged=new Map((local||[]).map(item=>[item?.[idKey],item]));
  (remote||[]).forEach(item=>merged.set(item?.[idKey],item));
  return [...merged.values()].filter(Boolean);
}

async function syncLocalStateToBackend(){
  for(const child of children||[])await backendSaveChild(child);
  const chunks=[];for(let i=0;i<(records||[]).length;i+=100)chunks.push(records.slice(i,i+100));
  for(const chunk of chunks)await backendSaveTrainingRecords(chunk);
  if(typeof relationalDb!=='undefined'){
    for(const profile of relationalDb.abilityProfiles||[]){
      const inference=(relationalDb.aiInferences||[]).find(item=>item.profileId===profile.profileId);
      await backendSaveProfileBundle(profile,inference);
    }
  }
  for(const assessment of enhancedState?.assessments||[]){
    if(['professional','platform'].includes(assessment.source))await backendSaveAssessment(assessment);
  }
  for(const intervention of enhancedState?.interventionLogs||[])await backendSaveIntervention(intervention);
  const careKeys=['caseIntakes','careGoals','planVersions','reevaluations','closures','followups','confirmations'];
  for(const key of careKeys)for(const item of enhancedState?.[key]||[])await backendSaveCareRecord(item);
  for(const flag of enhancedState?.riskFlags||[])if(flag.status==='active')await backendSaveSafetyFlag(flag);
}

async function hydrateFromBackend(){
  if(!BACKEND_API.available||!BACKEND_API.token)return false;
  const data=await backendRequest('/api/bootstrap');
  BACKEND_API.user=data.user;BACKEND_API.authorizedChildIds=data.authorizedChildIds||[];BACKEND_API.anonymousSummary=data.anonymousSummary||null;
  children=data.children||[];
    records=data.trainingRecords||[];
    if(typeof relationalDb!=='undefined'){
      relationalDb.abilityProfiles=data.abilityProfiles||[];
      relationalDb.aiInferences=data.aiInferences||[];
      saveDatabase();
    }
    if(typeof enhancedState!=='undefined'){
      enhancedState.assessments=data.assessments||[];
      const careMap={intake:'caseIntakes',goal:'careGoals',plan:'planVersions',reevaluation:'reevaluations',closure:'closures',followup:'followups',confirmation:'confirmations'};
      Object.values(careMap).forEach(key=>enhancedState[key]=[]);
      (data.careRecords||[]).forEach(item=>{const key=careMap[item.kind];if(key)enhancedState[key].push(item);});
      enhancedState.riskFlags=data.safetyFlags||[];
      saveEnhanced();
    }
    plans={};children.forEach(child=>plans[child.id]=genPlan(child.id));saveAll();
  return true;
}

async function backendSaveChild(child){
  try{const result=await backendRequest('/api/children',{method:'POST',body:JSON.stringify({child})});if(result?.childId&&!BACKEND_API.authorizedChildIds.includes(result.childId))BACKEND_API.authorizedChildIds.push(result.childId);return result;}
  catch(error){console.warn('SQLite儿童档案同步失败：',error.message);return null;}
}
async function backendDeleteChild(childId){
  try{const result=await backendRequest('/api/children/'+encodeURIComponent(childId),{method:'DELETE'});BACKEND_API.authorizedChildIds=BACKEND_API.authorizedChildIds.filter(id=>id!==childId);return result;}
  catch(error){console.warn('SQLite儿童档案删除失败：',error.message);return null;}
}
async function backendSaveTrainingRecords(items){
  if(!items?.length)return null;
  try{return await backendRequest('/api/training-records',{method:'POST',body:JSON.stringify({records:items})});}
  catch(error){console.warn('SQLite训练记录同步失败：',error.message);return null;}
}
async function backendSaveSafetyFlag(flag){
  try{return await backendRequest('/api/safety-flags',{method:'POST',body:JSON.stringify({childId:flag.childId,flag})});}
  catch(error){console.warn('SQLite风险记录同步失败：',error.message);return null;}
}
async function backendResolveSafetyFlags(childId,resolution){
  try{return await backendRequest('/api/safety-flags',{method:'POST',body:JSON.stringify({childId,action:'resolve',resolution})});}
  catch(error){console.warn('SQLite风险解除同步失败：',error.message);return null;}
}
async function backendSaveProfileBundle(profile,inference){
  try{return await backendRequest('/api/profiles',{method:'POST',body:JSON.stringify({profile,inference})});}
  catch(error){console.warn('SQLite画像同步失败：',error.message);return null;}
}
async function backendSaveAssessment(assessment){
  try{return await backendRequest('/api/assessments',{method:'POST',body:JSON.stringify(assessment)});}
  catch(error){console.warn('SQLite评估同步失败：',error.message);return null;}
}
async function backendSaveIntervention(record){
  try{return await backendRequest('/api/interventions',{method:'POST',body:JSON.stringify(record)});}
  catch(error){console.warn('SQLite活动记录同步失败：',error.message);return null;}
}
async function backendSaveCareRecord(record){
  try{return await backendRequest('/api/care-records',{method:'POST',body:JSON.stringify(record)});}
  catch(error){console.warn('SQLite专业记录同步失败：',error.message);return null;}
}

async function backendSaveConsent(childId,scope){
  try{return await backendRequest('/api/consents',{method:'POST',body:JSON.stringify({childId,scope})});}
  catch(error){console.warn('知情同意同步失败：',error.message);return null;}
}
async function backendRevokeConsent(childId){
  try{return await backendRequest('/api/consents',{method:'POST',body:JSON.stringify({childId,action:'revoke'})});}
  catch(error){console.warn('撤回授权同步失败：',error.message);return null;}
}
async function backendCreateDataRequest(childId,type='deletion'){
  try{return await backendRequest('/api/data-requests',{method:'POST',body:JSON.stringify({childId,type})});}
  catch(error){console.warn('数据申请提交失败：',error.message);return null;}
}
async function backendListPatients(){
  return backendRequest('/api/patients');
}
async function backendUpdatePatients(childIds){
  const result=await backendRequest('/api/patients',{method:'POST',body:JSON.stringify({childIds})});
  BACKEND_API.authorizedChildIds=result.authorizedChildIds||[];
  return result;
}
async function adminBackend(path,options={}){
  if(!BACKEND_API.available||BACKEND_API.user?.role!=='teacher')throw new Error('请通过本地机构服务登录康复专业人员账号');
  return backendRequest('/api/admin/'+path,options);
}
