// 探针：验证 window.open(url,'_blank','noopener,noreferrer') 在真实 Chromium 下的返回值。
// 若返回 null，则 openExternal 的 `if (!win) location.href = url` 兜底会在**每次正常点击**都触发，
// 导致「新开标签」之外还额外把当前页导航走。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9371;
const URL_ = process.argv[2] || 'http://127.0.0.1:5199/';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-popup-blocking', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP || '.'}/qa-noopener-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });

async function ready() { for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch {} await sleep(250); } throw new Error('no devtools'); }
function connect(u) { const ws = new WebSocket(u); let id = 0; const p = new Map(); const rdy = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', (e) => rej(new Error(String(e)))); }); ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id != null && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result); } }); return { ready: rdy, send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; p.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); }) }; }

try {
  await ready();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const c = connect(t.webSocketDebuggerUrl);
  await c.ready;
  const send = c.send;
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL_ });
  await sleep(2000);

  // 注入一个测试按钮，其 onclick 真调用 window.open 三种特征串并记录返回值
  await ev(`(() => {
    const b = document.createElement('button'); b.id = '__qaopen'; b.textContent = 'opentest';
    b.style.cssText = 'position:fixed;left:5px;top:5px;z-index:99999;width:200px;height:40px';
    b.onclick = () => {
      window.__r = {};
      try { const w1 = window.open('about:blank?noop', '_blank', 'noopener,noreferrer'); window.__r.noopener = (w1 === null) ? 'null' : typeof w1; } catch (e) { window.__r.noopener = 'throw:' + e.message; }
      try { const w2 = window.open('about:blank?plain', '_blank'); window.__r.plain = (w2 === null) ? 'null' : typeof w2; } catch (e) { window.__r.plain = 'throw:' + e.message; }
    };
    document.body.appendChild(b); return true;
  })()`);

  const rect = await ev(`(() => { const r = document.getElementById('__qaopen').getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`);
  // 可信用户手势点击（绕过弹窗拦截）
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await sleep(500);
  const res = await ev(`window.__r`);
  console.log('window.open 返回值：', JSON.stringify(res));
  console.log('noopener,noreferrer → ' + res.noopener + '   （若为 null：openExternal 兜底会在正常点击时误触发）');
  console.log('（对照）无特征串     → ' + res.plain);
} catch (e) {
  console.error('PROBE ERROR', e.message);
} finally {
  child.kill();
}
