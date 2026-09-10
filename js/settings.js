/* ============ 设置 Tab ============ */
function renderSetting(c){
  const p=PERMS[currentRole];
  const canBackup=typeof dbCan==='function'&&(dbCan(DB_ACTIONS.BACKUP_LIMITED)||dbCan(DB_ACTIONS.BACKUP_FULL));
  let html='<div class="sec-title">'+svg("shield","#8B5CF6",20)+'设置</div>';
  const storageLabel=typeof BACKEND_API!=='undefined'&&BACKEND_API.available?'SQLite 数据库':'机构服务未连接';
  html+='<div class="card"><b>当前身份</b><p style="margin:6px 0 0;color:var(--sub)">'+ROLE_NAME[currentRole]+' · 数据保存在'+storageLabel+'</p></div>';
  html+='<div class="card"><b>无障碍偏好</b>'+toggleRow("hc","高对比模式（深色底 + 亮黄，适配低视力）")+toggleRow("large","放大字体与点击区域")+toggleRow("audio","训练语音反馈（正确 / 错误提示音）")+'<div class="note">'+svg("shield","#8B5CF6",16)+' 偏好仅保存在本机，可随时切换并立即生效。</div></div>';
  html+=canBackup?'<div class="card"><b>数据安全</b><button class="btn-primary" id="expBtn" style="margin-top:8px">导出受控 JSON 备份</button><button class="btn-ghost" id="impBtn">导入恢复（覆盖本机）</button><button class="btn-ghost danger" id="clearBtn">清空示例数据</button><div class="note">'+svg("clock","#E07B2E",16)+' 导出与恢复应在机构授权范围内执行并保留审计。</div></div>':'<div class="card"><b>数据安全</b><p style="margin:6px 0 0;color:var(--sub)">当前账号不能导出儿童整库数据。需要迁移或归档时，请通过机构数据治理流程办理。</p></div>';
  if(p.accounts){
    html+='<div class="card"><b>正式账号治理</b><p style="margin:6px 0;color:var(--sub);font-size:14px">账号以手机号码为主键。创建账号、分配角色、重置密码、撤销会话与儿童授权均在“账号管理”模块完成，并要求管理员再次验证密码。</p></div>';
  }else{
    const phone=BACKEND_API.user?.phone||'';
    html+='<div class="card"><b>当前账号</b><p style="margin:6px 0 0;color:var(--sub);font-size:14px">'+esc(phone)+' · 密码与角色由机构管理员统一管理。</p></div>';
  }
  html+='<button class="btn-ghost" id="logout" style="margin-top:6px">退出登录</button>';
  c.innerHTML=html;
  if($("#expBtn"))$("#expBtn").onclick=exportData;
  if($("#impBtn"))$("#impBtn").onclick=()=>$("#fileInput").click();
  if($("#clearBtn"))$("#clearBtn").onclick=()=>confirmBox("确认清空全部示例数据（儿童档案、记录、任务）？账号不会受影响。此操作不可恢复。",()=>{children=[];records=[];tasks=[];plans={};activeChild=null;saveAll();closeMask();toast("已清空");showTab(curTab);});
  $("#logout").onclick=logoutToLogin;
  $$("[data-tg]",c).forEach(button=>button.onclick=()=>{const key=button.dataset.tg;settings[key]=!settings[key];saveAll();applyAccessibility();renderSetting(c);});
}
