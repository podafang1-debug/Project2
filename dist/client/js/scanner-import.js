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
  if(currentRole==='admin'){
    const card=document.createElement('section');card.className='card';card.innerHTML='<b>扫描导入运行状态</b><p class="hint">管理员只能查看脱敏批次数量与运行状态，不能查看文件名、儿童身份或临床字段。</p><div id="adminImportSummary" class="scan-summary">正在读取本地服务…</div>';
    container.insertBefore(card,$('#logout',container));loadAdminImportSummary();
  }
};

async function loadAdminImportSummary(){
  const box=$('#adminImportSummary');if(!box)return;
  try{const data=await backendRequest('/api/imports/batches');const counts={};(data?.batches||[]).forEach(x=>counts[x.status]=(counts[x.status]||0)+1);box.innerHTML='<b>'+(data?.batches?.length||0)+'</b> 个批次 · '+Object.entries(counts).map(([k,v])=>v+' 个'+(scanStatusName[k]||k)).join(' · ');}
  catch(error){box.textContent=BACKEND_API.available?'状态读取失败：'+error.message:'请先通过 Python 本地服务启动平台。';}
}

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
    const response=await fetch('/api/imports/batches',{method:'POST',headers:{'X-Role':currentRole},body:form});const result=await response.json();
    if(!response.ok)throw new Error(result.error||'上传失败');
    toast('已接收 '+result.accepted+' 份，开始本地识别');$('#scanPdfFiles').value='';await refreshScanBatches();
  }catch(error){toast(error.message);}finally{button.disabled=false;button.textContent='上传并开始离线识别';}
}

async function refreshScanBatches(){
  const list=$('#scanBatchList');if(!list)return;
  if(!BACKEND_API.available){list.innerHTML='<div class="scan-offline">⚠️ 当前是静态预览。请运行 <b>python backend/server.py</b> 后再使用真实扫描档案导入。</div>';return;}
  try{
    const data=await backendRequest('/api/imports/batches');
    list.innerHTML=(data.batches||[]).map(batch=>'<button class="scan-batch '+batch.status+'" data-scan-batch="'+esc(batch.batch_id)+'"><span class="scan-status-dot"></span><div><b>'+esc(scanStatusName[batch.status]||batch.status)+'</b><small>'+batch.processed_documents+' / '+batch.total_documents+' 份已处理</small></div><time>'+new Date(batch.created_at).toLocaleString()+'</time><strong>查看 ›</strong></button>').join('')||'<div class="empty">还没有导入批次</div>';
    $$('[data-scan-batch]',list).forEach(button=>button.onclick=()=>openScanBatch(button.dataset.scanBatch));
    if((data.batches||[]).some(x=>['queued','processing'].includes(x.status)))setTimeout(refreshScanBatches,3000);
  }catch(error){list.innerHTML='<div class="scan-offline">读取失败：'+esc(error.message)+'</div>';}
}

async function openScanBatch(batchId){
  const area=$('#scanBatchList');area.innerHTML='<div class="empty">正在读取识别结果…</div>';
  try{
    const data=await backendRequest('/api/imports/batches/'+encodeURIComponent(batchId));renderScanBatch(data);
  }catch(error){area.innerHTML='<div class="scan-offline">'+esc(error.message)+'</div>';}
}

function renderScanBatch(data){
  const area=$('#scanBatchList'),batch=data.batch,fields=data.fields||[],pending=fields.filter(x=>x.review_status==='pending').length;
  area.innerHTML='<div class="scan-detail-head"><button class="btn-ghost" id="backToBatches">← 返回批次</button><div><b>'+esc(scanStatusName[batch.status]||batch.status)+'</b><small>'+batch.processed_documents+' / '+batch.total_documents+' 份 · '+pending+' 个字段待复核</small></div></div>'+
    '<div class="scan-documents">'+data.documents.map(doc=>'<article><span>📄</span><div><b>'+esc(doc.original_name)+'</b><small>'+doc.page_count+' 页 · '+esc(scanStatusName[doc.status]||doc.status)+'</small></div></article>').join('')+'</div>'+
    (batch.status==='processing'?'<div class="scan-processing">⏳ 正在本机逐页识别，请稍后刷新。<button class="btn-ghost" id="refreshScanBatch">刷新进度</button></div>':'')+
    '<section class="scan-fields"><h4>专业字段复核</h4><p>请对照页码和证据片段修改后确认；医疗关键字段即使置信度高也不会自动通过。</p>'+(fields.map(renderScanField).join('')||'<div class="empty">尚未提取到候选字段。可等待识别完成，或由专业人员在正式档案中手工补录。</div>')+'</section>'+
    (batch.status==='review'?renderScanCommit(batch.batch_id,pending):'');
  $('#backToBatches').onclick=refreshScanBatches;if($('#refreshScanBatch'))$('#refreshScanBatch').onclick=()=>openScanBatch(batch.batch_id);
  $$('[data-field-approve]',area).forEach(button=>button.onclick=()=>reviewScanField(button.dataset.fieldApprove,'approved'));
  $$('[data-field-reject]',area).forEach(button=>button.onclick=()=>reviewScanField(button.dataset.fieldReject,'rejected'));
  if($('#commitScanBatch'))$('#commitScanBatch').onclick=()=>commitScanBatch(batch.batch_id);
}

