import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "E:/学习内容/竞赛/新文科/Project2/outputs/visualization_charts";
const outputFile = `${outputDir}/启智训练台可视化图表.xlsx`;
const previewDir = `${outputDir}/预览`;
const wb = Workbook.create();
const font = "Microsoft YaHei";
const C = {
  navy: "#17324D", blue: "#3B82F6", cyan: "#06B6D4", green: "#10B981",
  amber: "#F59E0B", red: "#EF4444", purple: "#8B5CF6", pink: "#EC4899",
  ink: "#1F2937", muted: "#64748B", pale: "#F4F7FB", line: "#D7E1EC",
  white: "#FFFFFF", softBlue: "#EAF2FF", softGreen: "#E8F8F1", softAmber: "#FFF4DC",
  softRed: "#FDEBEC", softPurple: "#F1ECFF"
};

function baseSheet(name, title, note = "") {
  const s = wb.worksheets.add(name);
  s.showGridLines = false;
  s.getRange("A1:T42").format.font = { name: font, size: 10, color: C.ink };
  s.getRange("A1:T42").format.verticalAlignment = "center";
  s.getRange("A1:T42").format.rowHeight = 22;
  for (let col = 0; col < 20; col++) s.getRangeByIndexes(0, col, 42, 1).format.columnWidth = 12;
  s.getRange("A2:T2").merge();
  s.getRange("A2").values = [[title]];
  s.getRange("A2").format = { font: { name: font, size: 16, bold: true, color: C.navy }, rowHeight: 30 };
  s.getRange("A3:T3").format.borders = { bottom: { style: "thin", color: C.line } };
  if (note) {
    s.getRange("A4:T4").merge();
    s.getRange("A4").values = [[note]];
    s.getRange("A4").format = { font: { name: font, size: 9, italic: true, color: C.muted }, wrapText: true, rowHeight: 30 };
  }
  return s;
}

function box(s, range, text, fill, color = C.ink, size = 10) {
  s.getRange(range).merge();
  const r = s.getRange(range);
  r.values = [[text]];
  r.format = {
    fill, font: { name: font, size, bold: true, color },
    horizontalAlignment: "center", verticalAlignment: "center", wrapText: true,
    borders: { preset: "outside", style: "thin", color: C.line }
  };
  return r;
}

function arrow(s, cell, text = "→", color = C.blue) {
  const r = s.getRange(cell);
  r.values = [[text]];
  r.format = { font: { name: font, size: 16, bold: true, color }, horizontalAlignment: "center", verticalAlignment: "center" };
}

function section(s, range, text, fill = C.navy) {
  s.getRange(range).merge();
  const r = s.getRange(range);
  r.values = [[text]];
  r.format = { fill, font: { name: font, size: 11, bold: true, color: C.white }, horizontalAlignment: "left", verticalAlignment: "center" };
}

