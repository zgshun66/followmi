// 探针：headless Edge 能否播放 MediaRecorder 生成的 webm 并触发真实 ended（隔离环境能力）。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9375;
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP || '.'}/qa-video-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });

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
  await send('Page.navigate', { url: 'data:text/html,<body>probe</body>' });
  await sleep(500);

  const out = await ev(`(async () => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const stream = c.captureStream(25);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 400000 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(100);
    for (let f = 0; f < 25; f++) { ctx.fillStyle = f % 2 ? '#e33' : '#222'; ctx.fillRect(0, 0, 128, 128); await new Promise((r) => setTimeout(r, 40)); }
    rec.stop(); await stopped;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video'); v.src = url; v.muted = true; v.playsInline = true;
    document.body.appendChild(v);
    const info = { size: blob.size, mime, readyState: v.readyState, duration: v.duration };
    const evt = await new Promise((res) => {
      const done = (name) => { res(name); };
      v.addEventListener('loadedmetadata', () => done('loadedmetadata'));
      v.addEventListener('canplay', () => done('canplay'));
      v.addEventListener('error', () => done('error:' + (v.error && v.error.message)));
      setTimeout(() => done('no-evt'), 4000);
    });
    let playRes = 'n/a';
    try { playRes = await Promise.race([v.play().then(() => 'played').catch((e) => 'rejected:' + e.name), new Promise((r) => setTimeout(() => r('play-pending'), 3000))]); } catch (e) { playRes = 'throw:' + e.message; }
    const ended = await new Promise((res) => { v.addEventListener('ended', () => res('ended')); setTimeout(() => res('ended-timeout'), 6000); });
    return { info, evt, playRes, ended, duration: v.duration, readyState: v.readyState };
  })()`, 25000);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('PROBE ERROR', e.message);
} finally {
  child.kill();
}
