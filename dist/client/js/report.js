/* ============ 报表 Tab ============ */
function renderReport(c){
  if(!children.length){c.innerHTML='<div class="empty">请先在「档案」中建立儿童档案</div>';return;}
  const childId=activeChild;const child=children.find(x=>x.id===childId);
  const recs=records.filter(r=>r.childId===childId&&r.source!=='baseline-game');
  let html='<div class="sec-title">'+svg("chart","#10B981",20)+'近期训练表现</div>';
  html+='<div class="field"><label>选择儿童</label><select id="repChild" style="height:50px;border:2px solid var(--line);border-radius:14px;padding:0 14px;width:100%;background:#fff">'+
    children.map(ch=>'<option value="'+ch.id+'"'+(ch.id===childId?" selected":"")+'>'+esc(ch.name)+'</option>').join("")+'</select></div>';
  if(!recs.length){html+='<div class="empty">该儿童暂无训练记录</div>';c.innerHTML=html;$("#repChild").onchange=e=>{activeChild=e.target.value;lsSet("activeChild",activeChild);renderReport(c);};return;}
  // 统计卡
  const dims=["attention","memory","logic"];
  html+='<div class="stat-row">';
  dims.forEach(d=>{const dr=recs.filter(r=>r.module===d);const acc=dr.length?dr.filter(r=>r.correct).length/dr.length:0;
    html+='<div class="stat"><b style="color:'+colorOf(d)+'">'+(dr.length?(acc*100).toFixed(0)+'%':'—')+'</b><small>'+({attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d])+'训练正确率</small></div>';});
  html+='</div>';
  // 训练正确率与标准化评估不属于同一测量，不能直接相减或解释为能力变化。
  html+='<div class="card metric-boundary"><b>怎样理解这些数据</b><p>这里展示的是平台任务中的训练表现，只用于观察熟悉度和任务适配情况，不等同于能力评估、医学诊断或康复疗效。能力变化请以专业人员完成的周期复评为准。</p></div>';
  // 折线图：整体正确率随训练次数趋势（按时间分桶）
  html+='<div class="card"><b>训练正确率走势</b><div class="legend">'+
    dims.map(d=>'<span><i style="background:'+colorOf(d)+'"></i>'+({attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d])+'</span>').join("")+'</div>'+
    lineChart(recs)+'</div>';
  // 柱状图：各模块训练次数
  html+='<div class="card"><b>各类任务练习量</b>'+barChart(recs)+'</div>';
  // 最近记录
  html+='<div class="card"><b>最近完成的训练任务</b><div class="rec-list">';
  recs.slice().sort((a,b)=>b.ts-a.ts).slice(0,12).forEach(r=>{
    const modName={attention:"注意力",memory:"记忆力",logic:"逻辑力"}[r.module];
    html+='<div class="rec"><div class="mk '+(r.correct?"y":"n")+'">'+(r.correct?svg("check",null,16):svg("cross",null,16))+'</div>'+
      '<div class="t">'+modName+' · 难度'+r.difficulty+(r.reactionMs?' · '+(r.reactionMs/1000).toFixed(1)+'s':'')+'<small> '+fmtDate(r.ts)+(r.errorType?' · '+(ERR_NAME[r.errorType]||''):'')+'</small></div></div>';
  });
  html+='</div></div>';
  c.innerHTML=html;
  $("#repChild").onchange=e=>{activeChild=e.target.value;lsSet("activeChild",activeChild);renderReport(c);};
}
/* 折线图（手写 SVG） */
function lineChart(recs){
  const W=520,H=200,pad=30;
  const dims=["attention","memory","logic"];
  const series=dims.map(d=>{
    const dr=recs.filter(r=>r.module===d).sort((a,b)=>a.ts-b.ts);
    const pts=[];let run=0,ok=0;
    dr.forEach(r=>{run++;if(r.correct)ok++;pts.push(ok/run);});
    return {d,pts};
  });
  const maxLen=Math.max(1,...series.map(s=>s.pts.length));
  const x=i=>pad+(W-2*pad)*(i/Math.max(1,maxLen-1));
  const y=v=>H-pad-(H-2*pad)*v;
  let svgStr='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="display:block;max-width:520px;margin:0 auto">';
  // 网格
  for(let g=0;g<=4;g++){const yy=pad+(H-2*pad)*g/4;svgStr+='<line x1="'+pad+'" y1="'+yy+'" x2="'+(W-pad)+'" y2="'+yy+'" stroke="#E5E9F2"/><text x="4" y="'+(yy+4)+'" font-size="10" fill="#9AA3B2">'+(100-g*25)+'</text>';}
  series.forEach(s=>{
    if(s.pts.length<1)return;
    const col=colorOf(s.d);
    let path="";s.pts.forEach((v,i)=>{path+=(i?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1)+" ";});
    svgStr+='<path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="2.5" stroke-linejoin="round"/>';
    s.pts.forEach((v,i)=>{svgStr+='<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="3" fill="'+col+'"/>';});
  });
  svgStr+='</svg>';
  return svgStr;
}
function barChart(recs){
  const dims=["attention","memory","logic"];const W=520,H=180,pad=30;
  const counts=dims.map(d=>recs.filter(r=>r.module===d).length);
  const max=Math.max(1,...counts);
  const bw=(W-2*pad)/dims.length*0.55;
  let svgStr='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="display:block;max-width:520px;margin:8px auto 0">';
  dims.forEach((d,i)=>{
    const cx=pad+(W-2*pad)*(i+0.5)/dims.length;
    const h=(H-pad-20)*(counts[i]/max);
    const yy=H-20-h;
    svgStr+='<rect x="'+(cx-bw/2)+'" y="'+yy+'" width="'+bw+'" height="'+h+'" rx="6" fill="'+colorOf(d)+'"/>';
    svgStr+='<text x="'+cx+'" y="'+(yy-6)+'" font-size="13" font-weight="700" fill="#1F2430" text-anchor="middle">'+counts[i]+'</text>';
    svgStr+='<text x="'+cx+'" y="'+(H-4)+'" font-size="12" fill="#6B7280" text-anchor="middle">'+({attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d])+'</text>';
  });
  svgStr+='</svg>';
  return svgStr;
}
