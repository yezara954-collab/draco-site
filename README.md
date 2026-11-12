# Draco Malfoy · 海报首页

## 本地预览

使用 Node.js 22。解压后，在同时包含 `package.json` 和 `index.html` 的文件夹打开终端。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。生产构建使用 `npm run build`，产物在 `dist/`，可用 `npm run preview` 检查。

## GitHub Pages

1. 将源码目录中的文件提交到 GitHub 仓库默认分支，包含 `.github/workflows/pages.yml`。Pages 工作流会自行生成 `dist/`。
2. 在仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 在 **Actions → Deploy static poster to GitHub Pages** 点击 **Run workflow**，选择默认分支。以后推送到默认分支也会自动部署。

项目站点地址格式为 `https://<账号>.github.io/<仓库名>/`。账号主页仓库 `<账号>.github.io` 的地址为 `https://<账号>.github.io/`。实际地址可在 Pages 设置中查看。Vite 使用相对路径 `base: './'`，脚本、字体和贴图支持部署在仓库子目录。

## 舞台和图层

舞台坐标为 1600 × 1000，GSAP 只设置等比缩放。深色背景、星点、八道独立 SVG 拱门、地面线、纸鹤拖尾、四角标记、十字星、标题和 SVG 青苹果分别可以编辑。

PixiJS 优先使用 WebGL。浏览器缺少 WebGL 时，页面由 PixiJS Canvas 渲染。贴图和镜面光片按以下顺序从底到顶叠放。

1. `oak-tree`
2. `mirror-glass`
3. `mirror-reflection-left`、`mirror-reflection-right`
4. `mirror-frame`
5. `oak-overhang`
6. `draco`
7. `ferret-low`（备用姿势，静态画面中隐藏）、`ferret-raised`
8. `paper-crane`（从合成参考图单独提取）

贴图位置和显示尺寸记录在 `src/placements.json`。PNG 保留透明度，德拉科立绘已去绿幕，树与垂枝已清理浅色底雾。点击透过透明区域落到其后方的可见贴图。命中时从 `#art` 派发 `poster:pick`，图层名在 `event.detail.layer`。


## 环境动效

回廊流光、镜面扫光、纸鹤漂浮和星点闪烁都在 `src/environment.js`。文件顶部的 `ENVIRONMENT` 配置区有中文注释，可调节速度、幅度、强度和颜色。切换标签页时暂停，返回后继续。系统开启「减少动态效果」时显示静态画面。

## 风与权重调试

打开首页地址，在末尾加 `?debug=wind`。例如本地地址是 `http://localhost:5173/`，调试地址就是 `http://localhost:5173/?debug=wind`。半透明红色表示权重较高，蓝色表示固定。去掉查询参数即可回到普通视图。

风力、阵风间隔、传播速度和各处幅度集中在 `src/wind.js` 顶部的 `WIND` 配置。两张树图共用同一套舞台坐标和三角网格。WebGL 模式使用 PixiJS Mesh 做局部变形。Canvas 后备模式保留权重调试与纸鹤整体漂浮、倾斜。

`src/assets/draco-wind-weights.png` 是由人物素材的颜色、位置和边缘距离计算出的灰度权重图。若日后替换立绘，可调整 `scripts/build-wind-mask.py` 中的保护区域，再用安装了 Pillow、NumPy 和 SciPy 的 Python 重建权重图。正常预览和构建直接使用现成的 PNG。
