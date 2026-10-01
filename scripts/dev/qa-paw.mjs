// QA（严过关）独立验证脚本 —— 猫爪印「桃形掌垫」几何，不依赖工程师的 paw-check/paw-pixels。
//
// 与工程师脚本的方法差异（刻意规避"复读结论"）：
//   1) 直接在 **页面真正消费的产物** src/components/CatShape.ts 的 PAW_PATH 上做像素断言，
//      而不是只测脚本里的多边形；
//   2) 余隙用 **精确欧氏距离变换（Felzenszwalb 1D 可分离 EDT）** 在二值栅格上量，
//      而不是「顶点到对边」的解析最近距离（换一种数学手段互相印证）；
//   3) 桃形用 **逐行墨色宽度剖面** 判定「上尖下圆」。
//
// 用法：node scripts/dev/qa-paw.mjs      （退出码 0=全通过，1=有断言失败）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { fitToBox, renderPng } from '../raster.mjs';
import { buildPaw, pawPolys } from '../paw-shape.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const previewDir = path.resolve(root, '..', '.preview');
fs.mkdirSync(previewDir, { recursive: true });

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

/* ---------------- 基础光栅工具 ---------------- */

/** 渲染成灰度（0=墨/前景，255=背景）。ss=1 时无抗锯齿，得到硬二值掩膜。 */
function renderGray(polys, size, ss, keepWinding = true) {
  const buf = renderPng({ polys, size, bg: WHITE, fg: BLACK, ss, keepWinding });
  const png = PNG.sync.read(buf);
  const g = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) g[i] = png.data[i * 4];
  return g;
}

/** 4 邻域 flood fill：从图像四边把「外部背景」标出，剩下没被标到的背景像素 = 内孔。 */
function countEnclosedHoles(g, size, region = null) {
  const outside = new Uint8Array(size * size);
  const stack = [];
  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = y * size + x;
    if (outside[i] || g[i] < 128) return; // 已标记 / 是墨色 → 不扩散
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < size; x++) {
    tryPush(x, 0);
    tryPush(x, size - 1);
  }
  for (let y = 0; y < size; y++) {
    tryPush(0, y);
    tryPush(size - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % size;
    const y = (i - x) / size;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }
  let holes = 0;
  const holePix = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (outside[i] || g[i] < 128) continue;
      if (region && !(x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1)) continue;
      holes += 1;
      if (holePix.length < 8) holePix.push([x, y]);
    }
  }
  return { holes, holePix };
}

/* ---------------- 精确欧氏距离变换 ---------------- */

/** 1D 平方距离变换（Felzenszwalb & Huttenlocher 2012）。 */
function dt1d(f, n) {
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    while (s <= z[k]) {
      k -= 1;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k += 1;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  return d;
}

/** 精确平方欧氏距离变换：返回每个像素到最近 ink 像素的平方距离。 */
function edtSquared(ink, size) {
  const INF = 1e18;
  const f = new Float64Array(size);
  const tmp = new Float64Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) f[y] = ink[y * size + x] ? 0 : INF;
    const dd = dt1d(f, size);
    for (let y = 0; y < size; y++) tmp[y * size + x] = dd[y];
  }
  const out = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) f[x] = tmp[y * size + x];
    const dd = dt1d(f, size);
    for (let x = 0; x < size; x++) out[y * size + x] = dd[x];
  }
  return out;
}

/**
 * 两个多边形集合之间的最小栅格距离（单位：像素）。
 * 在 K 倍缩放的 64 空间里光栅化（坐标 × K），再用 EDT 量。
 */
function polySetGapPx(A, B, size, K) {
  const scale = (polys) => polys.map((p) => p.map((pt) => ({ x: pt.x * K, y: pt.y * K })));
  const gA = renderGray(scale(A), size, 1, true);
  const gB = renderGray(scale(B), size, 1, true);
  const inkA = new Uint8Array(size * size);
  const inkB = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    inkA[i] = gA[i] < 128 ? 1 : 0;
    inkB[i] = gB[i] < 128 ? 1 : 0;
  }
  const dA = edtSquared(inkA, size);
  let min2 = Infinity;
  for (let i = 0; i < size * size; i++) {
    if (inkB[i] && dA[i] < min2) min2 = dA[i];
  }
  return Math.sqrt(min2);
}

/* ---------------- 逐行宽度剖面 ---------------- */

