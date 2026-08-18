import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
const source = match?.[1].replace(/^"use strict";\s*/, '');
const heading = name => `/* ============ ${name} ============ */`;
const sections = [
  ['utils.js', '基础工具', '状态'],
  ['storage.js', '状态', '权限'],
  ['config.js', '权限', '本地 AI 分析引擎（启发式，非云端大模型）'],
  ['ai.js', '本地 AI 分析引擎（启发式，非云端大模型）', '渲染：登录'],
  ['auth.js', '渲染：登录', '进入主界面'],
  ['app.js', '进入主界面', '档案 Tab'],
  ['children.js', '档案 Tab', '训练 Tab'],
  ['training.js', '训练 Tab', '引导式基线评估（不写训练记录，仅产出 0-100 基线分）'],
  ['assessment.js', '引导式基线评估（不写训练记录，仅产出 0-100 基线分）', 'AI 方案 Tab'],
  ['ai-view.js', 'AI 方案 Tab', '报表 Tab'],
  ['report.js', '报表 Tab', '设置 Tab'],
  ['settings.js', '设置 Tab', '导入/导出'],
  ['backup.js', '导入/导出', '弹窗/确认'],
  ['modal.js', '弹窗/确认', '顶栏按钮'],
  ['bootstrap.js', '顶栏按钮', null],
];

if (!source) {
  for (const [file] of sections) {
    const url = new URL(`../js/${file}`, import.meta.url);
    const body = readFileSync(url, 'utf8').replace(/^"use strict";\s*/, '');
    writeFileSync(url, body, 'utf8');
  }
  process.exit(0);
}

mkdirSync(new URL('../js/', import.meta.url), { recursive: true });
for (const [file, startName, endName] of sections) {
  const start = source.indexOf(heading(startName));
  const end = endName ? source.indexOf(heading(endName), start + 1) : source.length;
  if (start < 0 || end < 0) throw new Error(`无法定位代码段：${startName}`);
  let body = source.slice(start, end).trim();
  if (file === 'storage.js') body = body.replace(/\nif\(children===null\|\|settings\.sample\)\{seed\(\);\}\s*$/, '');
  if (file === 'bootstrap.js') body = `${heading('顶栏按钮')}\n// 所有业务函数加载完成后再初始化示例数据；seed() 会调用 AI 方案生成器。\nif(children===null||settings.sample){seed();}\n\n${body.slice(heading('顶栏按钮').length).trimStart()}`;
  writeFileSync(new URL(`../js/${file}`, import.meta.url), `${body}\n`, 'utf8');
}

const tags = sections.map(([file]) => `  <script src="js/${file}"></script>`).join('\n');
const nextHtml = html.replace(/<script>\s*[\s\S]*?\s*<\/script>/, `<!-- 按依赖顺序加载拆分后的业务模块 -->\n${tags}`);
writeFileSync(htmlPath, nextHtml, 'utf8');

// 移除旧版拆分中未被页面使用、且内容与当前实现冲突的孤立文件。
for (const stale of ['js/ui.js']) {
  try { rmSync(new URL(`../${stale}`, import.meta.url)); } catch {}
}
