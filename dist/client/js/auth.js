/* ============ 渲染：登录 ============ */
$("#logoIcon").innerHTML=svg("brain","#fff",52);
$("#icTeacher").innerHTML=svg("user","#4F86F7",40);
$("#icParent").innerHTML=svg("heart","#10B981",40);
$("#icAdmin").innerHTML=svg("shield","#8B5CF6",40);
$("#topDot").innerHTML=svg("brain","#fff",20);
$("#icToday").innerHTML=svg("clock","#E07B2E",22);
$("#t1").innerHTML=svg("user","currentColor",22);
$("#t2").innerHTML=svg("brain","currentColor",22);
$("#t3").innerHTML=svg("gear","currentColor",22);
$("#t4").innerHTML=svg("chart","currentColor",22);
$("#t5").innerHTML=svg("shield","currentColor",22);

let pickRole=null;
$$(".role-card").forEach(c=>c.onclick=()=>{
  $$(".role-card").forEach(x=>x.classList.remove("on"));
  c.classList.add("on");
  pickRole=c.dataset.role;
  $("#pickedLine").innerHTML="已选：<b>"+ROLE_NAME[pickRole]+"</b>";
  $("#loginErr").textContent="";
  $("#pinInput").focus();
});
$("#pinInput").addEventListener("keydown",e=>{if(e.key==="Enter")doLogin();});
$("#loginBtn").onclick=doLogin;
function doLogin(){
  if(!pickRole){$("#loginErr").textContent="请先选择身份";return;}
  const pin=$("#pinInput").value.trim();
  if(pin.length!==4){$("#loginErr").textContent="请输入 4 位密码";return;}
  if(accounts[pickRole].pin!==pin){$("#loginErr").textContent="密码错误，请重试";return;}
  currentRole=pickRole;lsSet("session",currentRole);
  enterApp();
}
