/* ============ 免费开源本地AI：儿童画像安全叙述层 ============ */
/**
 * 默认尝试调用本机 Ollama 的 qwen3:0.6b（Apache-2.0），只传六域聚合分数，
 * 不传姓名、诊断、逐题答案或其他个人信息。若本机未安装/未启动模型，立即回退到
 * 随项目源码提供的 SafeProfileEngine。分数本身始终由可审计统计模型计算，
 * 大语言模型只负责把结果改写成儿童友好的鼓励文字。
 */
const PROFILE_AI_CONFIG={endpoint:'http://127.0.0.1:11434/api/chat',model:'qwen3:0.6b',timeoutMs:900};

async function generateChildProfileNarrative(scores,context={}){
  const entries=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const strongest=ABILITY_DOMAINS[entries[0][0]].name,practice=ABILITY_DOMAINS[entries.at(-1)[0]].name;
  const sourceCount=context.evidence?.length||1;
  const fallback={provider:'safe-local-engine',model:'SafeProfileEngine-1.0',sourceCount,text:`你在${strongest}小游戏里找到了自己的好办法！接下来我们会从轻松的${practice}游戏开始，慢慢玩、慢慢进步，每一次尝试都值得一颗星星。`};
  // Python 服务在线时优先走同源后端，由后端连接 Ollama，避免浏览器跨域并集中执行隐私过滤。
  if(typeof BACKEND_API!=='undefined'&&BACKEND_API.available){
    try{const result=await backendRequest('/api/ai/profile',{method:'POST',body:JSON.stringify({scores})});const text=sanitizeChildNarrative(result?.text||'');if(text)return {...result,text,sourceCount};}catch(_error){/* 继续尝试浏览器直连或安全离线引擎。 */}
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),PROFILE_AI_CONFIG.timeoutMs);
  try{
    const response=await fetch(PROFILE_AI_CONFIG.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model:PROFILE_AI_CONFIG.model,stream:false,think:false,messages:[{role:'system',content:'你是儿童康复训练平台的安全文案助手。只写鼓励性、非诊断、非标签化文字，不比较儿童，不使用落后、缺陷、异常、失败、智力低等词。不要承诺疗效。输出一句60字以内中文。'},{role:'user',content:`六域训练起点分数：${JSON.stringify(scores)}。相对强项：${strongest}；建议先练：${practice}。请写给儿童本人。`}],options:{temperature:.3,num_predict:90}})});
    if(!response.ok)throw new Error('local model unavailable');const data=await response.json();
    const text=sanitizeChildNarrative(data.message?.content||'');if(!text)throw new Error('unsafe or empty output');
    return {provider:'ollama-local',model:PROFILE_AI_CONFIG.model,sourceCount,text};
  }catch(_error){return fallback;}finally{clearTimeout(timer);}
}

/** 二次安全过滤：即使本地模型偏离提示，也不会把标签化语言展示给儿童。 */
function sanitizeChildNarrative(text){
  const unsafe=/诊断|智商|智力低|缺陷|异常|落后|失败|不如|治愈|保证|病|障碍严重/;
  const clean=String(text).replace(/<think>[\s\S]*?<\/think>/g,'').replace(/[\r\n#*]/g,'').trim().slice(0,100);
  return unsafe.test(clean)?'':clean;
}
