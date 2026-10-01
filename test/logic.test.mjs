/**
 * 健身 PWA —— 核心纯逻辑单元测试（Node 运行）
 *
 * 运行方式（需先用 esbuild 把 TS 工具函数打包成 logic.bundle.mjs）：
 *   node_modules/.bin/esbuild test/_bundle_entry.ts --bundle --format=esm --platform=node --outfile=test/logic.bundle.mjs
 *   node test/logic.test.mjs
 *
 * 覆盖：bilibili 解析 / schedule 排期 / stats 连续天数与完成率
 * 同时包含正常路径 + 边界/异常路径。
 */
import * as U from './logic.bundle.mjs';

let pass = 0;
let fail = 0;
const failures = [];

// ---------- 微型断言框架 ----------
function run(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    fail += 1;
    failures.push(`${name} :: ${e.message}`);
    console.log(`FAIL  ${name} :: ${e.message}`);
  }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${msg || ''} expected ${b} but got ${a}`);
  }
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'expected truthy');
}

// ---------- 测试数据工厂 ----------
// 构造 Task：id / mode / perTimes / weekdays
function mkTask(id, mode, perTimes, weekdays) {
  return {
    id,
    name: `Task-${id}`,
    type: 'link',
    schedule: { mode, perTimes, ...(weekdays ? { weekdays } : {}) },
    createdAt: 0,
  };
}
// 构造 Checkin
function mkCheckin(taskId, ts) {
  return { id: `c-${taskId}-${ts}`, taskId, taskName: 'x', type: 'link', ts };
}
// 本地零点 Date（与 JS Date 一致：month 为 0 基，0=一月）
function d(y, m, day, h = 0, mi = 0, s = 0) {
  return new Date(y, m, day, h, mi, s).getTime();
}
// N 天前的零点时间戳（用于依赖"今天"的连续天数测试）
function tsDaysAgo(n) {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - n);
  return x.getTime();
}

// ===================================================================
// 1) bilibili.ts
// ===================================================================
console.log('\n===== bilibili.parseBilibiliBvid =====');
run('标准 bilibili 视频页 URL 解析出 BV 号', () => {
  eq(U.parseBilibiliBvid('https://www.bilibili.com/video/BV1xx411c7mD'), 'BV1XX411C7MD');
});
run('小写 bv 前缀应规范化为大写', () => {
  eq(U.parseBilibiliBvid('https://www.bilibili.com/video/bv1xx411c7md'), 'BV1XX411C7MD');
});
run('b23.tv 短链含 BV 时也能解析', () => {
  eq(U.parseBilibiliBvid('https://b23.tv/BV1xx411c7mD'), 'BV1XX411C7MD');
});
run('带查询参数的 URL 不应把参数吞进 BV 号', () => {
  eq(U.parseBilibiliBvid('https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=10'), 'BV1XX411C7MD');
});
run('YouTube 链接应返回 null', () => {
  eq(U.parseBilibiliBvid('https://www.youtube.com/watch?v=abc123'), null);
});
run('抖音链接应返回 null', () => {
  eq(U.parseBilibiliBvid('https://www.douyin.com/video/700000'), null);
});
run('空字符串应返回 null', () => {
  eq(U.parseBilibiliBvid(''), null);
});
run('b23.tv 纯短码（无 BV）返回 null（已知局限，非 B 站可解析）', () => {
  eq(U.parseBilibiliBvid('https://b23.tv/abc123xyz'), null);
});

console.log('\n===== bilibili.buildBilibiliEmbed =====');
run('B 站链接生成 iframe 嵌入且含 bvid', () => {
  const html = U.buildBilibiliEmbed('https://www.bilibili.com/video/BV1xx411c7mD');
  ok(html && html.startsWith('<iframe'), '应返回 iframe 片段');
  ok(html.includes('bvid=BV1XX411C7MD'), 'iframe 应包含 bvid 参数');
  ok(html.includes('player.bilibili.com'), 'iframe src 应为 B 站播放器');
});
run('非 B 站链接返回 null', () => {
  eq(U.buildBilibiliEmbed('https://www.youtube.com/watch?v=1'), null);
});

console.log('\n===== bilibili.processLinkInput =====');
run('B 站链接且未提供 embed 时自动生成 iframe', () => {
  const r = U.processLinkInput('https://www.bilibili.com/video/BV1xx411c7mD', '');
  ok(r.linkUrl.includes('bilibili'), 'linkUrl 应保留原链接');
  ok(r.embedHtml.startsWith('<iframe'), 'embedHtml 应自动填充 iframe');
});
run('已提供 embedHtml 时不覆盖', () => {
  const custom = '<div>custom</div>';
  const r = U.processLinkInput('https://www.bilibili.com/video/BV1xx411c7mD', custom);
  eq(r.embedHtml, custom);
});
run('空链接返回空对象（兜底）', () => {
  eq(U.processLinkInput('', ''), { linkUrl: '', embedHtml: '' });
});

// ===================================================================
// 2) schedule.ts
// ===================================================================
console.log('\n===== schedule.isDueOn =====');
run('daily 模式任意日期都应做', () => {
  const t = mkTask('d', 'daily', 1);
  ok(U.isDueOn(t, new Date(2024, 0, 1)), '周一应做');
  ok(U.isDueOn(t, new Date(2024, 0, 2)), '周二应做');
  ok(U.isDueOn(t, new Date(2024, 0, 7)), '周日应做');
});
run('weekly 模式按 weekdays 判断是否应做', () => {
  const t = mkTask('w', 'weekly', 1, [1, 3, 5]); // 周一三五
  ok(U.isDueOn(t, new Date(2024, 0, 1)), '周一(1)应做');
  ok(!U.isDueOn(t, new Date(2024, 0, 2)), '周二(2)不应做');
  ok(U.isDueOn(t, new Date(2024, 0, 3)), '周三(3)应做');
  ok(!U.isDueOn(t, new Date(2024, 0, 4)), '周四(4)不应做');
  ok(U.isDueOn(t, new Date(2024, 0, 5)), '周五(5)应做');
  ok(!U.isDueOn(t, new Date(2024, 0, 7)), '周日(0)不应做');
});
run('weekly 未配置 weekdays 时永不做', () => {
  const t = mkTask('w2', 'weekly', 1, undefined);
  ok(!U.isDueOn(t, new Date(2024, 0, 1)));
});

console.log('\n===== schedule.requiredTimesOn =====');
run('daily 某天计划次数=perTimes', () => {
  eq(U.requiredTimesOn(mkTask('d', 'daily', 3), new Date(2024, 0, 1)), 3);
});
run('weekly 当天应做时计划次数=perTimes，否则 0', () => {
  const t = mkTask('w', 'weekly', 2, [1, 3, 5]);
  eq(U.requiredTimesOn(t, new Date(2024, 0, 1)), 2); // 周一
  eq(U.requiredTimesOn(t, new Date(2024, 0, 2)), 0); // 周二
});
run('perTimes 缺失时按 0 处理', () => {
  eq(U.requiredTimesOn(mkTask('d', 'daily', 0), new Date(2024, 0, 1)), 0);
});

console.log('\n===== schedule.getRemaining =====');
run('daily 任务：计划 3 次，今日已打 1 次，剩 2', () => {
  const t = mkTask('d', 'daily', 3);
  const today = d(2024, 3, 10);
  const checkins = [mkCheckin('d', d(2024, 3, 10, 8))];
  eq(U.getRemaining(t, checkins, new Date(today)), 2);
});
run('daily 任务：已打满则剩余 0', () => {
  const t = mkTask('d', 'daily', 3);
  const checkins = [
    mkCheckin('d', d(2024, 3, 10, 8)),
    mkCheckin('d', d(2024, 3, 10, 9)),
    mkCheckin('d', d(2024, 3, 10, 10)),
  ];
  eq(U.getRemaining(t, checkins, new Date(d(2024, 3, 10))), 0);
});
run('跨任务打卡不计入（仅按 taskId 计）', () => {
  const t = mkTask('d', 'daily', 3);
  const checkins = [mkCheckin('OTHER', d(2024, 3, 10, 8))];
  eq(U.getRemaining(t, checkins, new Date(d(2024, 3, 10))), 3);
});
run('非应做日剩余为 0', () => {
  const t = mkTask('w', 'weekly', 2, [1, 3, 5]);
  const checkins = []; // 周二本就不该做
  eq(U.getRemaining(t, checkins, new Date(2024, 0, 2)), 0);
});

console.log('\n===== schedule.isSameDay / scheduleText =====');
run('isSameDay 同日为真、跨日为假', () => {
  ok(U.isSameDay(new Date(2024, 2, 15, 8), new Date(2024, 2, 15, 23)));
  ok(!U.isSameDay(new Date(2024, 2, 15), new Date(2024, 2, 16)));
});
run('scheduleText 渲染', () => {
  eq(U.scheduleText(mkTask('d', 'daily', 2).schedule), '每天 2 次');
  eq(U.scheduleText(mkTask('w', 'weekly', 1, [1, 3, 5]).schedule), '每周 一三五 1 次');
  // perTimes 缺失时渲染兜底为 1
  eq(U.scheduleText(mkTask('d', 'daily', 0).schedule), '每天 1 次');
});

// ===================================================================
// 3) stats.ts
// ===================================================================
console.log('\n===== stats.date helpers =====');
run('toDateStr / fromDateStr 互转', () => {
  eq(U.toDateStr(new Date(2024, 2, 15, 10, 30)), '2024-03-15');
  const back = U.fromDateStr('2024-03-15');
  eq([back.getFullYear(), back.getMonth(), back.getDate()], [2024, 2, 15]);
});
run('startOfWeek 以周一为起点', () => {
  const fri = new Date(2024, 2, 15); // 周五
  const mon = U.startOfWeek(fri);
  eq(mon.getDay(), 1, '应回到周一');
  eq([mon.getFullYear(), mon.getMonth(), mon.getDate()], [2024, 2, 11]);
});
run('startOfMonth 回到 1 号', () => {
  const x = U.startOfMonth(new Date(2024, 2, 15));
  eq([x.getFullYear(), x.getMonth(), x.getDate()], [2024, 2, 1]);
});

console.log('\n===== stats.getCurrentStreak（连续打卡天数）=====');
run('无打卡记录 -> 0', () => {
  eq(U.getCurrentStreak([]), 0);
});
run('仅今天 1 次 -> 1', () => {
  eq(U.getCurrentStreak([mkCheckin('t', tsDaysAgo(0))]), 1);
});
run('今天/昨天/前天连续 -> 3', () => {
  eq(
    U.getCurrentStreak([
      mkCheckin('t', tsDaysAgo(0)),
      mkCheckin('t', tsDaysAgo(1)),
      mkCheckin('t', tsDaysAgo(2)),
    ]),
    3,
  );
});
run('今天+昨天连续，但前天断签 -> 2（断一天清零）', () => {
  eq(
    U.getCurrentStreak([
      mkCheckin('t', tsDaysAgo(0)),
      mkCheckin('t', tsDaysAgo(1)),
      mkCheckin('t', tsDaysAgo(3)), // 前天(2天前)缺失，3天前有
    ]),
    2,
  );
});
run('今天未打卡但昨天+前天连续 -> 2（从昨天起算，避免误判断签）', () => {
  eq(
    U.getCurrentStreak([
      mkCheckin('t', tsDaysAgo(1)),
      mkCheckin('t', tsDaysAgo(2)),
    ]),
    2,
  );
});
run('今天打卡、昨天断签 -> 1（断一天清零）', () => {
  eq(
    U.getCurrentStreak([
      mkCheckin('t', tsDaysAgo(0)),
      mkCheckin('t', tsDaysAgo(2)),
    ]),
    1,
  );
});

console.log('\n===== stats.getCompletionRate（完成率）=====');
run('daily 2 天应做 2 次，实际 1 次 -> 50%', () => {
  const task = mkTask('d', 'daily', 1);
  const checkins = [mkCheckin('d', d(2024, 0, 1, 9))];
  const rate = U.getCompletionRate(
    checkins,
    [task],
    new Date(2024, 0, 1),
    new Date(2024, 0, 2),
  );
  eq(rate, 50);
});
run('daily 3 天全勤 -> 100%', () => {
  const task = mkTask('d', 'daily', 1);
  const checkins = [
    mkCheckin('d', d(2024, 0, 1, 9)),
    mkCheckin('d', d(2024, 0, 2, 9)),
    mkCheckin('d', d(2024, 0, 3, 9)),
  ];
  const rate = U.getCompletionRate(
    checkins,
    [task],
    new Date(2024, 0, 1),
    new Date(2024, 0, 3),
  );
  eq(rate, 100);
});
run('weekly 周一三五，应做 3 次全完成 -> 100%', () => {
  const task = mkTask('w', 'weekly', 1, [1, 3, 5]);
  const checkins = [
    mkCheckin('w', d(2024, 0, 1, 9)), // 周一
    mkCheckin('w', d(2024, 0, 3, 9)), // 周三
    mkCheckin('w', d(2024, 0, 5, 9)), // 周五
  ];
  const rate = U.getCompletionRate(
    checkins,
    [task],
    new Date(2024, 0, 1), // 周一
    new Date(2024, 0, 7), // 周日
  );
  eq(rate, 100);
});
run('weekly 应做 3 次只完成 2 次 -> 67%（四舍五入）', () => {
  const task = mkTask('w', 'weekly', 1, [1, 3, 5]);
  const checkins = [
    mkCheckin('w', d(2024, 0, 1, 9)),
    mkCheckin('w', d(2024, 0, 3, 9)),
  ];
  const rate = U.getCompletionRate(
    checkins,
    [task],
    new Date(2024, 0, 1),
    new Date(2024, 0, 7),
  );
  eq(rate, 67);
});
run('无任务（应做 0）-> 0，不抛除零错误', () => {
  eq(U.getCompletionRate([], [], new Date(2024, 0, 1), new Date(2024, 0, 3)), 0);
});
run('超额打卡被封顶到 100%', () => {
  const task = mkTask('d', 'daily', 1);
  const checkins = [
    mkCheckin('d', d(2024, 0, 1, 8)),
    mkCheckin('d', d(2024, 0, 1, 20)), // 同一天打两次
    mkCheckin('d', d(2024, 0, 2, 9)),
  ];
  const rate = U.getCompletionRate(
    checkins,
    [task],
    new Date(2024, 0, 1),
    new Date(2024, 0, 2), // 应做 2 次，实际 3 次
  );
  eq(rate, 100);
});

console.log('\n===== stats.getTotalCheckins / getHeatmap =====');
run('getTotalCheckins 返回记录数', () => {
  eq(U.getTotalCheckins([mkCheckin('t', tsDaysAgo(0)), mkCheckin('t', tsDaysAgo(1))]), 2);
});
run('getHeatmap 长度为 weeks*7 且当日计数正确', () => {
  const checkins = [mkCheckin('t', tsDaysAgo(0)), mkCheckin('t', tsDaysAgo(0))];
  const cells = U.getHeatmap(checkins, 16);
  eq(cells.length, 16 * 7);
  const todayStr = U.toDateStr(new Date(tsDaysAgo(0)));
  const todayCell = cells.find((c) => c.date === todayStr);
  ok(todayCell && todayCell.count === 2, '今天应有 2 次打卡');
  const total = cells.reduce((s, c) => s + c.count, 0);
  eq(total, 2);
});

// ===================================================================
// 汇总
// ===================================================================
const total = pass + fail;
console.log(`\n===== 汇总 =====`);
console.log(`总用例: ${total}  通过: ${pass}  失败: ${fail}`);
console.log(`通过率: ${total ? Math.round((pass / total) * 100) : 0}%`);
if (failures.length) {
  console.log('失败明细:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
} else {
  console.log('ALL PASS');
}
