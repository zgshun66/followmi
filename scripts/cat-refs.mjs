// 猫咪参考图 → 矢量姿态定义（全站形状的唯一出处）。
//
// 四张「黑猫白底」参考图分别对应四种姿态，描摹成闭合多边形后：
//   scripts/gen-icons.mjs → 生成 App 图标，并导出 src/components/CatShape.ts
//
// 想换姿态 / 调简化程度：改这里的 opts 后运行 `npm run gen:icons`。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceInk } from './trace.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 姿态清单：key 即 CatShape.ts 里的导出名。 */
export const CAT_REFS = [
  {
    key: 'sit',
    label: '正坐（App 图标 / 徽标）',
    file: 'assets/cats/sit.jpg',
    // 坐姿轮廓最饱满，方形构图不需要额外裁切；胡须太细，成图标后只剩灰边，故丢弃
    opts: { epsilon: 0.85, dropHair: 3.4 },
  },
  {
    key: 'loaf',
    label: '趴卧（今日页提示 / 空状态）',
    file: 'assets/cats/loaf.jpg',
    opts: { epsilon: 0.85, dropHair: 3.4 },
  },
  {
    key: 'stretch',
    label: '伸懒腰（加载态 / 休息）',
    file: 'assets/cats/stretch.jpg',
    opts: { epsilon: 0.85, dropHair: 3.4 },
  },
  {
    key: 'box',
    label: '趴盒子（封面占位）',
    file: 'assets/cats/box.jpg',
    opts: { epsilon: 0.85, dropHair: 3.4 },
  },
];

/** 描摹全部姿态，返回 { key: loops }。 */
export function buildPoses() {
  const out = {};
  for (const ref of CAT_REFS) {
    out[ref.key] = traceInk(path.join(root, ref.file), ref.opts);
  }
  return out;
}
