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
