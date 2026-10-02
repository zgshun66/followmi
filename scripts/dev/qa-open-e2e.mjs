// 端到端探针：非 standalone 下点击「打开原链接」，检验 openExternal 是否在「新开标签」之外
// 还把**当前页**导航走了（源于 window.open(...,'noopener,noreferrer') 返回 null 触发兜底）。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9373;
const URL_ = process.argv[2] || 'http://127.0.0.1:5199/';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-popup-blocking', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP || '.'}/qa-opene2e-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });

async function ready() { for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch {} await sleep(250); } throw new Error('no devtools'); }
function connect(u) { const ws = new WebSocket(u); let id = 0; const p = new Map(); const rdy = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', (e) => rej(new Error(String(e)))); }); ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id != null && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result); } }); return { ready: rdy, send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; p.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); }) }; }

try {
  await ready();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const c = connect(t.webSocketDebuggerUrl);
  await c.ready;
  const send = c.send;
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable'); await send('Target.setDiscoverTargets', { discover: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_ });
  await sleep(2500);
  await ev(`(async()=>{const q=indexedDB.open('fitness_pwa',1);q.onupgradeneeded=()=>{const db=q.result;for(const s of ['tasks','checkins','metrics','bodyEntries'])if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id'});};const db=await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});const tx=db.transaction('tasks','readwrite');tx.objectStore('tasks').put({id:'ql3',name:'三次外链',type:'link',linkUrl:'#qatest',schedule:{mode:'daily',perTimes:3},createdAt:Date.now()});await new Promise((r)=>{tx.oncomplete=r;});return 'ok';})()`);
  await send('Page.reload'); await sleep(2300);
  await ev(`(()=>{const s=[...document.querySelectorAll('span')].find(x=>x.textContent.trim()==='三次外链');const b=[...s.closest('div.rounded-xl2').querySelectorAll('button')].find(x=>x.textContent.trim()==='打开 / 播放');b.click();return true;})()`);
  await sleep(600);

  const countTargets = async () => (await send('Target.getTargets')).targetInfos.filter((x) => x.type === 'page').length;
  const before = await countTargets();
  const hrefBefore = await ev(`window.location.href`);
  const isStandalone = await ev(`(typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true`);
  const rect = await ev(`(()=>{const p=document.querySelector('div.fixed.inset-0.z-50');const b=[...p.querySelectorAll('button')].find(x=>x.textContent.trim()==='打开原链接');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await sleep(800);
  const after = await countTargets();
  const hrefAfter = await ev(`window.location.href`);

  const openedNewTab = after > before;
  const currentNavigated = hrefAfter !== hrefBefore;
  console.log(JSON.stringify({ isStandalone, before, after, hrefBefore, hrefAfter, openedNewTab, currentNavigated }, null, 2));
  console.log('');
  if (currentNavigated) {
    console.log('[BUG 确认] 非 standalone 点击「打开原链接」后，当前页被导航走（' + hrefBefore + ' → ' + hrefAfter + '）。');
    console.log('  期望：仅新开标签，当前 follow咪 页面保持不动。');
  } else {
    console.log('[未见 Bug] 当前页未被导航。openedNewTab=' + openedNewTab);
  }
} catch (e) {
  console.error('PROBE ERROR', e.message);
} finally {
  child.kill();
}
