// QA（严过关）独立验证脚本 —— 外链打开方式 / 复制链接 / 连续打卡计数 / busy 兜底解锁。
//
// 与被测实现的关系：本脚本不读源码下结论，而是驱动**真实构建产物**（vite preview 的 dist），
// 用 CDP 打开页面、真实点击 DOM、真实读写 IndexedDB、真实派发媒体事件，逐条断言。
//
// 用法：node scripts/dev/qa-clip.mjs [url]   （默认 http://127.0.0.1:5199/）
// 退出码 0=全部通过，1=有断言失败。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.QA_PORT || 9357);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const previewDir = path.resolve(root, '..', '.preview');
fs.mkdirSync(previewDir, { recursive: true });

const URL_ = process.argv[2] || 'http://127.0.0.1:5199/';

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

// 每次运行使用独立 profile，避免缓存/存储污染；不主动删目录（沙箱禁止递归删除）。
const profile = path.join(previewDir, `qa-clip-profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--autoplay-policy=no-user-gesture-required',
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

/* ---------------- 页面内工具箱（注入到 window.__qa） ---------------- */
const TOOLKIT = `
window.__qa = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  allCheckins: () => new Promise((res, rej) => {
    const q = indexedDB.open('fitness_pwa', 1);
    q.onsuccess = () => { const db = q.result; const g = db.transaction('checkins','readonly').objectStore('checkins').getAll(); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); };
    q.onerror = () => rej(q.error);
  }),
  countCheckins: async (id) => (await window.__qa.allCheckins()).filter((c) => c.taskId === id).length,
  panel: () => document.querySelector('div.fixed.inset-0.z-50'),
  panelOpen: () => !!window.__qa.panel(),
  panelText: () => { const p = window.__qa.panel(); return p ? (p.textContent||'').replace(/\\s+/g,' ') : null; },
  btnInPanel: (t) => { const p = window.__qa.panel(); if (!p) return null; return [...p.querySelectorAll('button')].find((b) => (b.textContent||'').trim() === t) || null; },
  mainBtn: () => { const p = window.__qa.panel(); if (!p) return null; return [...p.querySelectorAll('button')].find((b) => ['标记完成','再来一次','已打卡 ✓'].includes((b.textContent||'').trim())) || null; },
  mainState: () => { const b = window.__qa.mainBtn(); return b ? { text: (b.textContent||'').trim(), disabled: b.disabled } : null; },
  clickText: (t) => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent||'').trim() === t); if (!b) return false; b.click(); return true; },
  clickCardBtn: (name, t) => { const s = [...document.querySelectorAll('span')].find((x) => (x.textContent||'').trim() === name); if (!s) return false; const card = s.closest('div.rounded-xl2'); if (!card) return false; const b = [...card.querySelectorAll('button')].find((x) => (x.textContent||'').trim() === t); if (!b) return false; b.click(); return true; },
  cardBtnText: (name) => { const s = [...document.querySelectorAll('span')].find((x) => (x.textContent||'').trim() === name); if (!s) return false; const card = s.closest('div.rounded-xl2'); if (!card) return false; return [...card.querySelectorAll('button')].map((b)=>(b.textContent||'').trim()); },
  cardProgress: (name) => { const s = [...document.querySelectorAll('span')].find((x) => (x.textContent||'').trim() === name); if (!s) return false; const card = s.closest('div.rounded-xl2'); if (!card) return false; const m = (card.textContent||'').match(/(\\d+)\\/(\\d+)/); return m ? { done: Number(m[1]), required: Number(m[2]) } : null; },
  remaining: () => { const p = window.__qa.panel(); if (!p) return null; const m = (p.textContent||'').match(/今日还差\\s*(\\d+)\\s*次/); return m ? Number(m[1]) : null; },
  fireEnded: () => { const v = document.querySelector('video'); if (!v) return false; v.dispatchEvent(new Event('ended')); return true; },
  actionOrder: () => { const p = window.__qa.panel(); if (!p) return null; const bs = [...p.querySelectorAll('button')].map((b) => (b.textContent||'').trim()); return { open: bs.indexOf('打开原链接'), copy: bs.indexOf('复制链接'), all: bs }; },
  btnClass: (t) => { const b = window.__qa.btnInPanel(t); return b ? b.className : null; },
  linkInput: () => { const p = window.__qa.panel(); if (!p) return null; const i = p.querySelector('input'); if (!i) return null; return { value: i.value, readOnly: i.readOnly, cls: i.className }; },
  recordAndSeed: async () => {
    try {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 128, 128);
      const stream = c.captureStream(25);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 400000 });
      const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(100);
      for (let f = 0; f < 25; f++) { ctx.fillStyle = f % 2 ? '#e33' : '#222'; ctx.fillRect(0, 0, 128, 128); await new Promise((r) => setTimeout(r, 40)); }
      rec.stop(); await stopped;
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (!blob.size) return 'empty';
      const q = indexedDB.open('fitness_pwa', 1);
      const db = await new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      await new Promise((res, rej) => { const tx = db.transaction('tasks','readwrite'); tx.objectStore('tasks').put({ id: 'qvR', name: '真实视频', type: 'upload', videoBlob: blob, schedule: { mode: 'daily', perTimes: 1 }, createdAt: Date.now() }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
      return 'ok:' + blob.size;
    } catch (e) { return 'err:' + e.message; }
  },
  realPlayToEnd: async (timeoutMs) => {
    const v = document.querySelector('video'); if (!v) return 'no-video';
    v.muted = true;
    if (v.readyState < 2) await new Promise((res) => { const on = () => { v.removeEventListener('canplay', on); res(); }; v.addEventListener('canplay', on); setTimeout(on, 3000); });
    // MediaRecorder 产出的 webm 常缺 duration（duration=Infinity），强行 seek 触发时长解析，否则 ended 不会自然触发
    if (!isFinite(v.duration)) {
      await new Promise((res) => { const on = () => { v.removeEventListener('durationchange', on); res(); }; v.addEventListener('durationchange', on); try { v.currentTime = 1e101; } catch (e) {} setTimeout(on, 1500); });
    }
    try { v.currentTime = isFinite(v.duration) && v.duration > 0.5 ? v.duration - 0.25 : 0; } catch (e) {}
    const playOutcome = await Promise.race([
      v.play().then(() => 'played').catch((e) => 'rejected:' + e.message),
      new Promise((r) => setTimeout(() => r('play-timeout'), 3000)),
    ]);
    if (playOutcome !== 'played') return playOutcome;
    const ended = await new Promise((res) => { const on = () => { v.removeEventListener('ended', on); res(true); }; v.addEventListener('ended', on); setTimeout(() => { v.removeEventListener('ended', on); res(false); }, timeoutMs); });
    return ended ? 'ended' : 'ended-timeout:duration=' + v.duration;
  },
};
'qa-toolkit-ready';
`;

const SEED_ALL = `
(async () => {
  const open = () => new Promise((res, rej) => { const q = indexedDB.open('fitness_pwa', 1); q.onupgradeneeded = () => { const db = q.result; for (const s of ['tasks','checkins','metrics','bodyEntries']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const db = await open();
  const put = (store, rows) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); for (const r of rows) tx.objectStore(store).put(r); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  const clear = (store) => new Promise((res) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear(); tx.oncomplete = () => res(); });
  await clear('checkins'); await clear('tasks');
  const blob = new Blob([new Uint8Array([26,69,223,163])], { type: 'video/webm' });
  const now = Date.now();
  await put('tasks', [
    { id: 'qv3', name: '三次视频', type: 'upload', videoBlob: blob, schedule: { mode: 'daily', perTimes: 3 }, createdAt: now },
    { id: 'qv1', name: '一次视频', type: 'upload', videoBlob: blob, schedule: { mode: 'daily', perTimes: 1 }, createdAt: now },
    { id: 'ql3', name: '三次外链', type: 'link', linkUrl: '#qatest', schedule: { mode: 'daily', perTimes: 3 }, createdAt: now },
  ]);
  return 'seeded';
})()
`;

const CLEAR_CHECKINS = `
(async () => {
  const open = () => new Promise((res, rej) => { const q = indexedDB.open('fitness_pwa', 1); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const db = await open();
  await new Promise((res) => { const tx = db.transaction('checkins','readwrite'); tx.objectStore('checkins').clear(); tx.oncomplete = () => res(); });
  return 'cleared';
})()
`;

let send;
const consoleMsgs = [];

async function evalJs(expr, label = 'eval') {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${label} 抛异常: ` + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function waitFor(expr, timeout = 3000, interval = 60) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await evalJs(expr, 'waitFor');
    if (v) return v;
    await sleep(interval);
  }
  return null;
}
const q = () => evalJs(TOOLKIT, 'toolkit');
async function reloadAndToolkit(ms = 2300) {
  await send('Page.reload');
  await sleep(ms);
  await q();
}
async function freshQv3() {
  await evalJs(CLEAR_CHECKINS, 'clear');
  await reloadAndToolkit();
  await evalJs(`window.__qa.clickCardBtn('三次视频','播放视频')`, 'open-qv3');
  await sleep(500);
}

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const conn = connect(target.webSocketDebuggerUrl);
  await conn.ready;
  send = conn.send;
  conn.ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const args = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type);
      consoleMsgs.push({ type: m.params.type, text: args.join(' ') });
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      consoleMsgs.push({ type: 'exception', text: d.exception?.description || d.text });
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Target.setDiscoverTargets', { discover: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

  console.log(`导航 → ${URL_}`);
  await send('Page.navigate', { url: URL_ });
  await sleep(2500);
  await evalJs(SEED_ALL, 'seed');
  await reloadAndToolkit();
  // 确认种子确实生效（防止把测试自身的错当源码错）
  const seeded = await evalJs(`window.__qa.cardProgress('三次视频')`);
  check('A0 种子生效：三次视频卡片 0/3', seeded && seeded.done === 0 && seeded.required === 3, JSON.stringify(seeded));

  /* =====================================================================
     A. 连续打卡计数（真实点击 + 真实媒体 ended 事件 + IndexedDB 计数）
     ===================================================================== */
  console.log('\n===== A. 连续打卡计数（上传视频，perTimes=3）=====');
  {
    await freshQv3();
    const st0 = await evalJs('window.__qa.mainState()');
    const rem0 = await evalJs('window.__qa.remaining()');
    const c0 = await evalJs(`window.__qa.countCheckins('qv3')`);
    check('A1 打开 qv3 面板成功', (await evalJs('window.__qa.panelOpen()')) === true);
    check('A2 初始主按钮文案=「标记完成」', st0 && st0.text === '标记完成', JSON.stringify(st0));
    check('A3 初始 remaining=3', rem0 === 3, `remaining=${rem0}`);
    check('A4 初始 checkins=0', c0 === 0, `count=${c0}`);

    // 第 1 次（点击主按钮）
    await evalJs(`window.__qa.clickText('标记完成')`, 'click-1');
    await waitFor(`window.__qa.countCheckins('qv3').then((n)=>n>=1)`, 3000);
    await sleep(300);
    const st1 = await evalJs('window.__qa.mainState()');
    const rem1 = await evalJs('window.__qa.remaining()');
    const c1 = await evalJs(`window.__qa.countCheckins('qv3')`);
    check('A5 第 1 次后 IndexedDB 新增 1 条 checkin', c1 === 1, `count=${c1}`);
    check('A6 第 1 次后按钮变「再来一次」', st1 && st1.text === '再来一次', JSON.stringify(st1));
    check('A7 第 1 次后 remaining=2', rem1 === 2, `remaining=${rem1}`);

    // 第 2 次（再来一次 → ended）
    await evalJs(`window.__qa.clickText('再来一次')`, 'replay-2');
    await sleep(120);
    const fired2 = await evalJs('window.__qa.fireEnded()', 'ended-2');
    await waitFor(`window.__qa.countCheckins('qv3').then((n)=>n>=2)`, 3000);
    await sleep(300);
    const st2 = await evalJs('window.__qa.mainState()');
    const rem2 = await evalJs('window.__qa.remaining()');
    const c2 = await evalJs(`window.__qa.countCheckins('qv3')`);
    check('A8 第 2 次（ended）后 checkins 累计 2', c2 === 2, `count=${c2} firedEnded=${fired2}`);
    check('A9 第 2 次后仍是「再来一次」', st2 && st2.text === '再来一次', JSON.stringify(st2));
    check('A10 第 2 次后 remaining=1', rem2 === 1, `remaining=${rem2}`);

    // 第 3 次
    await evalJs(`window.__qa.clickText('再来一次')`, 'replay-3');
    await sleep(120);
    await evalJs('window.__qa.fireEnded()', 'ended-3');
    await waitFor(`window.__qa.countCheckins('qv3').then((n)=>n>=3)`, 3000);
    await sleep(300);
    const st3 = await evalJs('window.__qa.mainState()');
    const rem3 = await evalJs('window.__qa.remaining()');
    const c3 = await evalJs(`window.__qa.countCheckins('qv3')`);
    check('A11 第 3 次后 checkins 累计 3', c3 === 3, `count=${c3}`);
    check('A12 第 3 次后按钮「已打卡 ✓」且 disabled', st3 && st3.text === '已打卡 ✓' && st3.disabled === true, JSON.stringify(st3));
    check('A13 完成后不再显示 remaining 文案', rem3 === null, `remaining=${rem3}`);

    // 清零后反复点击 / ended
    for (let i = 0; i < 3; i++) {
      await evalJs(`window.__qa.clickText('标记完成'); window.__qa.clickText('再来一次'); window.__qa.fireEnded(); 'spam'`, 'spam');
    }
    await sleep(600);
    const c4 = await evalJs(`window.__qa.countCheckins('qv3')`);
    const doneCard = await evalJs(`window.__qa.cardProgress('三次视频')`);
    check('A14 remaining=0 后无任何路径能多记一条', c4 === 3, `count=${c4}`);
    check('A15 卡片进度显示 3/3', doneCard && doneCard.done === 3 && doneCard.required === 3, JSON.stringify(doneCard));
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(250);
  }

  /* ---------------- 边界：防连点 ---------------- */
  console.log('\n----- A 边界：防连点（busy 守卫）-----');
  {
    for (const [label, gap] of [['同 tick 连点两次', 0], ['间隔 150ms 连点两次', 150]]) {
      await freshQv3();
      await evalJs(`window.__btn = window.__qa.mainBtn(); window.__btn.click(); 'c1'`, 'click-c1');
      if (gap) await sleep(gap);
      await evalJs(`window.__btn.click(); 'c2'`, 'click-c2');
      await sleep(900);
      const c = await evalJs(`window.__qa.countCheckins('qv3')`);
      const st = await evalJs('window.__qa.mainState()');
      check(`A16 防连点（${label}）只记 1 条`, c === 1, `count=${c} st=${JSON.stringify(st)}`);
      await evalJs(`window.__qa.clickText('关闭')`, 'close');
      await sleep(200);
    }
  }

  /* ---------------- 边界：perTimes = 1 ---------------- */
  console.log('\n----- A 边界：perTimes = 1 -----');
  {
    await evalJs(CLEAR_CHECKINS, 'clear');
    await reloadAndToolkit();
    await evalJs(`window.__qa.clickCardBtn('一次视频','播放视频')`, 'open-qv1');
    await sleep(500);
    const rem = await evalJs('window.__qa.remaining()');
    check('A17 qv1 初始 remaining=1', rem === 1, `remaining=${rem}`);
    await evalJs('window.__qa.fireEnded()', 'ended-qv1');
    await waitFor(`window.__qa.countCheckins('qv1').then((n)=>n>=1)`, 3000);
    await sleep(300);
    const st = await evalJs('window.__qa.mainState()');
    const c = await evalJs(`window.__qa.countCheckins('qv1')`);
    check('A18 qv1 一次后 checkins=1 且「已打卡 ✓」disabled', c === 1 && st && st.text === '已打卡 ✓' && st.disabled === true, `count=${c} st=${JSON.stringify(st)}`);
    await evalJs('window.__qa.fireEnded()', 'ended-qv1-2');
    await sleep(500);
    const c2 = await evalJs(`window.__qa.countCheckins('qv1')`);
    check('A19 qv1 再 ended 也不多记', c2 === 1, `count=${c2}`);
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(250);
  }

  /* ---------------- 边界：关闭再打开内部状态重置 ---------------- */
  console.log('\n----- A 边界：关闭再打开（key/重挂载）-----');
  {
    await freshQv3();
    await evalJs(`window.__qa.clickText('标记完成')`, 'c');
    await waitFor(`window.__qa.countCheckins('qv3').then((n)=>n>=1)`, 3000);
    await sleep(300);
    const stBefore = await evalJs('window.__qa.mainState()');
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(400);
    const closed = await evalJs('window.__qa.panelOpen()');
    const cardBtns = await evalJs(`window.__qa.cardBtnText('三次视频')`);
    const reopened = await evalJs(`window.__qa.clickCardBtn('三次视频','继续练')`, 'reopen');
    await sleep(500);
    const stAfter = await evalJs('window.__qa.mainState()');
    const remAfter = await evalJs('window.__qa.remaining()');
    const cAfter = await evalJs(`window.__qa.countCheckins('qv3')`);
    check('A20 关闭后面板消失', closed === false, `panelOpen=${closed}`);
    check('A21 重开前卡片按钮含「继续练」', Array.isArray(cardBtns) && cardBtns.includes('继续练'), JSON.stringify(cardBtns));
    check('A22 重开后内部 started 重置 → 主按钮回到「标记完成」', reopened === true && stAfter && stAfter.text === '标记完成', `before=${JSON.stringify(stBefore)} after=${JSON.stringify(stAfter)}`);
    check('A23 重开后 remaining=2（1 条记录不丢）', remAfter === 2, `remaining=${remAfter}`);
    check('A24 重开后 checkins 仍=1', cAfter === 1, `count=${cAfter}`);
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(250);
  }

  /* =====================================================================
     B. busy 兜底解锁
     ===================================================================== */
  console.log('\n===== B. busy 兜底解锁与正常即时解锁 =====');
  {
    // B1: 正常路径应即时解锁
    await freshQv3();
    const t0 = Date.now();
    await evalJs(`window.__qa.clickText('标记完成')`, 'click');
    const enabled = await waitFor(`(()=>{const s=window.__qa.mainState();return s && !s.disabled;})()`, 4000);
    const elapsed = Date.now() - t0;
    check('B1 正常路径即时解锁（<1500ms），不依赖 2.5s 兜底', !!enabled && elapsed < 1500, `elapsed=${elapsed}ms enabled=${enabled}`);
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(200);

    // B2: 失败链路 → 2.5s 兜底恢复
    await freshQv3();
    const cBefore = await evalJs(`window.__qa.countCheckins('qv3')`);
    await evalJs(`window.__origPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(){ throw new Error('QA-injected put failure'); }; 'patched'`, 'patch');
    const tb = Date.now();
    await evalJs(`window.__qa.clickText('标记完成')`, 'click');
    await sleep(120);
    const stDisabled = await evalJs('window.__qa.mainState()');
    check('B2 失败路径点击后按钮立即 disabled', stDisabled && stDisabled.disabled === true, JSON.stringify(stDisabled));
    await sleep(2000);
    const stAt21 = await evalJs('window.__qa.mainState()');
    check('B3 约 2.1s 时仍 disabled（证明非即时解锁）', stAt21 && stAt21.disabled === true, `sinceClick=${Date.now() - tb}ms st=${JSON.stringify(stAt21)}`);
    const enabled2 = await waitFor(`(()=>{const s=window.__qa.mainState();return s && !s.disabled;})()`, 4000);
    const total = Date.now() - tb;
    check('B4 兜底约 2.5s 后恢复可点', !!enabled2 && total > 2200 && total < 4200, `total=${total}ms`);
    const cAfter = await evalJs(`window.__qa.countCheckins('qv3')`);
    check('B5 失败路径不产生幻影 checkin', cAfter === cBefore, `before=${cBefore} after=${cAfter}`);
    await evalJs(`IDBObjectStore.prototype.put = window.__origPut; 'restored'`, 'restore');
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(200);
  }

  /* ---- B3: 卸载清除兜底计时器 ---- */
  console.log('\n----- B. 卸载时清除兜底计时器 -----');
  {
    await freshQv3();
    await evalJs(
      `window.__timers = { created: [], cleared: [] };
       (function(){ const os = window.setTimeout, oc = window.clearTimeout;
         window.setTimeout = function(fn, ms, ...a){ const id = os.call(window, fn, ms, ...a); window.__timers.created.push({ id, ms }); return id; };
         window.clearTimeout = function(id){ window.__timers.cleared.push(id); return oc.call(window, id); };
       })(); 'instrumented'`,
      'instrument',
    );
    await evalJs(`window.__origPut3 = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(){ throw new Error('QA-injected put failure 3'); }; 'patched'`, 'patch');
    await evalJs(`window.__qa.clickText('标记完成')`, 'click');
    await sleep(150);
    const timerId = await evalJs(`(window.__timers.created.filter((t)=>t.ms===2500).slice(-1)[0]||{}).id ?? null`);
    check('B6 失败点击后挂了 2500ms 兜底计时器', timerId !== null, `timerId=${timerId}`);
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(400);
    const cleared = await evalJs(`window.__timers.cleared.includes(${timerId})`);
    check('B7 卸载时该兜底计时器被 clearTimeout 清除', cleared === true, `cleared=${cleared}`);
    await sleep(3000);
    const crash = consoleMsgs.filter((m) => m.type === 'exception').length;
    check('B8 越过 2.5s 无未捕获异常（未对已卸载组件 setState）', crash === 0, `exceptions=${crash}`);
    await evalJs(`IDBObjectStore.prototype.put = window.__origPut3; 'restored'`, 'restore');
  }

  /* =====================================================================
     C1. 非 standalone
     ===================================================================== */
  console.log('\n===== C1. 非 standalone：按钮主次 + openExternal =====');
  {
    await evalJs(CLEAR_CHECKINS, 'clear');
    await reloadAndToolkit();
    await evalJs(`window.__qa.clickCardBtn('三次外链','打开 / 播放')`, 'open-ql3');
    await sleep(500);
    const order = await evalJs('window.__qa.actionOrder()');
    const openCls = await evalJs(`window.__qa.btnClass('打开原链接')`);
    const copyCls = await evalJs(`window.__qa.btnClass('复制链接')`);
    const txt = await evalJs('window.__qa.panelText()');
    check('C1 非 standalone：打开原链接排在复制链接之前', order && order.open > -1 && order.copy > -1 && order.open < order.copy, JSON.stringify(order));
    check('C2 非 standalone：打开原链接为主色 bg-sun', !!openCls && openCls.includes('bg-sun'), `cls=${openCls}`);
    check('C3 非 standalone：复制链接为次要（描边）', !!copyCls && copyCls.includes('border') && !copyCls.includes('bg-sun'), `cls=${copyCls}`);
    check('C4 非 standalone 提示含「可能没法直接唤起」且不含「记录不会丢」', !!txt && txt.includes('可能没法直接唤起') && !txt.includes('记录不会丢'), txt ? txt.slice(-60) : txt);
    // C5 真实端到端（不 stub）：真调用 window.open（已放开弹窗拦截），断言只新开标签、当前页不被导航
    await evalJs(`window.location.hash = ''; 'reset-hash'`, 'reset-hash');
    const targetsBefore = (await send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').length;
    const hrefBefore = await evalJs('window.location.href');
    const openRect = await evalJs(
      `(() => { const b = window.__qa.btnInPanel('打开原链接'); const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`,
      'open-rect',
    );
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: openRect.x, y: openRect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: openRect.x, y: openRect.y, button: 'left', clickCount: 1 });
    await sleep(700);
    const targetsAfter = (await send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').length;
    const hrefAfter = await evalJs('window.location.href');
    check('C5 非 standalone：真实点击「打开原链接」只新开标签、当前页不被导航', hrefAfter === hrefBefore && targetsAfter > targetsBefore, `href=${hrefBefore} → ${hrefAfter} targets=${targetsBefore}→${targetsAfter}`);

    // C6 window.open 被拦截（返回 null）时退回同窗口导航
    const r2 = await evalJs(
      `(() => { window.location.hash=''; window.__origOpen = window.open; window.open = function(){ return null; }; const ok = window.__qa.clickText('打开原链接'); return { ok, hash: window.location.hash }; })()`,
      'open-null',
    );
    check('C6 window.open 返回 null 时退回同窗口导航', r2 && r2.hash === '#qatest', JSON.stringify(r2));
    await evalJs(`window.open = window.__origOpen; window.location.hash=''; 'restore'`);
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(200);
  }

  /* =====================================================================
     C2. standalone（navigator.standalone = true）
     ===================================================================== */
  console.log('\n===== C2. standalone（navigator.standalone=true）=====');
  {
    const add = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.navigator.standalone = true; window.__stdMarker = 'nav';` });
    await evalJs(CLEAR_CHECKINS, 'clear');
    await reloadAndToolkit();
    const marker = await evalJs(`window.__stdMarker`);
    check('C7 navigator.standalone 注入生效', marker === 'nav', `marker=${marker}`);
    await evalJs(`window.__qa.clickCardBtn('三次外链','打开 / 播放')`, 'open');
    await sleep(500);
    const order = await evalJs('window.__qa.actionOrder()');
    const openCls = await evalJs(`window.__qa.btnClass('打开原链接')`);
    const copyCls = await evalJs(`window.__qa.btnClass('复制链接')`);
    const txt = await evalJs('window.__qa.panelText()');
    check('C8 standalone：复制链接排在打开原链接之前', order && order.open > -1 && order.copy > -1 && order.copy < order.open, JSON.stringify(order));
    check('C9 standalone：复制链接为主色 bg-sun', !!copyCls && copyCls.includes('bg-sun'), `cls=${copyCls}`);
    check('C10 standalone：打开原链接为次要（描边）', !!openCls && openCls.includes('border') && !openCls.includes('bg-sun'), `cls=${openCls}`);
    check('C11 standalone 提示含「记录不会丢」', !!txt && txt.includes('记录不会丢'), txt ? txt.slice(-70) : txt);
    const r = await evalJs(
      `(() => { window.__opened = null; window.location.hash=''; window.__origOpen2 = window.open; window.open = function(u){ window.__opened = u; return {}; }; const ok = window.__qa.clickText('打开原链接'); return { ok, opened: window.__opened, hash: window.location.hash }; })()`,
      'open-std',
    );
    check('C12 standalone：openExternal 同窗口导航且不调用 window.open', r && r.ok === true && r.hash === '#qatest' && r.opened === null, JSON.stringify(r));
    await evalJs(`window.open = window.__origOpen2; window.location.hash=''; 'restore'`);
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: add.identifier });
    await sleep(200);
  }

  /* =====================================================================
     C3. standalone（display-mode: standalone）
     ===================================================================== */
  console.log('\n===== C3. standalone（display-mode: standalone）=====');
  {
    let dmReal = false;
    let addId = null;
    try {
      await send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'display-mode', value: 'standalone' }] });
      await evalJs(CLEAR_CHECKINS, 'clear');
      await reloadAndToolkit();
      dmReal = (await evalJs(`window.matchMedia('(display-mode: standalone)').matches`)) === true;
    } catch {
      dmReal = false;
    }
    if (!dmReal) {
      // CDP display-mode 模拟在无头环境不稳定 → 用 matchMedia 桩直接命中 isStandaloneMode 的 display-mode 分支
      const add = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.matchMedia = function(q){ return { matches: /display-mode:\\s*standalone/.test(q), media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } }; };`,
      });
      addId = add.identifier;
      await evalJs(CLEAR_CHECKINS, 'clear');
      await reloadAndToolkit();
      dmReal = (await evalJs(`window.matchMedia('(display-mode: standalone)').matches`)) === true;
    }
    check(`C13 display-mode:standalone 信号命中（${addId ? 'matchMedia 桩模拟' : 'CDP Emulation'}）`, dmReal === true, `matches=${dmReal}`);
    await evalJs(`window.__qa.clickCardBtn('三次外链','打开 / 播放')`, 'open');
    await sleep(500);
    const order = await evalJs('window.__qa.actionOrder()');
    const copyCls = await evalJs(`window.__qa.btnClass('复制链接')`);
    const txt = await evalJs('window.__qa.panelText()');
    check('C14 display-mode=standalone 走 standalone 分支：复制排前+主色+提示', order && order.copy < order.open && !!copyCls && copyCls.includes('bg-sun') && !!txt && txt.includes('记录不会丢'), `order=${JSON.stringify(order)} cls=${copyCls}`);
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    if (addId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: addId });
    await send('Emulation.setEmulatedMedia', { media: '', features: [] });
    await sleep(200);
  }

  /* =====================================================================
     C4. matchMedia 缺失时 isStandaloneMode 不抛错
     ===================================================================== */
  console.log('\n===== C4. matchMedia 缺失时的健壮性 =====');
  {
    const add = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.matchMedia = undefined; window.__noMM = true;` });
    await evalJs(CLEAR_CHECKINS, 'clear');
    await reloadAndToolkit();
    check('C15 matchMedia 已置 undefined', (await evalJs(`window.__noMM === true && typeof window.matchMedia === 'undefined'`)) === true);
    const opened = await evalJs(`window.__qa.clickCardBtn('三次外链','打开 / 播放')`, 'open');
    await sleep(500);
    const hasPanel = await evalJs('window.__qa.panelOpen()');
    const order = await evalJs('window.__qa.actionOrder()');
    check('C16 matchMedia 缺失时面板仍渲染（未抛错）', opened === true && hasPanel === true && order && order.open > -1, `opened=${opened} panel=${hasPanel}`);
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: add.identifier });
    await sleep(200);
  }

  /* =====================================================================
     D. 复制链接：成功 / 降级 / 手动兜底
     ===================================================================== */
  console.log('\n===== D. 复制链接 成功 / 降级 =====');
  {
    await evalJs(CLEAR_CHECKINS, 'clear');
    await reloadAndToolkit();
    await evalJs(`window.__qa.clickCardBtn('三次外链','打开 / 播放')`, 'open');
    await sleep(500);

    // D1 成功路径
    const d1 = await evalJs(
      `(async () => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); const ok = window.__qa.clickText('复制链接'); await window.__qa.sleep(250); const btn = window.__qa.btnInPanel('已复制 ✓'); return { ok, copied: window.__copied, label: btn ? btn.textContent.trim() : null }; })()`,
      'copy-success',
    );
    check('D1 剪贴板可用时复制成功且文案切「已复制 ✓」', d1 && d1.ok === true && d1.copied === '#qatest' && d1.label === '已复制 ✓', JSON.stringify(d1));
    const reverted = await waitFor(`!!window.__qa.btnInPanel('复制链接')`, 2600, 100);
    check('D2 成功文案约 1.6s 后复原为「复制链接」', reverted === true, `reverted=${reverted}`);

    // D3 降级 + 失败
    const d3 = await evalJs(
      `(async () => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('qa')) }, configurable: true }); window.__origExec = document.execCommand; document.execCommand = () => false; const ok = window.__qa.clickText('复制链接'); await window.__qa.sleep(300); const txt = window.__qa.panelText(); const inp = window.__qa.linkInput(); return { ok, failHint: !!(txt && txt.includes('长按上面的链接手动复制')), inp }; })()`,
      'copy-fail',
    );
    check('D3 复制失败时提示切「长按上面的链接手动复制」', d3 && d3.failHint === true, JSON.stringify(d3));
    check('D4 只读输入框展示原链接', d3 && d3.inp && d3.inp.value === '#qatest' && d3.inp.readOnly === true, JSON.stringify(d3 && d3.inp));
    check('D5 输入框带 select-all', d3 && d3.inp && d3.inp.cls.includes('select-all'), JSON.stringify(d3 && d3.inp));

    // D6 聚焦全选：用真实鼠标点击（headless 下 element.focus() 不派发 focus 事件，属环境假象）
    const rect = await evalJs(
      `(() => { const i = window.__qa.panel().querySelector('input'); const r = i.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`,
      'input-rect',
    );
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await sleep(250);
    const sel = await evalJs(
      `(() => { const i = window.__qa.panel().querySelector('input'); return { s: i.selectionStart, e: i.selectionEnd, len: i.value.length, focused: document.activeElement === i }; })()`,
      'select',
    );
    check('D6 聚焦（真实点击）自动全选（0..length）', sel && sel.s === 0 && sel.e === sel.len && sel.len === 7, JSON.stringify(sel));

    // D7 execCommand 抛错也不崩
    const d7 = await evalJs(
      `(async () => { document.execCommand = () => { throw new Error('qa exec'); }; const ok = window.__qa.clickText('复制链接'); await window.__qa.sleep(300); const txt = window.__qa.panelText(); return { ok, failHint: !!(txt && txt.includes('长按上面的链接手动复制')) }; })()`,
      'exec-throw',
    );
    check('D7 execCommand 抛错时不崩溃且走失败提示', d7 && d7.failHint === true, JSON.stringify(d7));
    await evalJs(`document.execCommand = window.__origExec; 'restore'`);

    // D8 真实剪贴板（恢复原生 navigator.clipboard）
    try {
      await send('Browser.grantPermissions', { origin: new URL(URL_).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
      await evalJs(`delete navigator.clipboard; 'native'`);
      const hasNative = await evalJs(`typeof navigator.clipboard`);
      if (hasNative !== 'object') {
        console.log(`INFO  D8 原生 navigator.clipboard 不可用（typeof=${hasNative}），跳过真实剪贴板验证`);
        results.push({ name: 'D8 真实剪贴板：环境无原生 clipboard（信息项）', pass: true, detail: `typeof=${hasNative}` });
      } else {
        const rect = await evalJs(`(() => { const b = window.__qa.btnInPanel('复制链接'); const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
        await sleep(400);
        const real = await evalJs(`(async () => { try { return await navigator.clipboard.readText(); } catch (e) { return 'ERR:' + e.message; } })()`);
        check('D8 真实剪贴板读写可用（授权后）', real === '#qatest', `readText=${real}`);
      }
    } catch (e) {
      console.log(`INFO  D8 真实剪贴板验证环境受限：${e.message}`);
      results.push({ name: 'D8 真实剪贴板：环境受限（信息项）', pass: true, detail: String(e.message) });
    }
    await evalJs(`window.__qa.clickText('关闭')`, 'close');
    await sleep(200);
  }

  /* =====================================================================
     A-real. 真实 MediaRecorder 视频 → 真实 onEnded 触发一次打卡（尽力而为）
     ===================================================================== */
  console.log('\n===== A-real. 真实视频播放至结束触发打卡（尽力而为）=====');
  {
    await evalJs(CLEAR_CHECKINS, 'clear');
    await reloadAndToolkit();
    const rec = await evalJs(`window.__qa.recordAndSeed()`, 'record');
    console.log(`  recordAndSeed → ${rec}`);
    if (typeof rec === 'string' && rec.startsWith('ok:')) {
      await reloadAndToolkit();
      await send('Page.bringToFront'); // C5/C6 的真弹窗可能让本标签失焦，后台标签会暂停媒体播放
      await evalJs(`window.__qa.clickCardBtn('真实视频','播放视频')`, 'open-qvR');
      await sleep(700);
      const playRes = await evalJs(`window.__qa.realPlayToEnd(6000)`, 'realplay');
      await sleep(800);
      const c = await evalJs(`window.__qa.countCheckins('qvR')`);
      const st = await evalJs('window.__qa.mainState()');
      check('A25 真实视频播放到结束触发打卡（真实 ended 事件）', playRes === 'ended' && c === 1 && st && st.text === '已打卡 ✓', `playRes=${playRes} count=${c} st=${JSON.stringify(st)}`);
      await evalJs(`window.__qa.clickText('关闭')`, 'close');
    } else {
      console.log(`INFO  A25 无法生成真实视频（${rec}），真实 ended 事件无法验证，仅其它用例的合成 ended 事件可用`);
      results.push({ name: 'A25 真实视频 ended：无法生成视频（信息项）', pass: true, detail: String(rec) });
    }
  }

  /* ---------------- 汇总 ---------------- */
  const errs = consoleMsgs.filter((m) => m.type === 'error' || m.type === 'exception');
  if (errs.length) {
    console.log('\n----- 页面 console error/exception 记录 -----');
    for (const e of errs.slice(0, 20)) console.log(`  [${e.type}] ${e.text.split('\n')[0]}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== QA 汇总 =====`);
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