function widthProfile(g, size) {
  const widths = new Array(size).fill(0);
  let top = -1;
  let bot = -1;
  let maxW = 0;
  let maxY = -1;
  for (let y = 0; y < size; y++) {
    let c = 0;
    for (let x = 0; x < size; x++) if (g[y * size + x] < 128) c += 1;
    widths[y] = c;
    if (c > 0) {
      if (top < 0) top = y;
      bot = y;
    }
    if (c > maxW) {
      maxW = c;
      maxY = y;
    }
  }
  return { widths, top, bot, maxW, maxY };
}

/* ---------------- 解析 CatShape.ts 里的 PAW_PATH ---------------- */
function parsePathD(d) {
  // toSvgPath 输出 "Mx yLx yLx yZ" 连成一串，按 Z 切开即各子路径
  const polys = [];
  for (const chunk of d.split('Z')) {
    const s = chunk.trim();
    if (!s) continue;
    const body = s.replace(/^M/, '');
    const pts = body
      .split('L')
      .filter(Boolean)
      .map((seg) => {
        const [x, y] = seg.trim().split(/\s+/).map(Number);
        return { x, y };
      });
    if (pts.length) polys.push(pts);
  }
  return polys;
}

// =====================================================================
console.log('===== 0) 取页面真正消费的产物：CatShape.ts 的 PAW_PATH =====');
const shapeSrc = fs.readFileSync(path.join(root, 'src/components/CatShape.ts'), 'utf8');
const m = shapeSrc.match(/PAW_PATH\s*=\s*'([^']+)'/s);
if (!m) {
  console.log('FAIL  未能从 CatShape.ts 解析 PAW_PATH');
  process.exit(2);
}
const pawPathPolys = parsePathD(m[1]);
console.log(`PAW_PATH 子路径数 = ${pawPathPolys.length}（应为 5：4 趾 + 1 掌垫）`);
check('PAW_PATH 含 5 条子路径（4 趾 + 桃形掌垫）', pawPathPolys.length === 5, `actual=${pawPathPolys.length}`);

// 独立重算 tightPose(pawPolys,512)，与 PAW_PATH 比较，证明产物 = 源码形状
const src64 = pawPolys();
let bMinX = Infinity;
let bMinY = Infinity;
let bMaxX = -Infinity;
let bMaxY = -Infinity;
for (const p of src64)
  for (const pt of p) {
    bMinX = Math.min(bMinX, pt.x);
    bMaxX = Math.max(bMaxX, pt.x);
    bMinY = Math.min(bMinY, pt.y);
    bMaxY = Math.max(bMaxY, pt.y);
  }
const w = bMaxX - bMinX;
const h = bMaxY - bMinY;
const sc = 512 / Math.max(w, h);
const expect512 = src64.map((p) =>
  p.map((pt) => ({ x: (pt.x - bMinX) * sc, y: (pt.y - bMinY) * sc })),
);
// 逐子路径、逐点比较（顺序应一致：normalizeWinding 不重排）
let maxDev = 0;
for (let i = 0; i < pawPathPolys.length; i++) {
  const a = expect512[i];
  const b = pawPathPolys[i];
  if (!a || !b || a.length !== b.length) {
    maxDev = Infinity;
    continue;
  }
  for (let j = 0; j < a.length; j++) {
    maxDev = Math.max(maxDev, Math.hypot(a[j].x - b[j].x, a[j].y - b[j].y));
  }
}
// 逐个顶点匹配可能因起始点旋转而错位，做一个更稳的：每个 PAW 顶点到最近期望顶点距离的最大值
function hausdorffish(A, B) {
  let mx = 0;
  for (const aa of A) {
    let best = Infinity;
    for (const bb of B) best = Math.min(best, Math.hypot(aa.x - bb.x, aa.y - bb.y));
    mx = Math.max(mx, best);
  }
  return mx;
}
let maxDev2 = 0;
for (let i = 0; i < pawPathPolys.length; i++) {
  maxDev2 = Math.max(maxDev2, hausdorffish(pawPathPolys[i], expect512[i]), hausdorffish(expect512[i], pawPathPolys[i]));
}
console.log(`PAW_PATH 与源码形状最大偏差(逐点)=${maxDev === Infinity ? 'N/A' : maxDev.toFixed(4)}  单向Hausdorff=${maxDev2.toFixed(4)} (512空间；坐标取整到1位小数，理论最大偏差=√2·0.05≈0.0707)`);
check('PAW_PATH == scripts/paw-shape.mjs 生成的形状（偏差 ≤0.0707，即纯取整）', maxDev2 <= 0.0708, `hausdorff=${maxDev2.toFixed(4)}`);

