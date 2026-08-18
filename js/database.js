/* ============ 本地演示数据库：主键、外键与权限关系 ============ */
/**
 * 这是静态原型使用的关系型数据模拟层。每类实体都有稳定主键，关联关系只保存主键，
 * 避免把“角色名称”“儿童姓名”当权限依据。正式版应原样迁移到服务端数据库，
 * 并由API在服务端执行 dbCan() 等价鉴权；浏览器端判断不能构成真正安全边界。
 */
const DB_KEY='relationalDbV1';
const DB_ACTIONS={
  TRAIN:'training.execute',PROGRESS_SIMPLE:'progress.simple',PROGRESS_AUTH:'progress.authorized',PROGRESS_ANON:'progress.anonymous',
  PROFILE_LIMITED:'profile.limited',PROFILE_EDIT:'profile.edit',PROFILE_MANAGE:'profile.manage',ASSESS_LIMITED:'assessment.limited',ASSESS_EDIT:'assessment.edit',
  AI_REVIEW:'ai.review',CONTENT_SUGGEST:'content.suggest',CONTENT_PUBLISH:'content.publish',ORG_MANAGE:'organization.manage',
  AUDIT_LIMITED:'audit.limited',AUDIT_FULL:'audit.full',BACKUP_LIMITED:'backup.limited',BACKUP_FULL:'backup.full'
};

function createDemoDatabase(){
  const roleDefs=[
    ['role_child','child','儿童'],['role_parent','parent','家长'],
    ['role_teacher','teacher','康复医疗专业人员'],['role_admin','admin','内容与机构管理员']
  ];
  const permissionCodes=[...new Set(Object.values(DB_ACTIONS))];
  const roles=roleDefs.map(([roleId,code,name])=>({roleId,code,name}));
  const permissions=permissionCodes.map((code,index)=>({permissionId:'perm_'+String(index+1).padStart(2,'0'),code}));
  const roleCodes={
    child:[DB_ACTIONS.TRAIN,DB_ACTIONS.PROGRESS_SIMPLE],
    parent:[DB_ACTIONS.TRAIN,DB_ACTIONS.PROGRESS_AUTH,DB_ACTIONS.PROFILE_LIMITED,DB_ACTIONS.ASSESS_LIMITED],
    teacher:[DB_ACTIONS.TRAIN,DB_ACTIONS.PROGRESS_AUTH,DB_ACTIONS.PROFILE_EDIT,DB_ACTIONS.ASSESS_EDIT,DB_ACTIONS.AI_REVIEW,DB_ACTIONS.CONTENT_SUGGEST,DB_ACTIONS.AUDIT_LIMITED,DB_ACTIONS.BACKUP_LIMITED],
    // 复合管理员承接内容审核与机构治理，但不因此获得儿童临床档案读取权。
    admin:[DB_ACTIONS.PROGRESS_ANON,DB_ACTIONS.CONTENT_PUBLISH,DB_ACTIONS.ORG_MANAGE,DB_ACTIONS.AUDIT_FULL,DB_ACTIONS.BACKUP_FULL]
  };
  const rolePermissions=[];
  Object.entries(roleCodes).forEach(([roleCode,codes])=>codes.forEach(code=>rolePermissions.push({rolePermissionId:'rp_'+roleCode+'_'+code.replace(/\W/g,'_'),roleId:roles.find(r=>r.code===roleCode).roleId,permissionId:permissions.find(p=>p.code===code).permissionId})));
  const users=roleDefs.map(([roleId,code,name])=>({userId:'user_'+code,roleId,organizationId:'org_001',displayName:name+'演示账号',status:'active'}));
  return {schemaVersion:1,roles,permissions,rolePermissions,users,
    organizations:[{organizationId:'org_001',name:'康宇儿童发展中心',status:'active'}],
    classes:[{classId:'class_001',organizationId:'org_001',name:'启航班'},{classId:'class_002',organizationId:'org_001',name:'成长班'}],
    // childId 在儿童示例数据初始化后由 syncDatabaseBindings() 写入，绑定关系有独立主键和有效期。
    userChildBindings:[],consents:[]};
}