function renderScanField(field){
  const confidence=Math.round(field.confidence*100),state=field.review_status;
  return '<article class="scan-field '+state+'" id="field_'+field.field_id+'"><header><b>'+esc(field.field_label)+'</b><span class="confidence '+(confidence>=90?'high':confidence>=75?'mid':'low')+'">OCR '+confidence+'%</span><small>第 '+field.page_number+' 页</small></header><input data-field-value="'+field.field_id+'" value="'+esc(field.reviewed_value??field.extracted_value)+'" '+(state!=='pending'?'disabled':'')+'><blockquote>'+esc(field.evidence?.snippet||'无文本片段，请查看原档复核')+'</blockquote><footer>'+(state==='pending'?'<button data-field-reject="'+field.field_id+'">排除</button><button class="approve" data-field-approve="'+field.field_id+'">确认字段</button>':'<strong>'+(state==='approved'?'✓ 已由专业人员确认':'— 已排除')+'</strong>')+'</footer></article>';
}

async function reviewScanField(fieldId,decision){
  const input=$('[data-field-value="'+fieldId+'"]'),button=$('[data-field-'+(decision==='approved'?'approve':'reject')+'="'+fieldId+'"]');button.disabled=true;
  try{await backendRequest('/api/imports/review',{method:'POST',body:JSON.stringify({fieldId,decision,value:input.value})});const batchId=$('#commitScanBatch')?.dataset.batchId||$('.scan-detail-head')?.dataset.batchId;toast(decision==='approved'?'字段已确认':'字段已排除');await openScanBatch(currentScanBatchId());}
  catch(error){toast(error.message);button.disabled=false;}
}

function currentScanBatchId(){const button=$('#commitScanBatch');return button?.dataset.batchId||window.__scanBatchId;}

function renderScanCommit(batchId,pending){
  window.__scanBatchId=batchId;
  const domainNames={A:'注意与感知',B:'记忆',C:'执行与逻辑',D:'语言沟通',E:'社会情绪',F:'生活适应'};
  return '<section class="scan-commit"><h4>确认写入正式档案</h4><div class="field"><label>关联儿童</label><select id="scanChildId"><option value="">请选择授权儿童</option>'+children.filter(x=>dbCanAccessChild(x.id)).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></div><p>六维分数由专业人员结合已确认量表填写。全部填写才生成初始画像；留空则只导入历史档案，不让AI猜分。</p><div class="scan-domain-scores">'+Object.entries(domainNames).map(([key,name])=>'<label>'+name+'<input data-scan-score="'+key+'" type="number" min="0" max="100" placeholder="0-100"></label>').join('')+'</div><button class="btn-primary" id="commitScanBatch" data-batch-id="'+batchId+'" '+(pending?'disabled':'')+'>'+(pending?'请先完成全部字段复核':'签署并正式入档')+'</button></section>';
}

async function commitScanBatch(batchId){
  const childId=$('#scanChildId').value;if(!childId){toast('请选择目标儿童');return;}
  const scoreInputs=$$('[data-scan-score]'),filled=scoreInputs.filter(x=>x.value!=='');if(filled.length!==0&&filled.length!==6){toast('六维分数需全部填写或全部留空');return;}
  const scores={};filled.forEach(input=>scores[input.dataset.scanScore]=+input.value);
  const button=$('#commitScanBatch');button.disabled=true;button.textContent='正在写入数据库…';
  try{const result=await backendRequest('/api/imports/commit',{method:'POST',body:JSON.stringify({batchId,childId,scores})});toast(result.profileId?'档案与初始画像已保存':'历史档案已保存');await openScanBatch(batchId);}
  catch(error){toast(error.message);button.disabled=false;button.textContent='签署并正式入档';}
}