// 图表索引
{
  const s = baseSheet("图表索引", "启智训练台可视化图表", "依据《可视化图表参考.csv》制作。示例数值仅用于说明系统方法，不代表真实儿童评估结果。所有图表均可在 Excel 中继续编辑。");
  s.tabColor = C.navy;
  const rows = [
    ["序号", "图表名称", "图表形式", "用途"],
    [1, "系统运行技术路线图", "闭环流程图", "展示从建档到复评的完整运行闭环"],
    [2, "多来源证据融合权重", "三场景环形图", "比较不同数据可用情况下的权重"],
    [3, "过程性计分规则", "水平条形图", "区分独立、提示、协助和未完成"],
    [4, "动态难度调整规则", "决策流程图", "说明最近记录、短期连续表现和趋势判断"],
    [5, "六领域能力结构", "雷达图与结构图", "展示六领域示例画像及能力体系"],
    [6, "权限角色矩阵", "热力图矩阵", "展示四类角色在十项功能上的权限等级"],
    [7, "L0-L4 训练起点等级", "阶梯图", "说明档案画像 Agent 的五级训练起点"],
    [8, "系统产出结果", "信息卡片", "汇总运行后的八类核心结果"],
    [9, "数据来源与处理架构", "四层架构图", "展示数据进入系统后的处理与输出"],
    [10, "人机协同与风险闸门", "双列流程图", "比较正常流程与风险拦截流程"],
    [11, "训练方法与模块对应关系", "关系网络图", "展示十二种方法与六领域的对应关系"]
  ];
  s.getRange("A6:D17").values = rows;
  s.getRange("A6:D6").format = { fill: C.navy, font: { name: font, bold: true, color: C.white }, horizontalAlignment: "center", borders: { preset: "all", style: "thin", color: C.white } };
  s.getRange("A7:D17").format.borders = { preset: "inside", style: "thin", color: C.line };
  s.getRange("A7:A17").format.horizontalAlignment = "center";
  s.getRange("A6:A17").format.columnWidth = 9;
  s.getRange("B6:B17").format.columnWidth = 30;
  s.getRange("C6:C17").format.columnWidth = 22;
  s.getRange("D6:D17").format.columnWidth = 48;
  s.getRange("A7:D17").format.rowHeight = 28;
  section(s, "A20:D20", "阅读说明");
  s.getRange("A21:D24").merge();
  s.getRange("A21").values = [["本工作簿用于项目介绍、申报材料和答辩展示。涉及儿童能力的数值均为可视化示例；正式使用时应由实际游戏记录、专业评估、家庭观察和经专业人员复核的历史档案生成。"]];
  s.getRange("A21:D24").format = { fill: C.pale, font: { name: font, color: C.ink }, wrapText: true, verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: C.line } };
}

