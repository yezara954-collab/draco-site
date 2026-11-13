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
  gustStrength: 1,                        // 挥杖阵风，1 等于现有环境阵风的最大值
  mirrorLight: .15,                        // 蓄势期间镜面反光增量
  arcWidth: 12,                            // 新月光痕中央最宽处
  trailLength: .54,                        // 纸鹤拖尾在飞行时间中占的比例
  minCraneScale: .27,                      // 飞远时纸鹤最小比例
  particleLimit: 94,                       // 粒子池上限，代码最高允许 120
  colors: ['#fff6dd', '#ffe1a2', '#b2efdb'], // 魔法银白、淡金、青绿
};

export const ORBIT = {
  // 板块显示顺序、名称和占位封面配色。id 同时用于网址和封面文件名。
  sections: [
    { id: 'picture', name: 'Picture', colors: ['#24453b', '#0b1b18'] },
    { id: 'fanfic', name: '同人文', colors: ['#214441', '#0a1b1d'] },
    { id: 'letter', name: 'Letter', colors: ['#234252', '#0b1720'] },
    { id: 'music', name: 'Music', colors: ['#493c25', '#1b170f'] },
  ],
  cardWidth: 288,            // 桌面最大卡片宽度，宽高比固定 4:5
  radius: [.74, .28],       // 横、纵半径，相对于卡片宽度
  mobileRadius: [.73, .29], // 窄屏的横、纵半径
  mobileWidth: 600,         // 使用窄屏排布的宽度阈值
  scale: [.55, 1, 1.7],    // 后端、前端缩放和深度曲线指数
  brightness: [.59, 1, 1.15], // 后端、前端亮度和曲线指数
  blur: [1.85, 0, .92],     // 后端、前端模糊像素和曲线指数
  turnTime: .90,           // 一次旋转时长，easeInOutCubic
  fadeTurn: .36,           // 减少动态效果时一次淡出、淡入的总时长
  enterFade: .54,          // 板块页淡入
  riseTime: .66,           // 单张卡片浮起时长
  stagger: .12,           // 卡片入场间隔
  labelFade: .32,          // 当前板块名淡入
  dustTime: 1.30,          // 入场星尘扩散并消失的时长
  dustCount: 40,           // 入场星尘粒子数量
  pointPeriod: 16,         // 轨道亮点绕行一圈所需时间
  swipeDistance: 42,       // 拖动触发切换所需的最小水平距离
  tilt: 3,                 // 鼠标视差的最大倾斜角度
};

export const ORBIT_SKY = {
  // 月亮位置为视口比例。半径依次为短边比例、最小像素、最大像素。
  moon: {
    position: [.105, .17], mobilePosition: [.17, .17], radius: [.078, 28, 79],
    colors: ['#fff8d4', '#f5d887', '#cf9c51'], tilt: -.40,
    halo: '#eec675', haloOpacity: .12, breath: .035, period: 9,
  },
  // 星云外环。中心是视口比例，半径为原卡片宽度的倍数，倾角单位为度。
  ring: {
    center: [.50, .52], radius: [1.90, .82], maxWidth: .78, maxHeight: .58,
    tilt: -8, color: '#a2ebdf', backAlpha: .24, frontAlpha: .62,
  },
  cloud: {
    sequence: ['dense', 'mist', 'mist', 'dense'], repeats: 3, // 云图顺序和重复组数
    spacing: 1, overlap: .30, offset: 1.8, startAngle: -172, // 间距倍率、重叠比例、错位和起始角（度）
    sizeJitter: .20, rotation: 8, depthScale: [.74, 1.08], // 尺寸、旋转随机变化和远近缩放
    denseOpacity: [.44, .82], mistOpacity: [.35, .60], overlapOpacity: .50,
    backTint: '#a1dce7', frontTint: '#e1f9ff', moonTint: '#f9e5b4',
    period: [6.8, 11.2], breath: .06, mistGlow: .12, glints: 5, lowGlints: 2,
    lowCount: 8, turnDegrees: 10, response: 7, settle: 2.35, // 低帧率云数、卡牌联动角度及回落
    backdrop: [
      [.23, .39, .30, .16], [.50, .31, .38, .19], [.76, .39, .32, .20], [.57, .63, .39, .15],
    ], // 远雾的横纵中心、宽度（屏宽比例）、透明度
  },
  drag: {
    sensitivity: 330, maxSpeed: 300, damping: 2.05, idleSpeed: 1.4, releaseWindow: .095,
  }, // 拖过一屏的角度、最大惯性速度（度/秒）、阻尼、匀速和松手速度采样窗口
  rain: {
    limit: 56, lowLimit: 30, interval: [.073, .116],
    burstInterval: [2, 4], burstCount: [6, 12], burstTime: 1,
    starSize: [6, 22], length: [80, 300], lineWidth: [.8, 1.65],
    distance: [230, 490], speed: [86, 160], acceleration: .13, angle: 35, angleJitter: 4,
    spin: [.18, .75], tail: ['#fff9ea', '#f7dcaa'], gold: ['#fffef4', '#fff2d5', '#eac489'],
  }, // 流星容量、频率、尺寸、尾长、落距、速度、向左偏离垂直的角度与颜色
  sparks: {
    limit: 26, lowLimit: 11, size: [.7, 2.1], colors: ['#d9fbff', '#fff1cc'],
    speed: [.65, .9], chance: .42,
  }, // 点状碎星的容量、尺寸、颜色和相对速度
  stars: { count: 122, lowCount: 57, dustCount: 14, color: '#e3f5ef', period: [3.8, 10], dustSpeed: 3 },
  quality: { maxDpr: 1.25, maxPixels: 1250000, lowFps: 43, recoverFps: 55, lowSeconds: 3, recoverSeconds: 8 },
  // 星空数量，以及画布像素上限和持续低帧率降级／恢复阈值。
};
