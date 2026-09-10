/* ============ 历史扫描档案批量导入（仅本地专业端） ============ */
const scanStatusName={queued:'等待处理',processing:'正在离线识别',review:'等待专业复核',imported:'已正式入档',failed:'处理失败'};

const scanRenderSetting=renderSetting;
renderSetting=function(container){
  scanRenderSetting(container);
  if(currentRole==='teacher'){
    const card=document.createElement('section');card.className='card scan-import-entry';
    card.innerHTML='<div class="scan-entry-head"><span>📚🔒</span><div><b>历史扫描档案导入</b><p>离线识别PDF，逐字段复核后写入档案与初始画像。</p></div></div><button class="btn-primary" id="openScanImport">打开批量导入工作台</button><div class="note">原件与OCR全文均在本机加密保存。诊断、风险和评估信息不会自动生效，必须由专业人员确认。</div>';
    const logout=$('#logout',container);container.insertBefore(card,logout);$('#openScanImport').onclick=openScanImport;
  }
};

function openScanImport(){
  $('#sheet').classList.add('scan-workbench');
  $('#sheet').innerHTML='<h3>📚 历史扫描档案导入<button class="x" id="closeScanImport">×</button></h3><div class="scan-privacy">🔒 仅限机构内网/本机使用。不要在公开演示地址上传真实儿童档案。</div><section class="scan-upload"><input id="scanPdfFiles" type="file" accept="application/pdf" multiple><button class="btn-primary" id="uploadScanPdfs">上传并开始离线识别</button><small>可一次选择多份PDF；重复文件会按内容哈希自动跳过。大量文件建议分批上传。</small></section><div class="scan-pipeline"><span>① 加密归档</span><i>→</i><span>② 页面分类/OCR</span><i>→</i><span>③ 专业复核</span><i>→</i><span>④ 入档/画像</span></div><div id="scanBatchList" class="scan-batches"><div class="empty">正在读取批次…</div></div>';
  openMask();$('#closeScanImport').onclick=()=>{$('#sheet').classList.remove('scan-workbench');closeMask();};
  $('#uploadScanPdfs').onclick=uploadScanPdfs;refreshScanBatches();
}

async function uploadScanPdfs(){
  if(!BACKEND_API.available){toast('请先运行 Python 本地服务');return;}
  const files=[...$('#scanPdfFiles').files];if(!files.length){toast('请先选择PDF文件');return;}
  const button=$('#uploadScanPdfs');button.disabled=true;button.textContent='正在加密上传…';
  try{
    const form=new FormData();files.forEach(file=>form.append('files',file,file.name));
    const result=await backendRequest('/api/imports/batches',{method:'POST',body:form});
    if(!response.ok)throw new Error(result.error||'上传失败');
    toast('已接收 '+result.accepted+' 份，开始本地识别');$('#scanPdfFiles').value='';await refreshScanBatches();
  }catch(error){toast(error.message);}finally{button.disabled=false;button.textContent='上传并开始离线识别';}
}

async function refreshScanBatches(){
  const list=$('#scanBatchList');if(!list)return;
  if(!BACKEND_API.available){list.innerHTML='<div class="scan-offline">⚠️ 当前是静态预览。请运行 <b>python backend/server.py</b> 后再使用真实扫描档案导入。</div>';return;}
  try{
    const data=await backendRequest('/api/imports/batches');
    list.innerHTML=(data.batches||[]).map(batch=>{const pageProgress=batch.total_pages?(' · '+batch.processed_pages+' / '+batch.total_pages+' 页'):'';const error=batch.status==='failed'&&batch.error_message?'<em>⚠️ '+esc(batch.error_message)+'</em>':'';return '<button class="scan-batch '+batch.status+'" data-scan-batch="'+esc(batch.batch_id)+'"><span class="scan-status-dot"></span><div><b>'+esc(scanStatusName[batch.status]||batch.status)+'</b><small>'+batch.processed_documents+' / '+batch.total_documents+' 份已处理'+pageProgress+'</small>'+error+'</div><time>'+new Date(batch.created_at).toLocaleString()+'</time><strong>查看 ›</strong></button>';}).join('')||'<div class="empty">还没有导入批次</div>';
    $$('[data-scan-batch]',list).forEach(button=>button.onclick=()=>openScanBatch(button.dataset.scanBatch));
    if((data.batches||[]).some(x=>['queued','processing'].includes(x.status)))setTimeout(refreshScanBatches,3000);
  }catch(error){list.innerHTML='<div class="scan-offline">读取失败：'+esc(error.message)+'</div>';}
}

