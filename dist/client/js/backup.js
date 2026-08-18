/* ============ 导入/导出 ============ */
function exportData(){
  // 备份包含增强版治理数据；导出使用化名，正式版应再经过服务端脱敏与加密。
  const data={_type:"cogtrain_backup",_v:2,children,records,plans,tasks,accounts,settings,enhanced:typeof enhancedState!=="undefined"?enhancedState:null,exportedAt:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="启智训练台备份_"+todayStr()+".json";a.click();
  toast("已导出备份");
}
$("#fileInput").onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const d=JSON.parse(rd.result);
      if(d._type!=="cogtrain_backup")throw new Error("格式不符");
      // 导入无条数上限
      children=d.children||[];records=d.records||[];plans=d.plans||{};tasks=d.tasks||[];
      if(d.accounts)accounts=d.accounts;if(d.settings)settings=d.settings;
      if(d.enhanced&&typeof enhancedState!=="undefined"){Object.keys(enhancedState).forEach(k=>{if(d.enhanced[k])enhancedState[k]=d.enhanced[k];});saveEnhanced();}
      settings.sample=false;   // 导入后不再触发示例覆盖
      saveAll();toast("已恢复 "+records.length+" 条记录");
      if(activeChild&&!children.find(c=>c.id===activeChild))activeChild=children[0]?children[0].id:null;
      showTab(curTab);
    }catch(err){toast("导入失败：文件格式错误");}
  };
  rd.readAsText(f);e.target.value="";
};
