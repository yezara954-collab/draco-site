// 位移以 1600 像素宽的舞台为准，时间单位为秒。
export const WIND = {
  direction: 1,              // 1 向右吹，-1 向左吹
  lift: .32,                 // 向上的位移相对横向位移的比例
  interval: [6, 10],          // 两次常态阵风的间隔
  gustDuration: 2.25,        // 常态阵风经过同一点的时长
  waveSpeed: 460,            // 常态阵风从树传向人物的速度（像素 / 秒）
  rightEdge: 1540,           // 常态阵风从右侧树冠开始
  hair: { breeze: [8, 15], gust: [20, 30], delay: .27, flutter: .025 }, // 发梢滞后
  robe: { breeze: [15, 25], gust: [40, 60], delay: .84, flutter: .035 }, // 袍摆滞后
  oak: { breeze: [10, 15], gust: [25, 40], delay: .18, flutter: .09 },   // 树冠和碎叶颤动
  debugOpacity: .52,         // 红蓝权重叠图透明度
};

export const INTRO = {
  duration: 4.8,             // 开场总时长，每次打开页面播放一次
  stars: [.05, .92],          // 星点从黑场亮起的时间段
  arches: [.38, 1.58],        // 回廊从左往右逐道亮起的时间段
  artwork: [.82, 1.68],       // 主画面显现的时间段
  gustStart: 1.27,           // 开场风从左侧进入画面的时间
  gustSpeed: 1620,           // 开场风从左向右的速度（像素 / 秒）
  gustDuration: 1.56,        // 风抵达后扬起到回落的时长
  gustStrength: 1,           // 开场大风强度，1 对应各材质的阵风上限
  leafCount: 24,             // 叶片池数量，最多 30 片
  leafColors: ['#263b2a', '#334835', '#45563a', '#536349'],
  leafSpeed: [190, 410],      // 叶片水平飞行速度（像素 / 秒）
  leafLife: [1.03, 1.78],    // 每片叶子的存活时间
  leafStagger: .62,          // 树冠叶片依次脱落的时间差
  windLines: 5,              // 同时掠过画面的风线数量
  lineColor: '#b7dfcf',      // 风线的淡青绿色
  lineSpeed: 1270,           // 风线移动速度（像素 / 秒）
  letters: [3.03, 4.16],     // 标题从右向左逐字淡入的时间段
  apple: [4.17, 4.48],       // 苹果最后显现的时间段
  glint: [4.32, 4.76],       // 苹果高光闪过的时间段
  cueDuration: 6,            // 开场结束后，三处星形提示的时长
};

// 粒子速度、距离和尺寸以屏幕像素为单位，时间单位为秒。
export const MAGIC_CURSOR = {
  limit: 100,               // 拖尾和点击粒子共用的池容量
  size: 8,                  // 四角星光标的半径
  hoverScale: 1.26,         // 可点击区域的光标放大倍率
  trailSpacing: 9,          // 鼠标每移动多少像素留下一个粒子
  trailLife: .48,           // 拖尾消失所需时间
  burstCount: 11,           // 每次点击的小光点数量
  burstLife: .46,           // 点击光点消失所需时间
  burstSpeed: [21, 63],     // 点击光点飞散速度范围
  reducedLife: .26,         // 减少动态效果时的原地淡出时长
  colors: ['#eafffd', '#aff3e9', '#fff1c0'], // 青白、浅青、淡金
};

export const APPLE_JUICE = {
  squashTime: .18,          // 挤压时长
  squashX: 1.14,            // 挤压时横向撑开的倍率
  squashY: .80,             // 挤压时纵向压扁的倍率
  regrowAt: 2.5,            // 从点击起算，几秒后开始长回
  regrowTime: .62,          // 长回与轻弹的时长
  reducedFade: .22,         // 减少动态效果时，两次交叉淡化的时长
  hoverTilt: 4,             // 悬停时左右摇摆的最大角度
  hoverGlow: .24,           // 悬停高光强度
  dropCount: 25,            // 果汁水珠数量
  dropLife: [ .62, 1.30 ],   // 水珠存活时间范围
  dropSpeed: [55, 175],     // 水珠飞散速度范围
  dropSize: [1.4, 4.2],     // 水珠半径范围
  gravity: 245,             // 水珠向下加速度
  colors: ['#a7ed85', '#d2ff9e', '#ffe09b'], // 青绿为主，少量金色
};

