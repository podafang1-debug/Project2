/* ============ 顶栏按钮 ============ */
// 所有业务函数加载完成后再初始化示例数据；seed() 会调用 AI 方案生成器。
if(children===null||settings.sample){seed();}

$("#btnExport").onclick=exportData;
$("#btnImport").onclick=()=>$("#fileInput").click();

/* ============ 启动 ============ */
applyAccessibility();   // 进入前先套用无障碍偏好
if(currentRole&&accounts[currentRole]){enterApp();}
else{$("#login").classList.remove("hidden");}