async function openScanBatch(batchId,options={}){
  const area=$('#scanBatchList');
  // 字段复核时保留工作台自身的滚动位置。不能先清空内容，否则浏览器会
  // 因容器瞬间变矮而把 scrollTop 强制归零，随后即使恢复也会跳到顶部。
  const sheet=$('#sheet');
  const savedScroll=Number.isFinite(options.preserveScroll)?options.preserveScroll:null;
  if(savedScroll===null)area.innerHTML='<div class="empty">正在读取识别结果…</div>';
  try{
    const data=await backendRequest('/api/imports/batches/'+encodeURIComponent(batchId));renderScanBatch(data);
    if(savedScroll!==null){
      sheet.scrollTop=savedScroll;
      requestAnimationFrame(()=>{sheet.scrollTop=savedScroll;});
    }
  }catch(error){area.innerHTML='<div class="scan-offline">'+esc(error.message)+'</div>';}
}

function renderScanBatch(data){
  const area=$('#scanBatchList'),batch=data.batch,fields=data.fields||[],pending=fields.filter(x=>x.review_status==='pending').length;
  area.innerHTML='<div class="scan-detail-head"><button class="btn-ghost" id="backToBatches">← 返回批次</button><div><b>'+esc(scanStatusName[batch.status]||batch.status)+'</b><small>'+batch.processed_documents+' / '+batch.total_documents+' 份 · '+pending+' 个字段待复核</small></div></div>'+
    '<div class="scan-documents">'+data.documents.map(doc=>'<article><span>📄</span><div><b>'+esc(doc.original_name)+'</b><small>'+doc.processed_pages+' / '+doc.page_count+' 页 · '+esc(scanStatusName[doc.status]||doc.status)+'</small></div></article>').join('')+'</div>'+
    (batch.status==='processing'?'<div class="scan-processing">⏳ 正在本机逐页识别，关闭此窗口也不会停止。已保存页面可在中断后续跑。<button class="btn-ghost" id="refreshScanBatch">刷新进度</button></div>':'')+
    (batch.status==='failed'?'<div class="scan-offline">⚠️ '+esc(batch.error_message||'识别任务异常结束，请重启本地服务后续跑。')+'</div>':'')+
    '<section class="scan-fields"><h4>专业字段复核</h4><p>请对照页码和证据片段修改后确认；医疗关键字段即使置信度高也不会自动通过。</p>'+(fields.map(renderScanField).join('')||'<div class="empty">尚未提取到候选字段。可等待识别完成，或由专业人员在正式档案中手工补录。</div>')+'</section>'+
    (batch.status==='review'?renderScanCommit(batch.batch_id,pending):'');
  $('#backToBatches').onclick=refreshScanBatches;if($('#refreshScanBatch'))$('#refreshScanBatch').onclick=()=>openScanBatch(batch.batch_id);
  $$('[data-field-approve]',area).forEach(button=>button.onclick=()=>reviewScanField(button.dataset.fieldApprove,'approved'));
  $$('[data-field-reject]',area).forEach(button=>button.onclick=()=>reviewScanField(button.dataset.fieldReject,'rejected'));
  if($('#commitScanBatch'))$('#commitScanBatch').onclick=()=>commitScanBatch(batch.batch_id);
  if($('#runProfileAgent'))$('#runProfileAgent').onclick=()=>runProfileAgent(batch.batch_id);
}

function renderScanField(field){
  const confidence=Math.round(field.confidence*100),state=field.review_status;
  return '<article class="scan-field '+state+'" id="field_'+field.field_id+'"><header><b>'+esc(field.field_label)+'</b><span class="confidence '+(confidence>=90?'high':confidence>=75?'mid':'low')+'">OCR '+confidence+'%</span><small>第 '+field.page_number+' 页</small></header><input data-field-value="'+field.field_id+'" value="'+esc(field.reviewed_value??field.extracted_value)+'" '+(state!=='pending'?'disabled':'')+'><blockquote>'+esc(field.evidence?.snippet||'无文本片段，请查看原档复核')+'</blockquote><footer>'+(state==='pending'?'<button data-field-reject="'+field.field_id+'">排除</button><button class="approve" data-field-approve="'+field.field_id+'">确认字段</button>':'<strong>'+(state==='approved'?'✓ 已由专业人员确认':'— 已排除')+'</strong>')+'</footer></article>';
}

async function reviewScanField(fieldId,decision){
  const input=$('[data-field-value="'+fieldId+'"]'),button=$('[data-field-'+(decision==='approved'?'approve':'reject')+'="'+fieldId+'"]');button.disabled=true;
  const savedScroll=$('#sheet').scrollTop;
  try{await backendRequest('/api/imports/review',{method:'POST',body:JSON.stringify({fieldId,decision,value:input.value})});toast(decision==='approved'?'字段已确认':'字段已排除');await openScanBatch(currentScanBatchId(),{preserveScroll:savedScroll});}
  catch(error){toast(error.message);button.disabled=false;}
}

