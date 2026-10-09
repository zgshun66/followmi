// 聚焦探针：busy 防连点在「同 tick 连点 / 间隔 150ms / 真实鼠标连点」下的行为。
// 用于判定 C3 失败是源码 Bug 还是测试脚本问题。可在新旧构建上分别跑。
// 用法：node scripts/dev/qa-dbl.mjs <url> <tag>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.QA_PORT || 9381);
const URL_ = process.argv[2] || 'http://127.0.0.1:5199/';
const TAG = process.argv[3] || 'build';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const previewDir = path.resolve(__dirname, '..', '..', '..', '.preview');
fs.mkdirSync(previewDir, { recursive: true });
const profile = path.join(previewDir, `qa-dbl-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });

const child = spawn(EDGE, ['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--hide-scrollbars',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'about:blank'], { stdio: 'ignore' });

async function waitForDevtools() { for (let i=0;i<80;i++){ try { if((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch {} await sleep(250);} throw new Error('no devtools'); }
function connect(u){ const ws=new WebSocket(u); let id=0; const p=new Map(); const rdy=new Promise((res,rej)=>{ws.addEventListener('open',()=>res());ws.addEventListener('error',(e)=>rej(new Error(String(e))));}); ws.addEventListener('message',(ev)=>{const m=JSON.parse(ev.data); if(m.id!=null&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.reject(new Error(JSON.stringify(m.error))):q.resolve(m.result);}}); return {ready:rdy,send:(method,params={})=>new Promise((res,rej)=>{const i=++id;p.set(i,{resolve:res,reject:rej});ws.send(JSON.stringify({id:i,method,params}));})}; }

let send;
async function ev(expr,label='eval'){ const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails) throw new Error(`${label} 抛异常: `+JSON.stringify(r.exceptionDetails)); return r.result.value; }

const TK = `window.__q={sleep:(ms)=>new Promise(r=>setTimeout(r,ms)),panel:()=>document.querySelector('div.fixed.inset-0.z-50'),mainBtn:()=>{const p=window.__q.panel();if(!p)return null;return [...p.querySelectorAll('button')].find(b=>['标记完成','再来一次','已打卡 ✓'].includes((b.textContent||'').trim()))||null;},mainState:()=>{const b=window.__q.mainBtn();return b?{text:(b.textContent||'').trim(),disabled:b.disabled}:null;},openTask:(n,t)=>{const s=[...document.querySelectorAll('span')].find(x=>x.textContent.trim()===n);if(!s)return false;const c=s.closest('div.rounded-xl2');if(!c)return false;const b=[...c.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===t);if(!b)return false;b.click();return true;},count:(id)=>new Promise((res)=>{const q=indexedDB.open('fitness_pwa',1);q.onsuccess=()=>{const g=q.result.transaction('checkins','readonly').objectStore('checkins').getAll();g.onsuccess=()=>res(g.result.filter(c=>c.taskId===id).length);};}),close:()=>{const p=window.__q.panel();if(!p)return false;const b=[...p.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='关闭');if(b)b.click();return true;}};'q-ready';`;

const SEED = `(async()=>{const open=()=>new Promise((res,rej)=>{const q=indexedDB.open('fitness_pwa',1);q.onupgradeneeded=()=>{const db=q.result;for(const s of ['tasks','checkins','metrics','bodyEntries'])if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id'});};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});const db=await open();const put=(s,rows)=>new Promise((res,rej)=>{const tx=db.transaction(s,'readwrite');for(const r of rows)tx.objectStore(s).put(r);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});for(const s of ['tasks','checkins'])await new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=()=>r();});const blob=new Blob([new Uint8Array([26,69,223,163])],{type:'video/webm'});await put('tasks',[{id:'dv3',name:'连点视频',type:'upload',videoBlob:blob,schedule:{mode:'daily',perTimes:3},createdAt:Date.now()}]);return 'seeded';})()`;
const CLEAR = `(async()=>{const q=indexedDB.open('fitness_pwa',1);const db=await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});await new Promise(r=>{const tx=db.transaction('checkins','readwrite');tx.objectStore('checkins').clear();tx.oncomplete=()=>r();});return 'cleared';})()`;

const out = {};
try {
  await waitForDevtools();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const c = connect(t.webSocketDebuggerUrl); await c.ready; send = c.send;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await send('Page.navigate',{url:URL_}); await sleep(2500);
  await ev(TK,'tk'); await ev(SEED,'seed');
  await send('Page.reload'); await sleep(2200); await ev(TK,'tk2');

  const openPanel = async () => { await ev(CLEAR,'clear'); await send('Page.reload'); await sleep(2000); await ev(TK,'tk3'); await ev(`window.__q.openTask('连点视频','播放视频')`,'open'); await sleep(450); };

  // 1) 同 tick：同一按钮引用连点两次
  await openPanel();
  out.sameTick = await ev(`(()=>{ const b=window.__q.mainBtn(); window.__b=b; const pre=window.__q.mainState(); b.click(); const afterFirst={disabled:b.disabled, text:(b.textContent||'').trim()}; b.click(); const afterSecond={disabled:b.disabled}; return {pre, afterFirst, afterSecond}; })()`,'sameTick-sync');
  await sleep(60);
  out.sameTick.count60 = await ev(`window.__q.count('dv3')`);
  await sleep(1000);
  out.sameTick.count1060 = await ev(`window.__q.count('dv3')`);
  out.sameTick.stateAfter = await ev(`window.__q.mainState()`);
  await ev(`window.__q.close()`,'close'); await sleep(200);

  // 2) 间隔 150ms：同一按钮引用
  await openPanel();
  await ev(`window.__b=window.__q.mainBtn(); window.__b.click(); 'c1'`,'c1');
  await sleep(150);
  out.gap150_click2 = await ev(`(()=>{const st=window.__q.mainState(); window.__b.click(); return {stateBefore2:st};})()`,'c2');
  await sleep(1000);
  out.gap150_count = await ev(`window.__q.count('dv3')`);
  await ev(`window.__q.close()`,'close'); await sleep(200);

  // 3) 真实鼠标事件连点（间隔 150ms）
  await openPanel();
  const rect = await ev(`(()=>{const b=window.__q.mainBtn();const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,'rect');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await sleep(150);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await sleep(1000);
  out.realMouse150_count = await ev(`window.__q.count('dv3')`);
  await ev(`window.__q.close()`,'close'); await sleep(200);

  console.log(`[${TAG}] ` + JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(previewDir, `qa-dbl-${TAG}.json`), JSON.stringify(out, null, 2));
} catch (e) {
  console.error(`[${TAG}] PROBE ERROR`, e.stack || e.message);
  process.exitCode = 2;
} finally { child.kill(); }
