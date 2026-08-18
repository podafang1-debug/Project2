/* ============ 报表 Tab ============ */
function renderReport(c){
  if(!children.length){c.innerHTML='<div class="empty">请先在「档案」中建立儿童档案</div>';return;}
  const childId=activeChild;const child=children.find(x=>x.id===childId);
  const recs=records.filter(r=>r.childId===childId);
  let html='<div class="sec-title">'+svg("chart","#10B981",20)+'训练进度报表</div>';
  html+='<div class="field"><label>选择儿童</label><select id="repChild" style="height:50px;border:2px solid var(--line);border-radius:14px;padding:0 14px;width:100%;background:#fff">'+
    children.map(ch=>'<option value="'+ch.id+'"'+(ch.id===childId?" selected":"")+'>'+esc(ch.name)+'</option>').join("")+'</select></div>';
  if(!recs.length){html+='<div class="empty">该儿童暂无训练记录</div>';c.innerHTML=html;$("#repChild").onchange=e=>{activeChild=e.target.value;lsSet("activeChild",activeChild);renderReport(c);};return;}
  // 统计卡
  const dims=["attention","memory","logic"];
  html+='<div class="stat-row">';
  dims.forEach(d=>{const dr=recs.filter(r=>r.module===d);const acc=dr.length?dr.filter(r=>r.correct).length/dr.length:0;
    html+='<div class="stat"><b style="color:'+colorOf(d)+'">'+(dr.length?(acc*100).toFixed(0)+'%':'—')+'</b><small>'+({attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d])+'正确率</small></div>';});
  html+='</div>';
  // 雷达图：基线 vs 当前能力 + 成长增量
  const curAcc={};
  dims.forEach(d=>{const dr=recs.filter(r=>r.module===d);curAcc[d]=dr.length?dr.filter(r=>r.correct).length/dr.length*100:0;});
  html+='<div class="card"><b>基线 vs 当前能力</b>'+radarChart(child.baseline,curAcc)+
    '<div style="display:flex;justify-content:space-around;margin-top:6px;font-size:13px">'+dims.map(d=>{const g=Math.round(curAcc[d]-(child.baseline[d]||0));
      return '<span>'+({attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d])+'：<b style="color:'+(g>=0?"var(--green)":"var(--red)")+'">'+(g>=0?"+":"")+g+'</b></span>';}).join("")+'</div></div>';
  // 折线图：整体正确率随训练次数趋势（按时间分桶）
  html+='<div class="card"><b>正确率趋势</b><div class="legend">'+
    dims.map(d=>'<span><i style="background:'+colorOf(d)+'"></i>'+({attention:"注意力",memory:"记忆力",logic:"逻辑力"}[d])+'</span>').join("")+'</div>'+
    lineChart(recs)+'</div>';
  // 柱状图：各模块训练次数
  html+='<div class="card"><b>各维度训练量</b>'+barChart(recs)+'</div>';
  // 最近记录
  html+='<div class="card"><b>最近训练记录</b><div class="rec-list">';
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
/* 雷达图：基线评估 vs 当前能力（手写 SVG，3 轴） */
function radarChart(base,cur){
  const dims=["attention","memory","logic"];
  const labels=["注意力","记忆力","逻辑力"];
  const cx=130,cy=120,R=86;
  const ang=i=>-Math.PI/2+i*2*Math.PI/dims.length;
  const pt=(v,i)=>{const a=ang(i);return [cx+R*(v/100)*Math.cos(a),cy+R*(v/100)*Math.sin(a)];};
  const poly=arr=>arr.map((v,i)=>pt(v,i).map(n=>n.toFixed(1)).join(",")).join(" ");
  let s='<svg viewBox="0 0 260 240" width="100%" style="display:block;max-width:300px;margin:4px auto 0">';
  [0.33,0.66,1].forEach(f=>{const p=dims.map((_,i)=>{const a=ang(i);return (cx+R*f*Math.cos(a)).toFixed(1)+","+(cy+R*f*Math.sin(a)).toFixed(1);}).join(" ");s+='<polygon points="'+p+'" fill="none" stroke="#E5E9F2"/>';});
  dims.forEach((_,i)=>{const a=ang(i);s+='<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+R*Math.cos(a)).toFixed(1)+'" y2="'+(cy+R*Math.sin(a)).toFixed(1)+'" stroke="#E5E9F2"/>';
    const lx=cx+(R+18)*Math.cos(a),ly=cy+(R+18)*Math.sin(a);s+='<text x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'" font-size="11" fill="#6B7280" text-anchor="middle" dominant-baseline="middle">'+labels[i]+'</text>';});
  s+='<polygon points="'+poly(dims.map(d=>base[d]||0))+'" fill="rgba(111,122,160,.18)" stroke="#9AA3B2" stroke-width="2"/>';
  s+='<polygon points="'+poly(dims.map(d=>cur[d]||0))+'" fill="rgba(247,161,79,.28)" stroke="#F7A14F" stroke-width="2.5"/>';
  dims.forEach((d,i)=>{const p=pt(cur[d]||0,i);s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3" fill="#F7A14F"/>';});
  s+='</svg>';
  s+='<div class="legend" style="justify-content:center"><span><i style="background:#9AA3B2"></i>基线评估</span><span><i style="background:#F7A14F"></i>当前水平</span></div>';
  return s;
}
