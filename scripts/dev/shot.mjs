// 开发辅助：用 CDP 驱动无头 Edge 截图（真实计时器，可先注入示例数据）。
//
// 用途：改版后核对界面（新头部、日历密度、图标观感等），以及验证
//      「IndexedDB 不可用时的降级」这类只在特定环境暴露的问题。
//
// 用法：
//   node scripts/dev/shot.mjs <url> <out.png> [w] [h] [waitMs] [seedFile] [preJs]
// 例：
//   node scripts/dev/shot.mjs http://127.0.0.1:5173 ui-today.png 430 1000 3000 scripts/dev/seed.js
// 截图输出到项目外的 ../.preview/（不进构建产物、不进版本库）。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..');
const outRoot = path.resolve(root, '..', '.preview');

const [, , url, outName, wArg, hArg, waitArg, seedArg, preJsArg] = process.argv;
const width = Number(wArg || 430);
const height = Number(hArg || 932);
const waitMs = Number(waitArg || 3000);
const outFile = path.join(outRoot, outName);
const seedFile = seedArg ? path.join(root, seedArg) : null;

fs.mkdirSync(outRoot, { recursive: true });
const profile = path.join(outRoot, 'edge-profile');
fs.mkdirSync(profile, { recursive: true });

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {
      /* 还没起来 */
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

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const { send, ready } = connect(target.webSocketDebuggerUrl);
  await ready;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await send('Page.navigate', { url });
  await sleep(waitMs);

  if (seedFile) {
    const seed = fs.readFileSync(seedFile, 'utf8');
    const res = await send('Runtime.evaluate', { expression: seed, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error('注入数据失败: ' + JSON.stringify(res.exceptionDetails));
    console.log('seed →', JSON.stringify(res.result?.value ?? null));
    await send('Page.reload');
    await sleep(waitMs);
  }

  if (preJsArg) {
    const res = await send('Runtime.evaluate', { expression: preJsArg, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error('preJs 失败: ' + JSON.stringify(res.exceptionDetails));
    console.log('preJs →', JSON.stringify(res.result?.value ?? null));
    await sleep(Math.min(1500, waitMs));
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log('screenshot →', outFile);
} finally {
  child.kill();
}
