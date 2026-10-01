# follow咪 · 健身跟练打卡 (PWA)

一个**纯前端、本地优先**的健身跟练打卡单页应用（PWA），品牌名 **follow咪**，形象是一只猫咪（正坐 / 趴卧 / 伸懒腰 / 趴盒子四种姿态）。所有数据保存在浏览器 IndexedDB，无需任何后端，不调用任何外部 API（平台视频以官方 iframe / 原链接方式播放）。

## 功能

- **今日任务**：顶部一只**趴卧猫咪 + 头顶一片云**，云里实时报当天日期时间（`2026年10月1日 周四 20:38`，分钟级刷新）与「还有 N 个任务没有完成哦」。任务按周期配置自动计算今天需做的与剩余次数；上传视频支持播放（监听 `ended` 自动打卡 + 手动兜底），任务卡片带**封面预览**（上传视频自动截帧，也可手动上传封面）。打卡完成显示**猫咪盖爪印 flash 动画**。
- **任务管理**：并入「设置」页。增 / 删 / 改任务；类型支持「上传视频」与「链接 / 嵌入」。
  - B 站：粘贴视频页 URL 自动解析 BV 号，生成官方播放器（按 16:9 铺满显示）。
  - b23.tv 短链：会提示改用含 BV 号的完整链接（纯前端无法解析短链）。
  - 抖音 / 小红书：提供「打开原链接」跳转；也可粘贴平台分享的 iframe / HTML 片段。
- **打卡记录**（与身体数据合并到「记录」页）：
  - 统计卡片：累计打卡、连续天数、本周 / 本月完成率。
  - **打卡日历**：按「每周 / 每月 / 每年」三种视图呈现，可翻看上一周期。
    - 每周 / 每月：**每打卡一次显示一只猫爪印**；
    - 每年：每格按**当月打卡次数随机铺爪印**——打卡 N 次就散落 N 只（不再归一化压到 9 只），打卡越多越密；位置由 `year*100+month` 作种子确定性生成（mulberry32），不会重渲染跳位。
  - **身体数据**：指标可自定义增删（默认体重 kg、腰围 cm），按日期录入，折线图看长期趋势。
- **设置**：任务管理、一键导出 / 导入 JSON 备份、带确认的重置。
- **猫咪细节**：小鱼干、罐头、毛线球等装饰元素贯穿界面。
- **PWA**：可「添加到主屏幕」以独立全屏应用运行，离线可用（应用外壳被 Service Worker 缓存）。图标为牛油果绿底 + 鹅黄猫咪剪影。

## 配色（柔化版）

色相沿用最初那套「黄 / 鹅黄 / 浅牛油果绿 / 深牛油果绿」，统一**压低饱和度、略微提亮**，去掉刺眼感；深色端适度加深以保证文字对比度。定义在 `tailwind.config.js`。

| 名称 | 柔化后 | 原值 | 用途 |
| --- | --- | --- | --- |
| 明亮黄 `sun` | `#F0CB74` | `#FDC942` | 强调按钮 / 高亮 |
| 浅鹅黄 `cream` | `#FBF3CB` | `#FFF7BD` | 卡片底 / 分隔 |
| 浅牛油果绿 `mint` | `#D2E096` | `#C9DD71` | 次要色块 / 进度空位 |
| 深牛油果绿 `leaf` | `#7E9142` | `#8DA524` | 主色 / 主按钮 / 猫爪印 |
| 深橄榄 `ink` | `#4A5130` | `#41471F` | 正文 |
| 次要文字 `cocoa` | `#857A57` | `#7C6C3C` | 说明文字 |
| 页面底色 `paper` | `#FDFBF2` | `#FFFDF3` | 背景 |

## 本地运行

```bash
npm install          # 安装依赖
npm run dev          # 开发预览（默认 http://localhost:5173）
npm run build        # 构建生产包到 dist/（构建前自动生成 App 图标）
npm run preview      # 本地预览构建结果
```

