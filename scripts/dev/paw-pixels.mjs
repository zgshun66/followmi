// 开发辅助：把猫爪印按「真实小尺寸」光栅化，再最近邻放大若干倍，
// 用于肉眼确认 11~16px 下形状是否清晰、有没有退化成"打孔/空洞"。
//
// 产物：../.preview/paw-pixels.png（左侧为真像素、右侧为 ×8 放大）
// 用法：node scripts/dev/paw-pixels.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { fitToBox, pathBounds, renderPng } from '../raster.mjs';
import { pawPolys } from '../paw-shape.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const outDir = path.resolve(root, '..', '.preview');
fs.mkdirSync(outDir, { recursive: true });

const BG = [0xfd, 0xfb, 0xf2];
const FG = [0x7e, 0x91, 0x42];
const sizes = [11, 13, 16, 20];
const ZOOM = 8;

// 每个尺寸：真像素光栅 + ×8 放大，横向排开，纵向对齐顶部。
const tiles = sizes.map((s) => {
  const polys = fitToBox(pawPolys(), s, 0.1);
  const buf = renderPng({ polys, size: s, bg: BG, fg: FG, ss: 1, keepWinding: true });
  const src = PNG.sync.read(buf);
  const big = new PNG({ width: s * ZOOM, height: s * ZOOM });
  for (let y = 0; y < s * ZOOM; y++) {
    for (let x = 0; x < s * ZOOM; x++) {
      const sx = Math.floor(x / ZOOM);
      const sy = Math.floor(y / ZOOM);
      const so = (sy * s + sx) * 4;
      const o = (y * s * ZOOM + x) * 4;
      big.data[o] = src.data[so];
      big.data[o + 1] = src.data[so + 1];
      big.data[o + 2] = src.data[so + 2];
      big.data[o + 3] = 255;
    }
  }
  return big;
});

const gap = 16;
const width = tiles.reduce((w, t) => w + t.width + gap, gap);
const height = Math.max(...tiles.map((t) => t.height)) + gap * 2;
const canvas = new PNG({ width, height });
for (let i = 0; i < canvas.data.length; i += 4) {
  canvas.data[i] = BG[0];
  canvas.data[i + 1] = BG[1];
  canvas.data[i + 2] = BG[2];
  canvas.data[i + 3] = 255;
}
let ox = gap;
for (const t of tiles) {
  for (let y = 0; y < t.height; y++) {
    for (let x = 0; x < t.width; x++) {
      const so = (y * t.width + x) * 4;
      const o = ((y + gap) * width + (x + ox)) * 4;
      canvas.data[o] = t.data[so];
      canvas.data[o + 1] = t.data[so + 1];
      canvas.data[o + 2] = t.data[so + 2];
      canvas.data[o + 3] = 255;
    }
  }
  ox += t.width + gap;
}
const outFile = path.join(outDir, 'paw-pixels.png');
fs.writeFileSync(outFile, PNG.sync.write(canvas));
console.log(`sizes=${sizes.join(',')} zoom=${ZOOM} → ${outFile}`);
