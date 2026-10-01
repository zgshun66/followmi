// 开发辅助：量化猫爪印各部件之间的余隙，确保「趾与趾 / 趾与掌垫」在 64 空间内
// 留够 ≥1.5 单位，绝不交叠（交叠会被嵌套定洞规则挖出白色空洞）。
//
// 同时对比「旧版（椭圆+凹口、掌垫 cy=44.5）」与「新版（桃形、掌垫 cy 上移）」的
// 掌垫↔趾 余隙，证明本轮把掌垫挪得更靠近四趾了。
//
// 用法：node scripts/dev/paw-check.mjs
import { ellipse } from '../raster.mjs';
import { buildPaw } from '../paw-shape.mjs';

const AXIS = 32;
const TAU = Math.PI * 2;
const MIN_GAP = 1.5;

// —— 旧版几何（用于对比）——
function notchedPadOld(cx, cy, rx, ry, seg = 192, dipDepth = 0.34, dipWidth = 0.42) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    let d = (((a + Math.PI / 2) % TAU) + TAU) % TAU;
    if (d > Math.PI) d = TAU - d;
    const dip = Math.exp(-(d * d) / (2 * dipWidth * dipWidth));
    const k = 1 - dipDepth * dip;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

/** 点到线段距离。 */
function distPtSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 两个多边形之间的最小距离（顶点到对边逐段取最小；凸形下即真值）。 */
function polyDist(A, B) {
  let m = Infinity;
  for (const p of A) for (let i = 0; i < B.length; i++) m = Math.min(m, distPtSeg(p, B[i], B[(i + 1) % B.length]));
  for (const p of B) for (let i = 0; i < A.length; i++) m = Math.min(m, distPtSeg(p, A[i], A[(i + 1) % A.length]));
  return m;
}

function bounds(p) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of p) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }
  return { minX, minY, maxX, maxY };
}

const names = ['外趾L', '外趾R', '内趾L', '内趾R'];
const fmt = (n) => n.toFixed(2).padStart(6);

function report(label, { toes, pad }) {
  const gp = toes.map((t, i) => polyDist(t, pad));
  let minAll = Math.min(...gp);
  console.log(`\n[${label}]  掌垫↔各趾：`);
  gp.forEach((d, i) => console.log(`   pad ↔ ${names[i]}: ${fmt(d)}`));
  console.log('   趾↔趾：');
  const pairs = [
    [0, 1, '外L↔外R'],
    [2, 3, '内L↔内R'],
    [0, 2, '外L↔内L'],
    [1, 3, '外R↔内R'],
    [0, 3, '外L↔内R'],
    [1, 2, '外R↔内L'],
  ];
  let minToe = Infinity;
  for (const [a, b, nm] of pairs) {
    const d = polyDist(toes[a], toes[b]);
    minToe = Math.min(minToe, d);
    console.log(`   ${nm}: ${fmt(d)}`);
  }
  minAll = Math.min(minAll, minToe);
  const pb = bounds(pad);
  console.log(`   掌垫包围盒：x∈[${fmt(pb.minX)},${fmt(pb.maxX)}] y∈[${fmt(pb.minY)},${fmt(pb.maxY)}]`);
  console.log(`   掌垫顶点(尖) y=${fmt(pb.minY)}`);
  console.log(`   → 全局最小余隙 ${fmt(minAll)}  ${minAll >= MIN_GAP ? 'PASS (≥1.5)' : 'FAIL (<1.5)'}`);
}

// 旧版：掌垫 cy=44.5 rx=13.6 ry=12.2，趾同参数
const oldToes = [
  ellipse(AXIS - 19.0, 19.6, 5.4, 8.0, -0.42),
  ellipse(AXIS + 19.0, 19.6, 5.4, 8.0, 0.42),
  ellipse(AXIS - 6.6, 13.0, 5.5, 8.0, -0.12),
  ellipse(AXIS + 6.6, 13.0, 5.5, 8.0, 0.12),
];
report('旧版 椭圆+凹口', { toes: oldToes, pad: notchedPadOld(AXIS, 44.5, 13.6, 12.2) });

const { toes, pad } = buildPaw();
report('新版 桃形掌垫', { toes, pad });