> 本机使用托管版 Node 时，可直接用其自带的 `npm.cmd` 执行上述命令。
> 若构建报 `@esbuild/win32-x64 could not be found`，执行 `npm i -D @esbuild/win32-x64@0.21.5` 补装平台二进制。

### 开发辅助（可选，不参与构建）

`scripts/dev/` 下有两个核对工具，改界面后用来「眼见为实」：

```bash
# 无头 Edge 截图（CDP 驱动，真实计时器）：<url> <输出名> [宽] [高] [等待ms] [注入脚本] [截图前JS]
node scripts/dev/shot.mjs http://127.0.0.1:5173 ui-today.png 430 1000 3000 scripts/dev/seed.js

# 注入一批跨月示例打卡 / 身体数据，用于核对统计与「每年」密度视图
#（由上面的第 6 个参数引用：scripts/dev/seed.js）
```

截图输出到项目外的 `../.preview/`。注意：**不要**给无头浏览器加 `--virtual-time-budget`，它会让 `indexedDB.open()` 永久挂起（这正是应用需要 4 秒超时兜底的原因之一）。

## 图标、猫咪剪影与猫爪印

猫咪图形与爪印都是**代码生成的矢量**，不是位图，因此任意尺寸都清晰；界面与 App 图标共用同一份形状。

### 猫咪：从参考图描摹（不是手画）

`assets/cats/*.jpg` 是四张「黑猫白底」参考图，`scripts/trace.mjs` 把它们直接矢量化：

1. JPEG 解码 → 灰度取墨迹 → 3×3 卷积抹掉 JPEG 振铃；
2. 连通域筛选（面积 + 平均墨迹双阈值）剔噪点并求包围盒；
3. 3× 双线性上采样 → **marching squares** 提等值线 → 交点配对成闭环；
4. **Douglas-Peucker** 简化（闭环须先从中点劈开，否则首尾同点会让弦退化、所有点被判共线删光）；
5. 按**嵌套深度**定绕向：偶数层为实体、奇数层为洞——猫的眼睛就是这样挖出来的（`resolveHoles`）。

> 手写几何拼猫的路线已被放弃：曲线靠坐标试凑，形状一改就散。描摹参考图既准又快。

### 猫爪印：对称几何构造

`scripts/paw-shape.mjs` —— 在 `x = 32` 中轴上左右**镜像**构造四趾 + 掌垫，掌垫为**桃形（上尖下圆）**：用水滴/蛋形参数式 `x = cx + rx·sin(φ)·sin(φ/2)^taper`、`y = cy - ry·cos(φ)` 得到顶部圆润收尖、底部饱满浑圆的轮廓（不是挖出来的洞；也不再是旧版那道中央凹口/「屁股缝」）。

> 旧版难看的根因：四只脚趾各自的角度（-18°/-6°/8°/22°）与间距（13/13/12）都不成对，左右两半不是镜像。
> ⚠️ 各趾之间、趾与掌垫之间必须留间隙：一旦交叠，嵌套定洞规则会把重叠区当成「另一个实体内部」而挖空。
> 改动后可用 `node scripts/dev/paw-check.mjs` 量化各部件余隙（要求 ≥1.5 单位）。

### 生成

```bash
npm run gen:icons              # 生成图标 + CatShape.ts
node scripts/gen-icons.mjs --preview   # 额外输出图标/爪印预览图到 ../.preview/
```

产物：

- `public/icon-192.png`、`icon-512.png`、`apple-touch-icon.png` —— 牛油果绿底 `#7E9142` + 鹅黄猫 `#F4D27E`（坐姿，图标构图最饱满）；
- `public/favicon.svg` —— 同一只猫，圆角底；
- `src/components/CatShape.ts` —— **自动生成，勿手改**：四种姿态的 path + 猫爪 path，界面组件（`CatMark` / `CatPose` / `PawPrint`）直接复用。

换姿态或调简化程度：改 `scripts/cat-refs.mjs` 里的 `opts`（`epsilon` 控制简化强度、`dropHair` 丢弃胡须这类细毛），重跑即可。

### 光栅化与通用几何

