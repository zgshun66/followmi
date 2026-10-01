// 极简几何 + 光栅化工具（纯 JS，无原生依赖）。
//
// 提供三类「圆头笔触」基本形：圆、多边形、锥形笔画（沿折线扫出的圆头粗线）。
// 把它们用非零环绕（nonzero）填充求并集，就能拼出光滑的剪影；
// 同一批多边形还能直接导出成一条 SVG path（fill-rule: nonzero），
// 让界面里的徽标和 App 图标共用同一份形状。
import { PNG } from 'pngjs';

const TAU = Math.PI * 2;

/** 圆 → 多边形。 */
export function circle(cx, cy, r, seg = 48) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** 三角形/任意多边形。 */
export function poly(points) {
  return points.map(([x, y]) => ({ x, y }));
}

/** 椭圆（rot 为弧度，绕自身中心旋转）。 */
export function ellipse(cx, cy, rx, ry, rot = 0, seg = 48) {
  const pts = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  }
  return pts;
}

/**
 * 锥形笔画：沿折线扫出一条两端圆头、宽度可渐变的粗线。
 * @param {Array<[number,number]>} pts 中心线
 * @param {number[]} radii 与 pts 等长的半径
 */
export function stroke(pts, radii) {
  const n = pts.length;
  const P = pts.map(([x, y]) => ({ x, y }));
  const R = radii.slice();

  // 累加弧长，用于算切线
  const seg = [];
  for (let i = 0; i < n - 1; i++) {
    seg.push(Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y));
  }
  const tangents = [];
  for (let i = 0; i < n; i++) {
    let tx;
    let ty;
    if (i === 0) {
      tx = P[1].x - P[0].x;
      ty = P[1].y - P[0].y;
    } else if (i === n - 1) {
      tx = P[n - 1].x - P[n - 2].x;
      ty = P[n - 1].y - P[n - 2].y;
    } else {
      // 用相邻两段的平均方向，拐角处过渡更圆顺
      const a = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y) || 1;
      const b = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y) || 1;
      tx = (P[i].x - P[i - 1].x) / a + (P[i + 1].x - P[i].x) / b;
      ty = (P[i].y - P[i - 1].y) / a + (P[i + 1].y - P[i].y) / b;
    }
    const len = Math.hypot(tx, ty) || 1;
    tangents.push({ x: tx / len, y: ty / len });
  }

  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const nx = -tangents[i].y;
    const ny = tangents[i].x;
    left.push({ x: P[i].x + nx * R[i], y: P[i].y + ny * R[i] });
    right.push({ x: P[i].x - nx * R[i], y: P[i].y - ny * R[i] });
  }

  // 末端圆帽：从左侧（+n）绕前方扫到右侧（-n），与两侧边首尾相接
  const endCap = [];
  const eAng = Math.atan2(tangents[n - 1].y, tangents[n - 1].x);
  const capSeg = 14;
  for (let i = 1; i < capSeg; i++) {
    const a = eAng + Math.PI / 2 - (i / capSeg) * Math.PI;
    endCap.push({ x: P[n - 1].x + Math.cos(a) * R[n - 1], y: P[n - 1].y + Math.sin(a) * R[n - 1] });
  }

  // 起始圆帽：从右侧（-n）绕「后方」扫到左侧（+n）——必须经过 -切线方向，
  // 否则起点处会缺一个半圆，并在与其他形状求并时留下月牙形空洞。
  const startCap = [];
  const sAng = Math.atan2(tangents[0].y, tangents[0].x);
  for (let i = 1; i < capSeg; i++) {
    const a = sAng - Math.PI / 2 - (i / capSeg) * Math.PI;
    startCap.push({ x: P[0].x + Math.cos(a) * R[0], y: P[0].y + Math.sin(a) * R[0] });
  }

  const polyPts = [...left, ...endCap, ...right.reverse(), ...startCap];
  void seg;
  return polyPts;
}

