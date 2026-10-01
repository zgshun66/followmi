// 生成 follow咪 的 PWA 图标，并同步生成界面用的猫咪 / 猫爪路径。
//
// 形状源：
//   assets/cats/*.jpg  → scripts/cat-refs.mjs 描摹成矢量（四种猫咪姿态）
//   scripts/paw-shape.mjs                     几何构造（对称猫爪印）
// 产物：
//   1) public/icon-192.png、icon-512.png、apple-touch-icon.png、favicon.svg
//      —— 牛油果绿底 + 鹅黄坐姿猫，4× 超采样抗锯齿；
//   2) src/components/CatShape.ts（自动生成，勿手改）
//      —— 界面与图标共用同一份形状，改形状后重跑即可全站同步。
//
// 运行：npm run gen:icons        预览：node scripts/gen-icons.mjs --preview
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitToBox, pathBounds, renderPng, toSvgPath } from './raster.mjs';
import { buildPoses, CAT_REFS } from './cat-refs.mjs';
import { pawPolys } from './paw-shape.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const shapeOut = path.join(root, 'src', 'components', 'CatShape.ts');

const BG = [0x7e, 0x91, 0x42]; // 牛油果绿（同 tailwind 的 leaf）
const FG = [0xf4, 0xd2, 0x7e]; // 鹅黄
const ICON_POSE = 'sit'; // App 图标用坐姿：方形构图最饱满、小尺寸辨识度最高
const ICON_PAD = 0.08;

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(path.dirname(shapeOut), { recursive: true });

const poses = buildPoses();
const paw = pawPolys();

// ---------- 1. App 图标 ----------
const iconLoops = poses[ICON_POSE];
for (const t of [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]) {
  const polys = fitToBox(iconLoops, t.size, ICON_PAD);
  fs.writeFileSync(
    path.join(publicDir, t.name),
    renderPng({ polys, size: t.size, bg: BG, fg: FG, ss: 4, keepWinding: true }),
  );
  console.log(`generated ${t.name} (${t.size}x${t.size})`);
}

// ---------- 2. 界面用路径 ----------
const iconPath = toSvgPath(fitToBox(iconLoops, 512, ICON_PAD), 1, true);

/** 把姿态归一化到「长边 = target、左上角为原点」的紧凑包围盒。 */
function tightPose(loops, target = 512) {
  const b = pathBounds(loops);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const scale = target / Math.max(w, h);
  return {
    path: toSvgPath(
      loops.map((l) => l.map((p) => ({ x: (p.x - b.minX) * scale, y: (p.y - b.minY) * scale }))),
      1,
      true,
    ),
    w: Math.round(w * scale),
    h: Math.round(h * scale),
  };
}

const poseEntries = CAT_REFS.map((ref) => {
  const t = tightPose(poses[ref.key]);
  console.log(`pose ${ref.key.padEnd(8)} ${t.w}x${t.h}  path ${t.path.length} chars  (${ref.label})`);
  return { key: ref.key, ...t };
});

const pawPose = tightPose(paw, 512);

const ts = `/**
 * ⚠️ 本文件由 scripts/gen-icons.mjs 自动生成，请勿手改。
 *
 * 形状源：
 *   - 四种猫咪姿态：assets/cats/*.jpg 经 scripts/trace.mjs 描摹为矢量（改图或调参后重跑）
 *   - 猫爪印：scripts/paw-shape.mjs（轴对称几何构造）
 * 重新生成：npm run gen:icons
 */
export const CAT_VIEWBOX = 512;

/** 猫姿：path 与 App 图标同源，viewBox 用 0 0 w h（长边 512，无留白）。 */
export interface CatPose {
  path: string;
  w: number;
  h: number;
}

export const CAT_ICON_PATH =
  '${iconPath}';

export const CAT_POSES = {
${poseEntries
  .map(
    (p) => `  /** ${CAT_REFS.find((r) => r.key === p.key).label} */
  ${p.key}: {
    path:
      '${p.path}',
    w: ${p.w},
    h: ${p.h},
  },`,
  )
  .join('\n')}
} as const satisfies Record<string, CatPose>;

export type CatPoseKey = keyof typeof CAT_POSES;

/** 猫爪印：四趾 + 桃形掌垫（上尖下圆），严格左右对称。 */
export const PAW_VIEWBOX = 512;

export const PAW_PATH =
  '${pawPose.path}';
`;
fs.writeFileSync(shapeOut, ts);
console.log(`generated ${path.relative(root, shapeOut)}`);

// ---------- 3. 浏览器标签页图标 ----------
fs.writeFileSync(
  path.join(publicDir, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="116" fill="#7E9142"/>
  <path d="${iconPath}" fill="#F4D27E" fill-rule="nonzero"/>
</svg>
`,
);
console.log('generated favicon.svg');

// ---------- 4. 可选预览 ----------
if (process.argv.includes('--preview')) {
  const outDir = path.resolve(root, '..', '.preview');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'icon-preview.png'),
    renderPng({ polys: fitToBox(iconLoops, 512, ICON_PAD), size: 512, bg: BG, fg: FG, ss: 4, keepWinding: true }),
  );
  fs.writeFileSync(
    path.join(outDir, 'paw-preview.png'),
    renderPng({ polys: fitToBox(paw, 380, 0.12), size: 380, bg: [0xfd, 0xfb, 0xf2], fg: BG, ss: 6, keepWinding: true }),
  );
  console.log(`preview → ${outDir}`);
}
