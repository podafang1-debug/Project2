/* ============ 引导式基线评估（不写训练记录，仅产出 0-100 基线分） ============ */
function openBaselineAssessment(name,prefill){
  const sheet=$("#trainSheet");
  sheet.innerHTML='<h3>引导式基线评估 · '+esc(name||"新儿童")+'<button class="x" id="closeTrain">'+svg("cross","currentColor",18)+'</button></h3>'+
    '<div style="position:relative"><div id="trainBody"></div><div class="fb" id="trainFb"></div></div>';
  $("#trainMask").classList.remove("hidden");
  $("#closeTrain").onclick=()=>{$("#trainMask").classList.add("hidden");};
  const body=$("#trainBody");
  const dims=[{key:"attention",title:"注意力",run:assessAttention},
              {key:"memory",title:"记忆力",run:assessMemory},
              {key:"logic",title:"逻辑力",run:assessLogic}];
  const scores={};let di=0;
  function next(){
    if(di>=dims.length){prefill(scores);$("#trainMask").classList.add("hidden");toast("基线已生成，请保存档案");return;}
    const dim=dims[di];
    body.innerHTML='<div class="train-summary"><p style="font-size:16px">正在评估：<b>'+dim.title+'</b></p>'+
      '<p style="color:var(--sub)">第 '+(di+1)+' / 3 项 · 共 3 小题，请儿童按日常方式完成</p></div>';
    setTimeout(()=>dim.run(body,score=>{scores[dim.key]=score;di++;next();}),450);
  }
  next();
}
function assessAttention(body,cb){
  const rounds=3;let ri=0,ok=0;const n=4;
  function round(){
    if(ri>=rounds){cb(Math.round(ok/rounds*100));return;}
    const target=ICON_SET[Math.floor(Math.random()*ICON_SET.length)];
    let pool=ICON_SET.filter(i=>i!==target);shuffle(pool);
    let cells=[target].concat(pool.slice(0,n-1));shuffle(cells);
    body.innerHTML='<div class="train-prompt">请点出和目标一样的图案</div>'+
      '<div class="train-target">'+svg(target,ICON_COLOR[target],64)+'</div>'+
      '<div class="train-grid g'+n+'">'+cells.map((ic,idx)=>'<button class="train-cell" data-i="'+idx+'">'+svg(ic,ICON_COLOR[ic],46)+'</button>').join("")+'</div>'+
      '<div class="train-progress">第 '+(ri+1)+' / '+rounds+' 轮</div>';
    $$(".train-cell",body).forEach(b=>b.onclick=()=>{const correct=cells[+b.dataset.i]===target;if(correct)ok++;ri++;feedback(correct,round);});
  }
  round();
}
function assessMemory(body,cb){
  const pairCount=3;const used=ICON_SET.slice(0,pairCount);
  let deck=[];used.forEach(ic=>{deck.push(ic);deck.push(ic);});shuffle(deck);
  const matched=new Set();let flipped=[];let lock=false;let ok=0;const cols=3;
  function render(){
    body.innerHTML='<div class="train-prompt">翻开两张相同的卡片配对（共 '+pairCount+' 对）</div>'+
      '<div class="mem-grid" style="grid-template-columns:repeat('+cols+',1fr)">'+deck.map((ic,idx)=>{
        const f=flipped.includes(idx),m=matched.has(idx);
        const inner=(f||m)?svg(ic,ICON_COLOR[ic],42):'<svg viewBox="0 0 24 24" width="42" height="42"><rect x="3" y="3" width="18" height="18" rx="4" fill="#CBD5E1"/></svg>';
        return '<button class="mem-cell'+(m?" matched":"")+'" data-i="'+idx+'"'+(m?" disabled":"")+'>'+inner+'</button>';
      }).join("")+'</div>'+
      '<div class="train-progress">已配对 '+(matched.size/2)+' / '+pairCount+'</div>';
    $$(".mem-cell",body).forEach(b=>b.onclick=()=>{
      if(lock)return;const i=+b.dataset.i;
      if(flipped.includes(i)||matched.has(i))return;
      flipped.push(i);
      if(flipped.length===2){
        lock=true;const [a,b2]=flipped;const correct=deck[a]===deck[b2];if(correct)ok++;
        render();
        setTimeout(()=>{if(correct){matched.add(a);matched.add(b2);}flipped=[];lock=false;if(matched.size===deck.length)cb(Math.round(ok/pairCount*100));else render();},correct?450:750);
      }else render();
    });
  }
  render();
}
function assessLogic(body,cb){
  const rounds=3;let ri=0,ok=0;
  const shapes=["circle","square","triangle","star"];
  const colors=["#EF4444","#F59E0B","#10B981","#4F86F7"];
  function round(){
    if(ri>=rounds){cb(Math.round(ok/rounds*100));return;}
    const common=shapes[Math.floor(Math.random()*shapes.length)];
    let odd=shapes[(shapes.indexOf(common)+1)%shapes.length];
    const col=colors[Math.floor(Math.random()*colors.length)];
    let cells=[{s:common,c:col},{s:common,c:col},{s:common,c:col},{s:odd,c:col}];
    shuffle(cells);
    const oddIdx=cells.findIndex(x=>x.s===odd);
    body.innerHTML='<div class="train-prompt">哪一张不一样？点它</div>'+
      '<div class="logic-grid">'+cells.map((c,idx)=>'<button class="logic-cell" data-i="'+idx+'">'+svgShape(c.s,c.c,50)+'</button>').join("")+'</div>'+
      '<div class="train-progress">第 '+(ri+1)+' / '+rounds+' 轮</div>';
    $$(".logic-cell",body).forEach(b=>b.onclick=()=>{const correct=+b.dataset.i===oddIdx;if(correct)ok++;ri++;feedback(correct,round);});
  }
  round();
}
