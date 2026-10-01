// QA（严过关）独立验证脚本 —— 「每年」视图按实际打卡次数随机铺爪印。
//
// 自带 CDP 驱动（不调用工程师的 shot.mjs），在自己的页面上下文里：
//   1) 注入示例数据（复用项目的 scripts/dev/seed.js 作为数据源）；
//   2) 切「记录」→「每年」，数 DOM 里 [data-paw] 的实际数量，逐月与
//      **IndexedDB 里真实存在的打卡数据**（而非我的假设）核对；
//   3) 溢出检查（getBoundingClientRect 父子比较）；
//   4) 确定性：两次加载比较位置/旋转签名 + 整页截图 MD5；
//   5) 每周 / 每月 视图截图存证。
//
// 用法：node scripts/dev/qa-year.mjs [url]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9345;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const previewDir = path.resolve(root, '..', '.preview');
fs.mkdirSync(previewDir, { recursive: true });

const URL_ = process.argv[2] || 'http://127.0.0.1:5180/';
const seedSrc = fs.readFileSync(path.join(root, 'scripts/dev/seed.js'), 'utf8');

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

const profile = path.join(previewDir, 'qa-year-profile');
fs.mkdirSync(profile, { recursive: true });

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForDevtools() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Edge devtools 未就绪');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', (e) => rej(new Error(String(e?.message || e))));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ws, send, ready };
}

