/* ============ 弹窗/确认 ============ */
function openMask(){$("#mask").classList.remove("hidden");}
function closeMask(){$("#mask").classList.add("hidden");$("#sheet").innerHTML="";}
$("#mask").onclick=e=>{if(e.target===$("#mask"))closeMask();};
function confirmBox(msg,cb){
  const sheet=$("#sheet");
  sheet.innerHTML='<h3>请确认</h3><p style="margin:6px 0 16px">'+esc(msg)+'</p>'+
    '<button class="btn-primary danger" id="cfYes">确认</button><button class="btn-ghost" id="cfNo">取消</button>';
  openMask();
  $("#cfYes").onclick=()=>{closeMask();cb();};
  $("#cfNo").onclick=closeMask;
}