`scripts/raster.mjs` —— 纯 JS、无原生依赖：圆 / 椭圆 / 多边形 / 锥形笔画，非零环绕扫描线填充（`keepWinding` 决定「并集」还是「带洞」），4× 超采样抗锯齿，导出 SVG path。

> 注意：`stroke()` 的半径不要大于该段中心线长度，否则偏移多边形会自相交、并集出现内孔；需要「短而粗」的形状时用 `circle()`。

## 部署到 GitHub Pages

仓库已内置 GitHub Actions 工作流 `.github/workflows/deploy.yml`：**推送到 `main` 即自动构建并发布**，也可在 Actions 页手动触发（`workflow_dispatch`）。

### 首次部署（一次性设置）

1. 在 GitHub 上新建一个**空仓库**（**不要**勾选 Add a README / .gitignore），仓库名建议 `followmi`。
2. 在本机项目目录关联远程并推送：

   ```bash
   git remote add origin https://github.com/<你的用户名>/followmi.git
   git push -u origin main
   ```

   首次推送会弹出 GitHub 登录窗口（Git Credential Manager），**用浏览器登录一次即可，无需手动创建访问令牌**。
   > Windows 下也可直接双击项目根目录的 `push-to-github.bat`，按提示输入用户名，它会自动完成上述两条命令。

3. 打开仓库 **Settings → Pages**，把 **Source** 设为 **GitHub Actions**。
4. 回到 **Actions** 页，等 `Deploy to GitHub Pages` 跑完（约 1–2 分钟），站点地址为：
   `https://<你的用户名>.github.io/followmi/`

### 之后更新

```bash
git add -A && git commit -m "改了什么" && git push
```

Actions 会自动重新构建发布，无需任何手动操作。也可在 **Actions → Deploy to GitHub Pages → Run workflow** 手动触发。

### 关于路径与素材

- 项目已设 `base: './'`、`start_url: './'`、`scope: './'`，可安全托管在 `https://<user>.github.io/<repo>/` 这类子路径下。
- ⚠️ `npm run build` 会先执行 `scripts/gen-icons.mjs`，它依赖 `assets/cats/*.jpg`（描摹参考图）。这些素材**必须提交进仓库**，否则 CI 构建会失败。
- 构建产物 `dist/` 已加入 `.gitignore`，由 CI 现场生成，不要提交。
- 仓库内换行符由 `.gitattributes` 统一为 LF，避免 Windows(CRLF) 与 CI 上的 Linux 不一致。

## 在 iPhone Safari 添加到主屏幕

1. 用 Safari 打开部署好的页面（需 HTTPS）。
2. 点底部「分享」→「添加到主屏幕」。
3. 主屏图标启动后以独立全屏 App 运行（standalone）。

## 数据说明

- 数据保存在浏览器 IndexedDB（库名 `fitness_pwa`），清除站点数据会丢失全部记录。
- **存储兜底**：部分环境（应用内预览沙箱、无头浏览器、某些隐私模式）里 `indexedDB.open()` 既不触发成功也不触发失败，会一直挂着。应用对此设了 4 秒超时，超时后自动降级为**内存存储**并在页顶显示黄色提示——界面照常可用，但本次打开内的数据不会保存。用普通浏览器 / iPhone Safari 打开即可正常持久化。
- 「导出 / 导入」以 JSON 备份任务结构、打卡、指标与身体数据。**上传的视频 Blob 与封面不会随 JSON 导出**，导入后需重新上传；链接类任务的 `linkUrl` / `embedHtml` 会完整保留。

## 已知限制

- 抖音 / 小红书等平台不支持内嵌播放，只能跳转原链接并手动打卡。
- 链接类任务因跨域 iframe 无法检测播放结束，只能手动「标记完成」（上传视频可自动检测）。
- B 站部分视频因版权 / 地区限制，官方播放器可能提示「无法播放」，可点「打开原链接」观看。
- b23.tv 纯短链不含 BV 号，无法在前端解析，请改用完整视频页地址。
- iOS 横屏全屏依赖 `webkitEnterFullscreen()`，需在真机 Safari 验证。
