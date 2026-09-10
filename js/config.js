/* ============ 权限 ============ */
const PERMS={
  teacher:{manage:true,train:true,viewReport:true,viewAI:true,settings:true,accounts:true,org:true,audit:true,content:true},
  parent :{manage:false,train:true,viewReport:true,viewAI:true,settings:false,accounts:false},
  child  :{manage:false,train:true,viewReport:true,viewAI:false,settings:false,accounts:false}
};
const ROLE_NAME={teacher:"康复专业人员",parent:"家长",child:"儿童"};
