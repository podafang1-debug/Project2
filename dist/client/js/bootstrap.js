/* ============ 顶栏按钮 ============ */
// 所有业务函数加载完成后再初始化示例数据；seed() 会调用 AI 方案生成器。
if(children===null||settings.sample){seed();}

$("#btnExport").onclick=exportData;
$("#btnImport").onclick=()=>$("#fileInput").click();

/* ============ 启动 ============ */
applyAccessibility();   // 进入前先套用无障碍偏好
async function startApplication(){
  await backendReady;
  if(BACKEND_API.available){
    if(BACKEND_API.token){
      try{await hydrateFromBackend();currentRole=BACKEND_API.user?.role||null;lsSet("session",currentRole);}
      catch(_error){BACKEND_API.token='';sessionStorage.removeItem(BACKEND_TOKEN_KEY);currentRole=null;lsSet("session",null);}
    }else{currentRole=null;lsSet("session",null);}
  }
  if(currentRole&&accounts[currentRole])enterApp();
  else $("#login").classList.remove("hidden");
}
startApplication();
