import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/ASUS1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.goto(process.env.SMOKE_URL||'http://127.0.0.1:8765/index.html',{waitUntil:'networkidle'});
await page.click('[data-role="teacher"]');await page.fill('#pinInput','1234');await page.click('#loginBtn');
await page.click('[data-tab="setting"]');await page.click('#openScanImport');
await page.evaluate(()=>{
  const domains=Object.entries({A:'注意与感知',B:'记忆',C:'执行与逻辑',D:'语言沟通',E:'社会情绪',F:'生活适应'}).map(([domain,name])=>({domain,name,level:domain==='D'?1:2,score:46,confidence:.8,label:'可在提示下完成部分任务',contradiction:domain==='D',evidenceCount:1,promptLevels:['视觉提示']}));
  renderProfileAgentReview({runId:'RUN-UI',profile:{childId:children[0].id,sourceBatchId:'BAT-UI',confidence:.8,notice:'测试草稿，不是诊断。',domains},solution:{riskFlags:[],priorityDomains:['D','A','B'],modulePlans:TRAINING_CATALOG.map((item,index)=>({moduleId:item.id,moduleName:item.name,domain:item.domain,priority:index+1,frequencyPerWeek:2,minutes:5,parameters:{difficulty:1},reason:'测试证据'})),questions:TRAINING_CATALOG.map(item=>({moduleId:item.id,moduleName:item.name,prompt:'请选择目标',target:'⭐',choices:['⭐','🌙']}))},evidence:[{domain:'D',page:3,confidence:.8,direction:'support_needed',text:'完成两步指令时需要手势提示'}]});
});
await page.waitForSelector('.agent-domain-card');if(await page.locator('.agent-domain-card').count()!==6)throw new Error('Expected six domain cards');
await page.evaluate(()=>{
  const childId=children[0].id;plans[childId]={childId,generatedAt:'agent-test',steps:[{dim:'attention',difficulty:1},{dim:'memory',difficulty:1},{dim:'logic',difficulty:1}]};enhancedState.reviews.push({id:'review-test',childId,planGeneratedAt:'agent-test',result:'accepted',ts:Date.now()});agentQuestionCache.set(childId,{questions:[{questionId:'Q1',moduleId:'P01',moduleName:'颜色识别',domain:'A',difficulty:1,prompt:'请找到星星',target:'⭐',choices:['⭐','🌙'],parameters:{prompt:'视觉+语音'},encouragement:'做得好！',errorFeedback:'慢慢来'}]});openTrainer(childId,'P01',1,null);
});
await page.waitForSelector('.agent-training-source');await page.click('[data-agent-choice="0"]');await page.waitForSelector('.agent-answer-celebration.ok');
if(errors.length)throw new Error(errors.join('; '));
console.log('Profile agent UI passed: six-domain review and effective personalized question execution.');
await browser.close();
