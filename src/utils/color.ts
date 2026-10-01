/** follow咪 温暖配色下，由字符串种子稳定生成图表颜色。 */
const PALETTE = [
  '#7E9142', // 深牛油果绿
  '#CE8B41', // 暖橙（柔）
  '#6C8040', // 橄榄绿
  '#B4713C', // 焦糖橙（柔）
  '#A3B96B', // 浅橄榄
  '#B08A2E', // 芥末黄（柔）
  '#5C7038', // 深叶绿
  '#C9A03C', // 金（柔）
];

function hashString(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 返回稳定的十六进制颜色（如 #7E9142）。 */
export function colorFor(seed: string): string {
  return PALETTE[hashString(seed) % PALETTE.length];
}

/** 返回带透明度的 rgba 颜色字符串。 */
export function colorWithAlpha(seed: string, alpha: number): string {
  const hex = colorFor(seed);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