let relationalDb=lsGet(DB_KEY,null)||createDemoDatabase();
// 轻量迁移：旧浏览器数据库补齐AI画像表，不清空任何既有数据。
relationalDb.abilityProfiles=relationalDb.abilityProfiles||[];
relationalDb.aiInferences=relationalDb.aiInferences||[];
// 权限迁移：移除旧演示库曾授予管理员的儿童档案管理权，落实“脱敏汇总”边界。
{
  const adminRole=relationalDb.roles.find(x=>x.code==='admin'),profileManage=relationalDb.permissions.find(x=>x.code===DB_ACTIONS.PROFILE_MANAGE);
  if(adminRole&&profileManage)relationalDb.rolePermissions=relationalDb.rolePermissions.filter(x=>!(x.roleId===adminRole.roleId&&x.permissionId===profileManage.permissionId));
  // 从旧六角色数据库迁移：医疗权限并入专业人员，内容审核权限并入复合管理员。
  const teacherRole=relationalDb.roles.find(x=>x.code==='teacher'),doctorRole=relationalDb.roles.find(x=>x.code==='doctor'),reviewerRole=relationalDb.roles.find(x=>x.code==='reviewer');
  const mergeRole=(fromRole,toRole)=>{if(!fromRole||!toRole)return;const permissionIds=relationalDb.rolePermissions.filter(x=>x.roleId===fromRole.roleId).map(x=>x.permissionId);permissionIds.forEach(permissionId=>{if(!relationalDb.rolePermissions.some(x=>x.roleId===toRole.roleId&&x.permissionId===permissionId))relationalDb.rolePermissions.push({rolePermissionId:'rp_merge_'+toRole.roleId+'_'+permissionId,roleId:toRole.roleId,permissionId});});};
  mergeRole(doctorRole,teacherRole);mergeRole(reviewerRole,adminRole);
  const removedRoleIds=[doctorRole?.roleId,reviewerRole?.roleId].filter(Boolean);
  relationalDb.rolePermissions=relationalDb.rolePermissions.filter(x=>!removedRoleIds.includes(x.roleId));
  relationalDb.users=relationalDb.users.filter(x=>!removedRoleIds.includes(x.roleId));
  relationalDb.roles=relationalDb.roles.filter(x=>!removedRoleIds.includes(x.roleId));
}
function saveDatabase(){lsSet(DB_KEY,relationalDb);}

/** 保存能力画像和AI推理记录。两个表分别使用profileId、inferenceId主键关联。 */
function dbSaveAbilityProfile(profile){
  relationalDb.abilityProfiles.filter(x=>x.childId===profile.childId&&x.status==='current').forEach(x=>x.status='history');
  relationalDb.abilityProfiles.push(profile);saveDatabase();return profile;
}
function dbSaveAiInference(inference){relationalDb.aiInferences.push(inference);saveDatabase();return inference;}

/** 为演示账号建立儿童授权关系：儿童/家长绑定首位儿童，专业人员绑定全部儿童。 */
function syncDatabaseBindings(){
  const existing=new Set(relationalDb.userChildBindings.map(x=>x.userId+'|'+x.childId));
  const bind=(userId,childId,scope)=>{if(!childId||existing.has(userId+'|'+childId))return;relationalDb.userChildBindings.push({bindingId:'bind_'+uid(),userId,childId,scope,validFrom:todayStr(),validTo:null,status:'active'});};
  const first=children[0]?.id;
  bind('user_child',first,'self');bind('user_parent',first,'guardian');
  children.forEach(child=>bind('user_teacher',child.id,'rehabilitation-medical'));
  saveDatabase();
}

function dbCurrentUser(){return relationalDb.users.find(user=>relationalDb.roles.find(role=>role.roleId===user.roleId)?.code===currentRole&&user.status==='active');}
function dbCan(action){
  const user=dbCurrentUser();if(!user)return false;
  const permission=relationalDb.permissions.find(x=>x.code===action);if(!permission)return false;
  return relationalDb.rolePermissions.some(x=>x.roleId===user.roleId&&x.permissionId===permission.permissionId);
}
function dbAuthorizedChildIds(){
  const user=dbCurrentUser();if(!user)return [];
  return relationalDb.userChildBindings.filter(x=>x.userId===user.userId&&x.status==='active'&&(!x.validTo||x.validTo>=todayStr())).map(x=>x.childId);
}
function dbCanAccessChild(childId){return dbAuthorizedChildIds().includes(childId);}
