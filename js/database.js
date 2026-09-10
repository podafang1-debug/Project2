/* ============ 本地演示数据库：主键、外键与权限关系 ============ */
/**
 * 浏览器仅保留离线兼容镜像；Python 服务可用时，SQLite 会话和 user_child_bindings 才是权限依据。
 * 前端 dbCan/dbCanAccessChild 只负责界面裁剪，不能替代服务端鉴权。
 */
const DB_KEY='relationalDbV1';
const DB_ACTIONS={
  TRAIN:'training.execute',PROGRESS_SIMPLE:'progress.simple',PROGRESS_AUTH:'progress.authorized',PROGRESS_ANON:'progress.anonymous',
  PROFILE_LIMITED:'profile.limited',PROFILE_EDIT:'profile.edit',PROFILE_MANAGE:'profile.manage',ASSESS_LIMITED:'assessment.limited',ASSESS_EDIT:'assessment.edit',
  AI_REVIEW:'ai.review',CONTENT_SUGGEST:'content.suggest',CONTENT_PUBLISH:'content.publish',ORG_MANAGE:'organization.manage',
  ACCOUNT_MANAGE:'account.manage',OPERATIONS_READ:'operations.read',CONSENT_GOVERN:'consent.govern',SHARING_MANAGE:'sharing.manage',BACKUP_GOVERN:'backup.govern',
  CARE_WRITE:'care.write',CARE_SIGN:'care.sign',RISK_FLAG:'risk.flag',RISK_RESOLVE:'risk.resolve',
  AUDIT_LIMITED:'audit.limited',AUDIT_FULL:'audit.full',BACKUP_LIMITED:'backup.limited',BACKUP_FULL:'backup.full'
};

function createDemoDatabase(){
  const roleDefs=[
    ['role_child','child','儿童'],['role_parent','parent','家长'],
    ['role_teacher','teacher','康复专业人员']
  ];
  const permissionCodes=[...new Set(Object.values(DB_ACTIONS))];
  const roles=roleDefs.map(([roleId,code,name])=>({roleId,code,name}));
  const permissions=permissionCodes.map((code,index)=>({permissionId:'perm_'+String(index+1).padStart(2,'0'),code}));
  const roleCodes={
    child:[DB_ACTIONS.TRAIN,DB_ACTIONS.PROGRESS_SIMPLE],
    parent:[DB_ACTIONS.TRAIN,DB_ACTIONS.PROGRESS_AUTH,DB_ACTIONS.PROFILE_LIMITED,DB_ACTIONS.ASSESS_LIMITED],
    teacher:[DB_ACTIONS.TRAIN,DB_ACTIONS.PROGRESS_AUTH,DB_ACTIONS.PROFILE_EDIT,DB_ACTIONS.ASSESS_EDIT,DB_ACTIONS.AI_REVIEW,DB_ACTIONS.CARE_WRITE,DB_ACTIONS.CARE_SIGN,DB_ACTIONS.RISK_FLAG,DB_ACTIONS.RISK_RESOLVE,DB_ACTIONS.CONTENT_SUGGEST,DB_ACTIONS.AUDIT_LIMITED,DB_ACTIONS.PROGRESS_ANON,DB_ACTIONS.CONTENT_PUBLISH,DB_ACTIONS.ORG_MANAGE,DB_ACTIONS.ACCOUNT_MANAGE,DB_ACTIONS.OPERATIONS_READ,DB_ACTIONS.CONSENT_GOVERN,DB_ACTIONS.SHARING_MANAGE,DB_ACTIONS.BACKUP_GOVERN,DB_ACTIONS.AUDIT_FULL]
  };
  const rolePermissions=[];
  Object.entries(roleCodes).forEach(([roleCode,codes])=>codes.forEach(code=>rolePermissions.push({rolePermissionId:'rp_'+roleCode+'_'+code.replace(/\W/g,'_'),roleId:roles.find(r=>r.code===roleCode).roleId,permissionId:permissions.find(p=>p.code===code).permissionId})));
  const users=[];
  return {schemaVersion:2,roles,permissions,rolePermissions,users,
    organizations:[{organizationId:'org_001',name:'康宇儿童发展中心',status:'active'}],
    classes:[{classId:'class_001',organizationId:'org_001',name:'启航班'},{classId:'class_002',organizationId:'org_001',name:'成长班'}],
    // childId 在儿童示例数据初始化后由 syncDatabaseBindings() 写入，绑定关系有独立主键和有效期。
    userChildBindings:[],consents:[]};
}

