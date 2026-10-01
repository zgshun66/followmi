// 位图 → 矢量轮廓：把「黑猫白底」的参考图转成一组闭合多边形。
//
// 流程：JPEG/PNG 解码 → 灰度取墨迹 → 连通域筛掉噪点并求包围盒
//      → 3× 双线性上采样 → marching squares 提等值线 → 首尾相接成环
//      → Douglas-Peucker 简化 → 嵌套深度定绕向（眼睛成为洞）。
//
// 产物可直接交给 raster.mjs 渲染成 PNG，或 toSvgPath 导出成 SVG path。
import fs from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { pointInPoly, resolveHoles, signedArea } from './raster.mjs';

/** 解码为 RGBA 位图。 */
export function decodeImage(file) {
  const buf = fs.readFileSync(file);
  if (/\.png$/i.test(file)) {
    const png = PNG.sync.read(buf);
    return { data: png.data, width: png.width, height: png.height };
  }
  const { data, width, height } = jpeg.decode(buf, {
    useTArray: true,
    formatAsRGBA: true,
    maxMemoryUsageInMB: 1024,
  });
  return { data, width, height };
}

/** 墨迹强度场：0 = 纯白，255 = 纯黑。 */
function inkFieldFrom(file) {
  const { data, width, height } = decodeImage(file);
  const ink = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    ink[i] = 255 - lum;
  }
  // 3×3 分离卷积，抹掉 JPEG 振铃
  const tmp = new Float32Array(ink.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const l = x > 0 ? ink[i - 1] : ink[i];
      const r = x < width - 1 ? ink[i + 1] : ink[i];
      tmp[i] = (l + 2 * ink[i] + r) / 4;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const u = y > 0 ? tmp[i - width] : tmp[i];
      const d = y < height - 1 ? tmp[i + width] : tmp[i];
      ink[i] = (u + 2 * tmp[i] + d) / 4;
    }
  }
  return { ink, width, height };
}

/** 连通域筛选，返回墨迹的包围盒（已剔噪）。 */
function inkBounds(ink, width, height, level, minArea, minMeanInk) {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let kept = 0;

  for (let start = 0; start < ink.length; start++) {
    if (seen[start] || ink[start] < level) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    const members = [];
    let sum = 0;
    while (sp > 0) {
      const i = stack[--sp];
      members.push(i);
      sum += ink[i];
      const x = i % width;
      const y = (i / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (seen[ni] || ink[ni] < level) continue;
          seen[ni] = 1;
          stack[sp++] = ni;
        }
      }
    }
    const area = members.length;
    if (area < minArea || sum / area < minMeanInk) continue;
    kept += area;
    for (const i of members) {
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (kept === 0) throw new Error('未在图中找到墨迹（阈值或图像异常）');
  return { minX, minY, maxX, maxY };
}

/** 裁剪 + 双线性上采样，得到等值线所用的采样场。 */
function sampleField(ink, width, height, box, scale, pad = 3) {
  const x0 = Math.max(0, box.minX - pad);
  const y0 = Math.max(0, box.minY - pad);
  const x1 = Math.min(width - 1, box.maxX + pad);
  const y1 = Math.min(height - 1, box.maxY + pad);
  const W = Math.round((x1 - x0) * scale) + 1;
  const H = Math.round((y1 - y0) * scale) + 1;
  const F = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = y0 + y / scale;
    const iy = Math.min(height - 1, Math.floor(sy));
    const iy2 = Math.min(height - 1, iy + 1);
    const fy = sy - iy;
    for (let x = 0; x < W; x++) {
      const sx = x0 + x / scale;
      const ix = Math.min(width - 1, Math.floor(sx));
      const ix2 = Math.min(width - 1, ix + 1);
      const fx = sx - ix;
      const v00 = ink[iy * width + ix];
      const v10 = ink[iy * width + ix2];
      const v01 = ink[iy2 * width + ix];
      const v11 = ink[iy2 * width + ix2];
      F[y * W + x] = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
    }
  }
  return { F, W, H, x0, y0 };
}

/**
 * marching squares：按 16 种格型生成线段。
 * 每个交点只由相邻两格共同产生且算法确定，故交点可直接按坐标字符串配对。
 */
function marchSegments(F, W, H, level) {
  const segs = [];
  const at = (x, y) => F[y * W + x];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const c0 = at(x, y);
      const c1 = at(x + 1, y);
      const c2 = at(x + 1, y + 1);
      const c3 = at(x, y + 1);
      const code =
        (c0 >= level ? 1 : 0) | (c1 >= level ? 2 : 0) | (c2 >= level ? 4 : 0) | (c3 >= level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const t = (a, b) => (level - a) / (b - a);
      const T = { x: x + t(c0, c1), y };
      const R = { x: x + 1, y: y + t(c1, c2) };
      const B = { x: x + t(c3, c2), y: y + 1 };
      const L = { x, y: y + t(c0, c3) };
      const push = (a, b) => segs.push({ a, b });
      switch (code) {
        case 1:
        case 14:
          push(T, L);
          break;
        case 2:
        case 13:
          push(T, R);
          break;
        case 3:
        case 12:
          push(L, R);
          break;
        case 4:
        case 11:
          push(R, B);
          break;
        case 6:
        case 9:
          push(T, B);
          break;
        case 7:
        case 8:
          push(L, B);
          break;
        case 5:
          push(T, L);
          push(R, B);
          break;
        case 10:
          push(T, R);
          push(L, B);
          break;
        default:
          break;
      }
    }
  }
  return segs;
}

