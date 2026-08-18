/* ============ 设置 Tab ============ */
function renderSetting(c){
  const p=PERMS[currentRole];
  let html='<div class="sec-title">'+svg("shield","#8B5CF6",20)+'设置</div>';
  const storageLabel=typeof BACKEND_API!=='undefined'&&BACKEND_API.available?'SQLite 数据库（同时保留浏览器副本）':'本机浏览器（可启动 Python 服务升级为 SQLite）';
  html+='<div class="card"><b>当前身份</b><p style="margin:6px 0 0;color:var(--sub)">'+ROLE_NAME[currentRole]+' · 数据保存在'+storageLabel+'</p></div>';
  // 无障碍偏好开关
  html+='<div class="card"><b>无障碍偏好</b>'+
    toggleRow("hc","高对比模式（深色底 + 亮黄，适配低视力）")+
    toggleRow("large","放大字体与点击区域")+
    toggleRow("audio","训练语音反馈（正确 / 错误提示音）")+
    '<div class="note">'+svg("shield","#8B5CF6",16)+' 偏好仅保存在本机，可随时切换并立即生效。</div></div>';
  // 数据备份
  html+='<div class="card"><b>数据安全</b>'+
    '<button class="btn-primary" id="expBtn" style="margin-top:8px">导出 JSON 备份</button>'+
    '<button class="btn-ghost" id="impBtn">导入恢复（覆盖本机）</button>'+
    '<button class="btn-ghost danger" id="clearBtn">清空示例数据</button>'+
    '<div class="note">'+svg("clock","#E07B2E",16)+' 累计训练记录 '+records.length+' 条。建议定期导出备份，换设备时用「导入恢复」迁移。</div></div>';
  // 账号管理（仅管理员）
  if(p.accounts){
    html+='<div class="card"><b>角色密码管理（仅防误触）</b>';
    ["teacher","parent","admin"].forEach(r=>{
      html+='<div class="field" style="margin-top:10px"><label>'+ROLE_NAME[r]+' 密码</label><div style="display:flex;gap:8px"><input id="pin_'+r+'" type="password" inputmode="numeric" maxlength="4" value="'+accounts[r].pin+'"><button class="mini-btn" data-setpin="'+r+'">设</button></div></div>';
    });
    html+='<div class="note">'+svg("shield","#8B5CF6",16)+' 部署到公网后任何拿到链接的人都可打开本页；密码仅防误触，不是真实加密，请勿在公网填写真实隐私。</div></div>';
  } else {
    html+='<div class="card"><b>账号</b><p style="margin:6px 0 0;color:var(--sub);font-size:14px">仅管理员可管理角色密码。当前身份无此权限。</p></div>';
  }
  html+='<button class="btn-ghost" id="logout" style="margin-top:6px">退出登录</button>';
  c.innerHTML=html;
  $("#expBtn").onclick=exportData;
  $("#impBtn").onclick=()=>$("#fileInput").click();
  $("#clearBtn").onclick=()=>confirmBox("确认清空全部示例数据（儿童档案、记录、任务）？账号与设置保留。此操作不可恢复。",()=>{
    children=[];records=[];tasks=[];plans={};activeChild=null;saveAll();closeMask();toast("已清空");showTab(curTab);
  });
  if(p.accounts){
    $$("[data-setpin]",c).forEach(b=>b.onclick=()=>{
      const r=b.dataset.setpin;const v=$("#pin_"+r).value.trim();
      if(!/^\d{4}$/.test(v)){toast("密码需为4位数字");return;}
      accounts[r].pin=v;saveAll();toast(ROLE_NAME[r]+"密码已更新");
    });
  }
  $("#logout").onclick=()=>{
    currentRole=null;lsSet("session",null);
    $("#main").classList.add("hidden");$("#tabbar").classList.add("hidden");
    $("#login").classList.remove("hidden");pickRole=null;$$(".role-card").forEach(x=>x.classList.remove("on"));$("#pinInput").value="";$("#pickedLine").textContent="请先选择上方身份";$("#loginErr").textContent="";
  };
  // 无障碍开关
  $$("[data-tg]",c).forEach(b=>b.onclick=()=>{
    const k=b.dataset.tg;settings[k]=!settings[k];saveAll();applyAccessibility();renderSetting(c);
  });
}