// =====================================================================
console.log('\n===== 1) 左右镜像对称（在 PAW_PATH 上） =====');
const SZ = 512;
const centered = fitToBox(pawPathPolys, SZ, 0); // 按包围盒居中
const grayAA = renderGray(centered, SZ, 4, true);
{
  let diffPix = 0;
  let sumAbs = 0;
  let worst = 0;
  const total = SZ * SZ;
  for (let y = 0; y < SZ; y++) {
    for (let x = 0; x < SZ; x++) {
      const a = grayAA[y * SZ + x];
      const b = grayAA[y * SZ + (SZ - 1 - x)];
      const d = Math.abs(a - b);
      sumAbs += d;
      if (d > worst) worst = d;
      if (d > 10) diffPix += 1;
    }
  }
  const frac = (diffPix / total) * 100;
  const meanAbs = sumAbs / total;
  console.log(`镜像不一致像素占比 = ${frac.toFixed(4)}%   平均灰度差 = ${meanAbs.toFixed(4)}/255   最大差 = ${worst}`);
  check(
    '左右镜像对称（不一致像素 <0.5% 且平均灰度差 <1.0）',
    frac < 0.5 && meanAbs < 1.0,
    `diffPix%=${frac.toFixed(4)} meanAbs=${meanAbs.toFixed(4)}`,
  );
}

// =====================================================================
console.log('\n===== 2) 无内部空洞（4 邻域 flood fill） =====');
{
  const SZ2 = 1024;
  const hard = renderGray(fitToBox(pawPathPolys, SZ2, 0), SZ2, 1, true); // 硬二值，无抗锯齿
  const { holes, holePix } = countEnclosedHoles(hard, SZ2);
  console.log(`硬掩膜(1024) 内孔像素数 = ${holes}  样例=${JSON.stringify(holePix)}`);
  check('无内部空洞（硬二值掩膜）', holes === 0, `holes=${holes}`);

  // 掌垫所在下半区单独再查一遍
  const padRegion = { x0: 0, x1: SZ2 - 1, y0: Math.floor(SZ2 * 0.5), y1: SZ2 - 1 };
  const padHoles = countEnclosedHoles(hard, SZ2, padRegion);
  console.log(`掌垫下半区内孔像素数 = ${padHoles.holes}`);
  check('掌垫区域无封闭白色孔洞', padHoles.holes === 0, `holes=${padHoles.holes}`);

  // 抗锯齿版交叉验证
  const { holes: holesAA } = countEnclosedHoles(renderGray(fitToBox(pawPathPolys, 512, 0), 512, 4, true), 512);
  console.log(`抗锯齿掩膜(512,阈值128) 内孔像素数 = ${holesAA}`);
  check('无内部空洞（抗锯齿掩膜交叉验证）', holesAA === 0, `holes=${holesAA}`);
}

// =====================================================================
console.log('\n===== 3) 形状确为桃形（上尖下圆）——逐行墨色宽度 =====');
{
  const pad = buildPaw().pad; // 64 空间掌垫多边形
  const SZp = 512;
  const padMask = renderGray(fitToBox([pad], SZp, 0), SZp, 1, true);
  const { widths, top, bot, maxW, maxY } = widthProfile(padMask, SZp);
  const H = bot - top;
  const at = (f) => widths[Math.min(bot, Math.round(top + f * H))];
  // 小窗口平均，抑制栅格噪声
  const band = (f0, f1) => {
    let s = 0;
    let n = 0;
    for (let y = Math.round(top + f0 * H); y <= Math.round(top + f1 * H); y++) {
      s += widths[y];
      n += 1;
    }
    return s / Math.max(1, n);
  };
  const samples = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 0.95, 1.0].map(
    (f) => `h${(f * 100).toFixed(0)}%=${at(f)}`,
  );
  console.log('逐行宽度采样: ' + samples.join('  '));
  console.log(`掌垫 y∈[${top},${bot}]  高度=${H}  最大宽=${maxW} @ y=${maxY} (h=${(((maxY - top) / H) * 100).toFixed(1)}%)`);
  const wTop = band(0.0, 0.1);
  const wMid = band(0.45, 0.6);
  const wBot = band(0.9, 1.0);
  const wTop20 = band(0.0, 0.2);
  const wBot20 = band(0.8, 1.0);
  console.log(`平均宽度: 顶10%=${wTop.toFixed(1)}  中=${wMid.toFixed(1)}  底10%=${wBot.toFixed(1)}  顶20%=${wTop20.toFixed(1)}  底20%=${wBot20.toFixed(1)}`);
  check('顶部尖细：顶10%宽 ≤ 35% × 最大宽', wTop <= 0.35 * maxW, `wTop=${wTop.toFixed(1)} maxW=${maxW}`);
  check('上窄下宽：顶20%平均宽 < 底20%平均宽', wTop20 < wBot20, `top=${wTop20.toFixed(1)} bottom=${wBot20.toFixed(1)}`);
  check('最宽处位于中下部（h ∈ [40%,85%]）', (maxY - top) / H >= 0.4 && (maxY - top) / H <= 0.85, `h=${(((maxY - top) / H) * 100).toFixed(1)}%`);
  check('底部圆润：底10%平均宽 ≥ 40% × 最大宽', wBot >= 0.4 * maxW, `wBot=${wBot.toFixed(1)} maxW=${maxW}`);
}

