// 猫爪印的「源描述」——严格轴对称。
//
// 前一版：四只脚趾各自的椭圆角度、间距、长短都不一样（-18°/-6°/8°/22°），左右两半
// 根本不是镜像，一眼看去是歪的。现在在 x = 32 中轴上左右镜像构造：四个趾 + 掌垫。
// 更前一版掌垫用「椭圆 + 顶边中央凹口」，用户觉得那块像"打孔 / 屁股缝"，故本轮改形状。
//
// 本轮改动：掌垫由「椭圆 + 凹口」改为「桃形（上尖下圆）」，并整体上移靠近四趾。
//
//   ⚠️ 为什么不用「半径调制」做尖：r(θ) = 1 - k·exp(-d²/2σ²) 把顶部半径压小，边界是
//      向圆心「缩」的，做出来是一道向内凹的缺口（正是旧版那道"屁股缝"），k 越大凹得越深，
//      永远得不到凸出的尖。要「上尖下圆」，得让上半部横向收窄、下半部放满 —— 于是改用
//      水滴/蛋形参数式：x = cx + rx·sin(φ)·sin(φ/2)^taper、y = cy - ry·cos(φ)（φ 从正上方
//      起算）。φ→0 时横向宽度按 φ^(1+taper) 收敛，天然收成一个圆润的尖（曲率连续、无折角）。
//
// 坐标空间 64 × 64，y 向下。消费方：scripts/gen-icons.mjs → CatShape.ts 的 PAW_PATH。
//
// ⚠️ 各趾之间、趾与掌垫之间必须留有间隙（64 空间 ≥ 1.5 单位）：一旦互相交叠，嵌套定洞的
//    规则就会把重叠区当成「另一个实体内部」而挖空（旧版图标上那个白色月牙就是这么来的）。
//    改动后用 scripts/dev/paw-check.mjs 量过余隙，见文件末尾注释。
import { ellipse, normalizeWinding } from './raster.mjs';

const AXIS = 32; // 对称轴
const TAU = Math.PI * 2;

/**
 * 掌垫：桃形（上尖下圆）。
 *
 * 参数式（φ 自正上方 -90° 起算，顺时针）：
 *   x(φ) = cx + rx·sin(φ)·sin(φ/2)^taper
 *   y(φ) = cy - ry·cos(φ)
 *
 * 性质：
 *   - φ=0（正上方）：x=cx、y=cy-ry，是轮廓最高点，收成一个「尖」；
 *   - φ=π（正下方）：x=cx、y=cy+ry，底部饱满浑圆（与椭圆一致）；
 *   - 左右严格镜像：x(2π-φ) = -x(φ)、y(2π-φ) = y(φ)；
 *   - taper 控制「尖」的圆润度：taper=0 退化成椭圆（圆头）；taper=1 顶端接近折角；
 *     取 0.6~0.8 得到一个曲率连续、圆润的尖（无折角、无棱边）；
 *   - seg 足够大（≥192）保证轮廓平滑，不出现多边形棱边。
 *
 * @param {number} cx 中心 x
 * @param {number} cy 中心 y
 * @param {number} rx 横向半轴
 * @param {number} ry 纵向半轴
 * @param {number} [seg=256] 采样段数（越大越平滑）
 * @param {number} [taper=0.72] 顶部收窄指数（0=椭圆，1=接近折角）
 * @returns {{x:number,y:number}[]} 掌垫轮廓点
 */
function peachPad(cx, cy, rx, ry, seg = 256, taper = 0.72) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const phi = (i / seg) * TAU; // 0 = 正上方（尖），π = 正下方（圆）
    const half = Math.sin(phi / 2); // 0（顶）→ 1（底）
    const w = Math.pow(half, taper); // 顶部横向收窄，底部放满
    pts.push({
      x: cx + rx * Math.sin(phi) * w,
      y: cy - ry * Math.cos(phi),
    });
  }
  return pts;
}

/** 四趾参数：外侧一对 + 内侧一对（dx 为距中轴的水平距离，ang 为自身旋转弧度）。 */
const TOES = [
  { dx: 19.0, cy: 19.6, rx: 5.4, ry: 8.0, ang: 0.42 }, // 外趾（向外张）
  { dx: 6.6, cy: 13.0, rx: 5.5, ry: 8.0, ang: 0.12 }, // 内趾
];

/** 掌垫参数：由「椭圆+凹口」改为「桃形」，中心由 44.5 上移到 39.5，靠近四趾。 */
const PAD = { cx: AXIS, cy: 39.5, rx: 15.4, ry: 12.6, taper: 0.7 };

/**
 * 拆成「实体」与「洞」两部分返回，绕向在 pawPolys() 里显式指定，
 * 不依赖嵌套启发式（那套只对描摹出的轮廓可靠）。
 * 额外返回 toes / pad，便于 scripts/dev/paw-check.mjs 量化各部件之间的余隙。
 */
export function buildPaw() {
  // —— 四只脚趾：外侧一对 + 内侧一对，左右互为镜像 ——
  const solids = [];
  const toes = [];
  for (const t of TOES) {
    for (const s of [-1, 1]) {
      const p = ellipse(AXIS + s * t.dx, t.cy, t.rx, t.ry, s * t.ang);
      toes.push(p);
      solids.push(p);
    }
  }

  // —— 掌垫（桃形：上尖下圆）——
  const pad = peachPad(PAD.cx, PAD.cy, PAD.rx, PAD.ry, 256, PAD.taper);
  solids.push(pad);

  return { solids, holes: [], toes, pad };
}

/** 返回最终多边形集合：实体同向、洞反向（非零环绕下正确相减）。 */
export function pawPolys() {
  const { solids, holes } = buildPaw();
  return [...normalizeWinding(solids), ...normalizeWinding(holes).map((p) => [...p].reverse())];
}