// 1 技术路线图
{
  const s = baseSheet("01技术路线", "系统运行技术路线图", "主流程按业务发生顺序排列，复评结果进入下一轮方案，形成持续闭环。");
  const items = ["建立档案", "采集证据", "生成画像", "风险检查", "推荐方案", "审核签署", "儿童训练", "动态调整", "生成报告", "周期复评", "下一轮方案"];
  const fills = [C.softBlue, C.softBlue, C.softPurple, C.softRed, C.softGreen, C.softAmber, C.softGreen, C.softPurple, C.softBlue, C.softAmber, C.softGreen];
  for (let i = 0; i < 6; i++) {
    const c1 = 1 + i * 3;
    box(s, `${String.fromCharCode(65+c1)}7:${String.fromCharCode(65+c1+1)}10`, `${i+1}\n${items[i]}`, fills[i], C.ink, 11);
    if (i < 5) arrow(s, `${String.fromCharCode(65+c1+2)}8`);
  }
  arrow(s, "R12", "↓", C.purple);
  for (let j = 0; j < 5; j++) {
    const i = 10 - j;
    const c1 = 1 + j * 3;
    box(s, `${String.fromCharCode(65+c1)}14:${String.fromCharCode(65+c1+1)}17`, `${i+1}\n${items[i]}`, fills[i], C.ink, 11);
    if (j < 4) arrow(s, `${String.fromCharCode(65+c1+2)}15`, "←", C.purple);
  }
  box(s, "B21:R24", "周期复评结果反馈到下一轮方案，并再次进入风险检查、训练和评估", C.navy, C.white, 12);
  arrow(s, "J19", "↺", C.green);
  s.getRange("B27:R30").merge();
  s.getRange("B27").values = [["闭环目标：让每一次训练都留下可追溯证据，并据此更新后续训练起点、难度与支持方式。"]];
  s.getRange("B27:R30").format = { fill: C.pale, font: { name: font, size: 11, color: C.ink }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
}

// 2 多来源融合
{
  const s = baseSheet("02证据权重", "多来源证据融合权重", "权重取自当前系统规则。缺少某类数据时，系统会自动采用对应场景，不会虚构缺失证据。");
  const blocks = [
    {start:"A6", end:"C9", title:"三源齐全", rows:[["来源","权重"],["平台游戏",55],["专业评估",35],["家庭观察",10]], pos:["A11","F25"]},
    {start:"H6", end:"J8", title:"无专业评估", rows:[["来源","权重"],["平台游戏",85],["家庭观察",15]], pos:["H11","M25"]},
    {start:"O6", end:"Q7", title:"仅游戏数据", rows:[["来源","权重"],["平台游戏",100]], pos:["O11","T25"]}
  ];
  for (const b of blocks) {
    s.getRange(`${b.start}:${b.end}`).values = b.rows;
    const top = b.start.match(/\d+/)[0];
    const sc = b.start.match(/[A-Z]+/)[0], ec = b.end.match(/[A-Z]+/)[0];
    s.getRange(`${sc}${top}:${ec}${top}`).format = { fill: C.navy, font: { name: font, bold: true, color: C.white }, horizontalAlignment: "center" };
    s.getRange(`${sc}${Number(top)+1}:${ec}${b.end.match(/\d+/)[0]}`).format.borders = { preset: "inside", style: "thin", color: C.line };
    const chart = s.charts.add("doughnut", s.getRange(`${b.start}:${b.end}`));
    chart.title = b.title;
    chart.titleTextStyle.typeface = font;
    chart.titleTextStyle.fontSize = 13;
    chart.legend = { position: "bottom", textStyle: { typeface: font, fontSize: 10 } };
    chart.setPosition(b.pos[0], b.pos[1]);
  }
  box(s, "B29:S32", "专业结果采用近一年记录；家庭观察采用近 30 日记录；所有来源均保留证据编号和时间。", C.pale, C.ink, 10);
}

// 3 过程性计分
{
  const s = baseSheet("03过程计分", "过程性计分规则", "领域得分 = 该领域所有任务得分的平均值 × 100。分值用于训练起点安排，不是临床量表分数。");
  s.getRange("A6:B11").values = [["完成状态","计分"],["独立完成",1],["重复听题后完成",0.8],["提示后完成",0.55],["协助后完成",0.5],["未完成",0]];
  s.getRange("A6:B6").format = { fill: C.navy, font: { name: font, bold: true, color: C.white }, horizontalAlignment: "center" };
  s.getRange("A7:B11").format.borders = { preset: "inside", style: "thin", color: C.line };
  s.getRange("B7:B11").format.numberFormat = "0.00";
  const chart = s.charts.add("bar", s.getRange("A6:B11"));
  chart.title = "五种完成状态的训练计分";
  chart.titleTextStyle.typeface = font;
  chart.hasLegend = false;
  chart.xAxis = { axisType: "textAxis", textStyle: { typeface: font, fontSize: 10 } };
  chart.yAxis = { numberFormatCode: "0.00", numberFormatSourceLinked: false, textStyle: { typeface: font, fontSize: 10 }, minimumScale: 0, maximumScale: 1 };
  chart.setPosition("D6", "N24");
  section(s, "A15:B15", "为什么记录过程");
  s.getRange("A16:B22").merge();
  s.getRange("A16").values = [["同样是“完成”，独立完成和在提示、重复听题或成人协助后完成所反映的支持需求不同。过程性计分使系统能够识别提示依赖，并据此调整下一轮训练。"]];
  s.getRange("A16:B22").format = { fill: C.pale, wrapText: true, verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: C.line } };
}

// 4 动态难度
{
  const s = baseSheet("04动态难度", "动态难度调整规则", "训练难度为 1—5 级。系统每次最多调整一级，以避免难度突然变化。");
  box(s, "H6:M8", "读取同一模块最近 6 次记录", C.navy, C.white, 11);
  arrow(s, "J9", "↓");
  box(s, "H10:M12", "计算加权完成率\n独立完成=1；协助完成=0.65", C.softBlue, C.ink, 10);
  arrow(s, "J13", "↓");
  box(s, "H14:M16", "至少有 3 次记录？", C.softAmber, C.ink, 11);
  arrow(s, "F15", "←"); box(s, "A14:E17", "否：保持当前难度\n数据不足，继续收集", C.pale, C.ink, 10);
  arrow(s, "N15", "→"); box(s, "O13:T15", "加权完成率 ≥ 80%\n升 1 级", C.softGreen, C.ink, 10);
  box(s, "O17:T19", "加权完成率 < 45%\n降 1 级", C.softRed, C.ink, 10);
  box(s, "O21:T23", "45%—79%\n保持当前难度", C.pale, C.ink, 10);
  section(s, "A21:M21", "单次训练内的即时调整");
  box(s, "A23:F26", "连续 2 题独立完成\n难度升 1 级", C.softGreen, C.ink, 10);
  box(s, "H23:M26", "连续 2 题未独立完成\n难度降 1 级", C.softRed, C.ink, 10);
  section(s, "A29:T29", "趋势识别：最近 5 次与此前 5 次比较");
  box(s, "A31:F35", "进步趋势\n提高 ≥ 15 个百分点", C.softGreen, C.ink, 10);
  box(s, "H31:M35", "下滑趋势\n下降 ≥ 15 个百分点", C.softRed, C.ink, 10);
  box(s, "O31:T35", "平台期\n近期正确率 ≥ 85%\n且难度未到最高级", C.softPurple, C.ink, 10);
}