function currentScanBatchId(){const button=$('#commitScanBatch');return button?.dataset.batchId||window.__scanBatchId;}

function renderScanCommit(batchId,pending){
  window.__scanBatchId=batchId;
  const domainNames={A:'注意与感知',B:'记忆',C:'执行与逻辑',D:'语言沟通',E:'社会情绪',F:'生活适应'};
  return '<section class="scan-agent-launch"><div><span>🧠✨</span><h4>档案画像与个性化训练 Agent</h4><p>直接分析OCR文字，自动生成带证据的L0-L4画像、22模块训练参数和可作答题目。</p></div><button class="btn-primary" id="runProfileAgent" data-batch-id="'+batchId+'">从文字生成画像与题目</button><small>自动结果是待审核草稿；专业人员签署后才进入儿童端。</small></section><section class="scan-commit"><h4>传统结构化入档</h4><div class="field"><label>关联儿童</label><select id="scanChildId"><option value="">请选择授权儿童</option>'+children.filter(x=>dbCanAccessChild(x.id)).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></div><p>如果档案已有正式量表分数，也可以在此直接填写。全部填写才生成数值画像；留空则只导入历史档案。</p><div class="scan-domain-scores">'+Object.entries(domainNames).map(([key,name])=>'<label>'+name+'<input data-scan-score="'+key+'" type="number" min="0" max="100" placeholder="0-100"></label>').join('')+'</div><button class="btn-primary" id="commitScanBatch" data-batch-id="'+batchId+'" '+(pending?'disabled':'')+'>'+(pending?'请先完成全部字段复核':'签署并正式入档')+'</button></section>';
}

async function commitScanBatch(batchId){
  const childId=$('#scanChildId').value;if(!childId){toast('请选择目标儿童');return;}
  const scoreInputs=$$('[data-scan-score]'),filled=scoreInputs.filter(x=>x.value!=='');if(filled.length!==0&&filled.length!==6){toast('六维分数需全部填写或全部留空');return;}
  const scores={};filled.forEach(input=>scores[input.dataset.scanScore]=+input.value);
  const button=$('#commitScanBatch');button.disabled=true;button.textContent='正在写入数据库…';
  try{const result=await backendRequest('/api/imports/commit',{method:'POST',body:JSON.stringify({batchId,childId,scores})});toast(result.profileId?'档案与初始画像已保存':'历史档案已保存');await openScanBatch(batchId);}
  catch(error){toast(error.message);button.disabled=false;button.textContent='签署并正式入档';}
}

async function runProfileAgent(batchId){
  const childId=$('#scanChildId')?.value;if(!childId){toast('请先在下方选择目标儿童');return;}
  const button=$('#runProfileAgent');button.disabled=true;button.textContent='正在分析逐页文字证据…';
  try{const result=await backendRequest('/api/agent/analyze',{method:'POST',body:JSON.stringify({batchId,childId})});renderProfileAgentReview(result);}
  catch(error){toast(error.message);button.disabled=false;button.textContent='从文字生成画像与题目';}
}

function renderProfileAgentReview(result){
  const area=$('#scanBatchList'),profile=result.profile,solution=result.solution,evidence=result.evidence||[];
  window.__profileAgentDraft=result;
  area.innerHTML='<div class="agent-review-head"><button class="btn-ghost" id="backFromAgent">← 返回批次</button><div><b>🧠 Agent画像待专业审核</b><small>共 '+evidence.length+' 条证据 · 总体置信度 '+Math.round(profile.confidence*100)+'%</small></div></div><div class="agent-disclaimer">'+esc(profile.notice)+'</div>'+
    (solution.riskFlags.length?'<div class="agent-risk">⛔ 档案中发现风险候选：'+solution.riskFlags.map(esc).join('、')+'。题目可以预览，但线上训练保持暂停，需人工核查。</div>':'')+
    '<section class="agent-domain-grid">'+profile.domains.map(domain=>renderAgentDomain(domain,evidence)).join('')+'</section>'+
    '<section class="agent-solution-preview"><h4>自动生成的训练解决方案</h4><div class="agent-priorities">优先领域：'+solution.priorityDomains.slice(0,3).map(key=>profile.domains.find(x=>x.domain===key)?.name).join(' → ')+'</div><div class="agent-module-list">'+solution.modulePlans.slice().sort((a,b)=>a.priority-b.priority).slice(0,8).map(plan=>'<article><b>'+esc(plan.moduleId+' '+plan.moduleName)+'</b><small>每周 '+plan.frequencyPerWeek+' 次 · 每次 '+plan.minutes+' 分钟 · 难度 '+plan.parameters.difficulty+'</small><p>'+esc(plan.reason)+'</p></article>').join('')+'</div><h4>题目预览</h4><div class="agent-question-preview">'+solution.questions.slice(0,6).map(q=>'<article><span>'+esc(q.target)+'</span><div><b>'+esc(q.moduleName)+'</b><p>'+esc(q.prompt)+'</p><small>选项：'+q.choices.map(esc).join('　')+'</small></div></article>').join('')+'</div></section>'+
    '<section class="agent-approval"><label><input id="agentReviewConfirm" type="checkbox"> 我已核对证据、能力等级、风险标记和题目起点；确认这是训练建议，不是医学诊断。</label><button class="btn-primary" id="approveProfileAgent">签署画像并启用个性化题目</button></section>';
  $('#backFromAgent').onclick=()=>openScanBatch(profile.sourceBatchId);$('#approveProfileAgent').onclick=approveProfileAgent;
}

