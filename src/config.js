// Picture 专用配置。长度比例以当前画布为准，时间用秒，角度用弧度。
export const picture = {
  palette: {
    black: '#000000', blackTint: '#05060A', ink: '#EFE8D5', gold: '#F2C641',
    accent: '#E8603C', // 留给后续的快门及夹子
  },
  display: {
    maxDpr: 2, mobileWidth: 640, mobileFactor: .5, seed: 8189,
    maxStep: .05, fullSizeWidth: 950, starScale: [.68, 1], // 单帧步长上限与窄屏星芒缩放
    roughUrl: 'https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.js', // 固定手绘路径库版本
  },
  sky: { count: 78, flares: 6, size: [.35, 1.05], period: [5, 14], opacity: [.09, .45] },
  tassel: {
    count: 11, span: [.065, .935], length: [.106, .278],
    beadCount: [3, 6], starRadius: [6.6, 12.8], lineWidth: .65,
    // 细线透明度、星芒微光和长出新星的时长
    lineOpacity: .38, glow: 5, regrow: 1.55,
  },
  wind: {
    pulseSpeed: .42, crossSpeed: .66, damping: .82, gravity: 520,
    steady: .21, gust: .34, gustEvery: 14, gustDuration: 3.6, travel: 2.8,
  },
  falling: {
    // 第一颗落星出现的等待时间，后续随机间隔和重力加速度
    first: [4, 6], interval: [7, 13], gravity: 485, airDrag: .30,
    tailCount: 16, tailStep: .025, sparkCount: 10, sparkLife: [.40, .88],
  },
  ground: { y: .88, span: [.09, .91], alpha: .19, lineWidth: .72, segments: 7, waviness: 2.1 },
  // 后续阶段的参数先保存在此处，阶段 1 不运行以下行为。
  camera: {
    x: .50, y: .68, asteroidSize: .08,
    orbit: { radiusX: .21, radiusY: .105, tiltDegrees: -15, period: 18 },
    capture: { interval: [4, 6], cooldown: 1.2, burst: [1, 3], spacing: [.8, 1.4], onScreen: 4, rotationDegrees: 6 },
  },
  paper: {
    destinations: { tassel: .34, crane: .33, ground: .33 },
    maxSameDestination: 2, hangingTime: [4, 6], groundLimit: 5, bounce: [1, 2],
  },
};
