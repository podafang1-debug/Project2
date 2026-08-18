/* ============ 状态 ============ */
let children=lsGet("children",null);
let records=lsGet("records",null);
let plans=lsGet("plans",{});
let tasks=lsGet("tasks",null);
let accounts=lsGet("accounts",null);
let settings=lsGet("settings",null);
let currentRole=lsGet("session",null);
let activeChild=lsGet("activeChild",null);

if(!accounts)accounts={teacher:{pin:"1234"},parent:{pin:"1234"},admin:{pin:"8888"}};
// 六角色旧版本无损迁移为四角色：医疗并入专业人员，内容审核并入复合管理员。
if(currentRole==='doctor')currentRole='teacher';
if(currentRole==='reviewer')currentRole='admin';
delete accounts.doctor;delete accounts.reviewer;lsSet('accounts',accounts);lsSet('session',currentRole);
if(!settings)settings={sample:true};
// 无障碍偏好默认值（仅本机）
settings=Object.assign({sample:true,hc:false,large:false,audio:true,speechRate:.82,volume:.3,reducedMotion:false},settings);

/* 预置示例数据（铁律6） */
function seed(){
  const t=yestStr();
  children=[
    {id:"c1",name:"小明（化名）",avatarColor:"#4F86F7",birthYear:2018,baseline:{attention:45,memory:55,logic:40},note:"对声音敏感，偏爱动物与图形卡片",createdAt:new Date().toISOString()},
    {id:"c2",name:"乐乐（化名）",avatarColor:"#F7A14F",birthYear:2019,baseline:{attention:60,memory:50,logic:65},note:"视觉偏好强，能跟读简单指令",createdAt:new Date().toISOString()}
  ];
  records=[];
  // 为 c1 生成一段历史（注意力/记忆/逻辑，含进步趋势）
  const mk=(childId,module,diff,correct,daysAgo,rt)=>({id:uid(),childId,module,difficulty:diff,correct,reactionMs:rt||0,errorType:correct?"":(module==="memory"?"mismatch":"wrong_target"),ts:Date.now()-daysAgo*86400000});
  for(let i=0;i<6;i++){records.push(mk("c1","attention",1,i<2?false:true,12-i,900+Math.random()*400));}
  for(let i=0;i<6;i++){records.push(mk("c1","attention",2,i<4?false:true,6-i,800+Math.random()*300));}
  for(let i=0;i<5;i++){records.push(mk("c1","memory",2,i<3?false:true,5-i));}
  for(let i=0;i<5;i++){records.push(mk("c1","logic",2,i<2?false:true,4-i));}
  // c2 少量数据
  for(let i=0;i<4;i++){records.push(mk("c2","logic",3,i<1?false:true,3-i));}
  for(let i=0;i<4;i++){records.push(mk("c2","attention",2,i<2?false:true,3-i));}
  tasks=[
    {id:uid(),childId:"c1",module:"attention",difficulty:2,date:t,done:false,by:"teacher"},
    {id:uid(),childId:"c1",module:"memory",difficulty:2,date:todayStr(),done:false,by:"teacher"},
    {id:uid(),childId:"c2",module:"logic",difficulty:3,date:todayStr(),done:false,by:"teacher"}
  ];
  plans={c1:genPlan("c1"),c2:genPlan("c2")};
  settings.sample=false;   // 仅首次预置示例，之后不再覆盖用户数据
  saveAll(true);
}
function saveAll(seedMode){
  lsSet("children",children);lsSet("records",records);lsSet("plans",plans);lsSet("tasks",tasks);
  lsSet("accounts",accounts);lsSet("settings",settings);
  if(!seedMode){lsSet("activeChild",activeChild);}
}
