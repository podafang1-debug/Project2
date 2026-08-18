/* ============ 权限 ============ */
const PERMS={
  teacher:{manage:true,train:true,viewReport:true,viewAI:true,settings:true,accounts:false},
  parent :{manage:false,train:true,viewReport:true,viewAI:true,settings:false,accounts:false},
  admin  :{manage:true,train:false,viewReport:true,viewAI:true,settings:true,accounts:true}
};
const ROLE_NAME={teacher:"康复医疗专业人员",parent:"家长",admin:"内容与机构管理员"};
