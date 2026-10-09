// QA 第二轮回归：LinkPlayer 完成态按钮文案（去原站再练 vs 再来一次）+ 提示语一致性 + 行为不回归。
//
// 手段：无头 Edge + CDP，真实渲染读 DOM 文本、真实点击、真实 IndexedDB 计数。
// 用法：node scripts/dev/qa-labels.mjs [url]   （默认 http://127.0.0.1:5199/）
// 退出码 0=全部通过。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.QA_PORT || 9401);
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
// 从提示语里抽出所有「...」引用，要求它们都是面板里真实存在的按钮文案（不得自相矛盾）
function quotedTokens(text) { return [...String(text || '').matchAll(/「([^」]+)」/g)].map((m) => m[1]); }
function tokensConsistent(hint, buttonTexts) {
  const toks = quotedTokens(hint);
  const bad = toks.filter((t) => !buttonTexts.includes(t));
  return { toks, bad, ok: bad.length === 0 };
}

const profile = path.join(previewDir, `qa-labels-profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const child = spawn(EDGE, ['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-popup-blocking','--autoplay-policy=no-user-gesture-required','--hide-scrollbars',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'about:blank'], { stdio: 'ignore' });

async function waitForDevtools(){ for(let i=0;i<80;i++){ try{ if((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; }catch{} await sleep(250);} throw new Error('no devtools'); }
function connect(u){ const ws=new WebSocket(u); let id=0; const p=new Map(); const rdy=new Promise((res,rej)=>{ws.addEventListener('open',()=>res());ws.addEventListener('error',(e)=>rej(new Error(String(e))));}); ws.addEventListener('message',(ev)=>{const m=JSON.parse(ev.data); if(m.id!=null&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.reject(new Error(JSON.stringify(m.error))):q.resolve(m.result);}}); return {ready:rdy,send:(method,params={})=>new Promise((res,rej)=>{const i=++id;p.set(i,{resolve:res,reject:rej});ws.send(JSON.stringify({id:i,method,params}));})}; }

let send;
async function ev(expr,label='eval'){ const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails) throw new Error(`${label} 抛异常: `+JSON.stringify(r.exceptionDetails)); return r.result.value; }
async function waitFor(expr, timeout=4000, interval=70){ const t0=Date.now(); while(Date.now()-t0<timeout){ const v=await ev(expr,'waitFor'); if(v) return v; await sleep(interval);} return null; }

const TK = `window.__qa={
  sleep:(ms)=>new Promise(r=>setTimeout(r,ms)),
  panel:()=>document.querySelector('div.fixed.inset-0.z-50'),
  panelOpen:()=>!!window.__qa.panel(),
  footer:()=>{const p=window.__qa.panel();return p?p.lastElementChild:null;},
  mainText:()=>{const f=window.__qa.footer();const b=f&&f.querySelector('button');return b?(b.textContent||'').trim():null;},
  mainDisabled:()=>{const f=window.__qa.footer();const b=f&&f.querySelector('button');return b?b.disabled:null;},
  footerHint:()=>{const f=window.__qa.footer();const p=f&&f.querySelector('p');return p?(p.textContent||'').trim():null;},
  btnTexts:()=>{const p=window.__qa.panel();if(!p)return null;return [...p.querySelectorAll('button')].map(b=>(b.textContent||'').trim());},
  clickMain:()=>{const f=window.__qa.footer();const b=f&&f.querySelector('button');if(!b)return false;b.click();return true;},
  clickPanelText:(t)=>{const p=window.__qa.panel();if(!p)return false;const b=[...p.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===t);if(!b)return false;b.click();return true;},
  openTask:(n,t)=>{const s=[...document.querySelectorAll('span')].find(x=>x.textContent.trim()===n);if(!s)return false;const c=s.closest('div.rounded-xl2');if(!c)return false;const b=[...c.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===t);if(!b)return false;b.click();return true;},
  cardCheckinDisabled:(n)=>{const s=[...document.querySelectorAll('span')].find(x=>x.textContent.trim()===n);if(!s)return null;const c=s.closest('div.rounded-xl2');if(!c)return null;const b=[...c.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='打卡');return b?b.disabled:null;},
  iframe:()=>document.querySelector('iframe'),
  count:(id)=>new Promise((res)=>{const q=indexedDB.open('fitness_pwa',1);q.onsuccess=()=>{const g=q.result.transaction('checkins','readonly').objectStore('checkins').getAll();g.onsuccess=()=>res(g.result.filter(c=>c.taskId===id).length);};}),
  close:()=>{const p=window.__qa.panel();if(!p)return false;const b=[...p.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='关闭');if(b)b.click();return true;},
};'tk-ready';`;

const SEED = `(async()=>{
  const open=()=>new Promise((res,rej)=>{const q=indexedDB.open('fitness_pwa',1);q.onupgradeneeded=()=>{const db=q.result;for(const s of ['tasks','checkins','metrics','bodyEntries'])if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id'});};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
  const db=await open();
  const put=(s,rows)=>new Promise((res,rej)=>{const tx=db.transaction(s,'readwrite');for(const r of rows)tx.objectStore(s).put(r);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});
  for(const s of ['tasks','checkins'])await new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=()=>r();});
  const now=Date.now();
  await put('tasks',[
    {id:'embed2',name:'嵌入两次',type:'link',embedHtml:'<iframe id="emb" src="about:blank" style="width:100%;height:200px"></iframe>',schedule:{mode:'daily',perTimes:2},createdAt:now},
    {id:'link2',name:'外链两次',type:'link',linkUrl:'#qaext',schedule:{mode:'daily',perTimes:2},createdAt:now},
    {id:'embed1',name:'嵌入一次',type:'link',embedHtml:'<iframe id="emb" src="about:blank" style="width:100%;height:200px"></iframe>',schedule:{mode:'daily',perTimes:1},createdAt:now},
    {id:'link1',name:'外链一次',type:'link',linkUrl:'#qaext',schedule:{mode:'daily',perTimes:1},createdAt:now},
  ]);
  return 'seeded';
})()`;
const CLEAR = `(async()=>{const q=indexedDB.open('fitness_pwa',1);const db=await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});await new Promise(r=>{const tx=db.transaction('checkins','readwrite');tx.objectStore('checkins').clear();tx.oncomplete=()=>r();});return 'cleared';})()`;

const q = () => ev(TK, 'tk');
async function reload(ms=2100){ await send('Page.reload'); await sleep(ms); await q(); }
async function readState(){ const [text,disabled,hint,btns]=await Promise.all([ev('window.__qa.mainText()'),ev('window.__qa.mainDisabled()'),ev('window.__qa.footerHint()'),ev('window.__qa.btnTexts()')]); return {text,disabled,hint,btns}; }

try {
  await waitForDevtools();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const c = connect(t.webSocketDebuggerUrl); await c.ready; send = c.send;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await send('Page.navigate',{url:URL_}); await sleep(2500);
  await q(); await ev(SEED,'seed'); await reload();

  /* ---------- 状态1：!started && !finished ---------- */
  console.log('\n===== 状态1：未开始 / 未完成 =====');
  for (const [name, kind] of [['嵌入两次','embed'],['外链两次','link']]) {
    await ev(CLEAR,'clear'); await reload();
    await ev(`window.__qa.openTask('${name}','打开 / 播放')`,'open'); await sleep(450);
    const s = await readState();
    const cons = tokensConsistent(s.hint, s.btns);
    check(`S1[${kind}] !started&&!finished 主按钮=「标记完成」`, s.text === '标记完成', `text=${s.text}`);
    check(`S1[${kind}] 提示语=今日还差 2 次`, /今日还差\s*2\s*次/.test(s.hint || ''), `hint=${s.hint}`);
    check(`S1[${kind}] 提示语按钮名与真实按钮一致`, cons.ok, `tokens=${JSON.stringify(cons.toks)} bad=${JSON.stringify(cons.bad)}`);
    await ev('window.__qa.close()'); await sleep(200);
  }

  /* ---------- 状态2：started && !finished ---------- */
  console.log('\n===== 状态2：已开始 / 未完成 =====');
  for (const [name, kind] of [['嵌入两次','embed'],['外链两次','link']]) {
    await ev(CLEAR,'clear'); await reload();
    await ev(`window.__qa.openTask('${name}','打开 / 播放')`,'open'); await sleep(450);
    await ev('window.__qa.clickMain()','click');           // 记 1 次 → remaining 1
    await waitFor(`window.__qa.count('${kind === 'embed' ? 'embed2' : 'link2'}').then(n=>n>=1)`,3000); await sleep(300);
    const s = await readState();
    const cons = tokensConsistent(s.hint, s.btns);
    check(`S2[${kind}] started&&!finished 主按钮=「再来一次」`, s.text === '再来一次', `text=${s.text}`);
    check(`S2[${kind}] 提示语=今日还差 1 次`, /今日还差\s*1\s*次/.test(s.hint || ''), `hint=${s.hint}`);
    check(`S2[${kind}] 提示语按钮名与真实按钮一致`, cons.ok, `tokens=${JSON.stringify(cons.toks)} bad=${JSON.stringify(cons.bad)}`);
    await ev('window.__qa.close()'); await sleep(200);
  }

  /* ---------- 状态3：embed + finished ---------- */
  console.log('\n===== 状态3：有 embed + finished =====');
  await ev(CLEAR,'clear'); await reload();
  await ev(`window.__qa.openTask('嵌入一次','打开 / 播放')`,'open'); await sleep(500);
  const idBefore = await ev(`(()=>{window.__ifr1=window.__qa.iframe();return window.__ifr1?window.__ifr1.getAttribute('id'):null;})()`);
  await ev('window.__qa.clickMain()','mark');            // 标记完成 → finished
  await waitFor(`window.__qa.count('embed1').then(n=>n>=1)`,3000); await sleep(350);
  const s3 = await readState();
  const cons3 = tokensConsistent(s3.hint, s3.btns);
  check('S3a embed+finished 主按钮=「再来一次」', s3.text === '再来一次', `text=${s3.text}`);
  check('S3b 提示语含「再来一次」且不含「去原站再练」', (s3.hint||'').includes('再来一次') && !(s3.hint||'').includes('去原站再练'), `hint=${s3.hint}`);
  check('S3c 提示语按钮名与真实按钮一致（无自相矛盾）', cons3.ok, `tokens=${JSON.stringify(cons3.toks)} bad=${JSON.stringify(cons3.bad)}`);
  check('S3d finished 时主按钮可点（disabled=false）', s3.disabled === false, `disabled=${s3.disabled}`);
  check('S3e 今日页金色「打卡」按钮 finished 时 disabled', (await ev(`window.__qa.cardCheckinDisabled('嵌入一次')`)) === true);
  // 行为：点「再来一次」→ iframe 真重挂、不打卡
  await ev('window.__qa.clickMain()','replay-embed'); await sleep(500);
  const remount = await ev(`(()=>{const a=window.__qa.iframe();return {changed:a!==window.__ifr1,oldDetached:window.__ifr1?!document.contains(window.__ifr1):null};})()`);
  check('S3f 点「再来一次」iframe 真重挂（节点身份变化+旧节点脱离）', remount && remount.changed === true && remount.oldDetached === true, JSON.stringify(remount));
  check('S3g iframe 重挂不打卡（仍 1 条）', (await ev(`window.__qa.count('embed1')`)) === 1, `count=${await ev(`window.__qa.count('embed1')`)}`);
  await ev('window.__qa.close()'); await sleep(200);

  /* ---------- 状态4：纯外链 + finished ---------- */
  console.log('\n===== 状态4：纯外链 + finished =====');
  await ev(CLEAR,'clear'); await reload();
  await ev(`window.__qa.openTask('外链一次','打开 / 播放')`,'open'); await sleep(500);
  await ev('window.__qa.clickMain()','mark');            // 标记完成 → finished
  await waitFor(`window.__qa.count('link1').then(n=>n>=1)`,3000); await sleep(350);
  const s4 = await readState();
  const cons4 = tokensConsistent(s4.hint, s4.btns);
  check('S4a 纯外链+finished 主按钮=「去原站再练」', s4.text === '去原站再练', `text=${s4.text}`);
  check('S4b 提示语含「去原站再练」且不含「再来一次」', (s4.hint||'').includes('去原站再练') && !(s4.hint||'').includes('再来一次'), `hint=${s4.hint}`);
  check('S4c 提示语按钮名与真实按钮一致（无自相矛盾）', cons4.ok, `tokens=${JSON.stringify(cons4.toks)} bad=${JSON.stringify(cons4.bad)}`);
  check('S4d finished 时主按钮可点（disabled=false）', s4.disabled === false, `disabled=${s4.disabled}`);
  check('S4e 今日页金色「打卡」按钮 finished 时 disabled', (await ev(`window.__qa.cardCheckinDisabled('外链一次')`)) === true);
  // 行为：非 standalone 点「去原站再练」→ 只新开标签、当前页不被导航、不打卡
  const hrefBefore = await ev('window.location.href');
  const tBefore = (await send('Target.getTargets')).targetInfos.filter((x) => x.type === 'page').length;
  await ev(`window.__qa.clickPanelText('去原站再练')`,'click-orig'); await sleep(800);
  const tAfter = (await send('Target.getTargets')).targetInfos.filter((x) => x.type === 'page').length;
  const hrefAfter = await ev('window.location.href');
  check('S4f 非 standalone：点「去原站再练」只新开标签，当前页不被导航', hrefAfter === hrefBefore && tAfter > tBefore, `href ${hrefBefore === hrefAfter ? 'same' : 'CHANGED'} targets ${tBefore}→${tAfter}`);
  check('S4g 该操作不打卡（仍 1 条）', (await ev(`window.__qa.count('link1')`)) === 1, `count=${await ev(`window.__qa.count('link1')`)}`);
  await ev('window.__qa.close()'); await sleep(200);

  /* ---------- 汇总 ---------- */
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n===== 汇总：${passed}/${results.length} 通过 =====`);
  fs.writeFileSync(path.join(previewDir, 'qa-labels-results.json'), JSON.stringify(results, null, 2));
  process.exitCode = passed === results.length ? 0 : 1;
} catch (e) { console.error('PROBE ERROR', e.stack || e.message); process.exitCode = 2; }
finally { child.kill(); }
