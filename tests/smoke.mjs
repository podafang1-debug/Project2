import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/ASUS1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage();
page.setDefaultTimeout(5000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));

await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle' });
const api = await page.evaluate(() => ({ genPlan: typeof genPlan, enterApp: typeof enterApp }));
if (api.genPlan !== 'function' || api.enterApp !== 'function') {
  throw new Error(`Expected shared browser globals, got ${JSON.stringify(api)}`);
}
const roleCount = await page.locator('.role-card').count();
if (roleCount !== 4) throw new Error(`Expected 4 merged role cards, got ${roleCount}`);
const roleOrder = await page.locator('.role-card').evaluateAll(cards => cards.map(card => card.dataset.role).join(','));
if (roleOrder !== 'child,parent,teacher,admin') throw new Error(`Unexpected role order: ${roleOrder}`);
await page.click('[data-role="teacher"]');
await page.fill('#pinInput', '1234');
await page.click('#loginBtn');
await page.waitForSelector('#main:not(.hidden)');
// 未审核方案必须在所有训练入口被拦截。
await page.click('[data-tab="train"]');
await page.locator('.module-card').first().click();
await page.waitForSelector('#closeTrainingGate');
if (!await page.locator('.safety-stop-card').textContent().then(text => text.includes('尚未'))) throw new Error('Pending plan was not blocked');
await page.click('#closeTrainingGate');
await page.click('[data-tab="ai"]');
await page.click('[data-review-result="accepted"]');
await page.click('[data-tab="train"]');
await page.waitForFunction(() => document.querySelector('[data-tab="train"]')?.classList.contains('on'));
const moduleCount = await page.locator('.module-card').count();
if (moduleCount !== 22) throw new Error(`Expected 22 training modules, got ${moduleCount}`);
await page.locator('.module-card').first().click();
await page.waitForSelector('#trainMask:not(.hidden)');
await page.click('#closeTrain');
await page.click('[data-tab="setting"]');
await page.waitForSelector('[data-panel="auditLimited"]');
await page.waitForSelector('[data-panel="assessment"]');
await page.click('[data-open-method-center]');
await page.waitForSelector('.method-catalog');
if (await page.locator('.method-card').count() !== 12) throw new Error('Expected 12 rehabilitation method cards');
await page.click('#closeMethodCenter');
await page.click('[data-tab="archive"]');
await page.locator('.simulate-cycle').first().click();
await page.waitForSelector('.cycle-flow');
const simulatedCount = await page.evaluate(() => records.filter(record => record.source === 'simulation').length);
if (simulatedCount !== 12) throw new Error(`Expected 12 simulated answers, got ${simulatedCount}`);
await page.click('#closeCycle');
await page.waitForSelector('.history-list em');
// 权限回归：儿童账号只能看到训练和报表，直接请求设置页也会被拦截。
await page.click('[data-tab="setting"]');
await page.click('#logout');
await page.click('[data-role="child"]');
await page.fill('#pinInput', '1111');
await page.click('#loginBtn');
await page.waitForSelector('#main:not(.hidden)');
await page.waitForSelector('#baselineJourney');
await page.click('#journeyPause');
if (await page.locator('#accBanner:not(.hidden)').count()) throw new Error('Child must not see the backup/data banner');
if (await page.locator('#todayBox:not(.hidden)').count()) throw new Error('Child must not see the professional schedule panel');
const visibleTabs = await page.locator('.tab:not(.hidden)').count();
if (visibleTabs !== 2) throw new Error(`Child should see 2 tabs, got ${visibleTabs}`);
await page.evaluate(() => showTab('setting'));
const activeTab = await page.locator('.tab.on').getAttribute('data-tab');
if (activeTab !== 'train') throw new Error(`Unauthorized navigation was not blocked: ${activeTab}`);
await page.click('#globalLogout');
await page.click('[data-role="admin"]');
await page.fill('#pinInput', '8888');
await page.click('#loginBtn');
await page.waitForSelector('#main:not(.hidden)');
if (await page.locator('[data-tab="ai"]:not(.hidden)').count()) throw new Error('Admin must not access AI review');
if (await page.locator('[data-tab="archive"]:not(.hidden)').count()) throw new Error('Admin must not access identifiable child archives');
await page.click('[data-tab="report"]');
await page.waitForSelector('text=脱敏运营看板');
await page.click('[data-tab="setting"]');
await page.waitForSelector('[data-panel="contentReview"]');
await page.waitForSelector('[data-panel="org"]');
const mergedRoles=await page.evaluate(()=>relationalDb.roles.map(x=>x.code).sort().join(','));
if(mergedRoles!=='admin,child,parent,teacher')throw new Error(`Old roles remain in database: ${mergedRoles}`);

if (errors.length) throw new Error(errors.join('\n'));
console.log('Smoke test passed: login, app startup and tab navigation work.');
await browser.close();