// 5 六领域结构
{
  const s = baseSheet("05六领域", "六领域能力结构", "左侧为匿名儿童的可视化示例数据；右侧为系统六领域能力体系。示例数据不代表真实评估结果。");
  s.getRange("A6:B12").values = [["能力领域","示例分数"],["注意与感知",72],["记忆",64],["执行与逻辑",58],["语言沟通",69],["社会情绪",55],["生活适应",61]];
  s.getRange("A6:B6").format = { fill: C.navy, font: { name: font, bold: true, color: C.white }, horizontalAlignment: "center" };
  const chart = s.charts.add("radar", s.getRange("A6:B12"));
  chart.title = "六领域训练起点示例";
  chart.titleTextStyle.typeface = font;
  chart.hasLegend = false;
  chart.setPosition("A15", "J34");
  box(s, "N17:Q20", "六领域\n训练画像", C.navy, C.white, 12);
  const domains = [
    ["K8:N11","注意与感知",C.softBlue],["O7:R10","记忆",C.softPurple],["Q12:T15","执行与逻辑",C.softAmber],
    ["Q23:T26","语言沟通",C.softGreen],["O28:R31","社会情绪",C.softRed],["K25:N28","生活适应",C.softBlue]
  ];
  for (const [range,label,fill] of domains) box(s, range, label, fill, C.ink, 10);
  for (const c of ["O12","R16","R22","O26","M23","M13"]) arrow(s,c,"↔",C.muted);
  box(s, "K35:T38", "六领域相互关联，但系统分别保留每个领域的证据、得分和训练记录。", C.pale, C.ink, 10);
}

// 6 权限矩阵
{
  const s = baseSheet("06权限矩阵", "权限角色矩阵", "权限等级：0 无权限，1 查看，2 操作，3 管理。矩阵依据当前原型的角色职责整理。");
  const funcs = ["查看个人训练", "提交家庭观察", "查看儿童报告", "管理儿童档案", "录入专业评估", "审核画像方案", "签署专业计划", "记录训练活动", "审核训练内容", "机构与账号管理"];
  const data = [
    ["功能", "儿童", "家长", "康复医疗专业人员", "管理员"],
    [funcs[0],2,1,2,0],[funcs[1],0,2,1,0],[funcs[2],1,1,2,1],[funcs[3],0,0,3,0],[funcs[4],0,0,3,0],
    [funcs[5],0,1,3,1],[funcs[6],0,1,3,0],[funcs[7],1,2,3,0],[funcs[8],0,0,1,3],[funcs[9],0,0,0,3]
  ];
  s.getRange("A6:E16").values = data;
  s.getRange("A6:E6").format = { fill: C.navy, font: { name: font, bold: true, color: C.white }, horizontalAlignment: "center", wrapText: true, rowHeight: 38 };
  s.getRange("A7:A16").format = { fill: C.pale, font: { name: font, bold: true, color: C.ink } };
  s.getRange("B7:E16").format.horizontalAlignment = "center";
  s.getRange("B7:E16").conditionalFormats.add("colorScale", { colors: ["#F1F5F9", "#FDE68A", "#10B981"], thresholds: ["min", { type: "num", value: 1.5 }, "max"] });
  s.getRange("A6:E16").format.borders = { preset: "all", style: "thin", color: C.line };
  s.getRange("A6:A16").format.columnWidth = 26;
  s.getRange("B6:C16").format.columnWidth = 14;
  s.getRange("D6:D16").format.columnWidth = 24;
  s.getRange("E6:E16").format.columnWidth = 15;
  section(s, "G6:J6", "权限等级说明");
  box(s, "G8:J10", "0  无权限", "#F1F5F9", C.ink, 10);
  box(s, "G12:J14", "1  查看", "#FFF7D6", C.ink, 10);
  box(s, "G16:J18", "2  操作", "#CFF4DF", C.ink, 10);
  box(s, "G20:J22", "3  管理", C.green, C.white, 10);
  box(s, "A20:E24", "管理员仅查看脱敏运营汇总，不能读取儿童临床档案。专业评估与方案签署由康复医疗专业人员完成。", C.softRed, C.ink, 10);
}

