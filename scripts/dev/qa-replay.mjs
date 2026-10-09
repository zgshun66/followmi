// QA 独立验证（Part B/C/D）：额度用完后重播不得多记打卡 + 原有行为不回归 + replay() 边界。
//
// 手段：无头 Edge + CDP，真实点击 DOM、真实播放真实视频到结尾（自然触发 ended）、
//       真实读写 IndexedDB 计数；完成率用 Node 侧既有纯逻辑函数交叉验证。
//
// 用法：node scripts/dev/qa-replay.mjs [url]   （默认 http://127.0.0.1:5199/）
// 退出码 0=全部通过。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import * as U from '../../test/logic.bundle.mjs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.QA_PORT || 9371);
const URL_ = process.argv[2] || 'http://127.0.0.1:5199/';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const previewDir = path.resolve(root, '..', '.preview');
fs.mkdirSync(previewDir, { recursive: true });

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

const profile = path.join(previewDir, `qa-replay-profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });

const child = spawn(
  EDGE,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--disable-popup-blocking',
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForDevtools() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch { /* not up */ }
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

const TOOLKIT = `
window.__qa = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  allCheckins: () => new Promise((res, rej) => { const q = indexedDB.open('fitness_pwa', 1); q.onsuccess = () => { const db = q.result; const g = db.transaction('checkins','readonly').objectStore('checkins').getAll(); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); }; q.onerror = () => rej(q.error); }),
  countCheckins: async (id) => (await window.__qa.allCheckins()).filter((c) => c.taskId === id).length,
  panel: () => document.querySelector('div.fixed.inset-0.z-50'),
  panelOpen: () => !!window.__qa.panel(),
  mainBtn: () => { const p = window.__qa.panel(); if (!p) return null; return [...p.querySelectorAll('button')].find((b) => ['标记完成','再来一次','已打卡 ✓','去原站再练'].includes((b.textContent||'').trim())) || null; },
  mainState: () => { const b = window.__qa.mainBtn(); return b ? { text: (b.textContent||'').trim(), disabled: b.disabled } : null; },
  clickMain: () => { const b = window.__qa.mainBtn(); if (!b) return false; b.click(); return true; },
  clickPanelText: (t) => { const p = window.__qa.panel(); if (!p) return false; const b = [...p.querySelectorAll('button')].find((x) => (x.textContent||'').trim() === t); if (!b) return false; b.click(); return true; },
  remaining: () => { const p = window.__qa.panel(); if (!p) return null; const m = (p.textContent||'').match(/今日还差\\s*(\\d+)\\s*次/); return m ? Number(m[1]) : null; },
  panelHint: () => { const p = window.__qa.panel(); if (!p) return null; return (p.textContent||'').replace(/\\s+/g,' ').trim(); },
  cardBtnText: (name) => { const s = [...document.querySelectorAll('span')].find((x) => x.textContent.trim() === name); if (!s) return null; const card = s.closest('div.rounded-xl2'); if (!card) return null; return [...card.querySelectorAll('button')].map((b) => (b.textContent||'').trim()); },
  cardCheckinDisabled: (name) => { const s = [...document.querySelectorAll('span')].find((x) => x.textContent.trim() === name); if (!s) return null; const card = s.closest('div.rounded-xl2'); if (!card) return null; const b = [...card.querySelectorAll('button')].find((x) => (x.textContent||'').trim() === '打卡'); return b ? b.disabled : null; },
  cardProgress: (name) => { const s = [...document.querySelectorAll('span')].find((x) => x.textContent.trim() === name); if (!s) return null; const card = s.closest('div.rounded-xl2'); if (!card) return null; const m = (card.textContent||'').match(/(\\d+)\\/(\\d+)/); return m ? { done: Number(m[1]), required: Number(m[2]) } : null; },
  openTask: (name, btn) => { const s = [...document.querySelectorAll('span')].find((x) => x.textContent.trim() === name); if (!s) return false; const card = s.closest('div.rounded-xl2'); if (!card) return false; const b = [...card.querySelectorAll('button')].find((x) => (x.textContent||'').trim() === btn); if (!b) return false; b.click(); return true; },
  video: () => document.querySelector('video'),
  iframe: () => document.querySelector('iframe'),
  // 真实播放到结尾（自然触发 ended）。copy 自 qa-clip 的成熟手法。
  realPlayToEnd: async (timeoutMs) => {
    const v = document.querySelector('video'); if (!v) return 'no-video';
    v.muted = true;
    if (v.readyState < 2) await new Promise((res) => { const on = () => { v.removeEventListener('canplay', on); res(); }; v.addEventListener('canplay', on); setTimeout(on, 3000); });
    if (!isFinite(v.duration)) { await new Promise((res) => { const on = () => { v.removeEventListener('durationchange', on); res(); }; v.addEventListener('durationchange', on); try { v.currentTime = 1e101; } catch (e) {} setTimeout(on, 1500); }); }
    try { v.currentTime = isFinite(v.duration) && v.duration > 0.5 ? v.duration - 0.25 : 0; } catch (e) {}
    let pr = '';
    for (let i = 0; i < 4; i++) {
      pr = await Promise.race([ v.play().then(() => 'played').catch((e) => 'rejected:' + e.message), new Promise((r) => setTimeout(() => r('play-timeout'), 3000)) ]);
      if (pr === 'played') break;
      try { v.currentTime = isFinite(v.duration) && v.duration > 0.5 ? v.duration - 0.25 : 0; } catch (e) {}
      await new Promise((r) => setTimeout(r, 150));
    }
    if (pr !== 'played') return pr;
    return await new Promise((res) => { const on = () => { v.removeEventListener('ended', on); res('ended'); }; v.addEventListener('ended', on); setTimeout(() => { v.removeEventListener('ended', on); res('ended-timeout'); }, timeoutMs); });
  },
  // 点面板主按钮触发 replay，随后等自然 ended；同时记录点击瞬间 currentTime（证明从 0 重播）。
  // 加入「等就绪 + 主动续播」逻辑，抵抗无头浏览器对背景媒体的省电暂停导致的偶发中断。
  clickMainAndWaitEnded: async (timeoutMs) => {
    let v = document.querySelector('video'); if (!v) return { err: 'no-video' };
    // 等元数据就绪，避免视频刚重挂时点击无效
    if (v.readyState === 0) {
      await new Promise((res) => { const on = () => { v.removeEventListener('loadedmetadata', on); res(); }; v.addEventListener('loadedmetadata', on); setTimeout(on, 2000); });
    }
    v.muted = true;
    const ctBefore = v.currentTime;
    let endedFired = false;
    const onEnded = () => { endedFired = true; };
    v.addEventListener('ended', onEnded);
    const b = window.__qa.mainBtn(); if (!b) { v.removeEventListener('ended', onEnded); return { err: 'no-btn' }; }
    b.click();
    await window.__qa.sleep(40);
    const ctAfterClick = document.querySelector('video') ? document.querySelector('video').currentTime : -1;
    // 主动续播直到 ended 或超时
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !endedFired) {
      const vv = document.querySelector('video');
      if (!vv) break;
      if (vv.ended) { endedFired = true; break; }
      if (vv.paused) { try { await vv.play().catch(() => {}); } catch (e) {} }
      await window.__qa.sleep(100);
    }
    v.removeEventListener('ended', onEnded);
    return { outcome: endedFired ? 'ended' : 'ended-timeout', ctBefore, ctAfterClick };
  },
};
'qa-replay-toolkit-ready';
`;

const SEED = (videoExpr, extraCheckins) => `
(async () => {
  const open = () => new Promise((res, rej) => { const q = indexedDB.open('fitness_pwa', 1); q.onupgradeneeded = () => { const db = q.result; for (const s of ['tasks','checkins','metrics','bodyEntries']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const db = await open();
  const put = (store, rows) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); for (const r of rows) tx.objectStore(store).put(r); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  const clear = (s) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).clear(); tx.oncomplete = () => res(); });
  await clear('tasks'); await clear('checkins');
  const blob = ${videoExpr};
  const now = Date.now();
  await put('tasks', [
    { id: 'rv3', name: '三次视频', type: 'upload', videoBlob: blob, schedule: { mode: 'daily', perTimes: 3 }, createdAt: now },
    { id: 'rv1', name: '一次视频', type: 'upload', videoBlob: blob, schedule: { mode: 'daily', perTimes: 1 }, createdAt: now },
    { id: 'rb1', name: '无视频', type: 'upload', schedule: { mode: 'daily', perTimes: 1 }, createdAt: now },
    { id: 'rl1', name: '纯外链', type: 'link', linkUrl: '#qaext', schedule: { mode: 'daily', perTimes: 1 }, createdAt: now },
    { id: 're1', name: '嵌入外链', type: 'link', embedHtml: '<iframe id="emb" src="about:blank" style="width:100%;height:220px;border:0"></iframe>', schedule: { mode: 'daily', perTimes: 1 }, createdAt: now },
  ]);
  const existing = ${extraCheckins};
  if (existing.length) await put('checkins', existing);
  return 'seeded';
})()
`;

const CLEAR = `(async () => { const q = indexedDB.open('fitness_pwa', 1); const db = await new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); await new Promise((res) => { const tx = db.transaction('checkins','readwrite'); tx.objectStore('checkins').clear(); tx.oncomplete = () => res(); }); return 'cleared'; })()`;

let send;
const exceptions = [];
async function evalJs(expr, label = 'eval') {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${label} 抛异常: ` + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function waitFor(expr, timeout = 4000, interval = 70) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await evalJs(expr, 'waitFor');
    if (v) return v;
    await sleep(interval);
  }
  return null;
}
const q = () => evalJs(TOOLKIT, 'toolkit');
async function reload(ms = 2200) { await send('Page.reload'); await sleep(ms); await q(); }

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const conn = connect(target.webSocketDebuggerUrl);
  await conn.ready;
  send = conn.send;
  conn.ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description || d.text);
    }
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_ });
  await sleep(2500);
  await q();

  // 生成真实可播放视频并写入任务；rb1 预置 1 条今日打卡（使其 finished，用于 replay 空引用边界）
  const recSize = await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const ctx = c.getContext('2d');
    let t = 0; const draw = () => { ctx.fillStyle = t % 2 ? '#c33' : '#223'; ctx.fillRect(0,0,320,240); t++; }; draw();
    const vstream = c.captureStream(10);
    let stream = vstream;
    // 关键：加一条音频轨，避免 Chrome 把「video-only 背景媒体」当作省电对象而暂停（会打断真实 play/ended）
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const osc = ac.createOscillator(); osc.frequency.value = 200;
      const dst = ac.createMediaStreamDestination(); osc.connect(dst); osc.start();
      stream = new MediaStream([...vstream.getVideoTracks(), ...dst.stream.getAudioTracks()]);
    } catch (e) {}
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus'
      : (MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm');
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 400000 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    const iv = setInterval(draw, 100); rec.start(100);
    await new Promise((r) => setTimeout(r, 900));
    clearInterval(iv); rec.stop(); await stopped;
    window.__qaBlob = new Blob(chunks, { type: 'video/webm' }); return window.__qaBlob.size + '|' + mime;
  })()`, 'record');
  console.log('recorded real webm size =', recSize);

  await evalJs(SEED('window.__qaBlob', `[{ id: 'rb1-x', taskId: 'rb1', taskName: '无视频', type: 'upload', ts: Date.now() }]`), 'seed');
  await reload();
  const seeded = await evalJs(`window.__qa.cardProgress('三次视频')`);
  check('B0 种子生效：三次视频 0/3', seeded && seeded.done === 0 && seeded.required === 3, JSON.stringify(seeded));

  /* ============================================================
     B. 额度用完后重播不得多记打卡
     ============================================================ */
  console.log('\n===== B. 额度用完（perTimes=3）后重播不多记 =====');
  await evalJs(CLEAR, 'clear'); await reload();
  await evalJs(`window.__qa.openTask('三次视频','播放视频')`, 'open-rv3');
  await sleep(500);
  check('B1 初始主按钮=「标记完成」', (await evalJs('window.__qa.mainState()'))?.text === '标记完成', JSON.stringify(await evalJs('window.__qa.mainState()')));
  check('B2 初始 remaining=3', (await evalJs('window.__qa.remaining()')) === 3, `remaining=${await evalJs('window.__qa.remaining()')}`);

  // 第 1 次：真实播放到结尾（自然 ended）。注意：全程保持同一面板会话，
  // 否则关闭再开会重置组件内部 started，按钮回到「标记完成」——那是测试脚本的问题，不是产品行为。
  const r1 = await evalJs(`window.__qa.realPlayToEnd(8000)`, 'play-1');
  await waitFor(`window.__qa.countCheckins('rv3').then((n)=>n>=1)`, 4000);
  await sleep(300);
  const c1 = await evalJs(`window.__qa.countCheckins('rv3')`);
  const st1 = await evalJs('window.__qa.mainState()');
  check('B3 第 1 次真实播完 ended → IndexedDB 记 1 条', c1 === 1 && r1 === 'ended', `count=${c1} outcome=${r1}`);
  check('B4 第 1 次后按钮变「再来一次」', st1?.text === '再来一次', JSON.stringify(st1));
  // 面板仍开着，但今日页卡片 DOM 仍在，可读其文案：done=1>0 且 remaining=2>0 → 「继续练」
  const cardMid = await evalJs(`window.__qa.cardBtnText('三次视频')`);
  const disabledMid = await evalJs(`window.__qa.cardCheckinDisabled('三次视频')`);
  check('B5 今日页主按钮文案为「继续练」（remaining>0 且已练 1 次）', Array.isArray(cardMid) && cardMid.includes('继续练'), JSON.stringify(cardMid));
  check('B6 未完成时金色「打卡」按钮可用', disabledMid === false, `disabled=${disabledMid}`);

  // 第 2、3 次：点面板「再来一次」→ 从 0 重播 → 自然 ended（同一面板会话）
  const round2 = await evalJs(`window.__qa.clickMainAndWaitEnded(8000)`, 'round2');
  await waitFor(`window.__qa.countCheckins('rv3').then((n)=>n>=2)`, 4000); await sleep(250);
  const c2 = await evalJs(`window.__qa.countCheckins('rv3')`);
  check('B7 第 2 次：点「再来一次」从 0 重播（ct≈0 而非结尾）并自然 ended', round2?.outcome === 'ended' && round2?.ctAfterClick < 0.5, JSON.stringify(round2));
  check('B8 第 2 次后 checkins=2', c2 === 2, `count=${c2}`);

  const round3 = await evalJs(`window.__qa.clickMainAndWaitEnded(8000)`, 'round3');
  await waitFor(`window.__qa.countCheckins('rv3').then((n)=>n>=3)`, 4000); await sleep(250);
  const c3 = await evalJs(`window.__qa.countCheckins('rv3')`);
  check('B9 第 3 次后 checkins=3（练满额度）', c3 === 3 && round3?.outcome === 'ended', `count=${c3} outcome=${round3?.outcome}`);
  const st3 = await evalJs('window.__qa.mainState()');
  check('B10 额度用完后主按钮仍为可点的「再来一次」（未变灰）', st3?.text === '再来一次' && st3?.disabled === false, JSON.stringify(st3));
  const hint3 = await evalJs('window.__qa.panelHint()');
  check('B11 额度用完后提示语切为「今日已完成…再来一次」', !!hint3 && hint3.includes('今日已完成'), hint3?.slice(-40));

  // 今日页：主按钮「再来一次」、打卡按钮必须仍禁用、进度 3/3（读面板背后的卡片 DOM）
  const cardDone = await evalJs(`window.__qa.cardBtnText('三次视频')`);
  const disabledDone = await evalJs(`window.__qa.cardCheckinDisabled('三次视频')`);
  const progDone = await evalJs(`window.__qa.cardProgress('三次视频')`);
  check('B12 今日页主按钮文案=「再来一次」', Array.isArray(cardDone) && cardDone.includes('再来一次'), JSON.stringify(cardDone));
  check('B13 额度用完后金色「打卡」按钮仍禁用（防超额闸门未放开）', disabledDone === true, `disabled=${disabledDone}`);
  check('B14 卡面进度 3/3（不出现 4/3 越界）', progDone && progDone.done === 3 && progDone.required === 3, JSON.stringify(progDone));
  await evalJs(`window.__qa.clickPanelText('关闭')`, 'close');
  await sleep(300);

  // 额度用完后反复重播 5 轮，checkins 必须仍为 3
  const replayRounds = [];
  for (let i = 1; i <= 5; i++) {
    const opened = await evalJs(`window.__qa.openTask('三次视频','再来一次')`, `open-round-${i}`);
    await sleep(450);
    const clickRes = await evalJs(`window.__qa.clickMainAndWaitEnded(8000)`, `replay-round-${i}`);
    await sleep(350);
    const cnt = await evalJs(`window.__qa.countCheckins('rv3')`);
    const badge = await evalJs(`window.__qa.cardCheckinDisabled('三次视频')`);
    replayRounds.push({ i, opened, outcome: clickRes?.outcome, ctAfterClick: clickRes?.ctAfterClick, cnt, checkinDisabled: badge });
    // 关闭面板，回到今日页再做下一轮
    await evalJs(`window.__qa.clickPanelText('关闭')`, `close-${i}`);
    await sleep(250);
  }
  console.log('  额度用完后重播各轮 =', JSON.stringify(replayRounds));
  check('B15 额度用完后重播 5 轮，video 均从 0 重播并自然 ended', replayRounds.every((r) => r.outcome === 'ended' && r.ctAfterClick < 0.5), JSON.stringify(replayRounds.map((r) => r.outcome)));
  check('B16 额度用完后重播 5 轮，checkins 始终=3（绝不 4/3）', replayRounds.every((r) => r.cnt === 3), JSON.stringify(replayRounds.map((r) => r.cnt)));
  check('B17 每轮重播后今日页「打卡」按钮始终禁用', replayRounds.every((r) => r.checkinDisabled === true), JSON.stringify(replayRounds.map((r) => r.checkinDisabled)));

  // 交叉验证：用 Node 侧既有纯逻辑函数
  const allC = await evalJs(`window.__qa.allCheckins()`, 'all');
  const taskRv3 = { id: 'rv3', name: '三次视频', type: 'upload', schedule: { mode: 'daily', perTimes: 3 }, createdAt: 0 };
  const today = U.startOfDay(new Date());
  const remaining = U.getRemaining(taskRv3, allC, today);
  const required = U.requiredTimesOn(taskRv3, today);
  const done = required - remaining;
  const rate = U.getCompletionRate(allC, [taskRv3], today, today);
  check('B18 getRemaining 仍为 0、done=required（无 4/3 越界）', remaining === 0 && done === 3 && required === 3, `remaining=${remaining} done=${done}/${required}`);
  check('B19 getCompletionRate 仍为 100%', rate === 100, `rate=${rate}`);
  check('B20 IndexedDB 中 rv3 记录恰为 3 条', allC.filter((c) => c.taskId === 'rv3').length === 3, `n=${allC.filter((c) => c.taskId === 'rv3').length}`);

  /* ============================================================
     C. 额度未用完：原有行为不回归
     ============================================================ */
  console.log('\n===== C. 额度未用完原有行为 + busy 防连点/兜底 =====');
  await evalJs(CLEAR, 'clear'); await reload();
  await evalJs(`window.__qa.openTask('一次视频','播放视频')`, 'open-rv1');
  await sleep(400);
  check('C1 qv1 初始 remaining=1、按钮「标记完成」', (await evalJs('window.__qa.remaining()')) === 1 && (await evalJs('window.__qa.mainState()'))?.text === '标记完成');
  const rc = await evalJs(`window.__qa.realPlayToEnd(8000)`, 'rv1-play');
  await waitFor(`window.__qa.countCheckins('rv1').then((n)=>n>=1)`, 4000); await sleep(250);
  const cc = await evalJs(`window.__qa.countCheckins('rv1')`);
  const stc = await evalJs('window.__qa.mainState()');
  check('C2 播完一次记 1 条、按钮「标记完成」→「再来一次」', cc === 1 && stc?.text === '再来一次' && rc === 'ended', `count=${cc} st=${JSON.stringify(stc)} outcome=${rc}`);
  await evalJs(`window.__qa.clickPanelText('关闭')`, 'close'); await sleep(250);

  // 防连点（busy 守卫）：写入「在途」时第二次点击必须无法再次触发 markComplete。
  // 用「put 抛错 + 计次」把在途窗口稳定放大至可测。（真实短双击见报告 qa-dbl2.mjs 的旧/新 A/B）
  await evalJs(CLEAR, 'clear'); await reload();
  await evalJs(`window.__qa.openTask('三次视频','播放视频')`, 'open-rv3-2'); await sleep(450);
  await evalJs(`window.__putCalls=0; window.__origPut=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(){ window.__putCalls++; throw new Error('QA-inflight'); }; 'patched'`, 'patch-inflight');
  await evalJs(`window.__qa.mainBtn().click(); 'c1'`, 'c1');
  await sleep(200);
  const inflightState = await evalJs('window.__qa.mainState()');
  await evalJs(`window.__qa.mainBtn().click(); 'c2'`, 'c2');
  await sleep(200);
  const putCalls = await evalJs('window.__putCalls');
  check('C3 防连点：写入在途时按钮 disabled，第二次点击不再触发 markComplete', inflightState?.disabled === true && putCalls === 1, `disabledAt200ms=${inflightState?.disabled} putCalls=${putCalls}`);
  await evalJs(`IDBObjectStore.prototype.put = window.__origPut; 'restored'`, 'restore');
  await evalJs(`window.__qa.clickPanelText('关闭')`, 'close'); await sleep(250);

  // C3b：真实鼠标事件在途双击同样只触发 1 次
  await evalJs(CLEAR, 'clear'); await reload();
  await evalJs(`window.__qa.openTask('三次视频','播放视频')`, 'open-rv3-2b'); await sleep(450);
  await evalJs(`window.__putCalls=0; window.__origPut=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(){ window.__putCalls++; throw new Error('QA-inflight'); }; 'patched'`, 'patch-inflight2');
  const mrect = await evalJs(`(()=>{const b=window.__qa.mainBtn();const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`, 'rect');
  for (const d of [0, 200]) {
    if (d) await sleep(d);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mrect.x, y: mrect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mrect.x, y: mrect.y, button: 'left', clickCount: 1 });
  }
  await sleep(200);
  const putCalls2 = await evalJs('window.__putCalls');
  check('C3b 防连点：真实鼠标在途双击只触发 1 次 markComplete', putCalls2 === 1, `putCalls=${putCalls2}`);
  await evalJs(`IDBObjectStore.prototype.put = window.__origPut; 'restored'`, 'restore');
  await evalJs(`window.__qa.clickPanelText('关闭')`, 'close'); await sleep(250);

  // 2500ms 兜底解锁：patch put 抛错
  await evalJs(CLEAR, 'clear'); await reload();
  await evalJs(`window.__qa.openTask('三次视频','播放视频')`, 'open-rv3-3'); await sleep(400);
  const cBefore = await evalJs(`window.__qa.countCheckins('rv3')`);
  await evalJs(`window.__origPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(){ throw new Error('QA-injected put failure'); }; 'patched'`, 'patch');
  const tb = Date.now();
  await evalJs('window.__qa.clickMain()', 'click');
  await sleep(130);
  const stD = await evalJs('window.__qa.mainState()');
  check('C4 失败路径点击后按钮立即 disabled', stD?.disabled === true, JSON.stringify(stD));
  await sleep(2000);
  const st21 = await evalJs('window.__qa.mainState()');
  check('C5 约 2.1s 仍 disabled（证明非即时解锁）', st21?.disabled === true, `since=${Date.now() - tb}ms`);
  const enabled = await waitFor(`(()=>{const s=window.__qa.mainState();return s && !s.disabled;})()`, 4000);
  const total = Date.now() - tb;
  check('C6 2500ms 兜底后恢复可点', !!enabled && total > 2200 && total < 4200, `total=${total}ms`);
  const cAfter = await evalJs(`window.__qa.countCheckins('rv3')`);
  check('C7 失败路径不产生幻影 checkin', cAfter === cBefore, `before=${cBefore} after=${cAfter}`);
  await evalJs(`IDBObjectStore.prototype.put = window.__origPut; 'restored'`, 'restore');
  await evalJs(`window.__qa.clickPanelText('关闭')`, 'close'); await sleep(250);

  /* ============================================================
     D. replay() 边界
     ============================================================ */
  console.log('\n===== D. replay() 边界 =====');
  // D1: VideoPlayer.replay() 视频未载入（无 videoBlob，url 为空）时点击：静默无操作、不抛异常
  await evalJs(CLEAR, 'clear'); await reload();
  // rb1 预置 1 条 → finished，今日页主按钮「再来一次」
  await evalJs(`(async () => { const q = indexedDB.open('fitness_pwa',1); const db = await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}); const tx = db.transaction('checkins','readwrite'); tx.objectStore('checkins').put({ id:'rb1-pre', taskId:'rb1', taskName:'无视频', type:'upload', ts: Date.now() }); await new Promise((res)=>{tx.oncomplete=()=>res();}); return 'ok'; })()`, 'preset-rb1');
  await send('Page.reload'); await sleep(2000); await q();
  const excBefore = exceptions.length;
  const openRb1 = await evalJs(`window.__qa.openTask('无视频','再来一次')`, 'open-rb1');
  await sleep(400);
  const rb1HasVideo = await evalJs(`!!window.__qa.video()`);
  const rb1Main = await evalJs('window.__qa.mainState()');
  const clickRes = await evalJs(`window.__qa.clickMain()`, 'click-rb1-replay');
  await sleep(400);
  const rb1Count = await evalJs(`window.__qa.countCheckins('rb1')`);
  const rb1StillOpen = await evalJs('window.__qa.panelOpen()');
  check('D1a 「无视频」任务可打开面板且无 <video>（url 为空 → videoRef 为 null）', openRb1 === true && rb1HasVideo === false, `open=${openRb1} hasVideo=${rb1HasVideo} main=${JSON.stringify(rb1Main)}`);
  check('D1b finished 且无视频时主按钮=「再来一次」', rb1Main?.text === '再来一次', JSON.stringify(rb1Main));
  check('D1c 点击「再来一次」静默无操作、无异常抛出、面板仍存活', clickRes === true && exceptions.length === excBefore && rb1StillOpen === true, `exceptions+${exceptions.length - excBefore} stillOpen=${rb1StillOpen}`);
  check('D1d 未新增打卡（仍 1 条）', rb1Count === 1, `count=${rb1Count}`);
  await evalJs(`window.__qa.clickPanelText('关闭')`, 'close'); await sleep(250);

  // D2a: LinkPlayer 纯外链（非 standalone）：额度用完后「再来一次」→ openExternal(window.open 新标签)，当前页不被导航
  await evalJs(CLEAR, 'clear'); await reload();
  await evalJs(`window.__qa.openTask('纯外链','打开 / 播放')`, 'open-rl1'); await sleep(400);
  await evalJs(`window.__qa.clickPanelText('标记完成')`, 'mark-rl1');
  await waitFor(`window.__qa.countCheckins('rl1').then((n)=>n>=1)`, 3000); await sleep(300);
  const rl1Main = await evalJs('window.__qa.mainState()');
  const hrefBefore = await evalJs('window.location.href');
  const targetsBefore = (await send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').length;
  await evalJs(`window.__qa.clickPanelText('去原站再练')`, 'replay-rl1');
  await sleep(800);
  const targetsAfter = (await send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').length;
  const hrefAfter = await evalJs('window.location.href');
  const rl1Count = await evalJs(`window.__qa.countCheckins('rl1')`);
  check('D2a 纯外链额度用完后主按钮=「去原站再练」（第2轮文案修复）', rl1Main?.text === '去原站再练', JSON.stringify(rl1Main));
  check('D2b 非 standalone 下点「去原站再练」→ 只新开标签，当前页不被导航走', hrefAfter === hrefBefore && targetsAfter > targetsBefore, `href ${hrefBefore === hrefAfter ? 'same' : 'CHANGED'} targets ${targetsBefore}→${targetsAfter}`);
  check('D2c 该操作不触发打卡（仍 1 条）', rl1Count === 1, `count=${rl1Count}`);
  await evalJs(`window.__qa.clickPanelText('关闭')`, 'close'); await sleep(200);

  // D3: LinkPlayer 有 embed：额度用完后「再来一次」→ iframe 重挂（节点身份变化），不打卡
  await evalJs(CLEAR, 'clear'); await reload();
  await evalJs(`window.__qa.openTask('嵌入外链','打开 / 播放')`, 'open-re1'); await sleep(500);
  const hasIframe = await evalJs(`!!window.__qa.iframe()`);
  await evalJs(`window.__qa.clickPanelText('标记完成')`, 'mark-re1');
  await waitFor(`window.__qa.countCheckins('re1').then((n)=>n>=1)`, 3000); await sleep(300);
  const re1Main = await evalJs('window.__qa.mainState()');
  const idBefore = await evalJs(`(() => { window.__ifr1 = window.__qa.iframe(); return window.__ifr1 ? window.__ifr1.getAttribute('id') : null; })()`);
  await evalJs(`window.__qa.clickPanelText('再来一次')`, 'replay-re1');
  await sleep(500);
  const remount = await evalJs(`(() => { const a = window.__qa.iframe(); return { changed: a !== window.__ifr1, oldDetached: window.__ifr1 ? !document.contains(window.__ifr1) : null, oldId: window.__ifr1 ? window.__ifr1.getAttribute('id') : null, newId: a ? a.getAttribute('id') : null }; })()`);
  const re1Count = await evalJs(`window.__qa.countCheckins('re1')`);
  check('D3a 有 embed 任务渲染出 iframe 且额度用完后按钮=「再来一次」', hasIframe === true && re1Main?.text === '再来一次', `hasIframe=${hasIframe} main=${JSON.stringify(re1Main)}`);
  check('D3b 点「再来一次」iframe 真的被重挂（DOM 节点身份变化 + 旧节点脱离）', !!remount && remount.changed === true && remount.oldDetached === true, JSON.stringify(remount));
  check('D3c iframe 重挂不触发任何打卡（仍 1 条）', re1Count === 1, `count=${re1Count}`);
  await evalJs(`window.__qa.clickPanelText('关闭')`, 'close'); await sleep(200);

  // D2d: standalone 模式：纯外链「再来一次」→ openExternal 走同窗口导航（当前页被导航走）
  console.log('\n----- D2d standalone：同窗口导航（linkUrl 用 hash 证明 location.href 赋值被执行）-----');
  await evalJs(CLEAR, 'clear'); await reload();
  await evalJs(`(async () => { const q = indexedDB.open('fitness_pwa',1); const db = await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}); const tx = db.transaction('checkins','readwrite'); tx.objectStore('checkins').put({ id:'rl1-pre', taskId:'rl1', taskName:'纯外链', type:'link', ts: Date.now() }); await new Promise((res)=>{tx.oncomplete=()=>res();}); return 'ok'; })()`, 'preset-rl1');
  const inject = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.matchMedia = function(q){ return { matches: /display-mode:\\s*standalone/.test(q), media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } }; };` });
  await evalJs(`window.location.hash = ''; 'clearhash'`, 'clearhash');
  await send('Page.reload'); await sleep(2000); await q();
  const standaloneOn = await evalJs(`window.matchMedia('(display-mode: standalone)').matches`);
  await evalJs(`window.__qa.openTask('纯外链','再来一次')`, 'open-rl1-sa'); await sleep(400);
  const saHashBefore = await evalJs('window.location.hash');
  await evalJs(`window.__qa.clickPanelText('去原站再练')`, 'replay-rl1-sa');
  await sleep(600);
  const saHrefAfter = await evalJs('window.location.href');
  const saCount = await evalJs(`window.__qa.countCheckins('rl1')`);
  check('D2d standalone 模拟生效', standaloneOn === true, `matchMedia=${standaloneOn}`);
  check('D2e standalone 下点「去原站再练」执行同窗口导航（location.href 被改写为 linkUrl）', saHrefAfter.includes('#qaext') && saHashBefore !== '#qaext', `hashBefore=${saHashBefore} hrefAfter=${saHrefAfter?.slice(-40)}`);
  check('D2f 同窗口导航不触发打卡（仍 1 条）', saCount === 1, `count=${saCount}`);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inject.identifier });

  /* ============================================================
     汇总
     ============================================================ */
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n===== 汇总：${passed}/${results.length} 通过 =====`);
  console.log('未捕获异常总数 =', exceptions.length, exceptions.slice(0, 3));
  fs.writeFileSync(path.join(previewDir, 'qa-replay-results.json'), JSON.stringify({ results, exceptions }, null, 2));
  process.exitCode = passed === results.length ? 0 : 1;
} catch (e) {
  console.error('PROBE ERROR', e.stack || e.message);
  process.exitCode = 2;
} finally {
  child.kill();
}
