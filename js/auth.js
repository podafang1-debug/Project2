/* ============ 正式账号登录 ============ */
$("#logoIcon").innerHTML=svg("brain","#fff",52);
$("#topDot").innerHTML=svg("brain","#fff",20);
$("#icToday").innerHTML=svg("clock","#E07B2E",22);
$("#t1").innerHTML=svg("user","currentColor",22);
$("#t2").innerHTML=svg("brain","currentColor",22);
$("#t3").innerHTML=svg("gear","currentColor",22);
$("#t4").innerHTML=svg("chart","currentColor",22);
$("#t5").innerHTML=svg("shield","currentColor",22);

let pickRole=null; // 仅保留旧扩展脚本兼容；正式角色由服务端账号决定。

function showLoginMessage(message,type='error'){
  const box=$("#loginErr");box.textContent=message||'';box.dataset.type=type;
}

function setAuthenticationMode(){
  const online=BACKEND_API.available,setup=online&&BACKEND_API.accountSetupRequired;
  $("#accountLoginForm").classList.toggle("hidden",setup);
  $("#adminSetupForm").classList.toggle("hidden",!setup);
  $("#loginServiceState").textContent=!online?'机构服务未启动，正式账号登录暂不可用。':setup?'尚无账号，请先初始化首位系统管理员。':'角色与数据权限将根据手机号账号自动加载。';
  $("#loginBtn").disabled=!online;
  if(setup)$("#setupPhone").focus();else $("#phoneInput").focus();
}

$("#phoneInput").addEventListener("keydown",event=>{if(event.key==="Enter")$("#passwordInput").focus();});
$("#passwordInput").addEventListener("keydown",event=>{if(event.key==="Enter")doLogin();});
$("#loginBtn").onclick=doLogin;
$("#setupAdminBtn").onclick=setupInitialAdmin;

async function doLogin(){
  const phone=$("#phoneInput").value.trim(),password=$("#passwordInput").value;
  if(!/^((\+?86)?)1[3-9]\d{9}$/.test(phone.replace(/[\s-]/g,''))){showLoginMessage("请输入有效的 11 位手机号码");return;}
  if(!password){showLoginMessage("请输入登录密码");return;}
  const button=$("#loginBtn");button.disabled=true;button.textContent="正在验证…";showLoginMessage("");
  try{
    await backendReady;
    if(!BACKEND_API.available)throw new Error("请先启动机构服务");
    const result=await backendLogin(phone,password);
    currentRole=result.user.role;lsSet("session",currentRole);enterApp();
  }catch(error){
    currentRole=null;lsSet("session",null);showLoginMessage(error.message||"登录失败，请重试");
  }finally{button.disabled=!BACKEND_API.available;button.textContent="登录";}
}

async function setupInitialAdmin(){
  const displayName=$("#setupName").value.trim(),phone=$("#setupPhone").value.trim(),password=$("#setupPassword").value,confirm=$("#setupPasswordConfirm").value;
  if(displayName.length<2){showLoginMessage("请填写管理员姓名");return;}
  if(password!==confirm){showLoginMessage("两次输入的密码不一致");return;}
  const button=$("#setupAdminBtn");button.disabled=true;button.textContent="正在初始化…";showLoginMessage("");
  try{
    await backendBootstrapAdmin(phone,displayName,password);
    $("#phoneInput").value=phone;$("#passwordInput").value='';setAuthenticationMode();showLoginMessage("管理员账号已创建，请使用手机号和密码登录。",'success');
  }catch(error){showLoginMessage(error.message||"初始化失败，请重试");}
  finally{button.disabled=false;button.textContent="创建首位管理员";}
}

window.addEventListener('DOMContentLoaded',()=>backendReady.then(setAuthenticationMode));