function renderAgentDomain(domain,evidence){
  const items=evidence.filter(x=>x.domain===domain.domain).slice(0,4);
  return '<article class="agent-domain-card level-'+domain.level+'"><header><div><b>'+domain.domain+' · '+esc(domain.name)+'</b><small>'+esc(domain.label)+'</small></div><span>'+Math.round(domain.confidence*100)+'%</span></header><label>专业确认等级<select data-agent-level="'+domain.domain+'">'+[0,1,2,3,4].map(level=>'<option value="'+level+'" '+(level===domain.level?'selected':'')+'>L'+level+' · '+['资料不足','充分支持','提示下完成','基本独立','稳定与泛化'][level]+'</option>').join('')+'</select></label>'+(domain.contradiction?'<div class="agent-conflict">⚠️ 同时存在优势与困难证据，请重点核对</div>':'')+'<div class="agent-evidence">'+(items.map(item=>'<blockquote class="'+item.direction+'"><small>第'+item.page+'页 · '+Math.round(item.confidence*100)+'%</small>'+esc(item.text)+'</blockquote>').join('')||'<p>没有足够文字证据，将使用探索性起点。</p>')+'</div></article>';
}

async function approveProfileAgent(){
  if(!$('#agentReviewConfirm').checked){toast('请先完成专业核对确认');return;}
  const levels={};$$('[data-agent-level]').forEach(select=>levels[select.dataset.agentLevel]=+select.value);
  const button=$('#approveProfileAgent');button.disabled=true;button.textContent='正在保存画像和题目集…';
  try{
    const result=await backendRequest('/api/agent/approve',{method:'POST',body:JSON.stringify({runId:window.__profileAgentDraft.runId,levels})});
    const draft=window.__profileAgentDraft,childId=draft.profile.childId,domainDifficulty={},moduleDifficulty={},domainStats={};
    draft.solution.modulePlans.forEach(item=>{domainDifficulty[item.domain]=Math.max(domainDifficulty[item.domain]||1,item.parameters.difficulty);moduleDifficulty[item.moduleId]=item.parameters.difficulty;});
    draft.profile.domains.forEach(item=>domainStats[item.domain]={attempts:0,independentRate:null,confidence:item.confidence});
    plans[childId]={childId,generatedAt:new Date().toISOString(),source:'profile-agent',agentRunId:draft.runId,moduleDifficulty,domainStats,steps:[
      {dim:'attention',difficulty:domainDifficulty.A||1,reason:'档案画像：注意与感知训练起点'},
      {dim:'memory',difficulty:domainDifficulty.B||1,reason:'档案画像：记忆训练起点'},
      {dim:'logic',difficulty:domainDifficulty.C||1,reason:'档案画像：执行与逻辑训练起点'}]};
    enhancedState.reviews.push({id:uid(),childId,planGeneratedAt:plans[childId].generatedAt,result:'accepted',reviewer:currentRole,reason:'专业审核档案画像Agent题目集',ts:Date.now()});
    const riskMap={癫痫:'seizure',自伤:'selfHarm',攻击:'aggression',吞咽:'swallowing',跌倒:'fall','严重情绪爆发':'meltdown'};
    draft.solution.riskFlags.forEach(label=>{if(!enhancedState.riskFlags.some(x=>x.childId===childId&&x.label===label&&x.status==='active')){const flag={id:'risk_'+uid(),childId,type:riskMap[label]||'other',label,status:'active',note:'由档案画像Agent发现并经专业签署，恢复训练前需人工核查',ts:Date.now()};enhancedState.riskFlags.push(flag);backendSaveSafetyFlag(flag);}});
    saveAll();saveEnhanced();agentQuestionCache.delete(childId);
    toast('画像已生效，'+result.questionCount+'道个性化题目已进入儿童训练');openScanBatch(draft.profile.sourceBatchId);
  }
  catch(error){toast(error.message);button.disabled=false;button.textContent='签署画像并启用个性化题目';}
}
