/* ============ Python + SQLite 后端兼容层 ============ */
/**
 * 页面由 backend/server.py 提供时启用真正的 SQLite 持久化。
 * 静态预览时所有调用安静失败，原有 localStorage 数据链仍可独立工作。
 */
const BACKEND_API={available:false,storage:'browser'};

async function detectBackend(){
  try{const response=await fetch('/api/health',{signal:AbortSignal.timeout(800)});if(!response.ok)return;Object.assign(BACKEND_API,await response.json(),{available:true});}
  catch(_error){BACKEND_API.available=false;}
}

async function backendRequest(path,options={}){
  if(!BACKEND_API.available)return null;
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json','X-Role':currentRole||'',...(options.headers||{})}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'后端请求失败');
  return result;
}

async function backendSaveProfileBundle(profile,inference){
  try{return await backendRequest('/api/profiles',{method:'POST',body:JSON.stringify({profile,inference})});}
  catch(error){console.warn('SQLite画像同步失败，浏览器副本仍然有效：',error.message);return null;}
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

detectBackend();
