// 一次性探针：判定「只读 input 聚焦自动全选」失败是源码问题还是无头环境问题。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9361;
const URL_ = process.argv[2] || 'http://127.0.0.1:5199/';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP || '.'}/qa-probe-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });

async function ready() { for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch {} await sleep(250); } throw new Error('no devtools'); }
function connect(u) { const ws = new WebSocket(u); let id = 0; const p = new Map(); const rdy = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', (e) => rej(new Error(String(e)))); }); ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id != null && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result); } }); return { ws, ready: rdy, send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; p.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); }) }; }

try {
  await ready();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const c = connect(t.webSocketDebuggerUrl);
  await c.ready;
  const send = c.send;
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_ });
  await sleep(2500);
  // seed link task
  await ev(`(async()=>{const q=indexedDB.open('fitness_pwa',1);q.onupgradeneeded=()=>{const db=q.result;for(const s of ['tasks','checkins','metrics','bodyEntries'])if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id'});};const db=await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});const tx=db.transaction('tasks','readwrite');tx.objectStore('tasks').put({id:'ql3',name:'三次外链',type:'link',linkUrl:'#qatest',schedule:{mode:'daily',perTimes:3},createdAt:Date.now()});await new Promise((r)=>{tx.oncomplete=r;});return 'ok';})()`);
  await send('Page.reload'); await sleep(2300);
  // open panel
  await ev(`(()=>{const s=[...document.querySelectorAll('span')].find(x=>x.textContent.trim()==='三次外链');const b=[...s.closest('div.rounded-xl2').querySelectorAll('button')].find(x=>x.textContent.trim()==='打开 / 播放');b.click();return true;})()`);
  await sleep(500);

  const out = {};
  // baseline DOM
  out.dom = await ev(`(()=>{const i=document.querySelector('div.fixed.inset-0.z-50 input');const cs=getComputedStyle(i);return {tag:i.tagName,type:i.type,readOnly:i.readOnly,userSelect:cs.userSelect,webkitUserSelect:cs.webkitUserSelect,value:i.value};})()`);
  // exp1: native focus listener + focus()
  out.exp1 = await ev(`(()=>{const i=document.querySelector('div.fixed.inset-0.z-50 input');window.__nf=0;const h=()=>{window.__nf++;};i.addEventListener('focus',h);i.blur();i.focus();i.removeEventListener('focus',h);return {nativeFocusFired:window.__nf,s:i.selectionStart,e:i.selectionEnd,len:i.value.length};})()`);
  // exp2: programmatic setSelectionRange baseline
  out.exp2 = await ev(`(()=>{const i=document.querySelector('div.fixed.inset-0.z-50 input');i.blur();i.setSelectionRange(0,i.value.length);return {s:i.selectionStart,e:i.selectionEnd};})()`);
  // exp3: select() baseline
  out.exp3 = await ev(`(()=>{const i=document.querySelector('div.fixed.inset-0.z-50 input');i.blur();i.select();return {s:i.selectionStart,e:i.selectionEnd};})()`);
  // exp4: dispatch focus event synthetically
  out.exp4 = await ev(`(()=>{const i=document.querySelector('div.fixed.inset-0.z-50 input');i.blur();i.dispatchEvent(new FocusEvent('focus',{bubbles:false}));return {s:i.selectionStart,e:i.selectionEnd};})()`);
  // exp5: React onFocus actually present? inspect fiber props
  out.exp5 = await ev(`(()=>{const i=document.querySelector('div.fixed.inset-0.z-50 input');const k=Object.keys(i).find(k=>k.startsWith('__reactProps'));const props=k?i[k]:null;return {hasReactProps:!!props,onFocusType:props?typeof props.onFocus:null,class:(i.className||'').slice(0,40)};})()`);
  // exp6: trusted click via CDP on input center
  const rect = await ev(`(()=>{const i=document.querySelector('div.fixed.inset-0.z-50 input');const r=i.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await sleep(200);
  out.exp6 = await ev(`(()=>{const i=document.querySelector('div.fixed.inset-0.z-50 input');return {s:i.selectionStart,e:i.selectionEnd,len:i.value.length,focused:document.activeElement===i};})()`);

  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('PROBE ERROR', e.message);
} finally {
  child.kill();
}
