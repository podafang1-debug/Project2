/* ============ 本地 AI 分析引擎（启发式，非云端大模型） ============ */
function analyze(childId){
  const recs=records.filter(r=>r.childId===childId);
  const dims=["attention","memory","logic"];
  const res={};
  dims.forEach(d=>{
    const dr=recs.filter(r=>r.module===d);
    const last=dr.slice(-10);
    const acc=last.length?last.filter(r=>r.correct).length/last.length:0.5;
    const base=children.find(c=>c.id===childId).baseline[d]||50;
    let diff=last.length?last[last.length-1].difficulty:Math.max(1,Math.round(base/25));
    let rec=diff;
    // 趋势：最近 5 次 vs 前 5 次，识别上升 / 下滑 / 平稳
    const recent=last.slice(-5), prev=last.slice(-10,-5);
    const accR=recent.length?recent.filter(r=>r.correct).length/recent.length:acc;
    const accP=prev.length?prev.filter(r=>r.correct).length/prev.length:acc;
    let trend="stable";
    if(accR-accP>=0.15)trend="up";
    else if(accP-accR>=0.15)trend="down";
    // 平台期：正确率长期高位但难度未到顶，需要突破
    const plateau=(accR>=0.85&&diff<5);
    if(trend==="up"&&diff<5)rec=diff+1;
    else if(trend==="down"&&diff>1)rec=diff-1;
    else if(plateau&&diff<5)rec=diff+1;   // 高位平台期升一档，制造挑战
    const errs={};last.filter(r=>!r.correct).forEach(r=>{errs[r.errorType]=(errs[r.errorType]||0)+1;});
    res[d]={accuracy:acc,count:last.length,difficulty:diff,rec,errors:errs,trend,plateau};
  });
  return res;
}
function genPlan(childId){
  const a=analyze(childId);
  const dims=["attention","memory","logic"];
  const steps=dims.map((d,i)=>{
    const r=a[d];
    let reason;
    if(r.count===0)reason="暂无数据，按基线评估启动";
    else if(r.trend==="up")reason="近况正确率上升（"+(r.accuracy*100).toFixed(0)+"%），提升难度梯度保持挑战";
    else if(r.trend==="down")reason="近况正确率下滑（"+(r.accuracy*100).toFixed(0)+"%），自动降低难度巩固基础";
    else if(r.plateau)reason="正确率长期高位（"+(r.accuracy*100).toFixed(0)+"%）进入平台期，提升难度突破";
    else reason="当前难度匹配，保持训练强度";
    const topErr=Object.entries(r.errors).sort((x,y)=>y[1]-x[1])[0];
    if(topErr){reason+="；主要错误："+(ERR_NAME[topErr[0]]||topErr[0]);}
    return {dim:d,difficulty:r.rec,reason};
  });
  return {childId,generatedAt:new Date().toISOString(),steps};
}
