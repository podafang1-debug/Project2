/* ============ 档案 Tab ============ */
function renderArchive(c){
  const canManage=dbCan(DB_ACTIONS.PROFILE_EDIT)||dbCan(DB_ACTIONS.PROFILE_MANAGE);
  let html='<div class="archive-heading"><div><div class="sec-title">'+svg("user","#4F86F7",20)+'儿童训练档案</div><p>按儿童查看建档概况、能力起点和训练状态</p></div>'+(canManage?'<button class="btn-primary" id="addChild">+ 新建训练档案</button>':'')+'</div>';
  if(children.length)html+='<section class="archive-finder"><label for="childSearch">🔎 搜索儿童</label><div><input id="childSearch" type="search" autocomplete="off" placeholder="输入儿童姓名或化名（支持部分文字）"><select id="childStatusFilter"><option value="">全部状态</option><option>在训</option><option>暂停</option><option>结业</option></select><button id="clearChildSearch" class="btn-ghost" type="button">清除</button></div><small id="childSearchResult">共 '+children.length+' 份儿童档案</small></section>';
  if(!children.length){html+='<div class="empty">还没有档案，点击上方按钮建立第一位儿童档案</div>';}
  if(children.length)html+='<div class="child-archive-grid" id="childArchiveGrid">';
  children.forEach(ch=>{
    const b=ch.baseline;
    const childRecords=records.filter(row=>row.childId===ch.id&&row.source!=='baseline-game'),recent=childRecords.slice(-20),accuracy=recent.length?Math.round(recent.filter(row=>row.correct).length/recent.length*100):null;
    const status=ch.status||'在训',profileReady=!!getCurrentAbilityProfile?.(ch.id);
    html+='<article class="child-card archive-child-card" data-child-id="'+esc(ch.id)+'" data-child-name="'+esc(ch.name)+'" data-status="'+esc(status)+'">'+
      '<header><div class="avatar" style="background:'+ch.avatarColor+'">'+esc(ch.name.slice(0,1))+'</div><div class="child-card-title"><b>'+esc(ch.name)+'</b><small>出生年份 '+ch.birthYear+' · '+(new Date().getFullYear()-ch.birthYear)+' 岁左右</small></div><span class="child-status status-'+esc(status)+'">'+esc(status)+'</span></header>'+
      '<div class="child-overview"><div><small>语言水平</small><b>'+esc(ch.languageLevel||'待补充')+'</b></div><div><small>生活自理</small><b>'+esc(ch.adlLevel||'待补充')+'</b></div><div><small>训练记录</small><b>'+childRecords.length+' 条</b></div><div><small>近期正确率</small><b>'+(accuracy===null?'暂无':accuracy+'%')+'</b></div></div>'+
      '<div class="info"><small class="archive-date">建档于 '+fmtDate(ch.createdAt)+' · '+(profileReady?'已有六维画像':'画像待完善')+'</small>'+
      baseBar("注意力",b.attention,"#4F86F7")+baseBar("记忆力",b.memory,"#10B981")+baseBar("逻辑力",b.logic,"#8B5CF6")+
      (ch.note?'<span class="pill">备注：'+esc(ch.note)+'</span>':'')+'</div>'+
      (canManage?'<footer><button class="mini-btn" data-edit="'+ch.id+'">查看/编辑档案</button></footer>':'')+
      '</article>';
  });
  if(children.length)html+='</div><div class="empty child-no-result hidden" id="childNoResult">没有找到匹配的儿童档案，请尝试减少关键词。</div>';
  c.innerHTML=html;
  const filterArchiveChildren=()=>{
    const query=($('#childSearch')?.value||'').trim().toLocaleLowerCase(),status=$('#childStatusFilter')?.value||'';
    let visible=0;
    $$('.archive-child-card',c).forEach(card=>{const matchedName=!query||card.dataset.childName.toLocaleLowerCase().includes(query),matchedStatus=!status||card.dataset.status===status,show=matchedName&&matchedStatus;card.classList.toggle('hidden',!show);if(show)visible++;});
    $('#childSearchResult').textContent=query||status?'找到 '+visible+' 份匹配档案':'共 '+children.length+' 份儿童档案';
    $('#childNoResult').classList.toggle('hidden',visible!==0);
  };
  if($('#childSearch'))$('#childSearch').oninput=filterArchiveChildren;
  if($('#childStatusFilter'))$('#childStatusFilter').onchange=filterArchiveChildren;
  if($('#clearChildSearch'))$('#clearChildSearch').onclick=()=>{$('#childSearch').value='';$('#childStatusFilter').value='';filterArchiveChildren();$('#childSearch').focus();};
  if(canManage){
    $("#addChild").onclick=()=>openChildEditor(null);
    $$('[data-edit]',c).forEach(b=>b.onclick=()=>openChildEditor(b.dataset.edit));
  }
}
function baseBar(name,v,color){
  return '<div style="font-size:12px;color:var(--sub);margin-top:6px">'+name+' · '+v+'<div class="bar"><i style="width:'+v+'%;background:'+color+'"></i></div></div>';
}
function openChildEditor(id){
function purgeChildFromLocalState(id){
  children=children.filter(item=>item.id!==id);records=records.filter(item=>item.childId!==id);tasks=tasks.filter(item=>item.childId!==id);delete plans[id];
  relationalDb.userChildBindings=relationalDb.userChildBindings.filter(item=>item.childId!==id);
  relationalDb.abilityProfiles=relationalDb.abilityProfiles.filter(item=>item.childId!==id);
  relationalDb.aiInferences=relationalDb.aiInferences.filter(item=>item.childId!==id);
  Object.keys(enhancedState).forEach(key=>{if(Array.isArray(enhancedState[key]))enhancedState[key]=enhancedState[key].filter(item=>item?.childId!==id);});
  if(activeChild===id)activeChild=children[0]?.id||null;
  saveDatabase();saveEnhanced();saveAll();
}

  const ch=id?children.find(x=>x.id===id):null;
  const isEdit=!!ch;
  const s=ch||{name:"",avatarColor:"#4F86F7",birthYear:2018,diagnosis:"",severity:"待评估",dq:"",languageLevel:"未填写",adlLevel:"未填写",status:"在训",baseline:{attention:50,memory:50,logic:50},note:""};
  const colors=["#4F86F7","#F7A14F","#10B981","#8B5CF6","#EF4444","#06B6D4"];
  const sheet=$("#sheet");
  sheet.innerHTML='<h3>'+(isEdit?"编辑档案":"新建训练档案")+'<button class="x" id="closeSheet">'+svg("cross","currentColor",18)+'</button></h3>'+
    '<div class="field"><label>儿童称呼（建议用化名）</label><input id="f_name" value="'+esc(s.name)+'" placeholder="如：小明（化名）"></div>'+
    '<div class="field"><label>出生年份</label><input id="f_year" type="number" value="'+s.birthYear+'"></div>'+
    '<div class="field"><label>已有诊断/伴随情况（仅转录必要信息）</label><input id="f_diagnosis" value="'+esc(s.diagnosis||'')+'" placeholder="平台不自行诊断"></div>'+
    '<div class="base3"><div class="b"><label>诊断来源</label><input id="f_diagnosis_source" value="'+esc(s.diagnosisSource||'')+'" placeholder="机构/专业人员"></div><div class="b"><label>诊断日期</label><input id="f_diagnosis_date" type="date" value="'+esc(s.diagnosisDate||'')+'"></div></div>'+
    '<div class="base3">'+
      '<div class="b"><label>障碍程度</label><select id="f_severity"><option>'+esc(s.severity||'待评估')+'</option><option>轻度</option><option>中度</option><option>重度</option><option>极重度</option></select></div>'+
      '<div class="b"><label>DQ 分数</label><input id="f_dq" type="number" min="0" max="200" value="'+esc(s.dq||'')+'"></div>'+
      '<div class="b"><label>档案状态</label><select id="f_status"><option>'+esc(s.status||'在训')+'</option><option>在训</option><option>暂停</option><option>结业</option></select></div></div>'+
    '<div class="base3"><div class="b"><label>DQ 工具及版本</label><input id="f_dq_tool" value="'+esc(s.dqToolVersion||'')+'" placeholder="量表名/版次"></div><div class="b"><label>DQ 评估日期</label><input id="f_dq_date" type="date" value="'+esc(s.dqAssessedAt||'')+'"></div></div>'+
    '<div class="base3"><div class="b"><label>语言水平</label><input id="f_language" value="'+esc(s.languageLevel||'未填写')+'"></div><div class="b"><label>ADL 水平</label><input id="f_adl" value="'+esc(s.adlLevel||'未填写')+'"></div></div>'+
    '<div class="field"><label>头像颜色</label><div id="colorPick" style="display:flex;gap:8px;flex-wrap:wrap">'+
      colors.map(c=>'<button data-c="'+c+'" style="width:42px;height:42px;border-radius:12px;background:'+c+';border:3px solid '+(c===s.avatarColor?"#1F2430":"transparent")+'"></button>').join("")+'</div></div>'+
    '<div class="field"><label>平台训练起点指数（0-100，非标准化量表）</label>'+
      '<div class="base3">'+
      ['attention','memory','logic'].map(d=>{const n={attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d];return '<div class="b"><label>'+n+'</label><input id="b_'+d+'" type="number" min="0" max="100" value="'+s.baseline[d]+'"></div>';}).join("")+
      '</div></div>'+
    '<button class="btn-ghost" id="assessBtn" style="margin:4px 0 4px;display:flex;align-items:center;justify-content:center;gap:8px">'+svg("brain","#4F86F7",18)+' 平台训练起点小游戏</button>'+
    '<div class="field"><label>备注（偏好/敏感点/沟通方式）</label><textarea id="f_note" rows="2" placeholder="如：对声音敏感，偏爱图形卡片">'+esc(s.note)+'</textarea></div>'+
    (isEdit?'<button class="btn-ghost danger" id="delChild">删除该档案（含其训练记录）</button>':'')+
    '<button class="btn-primary" id="saveChild" style="margin-top:12px">保存档案</button>';
  openMask();
  let pickC=s.avatarColor;
  $$("#colorPick button").forEach(b=>b.onclick=()=>{pickC=b.dataset.c;$$("#colorPick button").forEach(x=>x.style.borderColor="transparent");b.style.borderColor="#1F2430";});
  $("#closeSheet").onclick=closeMask;
  $("#assessBtn").onclick=()=>openBaselineAssessment(s.name,sc=>{
    ["attention","memory","logic"].forEach(d=>{const el=$("#b_"+d);if(el)el.value=sc[d];});
  });
  $("#saveChild").onclick=async()=>{
    const name=$("#f_name").value.trim();
    if(!name){toast("请填写称呼");return;}
    const diagnosis=$("#f_diagnosis").value.trim(),diagnosisSource=$("#f_diagnosis_source").value.trim(),diagnosisDate=$("#f_diagnosis_date").value,dq=$("#f_dq").value?clamp(+$("#f_dq").value,0,200):"",dqToolVersion=$("#f_dq_tool").value.trim(),dqAssessedAt=$("#f_dq_date").value;
    if(diagnosis&&(!diagnosisSource||!diagnosisDate)){toast("填写诊断时必须同时记录来源和日期");return;}
    if(dq!==""&&(!dqToolVersion||!dqAssessedAt)){toast("填写 DQ 时必须同时记录评估工具版本和日期");return;}
    const identity=BACKEND_API.user;
    const obj={name,birthYear:+$("#f_year").value||2018,avatarColor:pickC,diagnosis,diagnosisSource,diagnosisDate,diagnosisRecordedByUserId:diagnosis?identity?.userId||null:null,severity:$("#f_severity").value,dq,dqToolVersion,dqAssessedAt,status:$("#f_status").value,languageLevel:$("#f_language").value.trim(),adlLevel:$("#f_adl").value.trim(),
      baseline:{attention:clamp(+$("#b_attention").value,0,100),memory:clamp(+$("#b_memory").value,0,100),logic:clamp(+$("#b_logic").value,0,100)},
      note:$("#f_note").value.trim()};
    if(isEdit){obj.id=ch.id;obj.createdAt=ch.createdAt;}else{obj.id=uid();obj.createdAt=new Date().toISOString();}
    const saved=await backendSaveChild(obj);if(BACKEND_API.available&&!saved){toast('数据库保存失败，档案未更改');return;}
    if(isEdit)Object.assign(ch,obj);else{children.push(obj);if(!activeChild)activeChild=obj.id;plans[obj.id]=genPlan(obj.id);}
    syncDatabaseBindings();saveAll();closeMask();renderArchive($("#tabContent"));toast("已保存");
  };
  if(isEdit)$("#delChild").onclick=()=>confirmBox("确认删除该儿童档案及其全部关联记录？此操作不可恢复。",async()=>{
    if(BACKEND_API.available&&!await backendDeleteChild(id)){toast("数据库删除失败，已保留本地档案");return;}
    purgeChildFromLocalState(id);
    closeMask();renderArchive($("#tabContent"));toast("档案及关联记录已删除");
  });
}
function clamp(v,a,b){v=isNaN(v)?a:v;return Math.max(a,Math.min(b,v));}
/* 无障碍开关行 */
function toggleRow(key,label){
  const on=!!settings[key];
  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line)">'+
    '<span style="font-size:14px">'+label+'</span>'+
    '<button class="switch'+(on?" on":"")+'" data-tg="'+key+'" style="background:'+(on?"var(--green)":"#CBD5E1")+'"><span></span></button></div>';
}