/** 把线段接成闭环（每个交点恰好连接两条线段，逐环游走即可）。 */
function buildLoops(segs) {
  const key = (p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  const nodes = new Map();
  segs.forEach((s, si) => {
    for (const [end, p] of [
      [0, s.a],
      [1, s.b],
    ]) {
      const k = key(p);
      const list = nodes.get(k);
      if (list) list.push({ si, end });
      else nodes.set(k, [{ si, end }]);
    }
  });

  const used = new Uint8Array(segs.length);
  const loops = [];
  const guardMax = segs.length + 8;
  for (let si = 0; si < segs.length; si++) {
    if (used[si]) continue;
    used[si] = 1;
    const startKey = key(segs[si].a);
    const pts = [{ ...segs[si].a }, { ...segs[si].b }];
    let guard = 0;
    let closed = false;
    while (guard++ < guardMax) {
      const here = pts[pts.length - 1];
      const cands = nodes.get(key(here));
      if (!cands) break;
      const next = cands.find((c) => !used[c.si]);
      if (!next) break;
      used[next.si] = 1;
      const s = segs[next.si];
      const far = next.end === 0 ? s.b : s.a;
      if (key(far) === startKey) {
        closed = true;
        break;
      }
      pts.push({ ...far });
    }
    if (closed && pts.length >= 3) loops.push(pts);
  }
  return loops;
}

/** Douglas-Peucker 简化（closed=true 时首尾同点，需先从中点劈开避免弦退化）。 */
function simplify(pts, eps, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  if (src.length <= 2) return closed ? src.slice(0, -1) : src;
  const keep = new Uint8Array(src.length);
  keep[0] = 1;
  keep[src.length - 1] = 1;
  const mid = Math.floor((src.length - 1) / 2);
  keep[mid] = 1;
  const stack = [
    [0, mid],
    [mid, src.length - 1],
  ];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const A = src[i0];
    const B = src[i1];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    let maxD = -1;
    let idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((src[i].x - A.x) * dy - (src[i].y - A.y) * dx) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  const out = src.filter((_, i) => keep[i]);
  return closed ? out.slice(0, -1) : out;
}

/**
 * 描摹一张「黑猫白底」的参考图，返回源图坐标系下的闭合多边形数组。
 *
 * @param {string} file 图片路径
 * @param {object} [opts]
 * @param {number} [opts.level=128]    墨迹阈值（0-255，越大越严）
 * @param {number} [opts.minArea=10]   连通域最小面积（源图像素），用于剔噪
 * @param {number} [opts.minMeanInk=200] 连通域平均墨迹，用于剔淡灰残影
 * @param {number} [opts.scale=3]      上采样倍率（越大轮廓越细腻）
 * @param {number} [opts.epsilon=0.9]  Douglas-Peucker 容差（上采样像素）
 * @param {number} [opts.minLoopArea=6] 环最小面积（源图像素²），剔碎屑
 * @param {number} [opts.dropHair=0]   细毛线判据：0 关闭；否则 |min| < dropHair 且 |max| > 8 的环丢弃
 */
export function traceInk(file, opts = {}) {
  const {
    level = 128,
    minArea = 10,
    minMeanInk = 200,
    scale = 3,
    epsilon = 0.9,
    minLoopArea = 6,
    dropHair = 0,
  } = opts;

  const { ink, width, height } = inkFieldFrom(file);
  const box = inkBounds(ink, width, height, level, minArea, minMeanInk);
  const { F, W, H, x0, y0 } = sampleField(ink, width, height, box, scale);
  const raw = buildLoops(marchSegments(F, W, H, level));

  const loops = [];
  for (const loop of raw) {
    const pts = simplify(loop, epsilon, true).map((p) => ({
      x: x0 + p.x / scale,
      y: y0 + p.y / scale,
    }));
    if (pts.length < 3) continue;
    const area = Math.abs(signedArea(pts));
    if (area < minLoopArea) continue;
    if (dropHair > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const dims = [maxX - minX, maxY - minY].sort((a, b) => a - b);
      if (dims[0] < dropHair && dims[1] > 8) continue; // 细长的胡须残段
    }
    loops.push(pts);
  }

  return resolveHoles(loops);
}

/** 统计环数与点数，便于观察简化效果。 */
export function loopsInfo(loops) {
  return {
    loops: loops.length,
    points: loops.reduce((s, l) => s + l.length, 0),
  };
}

/** 判断某点是否落在环集合内（相对包围盒的归一化坐标），用于自测。 */
export function containsPoint(loops, pt) {
  let depth = 0;
  for (const l of loops) if (pointInPoly(pt, l)) depth++;
  return depth % 2 === 1;
}