// =====================================================================
console.log('\n===== 4) 掌垫↔四趾、趾↔趾 余隙（精确 EDT，64 空间） =====');
{
  const { toes, pad } = buildPaw();
  const K = 16; // 每单位 16 像素
  const SZg = 64 * K;
  const names = ['外趾L', '外趾R', '内趾L', '内趾R'];
  // buildPaw 里 toes 顺序：(外L,外R) 来自 TOES[0]，(内L,内R) 来自 TOES[1]
  const toeGaps = toes.map((t, i) => {
    const px = polySetGapPx([t], [pad], SZg, K);
    const u = px / K;
    console.log(`   掌垫 ↔ ${names[i]}: ${u.toFixed(2)} (64空间)   [${px.toFixed(1)}px @K=${K}]`);
    return u;
  });
  const pairDefs = [
    [0, 1, '外L↔外R'],
    [2, 3, '内L↔内R'],
    [0, 2, '外L↔内L'],
    [1, 3, '外R↔内R'],
    [0, 3, '外L↔内R'],
    [1, 2, '外R↔内L'],
  ];
  const toeToe = pairDefs.map(([a, b, nm]) => {
    const u = polySetGapPx([toes[a]], [toes[b]], SZg, K) / K;
    console.log(`   ${nm}: ${u.toFixed(2)}`);
    return u;
  });
  const globalMin = Math.min(...toeGaps, ...toeToe);
  console.log(`   → 掌垫↔趾 最小 = ${Math.min(...toeGaps).toFixed(2)}   趾↔趾 最小 = ${Math.min(...toeToe).toFixed(2)}   全局最小 = ${globalMin.toFixed(2)}`);
  check('全局最小余隙 ≥ 1.5（64空间）', globalMin >= 1.5, `globalMin=${globalMin.toFixed(2)}`);
  // 与工程师声称数值对照
  const claim = { inner: 7.58, outer: 9.5, global: 2.12 };
  const measuredOuter = Math.min(toeGaps[0], toeGaps[1]);
  const measuredInner = Math.min(toeGaps[2], toeGaps[3]);
  console.log(
    `   与工程师声称对比：内趾实测${measuredInner.toFixed(2)} vs 声称${claim.inner}（Δ${(measuredInner - claim.inner).toFixed(2)}）；` +
      `外趾实测${measuredOuter.toFixed(2)} vs 声称${claim.outer}（Δ${(measuredOuter - claim.outer).toFixed(2)}）；` +
      `全局实测${globalMin.toFixed(2)} vs 声称${claim.global}（Δ${(globalMin - claim.global).toFixed(2)}）`,
  );
  check(
    '实测余隙与工程师声称值差异 ≤0.3（否则需说明）',
    Math.abs(measuredInner - claim.inner) <= 0.3 &&
      Math.abs(measuredOuter - claim.outer) <= 0.3 &&
      Math.abs(globalMin - claim.global) <= 0.3,
    `Δinner=${(measuredInner - claim.inner).toFixed(2)} Δouter=${(measuredOuter - claim.outer).toFixed(2)} Δglobal=${(globalMin - claim.global).toFixed(2)}`,
  );
}

