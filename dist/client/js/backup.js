/* ============ 导入/导出 ============ */
function scopedBackupEnhanced(allowedIds){
  if(typeof enhancedState==='undefined')return null;
  return Object.fromEntries(Object.entries(enhancedState).map(([key,value])=>{
    if(!Array.isArray(value))return [key,value];
    return [key,value.filter(item=>!item?.childId||allowedIds.has(item.childId))];
  }));
}
function exportData(){
  if(currentRole==='admin'||!(dbCan(DB_ACTIONS.BACKUP_LIMITED)||dbCan(DB_ACTIONS.BACKUP_FULL))){toast("当前账号无权导出儿童业务数据");return;}
  const allowedIds=new Set(dbAuthorizedChildIds()),scopedChildren=children.filter(item=>allowedIds.has(item.id));
  const data={_type:"cogtrain_backup",_v:3,children:scopedChildren,records:records.filter(item=>allowedIds.has(item.childId)),plans:Object.fromEntries(Object.entries(plans).filter(([id])=>allowedIds.has(id))),tasks:tasks.filter(item=>allowedIds.has(item.childId)),settings,
    relationalDb:{abilityProfiles:relationalDb.abilityProfiles.filter(item=>allowedIds.has(item.childId)),aiInferences:relationalDb.aiInferences.filter(item=>allowedIds.has(item.childId))},
    enhanced:scopedBackupEnhanced(allowedIds),exportedAt:new Date().toISOString(),notice:"不包含账号密码、扫描原件和OCR密文"};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="启智训练台业务数据_"+todayStr()+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast("已导出授权范围内的业务数据");
}
$("#fileInput").onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=async()=>{
    try{
      if(currentRole==='admin'||!dbCan(DB_ACTIONS.BACKUP_LIMITED))throw new Error("当前账号无权恢复儿童业务数据");
      const d=JSON.parse(rd.result);if(d._type!=="cogtrain_backup")throw new Error("格式不符");
      children=Array.isArray(d.children)?d.children:[];records=Array.isArray(d.records)?d.records:[];plans=d.plans&&typeof d.plans==='object'?d.plans:{};tasks=Array.isArray(d.tasks)?d.tasks:[];
      if(d.settings&&typeof d.settings==='object')settings={...settings,...d.settings};
      if(d.relationalDb){
        relationalDb.abilityProfiles=Array.isArray(d.relationalDb.abilityProfiles)?d.relationalDb.abilityProfiles:[];
        relationalDb.aiInferences=Array.isArray(d.relationalDb.aiInferences)?d.relationalDb.aiInferences:[];
        saveDatabase();
      }
      if(d.enhanced&&typeof enhancedState!=="undefined"){
        Object.keys(enhancedState).forEach(key=>{if(Object.prototype.hasOwnProperty.call(d.enhanced,key))enhancedState[key]=d.enhanced[key];});
        saveEnhanced();
      }
      settings.sample=false;if(activeChild&&!children.find(c=>c.id===activeChild))activeChild=children[0]?.id||null;
      syncDatabaseBindings();saveAll();
      if(BACKEND_API.available&&currentRole==='teacher'){await syncLocalStateToBackend();await hydrateFromBackend();}
      toast("已恢复 "+records.length+" 条训练记录");showTab(curTab);
    }catch(err){toast("导入失败："+(err.message||"文件格式错误"));}
  };
  rd.readAsText(f);e.target.value="";
};
