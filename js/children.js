/* ============ 档案 Tab ============ */
function renderArchive(c){
  const p=PERMS[currentRole];
  let html='<div class="sec-title">'+svg("user","#4F86F7",20)+'儿童训练档案</div>';
  if(p.manage)html+='<button class="btn-primary" id="addChild" style="margin-bottom:14px">+ 新建训练档案</button>';
  if(!children.length){html+='<div class="empty">还没有档案，点击上方按钮建立第一位儿童档案</div>';}
  children.forEach(ch=>{
    const b=ch.baseline;
    html+='<div class="child-card">'+
      '<div class="avatar" style="background:'+ch.avatarColor+'">'+(ch.name.slice(0,1))+'</div>'+
      '<div class="info"><b>'+esc(ch.name)+'</b><small>出生年份 '+ch.birthYear+' · 建档于 '+fmtDate(ch.createdAt)+'</small>'+
      baseBar("注意力",b.attention,"#4F86F7")+baseBar("记忆力",b.memory,"#10B981")+baseBar("逻辑力",b.logic,"#8B5CF6")+
      (ch.note?'<span class="pill">备注：'+esc(ch.note)+'</span>':'')+'</div>'+
      (p.manage?'<button class="mini-btn" data-edit="'+ch.id+'">编辑</button>':'')+
      '</div>';
  });
  c.innerHTML=html;
  if(p.manage){
    $("#addChild").onclick=()=>openChildEditor(null);
    $$('[data-edit]',c).forEach(b=>b.onclick=()=>openChildEditor(b.dataset.edit));
  }
}
function baseBar(name,v,color){
  return '<div style="font-size:12px;color:var(--sub);margin-top:6px">'+name+' · '+v+'<div class="bar"><i style="width:'+v+'%;background:'+color+'"></i></div></div>';
}
function openChildEditor(id){
  const ch=id?children.find(x=>x.id===id):null;
  const isEdit=!!ch;
  const s=ch||{name:"",avatarColor:"#4F86F7",birthYear:2018,diagnosis:"",severity:"待评估",dq:"",languageLevel:"未填写",adlLevel:"未填写",status:"在训",baseline:{attention:50,memory:50,logic:50},note:""};
  const colors=["#4F86F7","#F7A14F","#10B981","#8B5CF6","#EF4444","#06B6D4"];
  const sheet=$("#sheet");
  sheet.innerHTML='<h3>'+(isEdit?"编辑档案":"新建训练档案")+'<button class="x" id="closeSheet">'+svg("cross","currentColor",18)+'</button></h3>'+
    '<div class="field"><label>儿童称呼（建议用化名）</label><input id="f_name" value="'+esc(s.name)+'" placeholder="如：小明（化名）"></div>'+
    '<div class="field"><label>出生年份</label><input id="f_year" type="number" value="'+s.birthYear+'"></div>'+
    '<div class="field"><label>诊断/伴随情况（仅记录必要信息）</label><input id="f_diagnosis" value="'+esc(s.diagnosis||'')+'" placeholder="由有资质的专业人员填写"></div>'+
    '<div class="base3">'+
      '<div class="b"><label>障碍程度</label><select id="f_severity"><option>'+esc(s.severity||'待评估')+'</option><option>轻度</option><option>中度</option><option>重度</option><option>极重度</option></select></div>'+
      '<div class="b"><label>DQ 分数</label><input id="f_dq" type="number" min="0" max="200" value="'+esc(s.dq||'')+'"></div>'+
      '<div class="b"><label>档案状态</label><select id="f_status"><option>'+esc(s.status||'在训')+'</option><option>在训</option><option>暂停</option><option>结业</option></select></div></div>'+
    '<div class="base3"><div class="b"><label>语言水平</label><input id="f_language" value="'+esc(s.languageLevel||'未填写')+'"></div><div class="b"><label>ADL 水平</label><input id="f_adl" value="'+esc(s.adlLevel||'未填写')+'"></div></div>'+
    '<div class="field"><label>头像颜色</label><div id="colorPick" style="display:flex;gap:8px;flex-wrap:wrap">'+
      colors.map(c=>'<button data-c="'+c+'" style="width:42px;height:42px;border-radius:12px;background:'+c+';border:3px solid '+(c===s.avatarColor?"#1F2430":"transparent")+'"></button>').join("")+'</div></div>'+
    '<div class="field"><label>认知评估基线（0-100，由标准化评估得出）</label>'+
      '<div class="base3">'+
      ['attention','memory','logic'].map(d=>{const n={attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d];return '<div class="b"><label>'+n+'</label><input id="b_'+d+'" type="number" min="0" max="100" value="'+s.baseline[d]+'"></div>';}).join("")+
      '</div></div>'+
    '<button class="btn-ghost" id="assessBtn" style="margin:4px 0 4px;display:flex;align-items:center;justify-content:center;gap:8px">'+svg("brain","#4F86F7",18)+' 引导式基线评估（自动生成分数）</button>'+
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
  $("#saveChild").onclick=()=>{
    const name=$("#f_name").value.trim();
    if(!name){toast("请填写称呼");return;}
    const obj={name,birthYear:+$("#f_year").value||2018,avatarColor:pickC,diagnosis:$("#f_diagnosis").value.trim(),severity:$("#f_severity").value,dq:$("#f_dq").value?clamp(+$("#f_dq").value,0,200):"",status:$("#f_status").value,languageLevel:$("#f_language").value.trim(),adlLevel:$("#f_adl").value.trim(),
      baseline:{attention:clamp(+$("#b_attention").value,0,100),memory:clamp(+$("#b_memory").value,0,100),logic:clamp(+$("#b_logic").value,0,100)},
      note:$("#f_note").value.trim()};
    if(isEdit){Object.assign(ch,obj);}else{obj.id=uid();obj.createdAt=new Date().toISOString();children.push(obj);if(!activeChild)activeChild=obj.id;plans[obj.id]=genPlan(obj.id);}
    saveAll();closeMask();renderArchive($("#tabContent"));toast("已保存");
  };
  if(isEdit)$("#delChild").onclick=()=>confirmBox("确认删除该儿童档案及其全部训练记录？此操作不可恢复。",()=>{
    children=children.filter(x=>x.id!==id);records=records.filter(r=>r.childId!==id);tasks=tasks.filter(t=>t.childId!==id);delete plans[id];
    if(activeChild===id)activeChild=children[0]?children[0].id:null;saveAll();closeMask();renderArchive($("#tabContent"));toast("已删除");
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
