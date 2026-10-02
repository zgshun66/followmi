// 端到端探针：真实视频（MediaRecorder 生成）在**真实 app 播放器**里播放到结束，
// 触发真实 onEnded → 真实打卡。全程不派发合成事件。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9377;
const URL_ = process.argv[2] || 'http://127.0.0.1:5199/';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP || '.'}/qa-videoapp-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });

async function ready() { for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch {} await sleep(250); } throw new Error('no devtools'); }
function connect(u) { const ws = new WebSocket(u); let id = 0; const p = new Map(); const rdy = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', (e) => rej(new Error(String(e)))); }); ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id != null && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result); } }); return { ready: rdy, send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; p.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); }) }; }

try {
  await ready();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const c = connect(t.webSocketDebuggerUrl);
  await c.ready;
  const send = c.send;
  const ev = async (e, ms = 20000) => { const r = await Promise.race([send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }), new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout')), ms))]); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_ });
  await sleep(2500);

  // 生成真实视频并写入任务 qvR
  const rec = await ev(`(async () => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const ctx = c.getContext('2d');
    const stream = c.captureStream(25);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 400000 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(100);
    for (let f = 0; f < 25; f++) { ctx.fillStyle = f % 2 ? '#e33' : '#222'; ctx.fillRect(0, 0, 128, 128); await new Promise((r) => setTimeout(r, 40)); }
    rec.stop(); await stopped;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const q = indexedDB.open('fitness_pwa', 1);
    const db = await new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    await new Promise((res, rej) => { const tx = db.transaction('tasks','readwrite'); tx.objectStore('tasks').clear(); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    await new Promise((res, rej) => { const tx = db.transaction(['checkins','tasks'],'readwrite'); tx.objectStore('checkins').clear(); tx.objectStore('tasks').put({ id: 'qvR', name: '真实视频', type: 'upload', videoBlob: blob, schedule: { mode: 'daily', perTimes: 1 }, createdAt: Date.now() }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    return 'ok:' + blob.size;
  })()`);
  console.log('record+seed →', rec);
  await send('Page.reload'); await sleep(2400);

  // 打开 qvR 面板
  await ev(`(() => { const s = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === '真实视频'); const b = [...s.closest('div.rounded-xl2').querySelectorAll('button')].find(x => x.textContent.trim() === '播放视频'); b.click(); return true; })()`);
  await sleep(800);
  const before = await ev(`(async () => { const all = await new Promise((res, rej) => { const q = indexedDB.open('fitness_pwa',1); q.onsuccess = () => { const d = q.result; const g = d.transaction('checkins','readonly').objectStore('checkins').getAll(); g.onsuccess = () => res(g.result); }; }); return all.filter((x) => x.taskId === 'qvR').length; })()`);

  // 真实播放到结束（不派发任何合成事件）
  const play = await ev(`(async () => {
    const v = document.querySelector('video'); if (!v) return 'no-video';
    v.muted = true;
    if (v.readyState < 2) await new Promise((res) => { const on = () => { v.removeEventListener('canplay', on); res(); }; v.addEventListener('canplay', on); setTimeout(on, 3000); });
    try { v.currentTime = 0; } catch (e) {}
    const pr = await Promise.race([v.play().then(() => 'played').catch((e) => 'rejected:' + e.name), new Promise((r) => setTimeout(() => r('play-pending'), 3000))]);
    if (pr !== 'played') return pr;
    const ended = await new Promise((res) => { v.addEventListener('ended', () => res('ended')); setTimeout(() => res('ended-timeout'), 8000); });
    return ended;
  })()`, 20000);
  await sleep(700);
  const after = await ev(`(async () => { const all = await new Promise((res, rej) => { const q = indexedDB.open('fitness_pwa',1); q.onsuccess = () => { const d = q.result; const g = d.transaction('checkins','readonly').objectStore('checkins').getAll(); g.onsuccess = () => res(g.result); }; }); return all.filter((x) => x.taskId === 'qvR').length; })()`);
  const st = await ev(`(() => { const p = document.querySelector('div.fixed.inset-0.z-50'); const b = [...p.querySelectorAll('button')].find((x) => ['标记完成','再来一次','已打卡 ✓'].includes(x.textContent.trim())); return { text: b.textContent.trim(), disabled: b.disabled }; })()`);

  const pass = play === 'ended' && after === before + 1 && st.text === '已打卡 ✓' && st.disabled === true;
  console.log(JSON.stringify({ play, before, after, st, pass }, null, 2));
  console.log(pass ? '\n[PASS] 真实视频播放到结束触发真实打卡' : '\n[FAIL] 真实 ended→打卡 链路未通过');
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error('PROBE ERROR', e.message);
  process.exitCode = 2;
} finally {
  child.kill();
}
