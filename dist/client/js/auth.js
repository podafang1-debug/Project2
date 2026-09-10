/* ============ 正式账号登录 ============ */
$("#logoIcon").innerHTML=svg("brain","#fff",52);
$("#topDot").innerHTML=svg("brain","#fff",20);
$("#icToday").innerHTML=svg("clock","#E07B2E",22);
$("#t1").innerHTML=svg("user","currentColor",22);
$("#t2").innerHTML=svg("brain","currentColor",22);
$("#t3").innerHTML=svg("gear","currentColor",22);
$("#t4").innerHTML=svg("chart","currentColor",22);
$("#t5").innerHTML=svg("shield","currentColor",22);

let pickRole='child';

function showLoginMessage(message,type='error'){
  const box=$("#loginErr");box.textContent=message||'';box.dataset.type=type;
}

function setAuthenticationMode(){
  const online=BACKEND_API.available;
  $("#accountLoginForm").classList.remove("hidden");
  $("#accountRegisterForm").classList.add("hidden");
  showLoginMessage(online?'':'机构服务未启动，账号登录暂不可用。');
  $("#loginBtn").disabled=!online;
}

$("#phoneInput").addEventListener("keydown",event=>{if(event.key==="Enter")$("#passwordInput").focus();});
$("#passwordInput").addEventListener("keydown",event=>{if(event.key==="Enter")doLogin();});
$("#loginBtn").onclick=doLogin;

function setRegistrationRole(){
  const role=$("#registerRole").value,isTeacher=role==="teacher";
  $("#registerChildFields").classList.toggle("hidden",isTeacher);
  $("#teacherRegisterNote").classList.toggle("hidden",!isTeacher);
}
function showRegistration(){
  if(!BACKEND_API.available){showLoginMessage("请先启动机构服务");return;}
  $("#accountLoginForm").classList.add("hidden");$("#accountRegisterForm").classList.remove("hidden");showLoginMessage("");setRegistrationRole();$("#registerName").focus();
}
function showAccountLogin(){
  $("#accountRegisterForm").classList.add("hidden");$("#accountLoginForm").classList.remove("hidden");showLoginMessage("");$("#phoneInput").focus();
}
$("#openRegisterBtn").onclick=showRegistration;
$("#backToLoginBtn").onclick=showAccountLogin;
$("#registerRole").onchange=setRegistrationRole;
$("#registerAccountBtn").onclick=registerAccount;
$$('[data-login-role]').forEach(button=>button.onclick=()=>{
  pickRole=button.dataset.loginRole;
  $$('[data-login-role]').forEach(item=>{const selected=item===button;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected));});
  showLoginMessage('');
});

async function registerAccount(){
  const role=$("#registerRole").value,displayName=$("#registerName").value.trim(),phone=$("#registerPhone").value.trim();
  const password=$("#registerPassword").value,confirm=$("#registerPasswordConfirm").value;
  if(!displayName){showLoginMessage("请填写姓名或称呼");return;}
  if(password!==confirm){showLoginMessage("两次输入的密码不一致");return;}
  const payload={role,displayName,phone,password};
  if(role==="parent"){payload.birthYear=+$("#registerBirthYear").value;payload.childDisplayName=$("#registerChildName").value.trim();}
  const button=$("#registerAccountBtn");button.disabled=true;button.textContent="正在注册…";showLoginMessage("");
  try{
    const result=await backendRequest("/api/auth/register",{method:"POST",body:JSON.stringify(payload)},false);
    if(result.status==="pending"){
      pickRole='teacher';$('[data-login-role="teacher"]').click();showAccountLogin();showLoginMessage(result.message,"success");return;
    }
    pickRole=role;$('[data-login-role="'+role+'"]').click();
    $("#phoneInput").value=phone;$("#passwordInput").value='';
    showAccountLogin();showLoginMessage("注册成功，请使用刚才设置的密码登录。","success");
  }catch(error){showLoginMessage(error.message||"注册失败，请重试");}
  finally{button.disabled=false;button.textContent="注册";}
}

async function doLogin(){
  const phone=$("#phoneInput").value.trim(),password=$("#passwordInput").value;
  if(!/^((\+?86)?)1[3-9]\d{9}$/.test(phone.replace(/[\s-]/g,''))){showLoginMessage("请输入有效的 11 位手机号码");return;}
  if(!password){showLoginMessage("请输入登录密码");return;}
  const button=$("#loginBtn");button.disabled=true;button.textContent="正在验证…";showLoginMessage("");
  try{
    await backendReady;
    if(!BACKEND_API.available)throw new Error("请先启动机构服务");
    const result=await backendLogin(phone,password,pickRole);
    currentRole=result.user.role;lsSet("session",currentRole);enterApp();
  }catch(error){
    currentRole=null;lsSet("session",null);showLoginMessage(error.message||"登录失败，请重试");
  }finally{button.disabled=!BACKEND_API.available;button.textContent="登录";}
}

window.addEventListener('DOMContentLoaded',()=>backendReady.then(setAuthenticationMode));