/* ---- 页面内分析函数（返回可结构化克隆的对象）---- */
const ANALYZE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickExact = (txt) => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === txt);
    if (b) b.click();
    return !!b;
  };
  const tabOk = clickExact('记录');
  await sleep(400);
  const yearOk = clickExact('每年');
  await sleep(500);

  const cells = [...document.querySelectorAll('div[title]')].filter((d) => /^\\d+月：/.test(d.getAttribute('title') || ''));
  const perCell = cells.map((c) => ({
    title: c.getAttribute('title'),
    paws: c.querySelectorAll('[data-paw]').length,
  }));
  const pawEls = [...document.querySelectorAll('[data-paw]')];
  const totalPaws = pawEls.length;

  let cands = [...document.querySelectorAll('p,div,span')].filter((e) => /共\\s*\\d+\\s*个爪印/.test(e.textContent || ''));
  cands = cands.filter((e) => e.querySelectorAll('p,div,span').length === 0 || /^共/.test((e.textContent||'').trim()));
  cands.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  const footerText = cands[0] ? (cands[0].textContent || '').replace(/\\s+/g, ' ').trim() : null;
  const fm = footerText ? footerText.match(/共\\s*(\\d+)\\s*个爪印/) : null;
  const footerNum = fm ? Number(fm[1]) : null;

  const overflow = [];
  let zeroSize = 0;
  for (const el of pawEls) {
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) zeroSize++;
    const cell = el.closest('div[title]');
    if (!cell) continue;
    const cr = cell.getBoundingClientRect();
    const d = { left: r.left - cr.left, right: r.right - cr.right, top: r.top - cr.top, bottom: r.bottom - cr.bottom, cell: cell.getAttribute('title') };
    if (d.left < -1 || d.right > 1 || d.top < -1 || d.bottom > 1) overflow.push(d);
  }
  const sig = pawEls.map((el) => (el.getAttribute('style') || '')).join('|');

  const headerEl = [...document.querySelectorAll('div,span')].find((e) => /^\\d{4}年$/.test((e.textContent || '').trim()) && e.children.length === 0);
  const shownYear = headerEl ? Number((headerEl.textContent || '').trim().slice(0, 4)) : new Date().getFullYear();

  const counts = await new Promise((res, rej) => {
    const req = indexedDB.open('fitness_pwa', 1);
    req.onsuccess = () => {
      const db = req.result;
      const g = db.transaction('checkins', 'readonly').objectStore('checkins').getAll();
      g.onsuccess = () => res(g.result);
      g.onerror = () => rej(g.error);
    };
    req.onerror = () => rej(req.error);
  });
  const monthly = new Array(12).fill(0);
  for (const c of counts) {
    const d = new Date(c.ts);
    if (d.getFullYear() === shownYear) monthly[d.getMonth()]++;
  }

  // 每周/每月 是否可正常渲染（切过去数元素）
  const afterYearTotal = totalPaws;
  clickExact('每周');
  await sleep(400);
  const weekPaws = document.querySelectorAll('[data-paw]').length;
  const weekSvgPaths = document.querySelectorAll('svg path').length;
  clickExact('每月');
  await sleep(400);
  const monthPaws = document.querySelectorAll('[data-paw]').length;
  const monthSvgPaths = document.querySelectorAll('svg path').length;
  // 回到每年，供截图与确定性签名
  clickExact('每年');
  await sleep(400);
  const sigAfter = [...document.querySelectorAll('[data-paw]')].map((el) => (el.getAttribute('style') || '')).join('|');

  return {
    tabOk, yearOk, shownYear, perCell, totalPaws, footerNum, footerText,
    overflow, zeroSize, sig, sigAfter, monthly, checkinCount: counts.length,
    weekPaws, weekSvgPaths, monthPaws, monthSvgPaths, afterYearTotal,
  };
})()`;

let send;
try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const conn = connect(target.webSocketDebuggerUrl);
  await conn.ready;
  send = conn.send;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 1600, deviceScaleFactor: 2, mobile: true });

  console.log(`导航 → ${URL_}`);
  await send('Page.navigate', { url: URL_ });
  await sleep(3500);

  // 注入示例数据
  const seedRes = await send('Runtime.evaluate', { expression: seedSrc, awaitPromise: true, returnByValue: true });
  if (seedRes.exceptionDetails) throw new Error('注入数据失败: ' + JSON.stringify(seedRes.exceptionDetails));
  console.log('seed →', JSON.stringify(seedRes.result?.value ?? null));

  async function loadAndAnalyze(label) {
    await send('Page.reload');
    await sleep(3500);
    const r = await send('Runtime.evaluate', { expression: ANALYZE, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`分析(${label})失败: ` + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }

  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const buf = Buffer.from(s.data, 'base64');
    fs.writeFileSync(path.join(previewDir, name), buf);
    return crypto.createHash('md5').update(buf).digest('hex');
  };

  // ---- 第一次分析 ----
  const a1 = await loadAndAnalyze('run1');
  const yearMd51 = await shot('qa-year-run1.png');
  // 每周 / 每月 截图（分析结束时已停在每年；重新切一次抓图）
  const evalClick = async (txt) => {
    await send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='${txt}');if(b)b.click();return !!b;})()`, returnByValue: true });
    await sleep(400);
  };
  await evalClick('每周');
  await shot('qa-week.png');
  await evalClick('每月');
  await shot('qa-month.png');
  await evalClick('每年');

  // ---- 第二次分析（确定性）----
  const a2 = await loadAndAnalyze('run2');
  const yearMd52 = await shot('qa-year-run2.png');

  console.log('\n===== 1) 「每年」逐月爪印数量 vs IndexedDB 实际打卡次数 =====');
  console.log(`视图年份=${a1.shownYear}  IndexedDB 打卡总数=${a1.checkinCount}  DOM [data-paw] 总数=${a1.totalPaws}  底部"共 N 个爪印"=${a1.footerNum}`);
  console.log('月份 | DOM爪印 | DB实际 | 差异');
  let monthMismatch = 0;
  for (let m = 0; m < 12; m++) {
    const dom = a1.perCell[m] ? a1.perCell[m].paws : 0;
    const db = a1.monthly[m];
    const ok = dom === db;
    if (!ok) monthMismatch++;
    console.log(`  ${String(m + 1).padStart(2)}月 | ${String(dom).padStart(5)}  | ${String(db).padStart(4)}  | ${ok ? '=' : '❌ ' + (dom - db)}   ${a1.perCell[m] ? a1.perCell[m].title : ''}`);
  }
  check('每年视图渲染了 12 个月格', a1.perCell.length === 12, `cells=${a1.perCell.length}`);
  check('每格爪印数 == 该月实际打卡次数（逐月全等）', monthMismatch === 0, `mismatch months=${monthMismatch}`);
  const dbSum = a1.monthly.reduce((s, v) => s + v, 0);
  check('DOM 爪印总数 == DB 年打卡总数', a1.totalPaws === dbSum, `DOM=${a1.totalPaws} DB=${dbSum}`);
  check('DOM 爪印总数 == 底部"共 N 个爪印"', a1.totalPaws === a1.footerNum, `DOM=${a1.totalPaws} footer=${a1.footerNum}`);
  check('0 次月份不渲染任何爪印', a1.monthly.every((v, m) => (v > 0) === ((a1.perCell[m]?.paws ?? 0) > 0)), '0次月应为空');

  console.log('\n===== 2) 不溢出检查（子爪印 rect vs 父格 rect，容差 1px）=====');
  console.log(`溢出爪印数=${a1.overflow.length}  尺寸为 0/不可见的爪印数=${a1.zeroSize}`);
  if (a1.overflow.length) console.log('  示例溢出:', JSON.stringify(a1.overflow.slice(0, 5)));
  check('无爪印溢出父格', a1.overflow.length === 0, `overflow=${a1.overflow.length}`);
  check('无 0 尺寸/不可见爪印', a1.zeroSize === 0, `zeroSize=${a1.zeroSize}`);

  console.log('\n===== 3) 确定性（两次加载）=====');
  console.log(`签名一致=${a1.sig === a2.sig}   每年截图 MD5 一致=${yearMd51 === yearMd52}`);
  console.log(`  run1 MD5=${yearMd51}  run2 MD5=${yearMd52}`);
  check('位置/旋转签名两次完全一致', a1.sig === a2.sig, a1.sig === a2.sig ? 'identical' : 'DIFFERENT');
  check('整页截图字节一致（MD5 相同）', yearMd51 === yearMd52, `${yearMd51} vs ${yearMd52}`);
  console.log(`  同页内 每年→每周→每月→每年 往返后签名一致=${a1.sig === a1.sigAfter}`);
  check('同页 re-render（切走再切回）位置不跳位', a1.sig === a1.sigAfter, a1.sig === a1.sigAfter ? 'stable' : 'JUMPED');

  console.log('\n===== 4) 每周 / 每月 未回归 =====');
  console.log(`每周: [data-paw]=${a1.weekPaws}  svg path=${a1.weekSvgPaths}   每月: [data-paw]=${a1.monthPaws}  svg path=${a1.monthSvgPaths}`);
  check('每周视图正常渲染（有 svg path）', a1.weekSvgPaths > 0, `paths=${a1.weekSvgPaths}`);
  check('每月视图正常渲染（有 svg path）', a1.monthSvgPaths > 0, `paths=${a1.monthSvgPaths}`);
  check('每周/每月视图未引入 data-paw（仅年视图使用）', a1.weekPaws === 0 && a1.monthPaws === 0, `week=${a1.weekPaws} month=${a1.monthPaws}`);

  console.log(`\n截图 → ${previewDir}（qa-year-run1.png / qa-year-run2.png / qa-week.png / qa-month.png）`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== QA 年视图汇总 =====`);
  console.log(`断言总数=${results.length}  通过=${results.length - failed.length}  失败=${failed.length}`);
  if (failed.length) {
    console.log('失败项:');
    for (const f of failed) console.log(`  - ${f.name}  ${f.detail ?? ''}`);
    process.exitCode = 1;
  } else {
    console.log('ALL PASS');
  }
} catch (e) {
  console.error('ERROR', e);
  process.exitCode = 2;
} finally {
  child.kill();
}