/** 多边形有向面积（用来统一绕向）。 */
export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** 求多边形集合的包围盒。 */
export function pathBounds(polys) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys) {
    for (const pt of p) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** 等比缩放并居中到 size×size 画布，留白比例 pad。 */
export function fitToBox(polys, size, pad = 0.08) {
  const { minX, minY, maxX, maxY } = pathBounds(polys);
  const w = maxX - minX;
  const h = maxY - minY;
  const box = size * (1 - pad * 2);
  const scale = Math.min(box / w, box / h);
  const ox = (size - w * scale) / 2 - minX * scale;
  const oy = (size - h * scale) / 2 - minY * scale;
  return polys.map((p) => p.map((pt) => ({ x: pt.x * scale + ox, y: pt.y * scale + oy })));
}

/** 把所有子路径统一为同一绕向——非零环绕求并集的前提。 */
export function normalizeWinding(polys) {
  return polys.map((p) => (signedArea(p) < 0 ? [...p].reverse() : p));
}

/** 射线法判断点是否在多边形内。 */
export function pointInPoly(pt, polyPts) {
  let inside = false;
  for (let i = 0, j = polyPts.length - 1; i < polyPts.length; j = i++) {
    const a = polyPts[i];
    const b = polyPts[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 判定“谁是谁的洞”：按包含层数（嵌套深度）给每条子路径定绕向——
 * 偶数层（外层实体）取正向，奇数层（洞，如猫咪的眼睛）取反向。
 * 非零环绕填充下，两者即可正确相减。
 *
 * 前提：各子路径只允许「嵌套」，不允许互相交叠（描摹出的轮廓天然满足）。
 */
export function resolveHoles(polys) {
  // 为每条子路径取一个确凿位于内部的采样点（沿边中点向内法线微移）。
  const samples = polys.map((p) => {
    let best = { x: p[0].x, y: p[0].y };
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const nx = -dy / len;
      const ny = dx / len;
      const eps = Math.min(0.2, len / 4);
      const c1 = { x: mx + nx * eps, y: my + ny * eps };
      const c2 = { x: mx - nx * eps, y: my - ny * eps };
      // 两个方向取其一必在内部（与绕向无关）
      if (pointInPoly(c1, p)) {
        best = c1;
        break;
      }
      if (pointInPoly(c2, p)) {
        best = c2;
        break;
      }
    }
    return best;
  });

  const depth = polys.map((p, i) => {
    const s = samples[i];
    let d = 0;
    for (let j = 0; j < polys.length; j++) {
      if (i !== j && pointInPoly(s, polys[j])) d++;
    }
    return d;
  });

  return polys.map((p, i) => {
    const wantPositive = depth[i] % 2 === 0;
    const isPositive = signedArea(p) > 0;
    return isPositive === wantPositive ? p : [...p].reverse();
  });
}

/** 非零环绕扫描线填充，返回 0/1 覆盖度数组。 */
function fillCoverage(polys, W, keepWinding = false) {
  const cov = new Uint8Array(W * W);
  const edges = [];
  for (const p of keepWinding ? polys : normalizeWinding(polys)) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      if (a.y !== b.y) edges.push({ a, b, dir: b.y > a.y ? 1 : -1 });
    }
  }
  const xs = [];
  const dirs = [];
  for (let y = 0; y < W; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    dirs.length = 0;
    for (const e of edges) {
      const ymin = Math.min(e.a.y, e.b.y);
      const ymax = Math.max(e.a.y, e.b.y);
      if (sy >= ymin && sy < ymax) {
        const t = (sy - e.a.y) / (e.b.y - e.a.y);
        xs.push(e.a.x + t * (e.b.x - e.a.x));
        dirs.push(e.dir);
      }
    }
    // 按 x 排序（简单插入排序，扫描线内交点通常很少）
    for (let i = 1; i < xs.length; i++) {
      const x = xs[i];
      const d = dirs[i];
      let j = i - 1;
      while (j >= 0 && xs[j] > x) {
        xs[j + 1] = xs[j];
        dirs[j + 1] = dirs[j];
        j--;
      }
      xs[j + 1] = x;
      dirs[j + 1] = d;
    }
    let wind = 0;
    const row = y * W;
    for (let k = 0; k + 1 < xs.length; k++) {
      wind += dirs[k];
      if (wind === 0) continue;
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) cov[row + x] = 1;
    }
  }
  return cov;
}

/** 渲染为 PNG Buffer。 */
export function renderPng({ polys, size, bg, fg, ss = 4, keepWinding = false }) {
  const W = size * ss;
  const scaled = polys.map((p) => p.map((pt) => ({ x: pt.x * ss, y: pt.y * ss })));
  const cov = fillCoverage(scaled, W, keepWinding);
  const png = new PNG({ width: size, height: size });
  const area = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let dy = 0; dy < ss; dy++) {
        const row = (y * ss + dy) * W;
        for (let dx = 0; dx < ss; dx++) acc += cov[row + x * ss + dx];
      }
      const a = acc / area;
      const o = (y * size + x) * 4;
      png.data[o] = Math.round(bg[0] * (1 - a) + fg[0] * a);
      png.data[o + 1] = Math.round(bg[1] * (1 - a) + fg[1] * a);
      png.data[o + 2] = Math.round(bg[2] * (1 - a) + fg[2] * a);
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/**
 * 把多边形集合导出为一条 SVG path（配合 fill-rule: nonzero）。
 * keepWinding=false（默认）：所有子路径统一绕向 → 即并集；
 * keepWinding=true：保留既有绕向 → 反向子路径成为洞。
 */
export function toSvgPath(polys, decimals = 1, keepWinding = false) {
  const f = (n) => {
    const s = n.toFixed(decimals);
    return s.replace(/\.0$/, '');
  };
  const parts = [];
  for (const raw of polys) {
    let p = raw;
    if (!keepWinding && signedArea(p) < 0) p = [...p].reverse();
    let d = `M${f(p[0].x)} ${f(p[0].y)}`;
    for (let i = 1; i < p.length; i++) d += `L${f(p[i].x)} ${f(p[i].y)}`;
    parts.push(`${d}Z`);
  }
  return parts.join('');
}
