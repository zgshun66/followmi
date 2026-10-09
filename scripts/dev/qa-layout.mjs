// QA 独立验证（Part A）：竖版大视频下，播放器底部按钮是否真的可见可点。
//
// 手段：无头 Edge + CDP，真实渲染、真实量测 getBoundingClientRect / elementFromPoint，
//       真实 MediaRecorder 生成 1080×2400 竖版视频作为任务。不读 CSS 类名下结论。
//
// 用法：node scripts/dev/qa-layout.mjs <url> <tag>
//   url 默认 http://127.0.0.1:5199/  tag 用于报告区分（fixed / control）
// 退出码 0=全部通过。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.QA_PORT || 9361);
const URL_ = process.argv[2] || 'http://127.0.0.1:5199/';
const TAG = process.argv[3] || 'build';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const previewDir = path.resolve(root, '..', '.preview');
fs.mkdirSync(previewDir, { recursive: true });

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

const profile = path.join(previewDir, `qa-layout-profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });

const child = spawn(
  EDGE,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
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
  panel: () => document.querySelector('div.fixed.inset-0.z-50'),
  openTask: (name, btn) => {
    const s = [...document.querySelectorAll('span')].find((x) => x.textContent.trim() === name);
    if (!s) return false;
    const card = s.closest('div.rounded-xl2'); if (!card) return false;
    const b = [...card.querySelectorAll('button')].find((x) => x.textContent.trim() === btn);
    if (!b) return false; b.click(); return true;
  },
  cardButtons: (name) => {
    const s = [...document.querySelectorAll('span')].find((x) => x.textContent.trim() === name);
    if (!s) return null; const card = s.closest('div.rounded-xl2'); if (!card) return null;
    return [...card.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
  },
  videoInfo: () => { const v = document.querySelector('video'); return v ? { vw: v.videoWidth, vh: v.videoHeight, rs: v.readyState, dur: v.duration } : null; },
  mainLabel: () => { const p = window.__qa.panel(); if (!p) return null; const b = [...p.querySelectorAll('button')].find((x) => ['标记完成','再来一次','已打卡 ✓'].includes((x.textContent||'').trim())); return b ? (b.textContent||'').trim() : null; },
  // 核心量测：按钮 rect + elementFromPoint 命中 + 视口尺寸
  measure: (t) => {
    const p = window.__qa.panel(); if (!p) return null;
    const b = [...p.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === t);
    if (!b) return { missing: true };
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    return {
      top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1), cx: +cx.toFixed(1), cy: +cy.toFixed(1),
      inViewport: r.top >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.left >= -0.5 && r.right <= window.innerWidth + 0.5,
      hit: !!(el && (el === b || b.contains(el))), hitTag: el ? el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '') : null,
      vw: window.innerWidth, vh: window.innerHeight, disabled: b.disabled,
    };
  },
  footerPad: () => {
    const p = window.__qa.panel(); if (!p) return null;
    const f = p.lastElementChild; if (!f) return null;
    const cs = getComputedStyle(f);
    return { pb: cs.paddingBottom, pt: cs.paddingTop, pbPx: parseFloat(cs.paddingBottom) };
  },
  videoWrapClass: () => {
    const p = window.__qa.panel(); if (!p) return null;
    const w = [...p.querySelectorAll('div')].find((d) => d.classList.contains('bg-black') && d.classList.contains('flex-1'));
    return w ? w.className : null;
  },
  // 运行时把改动回退成「改动前」的 CSS（用于对照，不改磁盘文件）
  breakLayout: () => {
    const p = window.__qa.panel();
    const w = [...p.querySelectorAll('div')].find((d) => d.classList.contains('bg-black') && d.classList.contains('flex-1'));
    if (!w) return 'no-wrap';
    w.classList.remove('min-h-0'); w.classList.remove('overflow-hidden');
    const v = w.querySelector('video'); if (v) v.className = 'max-h-full max-w-full bg-black';
    return { wrap: w.className, video: v ? v.className : null };
  },
  recordBlob: async (w, h, ms) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
    let t = 0;
    const draw = () => { ctx.fillStyle = \`hsl(\${(t * 25) % 360} 60% 45%)\`; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = '60px sans-serif'; ctx.fillText('f' + t, 30, 90); t++; };
    draw();
    const stream = c.captureStream(10);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: w * h > 500000 ? 1500000 : 400000 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    const iv = setInterval(draw, 100);
    rec.start(100);
    await new Promise((r) => setTimeout(r, ms));
    clearInterval(iv); rec.stop(); await stopped;
    const blob = new Blob(chunks, { type: 'video/webm' });
    window.__qaBlobs = window.__qaBlobs || {}; window.__qaBlobs.last = blob;
    return blob.size;
  },
};
'qa-layout-toolkit-ready';
`;

let send;
async function evalJs(expr, label = 'eval') {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${label} 抛异常: ` + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function waitFor(expr, timeout = 4000, interval = 80) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await evalJs(expr, 'waitFor');
    if (v) return v;
    await sleep(interval);
  }
  return null;
}
const seedTask = (js) => evalJs(js, 'seed');

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const conn = connect(target.webSocketDebuggerUrl);
  await conn.ready;
  send = conn.send;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_ });
  await sleep(2500);
  await evalJs(TOOLKIT, 'toolkit');

  // 生成真实视频（极端竖版 1080×2400），写入任务 aTall
  const size = await evalJs(`window.__qa.recordBlob(1080, 2400, 900)`, 'record-tall');
  console.log(`[${TAG}] record 1080x2400 webm size =`, size);
  await evalJs(`(async () => {
    const open = () => new Promise((res, rej) => { const q = indexedDB.open('fitness_pwa',1); q.onupgradeneeded=()=>{const db=q.result; for(const s of ['tasks','checkins','metrics','bodyEntries']) if(!db.objectStoreNames.contains(s)) db.createObjectStore(s,{keyPath:'id'});}; q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); });
    const db = await open();
    const put=(store,rows)=>new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite'); for(const r of rows) tx.objectStore(store).put(r); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);});
    await new Promise((res)=>{const tx=db.transaction('checkins','readwrite'); tx.objectStore('checkins').clear(); tx.oncomplete=()=>res();});
    await new Promise((res)=>{const tx=db.transaction('tasks','readwrite'); tx.objectStore('tasks').clear(); tx.oncomplete=()=>res();});
    await put('tasks',[{ id:'aTall', name:'竖版大视频', type:'upload', videoBlob: window.__qaBlobs.last, schedule:{mode:'daily',perTimes:1}, createdAt: Date.now() }]);
    return 'seeded';
  })()`, 'seed-tall');
  await send('Page.reload'); await sleep(2200);
  await evalJs(TOOLKIT, 'toolkit-2');

  /* ============ A1：390×844 竖版大视频，按钮必须完整在视口内且可点 ============ */
  console.log(`\n===== [${TAG}] A1 390×844 竖版大视频 =====`);
  const wrapClass = await evalJs('window.__qa.videoWrapClass()');
  console.log('video-wrap class =', wrapClass);
  await evalJs(`window.__qa.openTask('竖版大视频','播放视频')`, 'open-tall');
  const loaded = await waitFor(`(()=>{const v=window.__qa.videoInfo(); return v && v.rs>0 && v.vw>0;})()`, 6000);
  const vinfo = await evalJs('window.__qa.videoInfo()');
  check('A1.0 真实竖版视频已载入元数据（vw×vh 生效）', loaded && vinfo && vinfo.vw > 0, `info=${JSON.stringify(vinfo)} loaded=${loaded}`);
  await sleep(200);
  const mainLbl = await evalJs('window.__qa.mainLabel()');
  const mMain = await evalJs(`window.__qa.measure('${mainLbl}')`);
  const mLand = await evalJs(`window.__qa.measure('横屏全屏')`);
  console.log('  主按钮量测 =', JSON.stringify(mMain));
  console.log('  横屏全屏量测 =', JSON.stringify(mLand));
  check('A1.1 主按钮完整落在视口内 (top>=0 && bottom<=innerHeight)', !!mMain && mMain.inViewport, `top=${mMain?.top} bottom=${mMain?.bottom} vh=${mMain?.vh}`);
  check('A1.2 主按钮中心 elementFromPoint 命中自身（真可点、未被盖住）', !!mMain && mMain.hit, `hit=${mMain?.hit} tag=${mMain?.hitTag}`);
  check('A1.3 「横屏全屏」按钮完整落在视口内', !!mLand && mLand.inViewport, `top=${mLand?.top} bottom=${mLand?.bottom} vh=${mLand?.vh}`);
  check('A1.4 「横屏全屏」按钮中心命中自身', !!mLand && mLand.hit, `hit=${mLand?.hit}`);
  const pad = await evalJs('window.__qa.footerPad()');
  console.log('  底部栏 padding =', JSON.stringify(pad));
  check('A1.5 底部内边距退化为 16px（无 safe-area 时），非负、非 0、非异常大', !!pad && Math.abs(pad.pbPx - 16) < 0.5, `pb=${pad?.pb}`);

  await send('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync(path.join(previewDir, `qa-layout-${TAG}-a1.png`), Buffer.from(s.data, 'base64')));

  /* ============ A2：对照——运行时把 CSS 回退成「改动前」，复现顶出 ============ */
  console.log(`\n===== [${TAG}] A2 对照（运行时回退 min-h-0 / overflow-hidden / h-full）=====`);
  const broken = await evalJs('window.__qa.breakLayout()', 'break');
  console.log('  after break →', JSON.stringify(broken));
  await sleep(250);
  const mMainB = await evalJs(`window.__qa.measure('${mainLbl}')`);
  console.log('  对照主按钮量测 =', JSON.stringify(mMainB));
  check('A2.1 对照下竖版大视频确实把主按钮顶出视口（bottom>innerHeight）', !!mMainB && !mMainB.inViewport && mMainB.bottom > mMainB.vh, `top=${mMainB?.top} bottom=${mMainB?.bottom} vh=${mMainB?.vh}`);
  check('A2.2 对照下按钮中心 elementFromPoint 不再命中（被顶出/盖住）', !!mMainB && mMainB.hit === false, `hit=${mMainB?.hit} tag=${mMainB?.hitTag}`);
  await send('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync(path.join(previewDir, `qa-layout-${TAG}-a2-broken.png`), Buffer.from(s.data, 'base64')));

  // 还原（重新加载，回到改动后版本）
  await send('Page.reload'); await sleep(2200);
  await evalJs(TOOLKIT, 'toolkit-3');
  await evalJs(`window.__qa.openTask('竖版大视频','播放视频')`, 'reopen');
  await waitFor(`(()=>{const v=window.__qa.videoInfo(); return v && v.vw>0;})()`, 6000);
  await sleep(200);
  const mMainR = await evalJs(`window.__qa.measure('${await evalJs('window.__qa.mainLabel()')}')`);
  check('A2.3 还原后主按钮回到视口内（对照实验可逆）', !!mMainR && mMainR.inViewport && mMainR.hit, `top=${mMainR?.top} bottom=${mMainR?.bottom}`);

  /* ============ A3：极矮视口 390×667 ============ */
  console.log(`\n===== [${TAG}] A3 极矮视口 390×667 =====`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 667, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  const mLbl667 = await evalJs('window.__qa.mainLabel()');
  const mMain667 = await evalJs(`window.__qa.measure('${mLbl667}')`);
  const mLand667 = await evalJs(`window.__qa.measure('横屏全屏')`);
  console.log('  667 主按钮 =', JSON.stringify(mMain667));
  check('A3.1 667 高视口下主按钮完整在视口内且可点', !!mMain667 && mMain667.inViewport && mMain667.hit, `top=${mMain667?.top} bottom=${mMain667?.bottom} vh=${mMain667?.vh}`);
  check('A3.2 667 高视口下「横屏全屏」完整在视口内且可点', !!mLand667 && mLand667.inViewport && mLand667.hit, `top=${mLand667?.top} bottom=${mLand667?.bottom}`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(200);

  /* ============ A4：横版视频无回归（1600×900） ============ */
  console.log(`\n===== [${TAG}] A4 横版视频 1600×900 无回归 =====`);
  const landscape = await evalJs(`(async () => {
    const p = window.__qa.panel(); if (p) { /* 关闭当前面板 */ const b=[...p.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='关闭'); if(b) b.click(); }
    await window.__qa.sleep(300);
    const size = await window.__qa.recordBlob(1600, 900, 800);
    const open=()=>new Promise((res,rej)=>{const q=indexedDB.open('fitness_pwa',1); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error);});
    const db=await open();
    const put=(store,rows)=>new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite'); for(const r of rows) tx.objectStore(store).put(r); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);});
    await new Promise((res)=>{const tx=db.transaction('tasks','readwrite'); tx.objectStore('tasks').clear(); tx.oncomplete=()=>res();});
    await new Promise((res)=>{const tx=db.transaction('checkins','readwrite'); tx.objectStore('checkins').clear(); tx.oncomplete=()=>res();});
    await put('tasks',[{ id:'aLand', name:'横版视频', type:'upload', videoBlob: window.__qaBlobs.last, schedule:{mode:'daily',perTimes:1}, createdAt: Date.now() }]);
    return size;
  })()`, 'record-land');
  console.log('  record 1600x900 size =', landscape);
  await send('Page.reload'); await sleep(2200);
  await evalJs(TOOLKIT, 'toolkit-4');
  await evalJs(`window.__qa.openTask('横版视频','播放视频')`, 'open-land');
  const landLoaded = await waitFor(`(()=>{const v=window.__qa.videoInfo(); return v && v.vw>0;})()`, 6000);
  const landInfo = await evalJs('window.__qa.videoInfo()');
  await sleep(150);
  const mMainL = await evalJs(`window.__qa.measure('${await evalJs('window.__qa.mainLabel()')}')`);
  console.log('  横版主按钮 =', JSON.stringify(mMainL));
  check('A4.1 横版视频元数据载入且 vh<vw', landLoaded && landInfo && landInfo.vh < landInfo.vw, JSON.stringify(landInfo));
  check('A4.2 横版视频主按钮完整在视口内且可点（无回归）', !!mMainL && mMainL.inViewport && mMainL.hit, `top=${mMainL?.top} bottom=${mMainL?.bottom}`);
  await send('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync(path.join(previewDir, `qa-layout-${TAG}-a4-landscape.png`), Buffer.from(s.data, 'base64')));

  /* ============ A5：视频元数据未载入（损坏视频）时按钮仍在视口内 ============ */
  console.log(`\n===== [${TAG}] A5 视频未载入（损坏 blob）时按钮仍在视口内 =====`);
  await evalJs(`(async () => {
    const p = window.__qa.panel(); if (p) { const b=[...p.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='关闭'); if(b) b.click(); }
    await window.__qa.sleep(300);
    const open=()=>new Promise((res,rej)=>{const q=indexedDB.open('fitness_pwa',1); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error);});
    const db=await open();
    const put=(store,rows)=>new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite'); for(const r of rows) tx.objectStore(store).put(r); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);});
    await new Promise((res)=>{const tx=db.transaction('tasks','readwrite'); tx.objectStore('tasks').clear(); tx.oncomplete=()=>res();});
    await new Promise((res)=>{const tx=db.transaction('checkins','readwrite'); tx.objectStore('checkins').clear(); tx.oncomplete=()=>res();});
    const bad = new Blob([new Uint8Array([1,2,3,4,5])], { type: 'video/webm' });
    await put('tasks',[{ id:'aBad', name:'坏视频', type:'upload', videoBlob: bad, schedule:{mode:'daily',perTimes:1}, createdAt: Date.now() }]);
    return 'seeded';
  })()`, 'seed-bad');
  await send('Page.reload'); await sleep(2000);
  await evalJs(TOOLKIT, 'toolkit-5');
  await evalJs(`window.__qa.openTask('坏视频','播放视频')`, 'open-bad');
  await sleep(400);
  const badInfo = await evalJs('window.__qa.videoInfo()');
  const mBad = await evalJs(`window.__qa.measure('${await evalJs('window.__qa.mainLabel()')}')`);
  console.log('  坏视频 info =', JSON.stringify(badInfo));
  console.log('  坏视频主按钮 =', JSON.stringify(mBad));
  check('A5.1 视频未能载入元数据（readyState 低 / 无尺寸）', !badInfo || badInfo.rs === 0 || badInfo.vw === 0, JSON.stringify(badInfo));
  check('A5.2 未载入时主按钮仍在视口内且可点', !!mBad && mBad.inViewport && mBad.hit, `top=${mBad?.top} bottom=${mBad?.bottom}`);

  /* ============ 汇总 ============ */
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n===== [${TAG}] 汇总：${passed}/${results.length} 通过 =====`);
  fs.writeFileSync(path.join(previewDir, `qa-layout-${TAG}-results.json`), JSON.stringify(results, null, 2));
  process.exitCode = passed === results.length ? 0 : 1;
} catch (e) {
  console.error(`[${TAG}] PROBE ERROR`, e.stack || e.message);
  process.exitCode = 2;
} finally {
  child.kill();
}
