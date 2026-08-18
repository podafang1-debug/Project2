/* ============ 基础工具 ============ */
const PREFIX="wb_cogtrain_";
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
function lsGet(k,def){try{const v=localStorage.getItem(PREFIX+k);return v?JSON.parse(v):def;}catch(e){return def;}}
function lsSet(k,v){localStorage.setItem(PREFIX+k,JSON.stringify(v));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function fmtDate(d){if(typeof d!=="object")d=new Date(d);const p=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());}
function todayStr(){return fmtDate(new Date());}
function yestStr(){return fmtDate(new Date(Date.now()-86400000));}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),1800);}

/* ============ 无障碍：语音反馈（Web Audio 蜂鸣） ============ */
let _ac=null;
function beep(ok){
  if(!settings.audio)return;        // 尊重「语音反馈」开关
  try{
    _ac=_ac||new (window.AudioContext||window.webkitAudioContext)();
    if(_ac.state==="suspended")_ac.resume();
    const o=_ac.createOscillator(),g=_ac.createGain();
    o.connect(g);g.connect(_ac.destination);
    o.type="sine";o.frequency.value=ok?660:200;   // 正确=明亮上行感，错误=低沉
    const t=_ac.currentTime;
    g.gain.setValueAtTime(0.001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.01,.25*(settings.volume??.3)),t+0.02);
    g.gain.exponentialRampToValueAtTime(0.001,t+(ok?0.18:0.3));
    o.start(t);o.stop(t+(ok?0.2:0.32));
  }catch(e){/* 部分浏览器需用户手势触发，忽略即可 */}
}
/* 应用无障碍偏好到 <body> */
function applyAccessibility(){
  document.body.classList.toggle("hc",!!settings.hc);
  document.body.classList.toggle("large",!!settings.large);
  document.body.classList.toggle("reduced-motion",!!settings.reducedMotion);
}

/* ============ SVG 图标 ============ */
const ICONS={
  star:'<polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"/>',
  heart:'<path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5 6 5c2 0 3 1.5 4 3 1-1.5 2-3 4-3 3.5 0 5 4 3.5 7C19 16.5 12 21 12 21z"/>',
  circle:'<circle cx="12" cy="12" r="9"/>',
  square:'<rect x="3" y="3" width="18" height="18" rx="3"/>',
  triangle:'<polygon points="12,3 22,21 2,21"/>',
  diamond:'<polygon points="12,2 22,12 12,22 2,12"/>',
  plus:'<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
  flower:'<g><circle cx="12" cy="12" r="4"/><circle cx="12" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/></g>',
  sun:'<g><circle cx="12" cy="12" r="5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M20 4l-2 2M6 18l-2 2" stroke="currentColor" stroke-width="2"/></g>',
  attention:'<g><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/><path d="M8 15c2 2 6 2 8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g>',
  memory:'<g><rect x="3" y="6" width="7" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="6" width="7" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9v6M14 9v6" stroke="currentColor" stroke-width="2"/></g>',
  logic:'<g><path d="M12 3l9 16H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M9.5 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g>',
  user:'<g><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" stroke-width="2"/></g>',
  shield:'<path d="M12 2l8 3v6c0 5-3.5 9-8 11C7.5 20 4 16 4 11V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  gear:'<g><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="2"/></g>',
  chart:'<g><path d="M4 20V4M4 20h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></g>',
  check:'<path d="M5 13l4 4 10-11" fill="none" stroke="#10B981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  cross:'<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#EF4444" stroke-width="4" stroke-linecap="round"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  clock:'<g><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g>',
  brain:'<path d="M9 3a3 3 0 00-3 3 3 3 0 00-1 5 3 3 0 001 5 3 3 0 003 3V3zM15 3a3 3 0 013 3 3 3 0 011 5 3 3 0 01-1 5 3 3 0 01-3 3V3z" fill="none" stroke="currentColor" stroke-width="2"/>'
};
function svg(name,color,size){size=size||24;const inner=ICONS[name]||"";const fill=(name==="sun"||name==="brain")?"none":(color||"currentColor");
  return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" '+(fill==="currentColor"?'fill="none" stroke="currentColor" stroke-width="2"':'fill="'+fill+'"')+' style="display:block">'+inner+'</svg>';}
const ICON_SET=["star","heart","circle","square","triangle","diamond","plus","flower","sun"];
const ICON_COLOR={"star":"#F7A14F","heart":"#EF4444","circle":"#4F86F7","square":"#10B981","triangle":"#8B5CF6","diamond":"#06B6D4","plus":"#F59E0B","flower":"#EC4899","sun":"#EAB308"};
function svgShape(shape,color,size){return svg(shape,color,size);}
const ERR_NAME={mismatch:"配对失误",wrong_target:"目标误触",category_error:"类别判断偏差",timeout:"反应超时"};