let relationalDb=lsGet(DB_KEY,null)||createDemoDatabase();
// 浏览器镜像不再保存账号。清理所有历史示例身份和由它们生成的本地授权。
const legacyDemoUserIds=new Set(['user_child','user_parent','user_teacher','user_admin','user_doctor','user_reviewer']);
relationalDb.users=(relationalDb.users||[]).filter(user=>!legacyDemoUserIds.has(user.userId));
relationalDb.userChildBindings=(relationalDb.userChildBindings||[]).filter(binding=>!legacyDemoUserIds.has(binding.userId));
relationalDb.schemaVersion=2;
saveDatabase();
// 轻量迁移：旧浏览器数据库补齐AI画像表，不清空任何既有数据。
relationalDb.abilityProfiles=relationalDb.abilityProfiles||[];
relationalDb.aiInferences=relationalDb.aiInferences||[];
// 权限迁移：仅将旧管理员角色及其治理能力并入康复专业人员。
{
  let teacherRole=relationalDb.roles.find(x=>x.code==='teacher');
  if(!teacherRole){teacherRole={roleId:'role_teacher',code:'teacher',name:'康复专业人员'};relationalDb.roles.push(teacherRole);}
  teacherRole.name='康复专业人员';
  const adminRole=relationalDb.roles.find(x=>x.code==='admin');
  if(adminRole)relationalDb.users.forEach(user=>{if(user.roleId===adminRole.roleId)user.roleId=teacherRole.roleId;});
  if(adminRole)relationalDb.roles=relationalDb.roles.filter(x=>x.roleId!==adminRole.roleId);
  const ensurePermission=code=>{let permission=relationalDb.permissions.find(x=>x.code===code);if(!permission){permission={permissionId:'perm_'+String(relationalDb.permissions.length+1).padStart(2,'0'),code};relationalDb.permissions.push(permission);}return permission;};
  const desired=[DB_ACTIONS.TRAIN,DB_ACTIONS.PROGRESS_AUTH,DB_ACTIONS.PROFILE_EDIT,DB_ACTIONS.ASSESS_EDIT,DB_ACTIONS.AI_REVIEW,DB_ACTIONS.CARE_WRITE,DB_ACTIONS.CARE_SIGN,DB_ACTIONS.RISK_FLAG,DB_ACTIONS.RISK_RESOLVE,DB_ACTIONS.CONTENT_SUGGEST,DB_ACTIONS.AUDIT_LIMITED,DB_ACTIONS.PROGRESS_ANON,DB_ACTIONS.CONTENT_PUBLISH,DB_ACTIONS.ORG_MANAGE,DB_ACTIONS.ACCOUNT_MANAGE,DB_ACTIONS.OPERATIONS_READ,DB_ACTIONS.CONSENT_GOVERN,DB_ACTIONS.SHARING_MANAGE,DB_ACTIONS.BACKUP_GOVERN,DB_ACTIONS.AUDIT_FULL].map(code=>ensurePermission(code).permissionId);
  relationalDb.rolePermissions=relationalDb.rolePermissions.filter(x=>x.roleId!==teacherRole.roleId&&(!adminRole||x.roleId!==adminRole.roleId));
  desired.forEach(permissionId=>relationalDb.rolePermissions.push({rolePermissionId:'rp_teacher_'+permissionId,roleId:teacherRole.roleId,permissionId}));
}
function saveDatabase(){lsSet(DB_KEY,relationalDb);}

/** 保存能力画像和AI推理记录。两个表分别使用profileId、inferenceId主键关联。 */
function dbSaveAbilityProfile(profile){
  relationalDb.abilityProfiles.filter(x=>x.childId===profile.childId&&x.status==='current').forEach(x=>x.status='history');
  relationalDb.abilityProfiles.push(profile);saveDatabase();return profile;
}
function dbSaveAiInference(inference){relationalDb.aiInferences.push(inference);saveDatabase();return inference;}

/** 正式授权仅由服务端建立，浏览器不得自行补建账号与儿童绑定。 */
function syncDatabaseBindings(){
  saveDatabase();
}

function dbCurrentUser(){
  if(typeof BACKEND_API==='undefined'||!BACKEND_API.available||BACKEND_API.user?.role!==currentRole)return null;
  const role=relationalDb.roles.find(item=>item.code===currentRole);
  return role?{userId:BACKEND_API.user.userId,roleId:role.roleId,displayName:BACKEND_API.user.displayName,status:'active'}:null;
}
function dbCan(action){
  const user=dbCurrentUser();if(!user)return false;
  const permission=relationalDb.permissions.find(x=>x.code===action);if(!permission)return false;
  return relationalDb.rolePermissions.some(x=>x.roleId===user.roleId&&x.permissionId===permission.permissionId);
}
function dbAuthorizedChildIds(){
  if(typeof BACKEND_API!=='undefined'&&BACKEND_API.available&&BACKEND_API.user?.role===currentRole)return [...BACKEND_API.authorizedChildIds];
  const user=dbCurrentUser();if(!user)return [];
  return relationalDb.userChildBindings.filter(x=>x.userId===user.userId&&x.status==='active'&&(!x.validTo||x.validTo>=todayStr())).map(x=>x.childId);
}
function dbCanAccessChild(childId){return dbAuthorizedChildIds().includes(childId);}
