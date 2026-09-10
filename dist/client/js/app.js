/* ============ 进入主界面 ============ */
function enterApp(){
  $("#login").classList.add("hidden");
  $("#main").classList.remove("hidden");
  $("#tabbar").classList.remove("hidden");
  $("#roleBadge").textContent=ROLE_NAME[currentRole];
  $("#roleBadge").className="role-badge "+currentRole;
  if(activeChild&&!children.find(c=>c.id===activeChild))activeChild=null;
  if(!activeChild&&children.length)activeChild=children[0].id;
  checkAcc();
  showTab("archive");
}
function checkAcc(){
  const n=records.length;
  const b=$("#accBanner");
  if(n>=30){b.classList.remove("hidden");b.innerHTML=svg("clock","#E07B2E",16)+" 数据已积累 "+n+" 条，建议点右上角「备份」导出 JSON 防丢失。";}
  else b.classList.add("hidden");
}

/* ============ 今日任务 ============ */
function taskModuleId(task){
  const raw=task?.module;
  const direct=typeof TRAINING_CATALOG!=='undefined'&&TRAINING_CATALOG.find(x=>x.id===raw);
  if(direct)return direct.id;
  const plan=typeof effectiveClinicalPlan==='function'?effectiveClinicalPlan(task?.childId):null;
  const planned=(plan?.rows||[]).find(row=>TRAINING_CATALOG.find(item=>item.id===row.moduleId)?.engine===raw);
  return planned?.moduleId||raw;
}
function renderToday(){
  const list=$("#todayList");
  const canAccess=childId=>typeof dbCanAccessChild!=='function'||dbCanAccessChild(childId);
  const todo=tasks.filter(t=>!t.done&&canAccess(t.childId)).filter(t=>{
    if(!['parent','child'].includes(currentRole))return true;
    const moduleId=taskModuleId(t);
    return typeof isModuleInEffectivePlan!=='function'||isModuleInEffectivePlan(t.childId,moduleId);
  });
  if(!todo.length){
    const emptyText=currentRole==="parent"?"今天没有已下发的陪练任务，可以记录孩子状态或稍后再来":
      currentRole==="teacher"?"今天没有待训练或复核任务，可在「AI方案」查看并调整排程":"今天没有待训练任务";
    list.innerHTML='<div class="empty">'+emptyText+'</div>';return;
  }
  list.innerHTML=todo.map(t=>{
    const child=children.find(c=>c.id===t.childId),moduleId=taskModuleId(t);
    const item=typeof TRAINING_CATALOG!=='undefined'?TRAINING_CATALOG.find(x=>x.id===moduleId):null;
    const over=t.date<todayStr();
    const modName=item?.name||({attention:"注意力",memory:"记忆力",logic:"逻辑力"}[t.module]||"训练任务");
    const engine=item?.engine||t.module,color={attention:"#4F86F7",memory:"#10B981",logic:"#8B5CF6"}[engine]||"#4F86F7";
    return '<div class="task'+(over?" over":"")+'">'+
      '<div class="tic" style="background:'+color+'22">'+svg(engine,color,26)+'</div>'+
      '<div class="meta"><b>'+esc(child?child.name:"未知")+' · '+esc(modName)+'</b>'+
      '<small>'+(over?'<span class="over-tag">已逾期（'+t.date+'）</span>':'排期 '+t.date)+' · 难度 '+t.difficulty+'</small></div>'+
      '<button class="go-btn" data-task="'+t.id+'">'+svg("arrow","#fff",18)+'开始</button></div>';
  }).join("");
  $$("#todayList .go-btn").forEach(b=>b.onclick=()=>{
    const t=tasks.find(x=>x.id===b.dataset.task);
    if(!t||!PERMS[currentRole].train){toast("当前身份无训练权限");return;}
    if(!canAccess(t.childId)){toast("当前账号未获得该儿童的数据授权");return;}
    const moduleId=taskModuleId(t);
    openTrainer(t.childId,moduleId,t.difficulty,()=>{t.done=true;saveAll();renderToday();});
  });
}
/* ============ Tab 切换 ============ */
let curTab="archive";
function showTab(tab){
  curTab=tab;
  $$(".tab").forEach(t=>t.classList.toggle("on",t.dataset.tab===tab));
  const c=$("#tabContent");
  if(tab==="archive")renderArchive(c);
  else if(tab==="train")renderTrain(c);
  else if(tab==="ai")renderAI(c);
  else if(tab==="report")renderReport(c);
  else if(tab==="setting")renderSetting(c);
  renderToday();
  window.scrollTo(0,0);
}
$$(".tab").forEach(t=>t.onclick=()=>showTab(t.dataset.tab));
