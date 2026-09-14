/* ============ Python + SQLite 后端兼容层 ============ */
/**
 * 本地 Python 服务启用数据库会话和 SQLite 主数据；公开静态演示只保留浏览器临时数据。
 */
const BACKEND_TOKEN_KEY='qizhi_backend_token';
const BACKEND_API={available:false,storage:'browser',token:sessionStorage.getItem(BACKEND_TOKEN_KEY)||'',user:null,authorizedChildIds:[],anonymousSummary:null,accountSetupRequired:false,teacherBootstrapRequired:false,lastSyncSignature:'',syncing:false};
async function detectBackend(){
  try{
    const response=await fetch('/api/health',{signal:AbortSignal.timeout(1200)});
    if(!response.ok)return false;
    Object.assign(BACKEND_API,await response.json(),{available:true});
    return true;
  }catch(_error){BACKEND_API.available=false;return false;}
}
const backendReady=detectBackend();
const BACKEND_SYNC_KEY='qizhi_backend_changed';
const backendSyncChannel=typeof BroadcastChannel==='function'?new BroadcastChannel(BACKEND_SYNC_KEY):null;
let backendRefreshQueued=false;

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
  if((options.method||'GET').toUpperCase()!=='GET')announceBackendChange();
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
  BACKEND_API.token='';BACKEND_API.user=null;BACKEND_API.authorizedChildIds=[];BACKEND_API.lastSyncSignature='';sessionStorage.removeItem(BACKEND_TOKEN_KEY);
}

function announceBackendChange(){
  const stamp=Date.now()+':'+Math.random();
  if(backendSyncChannel)backendSyncChannel.postMessage(stamp);
  else localStorage.setItem(BACKEND_SYNC_KEY,stamp);
}

function backendSnapshotSignature(data){
  return JSON.stringify({
    authorizedChildIds:data.authorizedChildIds||[],children:data.children||[],trainingRecords:data.trainingRecords||[],
    abilityProfiles:data.abilityProfiles||[],aiInferences:data.aiInferences||[],assessments:data.assessments||[],
    interventionLogs:data.interventionLogs||[],careRecords:data.careRecords||[],safetyFlags:data.safetyFlags||[]
  });
}

function backendUiIsBusy(){
  if(document.hidden)return true;
  const maskOpen=id=>{const node=document.getElementById(id);return node&&!node.classList.contains('hidden');};
  if(maskOpen('mask')||maskOpen('trainMask'))return true;
  return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
}

function rerenderAfterBackendSync(){
  const main=document.getElementById('main');
  if(!main||main.classList.contains('hidden')||backendUiIsBusy())return;
  const scrollTop=window.scrollY;
  if(typeof showTab==='function'&&typeof curTab==='string')showTab(curTab);
  requestAnimationFrame(()=>window.scrollTo(0,scrollTop));
}

async function refreshBackendState(){
  if(backendRefreshQueued||BACKEND_API.syncing||!BACKEND_API.available||!BACKEND_API.token||backendUiIsBusy())return false;
  backendRefreshQueued=true;
  try{return await hydrateFromBackend({rerender:true});}
  catch(error){console.warn('Shared data refresh failed:',error.message);return false;}
  finally{backendRefreshQueued=false;}
}

if(backendSyncChannel)backendSyncChannel.addEventListener('message',refreshBackendState);
window.addEventListener('storage',event=>{if(event.key===BACKEND_SYNC_KEY)refreshBackendState();});
window.addEventListener('focus',refreshBackendState);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshBackendState();});
setInterval(refreshBackendState,15000);

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

async function hydrateFromBackend({rerender=false}={}){
  if(!BACKEND_API.available||!BACKEND_API.token)return false;
  if(BACKEND_API.syncing)return false;
  BACKEND_API.syncing=true;
  try{
    const data=await backendRequest('/api/bootstrap');
    const signature=backendSnapshotSignature(data),changed=signature!==BACKEND_API.lastSyncSignature;
    BACKEND_API.lastSyncSignature=signature;
    BACKEND_API.user=data.user;BACKEND_API.authorizedChildIds=data.authorizedChildIds||[];BACKEND_API.anonymousSummary=data.anonymousSummary||null;
    children=data.children||[];
    records=data.trainingRecords||[];
    if(typeof relationalDb!=='undefined'){
      relationalDb.abilityProfiles=data.abilityProfiles||[];
      relationalDb.aiInferences=data.aiInferences||[];
      saveDatabase();
    }
    if(typeof enhancedState!=='undefined'){
      const assessments=data.assessments||[];
      enhancedState.familyLogs=assessments.filter(item=>item.source==='family'||item.toolCode==='FAMILY_OBSERVATION');
      enhancedState.assessments=assessments.filter(item=>item.source!=='family'&&item.toolCode!=='FAMILY_OBSERVATION');
      enhancedState.interventionLogs=data.interventionLogs||[];
      const careMap={intake:'caseIntakes',goal:'careGoals',plan:'planVersions',reevaluation:'reevaluations',closure:'closures',followup:'followups',confirmation:'confirmations'};
      Object.values(careMap).forEach(key=>enhancedState[key]=[]);
      (data.careRecords||[]).forEach(item=>{const key=careMap[item.kind];if(key)enhancedState[key].push(item);});
      enhancedState.riskFlags=data.safetyFlags||[];
      saveEnhanced();
    }
    if(activeChild&&!BACKEND_API.authorizedChildIds.includes(activeChild))activeChild=null;
    if(!activeChild&&children.length)activeChild=children[0].id;
    plans={};children.forEach(child=>plans[child.id]=genPlan(child.id));saveAll();
    if(changed&&rerender)rerenderAfterBackendSync();
    return changed;
  }finally{BACKEND_API.syncing=false;}
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