// 7 L0-L4
{
  const s = baseSheet("07训练等级", "L0-L4 训练起点等级", "等级由历史文字证据生成，仅表示训练支持起点；自动结果须经专业人员审核后才能生效。");
  const levels = [
    ["L0", "资料不足", "低刺激探索题，继续收集真实表现", 4, C.pale],
    ["L1", "需要充分支持", "2 个选项、一步指令、视觉和语音提示", 7, C.softRed],
    ["L2", "可在提示下完成部分任务", "3 个选项、一步指令、按需提示", 10, C.softAmber],
    ["L3", "基本能够完成", "4 个选项、两步指令、延迟提示", 13, C.softBlue],
    ["L4", "表现较稳定，可尝试泛化", "提高情境变化与迁移要求", 16, C.softGreen]
  ];
  for (let i=0;i<levels.length;i++) {
    const [code,label,desc,width,fill]=levels[i], row=7+i*6;
    box(s, `B${row}:${String.fromCharCode(66+width)}${row+3}`, `${code}  ${label}\n${desc}`, fill, C.ink, 10);
  }
  s.getRange("Q7:T34").merge();
  s.getRange("Q7").values = [["证据更多、表现更稳定\n\n↑\n\n支持逐步减少\n任务复杂度逐步提高"]];
  s.getRange("Q7:T34").format = { fill: C.navy, font: { name: font, size: 11, bold: true, color: C.white }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
}

// 8 系统产出
{
  const s = baseSheet("08系统产出", "系统产出结果", "系统输出用于训练支持、过程记录和专业复核。");
  const cards = [
    ["B7:F12","01\n六领域训练起点画像","分数、来源、权重与置信度",C.softBlue],
    ["H7:L12","02\n个性化训练方案","优先领域、难度、频率和时长",C.softGreen],
    ["N7:R12","03\n可执行游戏题集","按能力领域和难度组织",C.softPurple],
    ["B15:F20","04\n训练过程记录","提示、协助、反应时间与错误",C.softAmber],
    ["H15:L20","05\n可视化进度报告","趋势、训练量和前后对比",C.softBlue],
    ["N15:R20","06\n档案证据链","定位原文件、页码与原句",C.softGreen],
    ["B23:F28","07\n审核签署版本","保留当前版本和历史版本",C.softPurple],
    ["H23:L28","08\n风险暂停提示","触发人工复核和训练拦截",C.softRed]
  ];
  for (const [range,title,desc,fill] of cards) {
    box(s, range, `${title}\n\n${desc}`, fill, C.ink, 10);
  }
  box(s, "B33:R37", "系统不输出医学诊断、智商或疾病严重程度", C.navy, C.white, 13);
}

// 9 四层架构
{
  const s = baseSheet("09数据架构", "数据来源与处理架构", "数据按“采集—处理—控制—应用”逐层流动，每一层均保留来源和审核状态。");
  const layers = [
    ["数据采集层", ["平台游戏记录", "专业评估结果", "家庭生活观察", "历史扫描档案"], C.softBlue],
    ["数据处理层", ["过程性计分", "多来源加权融合", "本地 OCR 与字段提取", "证据分类与置信度"], C.softPurple],
    ["决策控制层", ["动态难度调整", "风险词识别与暂停", "专业人员审核签署", "角色权限与审计留痕"], C.softAmber],
    ["输出应用层", ["六领域能力画像", "个性化训练方案", "训练游戏与活动", "报告、复评与下一轮计划"], C.softGreen]
  ];
  for(let i=0;i<layers.length;i++){
    const [name,items,fill]=layers[i], row=6+i*8;
    box(s, `A${row}:D${row+4}`, name, C.navy, C.white, 12);
    for(let j=0;j<4;j++) box(s, `${String.fromCharCode(70+j*4)}${row}:${String.fromCharCode(72+j*4)}${row+4}`, items[j], fill, C.ink, 10);
    if(i<3) arrow(s, `J${row+6}`, "↓", C.purple);
  }
}

// 10 人机协同与风险闸门
{
  const s = baseSheet("10风险闸门", "人机协同与风险闸门", "风险包括癫痫、自伤、攻击、严重情绪爆发、吞咽和跌倒风险。");
  section(s, "A6:F6", "正常训练流程");
  section(s, "O6:T6", "风险拦截流程", C.red);
  const normal=["读取已审核画像","生成训练任务","儿童开始训练","记录过程表现","更新下一轮建议"];
  const risk=["识别风险证据","自动暂停线上训练","仅允许专业人员预览","人工评估禁忌与环境","审核后决定恢复或改为线下"];
  for(let i=0;i<5;i++){
    const row=8+i*6;
    box(s,`A${row}:F${row+3}`,normal[i],i===4?C.softGreen:C.softBlue,C.ink,10);
    box(s,`O${row}:T${row+3}`,risk[i],i===1?C.softRed:C.softAmber,C.ink,10);
    if(i<4){arrow(s,`C${row+4}`,"↓",C.green);arrow(s,`Q${row+4}`,"↓",C.red);}
  }
  section(s,"H6:M6","六条人机协同原则",C.purple);
  const principles=["自动结果先保存为草稿","专业人员逐域审核调整","签署后才进入儿童端","原始证据和页码可追溯","资料不足保持 L0","模型文案不参与临床评分"];
  for(let i=0;i<6;i++) box(s,`H${8+i*5}:M${10+i*5}`,`${i+1}. ${principles[i]}`,C.softPurple,C.ink,9);
}

// 11 方法与领域关系
{
  const s = baseSheet("11方法关系", "训练方法与能力领域对应关系", "连线关系采用可读矩阵表示：● 为主要关联，○ 为辅助关联。方法名称用于说明训练设计依据，不表示平台正在实施医疗治疗。");
  const methods=["ABA","TEACCH","NDBI","感觉统合支持","言语语言训练","作业治疗支持","物理治疗支持","音乐/游戏/艺术","社交故事","AAC","认知训练","家庭中心支持"];
  const domains=["注意与感知","记忆","执行与逻辑","语言沟通","社会情绪","生活适应"];
  const links=[
    [2,1,2,1,1,0],[1,0,2,0,1,2],[1,0,0,2,2,1],[2,0,0,0,1,2],
    [0,1,0,2,1,0],[1,0,2,0,0,2],[1,0,1,0,0,2],[1,1,0,1,2,1],
    [0,0,1,1,2,1],[0,0,0,2,1,1],[2,2,2,1,0,1],[1,1,1,2,2,2]
  ];
  const matrix=[["训练方法",...domains],...methods.map((m,i)=>[m,...links[i].map(v=>v===2?"●":v===1?"○":"")])];
  s.getRange("A6:G18").values=matrix;
  s.getRange("A6:G6").format={fill:C.navy,font:{name:font,bold:true,color:C.white},horizontalAlignment:"center",wrapText:true,rowHeight:38};
  s.getRange("A7:A18").format={fill:C.pale,font:{name:font,bold:true,color:C.ink}};
  s.getRange("B7:G18").format={horizontalAlignment:"center",font:{name:font,size:14,bold:true,color:C.blue}};
  s.getRange("A6:G18").format.borders={preset:"all",style:"thin",color:C.line};
  s.getRange("A6:A18").format.columnWidth=24;
  s.getRange("B6:G18").format.columnWidth=17;
  s.getRange("A7:G18").format.rowHeight=28;
  section(s,"I6:T6","六领域说明");
  const notes=[
    ["注意与感知","视觉、听觉、搜索、辨别和注意保持",C.softBlue],
    ["记忆","再认、序列记忆和工作记忆",C.softPurple],
    ["执行与逻辑","分类、因果、数量、计划和规则转换",C.softAmber],
    ["语言沟通","理解、表达、指令、命名和辅助沟通",C.softGreen],
    ["社会情绪","情绪识别、共同注意、轮流和社交规则",C.softRed],
    ["生活适应","自理步骤、动作、模仿和日常生活",C.softBlue]
  ];
  for(let i=0;i<notes.length;i++) box(s,`I${8+i*5}:T${10+i*5}`,`${notes[i][0]}：${notes[i][1]}`,notes[i][2],C.ink,9);
}

// 数据来源
{
  const s = baseSheet("数据来源", "图表数据与规则来源", "本页记录各图表依据，便于核对和后续更新。");
  s.tabColor = C.muted;
  const rows=[
    ["图表", "主要依据", "性质"],
    ["01 系统运行技术路线图", "README.md、onboarding-assessment.js、clinical-workflow.js", "现行系统流程"],
    ["02 多来源证据融合权重", "assessment-framework.js：55%/35%/10%，85%/15%，100%", "现行计算规则"],
    ["03 过程性计分规则", "question-logic-v2.js：1.0、0.8、0.55、0.5、0", "现行计算规则"],
    ["04 动态难度调整规则", "question-logic-v2.js、ai.js", "现行计算规则"],
    ["05 六领域能力结构", "enhanced.js、onboarding-assessment.js", "结构为现行设计；数值为示例"],
    ["06 权限角色矩阵", "config.js、enhanced.js、数据库权限动作", "依据现行角色职责整理"],
    ["07 L0-L4 训练起点等级", "backend/profile_agent.py", "现行 Agent 规则"],
    ["08 系统产出结果", "README.md、report.js、clinical-workflow.js", "现行系统产出"],
    ["09 数据来源与处理架构", "README.md、import_pipeline.py、database.js", "依据现行模块整理"],
    ["10 人机协同与风险闸门", "profile_agent.py、safety-governance.js", "现行审核与安全规则"],
    ["11 训练方法与模块关系", "rehabilitation-methods.js", "依据现行方法目录整理"]
  ];
  s.getRange("A6:C17").values=rows;
  s.getRange("A6:C6").format={fill:C.navy,font:{name:font,bold:true,color:C.white},horizontalAlignment:"center"};
  s.getRange("A6:C17").format.borders={preset:"all",style:"thin",color:C.line};
  s.getRange("A6:A17").format.columnWidth=28;
  s.getRange("B6:B17").format.columnWidth=70;
  s.getRange("C6:C17").format.columnWidth=25;
  s.getRange("A7:C17").format.rowHeight=28;
  section(s,"A20:C20","重要说明");
  s.getRange("A21:C25").merge();
  s.getRange("A21").values=[["项目中的 CSV 样例数据用于产品展示和流程测试，不是公开医学数据库，也不是临床试验样本。六领域示例画像只用于演示图表结构。正式应用应使用真实训练记录、合法施测的专业结果、近期家庭观察和经人工复核的历史档案。"]];
  s.getRange("A21:C25").format={fill:C.softRed,wrapText:true,verticalAlignment:"center",borders:{preset:"outside",style:"thin",color:C.red}};
}

wb.recalculate();
await fs.mkdir(previewDir,{recursive:true});
for (const s of wb.worksheets.items) {
  const preview=await wb.render({sheetName:s.name,autoCrop:"all",scale:1,format:"png"});
  await fs.writeFile(`${previewDir}/${s.name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
const inspection=await wb.inspect({kind:"sheet,drawing",include:"id,name,type",maxChars:12000});
await fs.writeFile(`${outputDir}/inspection.ndjson`,inspection.ndjson,"utf8");
const errors=await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",options:{useRegex:true,maxResults:300},summary:"最终公式错误扫描"});
await fs.writeFile(`${outputDir}/errors.ndjson`,errors.ndjson,"utf8");
const out=await SpreadsheetFile.exportXlsx(wb);
await out.save(outputFile);
console.log(JSON.stringify({outputFile,sheets:wb.worksheets.items.map(s=>s.name),inspection:inspection.ndjson,errorScan:errors.ndjson}));