// 坐标和尺寸以 1600 × 1000 的海报舞台为准，时间单位为秒。
export const FERRET = {
  ground: [1277.53, 778.22], // 地面原位，坐标是白鼬脚底的中心
  root: [1351, 755],        // 奔跑终点，树干右侧的根部
  branch: [1448, 421],      // 落点，右侧伸出树冠的粗枝上缘
  branchScale: .55,         // 树上白鼬相对于地面白鼬的大小
  hitPadding: 7,           // 透明轮廓外增加的点击余量（舞台像素）
  alertTime: .30,          // 抬头警觉的停顿
  runTime: .49,            // 朝树根跑的时长
  runBobs: 2,              // 奔跑中上下起伏的次数
  runLift: 6,              // 奔跑时向上跃起的幅度
  scatterTime: .35,        // 白鼬从轮廓散成星屑
  travelTime: 1.32,        // 星屑沿树干盘旋移动
  gatherTime: .43,         // 星屑聚拢并淡入白鼬
  flashTime: .23,          // 白鼬现身时的闪光时长
  fadeTime: .26,           // 减少动态效果时，单次淡出或淡入时长
  particleCount: 116,      // 星屑池使用的数量，代码硬上限为 160
  turns: 2.1,              // 星屑沿树干盘旋的圈数
  spiralWidth: 40,         // 盘旋横向幅度
  colors: ['#edf8ff', '#bdf4de', '#f5dfa8'], // 银白为主，少量淡青绿和淡金
};

// 挥杖动画。坐标以 1600 × 1000 舞台左上角为原点，时间单位为秒。
export const WAND = {
  idleTip: [679.29, 621.03],              // 待机杖尖，透明图像素 (1, 1049)
  midTip: [613.00, 443.08],               // 中间杖尖，透明图像素 (4, 601)
  castTip: [632.48, 287.38],              // 完成杖尖，透明图像素 (2, 209)
  crane: [427, 278.5],                    // 千纸鹤静止时的中心，连接时追踪实际位置
  crescent: [[645, 575], [617, 498], [609, 388], [616, 334]], // 两段光弧的控制点，中间两点共用切线
  link: [[568, 232], [500, 239]],          // 杖尖到纸鹤的两个曲线控制点
  flight: [[366, 245], [228, 298], [-135, -110]], // 纸鹤飞行的两个控制点和画外终点
  chargeTime: .30,                        // 杖尖蓄势
  swingTime: .80,                         // 挥杖光痕
  midAt: .54,                             // 挥杖时长的此处，弧头到达中间杖尖
  poseFade: .08,                          // 每次换姿势的交叉淡入时长
  ghostTime: .15,                         // 残影从换姿势起计，完全消失的时长
  ghostOpacity: .25,                      // 交叉淡入末端保留的残影透明度
  gustRise: .11,                          // 阵风在中间姿势切换时达到峰值
  gustFall: .96,                          // 阵风回落时长
  tipAfterglow: .35,                       // 挥杖杖尖在连接阶段的余光时长
  linkTime: .80,                           // 魔法连接飞到千纸鹤
  linkFade: .99,                          // 起飞后连接光带淡出的时长
  flightTime: 1.50,                        // 千纸鹤飞离画面
  curtainTime: 1.40,                       // 星尘铺开并淡到黑
  curtainLead: .20,                        // 在纸鹤飞行结束前多久开始光幕
  reducedFade: .25,                        // 减少动态效果时淡到黑
  nextFade: .48,                           // 下一界面文字淡入
  gustStrength: 1,                        // 挥杖阵风，1 等于现有环境阵风的最大值
  mirrorLight: .15,                        // 蓄势期间镜面反光增量
  arcWidth: 12,                            // 新月光痕中央最宽处
  trailLength: .54,                        // 纸鹤拖尾在飞行时间中占的比例
  minCraneScale: .27,                      // 飞远时纸鹤最小比例
  particleLimit: 94,                       // 粒子池上限，代码最高允许 120
  colors: ['#fff6dd', '#ffe1a2', '#b2efdb'], // 魔法银白、淡金、青绿
};