// =====================================================================
console.log('\n===== 5) 小尺寸辨识度 11 / 13 / 20 px =====');
{
  const sizes = [11, 13, 20];
  const zoom = 10;
  const tiles = [];
  for (const s of sizes) {
    // 与 UI 一致：PawPrint 用 viewBox 512、tight 路径，无额外留白
    const polys = fitToBox(pawPathPolys, s, 0);
    const hard = renderGray(polys, s, 1, true);
    const { holes } = countEnclosedHoles(hard, s);
    // 桃形：只在掌垫上判（把 64 空间掌垫先映射到与 PAW_PATH 同一 512 坐标系，再缩到 s）
    const pad512 = buildPaw().pad.map((pt) => ({ x: (pt.x - bMinX) * sc, y: (pt.y - bMinY) * sc }));
    const padMask = renderGray(fitToBox([pad512], s, 0), s, 1, true);
    const wp = widthProfile(padMask, s);
    const Hp = wp.bot - wp.top;
    const wTop = wp.widths[wp.top];
    const wMax = wp.maxW;
    const topNarrow = Hp > 0 ? wTop <= Math.max(2, 0.5 * wMax) : false;
    console.log(`   ${s}px: 空洞=${holes}  掌垫顶行宽=${wTop} 最大宽=${wMax} 高=${Hp}  上尖=${topNarrow}`);
    check(`${s}px 无空洞`, holes === 0, `holes=${holes}`);
    check(`${s}px 掌垫仍上尖下圆`, topNarrow === true, `wTop=${wTop} wMax=${wMax}`);

    // 放大 tile
    const buf = renderPng({ polys, size: s, bg: WHITE, fg: [0x7e, 0x91, 0x42], ss: 1, keepWinding: true });
    const src = PNG.sync.read(buf);
    const big = new PNG({ width: s * zoom, height: s * zoom });
    for (let y = 0; y < s * zoom; y++)
      for (let x = 0; x < s * zoom; x++) {
        const so = (Math.floor(y / zoom) * s + Math.floor(x / zoom)) * 4;
        const o = (y * s * zoom + x) * 4;
        big.data[o] = src.data[so];
        big.data[o + 1] = src.data[so + 1];
        big.data[o + 2] = src.data[so + 2];
        big.data[o + 3] = 255;
      }
    tiles.push(big);
  }
  // 拼图
  const gap = 20;
  const width = tiles.reduce((a, t) => a + t.width + gap, gap);
  const height = Math.max(...tiles.map((t) => t.height)) + gap * 2;
  const canvas = new PNG({ width, height });
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = WHITE[0];
    canvas.data[i + 1] = WHITE[1];
    canvas.data[i + 2] = WHITE[2];
    canvas.data[i + 3] = 255;
  }
  let ox = gap;
  for (const t of tiles) {
    for (let y = 0; y < t.height; y++)
      for (let x = 0; x < t.width; x++) {
        const so = (y * t.width + x) * 4;
        const o = ((y + gap) * width + (x + ox)) * 4;
        canvas.data[o] = t.data[so];
        canvas.data[o + 1] = t.data[so + 1];
        canvas.data[o + 2] = t.data[so + 2];
        canvas.data[o + 3] = 255;
      }
    ox += t.width + gap;
  }
  fs.writeFileSync(path.join(previewDir, 'qa-paw-small.png'), PNG.sync.write(canvas));
  console.log(`   放大图 → ${path.join(previewDir, 'qa-paw-small.png')}`);
}

// 高分辨率全爪 + 掌垫留档
{
  fs.writeFileSync(
    path.join(previewDir, 'qa-paw-hi.png'),
    renderPng({ polys: fitToBox(pawPathPolys, 400, 0.06), size: 400, bg: WHITE, fg: [0x7e, 0x91, 0x42], ss: 4, keepWinding: true }),
  );
  console.log(`\n高分辨率全爪 → ${path.join(previewDir, 'qa-paw-hi.png')}`);
}

// =====================================================================
const failed = results.filter((r) => !r.pass);
console.log(`\n===== QA 汇总 =====`);
console.log(`断言总数=${results.length}  通过=${results.length - failed.length}  失败=${failed.length}`);
if (failed.length) {
  console.log('失败项:');
  for (const f of failed) console.log(`  - ${f.name}  ${f.detail ?? ''}`);
  process.exit(1);
}
console.log('ALL PASS');
